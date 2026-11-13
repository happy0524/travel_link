export const segmentKey=(a,b)=>a.id+'>'+b.id;
export function reconcile(visits, previous={}) {
  return Object.fromEntries(visits.slice(0,-1).map((v,i)=>{const k=segmentKey(v,visits[i+1]);return [k,previous[k]||{mode:'TRANSIT'}];}));
}
export function wallStart(date,time) {return Date.parse(date+'T'+time+':00Z')/60000;}
export function stamp(minute) {
  if(!Number.isFinite(minute)) return '시간 미확정';
  const s=new Date(minute*60000).toISOString();return s.slice(5,10).replace('-','/')+' '+s.slice(11,16);
}
export function hoursAt(place,arrival,stay,wait) {
  if(!Number.isFinite(arrival))return {wait:0,proposed:0,warnings:['앞선 경로 확인 후 방문시간을 계산합니다.']};
  const day=Math.floor(arrival/1440)*1440;
  const dateKey=m=>new Date(m*60000).toISOString().slice(0,10);
  const periods=m=> {
    if(place.dateHours && Object.hasOwn(place.dateHours,dateKey(m)))return place.dateHours[dateKey(m)];
    if(!place.hours)return null;
    return place.hours[new Date(m*60000).getUTCDay()]||[];
  };
  const today=periods(day);
  if(today===null)return {wait:0,proposed:0,warnings:['운영시간 정보가 없습니다. 방문 전 확인하세요.']};
  const intervals=[...(periods(day-1440)||[]).map(([a,b])=>[day-1440+a,day-1440+b]),...today.map(([a,b])=>[day+a,day+b])];
  const active=intervals.find(([a,b])=>arrival>=a&&arrival<b);
  const next=intervals.find(([a])=>a>arrival);
  const proposed=!active&&next ? next[0]-arrival:0;
  const applied=wait?proposed:0;
  const warnings=[];
  if(!active&&!next)warnings.push(today.length?'도착 시 운영이 종료되어 있습니다.':'이 날짜에는 휴무입니다.');
  if(proposed&&!wait)warnings.push('개장 전에 도착합니다. 대기가 필요할 수 있습니다.');
  const period=active||(applied?next:null);
  if(period&&arrival+applied+stay>period[1])warnings.push('예정된 체류가 운영시간을 초과합니다.');
  return {wait:applied,proposed,warnings};
}
export async function resolveRoute(provider,args) {
  try {
    let r=await provider.route(args);
    if(r.status==='no-route'&&args.mode==='TRANSIT'){
      r=await provider.route({...args,mode:'DRIVE'});
      return {...r,fallback:r.status==='ok',mode:'DRIVE'};
    }
    return {...r,mode:args.mode};
  } catch(e) {if(e.name==='AbortError')throw e;return {status:'error',message:'경로 확인 필요 · 요청 실패',mode:args.mode};}
}
export async function calculate({visits,segments,date,time,provider,signal}) {
  let arrival=wallStart(date,time);
  const rows=[],routes={};
  for(let i=0;i<visits.length;i++){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const v=visits[i],h=hoursAt(v.place,arrival,v.stay,v.wait);
    const departure=Number.isFinite(arrival)?arrival+h.wait+v.stay:null;
    rows.push({...v,arrival,departure,...h});
    if(i<visits.length-1){
      const key=segmentKey(v,visits[i+1]);
      const r=Number.isFinite(departure)?await resolveRoute(provider,{from:v.place,to:visits[i+1].place,mode:segments[key].mode,departure,signal}):{status:'unknown',message:'앞선 경로 확인 필요'};
      routes[key]=r;
      arrival=r.status==='ok'&&Number.isFinite(r.minutes)&&Number.isFinite(departure)?departure+r.minutes:null;
    }
  }
  return {rows,routes};
}
// Wall-clock minutes deliberately encode local fields as UTC. Convert only at the provider boundary.
export function wallToInstant(minute,zone) {
  let instant=minute*60000;
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){
    const p=Object.fromEntries(fmt.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));
    const represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    instant+=minute*60000-represented;
  }
  return new Date(instant).toISOString();
}

