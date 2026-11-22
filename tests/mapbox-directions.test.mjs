import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MapboxDirections} from '../src/mapbox-directions.js';
const from={source:'example',lat:40.7484,lng:-73.9857},to={source:'user',lat:40.7536,lng:-73.9832};
const geometry={type:'LineString',coordinates:[[-73.9857,40.7484],[-73.9832,40.7536]]};
test('Mapbox directions requests actual geometry, profiles and metrics',async()=>{
 let count=0;
 const provider=new MapboxDirections(()=> 'pk.test',{fetcher:async(url,{signal})=>{
  count++;assert.match(url,/mapbox\/walking\/-73.9857,40.7484;/);assert.match(url,/geometries=geojson/);assert.ok(signal);
  return {ok:true,json:async()=>({code:'Ok',routes:[{geometry,duration:125,distance:610}]})};
 }});
 const result=await provider.route({from,to,mode:'WALK'});
 assert.equal(result.minutes,3);assert.equal(result.source,'mapbox');assert.deepEqual(result.geometry,geometry);
 assert.equal((await provider.route({from:{...from,source:'live'},to,mode:'WALK'})).status,'unsupported');
 assert.equal((await provider.route({from,to,mode:'TRANSIT'})).status,'unsupported');assert.equal(count,1);
});
test('Mapbox failures do not invent route lines, and cancellation propagates',async()=>{
 for(const [response,status] of [[{ok:false,status:401},'error'],[{ok:false,status:429},'error'],[{ok:true,json:async()=>({code:'NoRoute'})},'no-route'],[{ok:true,json:async()=>({code:'Ok',routes:[{geometry:{type:'LineString',coordinates:[]},duration:30,distance:20}]})},'error']]){
  const p=new MapboxDirections(()=> 'pk.test',{fetcher:async()=>response});const r=await p.route({from,to,mode:'DRIVE'});assert.equal(r.status,status);assert.equal(r.geometry,undefined);
 }
 const c=new AbortController();c.abort();
 const p=new MapboxDirections(()=> 'pk.test',{fetcher:async(url,{signal})=>{signal.throwIfAborted();}});
 await assert.rejects(p.route({from,to,mode:'WALK',signal:c.signal}),{name:'AbortError'});
});
