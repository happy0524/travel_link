import {places,defaults,modes} from './data.js';
import {calculate,reconcile,segmentKey,stamp} from './engine.js';
import {DemoProvider,LiveProvider} from './providers.js';
import {findDestination,summarize,ReorderComparison} from './itinerary.js';
import {EfficientRouteProvider,PlacesProvider,loadGoogleMaps} from './efficient-providers.js';
import {requestConfig} from './request-config.js';
import {createMonitor,debounce} from './requests.js';
import {mapOptions,routeArrows} from './map-style.js';
import {inkRoute,inkNode} from './map-ink.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let visits=[],segments={},result={rows:[],routes:{}},selected=null,selectedPlace=null,edge=null,loading=false;
let controller,revision=0,view=[0,0,1000,800],dragId=null,live=false,gmap=null,overlay=null,config={},searchRevision=0,livePlaces=[];
const comparison=new ReorderComparison();
let comparisonTimer;
const monitor=createMonitor(requestConfig.instrumentation);
const placesProvider=new PlacesProvider({monitor});
const liveProvider=new EfficientRouteProvider(new LiveProvider(),{monitor});
let demoProvider,demoScenario,placeRevision=0,placeController,searchController;
const delayedCalculation=debounce(runCalculation,requestConfig.editDebounceMs);
const delayedSearch=debounce(()=>searchPlaces('search-submit'),requestConfig.searchDebounceMs);
function provider(){
 if(live)return liveProvider;
 const scenario=$('#scenario').value;
 if(!demoProvider||demoScenario!==scenario){demoProvider?.pool.clear();demoScenario=scenario;demoProvider=new EfficientRouteProvider(new DemoProvider(scenario));}
 return demoProvider;
}
function retainPlaces(){placesProvider.retain([...livePlaces,...visits.map(v=>v.place),...(selectedPlace?[selectedPlace]:[])]);}
const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const dp=Object.fromEntries(dateParts.map(p=>[p.type,p.value]));
$('#date').value=dp.year+'-'+dp.month+'-'+dp.day;
const toast=message=>{$('#notice').textContent=message;$('#notice').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#notice').style.display='none',6500);};
function zone(){return visits[0]?.place.zone||defaults.zone;}
function add(place){
 const existing=findDestination(visits,place);
 if(existing){revealExisting(existing);return;}
 if(!place.zone){toast('장소의 시간대를 확인할 수 없어 추가할 수 없습니다.');return;}
 if(visits.length&&zone()!==place.zone){toast('현재 일정은 '+zone()+'입니다. 다른 시간대의 장소는 같은 일정에 추가할 수 없습니다.');return;}
 const v={id:crypto.randomUUID(),place,stay:visits.length?defaults.stay:defaults.firstStay,wait:false};
 visits.push(v);selected=v.id;refresh();updateAddAction();focusPlace(place);toast(place.name+'을(를) 일정에 추가했습니다.');
}
function revealExisting(visit){
 selectVisit(visit.id,true);focusPlace(visit.place);
 toast('이미 일정에 추가된 장소입니다.');
}
function updateAddAction(){
 const button=$('#add');if(!button||!selectedPlace)return;
 const added=!!findDestination(visits,selectedPlace);
 // Keep this focusable so an attempted add can reveal the existing card.
 button.textContent=added?'이미 추가됨 · 일정에서 보기':'＋ 일정에 추가';
 button.classList.toggle('already-added',added);
}
function sample(){
 if(live){toast('샘플 일정은 데모 모드에서 사용할 수 있습니다.');return;}
 visits=[];segments={};[places[0],places[1],places[2],places[3]].forEach(p=>visits.push({id:crypto.randomUUID(),place:p,stay:visits.length?60:0,wait:false}));
 selected=visits[0].id;selectedPlace=null;edge=null;view=[0,0,1000,800];refresh();renderDetails();
}
function reorder(id,targetIndex){
 const i=visits.findIndex(v=>v.id===id);if(i<0||i===targetIndex||targetIndex<0||targetIndex>=visits.length)return;
 const oldZone=zone();const [v]=visits.splice(i,1);visits.splice(targetIndex,0,v);
 if(oldZone!==zone())toast('시간대가 '+zone()+'로 변경되었습니다. 입력한 날짜와 시간은 현지 시각으로 유지합니다.');
 refresh('reorder');
}
function refresh(reason='edit'){
 delayedCalculation.cancel();
 controller?.abort();controller=new AbortController();const rev=++revision;
 const comparisonRevision=comparison.begin(reason);clearTimeout(comparisonTimer);
 segments=reconcile(visits,segments);if(edge&&!segments[edge])edge=null;
 result={rows:[],routes:{}};loading=true;render();
 if(!$('#date').value||!$('#time').value){loading=false;finishComparison(comparisonRevision);render();toast('여행 날짜와 출발 시간을 입력하세요.');return;}
 const p=provider();p.setActive(visits,segments);retainPlaces();
 const args={reason,rev,comparisonRevision,signal:controller.signal,provider:p};
 if(['stay','wait','date','time','mode'].includes(reason))delayedCalculation(args);else runCalculation(args);
}
async function runCalculation({reason,rev,comparisonRevision,signal,provider}){
 if(rev!==revision)return;
 try{
 const fresh=await calculate({visits:structuredClone(visits),segments:structuredClone(segments),date:$('#date').value,time:$('#time').value,provider,signal,reason});
 if(rev!==revision){monitor.record({api:'route',reason,id:'itinerary',status:'stale-discarded'});return;}result=fresh;loading=false;finishComparison(comparisonRevision);render();
 }catch(e){if(e.name!=='AbortError'&&rev===revision){loading=false;finishComparison(comparisonRevision);render();toast('일정 계산 중 오류가 발생했습니다. 다시 편집해 주세요.');}}
}
function finishComparison(token){
 comparison.complete(token,summarize(visits,result));
 if(comparison.value)comparisonTimer=setTimeout(()=>{comparison.dismiss(token);renderSummary();},12000);
}
function renderSummary(){
 const metrics=summarize(visits,result),state=comparison.value;
 const duration=value=>value===null?'미확정':value+'분';
 const travel=loading&&visits.length>1?'계산 중…':duration(metrics.travel);
 const waiting=loading&&visits.some(v=>v.wait)?'계산 중…':duration(metrics.waiting);
 let change='';
 if(state?.status==='pending')change='새 경로 계산 후 이동시간을 비교합니다…';
 if(state?.status==='unavailable')change='효율 비교 불가 · 경로 시간 미확정';
 if(state?.status==='ready'){
   const delta=state.travelDelta;
   change='직전 순서 대비 이동 '+(delta===0?'변화 없음':Math.abs(delta)+'분 '+(delta<0?'단축':'증가'));
   if(state.endDelta)change+='<small>종료 '+Math.abs(state.endDelta)+'분 '+(state.endDelta<0?'빨라짐':'늦어짐')+' · 체류·대기 포함</small>';
 }
 $('#summary').setAttribute('aria-busy',String(loading));
 $('#summary').innerHTML='<div class="summary-caption">'+(loading?'◌ 경로와 시간을 계산하고 있습니다…':visits.length+'개 장소 · '+(live?'Google 경로':'시연용 추정'))+'</div><dl class="metrics"><div><dt>총 이동</dt><dd data-metric="travel" data-value="'+(loading?'':metrics.travel??'')+'">'+travel+'</dd></div><div><dt>총 체류</dt><dd data-metric="stay" data-value="'+metrics.stay+'">'+duration(metrics.stay)+'</dd></div><div><dt>적용 대기</dt><dd data-metric="waiting" data-value="'+(loading?'':metrics.waiting??'')+'">'+waiting+'</dd></div><div><dt>예상 종료</dt><dd data-metric="end" data-value="'+(loading?'':metrics.end??'')+'">'+(loading?'계산 중…':visits.length?esc(stamp(metrics.end)):'—')+'</dd></div></dl>'+(change?'<div class="comparison" data-status="'+state.status+'">'+change+'</div>':'');
}
function render(){
 const focused=document.activeElement;
 let focusSelector;
 if(focused?.closest('#visits')){
   const attrs=['data-stay','data-wait','data-remove','data-move','data-visit'];
   const attr=attrs.find(a=>focused.hasAttribute(a));
   if(attr)focusSelector='['+attr+'="'+focused.getAttribute(attr)+'"]'+(focused.hasAttribute('data-delta')?'[data-delta="'+focused.dataset.delta+'"]':'');
 }
 $('#zone').textContent=zone();$('#count').textContent=visits.length;
 $('#weekday').textContent=$('#date').value?new Intl.DateTimeFormat('ko',{weekday:'long',timeZone:'UTC'}).format(new Date($('#date').value+'T00:00:00Z')):'';
 renderSummary();
 $('#visits').innerHTML=visits.length?visits.map((v,i)=>{
 const row=result.rows[i],k=i?segmentKey(visits[i-1],v):null,r=k?result.routes[k]:null;
 const segment=i?'<button class="segment '+(edge===k?'active':'')+'" data-edge="'+k+'">'+esc(modes[r?.mode||segments[k].mode])+' · '+(loading?'계산 중…':r?.status==='ok'?r.minutes+'분':'경로 확인 필요')+'<small>'+esc(r?.fallback?'대중교통 없음 확인 → 자동차 자동 전환':r?.details||r?.message||'구간을 눌러 이동수단 변경')+'</small></button>':'';
 const warnings=row?.warnings.map(w=>'<div class="warning">⚠ '+esc(w)+'</div>').join('')||'';
 return segment+'<article class="visit '+(selected===v.id?'selected':'')+'" draggable="true" tabindex="0" data-visit="'+v.id+'" aria-label="'+(i+1)+'번 '+esc(v.place.name)+'">'+
 '<div class="visit-head"><span class="grip" title="드래그하여 순서 변경">⠿</span><span class="number">'+(i+1)+'</span><div class="visit-title"><h3 title="'+esc(v.place.name)+'">'+esc(v.place.name)+'</h3><p class="visit-category">'+(i===0?'<span class="start-label">출발</span> ':'')+esc(v.place.category)+'</p></div>'+
 '<div class="visit-actions"><div class="move-buttons"><button data-move="'+v.id+'" data-delta="-1" '+(i===0?'disabled':'')+' aria-label="'+esc(v.place.name)+' 위로">↑</button><button data-move="'+v.id+'" data-delta="1" '+(i===visits.length-1?'disabled':'')+' aria-label="'+esc(v.place.name)+' 아래로">↓</button></div><button class="remove" data-remove="'+v.id+'" aria-label="'+esc(v.place.name)+' 삭제">×</button></div></div>'+
 '<div class="visit-info"><div class="times"><div><span>도착</span><time>'+esc(loading?'계산 중…':stamp(row?.arrival))+'</time></div><div><span>출발</span><time>'+esc(loading?'계산 중…':stamp(row?.departure))+'</time></div></div><label class="stay-control">체류<span><input type="number" min="0" max="1440" step="1" value="'+v.stay+'" data-stay="'+v.id+'" aria-label="'+esc(v.place.name)+' 체류 시간"> 분</span></label></div>'+
 warnings+((row?.proposed||v.wait)?'<label class="waiting"><input type="checkbox" data-wait="'+v.id+'" '+(v.wait?'checked':'')+'>개장까지 대기 ('+(row?.proposed||0)+'분'+(v.wait?' 적용':' 제안')+')</label>':'')+'</article>';
 }).join(''):'<div class="empty">＋<br>가고 싶은 곳을 연결해보세요.<br><small>지도에서 장소를 눌러 일정에 추가하세요.</small></div>';
 renderMap();renderEdge();updateAddAction();
 if(focusSelector){
   const next=$('#visits').querySelector(focusSelector);
   (next?.disabled?next.closest('.visit'):next)?.focus({preventScroll:true});
 }
}
function selectVisit(id,fromMap=false){
 placeRevision++;placeController?.abort();
 selected=id;edge=null;const v=visits.find(v=>v.id===id);if(!v)return;
 selectedPlace=v.place;render();renderDetails();
 if(fromMap)document.querySelector('[data-visit="'+id+'"]')?.scrollIntoView({block:'nearest',behavior:'smooth'});
 else focusPlace(v.place);
}
async function selectPlace(p){
 const token=++placeRevision;placeController?.abort();placeController=new AbortController();
 if(!live){selectedPlace=p;renderDetails();return;}
 const existing=findDestination(visits,p);if(existing){revealExisting(existing);return;}
 selectedPlace=null;renderDetails();placesProvider.retain([...livePlaces,...visits.map(v=>v.place),p]);
 try{
   const detail=await placesProvider.inspect(p,{signal:placeController.signal});
   if(token!==placeRevision){monitor.record({api:'place-detail',reason:'place-selection',id:p.id,status:'stale-discarded'});return;}
   selectedPlace=detail;renderDetails();retainPlaces();
 }catch(e){if(e.name!=='AbortError'&&token===placeRevision)toast('장소 정보 또는 시간대를 확인하지 못해 추가할 수 없습니다. 다시 선택하세요.');}
}
function renderDetails(){
 const panel=$('#details');panel.hidden=!selectedPlace;if(!selectedPlace)return;
 const p=selectedPlace;const day=$('#date').value?new Date($('#date').value+'T00:00:00Z').getUTCDay():0;
 const clock=m=>(m>=1440?'다음 날 ':'')+String(Math.floor((m%1440)/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const hrs=p.hours?(p.hours[day]||[]).map(([a,b])=>clock(a)+' – '+clock(b)).join('<br>')||'휴무':'운영시간 정보 없음';
 panel.innerHTML='<button class="close" id="close-details" aria-label="장소 정보 닫기">×</button>'+(p.photo?'<img class="place-photo" src="'+esc(p.photo)+'" alt="'+esc(p.name)+' 사진">':'<div class="place-art"><span>'+esc(p.symbol||'⌖')+'</span><small>사진 없음 · 장소 기호</small></div>')+'<div class="details-body"><span class="eyebrow">'+esc(p.category)+'</span><h2>'+esc(p.name)+'</h2><p class="address">⌖ '+esc(p.address)+'</p><p>'+esc(p.description||'Google Places에서 제공한 장소입니다.')+'</p>'+(p.attributions?.length?'<p>'+p.attributions.map(a=>'<a rel="noopener noreferrer" target="_blank" href="'+esc(a.providerURI||'https://maps.google.com')+'">'+esc(a.provider||'Google Maps')+'</a>').join(', ')+'</p>':'')+(p.authors?'<p>'+p.authors.map(a=>'<a rel="noopener noreferrer" target="_blank" href="'+esc(a.uri||'https://maps.google.com')+'">'+esc(a.displayName)+'</a>').join(', ')+'</p>':'')+'<div class="hours"><strong>선택 요일의 운영시간</strong><br>'+hrs+'<p>'+esc(p.hoursLabel)+'<br>공휴일·특정 날짜의 영업은 방문 전 확인하세요.</p></div><button class="primary" id="add">＋ 일정에 추가</button></div>';
 $('#close-details').onclick=()=>{placeRevision++;placeController?.abort();selectedPlace=null;renderDetails();retainPlaces();};$('#add').onclick=()=>add(p);updateAddAction();
}
function renderEdge(){
 const panel=$('#edge-settings');panel.hidden=!edge||!segments[edge];if(panel.hidden)return;
 const i=visits.findIndex((v,i)=>i<visits.length-1&&segmentKey(v,visits[i+1])===edge),r=result.routes[edge];
 panel.innerHTML='<button class="close" id="close-edge" aria-label="이동 설정 닫기">×</button><h3>'+(i+1)+' → '+(i+2)+' 이동 설정</h3><div class="mode-buttons">'+Object.entries(modes).map(([key,label])=>'<button data-mode="'+key+'" class="'+(segments[edge].mode===key?'active':'')+'">'+label+'</button>').join('')+'</div><p>'+esc(loading?'계산 중…':r?.fallback?'대중교통 경로 없음이 확인되어 자동차로 전환했습니다.':r?.details||r?.message||'경로 확인 필요')+'</p><p>'+(live?'Google Routes · 지역별 지원 범위가 다릅니다.':'시연용 추정 시간 · 실제 길찾기가 아닙니다.')+'</p>';
 $('#close-edge').onclick=()=>{edge=null;renderEdge();renderMap();};
 panel.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(segments[edge].mode===b.dataset.mode)return;segments[edge]={mode:b.dataset.mode};refresh('mode');});
}
const project=p=>({x:(p.lng-126.963)*17000+50,y:(37.592-p.lat)*15000+50});
const mapBase='<defs><pattern id="blocks" width="100" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><rect width="100" height="80" fill="#C8D4CB"/><rect x="7" y="7" width="85" height="65" rx="7" fill="#B4C2B8" stroke="#789282" stroke-width="6"/></pattern></defs><rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#blocks)"/><path d="M-100 155 Q170 175 220 55 Q310 -90 510 15 L570 -200 -100 -200Z" fill="#4D775F"/><path d="M180 800 Q170 570 370 610 Q500 625 590 800" fill="#4D775F"/><path d="M-100 421 Q230 390 450 425 T1100 430" fill="none" stroke="#B6C8C1" stroke-width="19"/><g fill="none" stroke="#164F3B" stroke-width="15"><path d="M-100 333 L1100 333"/><path d="M270 -100 L260 400 90 850"/><path d="M-100 555 L1100 520"/><path d="M700 -100 L750 900"/></g><g fill="#143B2C" font-size="16" letter-spacing="5"><text x="540" y="230">종로구</text><text x="555" y="565">중구</text><text x="295" y="690">남산</text><text x="560" y="410" font-size="11">청계천</text></g>';
function decode(encoded){let index=0,lat=0,lng=0,points=[];while(index<encoded.length){const read=()=>{let b,shift=0,n=0;do{b=encoded.charCodeAt(index++)-63;n|=(b&31)<<shift;shift+=5;}while(b>=32);return n&1?~(n>>1):n>>1;};lat+=read();lng+=read();points.push({lat:lat/1e5,lng:lng/1e5});}return points;}
function graphics(proj,isLive=false){
 const unit=isLive?1:Math.max(view[2]/$('#map').clientWidth,view[3]/$('#map').clientHeight);
 const locations=visits.map(v=>proj(v.place));
 const offsets=visits.map((v,i)=>{const same=visits.map((x,j)=>x.place.lat===v.place.lat&&x.place.lng===v.place.lng?j:-1).filter(j=>j>=0);const n=same.indexOf(i);return {x:locations[i].x+(same.length>1?(n-(same.length-1)/2)*40*unit:0),y:locations[i].y};});
 let out='';const casings=[],lines=[],arrows=[],edgeLabels=[];
 visits.slice(0,-1).forEach((v,i)=>{
 const k=segmentKey(v,visits[i+1]),r=result.routes[k],a=offsets[i],b=offsets[i+1];
 let d,points;
 if(isLive){if(!r?.polyline)return;points=decode(r.polyline).map(proj);d=points.map((q,j)=>(j?'L':'M')+q.x+','+q.y).join(' ');}
 else {const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,start=Math.min(24*unit,len/3),end=Math.min(26*unit,len/3);points=[{x:a.x+dx/len*start,y:a.y+dy/len*start},{x:b.x-dx/len*end,y:b.y-dy/len*end}];d=points.map((q,j)=>(j?'L':'M')+q.x+','+q.y).join(' ');}
 const active=edge===k?' active':'';
 casings.push('<path class="route-casing'+active+'" d="'+d+'"/>');
 lines.push('<path class="edge-hit" data-edge="'+k+'" d="'+d+'"/><path class="map-edge'+active+'" data-edge="'+k+'" d="'+inkRoute(points,k,unit)+'" tabindex="0" role="button" aria-label="'+(i+1)+'에서 '+(i+2)+' 이동 설정"><title>'+esc(modes[r?.mode||segments[k].mode])+' · '+(r?.status==='ok'?r.minutes+'분':'경로 확인 필요')+'</title></path><path class="route-overprint" d="'+inkRoute(points,k,unit,true)+'"/>');
 const arrowPath=routeArrows(points,unit,k);
 arrows.push('<g class="route-arrows"><path class="arrow-casing" d="'+arrowPath+'"/><path class="arrow-white" d="'+arrowPath+'"/></g>');
 if(edge===k)edgeLabels.push('<text x="'+((a.x+b.x)/2)+'" y="'+((a.y+b.y)/2-12)+'" class="node-time">'+esc(modes[r?.mode||segments[k].mode])+' '+(r?.status==='ok'?r.minutes+'분':'확인 필요')+'</text>');
 });
 out+=casings.join('')+lines.join('')+arrows.join('')+edgeLabels.join('');
 (isLive?livePlaces:places).filter(p=>!visits.some(v=>v.place.id===p.id)).forEach(p=>{const q=proj(p);out+='<g class="map-place" data-place="'+esc(p.id)+'" tabindex="0" role="button" aria-label="'+esc(p.name)+' 정보" transform="translate('+q.x+','+q.y+')"><circle r="7" fill="#fff" stroke="#789282" stroke-width="2"/><text class="node-title" x="13" y="4" style="font-size:11px;font-weight:400">'+esc(p.name)+'</text></g>';});
 // Lay out the selected label first, then reserve its arrival line before other labels.
 const priority=visits.map((v,i)=>i).sort((a,b)=>(visits[b].id===selected?1:0)-(visits[a].id===selected?1:0));
 const occupied=offsets.map(q=>({x:q.x/unit-20,y:q.y/unit-20,w:40,h:40}));
 const labels={};
 const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 priority.forEach(i=>{
   const q=offsets[i],w=Math.min(260,visits[i].place.name.length*12+12);
   const candidates=[{x:0,y:-30},{x:0,y:52},{x:w/2+28,y:-8},{x:-w/2-28,y:-8},{x:0,y:-58}];
   const bounds=c=>({x:q.x/unit+c.x-w/2,y:q.y/unit+c.y-14,w,h:19});
   const label=candidates.find(c=>!occupied.some(box=>overlaps(bounds(c),box)))||candidates[4];
   labels[i]=label;occupied.push(bounds(label));
   if(visits[i].id===selected)occupied.push({x:q.x/unit-65,y:q.y/unit+25,w:130,h:20});
 });
 priority.reverse().forEach(i=>{const v=visits[i],q=offsets[i],active=v.id===selected,label=labels[i];
 out+='<g class="map-node" data-node="'+v.id+'" tabindex="0" role="button" aria-label="'+(i+1)+'번 '+esc(v.place.name)+(i===0?' 출발점':'')+'" transform="translate('+q.x+','+q.y+') scale('+unit+')">';
 if(q.x!==locations[i].x)out+='<line x1="0" y1="0" x2="'+((locations[i].x-q.x)/unit)+'" y2="0" stroke="#789282"/>';
 out+='<path class="node-outline" d="'+inkNode(v.id,active?21:17)+'" fill="#164F3B" stroke="'+(active?'#F4F1E8':'#DDE9E1')+'" stroke-width="'+(active?5:2)+'"/><circle r="'+(active?20:16)+'" fill="#164F3B" stroke="none"/><text class="node-number" text-anchor="middle" y="5" fill="white" font-size="13" font-weight="700">'+(i+1)+'</text>';
 out+='<text class="node-title" text-anchor="middle" x="'+label.x+'" y="'+label.y+'">'+esc(v.place.name)+'</text>';
 if(i===0)out+='<g class="node-start"><rect x="14" y="7" width="31" height="18" rx="5" fill="#DDE9E1" stroke="#164F3B"/><text x="29.5" y="20" text-anchor="middle" font-size="10" fill="#164F3B">출발</text></g>';
 if(active)out+='<text class="node-time" text-anchor="middle" y="39">'+esc(loading?'계산 중…':stamp(result.rows[i]?.arrival))+'</text>';
 out+='</g>';
 });return out;
}
function bindMap(el){
 el.onclick=e=>{const n=e.target.closest('[data-node]'),p=e.target.closest('[data-place]'),s=e.target.closest('[data-edge]');if(n)selectVisit(n.dataset.node,true);else if(p)selectPlace((live?livePlaces:places).find(x=>x.id===p.dataset.place));else if(s){edge=s.dataset.edge;renderEdge();renderMap();}};
 el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const target=e.target.closest('[role="button"]');if(target){e.preventDefault();target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}}};
}
function renderMap(){
 if(live){overlay?.draw();return;}
 $('#map').innerHTML=mapBase+graphics(project);$('#map').setAttribute('viewBox',view.join(' '));
}
function focusPlace(p){
 if(live){gmap?.panTo({lat:p.lat,lng:p.lng});return;}
 const q=project(p);view[0]=q.x-view[2]*.60;view[1]=q.y-view[3]*.48;renderMap();
}
bindMap($('#map'));
new ResizeObserver(()=>renderMap()).observe($('.map-area'));
let pan;
$('#map').addEventListener('pointerdown',e=>{if(e.target.closest('[data-node],[data-edge],[data-place]'))return;pan={x:e.clientX,y:e.clientY,view:[...view]};$('#map').setPointerCapture(e.pointerId);});
$('#map').addEventListener('pointermove',e=>{if(!pan)return;const scale=Math.max(view[2]/$('#map').clientWidth,view[3]/$('#map').clientHeight);view[0]=pan.view[0]-(e.clientX-pan.x)*scale;view[1]=pan.view[1]-(e.clientY-pan.y)*scale;$('#map').setAttribute('viewBox',view.join(' '));});
$('#map').addEventListener('pointerup',()=>pan=null);$('#map').addEventListener('pointercancel',()=>pan=null);
function zoom(factor){if(live){gmap.setZoom(gmap.getZoom()+(factor<1?1:-1));return;}const w=Math.max(220,Math.min(2600,view[2]*factor)),h=w*.8;view=[view[0]+(view[2]-w)/2,view[1]+(view[3]-h)/2,w,h];renderMap();}
$('#map').addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.12:.88);},{passive:false});
$('#zoom-in').onclick=()=>zoom(.8);$('#zoom-out').onclick=()=>zoom(1.25);
$('#fit').onclick=()=>{if(live){const b=new google.maps.LatLngBounds();(visits.length?visits.map(v=>v.place):livePlaces).forEach(p=>b.extend({lat:p.lat,lng:p.lng}));if(!b.isEmpty())gmap.fitBounds(b,80);}else{view=[0,0,1000,800];renderMap();}};
$('#visits').onclick=e=>{
 const remove=e.target.closest('[data-remove]'),move=e.target.closest('[data-move]'),s=e.target.closest('[data-edge]');
 if(remove){visits=visits.filter(v=>v.id!==remove.dataset.remove);if(selected===remove.dataset.remove)selected=null;refresh();}
 else if(move){reorder(move.dataset.move,visits.findIndex(v=>v.id===move.dataset.move)+Number(move.dataset.delta));}
 else if(s){edge=s.dataset.edge;renderMap();renderEdge();}
 else if(!e.target.closest('input,label,button')){const card=e.target.closest('[data-visit]');if(card)selectVisit(card.dataset.visit);}
};
$('#visits').onkeydown=e=>{if(e.target.matches('article')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectVisit(e.target.dataset.visit);}};
function editVisit(e){
 const v=visits.find(v=>v.id===(e.target.dataset.stay||e.target.dataset.wait));if(!v)return;
 if(e.target.dataset.stay){const stay=Math.max(0,Math.min(1440,Math.round(Number(e.target.value)||0)));if(v.stay===stay)return;v.stay=stay;}else{if(v.wait===e.target.checked)return;v.wait=e.target.checked;}
 refresh(e.target.dataset.stay?'stay':'wait');
}
$('#visits').oninput=editVisit;$('#visits').onchange=editVisit;
$('#visits').ondragstart=e=>{if(e.target.closest('input,button')){e.preventDefault();return;}const card=e.target.closest('[data-visit]');if(!card)return;dragId=card.dataset.visit;e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');};
$('#visits').ondragover=e=>{const c=e.target.closest('[data-visit]');if(c){e.preventDefault();c.classList.add('drag-over');}};
$('#visits').ondragleave=e=>e.target.closest('[data-visit]')?.classList.remove('drag-over');
$('#visits').ondrop=e=>{e.preventDefault();const card=e.target.closest('[data-visit]');if(card)reorder(dragId||e.dataTransfer.getData('text/plain'),visits.findIndex(v=>v.id===card.dataset.visit));dragId=null;};
$('#visits').ondragend=()=>{dragId=null;document.querySelectorAll('.dragging,.drag-over').forEach(e=>e.classList.remove('dragging','drag-over'));};
$('#sample').onclick=sample;$('#scenario').onchange=refresh;
$('#date').onchange=()=>{refresh('date');renderDetails();};$('#time').onchange=()=>refresh('time');
$('#date').oninput=$('#date').onchange;$('#time').oninput=$('#time').onchange;
function showResults(list){$('#results').innerHTML=list.length?list.map(p=>'<button type="button" class="result" data-result="'+esc(p.id)+'">'+esc(p.name)+'<small>'+esc(p.address)+'</small></button>').join(''):'<div class="result">검색 결과가 없습니다.</div>';$('#results').querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{const place=list.find(p=>p.id===b.dataset.result);const existing=findDestination(visits,place);if(existing)revealExisting(existing);else selectPlace(place);$('#results').innerHTML='';});}
// Keep the existing explicit-submit search UX: typing never spends Google quota.
// Debounce repeated submits, invalidate older results as soon as input changes.
$('#search').oninput=()=>{
 if(!live){const q=$('#search').value.trim();showResults(places.filter(p=>(p.name+p.address+p.category).includes(q)));return;}
 delayedSearch.cancel();searchRevision++;searchController?.abort();$('#results').innerHTML='';
};
$('#search').onfocus=()=>{if(!live)$('#search').oninput();};
document.addEventListener('click',e=>{if(!e.target.closest('#search-form'))$('#results').innerHTML='';});
$('#search-form').onsubmit=e=>{
 e.preventDefault();if(!live){$('#search').oninput();return;}
 if([...$('#search').value.trim()].length<requestConfig.minSearchLength){delayedSearch.cancel();$('#results').textContent='검색어를 2자 이상 입력하세요.';return;}
 delayedSearch();
};
async function searchPlaces(reason){
 const rev=++searchRevision;searchController?.abort();searchController=new AbortController();
 $('#results').textContent='Google Places 검색 중…';
 try{
   const list=await placesProvider.search($('#search').value,{signal:searchController.signal,reason});
   if(rev!==searchRevision){monitor.record({api:'places-search',reason,id:'current-query',status:'stale-discarded'});return;}
   livePlaces=list;retainPlaces();showResults(livePlaces);renderMap();
 }catch(e){if(e.name!=='AbortError'&&rev===searchRevision)$('#results').textContent='장소 검색 실패 · API 설정과 지역별 지원을 확인하세요.';}
}
$('#service').onclick=async()=>{
 if(live){location.reload();return;}
 if(!config.browserKey){toast('Google API 키가 없습니다. .env에 브라우저 키와 서버 키를 설정한 뒤 재시작하세요. 현재 데모의 모든 편집 기능은 사용 가능합니다.');return;}
 try{
 $('#service').disabled=true;
 await loadGoogleMaps(config.browserKey,{monitor});
 window.gm_authFailure=()=>toast('Google 지도 인증 실패 · 데모로 돌아가려면 새로고침하세요.');
 live=true;visits=[];segments={};selected=null;selectedPlace=null;$('#details').hidden=true;
 $('#map').style.display='none';$('#google-map').style.display='block';
 gmap=new google.maps.Map($('#google-map'),mapOptions(config.mapId));
 $('.map-area').classList.add('live-map');
 class ItineraryOverlay extends google.maps.OverlayView{
 onAdd(){this.el=document.createElementNS('http://www.w3.org/2000/svg','svg');Object.assign(this.el.style,{position:'absolute',left:'0',top:'0',width:'1px',height:'1px',overflow:'visible',pointerEvents:'none'});this.getPanes().overlayMouseTarget.appendChild(this.el);bindMap(this.el);}
 draw(){if(!this.el)return;const projection=this.getProjection();if(!projection)return;this.el.innerHTML=graphics(p=>projection.fromLatLngToDivPixel(new google.maps.LatLng(p.lat,p.lng)),true);}
 onRemove(){this.el?.remove();}
 }
 overlay=new ItineraryOverlay();overlay.setMap(gmap);
 gmap.addListener('click',e=>{if(!e.placeId)return;e.stop();const existing=visits.find(v=>v.place.id===e.placeId);if(existing)revealExisting(existing);else selectPlace({id:e.placeId});});
 $('#source-badge').textContent='GOOGLE / LIVE';$('#service').textContent='데모로 돌아가기';$('#map-disclaimer').textContent='Google 지도 · 경로는 응답이 있는 경우만 표시';
 $('#map-caption').textContent='세계 지도를 탐색하세요. 장소·경로 지원은 지역마다 다릅니다.';
 $('#sample').disabled=true;$('#scenario').disabled=true;$('#search').value='';$('#results').innerHTML='';
 refresh();toast(config.serverReady?'Google 지도 모드 · 기존 샘플 대신 검색한 장소로 새 일정을 만드세요.':'서버 키 미설정 · 시간대 확인과 경로 요청을 사용할 수 없습니다.');
 }catch{toast('Google 지도를 불러오지 못했습니다. 키·결제·네트워크를 확인하세요.');}
 finally{$('#service').disabled=false;}
};
fetch('/api/config').then(r=>r.json()).then(c=>{config=c;monitor.setEnabled(c.requestMonitor===true);if(c.requestMonitor)window.travelLinkRequests=monitor;}).catch(()=>{});
sample();
