import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('server boundary uses mocked Google only',async t=>{
 const usageDir=await mkdtemp(join(tmpdir(),'travel-link-server-'));
 const server=spawn(process.execPath,['--import','./tests/server-fixture.mjs','server.mjs'],{
   env:{...process.env,PORT:'0',TRAVEL_LINK_DATA_DIR:usageDir,GOOGLE_TIME_ZONE_MONTHLY_LIMIT:'3',
     GOOGLE_MAPS_SERVER_KEY:'fixture-server-key',GOOGLE_MAPS_BROWSER_KEY:'fixture-browser-key',REQUEST_MONITOR:'1',NODE_ENV:'development'},
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
   for(const r of results){
     assert.equal(r.status,200);const data=await r.json();
     assert.equal(data.minutes,10);assert.equal(data.distance,800);assert.equal(data.fare,'$3.00');
     assert.equal(data.steps[0].seconds,90);assert.equal(data.steps[1].arrivalStop,'Second Stop');
     assert.equal(data.steps[1].agencies[0].name,'Transit Authority');
   }
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
   assert.equal((await route({...args,departure:'2020-01-01T00:00:00Z'})).status,422);
   assert.equal((await route({...args,from:{lat:0,lng:127}})).status,502);
 });
 await t.test('a Google Time Zone denial in an HTTP 200 exposes only a safe diagnostic',async()=>{
   const response=await fetch(base+'/api/timezone?lat=0&lng=0');
   assert.equal(response.status,502);
   const diagnostic=await response.json();
   assert.equal(diagnostic.upstreamStatus,200);
   assert.equal(diagnostic.code,'API_KEY_IP_ADDRESS_BLOCKED');
   assert.doesNotMatch(JSON.stringify(diagnostic),/Fixture secret|fixture-server-key/);
 });
 await t.test('a third actual attempt fills the cap even when denied upstream',async()=>{
   const results=await Promise.all([0,1].map(n=>fetch(base+'/api/timezone?lat='+(38+n)+'&lng=127')));
   for(const response of results){
     assert.equal(response.status,429);
     assert.equal((await response.json()).code,'API_MONTH_LIMIT');
   }
 });
 await t.test('client cancellation reaches the upstream request',async()=>{
   const c=new AbortController(),p=route({...args,to:{lat:38,lng:127}},c.signal);
   await new Promise(r=>setTimeout(r,35));c.abort();await assert.rejects(p,{name:'AbortError'});
   await new Promise(r=>setTimeout(r,100));assert.ok((await monitor()).counts['route:cancelled']>=1);
 });
 await t.test('monitor and static routes expose no keys, credentials or server source',async()=>{
   const data=JSON.stringify(await monitor());assert.ok(!data.includes('fixture-server-key'));assert.ok(!data.includes('fixture-browser-key'));
   for(const p of ['/.env','/server.mjs','/api-usage.mjs','/api-usage.sqlite','/profile.key','/.travel-link/travel.sqlite','/backups/render-v1/travel.sqlite','/tests/server-fixture.mjs'])assert.equal((await fetch(base+p)).status,404);
 });
 await t.test('anonymous browser permits are checked before optional login',async()=>{
   assert.equal((await fetch(base+'/api/usage/browser',{method:'POST'})).status,403);
   const response=await fetch(base+'/api/usage/browser',{method:'POST',headers:{Origin:base}});
   assert.equal(response.status,200);assert.equal((await response.json()).allowed,true);
 });
 }finally{server.kill();}
});

test('Render origin, HTTPS cookies and persisted profiles and trips',async()=>{
 const root=await mkdtemp(join(tmpdir(),'travel-link-render-'));
 const origin='https://travel-link-test.onrender.com';
 const env={...process.env,PORT:'0',RENDER:'true',RENDER_EXTERNAL_URL:origin,
  TRAVEL_LINK_PUBLIC_URL:'',TRAVEL_LINK_DATA_DIR:root,NODE_ENV:'production'};
 async function start(directory=root){
  const server=spawn(process.execPath,['server.mjs'],{env:{...env,TRAVEL_LINK_DATA_DIR:directory},stdio:['ignore','pipe','inherit'],windowsHide:true});
  const [data]=await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  const port=String(data).match(/0\.0\.0\.0:(\d+)/)?.[1];
  assert.ok(port);
  return {server,url:'http://127.0.0.1:'+port};
 }
 async function stop(server){const exited=once(server,'exit');server.kill();await exited;}
 const credentials={action:'enter-profile',name:'Render fixture',number:'0042',allowCreate:true};
 const post=(app,path,body,source=origin,cookie='')=>fetch(app.url+path,{method:'POST',
   headers:{Origin:source,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const signIn=async app=>{
  const response=await post(app,'/api/travel-session',credentials);
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');
  assert.match(cookie,/; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
  return cookie.split(';')[0];
 };
 const app=await start();
 let saved;
 try{
  for(const badOrigin of ['http://127.0.0.1','https://other.onrender.com']){
   assert.equal((await post(app,'/api/travel-session',credentials,badOrigin)).status,403);
   assert.equal((await post(app,'/api/route',{},badOrigin)).status,403);
  }
  const cookie=await signIn(app);
  const created=await post(app,'/api/trips',{name:'Render fixture',destination:'Seoul',placeId:'fixture-place',
    zone:'Asia/Seoul',date:'2026-11-22',time:'09:00',stops:[]},origin,cookie);
  assert.equal(created.status,201);saved=await created.json();
  assert.equal((await fetch(app.url)).status,200);
  for(const url of ['/.env.production','/.travel-link/travel.sqlite','/profile.key','/backups/render-v1/travel.sqlite'])
   assert.equal((await fetch(app.url+url)).status,404);
  const logout=await post(app,'/api/travel-session',{action:'logout'},origin,cookie);
  assert.match(logout.headers.get('set-cookie'),/Max-Age=0; Secure$/);
 }finally{await stop(app.server);}
 const restarted=await start();
 try{
  const cookie=await signIn(restarted);
  const trip=await fetch(restarted.url+'/api/trips/'+saved.id,{headers:{Cookie:cookie}});
  assert.equal(trip.status,200);assert.deepEqual(await trip.json(),saved);
 }finally{await stop(restarted.server);}
 const copied=join(root,'backup');
 const worker=spawn(process.execPath,['scripts/backup-travel.mjs',copied],{env,stdio:'ignore',windowsHide:true});
 assert.deepEqual(await once(worker,'exit'),[0,null]);
 assert.deepEqual(await readFile(join(copied,'profile.key')),await readFile(join(root,'profile.key')));
 const migrated=await start(copied);
 try{
  const cookie=await signIn(migrated);
  const trip=await fetch(migrated.url+'/api/trips/'+saved.id,{headers:{Cookie:cookie}});
  assert.equal(trip.status,200);assert.deepEqual(await trip.json(),saved);
 }finally{await stop(migrated.server);}
});
