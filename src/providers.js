import {wallToInstant} from './engine.js';
export class DemoProvider {
  constructor(scenario='normal'){this.scenario=scenario;}
  async route({from,to,mode,signal}) {
    await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},60);
      if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    });
    if(this.scenario==='error')return {status:'error',message:'경로 확인 필요 · 네트워크 오류 시연'};
    if(this.scenario==='no-transit'&&mode==='TRANSIT')return {status:'no-route'};
    if(this.scenario==='no-routes')return {status:'no-route',message:'경로 확인 필요 · 이용 가능한 경로 없음'};
    const km=Math.hypot((from.lat-to.lat)*111,(from.lng-to.lng)*88);
    const minutes=km<0.001?0:Math.ceil(mode==='WALK'?km*18:mode==='DRIVE'?km*4+7:km*5+10);
    return {status:'ok',minutes,source:'demo',details:mode==='TRANSIT'?'도보 + 대중교통 (가상 혼합 경로)':'시연용 거리 기반 추정'};
  }
}
export class LiveProvider {
  async route({from,to,mode,departure,signal}) {
    const response=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:{lat:from.lat,lng:from.lng},to:{lat:to.lat,lng:to.lng},mode,departure:wallToInstant(departure,from.zone)}),signal});
    const result=await response.json();
    if(!response.ok)return {status:'error',message:result.message||'경로 확인 필요'};
    return result;
  }
}

