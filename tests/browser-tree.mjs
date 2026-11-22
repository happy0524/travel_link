import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mockGoogle} from './google-fixture.mjs';
import {mockMapbox} from './mapbox-fixture.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const b=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await b.newPage({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul',locale:'ko-KR'}),errors=[],searchCalls=[];
 p.on('pageerror',e=>errors.push(e.message));const googleCalls=await mockGoogle(p,{mapboxToken:'pk.fixture.public',uiKit:true,zone:'America/New_York'});await mockMapbox(p);
 // Load an independent four-stop fixture to exercise planner actions outside the arrival flow.
 const loadPlannerFixture=async route=>{
  const response=await route.fetch();
  const source=(await response.text()).replace('onboarding.open();',`
   document.body.classList.remove('arrival-screen');
   import('./new-york.js').then(({places,samplePlaceIds})=>{
    visits=samplePlaceIds.map(id=>({id:crypto.randomUUID(),place:{...places.find(place=>place.id===id)},stay:60,wait:false}));
    refresh('provider');
   });
  `);
  await route.fulfill({response,body:source});
 };
 await p.route('**/src/app.js',loadPlannerFixture);
 const setInput=(id,value)=>p.locator(id).evaluate((input,value)=>{
   input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
 },value);
 await p.addInitScript(()=>{
   localStorage.setItem('travel-link.map-bounds',JSON.stringify([[-74,40.74],[-73.96,40.8]]));
   if(!localStorage.getItem('travel-link.map-provider'))localStorage.setItem('travel-link.map-provider','demo');
 });
 await p.route('**/directions/v5/**',route=>{const coords=new URL(route.request().url()).pathname.split('/').at(-1).split(';').map(v=>v.split(',').map(Number));return route.fulfill({json:{code:'Ok',routes:[{duration:120,distance:450,geometry:{type:'LineString',coordinates:coords}}]}});});
 let failure=0;
 await p.route('**/search/searchbox/v1/**',route=>{
  const u=new URL(route.request().url());searchCalls.push({path:u.pathname,session:u.searchParams.get('session_token'),language:u.searchParams.get('language')});
  if(failure)return route.fulfill({status:failure,json:{message:'fixture failure'}});
  const q=u.searchParams.get('q');return route.fulfill({json:q!==null?{suggestions:q==='empty'?[]:[{mapbox_id:q,name:q,feature_type:'poi',full_address:'New York'}]}:{features:[{geometry:{type:'Point',coordinates:[-73.981,40.765]},properties:{mapbox_id:decodeURIComponent(u.pathname.split('/').at(-1)),name:decodeURIComponent(u.pathname.split('/').at(-1)),full_address:'New York',poi_category:['park']}}]}});
 });
 await p.goto(base);await p.waitForFunction(()=>document.querySelectorAll('.mapbox-visit').length===4);
 const assertTimeline=async()=>assert.ok(await p.locator('#visits').evaluate(node=>{
   const children=[...node.children],stops=children.filter(el=>el.matches('.visit'));
   return children.length===stops.length*3-2&&stops.every((stop,index)=>{
     const divider=children[index*3-2];
     return children[index*3]===stop&&getComputedStyle(stop,'::after').content==='none'&&
       (!index||divider.matches('.visit-divider')&&children[index*3-1].matches('.segment')&&
         getComputedStyle(divider).rowGap==='5px'&&['::before','::after'].every(side=>getComputedStyle(divider,side).content==='""'));
   });
 }));
 await assertTimeline();
 assert.equal(await p.locator('html').getAttribute('lang'),'en');
 assert.equal(await p.evaluate(()=>localStorage.getItem('travel-link.map-provider')),'mapbox');
 assert.equal(await p.locator('#map, #choose-demo').count(),0);
 assert.equal(await p.locator('.itinerary-heading h2').innerText(),'My itinerary 4 stops');
 assert.deepEqual(await p.locator('.visit h3').allTextContents(),['Grand Central Terminal','Empire State Building','Times Square','Solomon R. Guggenheim Museum']);
 assert.deepEqual(await p.locator('[data-stay]').evaluateAll(inputs=>inputs.map(e=>e.value)),['60','60','60','60']);
 assert.equal(await p.locator('[data-metric=stay]').innerText(),'4 hr');
 assert.equal(await p.locator('[data-metric=stay]').getAttribute('data-value'),'240');
 assert.equal(await p.evaluate(()=>window.__mapboxFixture.options.projection),'globe');
 assert.deepEqual(await p.evaluate(()=>window.__mapboxFixture.getFog()['star-intensity']),['interpolate',['linear'],['zoom'],2,0.5,5,0.22,6,0]);
 assert.equal(await p.evaluate(()=>window.__mapboxFixture.options.language),'en');
 assert.equal(await p.evaluate(()=>window.__mapboxFixture.options.bounds),undefined);
 await p.locator('#fit').click();assert.equal(await p.evaluate(()=>window.__mapboxFixture.getZoom()),13);
 await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.mapbox-visit').length===4);
 assert.ok(await p.evaluate(()=>window.__mapboxFixture.getZoom()<3));
 assert.equal(await p.locator('.visit.selected,.mapbox-visit.selected,.visit-details').count(),0);
 await p.locator('.visit h3').first().click();
 await p.locator('.visit-details').first().click();
 await p.waitForFunction(()=>document.querySelector('.google-details #add'));
 for(const width of [1440,390,320]){
  await p.setViewportSize({width,height:844});
  const panel=await p.locator('#place-panel').boundingBox(),tools=await p.locator('.map-tools').boundingBox();
  assert.ok(tools.x>=panel.x+panel.width&&tools.x+tools.width<=width);
  assert.ok(Math.abs(tools.y+tools.height-panel.y-panel.height)<=12);
 }
 await p.setViewportSize({width:1440,height:1000});
 assert.equal(await p.evaluate(()=>window.__googleStats.searches),0);
 assert.equal(await p.locator('gmp-place-details [data-language]').getAttribute('data-language'),'en');
 assert.equal(await p.locator('.google-candidate').count(),0);assert.equal(await p.locator('#details > .details-body').count(),0);
 assert.doesNotMatch(await p.locator('#details').innerText(),/sample itinerary|Opening hours unavailable|Select this Google place/);
 assert.ok(await p.locator('#itinerary-content').isVisible());assert.equal(await p.locator('gmp-place-details gmp-place-attribution').count(),1);
 await p.getByRole('button',{name:'Change linked place'}).click();
 const candidate=p.locator('.google-candidate').filter({hasText:'fixture-terminal'});await candidate.locator('button').click();
 assert.equal(await p.evaluate(()=>window.__googleStats.searchLanguage),'en');
 await p.locator('.google-details #add').waitFor();
 assert.match(await p.locator('gmp-place-details').innerText(),/fixture-terminal/);
 assert.equal(await p.evaluate(()=>localStorage.getItem('travel-link.google-place:grand-central')),'fixture-terminal');
 await p.locator('#close-details').click();
 await p.locator('.visit-details').first().click();await p.locator('.google-details #add').waitFor();
 assert.equal(await p.locator('.google-candidate').count(),0);await p.locator('#close-details').click();
 const settle=()=>p.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
 await p.locator('[data-stay]').first().fill('75');await settle();assert.equal(await p.locator('[data-metric=stay]').innerText(),'4 hr 15 min');
 const firstId=await p.locator('.visit').first().getAttribute('data-visit');
 await p.locator(`[data-move="${firstId}"][data-delta="1"]`).click();await settle();
 await assertTimeline();
 assert.equal(await p.locator(`.mapbox-visit[data-node="${firstId}"]`).innerText(),'2');
 assert.equal(await p.locator(`[data-stay="${firstId}"]`).inputValue(),'75');
 assert.equal(await p.evaluate(()=>window.__mapboxFixture.getSource('travel-link-itinerary').data.features.length),3);
 await setInput('#time','23:50');await settle();assert.match(await p.locator('[data-metric=end]').innerText(),/Next day/);
 await p.locator(`[data-move="${firstId}"][data-delta="-1"]`).click();await settle();
 await setInput('#date','2028-02-28');
 await p.locator('#open-date').click();await p.keyboard.press('ArrowRight');await p.keyboard.press('Enter');
 assert.equal(await p.locator('#date').inputValue(),'2028-02-29');
 assert.equal(await p.evaluate(()=>document.activeElement.id),'open-date');
 await setInput('#date','2027-12-31');
 await p.locator('#open-date').click();await p.keyboard.press('ArrowRight');await p.keyboard.press('Enter');
 assert.equal(await p.locator('#date').inputValue(),'2028-01-01');
 await p.locator('#open-time').click();
 await p.locator('#time-popover [role=group]').nth(0).getByRole('button',{name:'AM',exact:true}).click();
 await p.locator('#time-popover [role=group]').nth(1).getByRole('button',{name:'12',exact:true}).click();
 await p.locator('#time-popover [role=group]').nth(2).getByRole('button',{name:'37',exact:true}).click();
 await p.locator('.schedule-apply').click();
 assert.equal(await p.locator('#time').inputValue(),'00:37');
 await p.locator('#open-time').click();
 await p.locator('#time-popover [role=group]').nth(0).getByRole('button',{name:'PM',exact:true}).click();
 await p.locator('.schedule-apply').click();
 assert.equal(await p.locator('#time').inputValue(),'12:37');
 await p.locator('#open-time').click();await p.keyboard.press('Escape');
 assert.equal(await p.evaluate(()=>document.activeElement.id),'open-time');
 await settle();
 await p.locator('.segment').nth(2).click();
 await p.locator('[data-mode=TRANSIT]').click();
 await p.waitForFunction(()=>document.querySelector('.map-area').dataset.provider==='google');
 await settle();
 const current=p.locator('#google-map .route-current').first();
 await current.waitFor({state:'attached'});
 assert.equal(await current.evaluate(path=>getComputedStyle(path).animationName),'route-current');
 assert.equal(await current.evaluate(path=>getComputedStyle(path).pointerEvents),'none');
 await p.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await current.evaluate(path=>getComputedStyle(path).animationName),'none');
 await p.emulateMedia({reducedMotion:'no-preference'});
 assert.match(await p.locator('.transit-steps').innerText(),/A.*First Stop.*Second Stop/s);
 assert.equal(googleCalls.filter(call=>call.mode==='TRANSIT').length,1);
 const initialDeparture=Date.parse(googleCalls.at(-1).departure);
 await p.locator('[data-stay]').first().fill('90');await settle();
 assert.equal(Date.parse(googleCalls.at(-1).departure)-initialDeparture,15*60000);
 await p.locator('#service').click();await p.locator('#choose-mapbox').click();
 assert.equal(await p.locator('.map-area').getAttribute('data-provider'),'google');
 assert.match(await p.locator('#notice').innerText(),/Public transit routes are available in Google Maps/);
 await p.locator('[data-mode=WALK]').click();await settle();
 await p.locator('#close-edge').click();
 await p.locator('#service').click();await p.locator('#choose-mapbox').click();
 await p.waitForFunction(()=>document.querySelector('.map-area').dataset.provider==='mapbox');
 await p.evaluate(()=>window.__denyGoogleWidget=true);await p.locator('.visit-details').first().click();
 await p.locator('#details').getByRole('button',{name:'Try again'}).waitFor();await p.locator('#close-details').click();
 for(const name of ['Times Square','Central Park']){
  await p.locator('#search').fill(name);await p.locator('#results [data-result]').first().click();await p.locator('#details #add').waitFor({state:'visible'});
  assert.equal(await p.locator('#details h2').innerText(),name);await p.locator('#add').click();await p.locator('#close-details').click();
 }
 assert.equal(await p.locator('.visit').count(),6);assert.equal(searchCalls[0].session,searchCalls[1].session);assert.notEqual(searchCalls[0].session,searchCalls[2].session);
 assert.ok(searchCalls.every(call=>call.language==='en'));
 await assertTimeline();
 await p.locator('#search').fill('Central Park');await p.locator('#results [data-result]').first().click();
 assert.match(await p.locator('#add').innerText(),/Added/);await p.locator('#add').click();assert.equal(await p.locator('.visit').count(),6);
 const id=await p.locator('.visit').last().getAttribute('data-visit');await p.locator(`[data-move="${id}"][data-delta="-1"]`).click();assert.equal(await p.locator('.visit').nth(4).getAttribute('data-visit'),id);await p.locator(`[data-remove="${id}"]`).click();assert.equal(await p.locator('.visit').count(),5);
 await assertTimeline();
 await setInput('#date','2027-07-04');await setInput('#time','13:15');assert.equal(await p.locator('#weekday').innerText(),'Sun');assert.equal(await p.locator('#zone').innerText(),'America/New_York');
 await p.locator('#search').fill('empty');assert.match(await p.locator('#results').innerText(),/Preparing search|Searching Mapbox/);await p.waitForFunction(()=>document.querySelector('#results').textContent.includes('No places found'));
 for(const status of [403,429]){failure=status;await p.locator('#search').fill('error '+status);await p.waitForFunction(text=>document.querySelector('#results').textContent.includes(text),status===403?'authentication failed':'rate limit reached');}
 await p.locator('#search').fill('');failure=0;
 await p.evaluate(()=>{const m=window.__mapboxFixture;m.poiFeature={id:99,properties:{name:'Tile POI',maki:'cafe'},geometry:{type:'Point',coordinates:[-73.98,40.75]}};m.emit('click',{point:{x:500,y:500}});});
 await p.locator('#details #add').click();await p.locator('#close-details').click();assert.equal(await p.locator('.visit').count(),6);
 const long='Long destination '.repeat(10);await p.locator('#search').fill(long);await p.locator('#results [data-result]').first().click();await p.locator('#details #add').click();await p.locator('#close-details').click();
 assert.ok(await p.locator('#itinerary-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 for(const width of [1920,1440,390,320]){const height=width>700?1000:844;await p.setViewportSize({width,height});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const header=await p.locator('header').boundingBox(),panel=await p.locator('.itinerary').boundingBox();assert.ok(header.x>=0&&header.x+header.width<=width);assert.ok(panel.x>=0&&panel.x+panel.width<=width);await p.locator('.segment').first().click();const edge=await p.locator('#edge-settings').boundingBox();assert.ok(Math.abs(edge.x+edge.width/2-width/2)<2);assert.ok(Math.abs(height-edge.y-edge.height-28)<2);await p.locator('#close-edge').click();}
 while(await p.locator('[data-remove]').count())await p.locator('[data-remove]').first().click();assert.ok(await p.locator('.empty').isVisible());assert.equal(await p.locator('.mapbox-visit:not(.mapbox-preview)').count(),0);
 const unavailable=await b.newPage();
 await unavailable.route('**/src/app.js',loadPlannerFixture);
 let configCalls=0;
 await unavailable.route('**/api/config',route=>{configCalls++;return route.fulfill({json:{browserKey:'',mapboxToken:'',serverReady:false}});});
 await unavailable.goto(base);
 await unavailable.locator('#mapbox-error').waitFor();
 assert.match(await unavailable.locator('#mapbox-error-text').innerText(),/Mapbox public token/);
 await unavailable.locator('#mapbox-retry').click();
 await unavailable.locator('#mapbox-error').waitFor();
 await unavailable.locator('#mapbox-return').click();
 await unavailable.locator('#mapbox-error').waitFor();
 assert.match(await unavailable.locator('#mapbox-error-text').innerText(),/Google Maps browser key/);
 assert.equal(await unavailable.locator('#map,.map-edge,.mapbox-visit').count(),0);
 assert.equal(await unavailable.locator('.visit').count(),4);
 assert.equal(configCalls,1);
 await unavailable.close();
 assert.deepEqual(errors,[]);console.log('PASS real-provider migration, calendar keyboard/leap day, minute precision, provider transit guard and recalculation, Mapbox search, UI Kit and responsive panels');
}finally{await b.close();}
