import {test} from 'node:test';
import assert from 'node:assert/strict';
import {places} from './schedule-places.mjs';
import {calculate,reconcile,segmentKey,hoursAt,wallStart,stamp,resolveRoute,wallToInstant} from '../src/engine.js';
import {routeFixture} from './schedule-places.mjs';
import {formatDuration} from '../src/ui-copy.js';
const visit=(i,stay=60,id=String(i))=>({id,place:places[i],stay,wait:false});
const calc=(visits,extra={})=>calculate({visits,segments:reconcile(visits),date:'2026-09-14',time:'09:00',provider:{route:async()=>({status:'ok',minutes:20})},...extra});
test('duration formatting keeps minute totals and hours beyond a day',()=>{
 assert.deepEqual([319,79,240,45,0,1441,null].map(formatDuration),
   ['5 hr 19 min','1 hr 19 min','4 hr','45 min','0 min','24 hr 1 min','Unconfirmed']);
});
test('first visit uses start time; stays propagate and survive reorder',async()=>{
 const a=visit(0,35),b=visit(1,90),c=visit(2,60);const x=await calc([a,b,c]);
 assert.equal(x.rows[1].arrival-x.rows[0].arrival,55);
 const y=await calc([b,c,a]);assert.equal(y.rows[0].arrival,wallStart('2026-09-14','09:00'));assert.equal(y.rows[0].stay,90);assert.equal(y.rows[2].stay,35);
});
test('directed settings preserved only for surviving adjacency',()=>{
 const a=visit(0),b=visit(1),c=visit(2),d=visit(3);
 const old=reconcile([a,b,c,d]);old['1>2'].mode='WALK';
 const next=reconcile([d,a,b,c],old);assert.equal(next['1>2'].mode,'WALK');assert.equal(next['3>0'].mode,'TRANSIT');assert.equal(next['2>3'],undefined);
});
test('waiting is opt-in and propagates downstream',async()=>{
 const a=visit(1),b=visit(2);const x=await calc([a,b]);a.wait=true;const y=await calc([a,b]);
 assert.equal(x.rows[0].proposed,60);assert.equal(x.rows[0].wait,0);assert.equal(y.rows[0].wait,60);assert.equal(y.rows[1].arrival-x.rows[1].arrival,60);
});
test('closed day does not offer waiting; unknown hours visible',()=>{
 const closed=hoursAt(places[0],wallStart('2026-09-15','08:00'),60,true);
 assert.equal(closed.proposed,0);assert.match(closed.warnings[0],/Closed on this date/);
 assert.match(hoursAt(places[6],wallStart('2026-09-14','12:00'),60,false).warnings[0],/Opening hours are unavailable/);
});
test('split hours, closing overrun and overnight intervals',()=>{
 const a=wallStart('2026-09-14','16:00');
 assert.equal(hoursAt(places[3],a,30,false).proposed,60);
 assert.equal(hoursAt(places[7],wallStart('2026-09-15','01:00'),30,false).warnings.length,0);
 assert.match(hoursAt(places[7],wallStart('2026-09-15','01:00'),90,false).warnings[0],/past closing time/);
 assert.match(hoursAt(places[0],wallStart('2026-09-14','19:00'),30,false).warnings[0],/Closed at your arrival time/);
});
test('date-specific closure overrides weekly opening',()=>{
 const p={...places[0],dateHours:{'2026-09-14':[]}};
 assert.match(hoursAt(p,wallStart('2026-09-14','12:00'),20,false).warnings[0],/Closed on this date/);
});
test('unknown segment invalidates all downstream arrival estimates',async()=>{
 const r=await calc([visit(0),visit(1),visit(2)],{provider:{route:async()=>({status:'error'})}});
 assert.equal(r.rows[1].arrival,null);assert.equal(r.rows[2].arrival,null);assert.equal(stamp(r.rows[2].departure),'Time unconfirmed');
});
test('transit no-route and network errors do not request another mode',async()=>{
 for(const status of ['error','no-route']){
 const calls=[];const r=await resolveRoute({route:async a=>{calls.push(a.mode);return {status:a.mode==='DRIVE'?'ok':status,minutes:10};}},{mode:'TRANSIT'});
 assert.deepEqual(calls,['TRANSIT']);assert.equal(r.status,status);
 }
 const r=await resolveRoute({route:async()=>{throw Error('network');}},{mode:'TRANSIT'});assert.equal(r.status,'error');assert.equal(r.fallback,undefined);
});
test('both unavailable remain unconfirmed',async()=>{
 const r=await resolveRoute(routeFixture('no-routes'),{from:places[0],to:places[1],mode:'TRANSIT'});
 assert.equal(r.status,'no-route');assert.equal(r.minutes,undefined);
});
test('schedule crossing midnight includes the following date',async()=>{
 const a=visit(7,90,'a'),b=visit(4,25,'b');const r=await calc([a,b],{time:'23:30'});
 assert.match(stamp(r.rows[1].arrival),/^09\/15 01:20$/);
});
test('timezone conversion independent of machine timezone',()=>{
 assert.equal(wallToInstant(wallStart('2026-09-14','09:00'),'Asia/Seoul'),'2026-09-14T00:00:00.000Z');
});
test('New York transit departures track elapsed time through both DST changes',async()=>{
 const visits=[visit(6,60),visit(7,20)],zone='America/New_York',departures=[];
 const provider={route:async args=>{departures.push(args.departureUtc);return {status:'ok',minutes:15};}};
 const spring=await calc(visits,{zone,date:'2027-03-14',time:'01:30',provider});
 const autumn=await calc(visits,{zone,date:'2026-11-01',time:'01:30',provider});
 assert.deepEqual(departures,['2027-03-14T07:30:00.000Z','2026-11-01T06:30:00.000Z']);
 assert.equal(stamp(spring.rows[0].departure),'03/14 03:30');
 assert.equal(stamp(autumn.rows[0].departure),'11/01 01:30');
 assert.equal(spring.elapsed,95);
 assert.equal(autumn.elapsed,95);
 await assert.rejects(calc(visits,{zone,date:'2027-03-14',time:'02:30',provider}),RangeError);
});
test('aborted route calculations reject rather than commit stale data',async()=>{
 const c=new AbortController();const p=calc([visit(0),visit(1)],{provider:routeFixture(),signal:c.signal});c.abort();
 await assert.rejects(p,{name:'AbortError'});
});

