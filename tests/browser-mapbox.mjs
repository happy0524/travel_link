import assert from 'node:assert/strict';
import {mockGoogle} from './google-fixture.mjs';
import {mockMapbox} from './mapbox-fixture.mjs';
import {backToList} from './ui-helpers.mjs';
export async function verifyMapbox(browser,base){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const requests=await mockGoogle(page,{mapboxToken:'pk.fixture.public'}),loads=await mockMapbox(page);
 await page.route('**/src/app.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__mapboxTestState=()=>({renderer:mapboxRenderer,result});'});});
 const settled=()=>page.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
 const choose=async name=>{await page.locator('#service').click();await page.locator('#choose-'+name).click();};
 const ready=()=>page.waitForFunction(()=>document.querySelectorAll('.mapbox-visit').length===4);
 try{
  await page.goto(base);await settled();assert.equal(loads.length,0);
  await page.locator('#date').fill('2026-12-10');await page.locator('#time').fill('10:30');await page.locator('#time').press('Tab');await settled();
  await page.locator('.visit').nth(1).click();
  const ids=await page.locator('.visit').evaluateAll(es=>es.map(e=>e.dataset.visit)),selected=await page.locator('.visit.selected').getAttribute('data-visit');
  const header=await page.locator('header').boundingBox(),panel=await page.locator('.itinerary').boundingBox();
  await choose('mapbox');await ready();
  assert.deepEqual(await page.locator('header').boundingBox(),header);assert.deepEqual(await page.locator('.itinerary').boundingBox(),panel);
  assert.equal(await page.locator('#date').inputValue(),'2026-12-10');assert.equal(await page.locator('#time').inputValue(),'10:30');
  assert.equal(await page.locator('.mapbox-visit.selected').getAttribute('data-node'),selected);
  assert.equal(await page.locator('.mapbox-visit.selected').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(23, 63, 50)');
  assert.equal(await page.evaluate(()=>window.__mapboxFixture.getPaintProperty('land','background-color')),'#CBD5CC');
  assert.equal(await page.evaluate(()=>window.__mapboxFixture.getSource('travel-link-itinerary')===undefined),true);
  assert.equal(requests.length,0);assert.ok(await page.locator('#search').isDisabled());
  await choose('mapbox');assert.equal(await page.evaluate(()=>window.__mapboxStats.maps),1);
  await page.evaluate(()=>{
   const s=window.__mapboxTestState();window.__originalTestRoutes=s.result.routes;
   s.result.routes={fixture:{status:'ok',source:'mapbox',geometry:{type:'LineString',coordinates:[[126.97,37.56],[126.98,37.57]]}}};
   s.renderer.renderRoutes(s.result.routes);
  });
  const camera=await page.evaluate(()=>window.__mapboxFixture.camera);await page.evaluate(()=>window.__mapboxFixture.reloadStyle());
  await page.waitForFunction(()=>window.__mapboxFixture.getSource('travel-link-itinerary')?.data.features.length===1);
  assert.equal(await page.evaluate(()=>window.__mapboxFixture.handlers.click.size),2);
  await page.evaluate(()=>{const s=window.__mapboxTestState();s.result.routes=window.__originalTestRoutes;s.renderer.renderRoutes(s.result.routes);});
  assert.deepEqual(await page.evaluate(()=>window.__mapboxFixture.camera),camera);assert.equal(await page.locator('.mapbox-visit').count(),4);
  assert.equal(await page.evaluate(()=>window.__mapboxFixture.getPaintProperty('land','background-color')),'#CBD5CC');
  await page.locator('.mapbox-visit').first().click();assert.equal(await page.locator('.visit.selected').getAttribute('data-visit'),ids[0]);await backToList(page);
  await choose('google');await page.waitForFunction(()=>document.querySelector('#source-badge').textContent==='GOOGLE / LIVE');
  assert.deepEqual(await page.locator('.visit').evaluateAll(es=>es.map(e=>e.dataset.visit)),ids);
  assert.equal(await page.locator('.visit.selected').getAttribute('data-visit'),ids[0]);
  assert.equal(await page.evaluate(()=>window.__googleStats.maps),1);assert.equal(await page.evaluate(()=>window.__mapboxStats.removes),1);
  assert.ok(await page.locator('#search').isEnabled());
  await choose('mapbox');await ready();await choose('google');
  assert.equal(await page.evaluate(()=>window.__googleStats.maps),1);
  // Search and route behavior after the restored renderer switch remains Google.
  while(await page.locator('[data-remove]').count())await page.locator('[data-remove]').first().click();await settled();
  for(const n of [1,2]){
   await page.locator('#search').fill('original');await page.locator('#search-form').evaluate(e=>e.requestSubmit());
   await page.locator(`[data-result="ChIJ-stable-${n}"]`).click();await page.locator('#add').click();await settled();await backToList(page);
  }
  assert.equal(await page.locator('#google-map .map-edge').count(),1);
  await choose('mapbox');await page.waitForFunction(()=>window.__mapboxFixture&&document.querySelector('#source-badge').textContent==='MAPBOX');
  assert.equal(await page.locator('.mapbox-visit').count(),0);assert.equal(await page.locator('.visit').count(),2);
  assert.match(await page.locator('.visit').first().innerText(),/Google 장소/);
  await page.reload();await ready();assert.equal(await page.evaluate(()=>window.__googleStats.maps),0);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  assert.deepEqual(errors,[]);
  console.log('PASS Mapbox: unchanged layout, state/selection/date/bounds, lazy loading, reuse/cleanup, style reload, Google search/routes unchanged, provenance and mobile');
 }finally{await page.close();}
 for(const mode of ['missing','auth']){
  const p=await browser.newPage();
  try{
   await mockGoogle(p,{mapboxToken:mode==='auth'?'pk.fixture.public':''});
   const loads=await mockMapbox(p,{fail:mode==='auth'});
   await p.goto(base);await p.locator('#service').click();await p.locator('#choose-mapbox').click();
   await p.locator('#mapbox-error').waitFor({state:'visible'});
   assert.equal(await p.locator('.visit').count(),4);
   if(mode==='missing')assert.equal(loads.length,0);
   await p.locator('#mapbox-return').click();
   await p.waitForFunction(()=>document.querySelector('#source-badge').textContent==='GOOGLE / LIVE');
   assert.equal(await p.locator('.visit').count(),4);
  }finally{await p.close();}
 }
 console.log('PASS Mapbox missing token/auth failure: visible recovery, preserved itinerary, Google return');
}
