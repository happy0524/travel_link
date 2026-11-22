import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapOptions,greenMapStyles,routeArrows} from '../src/map-style.js';
import {mapPalette} from '../src/map-palette.js';
test('embedded and cloud options are mutually exclusive and always roadmap',()=>{
 const embedded=mapOptions();assert.equal(embedded.styles,greenMapStyles);assert.ok(!('mapId' in embedded));
 const cloud=mapOptions(' test-map-id ');assert.equal(cloud.mapId,'test-map-id');assert.ok(!('styles' in cloud));
 assert.equal(cloud.mapTypeId,'roadmap');assert.equal(embedded.mapTypeId,'roadmap');assert.equal(embedded.renderingType,'RASTER');
});
test('Google shares land, water, parks and business colors without coloring all POIs',()=>{
 const geometry=feature=>greenMapStyles.find(s=>s.featureType===feature&&s.elementType?.startsWith('geometry'))?.stylers[0].color;
 assert.equal(geometry('all'),mapPalette.land);
 assert.equal(geometry('landscape.man_made'),mapPalette.land);
 assert.equal(geometry('water'),mapPalette.water);
 assert.equal(geometry('poi.park'),mapPalette.park);
 assert.equal(geometry('poi.business'),mapPalette.commercial);
 assert.equal(geometry('poi'),undefined);
});
test('screen-space repeated arrows follow direction and stay bounded at extreme zoom',()=>{
 const path=routeArrows([{x:0,y:0},{x:400,y:0}]);assert.equal((path.match(/M/g)||[]).length,4);
 assert.ok(!path.includes('NaN'));assert.equal(routeArrows([{x:0,y:0},{x:0,y:0}]),'');
 assert.equal((routeArrows([{x:0,y:0},{x:1e8,y:0}]).match(/M/g)||[]).length,200);
 assert.ok(routeArrows([{x:0,y:400},{x:0,y:0}]).includes('Q'));
});
