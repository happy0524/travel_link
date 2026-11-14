// Embedded JSON styling applies only when no cloud Map ID is configured.
export const greenMapStyles = [
  {elementType:'geometry',stylers:[{color:'#C8D4CB'}]},
  {elementType:'labels.text.fill',stylers:[{color:'#143B2C'}]},
  {elementType:'labels.text.stroke',stylers:[{color:'#C8D4CB'}]},
  {elementType:'labels.icon',stylers:[{visibility:'off'}]},
  {featureType:'landscape.man_made',elementType:'geometry.fill',stylers:[{color:'#B4C2B8'}]},
  {featureType:'landscape.man_made',elementType:'geometry.stroke',stylers:[{color:'#789282'}]},
  {featureType:'administrative',elementType:'geometry.stroke',stylers:[{color:'#789282'}]},
  {featureType:'administrative.land_parcel',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'poi.attraction',elementType:'labels.text',stylers:[{visibility:'on'}]},
  {featureType:'poi.park',elementType:'geometry',stylers:[{color:'#4D775F'}]},
  {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'road',elementType:'geometry.fill',stylers:[{color:'#6F8F7D'}]},
  {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#789282'}]},
  {featureType:'road.local',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'road.highway',elementType:'geometry.fill',stylers:[{color:'#164F3B'}]},
  {featureType:'road.highway',elementType:'geometry.stroke',stylers:[{color:'#164F3B'}]},
  {featureType:'road.arterial',elementType:'geometry.fill',stylers:[{color:'#164F3B'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#B6C8C1'}]},
  {featureType:'water',elementType:'labels.text',stylers:[{visibility:'off'}]},
];
export function mapOptions(mapId='') {
  return {center:{lat:37.573,lng:126.987},zoom:14,mapTypeId:'roadmap',
    mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:true,
    ...(mapId.trim()?{mapId:mapId.trim()}:{styles:greenMapStyles})};
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
