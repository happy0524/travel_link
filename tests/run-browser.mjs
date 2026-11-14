import {spawn} from 'node:child_process';
// Isolated keyless server: never read .env or spend real Google quota in tests.
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',
 GOOGLE_MAPS_BROWSER_KEY:'',GOOGLE_MAPS_SERVER_KEY:'',REQUEST_MONITOR:'1'},stdio:['ignore','pipe','inherit'],windowsHide:true});
try{
 const url=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Test server startup timed out')),10_000);
   server.once('exit',code=>{clearTimeout(timeout);reject(Error('Test server exited '+code));});
   server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timeout);resolve('http://127.0.0.1:'+match[1]);}});
 });
 const child=spawn(process.execPath,['tests/browser.mjs'],{env:{...process.env,TEST_BASE_URL:url},stdio:'inherit',windowsHide:true});
 process.exitCode=await new Promise(resolve=>child.on('exit',resolve));
}finally{server.kill();}
