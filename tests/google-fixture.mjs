// Local Google interface fixture, not a claim of verified Google network integration.
export async function mockGoogle(page) {
  const calls=[];
  await page.route('**/api/config',route=>route.fulfill({json:{browserKey:'fixture',serverReady:true}}));
  await page.route('**/api/timezone?*',route=>route.fulfill({json:{zone:'Asia/Seoul'}}));
  await page.route('**/api/route',async route=>{
    const body=route.request().postDataJSON();calls.push(body);
    await new Promise(resolve=>setTimeout(resolve,80));
    const minutes=body.from.lat<body.to.lat?10:30;
    await route.fulfill({json:{status:'ok',minutes,details:'WALK + BUS',source:'live',polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@'}});
  });
  await page.addInitScript(()=>{
    class LatLng {constructor(lat,lng){this.latitude=lat;this.longitude=lng;}lat(){return this.latitude;}lng(){return this.longitude;}}
    class Map {
      constructor(el){this.el=el;this.zoom=14;}
      panTo(){} addListener(){} setZoom(z){this.zoom=z;this.overlay?.draw();} getZoom(){return this.zoom;}
    }
    class OverlayView {
      setMap(map){this.map=map;map.overlay=this;this.onAdd();this.draw();}
      getPanes(){return {overlayMouseTarget:this.map.el};}
      getProjection(){return {fromLatLngToDivPixel:p=>({x:(p.lng()-126.963)*17000+50,y:(37.592-p.lat())*15000+50})};}
    }
    class Place {
      static async searchByText({textQuery}) {
        return {places:[1,2,3].map(n=>({
          id:'ChIJ-stable-'+n,
          displayName:textQuery==='renamed'?'이름 변경 '+n:'동일한 장소명',
          formattedAddress:'샘플 주소 '+n,location:new LatLng(37.560+n*.008,126.97+n*.008),
        }))};
      }
    }
    window.google={maps:{Map,LatLng,OverlayView,importLibrary:async()=>({Place})}};
  });
  return calls;
}
