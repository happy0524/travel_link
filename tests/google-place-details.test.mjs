import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveGoogleCandidates} from '../src/google-place-details.js';

const place={name:'Example Museum',address:'89 East 42nd Street, New York, NY',category:'museum',lat:40.751,lng:-73.977,featureType:'poi'};
function candidate({id='museum',name=place.name,address='89 E 42nd St, New York, NY 10017, USA',lat=place.lat,type='art_museum'}={}){
  return {id,displayName:name,formattedAddress:address,location:{lat:()=>lat,lng:()=>place.lng},primaryType:type};
}

test('matches a nearby venue with equivalent street address and category regardless of rank',()=>{
  const nearbyShop=candidate({id:'shop',name:'Example Museum Shop',type:'store'});
  assert.deepEqual(resolveGoogleCandidates(place,[nearbyShop,candidate()]),{id:'museum'});
});

test('does not auto-link an ambiguous result, road, nearby wrong building, or far match',()=>{
  for(const results of [
    [candidate(),candidate({id:'second'})],
    [candidate({type:'route'})],
    [candidate({address:'91 E 42nd St, New York, NY'})],
    [candidate({name:'Example Museum Annex'})],
    [candidate({lat:40.76})],
  ])assert.ok(!resolveGoogleCandidates(place,results).id);
  assert.ok(!resolveGoogleCandidates({...place,featureType:'street'},[candidate()]).id);
  assert.ok(!resolveGoogleCandidates(place,[candidate()],{rematch:true}).id);
});
