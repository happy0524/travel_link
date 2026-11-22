import {wallToInstant} from './engine.js';
import {ui} from './ui-copy.js';
export class LiveProvider {
  async route({from,to,mode,departure,departureUtc,signal}) {
    const response=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:{lat:from.lat,lng:from.lng},to:{lat:to.lat,lng:to.lng},mode,departure:departureUtc||wallToInstant(departure,from.zone)}),signal});
    const result=await response.json();
    if(!response.ok)return {status:'error',message:result.message||ui.routeUnconfirmed};
    return result;
  }
}

