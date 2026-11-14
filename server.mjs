import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {RequestPool,createMonitor} from './src/requests.js';
import {requestConfig} from './src/request-config.js';
const root=fileURLToPath(new URL('.',import.meta.url));
const browserKey=process.env.GOOGLE_MAPS_BROWSER_KEY||'',serverKey=process.env.GOOGLE_MAPS_SERVER_KEY||'';
const port=Number(process.env.PORT||5173);
const mapId=process.env.GOOGLE_MAPS_MAP_ID||'';
const requestMonitor=process.env.NODE_ENV!=='production'&&(process.env.REQUEST_MONITOR==='1'||requestConfig.instrumentation);
const monitor=createMonitor(requestMonitor);
// Server shares simultaneous work only. No cross-session Google response cache.
const routeRequests=new RequestPool({api:'route',monitor});
const zoneRequests=new RequestPool({api:'timezone',monitor});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const coords=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
const server=http.createServer(async(req,res)=>{
 const client=new AbortController();
 req.on('aborted',()=>client.abort());
 res.on('close',()=>{if(!res.writableEnded)client.abort();});
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/config'){json(res,200,{browserKey,mapId,serverReady:!!serverKey,requestMonitor});return;}
 if(url.pathname==='/api/debug/requests'&&requestMonitor){json(res,200,monitor.snapshot());return;}
 if(url.pathname==='/api/timezone'){
 if(!serverKey){json(res,503,{message:'Time Zone API 서버 키 미설정'});return;}
 const lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng'));
 if(!url.searchParams.has('lat')||!url.searchParams.has('lng')||!coords({lat,lng})){json(res,400,{message:'잘못된 좌표'});return;}
 const query=new URLSearchParams({location:lat+','+lng,timestamp:String(Math.floor(Date.now()/1000)),key:serverKey});
 const j=await zoneRequests.run(JSON.stringify([lat.toFixed(8),lng.toFixed(8)]),async signal=>{
 const r=await fetch('https://maps.googleapis.com/maps/api/timezone/json?'+query,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});return r.json();
 },{signal:client.signal,reason:'selected-place',id:'coordinate'});
 if(j.status!=='OK'){json(res,502,{message:'시간대 확인 실패 · API 설정 또는 지원 범위 확인'});return;}
 json(res,200,{zone:j.timeZoneId});return;
 }
 if(url.pathname==='/api/route'&&req.method==='POST'){
 if(req.headers.origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin)){json(res,403,{message:'허용되지 않은 출처'});return;}
 if(!serverKey){json(res,503,{message:'경로 확인 필요 · Routes API 서버 키 미설정'});return;}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){json(res,413,{message:'요청 크기 초과'});return;}}
 let args;try{args=JSON.parse(body);}catch{json(res,400,{message:'잘못된 JSON'});return;}
 const {from,to,mode,departure}=args;
 if(!coords(from)||!coords(to)||!['WALK','TRANSIT','DRIVE'].includes(mode)||!Number.isFinite(Date.parse(departure))){json(res,400,{message:'잘못된 경로 요청'});return;}
 const delta=(Date.parse(departure)-Date.now())/86400000;
 if(mode==='TRANSIT'&&(delta < -7||delta >100)){json(res,422,{message:'경로 확인 필요 · 대중교통은 현재 기준 과거 7일~미래 100일만 조회 가능합니다.'});return;}
 if(mode==='DRIVE'&&delta<0){json(res,422,{message:'경로 확인 필요 · 과거 출발 시각의 자동차 경로는 조회할 수 없습니다.'});return;}
 const waypoint=p=>({location:{latLng:{latitude:p.lat,longitude:p.lng}}});
 const payload={origin:waypoint(from),destination:waypoint(to),travelMode:mode,languageCode:'ko',units:'METRIC'};
 if(mode!=='WALK')payload.departureTime=departure;
 if(mode==='DRIVE')payload.routingPreference='TRAFFIC_AWARE';
 const {ok,status,data}=await routeRequests.run(JSON.stringify(payload),async signal=>{
 const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':serverKey,'X-Goog-FieldMask':'routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.transitDetails.transitLine.vehicle.type'},body:JSON.stringify(payload),signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
 return {ok:response.ok,status:response.status,data:await response.json()};
 },{signal:client.signal,reason:'schedule',id:'coordinate-segment',mode});
 if(!ok){json(res,502,{message:'경로 확인 필요 · Google API 요청 오류 ('+status+'). 인증·할당량·지역 지원을 확인하세요.'});return;}
 if(!data.routes?.length){json(res,200,{status:'no-route',message:'경로 확인 필요 · 이용 가능한 경로 없음'});return;}
 const route=data.routes[0],seconds=parseFloat(route.duration);
 if(!Number.isFinite(seconds)){json(res,502,{message:'경로 확인 필요 · 이동시간이 없는 응답'});return;}
 const actual=[...new Set(route.legs?.flatMap(l=>l.steps?.map(s=>s.transitDetails?.transitLine?.vehicle?.type||s.travelMode)||[])||[])];
 json(res,200,{status:'ok',minutes:Math.ceil(seconds/60),polyline:route.polyline?.encodedPolyline,source:'live',details:actual.join(' + ')+(mode==='WALK'?' · 도보 경로는 출발시각 미반영':'')});return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{message:'Method not allowed'});return;}
 const pathname=decodeURIComponent(url.pathname);
 // Explicit public-file allowlist: never expose credentials, tools, tests, or source server.
 if(pathname!=='/'&&pathname!=='/index.html'&&!/^\/src\/[a-z-]+\.(js|css)$/.test(pathname)){json(res,404,{message:'Not found'});return;}
 const filename=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
 const data=await readFile(filename);res.writeHead(200,{'Content-Type':filename.endsWith('.css')?'text/css; charset=utf-8':filename.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){if(!client.signal.aborted)json(res,e.code==='ENOENT'?404:502,{message:e.code==='ENOENT'?'Not found':'요청 실패 · 네트워크 연결 및 API 설정을 확인하세요.'});}
});
server.listen(port,'127.0.0.1',()=>console.log('Travel Link running at http://localhost:'+server.address().port));

