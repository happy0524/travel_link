import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculate,reconcile,wallStart} from '../src/engine.js';
import {places} from './schedule-places.mjs';
import {routeFixture} from './schedule-places.mjs';
import {canonicalZone,EfficientRouteProvider,PlacesProvider,routeKey,timeZoneKey} from '../src/efficient-providers.js';
import {RequestPool,createMonitor,debounce} from '../src/requests.js';
import {requestConfig} from '../src/request-config.js';

const visits=()=>places.slice(0,4).map((place,i)=>({id:String(i),place,stay:60,wait:false}));
const routeArgs=(extra={})=>({from:places[0],to:places[1],mode:'TRANSIT',departure:wallStart('2026-11-15','09:00'),...extra});
const setup=(config={})=>{
 const calls=[];let now=0;
 const monitor=createMonitor(true);
 const provider=new EfficientRouteProvider({route:async a=>{calls.push(a);return {status:'ok',minutes:10};}},
   {config:{...requestConfig,...config},monitor,now:()=>now});
 const calc=(v,extra={})=>{provider.setActive(v);return calculate({visits:v,segments:reconcile(v),date:'2026-11-15',time:'09:00',provider,...extra});};
 return {provider,calls,calc,monitor,tick:n=>now+=n};
};

test('four visits request exactly three adjacent segments; identical recalculation adds zero',async()=>{
 const s=setup(),v=visits();await s.calc(v);assert.equal(s.calls.length,3);await s.calc(v);assert.equal(s.calls.length,3);
});
test('retrying one route preserves cached siblings with the same departure',async()=>{
 const s=setup(),v=visits(),segments=reconcile(v);
 for(const segment of Object.values(segments))segment.mode='WALK';
 await s.calc(v,{segments});
 s.provider.retry(v[1].place,v[2].place,'WALK');
 await s.calc(v,{segments});
 assert.equal(s.calls.length,4);
 assert.equal(s.calls.at(-1).from.id,v[1].place.id);
 assert.equal(s.calls.at(-1).to.id,v[2].place.id);
});
test('adding a destination preserves unchanged active segments',async()=>{
 const s=setup(),v=visits();for(let i=1;i<=4;i++)await s.calc(v.slice(0,i));assert.equal(s.calls.length,3);
});
test('reordering reuses surviving walking pairs; only new adjacency is requested',async()=>{
 const s=setup(),v=visits();const seg=reconcile(v);for(const k in seg)seg[k].mode='WALK';
 await s.calc(v,{segments:seg});
 const reordered=[v[3],v[0],v[1],v[2]];
 await s.calc(reordered,{segments:reconcile(reordered,seg)});
 assert.equal(s.calls.length,4);assert.equal(s.calls[3].from.id,v[3].place.id);assert.equal(s.calls[3].to.id,v[0].place.id);
});
test('unchanged transit adjacency is invalidated if reorder changes its actual departure',async()=>{
 const s=setup(),v=visits();await s.calc(v);await s.calc([v[3],...v.slice(0,3)]);assert.equal(s.calls.length,6);
});
test('walking stay/time edits recalculate downstream schedule locally including midnight',async()=>{
 const s=setup(),v=visits(),seg=reconcile(v);for(const k in seg)seg[k].mode='WALK';
 const a=await s.calc(v,{segments:seg,time:'23:30'});v[0].stay+=35;
 const b=await s.calc(v,{segments:seg,time:'23:30'});assert.equal(s.calls.length,3);
 assert.equal(b.rows[3].arrival-a.rows[3].arrival,35);assert.ok(b.rows[1].arrival>wallStart('2026-11-16','00:00'));
});
test('waiting remains opt-in; local walking duration reuse preserves propagation',async()=>{
 const s=setup(),v=visits().slice(1,3),seg=reconcile(v);for(const k in seg)seg[k].mode='WALK';
 const a=await s.calc(v,{segments:seg});v[0].wait=true;const b=await s.calc(v,{segments:seg});
 assert.equal(b.rows[1].arrival-a.rows[1].arrival,b.rows[0].wait);assert.equal(s.calls.length,1);
});
test('route identity includes direction, coordinates, mode, zone-converted time; WALK ignores time',()=>{
 const a=routeArgs();assert.notEqual(routeKey(a),routeKey({...a,mode:'DRIVE'}));
 assert.notEqual(routeKey(a),routeKey({...a,from:a.to,to:a.from}));
 assert.notEqual(routeKey(a),routeKey({...a,to:{...a.to,lat:a.to.lat+.001}}));
 assert.notEqual(routeKey(a),routeKey({...a,departure:a.departure+1}));
 assert.equal(routeKey({...a,mode:'WALK'}),routeKey({...a,mode:'WALK',departure:a.departure+120}));
});
test('configurable departure bucket changes at its boundary only',async()=>{
 const s=setup({departureBucketMinutes:5}),a=routeArgs();
 await s.provider.route(a);await s.provider.route({...a,departure:a.departure+4});assert.equal(s.calls.length,1);
 await s.provider.route({...a,departure:a.departure+5});assert.equal(s.calls.length,2);
});
test('identical in-flight route requests share underlying work',async()=>{
 let calls=0,finish;const p=new EfficientRouteProvider({route:()=>{calls++;return new Promise(r=>finish=r);}});
 const a=p.route(routeArgs()),b=p.route(routeArgs());await Promise.resolve();assert.equal(calls,1);
 finish({status:'ok',minutes:5});assert.deepEqual(await a,await b);
});
test('aborting one subscriber does not abort another; last subscriber cancels upstream',async()=>{
 const pool=new RequestPool();let upstream,finish;
 const task=signal=>{upstream=signal;return new Promise(r=>finish=r);};
 const c=new AbortController(),a=pool.run('a',task,{signal:c.signal}),b=pool.run('a',task);
 await Promise.resolve();c.abort();await assert.rejects(a,{name:'AbortError'});assert.equal(upstream.aborted,false);
 finish(42);assert.equal(await b,42);
 const d=new AbortController(),p=pool.run('b',task,{signal:d.signal});await Promise.resolve();d.abort();
 await assert.rejects(p,{name:'AbortError'});await Promise.resolve();assert.equal(upstream.aborted,true);finish(1);
});
test('route TTL expires and LRU bounds entries; changing active order drops history',async()=>{
 const s=setup({routeCacheTtlMs:10,maxCacheEntries:2}),v=visits();await s.calc(v);assert.equal(s.provider.pool.cache.size,2);
 const a=routeArgs();await s.provider.route(a);await s.provider.route(a);const n=s.calls.length;
 s.tick(11);await s.provider.route(a);assert.equal(s.calls.length,n+1);assert.ok(s.provider.pool.cache.size<=2);
 s.provider.setActive([]);assert.equal(s.provider.pool.cache.size,0);
});
test('failed requests are retried and transit no-route is reused',async()=>{
 let calls=0;const p=new EfficientRouteProvider({route:async()=>{calls++;return {status:'error'};}});
 await p.route(routeArgs());await p.route(routeArgs());assert.equal(calls,2);
 const seen=[];const q=new EfficientRouteProvider({route:async a=>{seen.push(a.mode);return a.mode==='TRANSIT'?{status:'no-route'}:{status:'ok',minutes:8};}});
 const v=visits().slice(0,2),args={visits:v,segments:reconcile(v),date:'2026-11-15',time:'09:00',provider:q};
 assert.equal((await calculate(args)).routes['0>1'].status,'no-route');await calculate(args);assert.deepEqual(seen,['TRANSIT']);
});
test('aborted provider ignoring signal cannot return a stale completed schedule',async()=>{
 const c=new AbortController();let finish;const v=visits().slice(0,2);
 const promise=calculate({visits:v,segments:reconcile(v),date:'2026-11-15',time:'09:00',signal:c.signal,
   provider:{route:()=>new Promise(r=>finish=r)}});
 c.abort();finish({status:'ok',minutes:20});await assert.rejects(promise,{name:'AbortError'});
});
test('edit debounce commits only the final edit',async()=>{
 const seen=[];const fn=debounce(n=>seen.push(n),15);fn(1);fn(2);fn(3);
 await new Promise(r=>setTimeout(r,35));assert.deepEqual(seen,[3]);fn(4);fn.cancel();
});

function placeSetup(){
 let now=0;const calls={search:0,detail:0,zone:0,fields:[]};
 class Place{
   constructor({id='p'}={}){Object.assign(this,{id,displayName:'Place',formattedAddress:'Address',location:{lat:()=>37.5,lng:()=>127}});}
   static async searchByText(args){calls.search++;calls.fields.push(args.fields);return {places:[new Place()]};}
   async fetchFields(args){calls.detail++;calls.fields.push(args.fields);return {place:this};}
 }
 const p=new PlacesProvider({library:async()=>({Place}),now:()=>now,config:{...requestConfig,timeZoneCacheTtlMs:10},
   fetcher:async()=>{calls.zone++;return {ok:true,json:async()=>({zone:'Asia/Seoul'})};}});
 return {p,calls,tick:n=>now+=n};
}
test('search skips empty/short input, normalizes whitespace, deduplicates and requests only list fields',async()=>{
 const {p,calls}=placeSetup();assert.deepEqual(await p.search(' '),[]);await p.search('a');
 await Promise.all([p.search('  Seoul  cafe '),p.search('Seoul cafe')]);assert.equal(calls.search,1);
 await p.search('Seoul cafe');assert.equal(calls.search,1);assert.equal(calls.zone,0);assert.equal(calls.detail,0);
 assert.ok(!calls.fields[0].includes('photos'));assert.ok(!calls.fields[0].includes('regularOpeningHours'));
});
test('a place search cache does not reuse results biased toward a different destination',async()=>{
 const {p,calls}=placeSetup(),ny={lat:40.71,lng:-74},seoul={lat:37.56,lng:126.98};
 await p.search('Times Square',{locationBias:ny});
 await p.search('Times Square',{locationBias:{...ny}});
 await p.search('Times Square',{locationBias:seoul});
 assert.equal(calls.search,2);
});
test('zone comparisons normalize aliases and reject numeric offsets',()=>{
 assert.equal(canonicalZone('US/Eastern'),canonicalZone('America/New_York'));
 assert.notEqual(canonicalZone('Asia/Seoul'),canonicalZone('America/New_York'));
 for(const invalid of [undefined,'-05:00','+09:00','Unknown/Zone'])assert.equal(canonicalZone(invalid),null);
});
test('repeated inspection shares details and timezone; confirmed IANA zone reused',async()=>{
 const {p,calls}=placeSetup(),[place]=await p.search('Seoul');p.retain([place]);
 const results=await Promise.all([p.inspect(place),p.inspect(place)]);await p.inspect(place);
 assert.equal(calls.detail,1);assert.equal(calls.zone,1);assert.equal(results[0].zone,'Asia/Seoul');
});
test('timezone TTL expires on next inspection, failures/unknown IANA are never cached',async()=>{
 const {p,calls,tick}=placeSetup(),[place]=await p.search('Seoul');p.retain([place]);await p.inspect(place);tick(11);await p.inspect(place);
 assert.equal(calls.zone,2);p.zones.clear();p.fetcher=async()=>({ok:true,json:async()=>({zone:'Unknown/Zone'})});
 await assert.rejects(p.inspect(place));assert.equal(p.zones.cache.size,0);
});
test('coordinate key absorbs numerical noise without grouping neighbouring boundary venues',()=>{
 const p={id:'p',lat:37.12345678,lng:127};
 assert.equal(timeZoneKey(p),timeZoneKey({...p,lat:p.lat+1e-12}));
 assert.notEqual(timeZoneKey(p),timeZoneKey({...p,lat:p.lat+1e-7}));
 assert.notEqual(timeZoneKey(p),timeZoneKey({...p,id:'q'}));
});
test('the unit route fixture is isolated from the network',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected network request');};
 try{const p=new EfficientRouteProvider(routeFixture()),v=visits();await calculate({visits:v,segments:reconcile(v),date:'2026-11-15',time:'09:00',provider:p});}
 finally{globalThis.fetch=original;}
});
test('monitor is disabled by default and reports only bounded request metadata',()=>{
 const quiet=createMonitor();quiet.record({api:'route',status:'requested'});assert.deepEqual(quiet.snapshot().events,[]);
 const m=createMonitor(true);for(let i=0;i<120;i++)m.record({api:'route',reason:'edit',id:'a>b',mode:'WALK',status:'cache-hit',url:'SECRET',body:'SECRET'});
 assert.equal(m.snapshot().events.length,100);assert.equal(m.snapshot().counts['route:cache-hit'],120);
 assert.ok(!JSON.stringify(m.snapshot()).includes('SECRET'));
});
