import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapOptions,greenMapStyles,routeArrows} from '../src/map-style.js';
test('fallback and cloud options are mutually exclusive and always roadmap',()=>{
 const embedded=mapOptions();assert.equal(embedded.styles,greenMapStyles);assert.ok(!('mapId' in embedded));
 const cloud=mapOptions(' test-map-id ');assert.equal(cloud.mapId,'test-map-id');assert.ok(!('styles' in cloud));
 assert.equal(cloud.mapTypeId,'roadmap');assert.equal(embedded.mapTypeId,'roadmap');
});
test('screen-space repeated arrows follow direction and stay bounded at extreme zoom',()=>{
 const path=routeArrows([{x:0,y:0},{x:400,y:0}]);assert.equal((path.match(/M/g)||[]).length,4);
 assert.ok(!path.includes('NaN'));assert.equal(routeArrows([{x:0,y:0},{x:0,y:0}]),'');
 assert.equal((routeArrows([{x:0,y:0},{x:1e8,y:0}]).match(/M/g)||[]).length,200);
 assert.ok(routeArrows([{x:0,y:400},{x:0,y:0}]).includes('Q'));
});
