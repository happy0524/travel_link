import {validMapboxPlace,allowedRouteFeatures} from './mapbox-eucalyptus.js';
import {ui} from './ui-copy.js';

export class MapboxDirections {
 constructor(getToken,{fetcher=(url,options)=>fetch(url,options),permit=async()=>{}}={}){Object.assign(this,{getToken,fetcher,permit});}
 async route({from,to,mode,signal}){
  if(!validMapboxPlace(from)||!validMapboxPlace(to))return {status:'unsupported',message:'Use Google Maps for routes involving places from Google.'};
  if(!['WALK','DRIVE'].includes(mode))return {status:'unsupported',message:'Mapbox supports walking and driving routes in this planner.'};
  try{await this.permit(signal);}catch(error){if(signal?.aborted)throw error;return {status:'error',message:error.message};}
  const token=this.getToken();if(!token)return {status:'error',message:ui.mapboxTokenMissing};
  const profile=mode==='WALK'?'walking':'driving';
  const query=new URLSearchParams({access_token:token,geometries:'geojson',overview:'full',steps:'false'});
  const response=await this.fetcher(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?${query}`,{signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(15000)])});
  if(!response.ok)return {status:'error',message:response.status===429?'Mapbox route request limit reached. Try again later.':[401,403].includes(response.status)?'Mapbox route authentication failed. Check the token settings.':'Mapbox route request failed. Try again.'};
  const data=await response.json(),route=data.routes?.[0];
  if(data.code==='NoRoute'||data.code==='NoSegment')return {status:'no-route',message:'No route found between these places.'};
  if(data.code!=='Ok'||!route||route.geometry?.type!=='LineString'||!Number.isFinite(route.duration)||!Number.isFinite(route.distance))return {status:'error',message:'Mapbox returned an invalid route response.'};
  if(!allowedRouteFeatures({route:{status:'ok',source:'mapbox',geometry:route.geometry}}).length)return {status:'error',message:'Mapbox returned invalid route coordinates.'};
  return {status:'ok',source:'mapbox',geometry:route.geometry,minutes:Math.ceil(route.duration/60),distance:route.distance,details:`Mapbox ${ui.modes[mode]} · ${(route.distance/1000).toFixed(1)} km · departure time not used`};
 }
}
