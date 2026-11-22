// Each edge has its own stable sequence of irregular knots in physical pixels.
function randomSequence(seed){
  return ()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
}

function contour(width,height){
  const inset=5;
  const radius=Math.min(13,width/5,height/5);
  if(Math.min(width,height)<=inset*2)return 'inset(1px round 3px)';
  const coordinate=p=>p.map(value=>value.toFixed(1)).join(',');
  const midpoint=(a,b)=>coordinate(a.map((value,i)=>(value+b[i])/2));
  const edge=(x,y,dx,dy,length,nx,ny,seed)=>{
    const random=randomSequence(seed),points=[[x,y]];
    let offset=0;
    for(let d=4+random()*9;d<length-4;d+=3+20*random()**2){
      const taper=Math.min(1,d/14,(length-d)/14);
      offset=offset*.22+(random()*2-1)*(1.1+3.2*random());
      points.push([x+dx*d+nx*offset*taper,y+dy*d+ny*offset*taper]);
    }
    const end=[x+dx*length,y+dy*length];
    points.push(end);
    return points.slice(1,-1).map((point,i)=>`Q${coordinate(point)} ${midpoint(point,points[i+2])}`).join(' ')+` L${coordinate(end)}`;
  };
  const horizontal=width-2*radius,vertical=height-2*radius;
  const right=width-inset,bottom=height-inset;
  const outline=[
    `M${radius},${inset}`,edge(radius,inset,1,0,horizontal,0,1,93217),
    `Q${right},${inset} ${right},${radius}`,edge(right,radius,0,1,vertical,-1,0,35831),
    `Q${right},${bottom} ${width-radius},${bottom}`,edge(width-radius,bottom,-1,0,horizontal,0,-1,58703),
    `Q${inset},${bottom} ${inset},${height-radius}`,edge(inset,height-radius,0,-1,vertical,1,0,15683),
    `Q${inset},${inset} ${radius},${inset} Z`
  ];
  return `path("${outline.join(' ')}")`;
}

const observer=new ResizeObserver(entries=>{
    for(const {target} of entries){
      const {width,height,bottom}=target.getBoundingClientRect();
      if(!width||!height)continue;
      target.style.setProperty('--wood-edge',contour(width,height));
      if(target.tagName==='HEADER')document.documentElement.style.setProperty('--header-end',`${bottom}px`);
    }
});

let selectedVisit;
export function decorateSelectedVisit(visit){
  if(selectedVisit)observer.unobserve(selectedVisit);
  selectedVisit=visit;
  if(visit)observer.observe(visit);
}

export function decorateWoodPanels(){
  document.querySelectorAll('.wood-panel').forEach(panel=>observer.observe(panel));
}
