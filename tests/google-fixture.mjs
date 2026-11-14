// Local Google interface fixture. Every Google network URL is blocked.
export async function mockGoogle(page,{mapId=''}={}) {
  const calls=[];calls.timezones=[];
  await page.route(/https:\/\/[^/]*(googleapis|gstatic)\.com\//,route=>route.abort());
  await page.route('**/api/config',route=>route.fulfill({json:{browserKey:'fixture',mapId,serverReady:true,requestMonitor:true}}));
  await page.route('**/api/timezone?*',route=>{calls.timezones.push(route.request().url());return route.fulfill({json:{zone:'Asia/Seoul'}});});
  await page.route('**/api/route',async route=>{
    const body=route.request().postDataJSON();calls.push(body);
    await new Promise(resolve=>setTimeout(resolve,80));
    const minutes=body.from.lat<body.to.lat?10:30;
    let lat=0,lng=0,polyline='';
    const encode=n=>{n=n<0?~(n<<1):n<<1;let s='';while(n>=32){s+=String.fromCharCode((32|(n&31))+63);n>>=5;}return s+String.fromCharCode(n+63);};
    for(const p of [body.from,body.to]){const a=Math.round(p.lat*1e5),b=Math.round(p.lng*1e5);polyline+=encode(a-lat)+encode(b-lng);lat=a;lng=b;}
    await route.fulfill({json:{status:'ok',minutes,details:'WALK + BUS',source:'live',polyline}}).catch(()=>{});
  });
  await page.addInitScript(()=>{
    const stats=window.__googleStats={searches:0,details:0,maps:0,fields:[],searchFields:[]};
    class LatLng {constructor(lat,lng){this.latitude=lat;this.longitude=lng;}lat(){return this.latitude;}lng(){return this.longitude;}}
    class Map {
      constructor(el,options){this.el=el;this.options=options;this.zoom=14;this.listeners={};stats.maps++;window.__googleFixtureMap=this;
        const legal=document.createElement('div');legal.dataset.fixtureAttribution='true';legal.textContent='Test fixture: reserved legal notice area';Object.assign(legal.style,{position:'absolute',bottom:'0',right:'0',height:'22px',background:'white',fontSize:'11px'});el.append(legal);
      }
      panTo(){this.overlay?.draw();} addListener(name,fn){this.listeners[name]=fn;}
      setZoom(z){this.zoom=z;this.overlay?.draw();} getZoom(){return this.zoom;}
    }
    class OverlayView {
      setMap(map){this.map=map;map.overlay=this;this.onAdd();this.draw();}
      getPanes(){return {overlayMouseTarget:this.map.el};}
      getProjection(){const scale=2**(this.map.zoom-14),w=this.map.el.clientWidth,h=this.map.el.clientHeight;return {fromLatLngToDivPixel:p=>({x:(w*.2+(p.lng()-126.978)*w*25-w/2)*scale+w/2,y:(h*.65-(p.lat()-37.568)*h*15-h/2)*scale+h/2})};}
    }
    class Place {
      constructor({id,name}){
        const n=Number(id.split('-').at(-1));
        Object.assign(this,{id,displayName:name||'Same place name',formattedAddress:'Sample address '+n,
          location:new LatLng(37.560+n*.008,126.97+n*.008)});
      }
      async fetchFields({fields}){stats.details++;stats.fields.push(fields);return {place:this};}
      static async searchByText({textQuery,fields}) {
        stats.searches++;stats.searchFields.push(fields);
        return {places:Array.from({length:textQuery==='four'?4:3},(_,i)=>new Place({
          id:'ChIJ-stable-'+(i+1),name:textQuery==='renamed'?'Renamed '+(i+1):undefined}))};
      }
    }
    window.google={maps:{Map,LatLng,OverlayView,importLibrary:async()=>({Place})}};
  });
  return calls;
}
