import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {measureRequests} from './browser-efficiency.mjs';

// Materialize the committed implementation without touching the user's files.
const baseline=path.resolve('test-results/baseline');await mkdir(path.join(baseline,'src'),{recursive:true});
const baselineFiles=execFileSync('git',['ls-tree','-r','--name-only','HEAD'],{encoding:'utf8'}).trim().split(/\r?\n/)
 .filter(name=>['package.json','index.html','server.mjs'].includes(name)||name.startsWith('src/'));
for(const name of baselineFiles){
 await writeFile(path.join(baseline,name),execFileSync('git',['show','HEAD:'+name]));
}
async function start(cwd,port){
 const child=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,PORT:String(port),GOOGLE_MAPS_BROWSER_KEY:'',GOOGLE_MAPS_SERVER_KEY:''},stdio:['ignore','pipe','inherit'],windowsHide:true});
 await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Comparison server startup timed out')),10000);
   child.stdout.on('data',()=>{clearTimeout(timer);resolve();});
   child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});
 });return child;
}
const browser=await chromium.launch({channel:'msedge',headless:true});
let oldServer,newServer;
try{
 oldServer=await start(baseline,5187);newServer=await start(process.cwd(),5188);
 const before=await measureRequests(browser,'http://127.0.0.1:5187',{verify:false});
 const after=await measureRequests(browser,'http://127.0.0.1:5188');
 const report={baselineCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),before,after};
 await writeFile('test-results/request-comparison.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{oldServer?.kill();newServer?.kill();await browser.close();}
