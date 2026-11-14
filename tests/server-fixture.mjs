// Installed only by server.test.mjs. Never forward any request to Google.
globalThis.fetch=async(url,{signal,body}={})=>{
 const target=new URL(url);
 if(!['routes.googleapis.com','maps.googleapis.com'].includes(target.hostname))throw Error('Unexpected fixture host');
 await new Promise((resolve,reject)=>{
   const timer=setTimeout(resolve,100);
   signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});
   if(signal?.aborted){clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));}
 });
 if(target.hostname==='maps.googleapis.com')return {json:async()=>({status:'OK',timeZoneId:'Asia/Seoul'})};
 const args=JSON.parse(body);
 if(args.origin.location.latLng.latitude===0)return {ok:false,status:403,json:async()=>({error:'fixture'})};
 return {ok:true,status:200,json:async()=>({routes:[{duration:'600s',polyline:{encodedPolyline:'fixture'},legs:[{steps:[{travelMode:args.travelMode}]}]}]})};
};
