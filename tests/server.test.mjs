import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('server boundary uses mocked Google only',async t=>{
 const server=spawn(process.execPath,['--import','./tests/server-fixture.mjs','server.mjs'],{
   env:{...process.env,PORT:'0',GOOGLE_MAPS_SERVER_KEY:'fixture-server-key',GOOGLE_MAPS_BROWSER_KEY:'fixture-browser-key',REQUEST_MONITOR:'1',NODE_ENV:'development'},
   stdio:['ignore','pipe','inherit'],windowsHide:true});
 try{
 const base=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Server timeout')),10000);
   server.stdout.on('data',data=>{const match=String(data).match(/localhost:(\d+)/);if(match){clearTimeout(timeout);resolve('http://127.0.0.1:'+match[1]);}});
   server.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code));});
 });
 const monitor=async()=>fetch(base+'/api/debug/requests').then(r=>r.json());
 const args={from:{lat:37.5,lng:127},to:{lat:37.6,lng:127.1},mode:'TRANSIT',departure:new Date(Date.now()+86400000).toISOString()};
 const route=(data=args,signal)=>fetch(base+'/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
 await t.test('simultaneous identical route requests use one upstream request',async()=>{
   const results=await Promise.all([route(),route()]);
   for(const r of results){assert.equal(r.status,200);assert.equal((await r.json()).minutes,10);}
   const m=await monitor();assert.equal(m.counts['route:requested'],1);assert.equal(m.counts['route:shared'],1);
   await route();assert.equal((await monitor()).counts['route:requested'],2); // no server response history
 });
 await t.test('simultaneous timezone lookups share work, but do not cache server results',async()=>{
   const call=()=>fetch(base+'/api/timezone?lat=37.5&lng=127').then(r=>r.json());
   assert.deepEqual(await Promise.all([call(),call()]),[{zone:'Asia/Seoul'},{zone:'Asia/Seoul'}]);
   assert.equal((await monitor()).counts['timezone:requested'],1);await call();assert.equal((await monitor()).counts['timezone:requested'],2);
 });
 await t.test('invalid payloads, past driving dates and upstream auth failures remain failures',async()=>{
   assert.equal((await route({})).status,400);
   assert.equal((await route({...args,mode:'DRIVE',departure:'2020-01-01T00:00:00Z'})).status,422);
   assert.equal((await route({...args,from:{lat:0,lng:127}})).status,502);
 });
 await t.test('client cancellation reaches the upstream request',async()=>{
   const c=new AbortController(),p=route({...args,to:{lat:38,lng:127}},c.signal);
   await new Promise(r=>setTimeout(r,35));c.abort();await assert.rejects(p,{name:'AbortError'});
   await new Promise(r=>setTimeout(r,100));assert.ok((await monitor()).counts['route:cancelled']>=1);
 });
 await t.test('monitor and static routes expose no keys, credentials or server source',async()=>{
   const data=JSON.stringify(await monitor());assert.ok(!data.includes('fixture-server-key'));assert.ok(!data.includes('fixture-browser-key'));
   for(const p of ['/.env','/server.mjs','/tests/server-fixture.mjs'])assert.equal((await fetch(base+p)).status,404);
 });
 }finally{server.kill();}
});
