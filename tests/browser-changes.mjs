import assert from 'node:assert/strict';
import {mockGoogle} from './google-fixture.mjs';

export async function verifyChanges(browser){
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{await fn();console.log('PASS '+name);};
 const settled=()=>page.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
 const metric=async key=>Number(await page.locator('[data-metric="'+key+'"]').getAttribute('data-value'));
 const difference=delta=>delta===0?'변화 없음':Math.abs(delta)+'분 '+(delta<0?'단축':'증가');
 const search=async text=>{await page.locator('#search').fill(text);await page.locator('.result').first().click();};
 try{
 await page.goto('http://127.0.0.1:5173');await settled();
 await page.locator('#date').fill('2026-09-14');await page.locator('#date').press('Tab');await settled();
 await check('compact cards retain readable controls and fit more destinations vertically',async()=>{
   const sizes=await page.locator('.visit').evaluateAll(cards=>cards.map(c=>({height:c.getBoundingClientRect().height,warning:!!c.querySelector('.warning')})));
   assert.ok(sizes.filter(s=>!s.warning).every(s=>s.height<140));
   assert.ok(sizes.find(s=>s.warning).height>sizes[0].height);
   for(const selector of ['.grip','.number','h3','.visit-category','[data-remove]','.times','[data-stay]','[data-move]'])assert.ok(await page.locator('.visit').first().locator(selector).count());
   const controls=await page.locator('.visit button,.visit input[type="number"]').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().height));
   assert.ok(controls.every(h=>h>=28));
   assert.ok(await page.locator('.warning').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=12));
   assert.equal(await page.locator('.visit').first().locator('.times').evaluate(e=>getComputedStyle(e).display),'flex');
   const bounds=await page.locator('.visit').nth(2).boundingBox();assert.ok(bounds.y+bounds.height<=1000);
   await search('경복궁');assert.equal(Math.round((await page.locator('#details').boundingBox()).width),258);
   await page.locator('#close-details').click();
 });
 await check('summary separates all four totals and stay edits do not claim improved travel',async()=>{
   assert.equal(await metric('travel'),46);assert.equal(await metric('stay'),180);assert.equal(await metric('waiting'),0);
   const end=await metric('end');
   await page.locator('[data-stay]').first().fill('30');await page.locator('[data-stay]').first().press('Tab');await settled();
   assert.equal(await metric('travel'),46);assert.equal(await metric('stay'),210);assert.equal(await metric('end'),end+30);
   assert.equal(await page.locator('.comparison').count(),0);
 });
 await check('reorder waits for all routes and undo compares to the immediately prior order',async()=>{
   const first=await page.locator('.visit').first().getAttribute('data-visit');
   for(let i=0;i<2;i++){
     const before=await metric('travel'),end=await metric('end');
     const direction=i===0?'1':'-1';
     const pending=await page.locator('[data-move="'+first+'"][data-delta="'+direction+'"]').evaluate(e=>{e.click();return document.querySelector('.comparison').dataset.status;});
     assert.equal(pending,'pending');await settled();
     assert.equal(await page.locator('.comparison').getAttribute('data-status'),'ready');
     assert.match(await page.locator('.comparison').innerText(),new RegExp(difference((await metric('travel'))-before)));
     const deltaEnd=(await metric('end'))-end;
     if(deltaEnd)assert.match(await page.locator('.comparison small').innerText(),new RegExp(Math.abs(deltaEnd)+'분'));
   }
 });
 await check('comparison remains briefly, is replaced by newer edits, and does not accumulate',async()=>{
   await page.clock.install();
   const before=await metric('travel');
   await page.locator('[data-move][data-delta="1"]').first().click();await page.clock.runFor(500);await settled();
   assert.match(await page.locator('.comparison').innerText(),new RegExp(difference((await metric('travel'))-before)));
   await page.clock.runFor(11000);assert.equal(await page.locator('.comparison').count(),1);
   await page.clock.runFor(1500);assert.equal(await page.locator('.comparison').count(),0);
   await page.clock.resume();
 });
 await check('rapid reorders ignore canceled intermediate results',async()=>{
   const before=await metric('travel');
   await page.evaluate(()=>{document.querySelector('[data-move][data-delta="1"]').click();document.querySelectorAll('[data-move][data-delta="1"]')[1].click();});
   await settled();assert.match(await page.locator('.comparison').innerText(),new RegExp(difference((await metric('travel'))-before)));
   assert.equal(await page.locator('.comparison').count(),1);
 });
 await check('only selected map node shows arrival, all nodes show names and readable numbers at zoom extremes',async()=>{
   assert.equal(await page.locator('.map-node .node-title').count(),4);assert.equal(await page.locator('.map-node .node-time').count(),1);
   const id=await page.locator('.visit').nth(2).getAttribute('data-visit');
   await page.locator('[data-node="'+id+'"]').dispatchEvent('click');
   assert.equal(await page.locator('.map-node .node-time').count(),1);
   assert.equal(await page.locator('.map-node:has(.node-time)').getAttribute('data-node'),id);
   assert.equal(await page.locator('.node-start').count(),1);
   await page.locator('#close-details').click();
   const height=await page.locator('.node-number').first().evaluate(e=>e.getBoundingClientRect().height);
   await page.evaluate(()=>{for(let i=0;i<12;i++)document.querySelector('#zoom-out').click();});
   assert.ok(Math.abs((await page.locator('.node-number').first().evaluate(e=>e.getBoundingClientRect().height))-height)<1);
   await page.evaluate(()=>{for(let i=0;i<20;i++)document.querySelector('#zoom-in').click();});
   assert.ok(Math.abs((await page.locator('.node-number').first().evaluate(e=>e.getBoundingClientRect().height))-height)<1);
   await page.locator('#fit').click();
 });
 await check('duplicate and rapid additions create one destination without recalculating routes',async()=>{
   await page.evaluate(async()=>{const {DemoProvider}=await import('/src/providers.js');const route=DemoProvider.prototype.route;window.demoCalls=0;DemoProvider.prototype.route=function(args){window.demoCalls++;return route.call(this,args);};});
   await search('N서울타워');
   await page.locator('#add').evaluate(e=>{const add=e.onclick;for(let i=0;i<5;i++)add();});await settled();
   assert.equal(await page.locator('.visit').count(),5);assert.equal(await page.locator('.map-node').count(),5);
   assert.equal(await page.evaluate(()=>window.demoCalls),4);
   const ids=await page.locator('.map-edge').evaluateAll(e=>e.map(x=>x.dataset.edge));
   await page.locator('#add').click();await settled();
   assert.equal(await page.evaluate(()=>window.demoCalls),4);
   assert.deepEqual(await page.locator('.map-edge').evaluateAll(e=>e.map(x=>x.dataset.edge)),ids);
   assert.match(await page.locator('#add').innerText(),/이미 추가됨/);
 });
 await check('duplicate attempt highlights and reveals existing visit; removal enables re-add',async()=>{
   const id=await page.locator('.visit').last().getAttribute('data-visit');
   await page.locator('.itinerary').evaluate(e=>e.scrollTop=0);await page.locator('#add').click();
   await page.waitForFunction(id=>{const c=document.querySelector('[data-visit="'+id+'"]').getBoundingClientRect(),p=document.querySelector('.itinerary').getBoundingClientRect();return c.top>=p.top-1&&c.bottom<=p.bottom+1;},id);
   assert.equal(await page.locator('.visit.selected').getAttribute('data-visit'),id);
   assert.equal(await page.locator('[data-node="'+id+'"] circle').getAttribute('fill'),'#6357bb');
   await page.locator('[data-remove="'+id+'"]').click();await settled();
   assert.equal(await page.locator('#add').innerText(),'＋ 일정에 추가');
   await page.locator('#add').click();await settled();
   assert.equal(await page.locator('.visit').count(),5);
   assert.notEqual(await page.locator('.visit').last().getAttribute('data-visit'),id);
   await page.locator('#close-details').click();
 });
 await check('keyboard movement keeps focus and unchanged directed segments retain transport mode',async()=>{
   const edge=await page.locator('.segment').nth(1).getAttribute('data-edge');
   await page.locator('.segment').nth(1).click();await page.locator('[data-mode="WALK"]').click();await settled();await page.locator('#close-edge').click();
   const id=await page.locator('.visit').last().getAttribute('data-visit');
   const up=page.locator('[data-move="'+id+'"][data-delta="-1"]');await up.focus();await up.press('Enter');await settled();
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.move),id);
   assert.match(await page.locator('.segment[data-edge="'+edge+'"]').innerText(),/도보/);
 });
 await check('unknown segment blocks efficiency comparison and unknown node time is selected-only',async()=>{
   await page.locator('footer details').evaluate(e=>e.open=true);await page.locator('#scenario').selectOption('error');await settled();
   await page.locator('[data-move][data-delta="1"]').first().click();await settled();
   assert.match(await page.locator('.comparison').innerText(),/효율 비교 불가/);
   assert.equal(await page.locator('[data-metric="travel"]').innerText(),'미확정');
   assert.equal(await page.locator('[data-metric="stay"]').innerText(),'270분');
   const id=await page.locator('.visit').last().getAttribute('data-visit');await page.locator('[data-node="'+id+'"]').dispatchEvent('click');
   assert.equal(await page.locator('.map-node .node-time').count(),1);assert.equal(await page.locator('.map-node .node-time').textContent(),'시간 미확정');
   await page.locator('#close-details').click();await page.locator('#scenario').selectOption('normal');await settled();
 });
 await page.locator('#sample').click();await settled();await page.locator('#fit').click();
 await page.screenshot({path:'test-results/compact-desktop.png',fullPage:true});
 await page.setViewportSize({width:1000,height:1000});
 await check('narrow desktop cards wrap long names without overflowing controls',async()=>{
   await page.locator('.visit h3').first().evaluate(e=>e.textContent='아주 긴 장소 이름을 가진 서울의 미술관과 전시 공간');
   const card=page.locator('.visit').first();
   assert.ok(await card.evaluate(e=>e.scrollWidth<=e.clientWidth));
   assert.ok(await card.locator('h3').evaluate(e=>e.getBoundingClientRect().height<40));
 });
 assert.deepEqual(errors,[]);
 }finally{await page.close();}
 await verifyLive(browser);
}

async function verifyLive(browser){
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=await mockGoogle(page);
 const settled=()=>page.waitForFunction(()=>document.querySelector('#summary').getAttribute('aria-busy')==='false');
 const search=async query=>{await page.locator('#search').fill(query);await page.locator('#search-form').evaluate(e=>e.requestSubmit());await page.locator('.result').first().waitFor();};
 try{
 await page.goto('http://127.0.0.1:5173');await settled();await page.locator('#service').click();await settled();
 assert.equal(await page.locator('#source-badge').innerText(),'GOOGLE / LIVE');
 for(let n=1;n<=3;n++){
   await search('original');await page.locator('[data-result="ChIJ-stable-'+n+'"]').click();await page.locator('#add').click();await settled();
 }
 assert.equal(await page.locator('.visit').count(),3);
 assert.equal(await page.locator('[data-metric="travel"]').innerText(),'20분');
 const before=calls.length;
 await search('renamed');await page.locator('[data-result="ChIJ-stable-1"]').click();
 await page.locator('#add').evaluate(e=>{const add=e.onclick;for(let i=0;i<5;i++)add();});await settled();
 assert.equal(calls.length,before);assert.equal(await page.locator('.visit').count(),3);
 assert.equal(await page.locator('#google-map .map-node').count(),3);
 console.log('PASS live fixture: stable Place ID blocks renamed duplicates and distinct IDs allow same names');
 await page.locator('#close-details').click();
 await page.locator('[data-move][data-delta="1"]').first().click();await settled();
 assert.equal(await page.locator('[data-metric="travel"]').innerText(),'40분');
 assert.match(await page.locator('.comparison').innerText(),/20분 증가/);
 await page.locator('[data-move][data-delta="-1"]').nth(1).click();await settled();
 assert.equal(await page.locator('[data-metric="travel"]').innerText(),'20분');assert.match(await page.locator('.comparison').innerText(),/20분 단축/);
 assert.equal(await page.locator('#google-map .map-node .node-time').count(),1);
 assert.equal(await page.locator('#google-map .map-node .node-title').count(),3);
 assert.ok(calls.every(c=>c.departure.endsWith('Z')));
 console.log('PASS live fixture: recalculated metrics, immediate comparison and selected-only arrival overlay');
 assert.deepEqual(errors,[]);
 }finally{await page.close();}
}
