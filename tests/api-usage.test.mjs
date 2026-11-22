import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clientIp,createApiUsage,googleBillingMonth} from '../api-usage.mjs';

async function directory(t){
  const path=await mkdtemp(join(tmpdir(),'travel-link-usage-'));
  t.after(()=>rm(path,{recursive:true,force:true}));
  return path;
}
const signal=new AbortController().signal;

test('Pacific month resets at local midnight, including daylight saving time',()=>{
  assert.equal(googleBillingMonth(Date.parse('2027-03-01T07:59:59Z')),'2027-02');
  assert.equal(googleBillingMonth(Date.parse('2027-03-01T08:00:00Z')),'2027-03');
  assert.equal(googleBillingMonth(Date.parse('2027-04-01T06:59:59Z')),'2027-03');
  assert.equal(googleBillingMonth(Date.parse('2027-04-01T07:00:00Z')),'2027-04');
});

test('separate connections share caps; charged attempts survive reopening and retries',async t=>{
  const path=await directory(t);
  const env={GOOGLE_TIME_ZONE_MONTHLY_LIMIT:'2',GOOGLE_ROUTES_PRO_MONTHLY_LIMIT:'1'};
  const first=createApiUsage(path,{env}),second=createApiUsage(path,{env});
  let called=0;
  const task=async()=>++called;
  try{
    const requests=await Promise.allSettled([first,second,first,second].map(guard=>guard.upstream('timezone',signal,task)));
    assert.equal(called,2);
    assert.equal(requests.filter(result=>result.reason?.code==='API_MONTH_LIMIT').length,2);
    await assert.rejects(first.upstream('routesPro',signal,async()=>{throw Error('upstream failed');}),/upstream failed/);
  }finally{first.close();second.close();}
  const restarted=createApiUsage(path,{env});
  try{
    await assert.rejects(restarted.upstream('timezone',signal,task),{code:'API_MONTH_LIMIT'});
    await assert.rejects(restarted.upstream('routesPro',signal,task),{code:'API_MONTH_LIMIT'});
    assert.equal(await restarted.upstream('routesEssentials',signal,task),3);
  }finally{restarted.close();}
});

test('busy and abort checks preserve allowance, while corrupt usage storage fails closed',async t=>{
  const path=await directory(t);
  const guard=createApiUsage(path,{env:{GOOGLE_TIME_ZONE_MONTHLY_LIMIT:'2',TRAVEL_LINK_API_CONCURRENCY:'1'}});
  let release;
  try{
    const first=guard.upstream('timezone',signal,()=>new Promise(resolve=>{release=resolve;}));
    await assert.rejects(guard.upstream('timezone',signal,assert.fail),{code:'API_BUSY'});
    await assert.rejects(guard.upstream('timezone',AbortSignal.abort(),assert.fail),{name:'AbortError'});
    release();await first;
    await guard.upstream('timezone',signal,async()=>{});
    await assert.rejects(guard.upstream('timezone',signal,assert.fail),{code:'API_MONTH_LIMIT'});
  }finally{guard.close();}
  await writeFile(join(path,'api-usage.sqlite'),'bad file');
  const broken=createApiUsage(path,{env:{}});
  try{await assert.rejects(broken.upstream('timezone',signal,assert.fail),{code:'API_USAGE_UNAVAILABLE'});}
  finally{broken.close();}
  const paused=createApiUsage(path,{env:{TRAVEL_LINK_API_PAUSED:'1'}});
  await assert.rejects(paused.upstream('timezone',signal,assert.fail),{code:'API_PAUSED'});
});

test('caller-supplied forwarding prefixes cannot override the Render visitor IP',()=>{
  const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'198.51.100.1, 203.0.113.7'}};
  assert.equal(clientIp(req,true),'203.0.113.7');
  assert.equal(clientIp(req,false),'127.0.0.1');
  req.headers['x-forwarded-for']='203.0.113.7, invalid';
  assert.equal(clientIp(req,true),'render-unknown');
  const limiter=createApiUsage('',{env:{TRAVEL_LINK_API_USER_PER_MINUTE:'1',TRAVEL_LINK_API_IP_PER_MINUTE:'2'}});
  limiter.admit('one',()=> 'same-user');
  assert.throws(()=>limiter.admit('two',()=> 'same-user'),{code:'API_RATE_LIMIT'});
  limiter.admit('one',()=>undefined);
  assert.throws(()=>limiter.admit('one',()=>undefined),{code:'API_RATE_LIMIT'});
});

test('paid Google SKUs compete for one modeled won budget while free usage continues',async t=>{
  const path=await directory(t);
  const env={TRAVEL_LINK_OTHER_COST_RESERVE_KRW:'49980',TRAVEL_LINK_USD_KRW_ALL_IN:'2000',
    GOOGLE_ROUTES_PRO_FREE_ALLOCATION:'0',GOOGLE_TIME_ZONE_FREE_ALLOCATION:'1'};
  const guard=createApiUsage(path,{env}),other=createApiUsage(path,{env});
  try{
    await guard.upstream('routesPro',signal,async()=>{});
    await other.upstream('timezone',signal,async()=>{});
    await assert.rejects(guard.upstream('timezone',signal,assert.fail),{code:'API_COST_LIMIT'});
    await assert.rejects(other.upstream('routesPro',signal,assert.fail),{code:'API_COST_LIMIT'});
    await guard.upstream('routesEssentials',signal,async()=>{});
  }finally{guard.close();other.close();}
});

test('browser grants fail closed and count slow use across process restarts',async t=>{
  const path=await directory(t);
  const env={TRAVEL_LINK_BROWSER_MONTHLY_PERMITS:'2'};
  let now=Date.parse('2027-03-01T08:00:00Z');
  const first=createApiUsage(path,{env,now:()=>now});
  try{first.permitBrowser();}finally{first.close();}
  now=Date.parse('2027-03-28T08:00:00Z');
  const second=createApiUsage(path,{env,now:()=>now});
  try{
    second.permitBrowser();
    assert.throws(()=>second.permitBrowser(),{code:'API_MONTH_LIMIT'});
    now=Date.parse('2027-04-01T07:00:00Z');
    second.permitBrowser();
  }finally{second.close();}
});
