export const segmentKey=(a,b)=>a.id+'>'+b.id;
export function reconcile(visits, previous={},mode='TRANSIT') {
  return Object.fromEntries(visits.slice(0,-1).map((v,i)=>{const k=segmentKey(v,visits[i+1]);return [k,previous[k]||{mode}];}));
}
export function wallStart(date,time) {return Date.parse(date+'T'+time+':00Z')/60000;}
export function stamp(minute) {
  if(!Number.isFinite(minute)) return 'Time unconfirmed';
  const s=new Date(minute*60000).toISOString();return s.slice(5,10).replace('-','/')+' '+s.slice(11,16);
}
export function hoursAt(place,arrival,stay,wait) {
  if(!Number.isFinite(arrival))return {wait:0,proposed:0,warnings:['Visit times depend on the preceding route.']};
  const day=Math.floor(arrival/1440)*1440;
  const dateKey=m=>new Date(m*60000).toISOString().slice(0,10);
  const periods=m=> {
    if(place.dateHours && Object.hasOwn(place.dateHours,dateKey(m)))return place.dateHours[dateKey(m)];
    if(!place.hours)return null;
    return place.hours[new Date(m*60000).getUTCDay()]||[];
  };
  const today=periods(day);
  if(today===null)return {wait:0,proposed:0,warnings:['Opening hours are unavailable. Check before visiting.']};
  const intervals=[...(periods(day-1440)||[]).map(([a,b])=>[day-1440+a,day-1440+b]),...today.map(([a,b])=>[day+a,day+b])];
  const active=intervals.find(([a,b])=>arrival>=a&&arrival<b);
  const next=intervals.find(([a])=>a>arrival);
  const proposed=!active&&next ? next[0]-arrival:0;
  const applied=wait?proposed:0;
  const warnings=[];
  if(!active&&!next)warnings.push(today.length?'Closed at your arrival time.':'Closed on this date.');
  if(proposed&&!wait)warnings.push('You may need to wait if you arrive before opening.');
  const period=active||(applied?next:null);
  if(period&&arrival+applied+stay>period[1])warnings.push('The planned visit extends past closing time.');
  return {wait:applied,proposed,warnings};
}
export async function resolveRoute(provider,args) {
  try {
    const r=await provider.route(args);
    return {...r,mode:args.mode};
  } catch(e) {if(e.name==='AbortError')throw e;return {status:'error',message:'Route request failed. Try again.',mode:args.mode};}
}
export async function calculate({visits,segments,date,time,zone,provider,signal,reason='schedule'}) {
  const start=wallStart(date,time);
  const startInstant=zone&&visits.length?Date.parse(wallToInstant(start,zone))/60000:null;
  const local=zone?wallFormatter(zone):null;
  let arrival=start,instant=startInstant;
  let elapsed=null;
  const rows=[],routes={};
  for(let i=0;i<visits.length;i++){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const v=visits[i],h=hoursAt(v.place,arrival,v.stay,v.wait);
    const departureInstant=Number.isFinite(instant)?instant+h.wait+v.stay:null;
    const departure=Number.isFinite(departureInstant)?local(departureInstant*60000)/60000:Number.isFinite(arrival)?arrival+h.wait+v.stay:null;
    elapsed=departureInstant===null?null:departureInstant-startInstant;
    rows.push({...v,arrival,departure,...h});
    if(i<visits.length-1){
      const key=segmentKey(v,visits[i+1]);
      const r=Number.isFinite(departure)?await resolveRoute(provider,{from:v.place,to:visits[i+1].place,mode:segments[key].mode,departure,
        departureUtc:departureInstant===null?undefined:new Date(departureInstant*60000).toISOString(),signal,reason}):{status:'unknown',message:'Confirm the preceding route first.'};
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      routes[key]=r;
      const confirmed=r.status==='ok'&&Number.isFinite(r.minutes)&&Number.isFinite(departure);
      instant=confirmed&&departureInstant!==null?departureInstant+r.minutes:null;
      arrival=instant!==null?local(instant*60000)/60000:confirmed?departure+r.minutes:null;
    }
  }
  return {rows,routes,elapsed};
}
function wallFormatter(zone) {
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  return instant=>{
    const p=Object.fromEntries(fmt.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));
    return Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');
  };
}
// Wall-clock minutes encode local calendar fields as UTC for display. Convert to an actual instant for routing.
export function wallToInstant(minute,zone) {
  const wall=minute*60000,wallAt=wallFormatter(zone);
  // Try offsets on both sides of a DST transition. Repeated local times use their first occurrence.
  const matches=[wall-86400000,wall,wall+86400000].map(t=>wall+t-wallAt(t)).filter(t=>wallAt(t)===wall);
  if(!matches.length)throw new RangeError('This departure time does not exist because of the daylight saving time change.');
  return new Date(Math.min(...matches)).toISOString();
}

