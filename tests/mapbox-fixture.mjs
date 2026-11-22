// Browser-only interface mock. No real token, WebGL, tiles, or paid requests.
import {streetsFixture} from './streets-layer-fixture.mjs';
function installMapbox({fail,delay,style}){
 const stats=window.__mapboxStats={maps:0,removes:0,resizes:0,markers:0,moves:[]};
 class Map{
  constructor(options){this.options=options;this.style=structuredClone(style);this.container=options.container;this.camera=options.bounds||[[-74.01,40.73],[-73.94,40.8]];this.zoom=options.zoom??9;this.handlers={};stats.maps++;window.__mapboxFixture=this;
   const legal=document.createElement('div');legal.dataset.mapboxAttribution='true';legal.textContent='Mapbox fixture attribution';Object.assign(legal.style,{position:'absolute',bottom:'0',height:'24px',background:'white'});this.container.append(legal);
   this.images=new Set();this.sources={};this.loaded=false;
   this.timer=setTimeout(()=>{if(!fail){this.loaded=true;this.emit('style.load',{});}this.emit(fail?'error':'load',fail?{error:{status:401,message:'fixture auth failure'}}:{});},delay);
  }
  on(name,layerOrFn,fn){(this.handlers[name]??=new Set()).add(fn||layerOrFn);return this;}
  off(name,layerOrFn,fn){this.handlers[name]?.delete(fn||layerOrFn);return this;}
  emit(name,event){for(const fn of [...(this.handlers[name]||[])])fn(event);}
  getStyle(){return structuredClone(this.style);}
  getFog(){return this.style.fog;}
  setFog(fog){this.style.fog=structuredClone(fog);}
  queryRenderedFeatures(){return this.poiFeature?[this.poiFeature]:[];}
  getLayer(id){return this.style.layers.find(l=>l.id===id);}
  getPaintProperty(id,key){return this.getLayer(id).paint?.[key];}
  setPaintProperty(id,key,value){(this.getLayer(id).paint??={})[key]=structuredClone(value);}
  getLayoutProperty(id,key){return this.getLayer(id).layout?.[key];}
  setLayoutProperty(id,key,value){(this.getLayer(id).layout??={})[key]=structuredClone(value);}
  getFilter(id){return this.getLayer(id).filter;}
  setFilter(id,value){this.getLayer(id).filter=structuredClone(value);}
  setLayerZoomRange(id,min,max){Object.assign(this.getLayer(id),{minzoom:min,maxzoom:max});}
  hasImage(id){return this.images.has(id);}addImage(id){this.images.add(id);}
  isStyleLoaded(){return this.loaded;}
  getSource(id){return this.sources[id];}
  addSource(id,source){this.sources[id]={data:source.data,setData(data){this.data=data;}};}
  addLayer(layer){this.style.layers.push(structuredClone(layer));}
  reloadStyle(){this.style=structuredClone(style);this.images.clear();this.sources={};this.loaded=false;this.emit('style.load',{});setTimeout(()=>{this.loaded=true;this.emit('idle',{});},10);}
  resize(){stats.resizes++;return this;}
  setPadding(padding){this.padding=padding;return this;}
  getBounds(){const b=this.camera;return {getWest:()=>b[0][0],getSouth:()=>b[0][1],getEast:()=>b[1][0],getNorth:()=>b[1][1]};}
  fitBounds(b){this.camera=b;this.zoom=13;return this;}
  move({center,zoom,padding},method){
   if(center){const dx=center[0]-(this.camera[0][0]+this.camera[1][0])/2,dy=center[1]-(this.camera[0][1]+this.camera[1][1])/2;this.camera=this.camera.map(([x,y])=>[x+dx,y+dy]);}
   if(zoom!==undefined)this.zoom=zoom;
   if(padding)this.padding=padding;
   stats.moves.push({method,center,zoom,padding});this.emit('moveend',{});
  }
  easeTo(options){this.move(options,'ease');}
  jumpTo(options){this.move(options,'jump');}
  flyTo(options){this.move(options,'fly');}
  getZoom(){return this.zoom;}setZoom(z){this.zoom=z;}
  getCenter(){return {lng:(this.camera[0][0]+this.camera[1][0])/2,lat:(this.camera[0][1]+this.camera[1][1])/2};}
  remove(){clearTimeout(this.timer);this.handlers={};this.container.replaceChildren();stats.removes++;}
 }
 class Marker{
  constructor({element}){this.element=element;stats.markers++;}
  setLngLat(coords){this.coords=coords;return this;}
  addTo(map){this.map=map;const [[west,south],[east,north]]=map.camera;Object.assign(this.element.style,{position:'absolute',left:((this.coords[0]-west)/(east-west)*map.container.clientWidth)+'px',top:((north-this.coords[1])/(north-south)*map.container.clientHeight)+'px'});map.container.append(this.element);return this;}
  remove(){this.element.remove();}
 }
 window.mapboxgl={Map,Marker};
}
export async function mockMapbox(page,{fail=false,delay=10}={}){
 const loads=[];
 await page.route('https://api.mapbox.com/**',route=>{
  loads.push(route.request().url());
  if(route.request().url().endsWith('.css'))return route.fulfill({contentType:'text/css',body:'.mapboxgl-map{position:relative;}'});
  if(route.request().url().endsWith('.js'))return route.fulfill({contentType:'text/javascript',body:`(${installMapbox.toString()})(${JSON.stringify({fail,delay,style:streetsFixture})});`});
  return route.abort();
 });
 return loads;
}
