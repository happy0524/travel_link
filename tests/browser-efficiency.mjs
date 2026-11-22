import {backToList,connectGoogle} from './ui-helpers.mjs';
import assert from 'node:assert/strict';
import {mockGoogle} from './google-fixture.mjs';

export async function measureRequests(browser,baseURL,{verify=true}={}){
 const page=await browser.newPage({viewport:{width:1440,height:1200}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const calls=await mockGoogle(page);
 const settled=()=>page.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
 const counts=async()=>{const stats=await page.evaluate(()=>window.__googleStats);return {routes:calls.length,searches:stats.searches,details:stats.details,timezones:calls.timezones.length,maps:stats.maps};};
 const delta=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,b[k]-a[k]]));
 const search=async()=>{await page.locator('#search').fill('four');await page.locator('#search-form').evaluate(e=>e.requestSubmit());await page.locator('[data-result]').first().waitFor();};
 const inspect=async n=>{await page.locator('[data-result="ChIJ-stable-'+n+'"]').click();await page.locator('#add').waitFor();};
 const start=async()=>{await page.goto(baseURL);await settled();await connectGoogle(page);await settled();};
 const modes=async mode=>{for(let i=0;i<3;i++){await page.locator('.segment').nth(i).click();await page.locator('[data-mode="'+mode+'"]').click();await settled();await page.locator('#close-edge').click();}};
 const output={};
 try{
   await start();
   const initial=await counts();
   for(let n=1;n<=4;n++){await search();await inspect(n);await page.locator('#add').click();await settled();await backToList(page);}
   output.buildFour=delta(initial,await counts());
   let before=await counts();
   for(const id of await page.locator('.visit').evaluateAll(es=>es.map(e=>e.dataset.visit))){
     await page.locator('[data-visit="'+id+'"]').click();await backToList(page);
     await page.locator('[data-node="'+id+'"]').dispatchEvent('click');await backToList(page);
   }
   await page.locator('.segment').first().click();await page.locator('#close-edge').click();
   await page.locator('#zoom-in').click();await page.locator('#zoom-out').click();
   await page.evaluate(()=>window.__googleFixtureMap.panTo({lat:37.6,lng:127}));
   await page.setViewportSize({width:1300,height:1100});
   output.A=delta(before,await counts());
   await modes('WALK');before=await counts();
   await page.locator('.visit').last().dragTo(page.locator('.visit').first(),{sourcePosition:{x:22,y:27},targetPosition:{x:100,y:30}});await settled();
   output.B=delta(before,await counts());
   await modes('TRANSIT');before=await counts();
   const expected=await page.locator('.visit').first().getAttribute('data-visit');
   for(const time of ['10:01','10:02','10:03','10:04']){
     await page.locator('#time').evaluate((e,value)=>{e.value=value;e.dispatchEvent(new Event('change'));},time);
     await page.waitForTimeout(25);
   }
   await settled();output.C=delta(before,await counts());
   assert.equal(await page.locator('.visit').first().getAttribute('data-visit'),expected);
   assert.match(await page.locator('.visit').first().locator('.times').innerText(),/10:04/);
   assert.equal(await page.locator('#notice').filter({hasText:'일정 계산 중 오류'}).count(),0);
   await page.waitForTimeout(200);assert.match(await page.locator('.visit').first().locator('.times').innerText(),/10:04/);
   // A new live session, repeatedly inspecting one place before adding it.
   await start();before=await counts();
   for(let n=0;n<3;n++){await search();await inspect(1);if(n<2)await backToList(page);}
   await page.locator('#add').click();await settled();
   await backToList(page);
   for(let n=0;n<3;n++){
     await page.locator('.visit').first().click();
     await page.evaluate(()=>window.__googleFixtureMap.listeners.click({placeId:'ChIJ-stable-1',stop(){}}));
     await page.locator('.visit.selected [data-details]').click();
     await page.locator('#add').click();
   }
   assert.equal(await page.locator('.visit').count(),1);
   output.D=delta(before,await counts());
   assert.deepEqual(errors,[]);
   if(verify){
     assert.deepEqual(output.A,{routes:0,searches:0,details:0,timezones:0,maps:0});
     assert.equal(output.buildFour.routes,3);assert.equal(output.buildFour.timezones,4);
     assert.equal(output.B.routes,1);assert.equal(output.C.routes,3);
     assert.deepEqual(output.D,{routes:0,searches:1,details:1,timezones:1,maps:0});
     console.log('PASS request counts: UI/map/resize=0, reorder=1, rapid edits=3, repeated place=1 search/1 detail/1 timezone');
   }
   return output;
 }finally{await page.close();}
}

export async function verifyLiveFailures(browser,baseURL){
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mockGoogle(page);
 const settled=()=>page.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
 const search=async n=>{
   await page.locator('#search').fill('four');await page.locator('#search-form').evaluate(e=>e.requestSubmit());
   await page.locator('[data-result="ChIJ-stable-'+n+'"]').click();
 };
 try{
   await page.goto(baseURL);await settled();await connectGoogle(page);await settled();
   await search(1);await page.locator('#add').click();await settled();await backToList(page);
   await page.route('**/api/timezone?*',r=>r.fulfill({status:502,json:{message:'fixture failure'}}));
   await search(2);await page.locator('#notice').filter({hasText:'시간대를 확인하지 못해'}).waitFor();
   assert.equal(await page.locator('#add').isVisible(),false);assert.equal(await page.locator('.visit').count(),1);
   await page.route('**/api/timezone?*',r=>r.fulfill({json:{zone:'Asia/Tokyo'}}));
   await search(2);await page.locator('#add').click();assert.equal(await page.locator('.visit').count(),1);
   await page.locator('#notice').filter({hasText:'다른 시간대'}).waitFor();await backToList(page);
   await page.route('**/api/timezone?*',r=>r.fulfill({json:{zone:'Asia/Seoul'}}));
   // New place avoids reusing the deliberately confirmed Tokyo fixture zone.
   await search(3);await page.locator('#add').click();await settled();await backToList(page);
   let started;const firstStarted=new Promise(r=>started=r);
   await page.route('**/api/route',async r=>{
     const old=r.request().postDataJSON().departure.includes('01:10:00');
     if(old)started();
     await new Promise(resolve=>setTimeout(resolve,old?700:25));
     await r.fulfill({json:{status:'ok',minutes:old?99:10,source:'live'}}).catch(()=>{});
   });
   await page.locator('#time').evaluate(e=>{e.value='10:10';e.dispatchEvent(new Event('change'));});
   await firstStarted;
   await page.locator('#time').evaluate(e=>{e.value='10:11';e.dispatchEvent(new Event('change'));});
   await settled();await page.waitForTimeout(750);
   assert.equal(await page.locator('[data-metric="travel"]').innerText(),'10분');
   assert.match(await page.locator('.visit').first().locator('.times').innerText(),/10:11/);
   assert.ok(!await page.locator('.segment').filter({hasText:'경로 확인 필요'}).count());
   const monitor=await page.evaluate(()=>window.travelLinkRequests.snapshot());
   assert.ok(monitor.counts['route:aborted']>=1);assert.deepEqual(errors,[]);
   console.log('PASS live fixture: timezone failure/mismatch blocked; overlapping route cancelled without failure or stale overwrite');
 }finally{await page.close();}
}
