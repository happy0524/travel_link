import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findDestination,summarize,compareMetrics,ReorderComparison} from '../src/itinerary.js';
import {calculate,reconcile,wallStart} from '../src/engine.js';

const visits=[
  {id:'a',place:{id:'alpha',source:'demo',hours:null},stay:30,wait:false},
  {id:'b',place:{id:'beta',source:'demo',hours:null},stay:60,wait:false},
  {id:'c',place:{id:'gamma',source:'demo',hours:null},stay:15,wait:false},
];
const run=async(list=visits,provider={route:async()=>({status:'ok',minutes:10})})=>{
  const result=await calculate({visits:list,segments:reconcile(list),date:'2026-09-14',time:'09:00',provider});
  return summarize(list,result);
};
const metrics=(travel,end=1000)=>({travel,stay:60,waiting:0,end});

test('totals separate travel, stays, applied waits and end time',async()=>{
  assert.deepEqual(await run(),{travel:20,stay:105,waiting:0,end:wallStart('2026-09-14','11:05')});
  const waiting=[{...visits[0],stay:30,wait:true,place:{...visits[0].place,hours:{1:[[600,1080]]}}},visits[1]];
  assert.deepEqual(await run(waiting),{travel:10,stay:90,waiting:60,end:wallStart('2026-09-14','11:40')});
});
test('unknown segment never yields a partial travel total or an invented end',async()=>{
  let calls=0;
  const result=await run(visits,{route:async()=>++calls===1?{status:'ok',minutes:10}:{status:'error'}});
  assert.equal(result.travel,null);assert.equal(result.end,null);assert.equal(result.stay,105);
  assert.equal(result.waiting,0);
  assert.equal(compareMetrics(metrics(20),result).status,'unavailable');
});
test('waiting total is unknown when an applied wait depends on unknown arrival',async()=>{
  const result=await run([visits[0],{...visits[1],wait:true}],{route:async()=>({status:'error'})});
  assert.equal(result.waiting,null);
});
test('empty and single destination have zero travel rather than unknown travel',async()=>{
  assert.deepEqual(await run([]),{travel:0,stay:0,waiting:0,end:null});
  assert.equal((await run([visits[0]])).travel,0);
});
test('travel comparison excludes stay and waiting changes, end comparison includes them',()=>{
  const r=compareMetrics(metrics(30,1500),{travel:30,stay:0,waiting:0,end:1440});
  assert.equal(r.travelDelta,0);assert.equal(r.endDelta,-60);
  assert.equal(compareMetrics(metrics(30),metrics(18)).travelDelta,-12);
  assert.equal(compareMetrics(metrics(30),metrics(38)).travelDelta,8);
});
test('each reorder, including undo, compares to the immediately preceding completed order',()=>{
  const c=new ReorderComparison();c.complete(c.begin('edit'),metrics(40,1000));
  let token=c.begin('reorder');assert.equal(c.value.status,'pending');
  c.complete(token,metrics(28,988));assert.equal(c.value.travelDelta,-12);
  token=c.begin('reorder');c.complete(token,metrics(40,1000));assert.equal(c.value.travelDelta,12);
  assert.equal(c.value.endDelta,12);
});
test('stays, modes and dates clear old comparisons; interrupted edits cannot use stale baseline',()=>{
  const c=new ReorderComparison();c.complete(c.begin('edit'),metrics(40));
  c.complete(c.begin('reorder'),metrics(28));
  c.begin('edit');assert.equal(c.value,null);
  c.complete(c.begin('reorder'),metrics(20));assert.equal(c.value.status,'unavailable');
});
test('rapid reorders only commit the latest result and use last completed baseline',()=>{
  const c=new ReorderComparison();c.complete(c.begin('edit'),metrics(40));
  const old=c.begin('reorder'),latest=c.begin('reorder');
  assert.equal(c.complete(old,metrics(1)),false);assert.equal(c.value.status,'pending');
  c.complete(latest,metrics(35));assert.equal(c.value.travelDelta,-5);
  c.dismiss(old);assert.equal(c.value.status,'ready');c.dismiss(latest);assert.equal(c.value,null);
});
test('failed order is not skipped in favor of an older successful comparison',()=>{
  const c=new ReorderComparison();c.complete(c.begin('edit'),metrics(40));
  c.complete(c.begin('reorder'),metrics(null));assert.equal(c.value.status,'unavailable');
  c.complete(c.begin('reorder'),metrics(20));assert.equal(c.value.status,'unavailable');
});
test('destination identity uses provider place ID, independent of name and visit ID',()=>{
  assert.equal(findDestination(visits,{id:'alpha',source:'demo',name:'이름 변경'}),visits[0]);
  assert.equal(findDestination(visits,{id:'other',source:'demo',name:'같은 이름'}),undefined);
  const live=[{id:'visit-1',place:{id:'ChIJ-stable-id',source:'live',name:'Old name'}}];
  assert.equal(findDestination(live,{id:'ChIJ-stable-id',source:'live',name:'New name'}),live[0]);
  assert.equal(findDestination(live,{id:'ChIJ-different-id',source:'live',name:'Old name'}),undefined);
});
