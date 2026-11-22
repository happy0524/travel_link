import {destination} from './new-york.js';
import {mapPalette as p} from './map-palette.js';
const color=(featureType,elementType,value)=>({featureType,elementType,stylers:[{color:value}]});
// Embedded JSON styling applies only when no cloud Map ID is configured.
export const greenMapStyles = [
  color('all','geometry',p.land),
  color('all','labels.text.fill',p.label),
  color('all','labels.text.stroke',p.halo),
  color('administrative.locality','labels.text.fill',p.majorLabel),
  {elementType:'labels.icon',stylers:[{visibility:'off'}]},
  // Google groups built-up land and buildings here. Keep the shared land fill at city scale.
  color('landscape.man_made','geometry.fill',p.land),
  color('landscape.man_made','geometry.stroke',p.buildingOutline),
  {featureType:'administrative.land_parcel',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'poi.attraction',elementType:'labels.text',stylers:[{visibility:'on'}]},
  color('poi.business','geometry.fill',p.commercial),
  color('poi.park','geometry.fill',p.park),
  {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
  color('road','geometry.fill',p.street),
  color('road','labels.text.fill',p.roadLabel),
  color('road','labels.text.stroke',p.majorLabel),
  color('road','geometry.stroke',p.buildingOutline),
  {featureType:'road.local',elementType:'labels',stylers:[{visibility:'off'}]},
  color('road.highway','geometry.fill',p.majorRoad),
  color('road.highway','geometry.stroke',p.majorRoad),
  color('road.arterial','geometry.fill',p.secondaryRoad),
  color('water','geometry',p.water),
  {featureType:'water',elementType:'labels.text',stylers:[{visibility:'off'}]},
];
export function mapOptions(mapId='') {
  return {center:destination.center,zoom:destination.zoom,mapTypeId:'roadmap',
    mapTypeControl:false,streetViewControl:false,fullscreenControl:false,cameraControl:false,clickableIcons:true,
    ...(mapId.trim()?{mapId:mapId.trim()}:{renderingType:'RASTER',styles:greenMapStyles})};
}

// Screen-space chevrons, independent of Google APIs and route fetching.
export function routeArrows(points,unit=1,id='route') {
  const spacing=95*unit, margin=30*unit;
  let next=45*unit,total=0,out='',count=0;
  const length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
  for(let i=1;i<points.length&&count<200;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(!len)continue;
    while(next<=total+len&&next<length-margin&&count<200){
      const t=(next-total)/len,x=a.x+dx*t,y=a.y+dy*t,ux=dx/len,uy=dy/len;
      const seed=Array.from(id).reduce((n,c)=>n+c.charCodeAt(0),0)+count;
      const n=(4.8+(seed%5)*.1)*unit,back=(5.8+(seed%3)*.2)*unit;
      const left={x:x-ux*back-uy*n,y:y-uy*back+ux*n},right={x:x-ux*back+uy*n*.94,y:y-uy*back-ux*n*.94};
      out+='M'+left.x+','+left.y+' Q'+((left.x+x)/2+uy*.35*unit)+','+((left.y+y)/2-ux*.35*unit)+' '+x+','+y+' Q'+((right.x+x)/2-uy*.25*unit)+','+((right.y+y)/2+ux*.25*unit)+' '+right.x+','+right.y+' ';
      next+=spacing;count++;
    }
    total+=len;
  }
  return out;
}
