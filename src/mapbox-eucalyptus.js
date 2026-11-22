import {mapPalette} from './map-palette.js';
import {language} from './ui-copy.js';
export const localizedNameField='name_'+language;
// Mapbox GL JS 3.35.0 / Classic Streets v12. Element paints, never a CSS filter.
// Inspected live style: 134 layers; Mapbox Streets v8 composite vector source.
export const eucalyptus={
 version:'3.35.0',style:'mapbox://styles/mapbox/streets-v12',
 camera:{pitch:0,bearing:0,maxPitch:0,dragRotate:false,pitchWithRotate:false,touchPitch:false},
 palette:{...mapPalette,residential:mapPalette.land,zoned:mapPalette.land,forest:mapPalette.park,roadBase:'#CBD5CC',path:'#A0B9A5',
  rail:'#6A8878',boundary:'#91A89A',route:'#258DDA',routeCasing:'#E6F4FF',routeFlow:'#BEF2FF'},
 density:{neighborhoodZoom:12.5,roadLabelZoom:12,poiZoom:13,poiRank:2,poiDetailZoom:15,poiDetailRank:5},
 route:{sourceId:'travel-link-itinerary',lineId:'travel-link-route',casingId:'travel-link-route-casing',flowId:'travel-link-route-flow',width:5,casingWidth:8,flowInterval:80}
};

const poiIcon='travel-link-poi-dot';
function ensurePoiIcon(map){
 if(map.hasImage(poiIcon))return;
 const size=32,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;
  data[i+3]=Math.max(0,Math.min(255,192+(8-Math.hypot(x-15.5,y-15.5))*16));
 }
 // Official SDF icon paint support; unifies multicolored POI/brand sprites.
 map.addImage(poiIcon,{width:size,height:size,data},{sdf:true});
}
export function applyEucalyptus(map,design=eucalyptus){
 const style=map.getStyle();if(!style?.layers)return;
 const p=design.palette,d=design.density;
 const bases=new Set(Object.entries(style.sources||{}).filter(([,s])=>s.type==='vector'&&s.url?.includes('mapbox.mapbox-streets-v8')).map(([id])=>id));
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const paint=(id,k,v)=>{if(!same(map.getPaintProperty(id,k),v))map.setPaintProperty(id,k,v);};
 const layout=(id,k,v)=>{if(!same(map.getLayoutProperty(id,k),v))map.setLayoutProperty(id,k,v);};
 const zoom=(l,min)=>{if(l.minzoom!==min)map.setLayerZoomRange(l.id,min,l.maxzoom??24);};
 const road=['match',['get','class'],['motorway','motorway_link','trunk','trunk_link','primary','primary_link'],p.majorRoad,
  ['secondary','secondary_link','tertiary','tertiary_link'],p.secondaryRoad,['street','street_limited'],p.street,p.path];
 const landuse=['match',['get','class'],['wood','forest'],p.forest,['park','grass','scrub','pitch','cemetery','agriculture'],p.park,
  'commercial_area',p.commercial,p.land];
 for(const l of style.layers){
  const {id,type}=l,s=l['source-layer'];
  if(id==='land'&&type==='background'){paint(id,'background-color',p.land);continue;}
  if(!bases.has(l.source))continue;
  if(['fill-extrusion','model','building'].includes(type)||['hillshade','depth'].includes(s)||['water-shadow','waterway-shadow','building-number-label','block-number-label','golf-hole-label'].includes(id)){
   layout(id,'visibility','none');continue;
  }
  if(type==='fill'){
   if(s==='landcover'){paint(id,'fill-color',['match',['get','class'],['wood','forest'],p.forest,['grass','scrub','crop'],p.park,p.land]);paint(id,'fill-opacity',1);}
   else if(s==='landuse_overlay'){paint(id,'fill-color',p.park);paint(id,'fill-opacity',1);}
   else if(s==='landuse'){paint(id,'fill-color',landuse);paint(id,'fill-opacity',1);}
   else if(s==='water')paint(id,'fill-color',p.water);
   else if(s==='building'){paint(id,'fill-color',p.building);paint(id,'fill-outline-color',p.buildingOutline);}
   else if(s==='road'){
    if(l.paint?.['fill-pattern'])layout(id,'visibility','none');
    else{paint(id,'fill-color',road);if(l.paint?.['fill-outline-color'])paint(id,'fill-outline-color',p.street);}
   }else if(s==='aeroway')paint(id,'fill-color',p.secondaryRoad);
   else if(s==='structure')paint(id,'fill-color',p.roadBase);
  }else if(type==='line'){
   if(s==='waterway')paint(id,'line-color',p.water);
   else if(s==='road'){
    if(/rail|aerialway|ferry/.test(id))paint(id,'line-color',p.rail);
    else if(/-path-bg$|-steps-bg$/.test(id))paint(id,'line-color',p.roadBase);
    else paint(id,'line-color',road);
   }else if(s==='admin')paint(id,'line-color',p.boundary);
   else if(s==='landuse')paint(id,'line-color',p.park);
   else if(s==='aeroway')paint(id,'line-color',p.secondaryRoad);
   else if(s==='structure')paint(id,'line-color',p.street);
  }else if(type==='circle'&&s==='road'){
   paint(id,'circle-color',p.street);if(l.paint?.['circle-stroke-color'])paint(id,'circle-stroke-color',p.path);
  }else if(type==='symbol'){
   if(l.layout?.['text-field']){
    const major=['settlement-major-label','state-label','country-label'].includes(id);
    const roadName=id==='road-label'||id==='path-pedestrian-label';
    paint(id,'text-color',roadName?p.roadLabel:major?p.majorLabel:p.label);
    if(l.paint?.['text-halo-color']){paint(id,'text-halo-color',roadName?p.majorLabel:p.halo);paint(id,'text-halo-width',major?.85:.65);paint(id,'text-halo-blur',.15);}
    if(JSON.stringify(l.layout['text-field']).includes('"name'))layout(id,'text-field',['coalesce',['get',localizedNameField],['get','name']]);
   }
   if(l.layout?.['icon-image']){
    if(['poi_label','transit_stop_label','airport_label','natural_label'].includes(s)){
     ensurePoiIcon(map);layout(id,'icon-image',poiIcon);layout(id,'icon-size',.38);layout(id,'icon-optional',true);
     paint(id,'icon-color',p.label);paint(id,'icon-opacity',.85);paint(id,'icon-halo-color',p.halo);paint(id,'icon-halo-width',.5);
    }else paint(id,'icon-color-saturation',-1);
   }
   if(s==='poi_label'){
    zoom(l,d.poiZoom);
    const f=['<=',['get','filterrank'],['step',['zoom'],d.poiRank,d.poiDetailZoom,d.poiDetailRank]];
    if(!same(map.getFilter(id),f))map.setFilter(id,f);
   }
   if(id==='settlement-subdivision-label')zoom(l,d.neighborhoodZoom);
   if(id==='road-label')zoom(l,d.roadLabelZoom);
   if(id==='path-pedestrian-label')zoom(l,16);
   if(id==='transit-label')zoom(l,14);
  }
 }
}

export function validMapboxPlace(p){return ['example','user','manual','mapbox','mapbox-tile'].includes(p?.source)&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180;}
export function allowedRouteFeatures(routes){
 return Object.entries(routes||{}).flatMap(([id,r])=>{
  if(!r||r.status!=='ok'||!['mapbox','manual','user'].includes(r.source))return [];
  const geometry=r.geometry||r.geojson?.geometry;
  if(geometry?.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2)return [];
  if(!geometry.coordinates.every(c=>Array.isArray(c)&&c.length>=2&&Number.isFinite(c[0])&&Number.isFinite(c[1])&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90))return [];
  return [{type:'Feature',id,properties:{id},geometry}];
 });
}
