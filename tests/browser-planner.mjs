import assert from 'node:assert/strict';
export async function verifyPlanner(browser,base){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const settled=()=>page.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
 try{
  await page.goto(base);await settled();
  const panel=await page.locator('.itinerary').boundingBox(),map=await page.locator('.map-area').boundingBox();
  assert.equal(panel.x,0);assert.equal(panel.width,360);assert.equal(map.x,360);assert.equal(map.height,936);
  assert.equal((await page.locator('header').boundingBox()).height,64);
  const search=await page.locator('#search-form').boundingBox();assert.ok(Math.abs(search.x+search.width/2-map.x-map.width/2)<1);
  const style=await page.locator('.visit').last().evaluate(e=>({border:getComputedStyle(e).borderWidth,shadow:getComputedStyle(e).boxShadow,name:parseFloat(getComputedStyle(e.querySelector('h3')).fontSize),control:parseFloat(getComputedStyle(e.querySelector('button')).fontSize)}));
  assert.equal(style.border,'0px');assert.equal(style.shadow,'none');assert.ok(style.name>style.control);
  assert.equal(await page.locator('#visits').evaluate(e=>getComputedStyle(e,'::before').width),'1px');
  assert.equal(await page.locator('.visit-info:visible').count(),1);
  assert.equal(await page.locator('.map-heading,.map-legend').count(),0);
  await page.locator('.visit').nth(1).click();assert.equal(await page.locator('.visit-info:visible').count(),1);
  await page.locator('.visit.selected [data-stay]').fill('25');await page.locator('.visit.selected [data-stay]').press('Tab');await settled();
  assert.match(await page.locator('.visit.selected .visit-category').innerText(),/25분/);
  await page.locator('.visit.selected [data-details]').click();assert.ok(await page.locator('.itinerary #details').isVisible());
  assert.equal(await page.locator('.place-art,.place-photo').count(),0);
  assert.ok(await page.locator('#add').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.locator('#close-details').click();
  const mapY=(await page.locator('.map-area').boundingBox()).y;
  await page.locator('.itinerary').evaluate(e=>e.scrollTop=e.scrollHeight);
  assert.equal((await page.locator('.map-area').boundingBox()).y,mapY);assert.equal(await page.evaluate(()=>scrollY),0);
  await page.locator('.itinerary').evaluate(e=>e.scrollTop=0);
  await page.screenshot({path:'test-results/planner-desktop-verified.png'});
  for(const width of [1024,760,390,320]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>scrollTo(0,0));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
   await page.locator('#search').fill('');await page.locator('#search').focus();
   const results=await page.locator('#results').boundingBox(),area=await page.locator('.map-area').boundingBox();
   assert.ok(results.y+results.height<=area.y+area.height+1,'clipped results at '+width);
   await page.locator('#search').fill('청계천');await page.locator('[data-result]').first().click();
   assert.ok(await page.locator('#details').isVisible());assert.ok(await page.locator('#add').evaluate(e=>e.scrollWidth<=e.clientWidth));
   await page.screenshot({path:`test-results/planner-details-${width}.png`,fullPage:width<=760});
   await page.locator('#close-details').click();
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`test-results/planner-${width}.png`,fullPage:width<=760});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS planner UI: 360px left timeline / wide map, name hierarchy, single expanded editor, inline details, independent scroll, responsive search/controls, 320–1440px without clipping');
 }finally{await page.close();}
}
