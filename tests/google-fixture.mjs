// Local Google interface fixture. Every Google network URL is blocked.
export async function mockGoogle(page) {
  const calls=[];calls.timezones=[];
  await page.route(/https:\/\/[^/]*(googleapis|gstatic)\.com\//,route=>route.abort());
  await page.route('**/api/config',route=>route.fulfill({json:{browserKey:'fixture',serverReady:true,requestMonitor:true}}));
  await page.route('**/api/timezone?*',route=>{calls.timezones.push(route.request().url());return route.fulfill({json:{zone:'Asia/Seoul'}});});
  await page.route('**/api/route',async route=>{
    const body=route.request().postDataJSON();calls.push(body);
    await new Promise(resolve=>setTimeout(resolve,80));
    const minutes=body.from.lat<body.to.lat?10:30;
    await route.fulfill({json:{status:'ok',minutes,details:'WALK + BUS',source:'live',polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@'}}).catch(()=>{});
  });
  await page.addInitScript(()=>{
    const stats=window.__googleStats={searches:0,details:0,maps:0,fields:[],searchFields:[]};
    class LatLng {constructor(lat,lng){this.latitude=lat;this.longitude=lng;}lat(){return this.latitude;}lng(){return this.longitude;}}
    class Map {
      constructor(el){this.el=el;this.zoom=14;this.listeners={};stats.maps++;window.__googleFixtureMap=this;}
      panTo(){this.overlay?.draw();} addListener(name,fn){this.listeners[name]=fn;}
      setZoom(z){this.zoom=z;this.overlay?.draw();} getZoom(){return this.zoom;}
    }
    class OverlayView {
      setMap(map){this.map=map;map.overlay=this;this.onAdd();this.draw();}
      getPanes(){return {overlayMouseTarget:this.map.el};}
      getProjection(){return {fromLatLngToDivPixel:p=>({x:(p.lng()-126.963)*17000+50,y:(37.592-p.lat())*15000+50})};}
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
