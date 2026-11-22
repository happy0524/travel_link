import test from 'node:test';
import assert from 'node:assert/strict';
import {createTripSave} from '../src/trip-save.js';
import {stopReference,restorePlaceId} from '../src/trip-stops.js';

test('manual and automatic saves share a queue and commit newer edits last',async()=>{
 const committed=[],states=[];
 let release;
 const queue=createTripSave({write:async snapshot=>{
  committed.push(snapshot);
  if(snapshot===1)await new Promise(resolve=>{release=resolve;});
 },onState:(...state)=>states.push(state),delay:60_000});
 queue.enqueue(1);
 const operation=queue.flush();
 await Promise.resolve();
 queue.enqueue(2);
 assert.equal(queue.flush(),operation);
 assert.deepEqual(states.at(-1),['saving',true]);
 release();
 assert.equal(await operation,true);
 assert.deepEqual(committed,[1,2]);
 assert.deepEqual(states.at(-1),['saved',false]);
});

test('save failure retains the latest snapshot for retry',async()=>{
 const committed=[];
 let fail=true;
 const queue=createTripSave({write:async snapshot=>{
  if(fail)throw Error('offline');
  committed.push(snapshot);
 },onState:()=>{},delay:60_000});
 queue.enqueue(1);
 assert.equal(await queue.flush(),false);
 queue.enqueue(2);fail=false;
 assert.equal(await queue.flush(),true);
 assert.deepEqual(committed,[2]);
});

test('old Google references are still restorable and temporary Mapbox IDs are omitted',()=>{
 assert.equal(restorePlaceId(stopReference({id:'visit-1',placeId:'places/ChIJ-test'})),'ChIJ-test');
 assert.equal(restorePlaceId(stopReference({id:'visit-2',provider:'mapbox',providerPlaceId:'temporary',googlePlaceId:'ChIJ-linked'})),'ChIJ-linked');
 assert.equal(restorePlaceId(stopReference({id:'visit-2',provider:'mapbox',providerPlaceId:'temporary'})),null);
 assert.equal(restorePlaceId(stopReference({id:'visit-3',placeId:null})),null);
});
