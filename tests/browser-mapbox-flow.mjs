import assert from 'node:assert/strict';
import {mockGoogle} from './google-fixture.mjs';
import {mockMapbox} from './mapbox-fixture.mjs';
export async function verifyMapboxFlow(browser,base){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await mockGoogle(page,{mapboxToken:'pk.fixture.public'});await mockMapbox(page);
 await page.route('**/directions/v5/**',async route=>{
  const url=new URL(route.request().url());requests.push(url.pathname);
  const points=url.pathname.split('/').at(-1).split(';').map(p=>p.split(',').map(Number));
  const [a,b]=points;
  await route.fulfill({json:{code:'Ok',routes:[{duration:125,distance:610,geometry:{type:'LineString',coordinates:[a,[(a[0]+b[0])/2,(a[1]+b[1])/2],b]}}]}});
 });
 const choose=async name=>{await page.locator('#service').click();await page.locator('#choose-'+name).click();};
 try{
  await page.goto(base);await choose('mapbox');
  await page.waitForFunction(()=>window.__mapboxFixture?.getSource('travel-link-itinerary')?.data.features.length===3);
  assert.equal(requests.length,3);
  const map=()=>page.evaluate(()=>window.__mapboxStats.maps);
  const initial=await map();
  const before=await page.evaluate(()=>window.__mapboxFixture.getPaintProperty('travel-link-route-flow','line-dasharray'));
  await page.waitForTimeout(180);assert.notDeepEqual(await page.evaluate(()=>window.__mapboxFixture.getPaintProperty('travel-link-route-flow','line-dasharray')),before);
  await page.locator('.mapbox-visit').first().click();assert.match(await page.locator('#details h2').innerText(),/엠파이어/);await page.locator('#close-details').click();
  await page.locator('.segment').first().click();await page.locator('#edge-settings [data-mode="DRIVE"]').click();
  await page.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
  assert.equal(requests.length,4);assert.ok(requests.at(-1).includes('/driving/'));await page.locator('#close-edge').click();
  await page.evaluate(()=>window.__mapboxFixture.reloadStyle());
  await page.waitForFunction(()=>window.__mapboxFixture.getSource('travel-link-itinerary')?.data.features.length===3);
  assert.equal(await map(),initial);assert.equal(requests.length,4);
  await page.evaluate(()=>{const m=window.__mapboxFixture;m.poiFeature={id:19,properties:{name:'Fixture POI',maki:'cafe'},geometry:{type:'Point',coordinates:[-73.98,40.75]}};m.emit('click',{point:{x:400,y:300}});});
  assert.equal(await page.locator('#details h2').innerText(),'Fixture POI');assert.equal(await page.locator('#add').count(),0);await page.locator('#close-details').click();
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
  const paused=await page.evaluate(()=>window.__mapboxFixture.getPaintProperty('travel-link-route-flow','line-dasharray'));
  await page.waitForTimeout(180);assert.deepEqual(await page.evaluate(()=>window.__mapboxFixture.getPaintProperty('travel-link-route-flow','line-dasharray')),paused);
  const ids=await page.locator('.visit').evaluateAll(es=>es.map(e=>e.dataset.visit));
  await choose('google');await page.waitForFunction(()=>document.querySelector('#source-badge').textContent==='GOOGLE / LIVE');
  assert.deepEqual(await page.locator('.visit').evaluateAll(es=>es.map(e=>e.dataset.visit)),ids);assert.equal(await page.evaluate(()=>window.__mapboxStats.removes),1);
  assert.deepEqual(errors,[]);console.log('PASS Mapbox flow: actual API contract mock, mode switch/cache, animated paint, style reload, pin/POI info, reduced motion, preserved Google switch');
 }finally{await page.close();}
}
