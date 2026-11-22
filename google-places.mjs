import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {language} from './src/ui-copy.js';
import {resolveGoogleCandidates} from './src/google-place-details.js';
import {RequestPool} from './src/requests.js';

const placeId=/^[\w-]{1,500}$/;
const photoResource=/^places\/[\w-]{1,500}\/photos\/[\w-]{1,1800}$/;
const point=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
const base='https://places.googleapis.com/v1/';
const searchFields=['id','displayName','formattedAddress','location'];
const detailFields=[...searchFields,'regularOpeningHours','attributions'];

function httpsUrl(raw){
 try{const url=new URL(raw);return url.protocol==='https:'?url:null;}
 catch{return null;}
}

export function createGooglePlaces({key,usage,admit,user,allowsOrigin,secure,json,media}){
 const pool=new RequestPool();
 const signingKey=key?createHmac('sha256',key).update('travel-link-places-v1').digest():randomBytes(32);
 const signed=(purpose,value,age)=>{
  const data=Buffer.from(JSON.stringify([purpose,Date.now()+age,value])).toString('base64url');
  return data+'.'+createHmac('sha256',signingKey).update(data).digest('base64url');
 };
 function verify(purpose,ticket){
  if(typeof ticket!=='string'||! /^[\w-]{1,3600}\.[\w-]{43}$/.test(ticket))return null;
  const [data,signature]=ticket.split('.');
  const expected=createHmac('sha256',signingKey).update(data).digest('base64url');
  if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
  try{const [type,expiry,value]=JSON.parse(Buffer.from(data,'base64url'));return type===purpose&&expiry>Date.now()?value:null;}
  catch{return null;}
 }
 async function request(sku,path,signal,{body,fields}={}){
  return pool.run(JSON.stringify([sku,path,body,fields]),shared=>usage.upstream(sku,shared,async()=>{
   const response=await fetch(base+path,{redirect:'error',method:body?'POST':'GET',
    headers:{'X-Goog-Api-Key':key,...(fields?{'X-Goog-FieldMask':fields.join(',')}:{}) ,
     ...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.any([shared,AbortSignal.timeout(12000)])});
   return {status:response.status,ok:response.ok,data:response.ok?await response.json():null};
  }),{signal,reason:'places',id:sku});
 }
 function publicPlace(p,withPhoto=false){
  const {id,displayName,formattedAddress,location,regularOpeningHours}=p;
  if(!placeId.test(id||'')||!point({lat:location?.latitude,lng:location?.longitude})||!displayName?.text)return null;
  const photo=withPhoto&&p.photos?.[0];
  return {id,displayName,formattedAddress,location,regularOpeningHours,
   attributions:p.attributions?.map(a=>({provider:a.provider,providerUri:httpsUrl(a.providerUri)?.href})),
   ...(photo&&photoResource.test(photo.name)?{photo:{
    url:'/api/places/photo?ticket='+signed('photo',photo.name,10*60_000),
    attribution:photo.authorAttributions?.map(a=>({displayName:a.displayName,uri:httpsUrl(a.uri)?.href,photoUri:httpsUrl(a.photoUri)?.href})),
    googleMapsUri:httpsUrl(photo.googleMapsUri)?.href
   }}:{})};
 }
 async function handle(req,res,url,signal){
  const route=url.pathname;
  if(!route.startsWith('/api/places/'))return false;
  const send=(status,data)=>{json(res,status,data);return true;};
  const authenticated=user(req);
  let anonymous;
  if(route!=='/api/places/destination'&&!authenticated)return send(401,{message:'Sign in to use place services.'});
  if(route==='/api/places/destination'){
   const token=req.headers.cookie?.match(/(?:^|;\s*)travel_destination=([\w.-]+)(?:;|$)/)?.[1];
   anonymous=verify('destination',token);
   if(!anonymous)return send(401,{code:'DESTINATION_SESSION_EXPIRED',message:'The destination session has expired.'});
  }
  if(!key)return send(503,{message:'Google place services are unavailable. Check the server configuration.'});
  if(route==='/api/places/photo'){
   if(req.method!=='GET'||!media)return send(404,{message:'Photo unavailable.'});
   if(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')return send(403,{message:'Request origin is not allowed.'});
   admit(req);
   const resource=verify('photo',url.searchParams.get('ticket'));
   if(!resource||!photoResource.test(resource))return send(404,{message:'Photo unavailable.'});
   const result=await request('placesPhoto',resource+'/media?maxWidthPx=500&skipHttpRedirect=true',signal);
   const image=httpsUrl(result.data?.photoUri);
   if(!result.ok||!image||!/(^|\.)(googleusercontent\.com|ggpht\.com)$/.test(image.hostname))return send(502,{message:'Photo unavailable.'});
   res.writeHead(302,{Location:image.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return true;
  }
  if(req.method!=='POST'||!allowsOrigin(req))return send(403,{message:'Request origin is not allowed.'});
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{message:'Expected a JSON request.'});
  admit(req);
  if(anonymous){usage.rate('destination-global',80);usage.rate('destination-session:'+anonymous,30);}
  let raw='',bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)return send(413,{message:'Request is too large.'});raw+=chunk;}
  let data;try{data=JSON.parse(raw);}catch{return send(400,{message:'Invalid request.'});}
  if(!data||typeof data!=='object')return send(400,{message:'Invalid request.'});
  if(['/api/places/destination','/api/places/search','/api/places/candidates'].includes(route)){
   const candidate=route.endsWith('/candidates');
   const text=typeof data.query==='string'?data.query.trim().replace(/\s+/g,' '):'';
   if(text.length<2||text.length>256||candidate&&(!point(data.place)||typeof data.place.name!=='string'||data.place.name.length>160))
    return send(400,{message:'Invalid search.'});
   const bias=route.endsWith('/destination')?null:candidate?data.place:data.bias;
   const payload={textQuery:text,pageSize:candidate?5:8,languageCode:language,
    ...(point(bias)?{locationBias:{circle:{center:{latitude:bias.lat,longitude:bias.lng},radius:50000}}}:{})};
   const fields=(candidate?[...searchFields,'primaryType','types']:searchFields).map(field=>'places.'+field);
   const result=await request('placesSearch','places:searchText',signal,{body:payload,fields});
   if(!result.ok)return send(502,{message:'Google place search failed.'});
   if(candidate){
    const candidates=(result.data.places||[]).filter(p=>publicPlace(p)).map(p=>({...p,displayName:p.displayName.text}));
    const {name,address,lat,lng,category,featureType,googleTypes}=data.place;
    const subject={name,lat,lng,address:typeof address==='string'?address:'',
     category:typeof category==='string'?category:'',featureType:typeof featureType==='string'?featureType:'',
     googleTypes:Array.isArray(googleTypes)?googleTypes.filter(t=>typeof t==='string').slice(0,20):[]};
    const match=resolveGoogleCandidates(subject,candidates,{rematch:data.rematch===true});
    return send(200,match.id?{id:match.id}:{candidates:match.candidates.map(({id})=>({id}))});
   }
   return send(200,{places:(result.data.places||[]).map(p=>publicPlace(p)).filter(Boolean)});
  }
  if(route!=='/api/places/details'&&route!=='/api/places/restore')return send(404,{message:'Not found.'});
  if(typeof data.id!=='string'||!placeId.test(data.id))return send(400,{code:'INVALID_ARGUMENT',message:'Invalid place ID.'});
  const details=route.endsWith('/details');
  const fields=details?[...detailFields,...(media?['photos']:[])]:['id','displayName','location'];
  const result=await request(details?'placesDetails':'placesRestore','places/'+data.id+'?languageCode='+language,signal,{fields});
  const place=result.ok&&publicPlace(result.data,details&&media);
  if(!place)return send(result.status===404?404:502,
   {code:result.status===404?'NOT_FOUND':'PLACE_UNAVAILABLE',message:'Google place details could not be loaded.'});
  return send(200,{place});
 }
 handle.issueDestination=res=>{
  res.setHeader('Set-Cookie','travel_destination='+signed('destination',randomBytes(16).toString('hex'),12*3600_000)+
   '; Path=/api/places/destination; HttpOnly; SameSite=Strict; Max-Age=43200'+(secure?'; Secure':''));
 };
 return handle;
}
