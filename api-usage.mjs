import {mkdirSync} from 'node:fs';
import {isIP,SocketAddress} from 'node:net';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

export class UsageError extends Error {
  constructor(status,code,message,retryAfter){
    super(message);
    Object.assign(this,{status,code,retryAfter});
  }
}

const pacificMonth=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'});
export function googleBillingMonth(now){
  const parts=Object.fromEntries(pacificMonth.formatToParts(now).map(({type,value})=>[type,value]));
  return parts.year+'-'+parts.month;
}

function normalizeIp(value){
  if(typeof value!=='string')return null;
  const address=value.trim().toLowerCase().replace(/^::ffff:(?=\d+\.)/,'');
  if(isIP(address)===4)return address;
  if(isIP(address)===6)return new SocketAddress({address,family:'ipv6'}).address;
  return null;
}

export function clientIp(req,hosted){
  const peer=normalizeIp(req.socket.remoteAddress);
  if(!hosted)return peer||'unknown';
  // Render ingress appends the visitor IP. Never use the caller-controlled left side.
  const forwarded=req.headers['x-forwarded-for'];
  return typeof forwarded==='string'?normalizeIp(forwarded.split(',').at(-1))||'render-unknown':'render-unknown';
}

const limits={
  timezone:['GOOGLE_TIME_ZONE_MONTHLY_LIMIT','GOOGLE_TIME_ZONE_FREE_ALLOCATION',10_000,5],
  routesEssentials:['GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT','GOOGLE_ROUTES_ESSENTIALS_FREE_ALLOCATION',10_000,5],
  routesPro:['GOOGLE_ROUTES_PRO_MONTHLY_LIMIT','GOOGLE_ROUTES_PRO_FREE_ALLOCATION',5_000,10],
  placesSearch:['GOOGLE_PLACES_SEARCH_MONTHLY_LIMIT','GOOGLE_PLACES_SEARCH_FREE_ALLOCATION',5_000,32,500],
  placesRestore:['GOOGLE_PLACES_RESTORE_MONTHLY_LIMIT','GOOGLE_PLACES_RESTORE_FREE_ALLOCATION',5_000,17,500],
  placesDetails:['GOOGLE_PLACES_DETAILS_MONTHLY_LIMIT','GOOGLE_PLACES_DETAILS_FREE_ALLOCATION',1_000,20,500],
  placesPhoto:['GOOGLE_PLACES_PHOTO_MONTHLY_LIMIT','GOOGLE_PLACES_PHOTO_FREE_ALLOCATION',1_000,7,500]
};
const spendTarget=50_000;
const trialAllocations={timezone:500,routesEssentials:500,routesPro:250};
function integer(env,key,fallback,max){
  if(env[key]===undefined||env[key]==='')return fallback;
  if(!/^\d+$/.test(env[key])||+env[key]>max)throw Error('Invalid limit for '+key);
  return +env[key];
}
const rateError=()=>new UsageError(429,'API_RATE_LIMIT','Too many requests. Please try again shortly.',60);

const stopped=()=>new UsageError(503,'API_SITE_STOPPED','Travel Link is temporarily paused. Please check back later.');

export function createApiUsage(directory,{env=process.env,now=Date.now,pilotLatch=true}={}){
  const paidRates={},freeUnits={},caps={};
  for(const [sku,[capKey,freeKey,standardFree,usdPerThousand,defaultCap=standardFree]] of Object.entries(limits)){
    freeUnits[sku]=integer(env,freeKey,trialAllocations[sku]??defaultCap,standardFree);
    caps[sku]=Math.min(integer(env,capKey,defaultCap,1_000_000),standardFree);
    paidRates[sku]=usdPerThousand;
  }
  caps.browser=integer(env,'TRAVEL_LINK_BROWSER_MONTHLY_PERMITS',1000,10_000);
  const otherCosts=integer(env,'TRAVEL_LINK_OTHER_COST_RESERVE_KRW',spendTarget,spendTarget);
  const allInFx=integer(env,'TRAVEL_LINK_USD_KRW_ALL_IN',2000,10_000);
  if(allInFx===0)throw Error('TRAVEL_LINK_USD_KRW_ALL_IN must be positive.');
  const paused=env.TRAVEL_LINK_API_PAUSED==='1';
  const browser={mapbox:env.TRAVEL_LINK_MAPBOX_ENABLED!=='0',googleWidgets:env.TRAVEL_LINK_GOOGLE_WIDGETS!=='0',
    googleMedia:env.TRAVEL_LINK_GOOGLE_MEDIA!=='0'};
  const concurrency=integer(env,'TRAVEL_LINK_API_CONCURRENCY',8,100);
  const ipLimit=integer(env,'TRAVEL_LINK_API_IP_PER_MINUTE',120,10_000);
  const userLimit=integer(env,'TRAVEL_LINK_API_USER_PER_MINUTE',90,10_000);
  const totalLimit=integer(env,'TRAVEL_LINK_API_TOTAL_PER_MINUTE',240,10_000);
  let db,statement,readMonth,readStop,writeStop,clearStop,active=0,minute=-1;
  const requests=new Map();

  function available(){
    if(paused||status())throw stopped();
  }

  function database(){
    if(statement)return;
    mkdirSync(directory,{recursive:true});
    db??=new DatabaseSync(join(directory,'api-usage.sqlite'));
    db.exec('PRAGMA busy_timeout=1500; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS usage(month TEXT, sku TEXT, attempts INTEGER NOT NULL, PRIMARY KEY(month,sku)); CREATE TABLE IF NOT EXISTS service_stop(id INTEGER PRIMARY KEY CHECK(id=1), reason TEXT NOT NULL, stopped_at INTEGER NOT NULL)');
    readMonth=db.prepare('SELECT sku,attempts FROM usage WHERE month=?');
    readStop=db.prepare('SELECT reason,stopped_at AS stoppedAt FROM service_stop WHERE id=1');
    writeStop=db.prepare('INSERT OR IGNORE INTO service_stop VALUES (1, ?, ?)');
    clearStop=db.prepare('DELETE FROM service_stop WHERE id=1');
    statement=db.prepare('INSERT INTO usage VALUES (?, ?, 1) ON CONFLICT(month,sku) DO UPDATE SET attempts=attempts+1 WHERE attempts < ?');
  }

  function withStorage(task){
    try{database();return task();}
    catch(error){
      if(error instanceof UsageError)throw error;
      throw new UsageError(503,'API_USAGE_UNAVAILABLE','Usage could not be verified. External requests are temporarily unavailable.');
    }
  }

  function status(){return withStorage(()=>readStop.get()||null);}

  function transaction(task){
    db.exec('BEGIN IMMEDIATE');
    try{const result=task();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }

  function rate(key,limit){
    const current=Math.floor(now()/60_000);
    if(current!==minute){minute=current;requests.clear();}
    const count=requests.get(key)||0;
    if(count>=limit||(!count&&requests.size>=4096))throw rateError();
    requests.set(key,count+1);
  }

  function reserve(sku){
    const rejection=withStorage(()=>transaction(()=>{
      if(paused||readStop.get())return stopped();
      const month=googleBillingMonth(now());
      const monthTotals=Object.fromEntries(readMonth.all(month).map(row=>[row.sku,row.attempts]));
      const next=(monthTotals[sku]||0)+1;
      const latch=pilotLatch&&sku!=='browser';
      if(next>caps[sku]){
        if(latch){writeStop.run('monthly:'+sku,now());return stopped();}
        return new UsageError(429,'API_MONTH_LIMIT','This service has reached its monthly usage limit.');
      }
      if(sku!=='browser'&&next>freeUnits[sku]){
        monthTotals[sku]=next;
        const estimate=Object.keys(paidRates).reduce((sum,key)=>
          sum+Math.max(0,(monthTotals[key]||0)-freeUnits[key])*paidRates[key]*allInFx,0);
        if(estimate>(spendTarget-otherCosts)*1000){
          if(latch){writeStop.run('cost-model',now());return stopped();}
          return new UsageError(429,'API_COST_LIMIT','New paid requests are paused at the monthly spending threshold.');
        }
        if(latch&&estimate===(spendTarget-otherCosts)*1000)writeStop.run('cost-model',now());
      }
      statement.run(month,sku,caps[sku]);
      if(latch&&next===caps[sku])writeStop.run('monthly:'+sku,now());
      return null;
    }));
    if(rejection)throw rejection;
  }

  return {
    paused,browser,available,rate,status,
    pause(){withStorage(()=>writeStop.run('operator',now()));},
    resume(){withStorage(()=>clearStop.run());},
    admit(ip,getUser){
      available();
      rate('global',totalLimit);
      rate('ip:'+ip,ipLimit);
      const user=getUser();
      if(user)rate('user:'+user,userLimit);
    },
    permitBrowser(){available();reserve('browser');},
    async upstream(sku,signal,task){
      signal.throwIfAborted();
      available();
      if(active>=concurrency)throw new UsageError(429,'API_BUSY','Map services are busy. Please try again shortly.',5);
      reserve(sku);
      active++;
      try{return await task();}finally{active--;}
    },
    close(){db?.close();db=statement=readMonth=null;}
  };
}
