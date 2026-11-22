import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('first-letter search, places, photo redirect and durable site stop via real HTTP with mocked upstream',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'travel-link-pilot-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const env={...process.env,RENDER:'false',PORT:'0',TRAVEL_LINK_DATA_DIR:directory,
  GOOGLE_PLACES_SERVER_KEY:'fixture-places-key',GOOGLE_MAPS_SERVER_KEY:'fixture-maps-key',GOOGLE_PLACES_SEARCH_MONTHLY_LIMIT:'4'};
 async function start(){
  const child=spawn(process.execPath,['--import','./tests/server-fixture.mjs','server.mjs'],
   {env,stdio:['ignore','pipe','inherit'],windowsHide:true});
  const [data]=await once(child.stdout,'data',{signal:AbortSignal.timeout(10000)});
  const port=String(data).match(/localhost:(\d+)/)?.[1];assert.ok(port);
  return {child,base:'http://localhost:'+port};
 }
 async function stop(app){const exited=once(app.child,'exit');app.child.kill();await exited;}
 function post(app,path,body,cookie=''){
  return fetch(app.base+path,{method:'POST',headers:{Origin:app.base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 }
 async function command(action,override={}){
  const child=spawn(process.execPath,['scripts/service-state.mjs',action],{env:{...env,...override},stdio:'ignore',windowsHide:true});
  assert.deepEqual(await once(child,'exit'),[0,null]);
 }
 let app=await start();
 let traveler;
 try{
  const config=await fetch(app.base+'/api/config');
  assert.doesNotMatch(await config.text(),/fixture-places-key|fixture-maps-key/);
  const session=config.headers.get('set-cookie').split(';')[0];
  const search={query:'Seoul'};
  assert.equal((await post(app,'/api/places/destination',search)).status,401);
  const destination=await post(app,'/api/places/destination',search,session);
  assert.equal(destination.status,200);
  assert.deepEqual((await destination.json()).places[0].location,{latitude:37.5,longitude:127});
  assert.equal((await post(app,'/api/places/search',search,session)).status,401);
  const auth=await post(app,'/api/travel-session',{action:'enter-profile',name:'Fixture traveler',number:'007',allowCreate:true});
  traveler=auth.headers.get('set-cookie').split(';')[0];
  const created=await post(app,'/api/trips',{name:'Fixture traveler',destination:'Seoul',date:'2026-11-22',time:'09:00',
   zone:'Asia/Seoul',placeId:'fixture-place',stops:[]},traveler);
  assert.equal(created.status,201);
  const restoration=await post(app,'/api/places/restore',{id:'fixture-place'},traveler);
  const restored=await restoration.json();
  assert.equal(restored.place.displayName.text,'Fixture place');
  assert.equal(restored.place.photo,undefined);
  const candidate=await post(app,'/api/places/candidates',{query:'Fixture place',
   place:{name:'Fixture place',lat:37.5,lng:127},rematch:true},traveler);
  assert.deepEqual(await candidate.json(),{candidates:[{id:'fixture-place'}]});
  const detail=await post(app,'/api/places/details',{id:'fixture-place'},traveler);
  const {photo}= (await detail.json()).place;
  assert.equal(photo.attribution[0].displayName,'Test photographer');
  const image=await fetch(app.base+photo.url,{headers:{Cookie:traveler},redirect:'manual'});
  assert.equal(image.status,302);
  assert.equal(image.headers.get('location'),'https://lh3.googleusercontent.com/test');
  assert.equal((await fetch(app.base+photo.url+'altered',{headers:{Cookie:traveler},redirect:'manual'})).status,404);
  const requests=await Promise.all(['One','Two','Three'].map(query=>post(app,'/api/places/search',{query},traveler)));
  assert.deepEqual(requests.map(r=>r.status).sort(),[200,200,503]);
  const status=await fetch(app.base+'/api/service-status');
  assert.equal((await status.json()).code,'API_SITE_STOPPED');
  assert.match(await fetch(app.base).then(r=>r.text()),/temporarily paused/);
  assert.equal((await fetch(app.base+'/api/trips',{headers:{Cookie:traveler}})).status,503);
 }finally{await stop(app);}
 app=await start();
 try{
  assert.equal((await fetch(app.base+'/api/service-status')).status,503);
  await command('resume');
  assert.equal((await fetch(app.base+'/api/service-status')).status,200);
  const list=await fetch(app.base+'/api/trips',{headers:{Cookie:traveler}}).then(r=>r.json());
  assert.equal(list.trips.length,1);assert.equal(list.trips[0].destination,'Seoul');
  await command('pause');
  assert.equal((await fetch(app.base+'/api/config')).status,503);
 }finally{await stop(app);}
});
