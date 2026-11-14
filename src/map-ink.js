// Stable decorative geometry only: never read tiles or modify provider coordinates.
export function inkSeed(id) {
  let seed=2166136261;
  for(const c of String(id)){seed^=c.charCodeAt(0);seed=Math.imul(seed,16777619);}
  return seed>>>0;
}
const variation=(seed,index)=>{
  let n=Math.imul(seed^(index+1),1597334677);n^=n>>>16;
  return (n>>>0)/4294967295*2-1;
};
const number=n=>Number(n.toFixed(3));
export function inkRoute(points,id,unit=1,secondary=false) {
  if(!points.length)return '';
  const seed=inkSeed(id+(secondary?':overprint':':line'));
  let path='M'+number(points[0].x)+','+number(points[0].y);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(!length)continue;
    // Endpoints remain exact. Control-point deviation stays below 0.8 screen px.
    const offset=variation(seed,i)*Math.min((secondary ? .8 : .45)*unit,length*.02);
    path+=' Q'+number((a.x+b.x)/2-dy/length*offset)+','+number((a.y+b.y)/2+dx/length*offset)+' '+number(b.x)+','+number(b.y);
  }
  return path;
}
export function inkNode(id,radius) {
  const seed=inkSeed(id),points=[];
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,r=radius+variation(seed,i)*.45;
    points.push({x:Math.cos(angle)*r,y:Math.sin(angle)*r});
  }
  let path='M'+number((points[15].x+points[0].x)/2)+','+number((points[15].y+points[0].y)/2);
  for(let i=0;i<16;i++){
    const p=points[i],q=points[(i+1)%16];
    path+=' Q'+number(p.x)+','+number(p.y)+' '+number((p.x+q.x)/2)+','+number((p.y+q.y)/2);
  }
  return path+' Z';
}
