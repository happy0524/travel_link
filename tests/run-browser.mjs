import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
const directory=await mkdtemp(join(tmpdir(),'travel-link-test-'));
const fixture=new DatabaseSync(join(directory,'travel.sqlite'));
fixture.exec(`CREATE TABLE account (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL);
 CREATE TABLE journey (id TEXT PRIMARY KEY,user TEXT NOT NULL,body TEXT NOT NULL,updated INTEGER NOT NULL);`);
fixture.prepare('INSERT INTO account VALUES (?,?,?,?)').run('legacy-traveler','previous@example.org','test-salt',scryptSync('old test secret','test-salt',64).toString('hex'));
fixture.prepare('INSERT INTO journey VALUES (?,?,?,?)').run('legacy-trip','legacy-traveler',JSON.stringify({
 name:'Previous traveler',destination:'Saved Seoul',placeId:'ChIJ-stable-1',date:'2028-01-02',time:'08:42',zone:'America/Los_Angeles',stops:[]
}),0);
fixture.close();
// Isolated keyless server: never read .env or spend real Google quota in tests.
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',
 GOOGLE_MAPS_BROWSER_KEY:'',GOOGLE_MAPS_SERVER_KEY:'',REQUEST_MONITOR:'1',TRAVEL_LINK_DATA_DIR:directory},stdio:['ignore','pipe','inherit'],windowsHide:true});
try{
 const url=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Test server startup timed out')),10_000);
   server.once('exit',code=>{clearTimeout(timeout);reject(Error('Test server exited '+code));});
   server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timeout);resolve('http://127.0.0.1:'+match[1]);}});
 });
 for(const file of ['tests/browser-tree.mjs','tests/browser-onboarding.mjs']){
  const child=spawn(process.execPath,[file],{env:{...process.env,TEST_BASE_URL:url},stdio:'inherit',windowsHide:true});
  process.exitCode=await new Promise(resolve=>child.on('exit',resolve))??1;
  if(process.exitCode)break;
 }
}finally{server.kill();}
