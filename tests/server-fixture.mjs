// Installed only by server.test.mjs. Never forward any request to Google.
globalThis.fetch=async(url,{signal,body,headers}={})=>{
 const target=new URL(url);
 if(!['routes.googleapis.com','maps.googleapis.com','places.googleapis.com'].includes(target.hostname))throw Error('Unexpected fixture host');
 await new Promise((resolve,reject)=>{
   const timer=setTimeout(resolve,100);
   signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});
   if(signal?.aborted){clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));}
 });
 if(target.hostname==='maps.googleapis.com')return {ok:true,status:200,json:async()=>target.searchParams.get('location')==='0,0'
   ?{status:'REQUEST_DENIED',error_message:'This IP address is not authorized. Fixture secret.'}
   :{status:'OK',timeZoneId:'Asia/Seoul'}};
 if(target.hostname==='places.googleapis.com'){
   const id='fixture-place';
   const place={id,displayName:{text:'Fixture place'},formattedAddress:'Fixture address',
    location:{latitude:37.5,longitude:127},regularOpeningHours:{periods:[{open:{day:1,hour:9},close:{day:1,hour:17}}]},
    photos:[{name:'places/'+id+'/photos/sample',authorAttributions:[{displayName:'Test photographer'}],googleMapsUri:'https://maps.google.com/'}]};
   let data=place;
   if(target.pathname.endsWith(':searchText')){
     const request=JSON.parse(body);
     if(request.languageCode!=='en'||![5,8].includes(request.pageSize)||
         !headers['X-Goog-FieldMask']?.startsWith('places.id,places.displayName,places.formattedAddress,places.location'))
       throw Error('Unexpected Places search options');
     data={places:[place]};
   }
   if(target.pathname==='/v1/places/'+id&&
       !['id,displayName,location','id,displayName,formattedAddress,location,regularOpeningHours,attributions,photos'].includes(headers['X-Goog-FieldMask']))
     throw Error('Unexpected Places detail field mask');
   if(target.pathname.endsWith('/media'))data={photoUri:'https://lh3.googleusercontent.com/test'};
   return {status:200,ok:true,json:async()=>data};
 }
 const args=JSON.parse(body);
 if(args.origin.location.latLng.latitude===0)return {ok:false,status:403,json:async()=>({error:'fixture'})};
 const steps=args.travelMode==='TRANSIT'?[
   {travelMode:'WALK',distanceMeters:100,staticDuration:'90s'},
   {travelMode:'TRANSIT',transitDetails:{stopDetails:{departureStop:{name:'First Stop'},arrivalStop:{name:'Second Stop'}},
     transitLine:{nameShort:'A',vehicle:{type:'SUBWAY'},agencies:[{name:'Transit Authority',uri:'https://example.com'}]}}}
 ]:[{travelMode:args.travelMode}];
 return {ok:true,status:200,json:async()=>({routes:[{duration:'600s',distanceMeters:800,polyline:{encodedPolyline:'fixture'},
   localizedValues:{transitFare:{text:'$3.00'}},legs:[{steps}]}]})};
};
