import {language,ui} from './ui-copy.js';

export class MapboxSearch {
 constructor(getToken,{fetcher=(...args)=>fetch(...args),permit=async()=>{},now=Date.now}={}){Object.assign(this,{getToken,fetcher,permit,now});this.reset();}
 reset(){this.session=crypto.randomUUID();this.started=this.now();this.calls=0;}
 async request(path,params,signal){
  await this.permit(signal);
  const token=this.getToken();if(!token)throw Error(ui.mapboxTokenMissing);
  const q=new URLSearchParams({...params,access_token:token});
  const requestFailed='Place search failed. Try again.';
  const timeout=AbortSignal.timeout(12000);
  const r=await this.fetcher('https://api.mapbox.com/search/searchbox/v1/'+path+'?'+q,{signal:signal?AbortSignal.any([signal,timeout]):timeout})
   .catch(error=>{if(error.name==='AbortError')throw error;throw Error(requestFailed);});
  if(!r.ok)throw Error(r.status===429?'Search rate limit reached. Try again later.':[401,403].includes(r.status)?'Search authentication failed. Check the token and allowed URLs.':requestFailed);
  return r.json().catch(()=>{throw Error(requestFailed);});
 }
 async suggest(query,center,signal){
  if(this.now()-this.started>175000||this.calls>=49)this.reset();
  this.calls++;
  const j=await this.request('suggest',{q:query.slice(0,256),session_token:this.session,language,limit:'6',proximity:center.join(',')},signal);
  return (j.suggestions||[]).filter(p=>p.mapbox_id&&p.feature_type!=='category').map(p=>({id:p.mapbox_id,name:p.name, address:p.full_address||p.place_formatted,suggestion:true,session:this.session}));
 }
 async retrieve(suggestion,signal){
  const session=suggestion.session;
  try{
   const j=await this.request('retrieve/'+encodeURIComponent(suggestion.id),{session_token:session,language},signal);
   const f=j.features?.[0],p=f?.properties,[lng,lat]=f?.geometry?.coordinates||[];
   if(!p||f.geometry.type!=='Point'||!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)throw Error('Could not confirm the place coordinates.');
   return {id:p.mapbox_id||suggestion.id,name:p.name,lat,lng,address:p.full_address||[p.address,p.place_formatted].filter(Boolean).join(', '),category:p.poi_category?.join(' · ')||p.feature_type,featureType:p.feature_type,source:'mapbox',zone:'America/New_York',hours:null,hoursLabel:ui.openingHoursUnavailable,description:'Place from Mapbox Search Box · available for this session.'};
  }finally{if(this.session===session)this.reset();}
 }
}
