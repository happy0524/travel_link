const baseURL=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {verifyChanges} from './browser-changes.mjs';
import {measureRequests,verifyLiveFailures} from './browser-efficiency.mjs';
import {verifyMapStyle} from './browser-map-style.mjs';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1200}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const settled=()=>page.waitForFunction(()=>!document.querySelector('#summary').textContent.includes('계산하고'));
const check=async(name,fn)=>{await fn();console.log('PASS '+name);};
try{
await page.goto(baseURL);
await settled();
await check('initial demo renders four visits and three directed edges',async()=>{
 assert.equal(await page.locator('.visit').count(),4);assert.equal(await page.locator('.map-edge').count(),3);
 await page.screenshot({path:'test-results/demo-desktop.png',fullPage:true});
});
await page.locator('#date').fill('2026-09-14');await page.locator('#date').press('Tab');await settled();
await check('edited stay affects later times and survives actual drag of starting card',async()=>{
 const old=await page.locator('.visit').nth(1).locator('.times').innerText();
 await page.locator('[data-stay]').first().fill('45');await page.locator('[data-stay]').first().press('Tab');await settled();
 assert.notEqual(await page.locator('.visit').nth(1).locator('.times').innerText(),old);
 const id=await page.locator('.visit').first().getAttribute('data-visit');
 await page.locator('.visit').first().dragTo(page.locator('.visit').nth(2),{sourcePosition:{x:22,y:27},targetPosition:{x:100,y:30}});await settled();
 assert.equal(await page.locator('.visit').nth(2).getAttribute('data-visit'),id);
 assert.equal(await page.locator('.visit').nth(2).locator('[data-stay]').inputValue(),'45');
 assert.match(await page.locator('.visit').first().innerText(),/출발/);
 assert.match(await page.locator('.visit').first().locator('.times').innerText(),/09:00/);
 assert.equal(await page.locator('.map-edge').count(),3);
});
await check('waiting until opening changes downstream time',async()=>{
 const before=await page.locator('.visit').nth(1).locator('.times').innerText();
 await page.locator('[data-wait]').first().check();await settled();
 assert.notEqual(await page.locator('.visit').nth(1).locator('.times').innerText(),before);
});
await check('edge and segment share transport control',async()=>{
 await page.locator('.segment').first().click();await page.locator('[data-mode="WALK"]').click();await settled();
 assert.match(await page.locator('.segment').first().innerText(),/도보/);
 await page.locator('#close-edge').click();
 await page.locator('.map-edge').first().dispatchEvent('click');
 assert.equal(await page.locator('[data-mode="WALK"]').getAttribute('class'),'active');
 await page.locator('#close-edge').click();
});
await check('search, add new destination, and independent map/card selection',async()=>{
 await page.locator('#search').fill('청계천');await page.locator('.result').first().click();await page.locator('#add').click();await settled();
 assert.equal(await page.locator('.visit').count(),5);assert.equal(await page.locator('.map-node').count(),5);
 assert.equal(await page.locator('[data-stay]').last().inputValue(),'60');
 const id=await page.locator('.visit').last().getAttribute('data-visit');
 await page.locator('[data-node="'+id+'"]').dispatchEvent('click');
 assert.equal(await page.locator('.visit.selected').getAttribute('data-visit'),id);
 assert.equal(await page.locator('#details').isVisible(),true);
 await page.locator('#close-details').click();
 await page.locator('.visit').first().click();
 const selected=await page.locator('.visit.selected').getAttribute('data-visit');
 assert.equal(await page.locator('[data-node="'+selected+'"] circle').getAttribute('fill'),'#164F3B');
 await page.locator('#close-details').click();
});
await check('missing opening data visible when adding DDP',async()=>{
 await page.locator('#search').fill('동대문');await page.locator('.result').first().click();await page.locator('#add').click();await settled();
 assert.match(await page.locator('.visit').last().innerText(),/운영시간 정보가 없습니다/);await page.locator('#close-details').click();
});
await page.locator('footer details').evaluate(e=>e.open=true);
await check('confirmed no transit switches to driving; errors never do',async()=>{
 await page.locator('#scenario').selectOption('no-transit');await settled();
 assert.match(await page.locator('.segment').nth(1).innerText(),/자동 전환/);
 await page.locator('#scenario').selectOption('error');await settled();
 assert.match(await page.locator('.segment').first().innerText(),/경로 확인 필요/);
 assert.doesNotMatch(await page.locator('#visits').innerText(),/자동 전환/);
 assert.match(await page.locator('.visit').nth(2).innerText(),/시간 미확정/);
 await page.locator('#scenario').selectOption('no-routes');await settled();
 assert.match(await page.locator('.visit').last().innerText(),/시간 미확정/);
 await page.locator('#scenario').selectOption('normal');await settled();
});
await check('rapid edits keep latest times and midnight date',async()=>{
 await page.locator('#time').evaluate(e=>{e.value='22:30';e.dispatchEvent(new Event('change'));e.value='23:50';e.dispatchEvent(new Event('change'));});
 await settled();
 assert.match(await page.locator('.visit').first().locator('.times').innerText(),/09\/14 23:50/);
 assert.match(await page.locator('.visit').last().locator('.times').innerText(),/09\/15/);
});
await check('remove starting visit renumbers nodes and resets start time',async()=>{
 const next=await page.locator('.visit').nth(1).getAttribute('data-visit');
 await page.locator('[data-remove]').first().click();await settled();
 assert.equal(await page.locator('.visit').first().getAttribute('data-visit'),next);
 assert.match(await page.locator('.visit').first().locator('.times').innerText(),/23:50/);
 assert.equal(await page.locator('.map-node').count(),await page.locator('.visit').count());
 assert.equal(await page.locator('.map-edge').count(),(await page.locator('.visit').count())-1);
});
await check('map zoom and pan respond',async()=>{
 const before=await page.locator('#map').getAttribute('viewBox');
 await page.locator('#zoom-in').click();
 assert.notEqual(await page.locator('#map').getAttribute('viewBox'),before);
 await page.locator('#fit').click();
 const initial=await page.locator('#map').getAttribute('viewBox');
 await page.mouse.move(850,800);await page.mouse.down();await page.mouse.move(930,850,{steps:5});await page.mouse.up();
 assert.notEqual(await page.locator('#map').getAttribute('viewBox'),initial);
});
await check('delete all and first added stay defaults to zero',async()=>{
 while(await page.locator('.visit').count()){await page.locator('[data-remove]').first().click();await settled();}
 assert.equal(await page.locator('.map-node').count(),0);
 await page.locator('#search').fill('청계천');await page.locator('.result').first().click();await page.locator('#add').click();await settled();
 assert.equal(await page.locator('[data-stay]').first().inputValue(),'0');await page.locator('#close-details').click();
});
await check('keyless integration explains setup and preserves demo',async()=>{
 await page.locator('#service').click();assert.match(await page.locator('#notice').innerText(),/키가 없습니다/);
 assert.equal(await page.locator('#map').isVisible(),true);
});
await check('server protects credentials and missing key fails visibly',async()=>{
 assert.equal((await page.request.get(baseURL+'/.env')).status(),404);
 assert.equal((await page.request.get(baseURL+'/server.mjs')).status(),404);
 assert.equal((await page.request.post(baseURL+'/api/route',{data:{}})).status(),503);
});
await page.locator('#sample').click();await page.locator('#time').fill('09:00');await page.locator('#time').press('Tab');await settled();
await page.locator('#fit').click();await page.screenshot({path:'test-results/demo-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/demo-mobile.png',fullPage:true});
assert.deepEqual(errors,[]);
await verifyChanges(browser);
await measureRequests(browser,baseURL);
await verifyLiveFailures(browser,baseURL);
await verifyMapStyle(browser,baseURL);
console.log('All browser checks passed. No JavaScript errors.');
}finally{await browser.close();}

