import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {accessSync,constants,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {RequestPool,createMonitor} from './src/requests.js';
import {requestConfig} from './src/request-config.js';
import {language} from './src/ui-copy.js';
import {createTravelStore} from './travel-store.mjs';
import {clientIp,createApiUsage,UsageError} from './api-usage.mjs';
import {createGooglePlaces} from './google-places.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const browserKey=process.env.GOOGLE_MAPS_BROWSER_KEY||'',serverKey=process.env.GOOGLE_MAPS_SERVER_KEY||'';
const port=Number(process.env.PORT||5173);
const hosted=process.env.RENDER==='true';
const host=hosted?'0.0.0.0':'127.0.0.1';
const publicUrl=process.env.TRAVEL_LINK_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL;
const publicOrigin=publicUrl?new URL(publicUrl).origin:null;
if(hosted&&!publicOrigin?.startsWith('https://'))throw Error('Configure the HTTPS public origin for Travel Link.');
const dataDirectory=process.env.TRAVEL_LINK_DATA_DIR||path.join(root,'.travel-link');
if(hosted){
 if(!process.env.TRAVEL_LINK_DATA_DIR||!path.isAbsolute(dataDirectory)||!statSync(dataDirectory).isDirectory())
  throw Error('Set TRAVEL_LINK_DATA_DIR to an existing directory on the Render persistent disk.');
 accessSync(dataDirectory,constants.R_OK|constants.W_OK);
}
const allowsOrigin=req=>publicOrigin?req.headers.origin===publicOrigin:
 ['localhost','127.0.0.1'].some(name=>req.headers.origin===`http://${name}:${req.socket.localPort}`);
const mapId=process.env.GOOGLE_MAPS_MAP_ID||'';
const mapboxToken=/^pk\.[A-Za-z0-9._-]+$/.test(process.env.MAPBOX_PUBLIC_TOKEN||'')?process.env.MAPBOX_PUBLIC_TOKEN:'';
const requestMonitor=process.env.NODE_ENV!=='production'&&(process.env.REQUEST_MONITOR==='1'||requestConfig.instrumentation);
const monitor=createMonitor(requestMonitor);
// Server shares simultaneous work only. No cross-session Google response cache.
const routeRequests=new RequestPool({api:'route',monitor});
const zoneRequests=new RequestPool({api:'timezone',monitor});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const usage=createApiUsage(dataDirectory);
const travelStore=createTravelStore(dataDirectory,json,{allowsOrigin,secureCookie:publicOrigin?.startsWith('https://'),
 rateAuth:(req,user)=>{usage.rate('auth-ip:'+clientIp(req,hosted),16);if(user)usage.rate('auth-user:'+user,16);}});
const admit=req=>usage.admit(clientIp(req,hosted),()=>travelStore.user(req));
const places=createGooglePlaces({key:process.env.GOOGLE_PLACES_SERVER_KEY||serverKey,usage,admit,user:travelStore.user,
 allowsOrigin,secure:publicOrigin?.startsWith('https://'),json,media:usage.browser.googleMedia});
const pauseTitle='Travel Link is temporarily paused. Please check back later.';
function pausePage(res,method){
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(method==='HEAD'?undefined:'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Travel Link</title><main><h1>'+pauseTitle+'</h1></main></html>');
}
const coords=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
function timeZoneError(body){
 const reason=Array.isArray(body?.error?.details)?body.error.details.find(item=>typeof item?.reason==='string')?.reason:null;
 const known=['API_KEY_IP_ADDRESS_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_SERVICE_BLOCKED',
  'API_KEY_INVALID','SERVICE_DISABLED','BILLING_DISABLED','REQUEST_DENIED','OVER_DAILY_LIMIT',
  'OVER_QUERY_LIMIT','ZERO_RESULTS','INVALID_REQUEST','UNKNOWN_ERROR','PERMISSION_DENIED','RESOURCE_EXHAUSTED'];
 if(known.includes(reason))return reason;
 const message=body?.error_message||body?.error?.message||'';
 if(/API keys? with referer restrictions|requests? from (?:this |referer )[^.]*referer/i.test(message))return 'API_KEY_HTTP_REFERRER_BLOCKED';
 if(/IP (?:address|site).*not authorized|requests? from (?:this )?IP.*(?:blocked|denied|not allowed)/i.test(message))return 'API_KEY_IP_ADDRESS_BLOCKED';
 for(const code of [body?.status,body?.error?.status])if(known.includes(code))return code;
 return 'UPSTREAM_TIME_ZONE_ERROR';
}
function transitStep(step){
 const t=step.transitDetails,line=t?.transitLine,stops=t?.stopDetails;
 if(!t)return {mode:step.travelMode,distance:step.distanceMeters,seconds:parseFloat(step.staticDuration),instruction:step.navigationInstruction?.instructions};
 return {mode:'TRANSIT',line:line?.nameShort||line?.name,lineName:line?.name,vehicle:line?.vehicle?.name?.text||line?.vehicle?.type,
  headsign:t.headsign,stopCount:t.stopCount,departureStop:stops?.departureStop?.name,arrivalStop:stops?.arrivalStop?.name,
  departureTime:stops?.departureTime,arrivalTime:stops?.arrivalTime,
  agencies:line?.agencies?.map(({name,uri})=>({name,uri}))};
}
const server=http.createServer(async(req,res)=>{
 const client=new AbortController();
 req.on('aborted',()=>client.abort());
 res.on('close',()=>{if(!res.writableEnded)client.abort();});
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/service-status'){
  usage.available();json(res,200,{available:true});return;
 }
 if(url.pathname==='/'||url.pathname==='/index.html'||url.pathname.startsWith('/api/'))usage.available();
 if(await travelStore(req,res,url.pathname))return;
 if(await places(req,res,url,client.signal))return;
 if(url.pathname==='/api/config'){
  if(!usage.paused)admit(req);
  places.issueDestination(res);
  json(res,200,{browserKey:usage.paused?'':browserKey,mapId,
   mapboxToken:usage.paused||!usage.browser.mapbox?'':mapboxToken,
   serverReady:!usage.paused&&!!serverKey,requestMonitor,usageGuard:true,apiPaused:usage.paused,browserOptions:usage.browser});return;
 }
 if(url.pathname==='/api/usage/browser'&&req.method==='POST'){
  if(!allowsOrigin(req)){json(res,403,{message:'Request origin is not allowed.'});return;}
  admit(req);
  usage.permitBrowser();
  json(res,200,{allowed:true,browserOptions:usage.browser});return;
 }
 if(url.pathname==='/api/debug/requests'&&requestMonitor){json(res,200,monitor.snapshot());return;}
 if(url.pathname==='/api/timezone'&&req.method==='GET'){
 if(!serverKey){json(res,503,{code:'TIME_ZONE_KEY_MISSING',message:'The server key for the Time Zone API is missing.'});return;}
 admit(req);
 const lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng'));
 if(!url.searchParams.has('lat')||!url.searchParams.has('lng')||!coords({lat,lng})){json(res,400,{message:'Invalid coordinates.'});return;}
 const query=new URLSearchParams({location:lat+','+lng,timestamp:String(Math.floor(Date.now()/1000)),key:serverKey});
 const {ok,status,body}=await zoneRequests.run(JSON.stringify([lat.toFixed(8),lng.toFixed(8)]),signal=>usage.upstream('timezone',signal,async()=>{
 const r=await fetch('https://maps.googleapis.com/maps/api/timezone/json?'+query,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
 return {ok:r.ok,status:r.status,body:await r.json()};
 }),{signal:client.signal,reason:'selected-place',id:'coordinate'});
 if(!ok||body?.status!=='OK'||typeof body.timeZoneId!=='string'){
  const code=timeZoneError(body);
  console.warn('Google Time Zone request failed', {upstreamStatus:status,code});
  json(res,502,{code,upstreamStatus:status,message:'Could not confirm the time zone. Check API settings and regional availability.'});return;
 }
 json(res,200,{zone:body.timeZoneId});return;
 }
 if(url.pathname==='/api/route'&&req.method==='POST'){
 if((hosted||req.headers.origin)&&!allowsOrigin(req)){json(res,403,{message:'Request origin is not allowed.'});return;}
 if(!serverKey){json(res,503,{message:'The server key for the Routes API is missing.'});return;}
 admit(req);
 let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){json(res,413,{message:'Request is too large.'});return;}}
 let args;try{args=JSON.parse(body);}catch{json(res,400,{message:'Invalid JSON.'});return;}
 const {from,to,mode,departure}=args;
 if(!coords(from)||!coords(to)||!['WALK','TRANSIT','DRIVE'].includes(mode)||!Number.isFinite(Date.parse(departure))){json(res,400,{message:'Invalid route request.'});return;}
 const delta=(Date.parse(departure)-Date.now())/86400000;
 if(mode==='TRANSIT'&&(delta < -7||delta >100)){json(res,422,{message:'Public transit is available from 7 days in the past to 100 days in the future.'});return;}
 if(mode==='DRIVE'&&delta<0){json(res,422,{message:'Driving directions require a future departure time.'});return;}
 const waypoint=p=>({location:{latLng:{latitude:p.lat,longitude:p.lng}}});
 const payload={origin:waypoint(from),destination:waypoint(to),travelMode:mode,languageCode:language,units:'METRIC'};
 if(mode!=='WALK')payload.departureTime=departure;
 if(mode==='DRIVE')payload.routingPreference='TRAFFIC_AWARE';
 const fields=['routes.duration','routes.distanceMeters','routes.polyline.encodedPolyline'];
 if(mode==='TRANSIT')fields.push('routes.localizedValues.transitFare','routes.legs.steps.travelMode','routes.legs.steps.distanceMeters','routes.legs.steps.staticDuration','routes.legs.steps.navigationInstruction.instructions','routes.legs.steps.transitDetails');
 const sku=mode==='DRIVE'?'routesPro':'routesEssentials';
 const {ok,status,data}=await routeRequests.run(JSON.stringify(payload),signal=>usage.upstream(sku,signal,async()=>{
 const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':serverKey,'X-Goog-FieldMask':fields.join(',')},body:JSON.stringify(payload),signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
 return {ok:response.ok,status:response.status,data:await response.json()};
 }),{signal:client.signal,reason:'schedule',id:'coordinate-segment',mode});
 if(!ok){json(res,502,{message:'Google Routes request failed ('+status+'). Check authentication, quotas, and regional availability.'});return;}
 if(!data.routes?.length){json(res,200,{status:'no-route',message:'No route available.'});return;}
 const route=data.routes[0],seconds=parseFloat(route.duration);
 if(!Number.isFinite(seconds)){json(res,502,{message:'The route response did not include a travel time.'});return;}
 const steps=mode==='TRANSIT'?route.legs?.flatMap(leg=>leg.steps?.map(transitStep)||[])||[]:undefined;
 if(steps&&!steps.some(step=>step.mode==='TRANSIT')){json(res,200,{status:'no-route',message:'No route with public transit was found for that time.'});return;}
 json(res,200,{status:'ok',minutes:Math.ceil(seconds/60),distance:route.distanceMeters,polyline:route.polyline?.encodedPolyline,source:'live',
  ...(steps?{steps,fare:route.localizedValues?.transitFare?.text}:{}),...(mode==='WALK'?{details:'Walking directions do not use departure time.'}:{})});return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{message:'Method not allowed'});return;}
 const pathname=decodeURIComponent(url.pathname);
 // Explicit public-file allowlist: never expose credentials, tools, tests, or source server.
 if(pathname!=='/'&&pathname!=='/index.html'&&!/^\/src\/[a-z-]+\.(js|css)$/.test(pathname)&&!/^\/public\/assets\/[a-z0-9-]+\.(png|svg|woff2|ttf|otf)$/.test(pathname)){json(res,404,{message:'Not found'});return;}
 const filename=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
 const data=await readFile(filename);const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'}[path.extname(filename)]||'text/html; charset=utf-8';res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){
  if(client.signal.aborted)return;
  if(e instanceof UsageError){
   if((e.code==='API_SITE_STOPPED'||e.code==='API_USAGE_UNAVAILABLE')&&
       ['/','/index.html'].includes(req.url?.split('?')[0])){pausePage(res,req.method);return;}
   if(e.retryAfter)res.setHeader('Retry-After',e.retryAfter);
   json(res,e.status,{code:e.code,message:e.message});return;
  }
  json(res,e.code==='ENOENT'?404:502,{message:e.code==='ENOENT'?'Not found':'The request failed. Check your network and API settings.'});
 }
});
server.requestTimeout=30000;
server.headersTimeout=15000;
server.listen(port,host,()=>console.log('Travel Link running at http://'+(hosted?host:'localhost')+':'+server.address().port));

