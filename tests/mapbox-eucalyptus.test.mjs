import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eucalyptus,applyEucalyptus,allowedRouteFeatures,validMapboxPlace} from '../src/mapbox-eucalyptus.js';
import {streetsFixture} from './streets-layer-fixture.mjs';
test('eucalyptus applies inspected Classic layers idempotently without touching application routes',()=>{
 const style=structuredClone(streetsFixture),images=new Set();let writes=0;
 style.layers.find(l=>l.id==='poi-label').layout['icon-image']=['get','maki'];
 const layer=id=>{const l=style.layers.find(l=>l.id===id);assert.ok(l,'Unknown layer '+id);return l;};
 const map={getStyle:()=>structuredClone(style),getPaintProperty:(id,k)=>layer(id).paint?.[k],setPaintProperty:(id,k,v)=>{(layer(id).paint??={})[k]=v;writes++;},
  getLayoutProperty:(id,k)=>layer(id).layout?.[k],setLayoutProperty:(id,k,v)=>{(layer(id).layout??={})[k]=v;writes++;},
  getFilter:id=>layer(id).filter,setFilter:(id,v)=>{layer(id).filter=v;writes++;},
  setLayerZoomRange:(id,min,max)=>{Object.assign(layer(id),{minzoom:min,maxzoom:max});writes++;},
  hasImage:id=>images.has(id),addImage:(id,image,options)=>{assert.equal(options.sdf,true);assert.equal(image.data.length,32*32*4);images.add(id);}};
 const route=structuredClone(layer('itinerary-route'));
 applyEucalyptus(map);const p=eucalyptus.palette;
 assert.equal(layer('land').paint['background-color'],p.land);assert.equal(layer('water').paint['fill-color'],p.water);
 assert.equal(layer('building').paint['fill-color'],p.building);assert.equal(layer('building').paint['fill-outline-color'],p.buildingOutline);
 assert.equal(layer('road-label').paint['text-color'],'#faf8f0');assert.equal(layer('road-label').paint['text-halo-width'],.65);
 const road=layer('road-street').paint['line-color'];
 for(const color of [p.majorRoad,p.secondaryRoad,p.street,p.path])assert.ok(road.includes(color));
 const land=layer('landuse').paint['fill-color'];for(const color of [p.forest,p.park,p.residential,p.zoned])assert.ok(land.includes(color));
 assert.equal(land[land.indexOf('commercial_area')+1],'#96a281');
 assert.equal(layer('poi-label').paint['icon-color'],p.label);assert.equal(layer('poi-label').minzoom,13);
 assert.equal(layer('hillshade').layout.visibility,'none');assert.deepEqual(layer('itinerary-route'),route);
 const before=writes;applyEucalyptus(map);assert.equal(writes,before);assert.equal(images.size,1);
});
test('Mapbox route rendering never invents lines or reuses Google provenance',()=>{
 const geometry={type:'LineString',coordinates:[[126.97,37.56],[126.98,37.57]]};
 const valid={status:'ok',source:'mapbox',geometry};
 assert.deepEqual(allowedRouteFeatures({google:{...valid,source:'live'},unknown:{...valid,source:undefined},absent:null,noGeometry:{status:'ok',source:'manual'},point:{...valid,geometry:{type:'Point',coordinates:[0,0]}},bad:{...valid,geometry:{type:'LineString',coordinates:[[200,37],[127,38]]}}}),[]);
 assert.equal(allowedRouteFeatures({existing:valid}).length,1);
 assert.equal(validMapboxPlace({source:'live',lat:37,lng:127}),false);assert.equal(validMapboxPlace({source:'example',lat:37,lng:127}),true);
});
