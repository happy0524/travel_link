import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MapboxSearch} from '../src/mapbox-search.js';
import {wallStart,wallToInstant} from '../src/engine.js';
import {findDestination} from '../src/itinerary.js';
test('Mapbox tile/search duplicate identity preserves distinct Google IDs',()=>{
 const place={id:'search-id',source:'mapbox',name:'Central Park',lat:40.78,lng:-73.96},visit={id:'visit',place};
 assert.equal(findDestination([visit],{...place,id:'tile-id',source:'mapbox-tile',lat:40.78001}),visit);
 assert.equal(findDestination([{id:'a',place:{...place,source:'live'}}],{...place,id:'another-id',source:'live'}),undefined);
});
test('Search Box suggest/retrieve shares one UUID session and rotates after selection',async()=>{
 const urls=[];let time=100;
 const p=new MapboxSearch(()=> 'pk.test',{now:()=>time,fetcher:async url=>{const u=new URL(url);urls.push(u);return {ok:true,json:async()=>u.pathname.includes('/suggest')?{suggestions:[{mapbox_id:'m-id',name:'Actual fixture',feature_type:'poi'}]}:{features:[{geometry:{type:'Point',coordinates:[-73.98,40.75]},properties:{mapbox_id:'m-id',name:'Actual fixture',full_address:'Fixture address',poi_category:['park']}}]}};}});
 const query='\uC13C\uD2B8\uB7F4 \uD30C\uD06C';
 const list=await p.suggest(query,[-73.98,40.75]);const session=p.session;const result=await p.retrieve(list[0]);
 assert.equal(urls[0].searchParams.get('q'),query);
 assert.ok(urls.every(u=>u.searchParams.get('language')==='en'));
 assert.equal(result.lng,-73.98);assert.equal(result.lat,40.75);assert.equal(result.source,'mapbox');assert.equal(urls[0].searchParams.get('session_token'),urls[1].searchParams.get('session_token'));assert.notEqual(p.session,session);
 assert.equal(urls[0].searchParams.get('proximity'),'-73.98,40.75');
 const old=p.session;time+=180000;await p.suggest('park',[-73.98,40.75]);assert.notEqual(p.session,old);
});
test('Search Box exposes authentication and rate errors without fake results',async()=>{
 for(const status of [403,429]){const p=new MapboxSearch(()=> 'pk.test',{fetcher:async()=>({ok:false,status})});await assert.rejects(p.suggest('park',[0,0]),status===403?/authentication failed/:/rate limit reached/);}
});
test('New York itinerary wall time observes DST independently of browser timezone',()=>{
 assert.equal(wallToInstant(wallStart('2027-01-15','09:00'),'America/New_York'),'2027-01-15T14:00:00.000Z');
 assert.equal(wallToInstant(wallStart('2027-07-15','09:00'),'America/New_York'),'2027-07-15T13:00:00.000Z');
});
