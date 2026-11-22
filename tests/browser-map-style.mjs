import {backToList,connectGoogle} from './ui-helpers.mjs';
import assert from 'node:assert/strict';
import {mockGoogle} from './google-fixture.mjs';
export async function verifyMapStyle(browser,baseURL){
 for(const mapId of ['', 'test-map-id']){
  const page=await browser.newPage({viewport:{width:1440,height:1200}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const calls=await mockGoogle(page,{mapId});
  const settled=()=>page.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
  try{
   await page.goto(baseURL);await settled();
   if(!mapId){await page.screenshot({path:'test-results/ink-demo-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/ink-demo-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1200});}
   await connectGoogle(page);await settled();
   const options=await page.evaluate(()=>window.__googleFixtureMap.options);
   assert.equal(options.mapTypeId,'roadmap');assert.equal('styles' in options,!mapId);assert.equal('mapId' in options,!!mapId);
   if(mapId)assert.equal(options.mapId,mapId);else assert.ok(options.styles.some(s=>s.stylers.some(x=>x.color==='#C8D4CB')));
   for(let n=1;n<=3;n++){
    await page.locator('#search').fill('original');await page.locator('#search-form').evaluate(e=>e.requestSubmit());
    await page.locator('[data-result="ChIJ-stable-'+n+'"]').click();await page.locator('#add').click();await settled();await backToList(page);
   }
   const before=calls.length;
   const texture=await page.locator('.map-area').evaluate(e=>{const s=getComputedStyle(e,'::after');return {image:s.backgroundImage,pointer:s.pointerEvents,opacity:s.opacity,animation:s.animationName,bottom:s.bottom,right:s.right};});
   assert.equal(texture.pointer,'none');
   assert.equal(await page.locator('.map-area').evaluate(e=>getComputedStyle(e,'::after').content),'none');
   const original=await page.locator('#google-map .map-edge').first().getAttribute('d');
   const ids=await page.locator('.visit').evaluateAll(cards=>cards.map(c=>c.dataset.visit));
   for(const id of ids)await page.locator('[data-node="'+id+'"]').dispatchEvent('click');
   assert.equal(await page.locator('#google-map .map-edge').first().getAttribute('d'),original);
   await backToList(page);
   await page.locator('#google-map .edge-hit').first().dispatchEvent('click');assert.equal(await page.locator('#edge-settings').isVisible(),true);
   await page.locator('#close-edge').click();
   for(const zoom of [13,14,15]){
    await page.evaluate(z=>window.__googleFixtureMap.setZoom(z),zoom);
    const style=await page.locator('#google-map .map-edge').first().evaluate(e=>({stroke:getComputedStyle(e).stroke,dash:getComputedStyle(e).strokeDasharray,width:getComputedStyle(e).strokeWidth}));
    assert.equal(style.stroke,'rgb(37, 141, 218)');assert.equal(style.dash,'none');assert.equal(style.width,'5px');
    assert.equal(await page.locator('#google-map .map-node circle').first().getAttribute('fill'),'#164F3B');
    assert.ok(await page.locator('#google-map .arrow-white').first().getAttribute('d'));
   }
   await page.evaluate(()=>window.__googleFixtureMap.setZoom(14));
   assert.equal(await page.locator('#google-map .map-edge').first().getAttribute('d'),original);
   for(const [name,width,height] of [['desktop',1440,1200],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    const legal=await page.locator('[data-fixture-attribution]').boundingBox(),controls=await page.locator('.map-tools').boundingBox();
    assert.ok(controls.y+controls.height<=legal.y);
    // Dismiss transient toast for unobstructed review screenshots.
    await page.locator('#notice').evaluate(e=>e.style.display='none');
    assert.equal(await page.locator('.map-area').evaluate(e=>getComputedStyle(e,'::after').backgroundImage),texture.image);
    await page.screenshot({path:'test-results/ink-live-'+(mapId?'cloud-mock':'fallback')+'-'+name+'.png',fullPage:true});
   }
   assert.equal(calls.length,before);assert.deepEqual(errors,[]);
   console.log('PASS ink map '+(mapId?'cloud Map ID':'embedded fallback')+': stable blue routes, irregular nodes/arrows, clear map surface, hit path, zoom, legal area, desktop/mobile; extra routes=0');
  }finally{await page.close();}
 }
}
