import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapOptions,watercolorMapStyles,routeArrows} from '../src/map-style.js';
test('fallback and cloud options are mutually exclusive and always roadmap',()=>{
 const embedded=mapOptions();assert.equal(embedded.styles,watercolorMapStyles);assert.ok(!('mapId' in embedded));
 const cloud=mapOptions(' test-map-id ');assert.equal(cloud.mapId,'test-map-id');assert.ok(!('styles' in cloud));
 assert.equal(cloud.mapTypeId,'roadmap');assert.equal(embedded.mapTypeId,'roadmap');
});
test('atlas palette, sparse labels and road weight hierarchy are explicit',()=>{
 const fill=type=>watercolorMapStyles.find(s=>s.featureType===type&&s.elementType==='geometry.fill').stylers;
 const weight=type=>fill(type).find(s=>'weight' in s).weight;
 assert.ok(fill('road.highway').some(s=>s.color==='#1D1C22'));
 assert.ok(weight('road.highway')>weight('road.arterial'));
 assert.ok(weight('road.arterial')>weight('road'));
 assert.ok(weight('road')>weight('road.local'));
 assert.ok(watercolorMapStyles.some(s=>s.featureType==='water'&&s.stylers.some(v=>v.color==='#9BC9E8')));
 assert.ok(watercolorMapStyles.some(s=>s.featureType==='poi'&&s.elementType==='labels'&&s.stylers.some(v=>v.visibility==='off')));
});
test('screen-space repeated arrows follow direction and stay bounded at extreme zoom',()=>{
 const path=routeArrows([{x:0,y:0},{x:400,y:0}]);assert.equal((path.match(/M/g)||[]).length,4);
 assert.ok(!path.includes('NaN'));assert.equal(routeArrows([{x:0,y:0},{x:0,y:0}]),'');
 assert.equal((routeArrows([{x:0,y:0},{x:1e8,y:0}]).match(/M/g)||[]).length,200);
 assert.ok(routeArrows([{x:0,y:400},{x:0,y:0}]).includes('Q'));
});
