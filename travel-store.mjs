import {randomBytes, randomUUID, scrypt, timingSafeEqual, createHash, createHmac} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {googlePlaceId,stopReference} from './src/trip-stops.js';

const hashPassword=promisify(scrypt);
const digest=value=>createHash('sha256').update(value).digest('hex');
const sessionAge=30*24*60*60;
const idPattern=/^[\w-]{1,500}$/;
const validId=value=>typeof value==='string'&&idPattern.test(value);
const clean=(value,limit)=>typeof value==='string'?value.trim().slice(0,limit):'';
const validNumber=value=>typeof value==='string'&&/^[0-9]{1,128}$/.test(value);
const validSecret=value=>typeof value==='string'&&value.length>0&&value.length<=128;
const matchesSecret=(account,hash)=>account&&timingSafeEqual(Buffer.from(account.password,'hex'),hash);
const normalizeName=name=>name.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();

function cleanJourney(body){
  const name=clean(body.name,100),destination=clean(body.destination,160);
  const placeId=googlePlaceId(body.placeId),date=clean(body.date,10),time=clean(body.time,5);
  const day=new Date(date+'T00:00:00Z');
  if(!name||!destination||!placeId||!/^\d{4}-\d\d-\d\d$/.test(date)||
    !Number.isFinite(+day)||day.toISOString().slice(0,10)!==date||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)||
    !Array.isArray(body.stops)||body.stops.length>100)return null;
  const stops=body.stops.map(stop=>{
    if(!stop||!validId(stop.id)||!Number.isInteger(stop.stay)||stop.stay<0||stop.stay>1440)return null;
    return {id:stop.id,stay:stop.stay,wait:stop.wait===true,...stopReference(stop),
      mode:['WALK','TRANSIT','DRIVE'].includes(stop.mode)?stop.mode:'WALK'};
  });
  if(stops.includes(null)||new Set(stops.map(stop=>stop.id)).size!==stops.length)return null;
  const zone=clean(body.zone,100);
  if(zone)try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{return null;}
  return {name,destination,placeId,date,time,stops,...(zone?{zone}:{})};
}

export function createTravelStore(directory,json){
  let database,profileKey;
  const failures=new Map();
  function db(){
    if(database)return database;
    mkdirSync(directory,{recursive:true});
    database=new DatabaseSync(join(directory,'travel.sqlite'));
    database.exec(`PRAGMA busy_timeout=5000;
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL,credential_kind TEXT NOT NULL DEFAULT 'password',display_name TEXT);
      CREATE TABLE IF NOT EXISTS session (token TEXT PRIMARY KEY,user TEXT NOT NULL,expiry INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS journey (id TEXT PRIMARY KEY,user TEXT NOT NULL,body TEXT NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS traveler_profile (user TEXT PRIMARY KEY,lookup TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,verifier TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS journey_user_updated ON journey(user,updated);`);
    const columns=new Set(database.prepare('PRAGMA table_info(account)').all().map(column=>column.name));
    if(!columns.has('credential_kind'))database.exec("ALTER TABLE account ADD COLUMN credential_kind TEXT NOT NULL DEFAULT 'password'");
    if(!columns.has('display_name'))database.exec('ALTER TABLE account ADD COLUMN display_name TEXT');
    return database;
  }
  function lookupProfile(name,number){
    if(!profileKey){
      const filename=join(directory,'profile.key');
      try{profileKey=readFileSync(filename);}catch(error){
        if(error.code!=='ENOENT')throw error;
        if(db().prepare('SELECT 1 FROM traveler_profile LIMIT 1').get())throw Error('Missing traveler profile key');
        try{writeFileSync(filename,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
        profileKey=readFileSync(filename);
      }
      if(profileKey.length!==32){profileKey=null;throw Error('Invalid traveler profile key');}
    }
    return createHmac('sha256',profileKey).update(JSON.stringify([normalizeName(name),number])).digest('hex');
  }
  async function handle(req,res,pathname){
    const matches=pathname.match(/^\/api\/trips(?:\/([\w-]+))?$/);
    if(pathname!=='/api/travel-session'&&!matches)return false;
    const send=(status,body)=>{json(res,status,body);return true;};
    const token=req.headers.cookie?.match(/(?:^|;\s*)travel_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    const session=token&&db().prepare('SELECT session.user,account.credential_kind FROM session JOIN account ON account.id=session.user WHERE token=? AND expiry>?').get(digest(token),Date.now());
    if(req.method==='GET'){
      if(!matches)return send(200,{signedIn:!!session,needsProfile:!!session&&!db().prepare('SELECT 1 FROM traveler_profile WHERE user=?').get(session.user)});
      if(!session)return send(401,{message:'Sign in to see your trips.'});
      if(matches[1]){
        const row=db().prepare('SELECT body FROM journey WHERE id=? AND user=?').get(matches[1],session.user);
        return row?send(200,{id:matches[1],...JSON.parse(row.body)}):send(404,{message:'Trip not found.'});
      }
      const trips=db().prepare('SELECT id,body FROM journey WHERE user=? ORDER BY updated DESC').all(session.user)
        .map(({id,body})=>{const {destination,date}=JSON.parse(body);return {id,destination,date};});
      return send(200,{trips});
    }
    if(!['POST','PUT'].includes(req.method))return send(405,{message:'Method not allowed.'});
    const origin=req.headers.origin,port=req.socket.localPort;
    if(![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(origin))return send(403,{message:'Request origin is not allowed.'});
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{message:'Expected a JSON request.'});
    let text='';
    for await(const part of req){text+=part;if(text.length>262144)return send(413,{message:'Request is too large.'});}
    let body;
    try{body=JSON.parse(text);}catch{return send(400,{message:'Invalid request.'});}
    if(!body||typeof body!=='object')return send(400,{message:'Invalid request.'});
    if(matches){
      if(!session)return send(401,{message:'Sign in to save your trips.'});
      const trip=cleanJourney(body);
      if(!trip)return send(400,{message:'Check the traveler name, destination, date, time, and stops.'});
      if(req.method==='POST'&&!matches[1]){
        const id=typeof body.requestId==='string'&&/^[a-f0-9-]{36}$/.test(body.requestId)?body.requestId:randomUUID();
        const added=db().prepare('INSERT OR IGNORE INTO journey VALUES (?,?,?,?)').run(id,session.user,JSON.stringify(trip),Date.now());
        const row=db().prepare('SELECT body FROM journey WHERE id=? AND user=?').get(id,session.user);
        if(!row)return send(409,{message:'Could not save this trip. Start a new trip and try again.'});
        return send(added.changes?201:200,{id,...JSON.parse(row.body)});
      }
      if(req.method==='PUT'&&matches[1]){
        const updated=db().prepare('UPDATE journey SET body=?,updated=? WHERE id=? AND user=?').run(JSON.stringify(trip),Date.now(),matches[1],session.user);
        return updated.changes?send(200,{id:matches[1]}):send(404,{message:'Trip not found.'});
      }
      return send(405,{message:'Method not allowed.'});
    }
    if(req.method!=='POST')return send(405,{message:'Method not allowed.'});
    const cookie=value=>'travel_session='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+ (value?sessionAge:0);
    if(body.action==='logout'){
      if(token)db().prepare('DELETE FROM session WHERE token=?').run(digest(token));
      res.setHeader('Set-Cookie',cookie(''));return send(200,{signedIn:false});
    }
    const email=clean(body.email,254).toLowerCase(),name=clean(body.name,100);
    const link=body.action==='link-profile',profile=link||body.action==='enter-profile';
    const oldNumber=body.action==='email-number-login';
    if(profile){
      if(link&&!session)return send(401,{message:'Open your saved account before linking a traveler profile.'});
      if(!name||!validNumber(body.number))return send(400,{message:'Enter a traveler name and a favorite number using digits only.'});
    }else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
      !(oldNumber?validNumber(body.number):body.action==='legacy-login'&&validSecret(body.password))){
      return send(400,{message:'Enter your previous email and credential.'});
    }
    const now=Date.now(),key=req.socket.remoteAddress;
    const attempts=(failures.get(key)||[]).filter(t=>now-t<60_000);
    if(attempts.length>=16)return send(429,{message:'Too many attempts. Try again in a minute.'});
    failures.set(key,[...attempts,now]);
    let user;
    if(profile){
      const lookup=lookupProfile(name,body.number);
      const find=()=>db().prepare('SELECT * FROM traveler_profile WHERE lookup=?').get(lookup);
      let existing=find();
      if(link&&existing?.user===session.user)return send(200,{signedIn:true,needsProfile:false});
      if(link&&(existing||db().prepare('SELECT 1 FROM traveler_profile WHERE user=?').get(session.user)))
        return send(409,{message:'That traveler profile cannot be linked. Choose a different combination.'});
      if(!existing){
        if(!link&&body.allowCreate===false)return send(409,{message:'Choose a verified destination to create a new traveler profile.'});
        const salt=randomBytes(16).toString('hex'),verifier=(await hashPassword(lookup,salt,64)).toString('hex');
        const database=db();
        database.exec('BEGIN IMMEDIATE');
        try{
          existing=find();
          if(!existing&&(!link||!database.prepare('SELECT 1 FROM traveler_profile WHERE user=?').get(session.user))){
            const id=link?session.user:randomUUID();
            if(!link)database.prepare("INSERT INTO account (id,email,salt,password,credential_kind,display_name) VALUES (?,?,'','','profile',?)")
              .run(id,id+'@profile.invalid',name);
            database.prepare('INSERT INTO traveler_profile VALUES (?,?,?,?)').run(id,lookup,salt,verifier);
            existing={user:id,salt,verifier};
          }
          database.exec('COMMIT');
        }catch(error){database.exec('ROLLBACK');throw error;}
      }
      if(link)return existing?.user===session.user?send(200,{signedIn:true,needsProfile:false}):send(409,{message:'That traveler profile cannot be linked. Choose a different combination.'});
      if(!existing||!timingSafeEqual(Buffer.from(existing.verifier,'hex'),await hashPassword(lookup,existing.salt,64)))
        return send(401,{message:'Could not verify this traveler profile.'});
      user=existing.user;
    }else{
      const existing=db().prepare('SELECT * FROM account WHERE email=?').get(email);
      const hash=await hashPassword(oldNumber?body.number:body.password,existing?.salt||randomBytes(16).toString('hex'),64);
      if(existing?.credential_kind!==(oldNumber?'number':'password')||!matchesSecret(existing,hash))
        return send(401,{message:'Incorrect email or previous credential.'});
      user=existing.id;
    }
    const newToken=randomBytes(32).toString('hex');
    db().prepare('DELETE FROM session WHERE expiry<? OR token=?').run(now,token?digest(token):'');
    db().prepare('INSERT INTO session VALUES (?,?,?)').run(digest(newToken),user,now+sessionAge*1000);
    res.setHeader('Set-Cookie',cookie(newToken));
    return send(200,{signedIn:true,needsProfile:!profile&&!db().prepare('SELECT 1 FROM traveler_profile WHERE user=?').get(user)});
  }
  return handle;
}
