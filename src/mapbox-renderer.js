import {eucalyptus,applyEucalyptus,allowedRouteFeatures,validMapboxPlace,localizedNameField} from './mapbox-eucalyptus.js';
import {language,ui} from './ui-copy.js';

// Mapbox's default ease with the first control point shifted slightly to the right.
function arrivalZoomEase(progress){
 if(progress===0||progress===1)return progress;
 const coordinate=(t,a,b)=>3*(1-t)**2*t*a+3*(1-t)*t*t*b+t**3;
 let lower=0,upper=1;
 for(let i=0;i<16;i++){
  const middle=(lower+upper)/2;
  if(coordinate(middle,.29,.25)<progress)lower=middle;
  else upper=middle;
 }
 return coordinate((lower+upper)/2,.1,1);
}
let sdkLoad;
export function loadMapbox(){
 if(globalThis.mapboxgl)return Promise.resolve();
 if(sdkLoad)return sdkLoad;
 sdkLoad=new Promise((resolve,reject)=>{
  if(!document.querySelector('[data-mapbox-css]')){
   const css=document.createElement('link');css.rel='stylesheet';css.dataset.mapboxCss='true';
   css.href=`https://api.mapbox.com/mapbox-gl-js/v${eucalyptus.version}/mapbox-gl.css`;document.head.append(css);
  }
  const script=document.createElement('script');
  const timer=setTimeout(()=>finish(Error('Mapbox took too long to load.')),15000);
  function finish(error){clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();}
  script.src=`https://api.mapbox.com/mapbox-gl-js/v${eucalyptus.version}/mapbox-gl.js`;
  script.onload=()=>finish(globalThis.mapboxgl?null:Error('Could not load Mapbox.'));
  script.onerror=()=>finish(Error('Could not load Mapbox.'));
  document.head.append(script);
 }).catch(error=>{sdkLoad=null;throw error;});
 return sdkLoad;
}
export class MapboxRenderer{
 constructor(container,{onSelect,onEdge,onPlace,onCamera,onError}){Object.assign(this,{container,onSelect,onEdge,onPlace,onCamera,onError});this.markers=new Map();this.routes={};this.routeSignature='';}
 async activate(token,bounds,globePadding,arrival=false){
  this.container.style.display='block';
  const p=eucalyptus.palette;
  for(const key of ['marker','markerOutline'])this.container.style.setProperty('--mapbox-'+key,p[key]);
  this.container.style.background=p.land;
  const padding=globePadding||{top:0,bottom:0,left:0,right:0};
  const span=arrival?Math.min(this.container.clientWidth,this.container.clientHeight)
   :Math.min(this.container.clientWidth-padding.left-padding.right,this.container.clientHeight-padding.top-padding.bottom);
  const camera=bounds?{bounds,fitBoundsOptions:{padding:0,duration:0}}:{center:[-38,25],zoom:Math.max(-1.5,Math.min(2,Math.log2(Math.max(1,span)/242)))};
  const map=this.map=new mapboxgl.Map({container:this.container,accessToken:token,style:eucalyptus.style,language,projection:'globe',...camera,...eucalyptus.camera,attributionControl:true});
  this.arrivalPose=arrival;
  if(globePadding){map.setPadding(padding);this.initialPadding=true;}
  this.styleHandler=()=>{
   const fog=map.getFog();
   const stars=['interpolate',['linear'],['zoom'],2,0.5,5,0.22,6,0];
   if(JSON.stringify(fog?.['star-intensity'])!==JSON.stringify(stars))map.setFog({...fog,'star-intensity':stars});
   applyEucalyptus(map);this.routeSignature='';this.renderRoutes(this.routes);
  };
  // Paint changes during style.load can temporarily make isStyleLoaded false.
  // Retry on idle; signature checks make subsequent idle events read-only.
  this.routeRestoreHandler=()=>this.renderRoutes(this.routes);
  this.errorHandler=e=>{if(this.ready&&[401,403].includes(e.error?.status))this.onError(ui.mapboxAuth);};
  this.routeClick=e=>{const id=e.features?.[0]?.properties?.id;if(id)this.onEdge(id);};
  this.poiClick=e=>{
   if(e.originalEvent?.target?.closest?.('.mapbox-visit'))return;
   const layers=map.getStyle()?.layers.filter(l=>l.type==='symbol'&&l['source-layer']==='poi_label').map(l=>l.id)||[];
   if(!layers.length)return;
   const placeName=f=>f.properties?.[localizedNameField]||f.properties?.name;
   const f=map.queryRenderedFeatures(e.point,{layers}).find(f=>f.geometry?.type==='Point'&&placeName(f)),p=f?.properties;
   if(!p||f.geometry?.type!=='Point')return;
   const [lng,lat]=f.geometry.coordinates,name=placeName(f);
   if(name)this.onPlace?.({id:'mapbox-tile:'+String(f.id||name+lng+lat),name,category:p.category||p.maki||'Map place',lng,lat,source:'mapbox-tile'});
  };
  this.motion=matchMedia('(prefers-reduced-motion: reduce)');
  this.visibilityHandler=()=>this.syncFlow();
  document.addEventListener('visibilitychange',this.visibilityHandler);this.motion.addEventListener('change',this.visibilityHandler);
  map.on('click',this.poiClick);
  this.cameraHandler=()=>{if(!this.suppressCameraSave)this.onCamera?.(this.bounds());};map.on('moveend',this.cameraHandler);
  map.on('style.load',this.styleHandler);map.on('idle',this.routeRestoreHandler);map.on('error',this.errorHandler);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(Error('Mapbox map loading timed out.')),20000);
   const loaded=()=>{this.styleHandler();this.ready=true;finish();};
   const failed=e=>finish(Error(e.error?.status===401||e.error?.status===403?ui.mapboxAuth:'Could not load the Mapbox map.'));
   const finish=error=>{clearTimeout(timer);map.off('load',loaded);map.off('error',failed);this.cancelLoad=null;error?reject(error):resolve();};
   this.cancelLoad=()=>finish(new DOMException('Cancelled','AbortError'));
   map.on('load',loaded);map.on('error',failed);
  });
  this.resize();
 }
 render(visits,selected,routes){
  if(!this.map)return;
  const allowed=visits.filter(v=>validMapboxPlace(v.place)),ids=new Set(allowed.map(v=>v.id));
  for(const [id,item] of this.markers)if(!ids.has(id)){item.element.onclick=null;item.marker.remove();this.markers.delete(id);}
  allowed.forEach(v=>{
   let item=this.markers.get(v.id);
   if(!item){
    const element=document.createElement('button');element.type='button';element.className='mapbox-visit';element.dataset.node=v.id;
    element.onclick=e=>{e.stopPropagation();this.onSelect(v.id);};
    const marker=new mapboxgl.Marker({element,anchor:'center'}).setLngLat([v.place.lng,v.place.lat]).addTo(this.map);
    item={element,marker};this.markers.set(v.id,item);
   }
   const index=visits.findIndex(x=>x.id===v.id)+1;
   item.marker.setLngLat([v.place.lng,v.place.lat]);item.element.textContent=String(index);
   item.element.classList.toggle('selected',v.id===selected);item.element.setAttribute('aria-pressed',String(v.id===selected));
   item.element.setAttribute('aria-label',`Select stop ${index}: ${v.place.name}`);
  });
  this.renderRoutes(routes);
 }
 renderRoutes(routes={}){
  this.routes=routes;if(!this.map?.isStyleLoaded())return;
  const features=allowedRouteFeatures(routes),signature=JSON.stringify(features),r=eucalyptus.route,p=eucalyptus.palette;
  if(!features.length&&!this.map.getSource(r.sourceId)){
   this.hasRoutes=false;this.syncFlow();
   if(this.routeBound){this.map.off('click',r.lineId,this.routeClick);this.routeBound=false;}return;
  }
  if(!this.map.getSource(r.sourceId))this.map.addSource(r.sourceId,{type:'geojson',data:{type:'FeatureCollection',features}});
  else if(this.routeSignature!==signature)this.map.getSource(r.sourceId).setData({type:'FeatureCollection',features});
  this.routeSignature=signature;
  if(!this.map.getLayer(r.casingId))this.map.addLayer({id:r.casingId,type:'line',source:r.sourceId,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':p.routeCasing,'line-width':r.casingWidth}});
  if(!this.map.getLayer(r.lineId))this.map.addLayer({id:r.lineId,type:'line',source:r.sourceId,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':p.route,'line-width':r.width}});
  if(!this.map.getLayer(r.flowId))this.map.addLayer({id:r.flowId,type:'line',source:r.sourceId,layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':p.routeFlow,'line-width':2,'line-dasharray':[0,4,3]}});
  this.hasRoutes=features.length>0;this.syncFlow();
  if(!this.routeBound){this.map.on('click',r.lineId,this.routeClick);this.routeBound=true;}
 }
 syncFlow(){
  const r=eucalyptus.route;
  const animate=this.map&&this.hasRoutes&&!document.hidden&&!this.motion?.matches;
  if(!animate){clearInterval(this.flowTimer);this.flowTimer=null;return;}
  if(this.flowTimer)return;
  this.flowTimer=setInterval(()=>{
   if(!this.map?.getLayer(r.flowId))return;
   const phase=((this.flowStep=(this.flowStep||0)+1)%14)*.5;
   const dash=phase<=3?[phase,4,3-phase]:[0,phase-3,3,7-phase];
   this.map.setPaintProperty(r.flowId,'line-dasharray',dash);
  },r.flowInterval);
 }
 bounds(){const b=this.map?.getBounds();return b?[[b.getWest(),b.getSouth()],[b.getEast(),b.getNorth()]]:null;}
 positionArrival(){
  if(!this.ready)return;
  const span=Math.min(this.container.clientWidth,this.container.clientHeight);
  this.map.jumpTo({center:[-38,25],zoom:Math.max(-1.5,Math.min(2,Math.log2(Math.max(1,span)/242))),
   padding:{top:Math.round(this.container.clientHeight*.95),bottom:0,left:0,right:0}});
  this.initialPadding=true;
  this.arrivalPose=true;
 }
 moveArrival(method,options,duration,reducedMotion){
  if(!this.ready)return Promise.resolve();
  const map=this.map;
  return new Promise(resolve=>{
   if(reducedMotion){map.jumpTo(options);resolve();return;}
   const timeout=setTimeout(finish,duration+450);
   function finish(){clearTimeout(timeout);map.off('moveend',finish);resolve();}
   map.on('moveend',finish);
   map[method]({...options,duration});
  });
 }
 async raiseArrival(reducedMotion){
  this.arrivalPose=false;
  await this.moveArrival('easeTo',{padding:{top:0,bottom:0,left:0,right:0}},1500,reducedMotion);
  this.initialPadding=false;
 }
 zoomArrival(center,reducedMotion){
  return this.moveArrival('flyTo',{center:[center.lng,center.lat],zoom:11,easing:arrivalZoomEase},1800,reducedMotion);
 }
 preview(place){
  if(!this.map)return;
  if(!validMapboxPlace(place)){this.previewMarker?.remove();this.previewMarker=null;return;}
  if(!this.previewMarker){const element=document.createElement('button');element.type='button';element.className='mapbox-visit mapbox-preview';element.textContent='+';element.setAttribute('aria-label','Selected place');element.onclick=()=>this.onPlace?.(this.previewPlace);this.previewMarker=new mapboxgl.Marker({element}).setLngLat([place.lng,place.lat]).addTo(this.map);}
  this.previewPlace=place;this.previewMarker.setLngLat([place.lng,place.lat]);
 }
 clearInitialPadding(){if(this.initialPadding){this.map.setPadding({top:0,bottom:0,left:0,right:0});this.initialPadding=false;}}
 focus(p){if(this.map&&validMapboxPlace(p)){this.suppressCameraSave=p.source==='mapbox';this.clearInitialPadding();this.map.easeTo({center:[p.lng,p.lat],zoom:Math.max(14,this.map.getZoom()),duration:0});this.suppressCameraSave=false;}}
 zoom(delta){if(this.map)this.map.setZoom(this.map.getZoom()+delta);}
 fit(bounds,padding=0){if(!this.map)return;this.clearInitialPadding();this.map.fitBounds(bounds,{padding,duration:0,maxZoom:16,retainPadding:false});}
 resize(){
  if(!this.map||!this.container.clientWidth||!this.container.clientHeight)return;
  this.map.resize();
  if(this.arrivalPose&&this.ready)this.positionArrival();
 }
 destroy(){
  this.previewMarker?.remove();this.previewMarker=null;
  clearInterval(this.flowTimer);this.flowTimer=null;
  document.removeEventListener('visibilitychange',this.visibilityHandler);this.motion?.removeEventListener('change',this.visibilityHandler);
  this.cancelLoad?.();
  for(const {element,marker} of this.markers.values()){element.onclick=null;marker.remove();}this.markers.clear();
  if(this.map){
   this.map.off('style.load',this.styleHandler);this.map.off('idle',this.routeRestoreHandler);this.map.off('error',this.errorHandler);
   this.map.off('click',this.poiClick);
   this.map.off('moveend',this.cameraHandler);
   if(this.routeBound)this.map.off('click',eucalyptus.route.lineId,this.routeClick);
   this.map.remove();this.map=null;
  }
  this.ready=false;this.routeBound=false;this.container.style.display='none';
 }
}
