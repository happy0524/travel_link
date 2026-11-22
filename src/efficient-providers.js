import {wallToInstant} from './engine.js';
import {requestConfig} from './request-config.js';
import {RequestPool,createMonitor} from './requests.js';

import {language,ui} from './ui-copy.js';

let mapsLoad;
export function loadGoogleMaps(browserKey,{monitor=createMonitor()}={}) {
  const event=status=>monitor.record({api:'maps-load',reason:'live-connect',id:'map-script',status});
  if(mapsLoad){event('shared');return mapsLoad;}
  if(globalThis.google?.maps?.importLibrary){event('cache-hit');return Promise.resolve();}
  event('requested');
  mapsLoad=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>fail('Google Maps took too long to load.'),15_000);
    function fail(message){clearTimeout(timer);script.remove();reject(Error(message));}
    globalThis.initGoogle=()=>{clearTimeout(timer);event('confirmed');resolve();};
    globalThis.gm_authFailure=()=>fail(ui.googleAuthSettings);
    script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key:browserKey,v:'weekly',loading:'async',callback:'initGoogle',language});
    script.onerror=()=>fail('Could not load Google Maps.');
    document.head.append(script);
  }).catch(error=>{event('failed');mapsLoad=null;throw error;});
  return mapsLoad;
}

const point = p => [p.id || '', p.lat, p.lng];
const pair = (a,b) => JSON.stringify([point(a),point(b)]);
export function routeKey({from,to,mode,departure,departureUtc}, config=requestConfig) {
  const instant = mode === 'WALK' ? null : Date.parse(departureUtc||wallToInstant(departure,from.zone));
  return JSON.stringify([pair(from,to),mode,instant === null ? null :
    Math.floor(instant/(config.departureBucketMinutes*60_000)),
    // All currently supported Google route options; update when adding options.
    language,'METRIC',mode==='DRIVE'?'TRAFFIC_AWARE':null]);
}
export class EfficientRouteProvider {
  constructor(provider,{config=requestConfig,monitor=createMonitor(),now=Date.now,activeOnly=true}={}) {
    Object.assign(this,{provider,config,monitor,activeOnly});
    this.pool=new RequestPool({api:'route',ttlMs:config.routeCacheTtlMs,
      maxEntries:config.maxCacheEntries,monitor,now,
      cacheable:r=>r.status==='ok'||r.status==='no-route'});
  }
  setActive(visits,segments) {
    if(!this.activeOnly)return;
    const pairs=new Set(visits.slice(0,-1).map((v,i)=>pair(v.place,visits[i+1].place)));
    this.pool.retain(key=>pairs.has(JSON.parse(key)[0]));
    if(segments){
      const allowed=new Set(visits.slice(0,-1).map((v,i)=>{
        const mode=segments[v.id+'>'+visits[i+1].id].mode,p=pair(v.place,visits[i+1].place);
        return JSON.stringify([p,mode]);
      }));
      this.pool.retain(key=>{const [p,m]=JSON.parse(key);return allowed.has(JSON.stringify([p,m]));});
    }
  }
  route(args) {
    let key;try{key=routeKey(args,this.config);}catch(error){return Promise.resolve({status:'error',message:error.message});}
    const [p,mode]=JSON.parse(key);
    // Drop previous departure versions, rather than retaining route history.
    if(this.activeOnly)for(const k of this.pool.cache.keys()){
      const [otherPair,otherMode]=JSON.parse(k);
      if(otherPair===p&&otherMode===mode&&k!==key)this.pool.cache.delete(k);
    }
    return this.pool.run(key,signal=>this.provider.route({...args,signal}),{
      signal:args.signal,reason:args.reason||'schedule',id:(args.from.id||'coordinate')+'>'+(args.to.id||'coordinate'),mode:args.mode});
  }
}

export const searchFields=['id','displayName','formattedAddress','location'];
export const detailFields=['id','displayName','formattedAddress','location','regularOpeningHours','photos','attributions'];
export function canonicalZone(zone) {
  if(typeof zone!=='string'||!zone||/^[+-]/.test(zone))return null;
  try{return new Intl.DateTimeFormat('en',{timeZone:zone}).resolvedOptions().timeZone;}
  catch{return null;}
}
const validZone=zone=>Boolean(canonicalZone(zone));
// 8 decimal places is sub-millimetre precision. Include both ID and coordinates:
// never group nearby venues using a coarse geographical cell at a zone boundary.
export const timeZoneKey=p=>JSON.stringify([p.id||'',Number(p.lat).toFixed(8),Number(p.lng).toFixed(8)]);

export class PlacesProvider {
  constructor({library=()=>google.maps.importLibrary('places'),fetcher=(...args)=>fetch(...args),
    config=requestConfig,monitor=createMonitor(),now=Date.now}={}) {
    Object.assign(this,{library,fetcher,config,monitor});
    const options={maxEntries:config.maxCacheEntries,monitor,now};
    this.searches=new RequestPool({...options,api:'places-search',ttlMs:config.searchCacheTtlMs});
    this.details=new RequestPool({...options,api:'place-detail',ttlMs:config.placeCacheTtlMs});
    this.zones=new RequestPool({...options,api:'timezone',ttlMs:config.timeZoneCacheTtlMs,cacheable:validZone});
  }
  retain(places) {
    const ids=new Set(places.map(p=>p.id)),zones=new Set(places.filter(p=>Number.isFinite(p.lat)).map(timeZoneKey));
    this.details.retain(k=>ids.has(k)); this.zones.retain(k=>ids.has(JSON.parse(k)[0])||zones.has(k));
  }
  async search(query,{signal,reason='search-submit',locationBias}={}) {
    const textQuery=query.trim().replace(/\s+/g,' ');
    if([...textQuery].length<this.config.minSearchLength)return [];
    const key=JSON.stringify([textQuery,language,8,searchFields,locationBias]);
    this.searches.retain(k=>k===key);
    return this.searches.run(key,async()=>{
      const {Place}=await this.library();
      const response=await Place.searchByText({textQuery,fields:searchFields,maxResultCount:8,language,
        ...(locationBias?{locationBias}:{})});
      return response.places.map(p=>({...normalizePlace(p),native:p}));
    },{signal,reason,id:'current-query'});
  }
  describe(place,{signal,reason='place-selection'}={}) {
    return this.details.run(place.id,async()=>{
      const {Place}=await this.library();
      const p=place.native||new Place({id:place.id,requestedLanguage:language});
      await p.fetchFields({fields:detailFields});
      return normalizePlace(p);
    },{signal,reason,id:place.id});
  }
  async inspect(place,{signal,reason='place-selection'}={}) {
    const detail=await this.describe(place,{signal,reason});
    const zone=await this.timeZone(detail,{signal,reason});
    return {...detail,zone};
  }
  async timeZone(place,{signal,reason='new-place'}={}) {
    if(!Number.isFinite(place.lat)||Math.abs(place.lat)>90||!Number.isFinite(place.lng)||Math.abs(place.lng)>180)
      throw Error('Place coordinates unavailable');
    return this.zones.run(timeZoneKey(place),async requestSignal=>{
      const response=await this.fetcher('/api/timezone?lat='+place.lat+'&lng='+place.lng,{signal:requestSignal});
      const data=await response.json();
      if(!response.ok||!validZone(data.zone))throw Error('Time zone unavailable');
      return data.zone;
    },{signal,reason,id:place.id||'coordinate'});
  }
}

export function normalizePlace(p) {
  const lat=p.location.lat(),lng=p.location.lng();
  let hours=null;
  if(p.regularOpeningHours?.periods){
    hours=Object.fromEntries(Array.from({length:7},(_,d)=>[d,[]]));
    for(const period of p.regularOpeningHours.periods){
      const o=period.open,c=period.close;if(!o)continue;
      if(!c){for(let d=0;d<7;d++)hours[d]=[[0,1440]];break;}
      const start=o.hour*60+o.minute,end=((c.day-o.day+7)%7)*1440+c.hour*60+c.minute;
      hours[o.day].push([start,end<=start?end+1440:end]);
    }
    for(const list of Object.values(hours))list.sort((a,b)=>a[0]-b[0]);
  }
  return {id:p.id,name:p.displayName,address:p.formattedAddress,lat,lng,zone:null,hours,
    hoursLabel:'Regular weekly hours from Google · hours for this date are unconfirmed',category:'Google Places',source:'live',
    photo:p.photos?.[0]?.getURI({maxWidth:500}),authors:p.photos?.[0]?.authorAttributions,
    attributions:p.attributions};
}
