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
  timezone:['GOOGLE_TIME_ZONE_MONTHLY_LIMIT',10_010],
  routesEssentials:['GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT',10_010],
  routesPro:['GOOGLE_ROUTES_PRO_MONTHLY_LIMIT',5_010]
};
function integer(env,key,fallback,max){
  if(env[key]===undefined||env[key]==='')return fallback;
  if(!/^\d+$/.test(env[key])||+env[key]>max)throw Error('Invalid limit for '+key);
  return +env[key];
}
const rateError=()=>new UsageError(429,'API_RATE_LIMIT','Too many requests. Please try again shortly.',60);

export function createApiUsage(directory,{env=process.env,now=Date.now}={}){
  const caps=Object.fromEntries(Object.entries(limits).map(([sku,[key,max]])=>[sku,integer(env,key,max,max)]));
  const paused=env.TRAVEL_LINK_API_PAUSED==='1';
  const browser={mapbox:env.TRAVEL_LINK_MAPBOX_ENABLED!=='0',googleWidgets:env.TRAVEL_LINK_GOOGLE_WIDGETS!=='0',
    googleMedia:env.TRAVEL_LINK_GOOGLE_MEDIA!=='0'};
  const concurrency=integer(env,'TRAVEL_LINK_API_CONCURRENCY',8,100);
  const ipLimit=integer(env,'TRAVEL_LINK_API_IP_PER_MINUTE',120,10_000);
  const userLimit=integer(env,'TRAVEL_LINK_API_USER_PER_MINUTE',90,10_000);
  const totalLimit=integer(env,'TRAVEL_LINK_API_TOTAL_PER_MINUTE',240,10_000);
  let db,statement,active=0,minute=-1;
  const requests=new Map();

  function available(){
    if(paused)throw new UsageError(503,'API_PAUSED','Map, place and route services are temporarily paused.');
  }

  function rate(key,limit){
    const current=Math.floor(now()/60_000);
    if(current!==minute){minute=current;requests.clear();}
    const count=requests.get(key)||0;
    if(count>=limit||(!count&&requests.size>=4096))throw rateError();
    requests.set(key,count+1);
  }

  function reserve(sku){
    if(!caps[sku])throw new UsageError(429,'API_MONTH_LIMIT','This service has reached its monthly usage limit.');
    try{
      if(!statement){
        mkdirSync(directory,{recursive:true});
        db??=new DatabaseSync(join(directory,'api-usage.sqlite'));
        db.exec('PRAGMA busy_timeout=1500; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS usage(month TEXT, sku TEXT, attempts INTEGER NOT NULL, PRIMARY KEY(month,sku))');
        statement=db.prepare('INSERT INTO usage VALUES (?, ?, 1) ON CONFLICT(month,sku) DO UPDATE SET attempts=attempts+1 WHERE attempts < ?');
      }
      if(statement.run(googleBillingMonth(now()),sku,caps[sku]).changes)return;
    }catch{
      throw new UsageError(503,'API_USAGE_UNAVAILABLE','Usage could not be verified. External requests are temporarily unavailable.');
    }
    throw new UsageError(429,'API_MONTH_LIMIT','This service has reached its monthly usage limit.');
  }

  return {
    paused,browser,available,rate,
    admit(ip,getUser){
      available();
      rate('global',totalLimit);
      rate('ip:'+ip,ipLimit);
      const user=getUser();
      if(user)rate('user:'+user,userLimit);
    },
    async upstream(sku,signal,task){
      signal.throwIfAborted();
      available();
      if(active>=concurrency)throw new UsageError(429,'API_BUSY','Map services are busy. Please try again shortly.',5);
      reserve(sku);
      active++;
      try{return await task();}finally{active--;}
    },
    close(){db?.close();db=statement=null;}
  };
}
