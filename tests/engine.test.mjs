import {test} from 'node:test';
import assert from 'node:assert/strict';
import {places} from '../src/data.js';
import {calculate,reconcile,segmentKey,hoursAt,wallStart,stamp,resolveRoute,wallToInstant} from '../src/engine.js';
import {DemoProvider} from '../src/providers.js';
const visit=(i,stay=60,id=String(i))=>({id,place:places[i],stay,wait:false});
const calc=(visits,extra={})=>calculate({visits,segments:reconcile(visits),date:'2026-09-14',time:'09:00',provider:{route:async()=>({status:'ok',minutes:20})},...extra});
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
 assert.equal(closed.proposed,0);assert.match(closed.warnings[0],/휴무/);
 assert.match(hoursAt(places[6],wallStart('2026-09-14','12:00'),60,false).warnings[0],/정보가 없습니다/);
});
test('split hours, closing overrun and overnight intervals',()=>{
 const a=wallStart('2026-09-14','16:00');
 assert.equal(hoursAt(places[3],a,30,false).proposed,60);
 assert.equal(hoursAt(places[7],wallStart('2026-09-15','01:00'),30,false).warnings.length,0);
 assert.match(hoursAt(places[7],wallStart('2026-09-15','01:00'),90,false).warnings[0],/초과/);
 assert.match(hoursAt(places[0],wallStart('2026-09-14','19:00'),30,false).warnings[0],/종료/);
});
test('date-specific closure overrides weekly opening',()=>{
 const p={...places[0],dateHours:{'2026-09-14':[]}};
 assert.match(hoursAt(p,wallStart('2026-09-14','12:00'),20,false).warnings[0],/휴무/);
});
test('unknown segment invalidates all downstream arrival estimates',async()=>{
 const r=await calc([visit(0),visit(1),visit(2)],{provider:{route:async()=>({status:'error'})}});
 assert.equal(r.rows[1].arrival,null);assert.equal(r.rows[2].arrival,null);assert.equal(stamp(r.rows[2].departure),'시간 미확정');
});
test('fallback only after successful no-route response, never errors',async()=>{
 for(const status of ['error','no-route']){
 const calls=[];const r=await resolveRoute({route:async a=>{calls.push(a.mode);return {status:a.mode==='DRIVE'?'ok':status,minutes:10};}},{mode:'TRANSIT'});
 assert.deepEqual(calls,status==='error'?['TRANSIT']:['TRANSIT','DRIVE']);assert.equal(!!r.fallback,status==='no-route');
 }
 const r=await resolveRoute({route:async()=>{throw Error('network');}},{mode:'TRANSIT'});assert.equal(r.status,'error');assert.equal(r.fallback,undefined);
});
test('both unavailable remain unconfirmed',async()=>{
 const r=await resolveRoute(new DemoProvider('no-routes'),{from:places[0],to:places[1],mode:'TRANSIT'});
 assert.equal(r.status,'no-route');assert.equal(r.minutes,undefined);
});
test('schedule crossing midnight includes the following date',async()=>{
 const a=visit(7,90,'a'),b=visit(4,25,'b');const r=await calc([a,b],{time:'23:30'});
 assert.match(stamp(r.rows[1].arrival),/^09\/15 01:20$/);
});
test('timezone conversion independent of machine timezone',()=>{
 assert.equal(wallToInstant(wallStart('2026-09-14','09:00'),'Asia/Seoul'),'2026-09-14T00:00:00.000Z');
});
test('aborted route calculations reject rather than commit stale data',async()=>{
 const c=new AbortController();const p=calc([visit(0),visit(1)],{provider:new DemoProvider(),signal:c.signal});c.abort();
 await assert.rejects(p,{name:'AbortError'});
});

