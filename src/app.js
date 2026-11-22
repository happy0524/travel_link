import {defaults,modes} from './data.js';
import {destination} from './new-york.js';
import {calculate,reconcile,segmentKey,stamp,wallStart} from './engine.js';
import {LiveProvider} from './providers.js';
import {findDestination,summarize,totalDistance,ReorderComparison} from './itinerary.js';
import {canonicalZone,EfficientRouteProvider,PlacesProvider,loadGoogleMaps} from './efficient-providers.js';
import {requestConfig} from './request-config.js';
import {createMonitor,debounce} from './requests.js';
import {mapOptions,routeArrows} from './map-style.js';
import {inkRoute,inkNode} from './map-ink.js';
import {MapboxRenderer,loadMapbox} from './mapbox-renderer.js';
import {validMapboxPlace} from './mapbox-eucalyptus.js';
import {MapboxDirections} from './mapbox-directions.js';
import {MapboxSearch} from './mapbox-search.js';
import {findGoogleCandidates,createGoogleWidget,rememberGooglePlaceId} from './google-place-details.js';
import {decorateWoodPanels,decorateSelectedVisit} from './wood-panels.js';
import {setupSchedulePickers} from './schedule-pickers.js';
import {formatDuration,locale,ui} from './ui-copy.js';
import {mapPalette} from './map-palette.js';
import {dateInZone,setupOnboarding} from './onboarding.js';
import {referenceForPlace,restorePlaceId,stopReference} from './trip-stops.js';
const mapboxPermit=signal=>browserPermit(signal,'mapbox');
const mapboxSearch=new MapboxSearch(()=>config.mapboxToken,{permit:mapboxPermit});
const delayedMapboxSearch=debounce(searchMapbox,350);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let visits=[],segments={},result={rows:[],routes:{}},selected=null,selectedPlace=null,edge=null,loading=false;
let controller,revision=0,dragId=null,gmap=null,overlay=null,config={},searchRevision=0,livePlaces=[];
const comparison=new ReorderComparison();
let comparisonTimer;
let googleDetailsController;
let mapProvider='mapbox',mapboxRenderer=null,mapSwitch=0,pendingProvider=null;
let tripDestination=destination;
const monitor=createMonitor(requestConfig.instrumentation);
const placesProvider=new PlacesProvider({monitor,onFailure:serviceDenied});
const liveProvider=new EfficientRouteProvider(new LiveProvider(),{monitor});
const mapboxDirections=new EfficientRouteProvider(new MapboxDirections(()=>config.mapboxToken,{permit:mapboxPermit}),{monitor});
let placeRevision=0,placeController,searchController,pendingMapboxSearch,pendingGoogleSearch;
const delayedCalculation=debounce(runCalculation,requestConfig.editDebounceMs);
const delayedSearch=debounce(()=>searchPlaces('search-submit'),requestConfig.searchDebounceMs);
const googleRoutes={
 setActive:(...args)=>liveProvider.setActive(...args),
 retry:(...args)=>liveProvider.retry(...args),
 route:args=>{
  const points=[args.from,args.to];
  if(points.some(p=>!hasLocation(p)))return Promise.resolve({status:'unsupported',message:'Restore or relink the stop before calculating this route.'});
  return points.some(p=>p.source?.startsWith('mapbox'))
   ?Promise.resolve({status:'unsupported',message:ui.mapboxGoogleLocation})
   :liveProvider.route(args);
 }
};
function provider(){return mapProvider==='mapbox'?mapboxDirections:googleRoutes;}
function retainPlaces(){placesProvider.retain([...livePlaces,...visits.map(v=>v.place),...(selectedPlace?[selectedPlace]:[])]);}
$('#date').value=dateInZone(destination.zone);
let schedule={date:$('#date').value,time:$('#time').value},relinkStop=null;
const toast=message=>{$('#notice').textContent=message;$('#notice').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#notice').style.display='none',6500);};
const hasLocation=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng);
function zone(){return tripDestination.zone;}
function add(place){
 const existing=findDestination(visits,place);
 if(existing){revealExisting(existing);return;}
 if(!canonicalZone(place.zone)){selectPlace(place);return;}
 const mismatch=placeZoneMismatch(place);
 if(mismatch){toast(mismatch);return;}
 const missing=visits.find(v=>v.id===relinkStop&&v.restoreStatus==='relink');
 if(!missing&&visits.length>=100){toast('This trip can hold up to 100 stops.');return;}
 const v=missing||{id:crypto.randomUUID(),stay:defaults.stay,wait:false};
 v.place=place;
 v.reference=referenceForPlace(place);v.restoreStatus=null;relinkStop=null;
 if(!missing)visits.push(v);
 selected=v.id;refresh();updateAddAction();focusPlace(place);
 toast(place.source?.startsWith('mapbox')&&!place.googlePlaceId
   ?'Stop added. Link it to a Google place to restore its location on your next visit.'
   :place.name+' was added to the itinerary.');
}
function revealExisting(visit){
 selectVisit(visit.id);focusPlace(visit.place);
 document.querySelector('[data-visit="'+visit.id+'"]')?.scrollIntoView({block:'nearest'});
 toast('This place is already in your itinerary.');
}
function updateAddAction(){
 const button=$('#add');if(!button||!selectedPlace)return;
 const added=!!findDestination(visits,selectedPlace);
 const mismatch=!added&&placeZoneMismatch(selectedPlace);
 button.disabled=Boolean(mismatch);
 const note=button.parentElement.querySelector('.place-zone-note');
 if(note){note.hidden=!mismatch;note.textContent=mismatch||'';}
 // Keep this focusable so an attempted add can reveal the existing card.
 button.textContent=!added&&relinkStop?'Link to this stop':added?ui.added:ui.add;
 button.classList.toggle('already-added',added);
}
function placeZoneMismatch(place){
 const actual=canonicalZone(place.zone),expected=canonicalZone(zone());
 return actual&&expected&&actual!==expected
  ?'This place is in '+place.zone+'. Your itinerary is in '+zone()+'.':'';
}
function savedStops(){
 return visits.map((visit,index)=>({
  id:visit.id,stay:visit.stay,wait:visit.wait,
  ...(visit.reference||referenceForPlace(visit.place)),
  mode:index<visits.length-1?segments[segmentKey(visit,visits[index+1])]?.mode:undefined
 }));
}
function saveSnapshot(){return {...schedule,zone:zone(),stops:savedStops()};}
function reorder(id,targetIndex){
 const i=visits.findIndex(v=>v.id===id);if(i<0||i===targetIndex||targetIndex<0||targetIndex>=visits.length)return;
 const oldZone=zone();const [v]=visits.splice(i,1);visits.splice(targetIndex,0,v);
 if(oldZone!==zone())toast('Time zone changed to '+zone()+'. The date and time are still shown in local time.');
 refresh('reorder');
}
function refresh(reason='edit'){
 if(serviceStopped)return;
 delayedCalculation.cancel();
 controller?.abort();controller=new AbortController();const rev=++revision;
 const comparisonRevision=comparison.begin(reason);clearTimeout(comparisonTimer);
 segments=reconcile(visits,segments,defaults.mode);if(edge&&!segments[edge])edge=null;
 if(!['provider','retry'].includes(reason))onboarding.save(saveSnapshot());
 result={rows:[],routes:{}};loading=true;render();
 if(!$('#date').value||!$('#time').value){loading=false;finishComparison(comparisonRevision);render();toast('Choose a travel date and departure time.');return;}
 const p=provider();p.setActive(visits,segments);retainPlaces();
 const args={reason,rev,comparisonRevision,signal:controller.signal,provider:p};
 if(['stay','wait','date','time','mode'].includes(reason))delayedCalculation(args);else runCalculation(args);
}
async function runCalculation({reason,rev,comparisonRevision,signal,provider}){
 if(rev!==revision)return;
 try{
 const fresh=await calculate({visits:structuredClone(visits),segments:structuredClone(segments),...schedule,zone:zone(),provider,signal,reason});
 if(rev!==revision){monitor.record({api:'route',reason,id:'itinerary',status:'stale-discarded'});return;}result=fresh;loading=false;finishComparison(comparisonRevision);render();
 }catch(e){if(e.name!=='AbortError'&&rev===revision){loading=false;finishComparison(comparisonRevision);render();toast(e instanceof RangeError?e.message:'The itinerary could not be calculated. Try editing it again.');}}
}
function finishComparison(token){
 comparison.complete(token,summarize(visits,result));
 if(comparison.value)comparisonTimer=setTimeout(()=>{comparison.dismiss(token);renderSummary();},12000);
}
function scheduleTime(minute){
 if(!Number.isFinite(minute))return ui.unconfirmed;
 const days=Math.floor(minute/1440)-Math.floor(wallStart($('#date').value,'00:00')/1440);
 return (days===1?ui.nextDay+' ':days>1?`+${days} days `:'')+stamp(minute).slice(-5);
}
function renderSummary(){
 const metrics=summarize(visits,result),state=comparison.value;
 const start=wallStart($('#date').value,$('#time').value);
 const distance=totalDistance(visits,result);
 const pending=ui.calculating;
 const travel=loading&&visits.length>1?pending:formatDuration(metrics.travel);
 const end=visits.length?(loading?pending:scheduleTime(metrics.end)):'—';
 const elapsed=visits.length?(loading?pending:formatDuration(result.elapsed)):'—';
 let change='';
 if(state?.status==='pending')change='Comparing travel times after recalculating the routes…';
 if(state?.status==='unavailable')change='Comparison unavailable while travel times are unconfirmed.';
 if(state?.status==='ready'){
   const delta=state.travelDelta;
   change=delta===0?'Travel time unchanged':`Travel time ${formatDuration(Math.abs(delta))} ${delta<0?'shorter':'longer'}`;
   if(state.endDelta)change+=`<small>Ends ${formatDuration(Math.abs(state.endDelta))} ${state.endDelta<0?'earlier':'later'} · includes visits and waiting</small>`;
 }
 const metric=(key,label,value,display)=>`<div><dt>${label}</dt><dd data-metric="${key}" data-value="${value??''}">${esc(display)}</dd></div>`;
 $('#summary').setAttribute('aria-busy',String(loading));
 $('#summary').innerHTML=`<div class="summary-caption"><strong>${esc($('#date').value||'Date unconfirmed')}</strong><span>${zone()}</span></div>
  <dl class="day-range">${metric('start',ui.start,start,$('#time').value||'—')}${metric('end',ui.estimatedEnd,metrics.end,end)}</dl>
  <dl class="metrics">${metric('elapsed',ui.totalDuration,result.elapsed,elapsed)}${metric('travel',ui.travelTime,metrics.travel,travel)}${metric('stay',ui.visitTime,metrics.stay,formatDuration(metrics.stay))}
  ${metric('distance',ui.totalDistance,distance,distance!==null?(distance/1000).toFixed(2)+' km':loading&&visits.length>1?pending:visits.length>1?ui.unconfirmed:'—')}
  ${metrics.waiting>0||visits.some(v=>v.wait)?metric('waiting',ui.waitTime,metrics.waiting,loading?pending:formatDuration(metrics.waiting)):''}</dl>
  ${change?'<div class="comparison" data-status="'+state.status+'">'+change+'</div>':''}`;
}
function render(){
 const focused=document.activeElement;
 let focusSelector;
 if(focused?.closest('#visits')){
   const attrs=['data-stay','data-wait','data-remove','data-move','data-visit'];
   const attr=attrs.find(a=>focused.hasAttribute(a));
   if(attr)focusSelector='['+attr+'="'+focused.getAttribute(attr)+'"]'+(focused.hasAttribute('data-delta')?'[data-delta="'+focused.dataset.delta+'"]':'');
 }
 $('#zone').textContent=zone();$('#count').textContent=visits.length+(visits.length===1?' stop':' stops');
 const restoreNote=$('#itinerary-restore');
 const missing=visits.filter(v=>v.restoreStatus==='relink'||v.place.source?.startsWith('mapbox')&&!restorePlaceId(v.reference||referenceForPlace(v.place))).length;
 const retries=visits.filter(v=>v.restoreStatus==='retry').length;
 restoreNote.hidden=!(missing||retries);
 restoreNote.textContent=[missing?missing+' '+(missing===1?'stop needs a saved place link':'stops need saved place links'):'',retries?retries+' '+(retries===1?'place lookup needs a retry':'place lookups need a retry'):''].filter(Boolean).join(' · ');
 $('#weekday').textContent=$('#date').value?new Intl.DateTimeFormat(locale,{weekday:'short',timeZone:'UTC'}).format(new Date($('#date').value+'T00:00:00Z')):'';
 renderSummary();
 $('#visits').innerHTML=visits.length?visits.map((original,i)=>{
 const restricted=original.place.source!=='unavailable'&&(mapProvider==='mapbox'?!validMapboxPlace(original.place):original.place.source?.startsWith('mapbox'));
 const v=restricted?{...original,place:{...original.place,name:mapProvider==='mapbox'?'View this place in Google Maps':'View this place in Mapbox',category:'Provider restriction'}}:original;
 const row=result.rows[i],k=i?segmentKey(visits[i-1],v):null,r=k?result.routes[k]:null;
 const segmentNote=r?.status==='ok'&&Number.isFinite(r.distance)?(r.distance/1000).toFixed(1)+' km':'';
 const segment=i?'<div class="visit-divider" aria-hidden="true"></div><button class="segment '+(edge===k?'active':'')+'" data-edge="'+k+'"><span>'+esc(modes[r?.mode||segments[k].mode])+' · '+(loading?ui.calculating:r?.status==='ok'?formatDuration(r.minutes):ui.routeUnconfirmed)+'</span>'+(segmentNote?'<small>'+esc(segmentNote)+'</small>':'')+'</button>':'';
 const warnings=mapProvider==='mapbox'?'':row?.warnings.map(w=>'<div class="warning">⚠ '+esc(w)+'</div>').join('')||'';
 return segment+'<article class="visit '+(selected===v.id?'selected':'')+'" draggable="true" tabindex="0" data-visit="'+v.id+'" aria-label="Stop '+(i+1)+': '+esc(v.place.name)+'">'+
 '<div class="visit-head"><span class="grip" title="Drag to reorder">⠿</span><span class="number">'+(i+1)+'</span><div class="visit-title"><h3 title="'+esc(v.place.name)+'">'+esc(v.place.name)+'</h3><p class="visit-category">'+(i===0?'<span class="start-label">'+ui.start+'</span> ':'')+esc(v.place.category)+'<span class="visit-stay-summary"> · '+ui.stay+' '+formatDuration(v.stay)+'</span></p></div>'+
 '<div class="visit-actions"><div class="move-buttons"><button data-move="'+v.id+'" data-delta="-1" '+(i===0?'disabled':'')+' aria-label="Move '+esc(v.place.name)+' up">↑</button><button data-move="'+v.id+'" data-delta="1" '+(i===visits.length-1?'disabled':'')+' aria-label="Move '+esc(v.place.name)+' down">↓</button></div><button class="remove" data-remove="'+v.id+'" aria-label="Remove '+esc(v.place.name)+'">×</button></div></div>'+
 (selected===v.id?stopActions(v):'')+
 '<p class="visit-timeline">'+esc(loading?ui.calculating:scheduleTime(row?.arrival)+' → '+scheduleTime(row?.departure))+'</p>'+
 '<div class="visit-info"><div class="times"><div><span>'+ui.arrival+'</span><time>'+esc(loading?ui.calculating:scheduleTime(row?.arrival))+'</time></div><div><span>'+ui.departure+'</span><time>'+esc(loading?ui.calculating:scheduleTime(row?.departure))+'</time></div></div><label class="stay-control">'+ui.stay+'<span><input type="number" min="0" max="1440" step="1" value="'+v.stay+'" data-stay="'+v.id+'" aria-label="Stay at '+esc(v.place.name)+' in minutes"> min</span></label></div>'+
 warnings+((mapProvider!=='mapbox'&&(row?.proposed||v.wait))?'<label class="waiting"><input type="checkbox" data-wait="'+v.id+'" '+(v.wait?'checked':'')+'>Wait until opening ('+formatDuration(row?.proposed||0)+(v.wait?' applied':' suggested')+')</label>':'')+'</article>';
 }).join(''):'<div class="empty">Your itinerary is empty.<br><small>Select a place on the map or search to add a stop.</small></div>';
 decorateSelectedVisit($('#visits .visit.selected'));
 renderMap();renderEdge();updateAddAction();
 if(focusSelector){
   const next=$('#visits').querySelector(focusSelector);
   (next?.disabled?next.closest('.visit'):next)?.focus({preventScroll:true});
 }
}
function stopActions(v){
 if(v.restoreStatus==='loading')return '<p class="visit-details" role="status">Restoring place…</p>';
 if(v.restoreStatus==='retry')return '<button class="visit-details" type="button" data-restore="'+v.id+'">Retry place lookup</button>';
 if(v.restoreStatus==='relink')return '<button class="visit-details" type="button" data-relink="'+v.id+'">'+
   (relinkStop===v.id?'Cancel relinking':'Find a replacement place')+'</button>';
 return '<button class="visit-details" type="button" data-details="'+v.id+'">'+
  (v.place.source?.startsWith('mapbox')&&!restorePlaceId(v.reference||referenceForPlace(v.place))?'Link a Google place to save its location':ui.placeDetails)+'</button>';
}
function selectVisit(id,fromMap=false){
 placeRevision++;placeController?.abort();
 selected=id;edge=null;const v=visits.find(v=>v.id===id);if(!v)return;
 if(relinkStop!==id)relinkStop=null;
 if(fromMap){
  if(mapProvider==='mapbox'&&v.place.googlePlaceId)openGoogleDetails(v.place,{moveMap:false});
  else{selectedPlace=v.place;renderDetails();}
 }
 else if(googleDetailsController&&selectedPlace!==v.place)closePlacePane();
 render();
 if(fromMap)document.querySelector('[data-visit="'+id+'"]')?.scrollIntoView({block:'nearest',behavior:'smooth'});
 else focusPlace(v.place);
}
async function selectPlace(p){
 if(!p)return;
 const token=++placeRevision;placeController?.abort();placeController=new AbortController();
 const box=mapProvider==='mapbox',signal=placeController.signal;
 const existing=findDestination(visits,p);
 if(existing){if(box)selectVisit(existing.id,true);else revealExisting(existing);return;}
 showPlaceStatus(box?'Loading place details…':'Loading Google place details…');
 let detail;
 try{
  detail=box?(p.suggestion?await mapboxSearch.retrieve(p,signal):p):await placesProvider.describe(p,{signal});
 }catch(e){
  if(!signal.aborted&&token===placeRevision)showPlaceStatus(box||e.code?.startsWith('API_')?e.message:'Could not load the place details.',()=>selectPlace(p));
  return;
 }
 if(token!==placeRevision)return;
 await checkPlaceZone(detail,token,signal);
}
async function checkPlaceZone(detail,token,signal){
 if(signal.aborted||token!==placeRevision)return;
 showPlaceStatus('Checking place time zone…');
 try{
  const confirmed=await placesProvider.timeZone(detail,{signal});
  if(signal.aborted||token!==placeRevision)return;
  selectedPlace={...detail,zone:confirmed};
  if(mapProvider==='mapbox')focusPlace(selectedPlace);
  renderMap();renderDetails();retainPlaces();
 }catch(error){
  if(!signal.aborted&&token===placeRevision)showPlaceStatus(error.code?.startsWith('API_')?error.message:'Couldn’t verify this place’s time zone. Try again.',()=>checkPlaceZone(detail,token,signal));
 }
}
function showPlacePane(mode){
 $('#place-panel').hidden=!mode;
 $('#result-panel').hidden=mode!=='results';
 $('#details').hidden=mode!=='details';
 $('#back-results').hidden=mode!=='details'||!$('#results').querySelector('[data-result]');
 document.body.classList.toggle('show-places',!!mode);
}
function showPlaceStatus(message,retry){
 googleDetailsController?.abort();selectedPlace=null;renderMap();
 showPlacePane('details');$('#details').innerHTML=`<p role="status">${esc(message)}</p>`;
 if(retry){const button=document.createElement('button');button.textContent=ui.retry;button.onclick=retry;$('#details').append(button);}
}
function closePlacePane(back=false){
 placeRevision++;placeController?.abort();googleDetailsController?.abort();googleDetailsController=null;
 if(!back){searchRevision++;searchController?.abort();delayedMapboxSearch.cancel();delayedSearch.cancel();}
 selectedPlace=null;$('#details').replaceChildren();showPlacePane(back?'results':null);renderMap();retainPlaces();
}
$('#close-details').onclick=()=>closePlacePane();
$('#back-results').onclick=()=>{closePlacePane(true);if(mapProvider==='mapbox')searchMapbox();};

function renderDetails(){
 googleDetailsController?.abort();googleDetailsController=null;
 const panel=$('#details');
 if(!selectedPlace){panel.replaceChildren();showPlacePane(null);return;}
 showPlacePane('details');
 if(mapProvider!=='mapbox'&&selectedPlace.source?.startsWith('mapbox')){panel.innerHTML='<p>View this place in Mapbox.</p>';return;}
 if(mapProvider==='mapbox'&&!validMapboxPlace(selectedPlace)){
  panel.innerHTML='<div class="details-body"><h2>Google place</h2><p>Place information from Google Maps.</p></div>';return;
 }
 const p=selectedPlace,day=$('#date').value?new Date($('#date').value+'T00:00:00Z').getUTCDay():null;
 const clock=m=>(m>=1440?ui.nextDay+' ':'')+String(Math.floor((m%1440)/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const dateHours=p.dateHours?.[$('#date').value];
 const periods=dateHours??p.hours?.[day];
 const hrs=periods?.map(([a,b])=>a===0&&b===1440?'Open 24 hours':clock(a)+' – '+clock(b)).join('<br>')||'Closed';
 const hours=periods?`<div class="hours"><strong>${esc($('#date').value)} · ${esc(p.zone||zone())}</strong><br>${hrs}<p>${dateHours?'Hours for this date':'Regular hours · holiday and special hours are unconfirmed'}</p></div>`:'';
 const photo=p.photo?'<img class="place-photo" src="'+esc(p.photo)+'" alt="'+esc(p.name)+' photo">':'';
 panel.innerHTML=(photo&&p.photoSource?'<a target="_blank" rel="noopener noreferrer" href="'+esc(p.photoSource)+'">'+photo+'</a>':photo)+'<div class="details-body"><span class="eyebrow">'+esc(p.category)+'</span><h2>'+esc(p.name)+'</h2>'+(p.address?'<p class="address">⌖ '+esc(p.address)+'</p>':'')+(p.attributions?.length?'<p>'+p.attributions.map(a=>'<a rel="noopener noreferrer" target="_blank" href="'+esc(a.providerURI||'https://maps.google.com')+'">'+esc(a.provider||'Google Maps')+'</a>').join(', ')+'</p>':'')+(p.authors?'<p>'+p.authors.map(a=>'<a rel="noopener noreferrer" target="_blank" href="'+esc(a.uri||'https://maps.google.com')+'">'+esc(a.displayName)+'</a>').join(', ')+'</p>':'')+hours+'</div>';
 const actions=appendPlaceActions(panel,p);
 if(mapProvider==='mapbox'){
  const googleButton=document.createElement('button');googleButton.type='button';googleButton.className='place-link-action';
  googleButton.textContent='View Google place details';googleButton.onclick=()=>openGoogleDetails(p);actions.append(googleButton);
 }
}
function appendPlaceActions(container,place){
 const actions=document.createElement('div');actions.className='place-detail-actions';
 const button=document.createElement('button');button.type='button';button.className='primary';button.id='add';
 button.onclick=()=>{if(findDestination(visits,place))closePlacePane();add(place);};
 const note=document.createElement('p');note.className='place-zone-note';note.role='status';note.hidden=true;
 actions.append(note,button);container.append(actions);updateAddAction();return actions;
}
async function openGoogleDetails(place,{rematch=false,moveMap=true,retry=false}={}){
 if(!rematch&&!retry&&selectedPlace===place&&googleDetailsController&&!googleDetailsController.signal.aborted)return;
 placeRevision++;placeController?.abort();googleDetailsController?.abort();selectedPlace=place;
 showPlacePane('details');const panel=$('#details');panel.scrollTop=0;
 if(moveMap&&mapProvider==='mapbox')focusPlace(place);
 googleDetailsController=new AbortController();
 const {signal}=googleDetailsController;
 const host=document.createElement('section');host.className='google-details';
 host.setAttribute('aria-label','Google Maps place details');panel.replaceChildren(host);renderMap();
 const status=(message,retry)=>{
  host.replaceChildren();const p=document.createElement('p');p.role='status';p.textContent=message;host.append(p);
  if(retry){const button=document.createElement('button');button.type='button';button.textContent=ui.retry;button.onclick=retry;host.append(button);}
 };
 const retryMatch=()=>openGoogleDetails(place,{rematch,moveMap:false,retry:true});
 let Place;
 async function showWidget(id){
  status('Loading Google Maps place details…');
  panel.scrollTop=0;
  const retry=()=>showWidget(id);
  let options;
  try{options=await browserPermit(signal,'googleWidgets');}
  catch(error){if(!signal.aborted)status(error.message,retry);return;}
  const timeout=setTimeout(()=>{if(!signal.aborted)status('Google Places UI Kit timed out.',retry);},15000);
  signal.addEventListener('abort',()=>clearTimeout(timeout),{once:true});
  const widget=createGoogleWidget(id,{Place,media:options.googleMedia!==false,onLoad:()=>{
   clearTimeout(timeout);
   if(signal.aborted||!widget.isConnected)return;
   const visit=findDestination(visits,place);
   const reference=visit&&(visit.reference||referenceForPlace(visit.place));
   rememberGooglePlaceId(place,id);
   if(visit){
    visit.place.googlePlaceId=id;
    if(restorePlaceId(reference)!==id){
     visit.reference={...reference,googlePlaceId:id};
     onboarding.save(saveSnapshot());
    }
   }
   host.querySelector('[role=status]')?.remove();
   const note=document.createElement('p');note.className='google-hours-note';
   note.textContent='“Open now” refers to the current local time at the place. Check special hours for your travel date before visiting.';
   host.append(note);
   const actions=appendPlaceActions(host,place);
   const change=document.createElement('button');change.type='button';change.className='place-link-action';change.textContent=ui.changePlace;
   change.onclick=()=>openGoogleDetails(place,{rematch:true,moveMap:false});actions.append(change);
  },onError:()=>{clearTimeout(timeout);if(!signal.aborted&&widget.isConnected)status('Could not load Google place details.',retry);}});
  host.append(widget);
 }
 status('Finding the matching place in Google Maps…');
 try{
  if(config.browserOptions?.googleWidgets===false)throw Error('Google place widgets are disabled.');
  const match=await findGoogleCandidates(place,config.browserKey,signal,{rematch,search:(p,options)=>placesProvider.candidates(p,options)});
  if(signal.aborted)return;
  ({Place}=await google.maps.importLibrary('places'));
  if(signal.aborted)return;
  if(match.id){showWidget(match.id);return;}
  if(!match.candidates.length){status('No matching Google place was found near these coordinates.',retryMatch);return;}
  status('Check the address and category, then select the matching Google place.');
  let remaining=match.candidates.length;
  let candidateChosen=false;
  const candidateTimeout=setTimeout(()=>{if(!signal.aborted&&host.querySelector('.google-candidate')&&!host.querySelector('.google-candidate button:enabled'))status('Google place candidates took too long to load.',retryMatch);},15000);
  signal.addEventListener('abort',()=>clearTimeout(candidateTimeout),{once:true});
  for(const candidate of match.candidates){
   await browserPermit(signal,'googleWidgets');
   if(candidateChosen)return;
   const entry=document.createElement('div');entry.className='google-candidate';
   const confirm=document.createElement('button');confirm.textContent='Select this Google place';confirm.disabled=true;
   const widget=createGoogleWidget(candidate.id,{Place,compact:true,onLoad:()=>{confirm.disabled=false;},onError:()=>{
    if(signal.aborted||!entry.isConnected)return;
    entry.remove();remaining--;
    if(!remaining){clearTimeout(candidateTimeout);status('Google rejected the place preview request. Check that Places UI Kit is enabled and review the key restrictions.',retryMatch);}
   }});
   confirm.onclick=()=>{
    if(candidateChosen)return;
    candidateChosen=true;clearTimeout(candidateTimeout);showWidget(candidate.id);
   };entry.append(widget,confirm);host.append(entry);
  }
 }catch(error){if(!signal.aborted)status(error.code?.startsWith('API_')||error.message.startsWith('Google')?error.message:'Google place search failed. Check Places API (New), key restrictions, and the network.',retryMatch);}
}
function transitClock(instant){
 if(!instant||!Number.isFinite(Date.parse(instant)))return '';
 return new Intl.DateTimeFormat(locale,{timeZone:zone(),month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
}
function transitMarkup(route,from,to){
 const agencies=new Map();
 let rides=0;
 const steps=(route.steps||[]).map(step=>{
  if(step.mode!=='TRANSIT'){
   const minutes=Number.isFinite(step.seconds)?' · '+formatDuration(Math.ceil(step.seconds/60)):'';
   const distance=Number.isFinite(step.distance)?' · '+step.distance+' m':'';
   return '<li><strong>'+ui.modes.WALK+minutes+distance+'</strong>'+(step.instruction?'<p>'+esc(step.instruction)+'</p>':'')+'</li>';
  }
  for(const a of step.agencies||[])if(a.name)agencies.set(a.name,a.uri);
  const label=[step.vehicle,step.line,step.lineName!==step.line?step.lineName:''].filter(Boolean).join(' · ');
  const stop=(time,name)=>[transitClock(time),name].filter(Boolean).join(' ');
  return '<li><strong>'+(rides++?'Transfer · ':'')+esc(label||ui.modes.TRANSIT)+'</strong>'+
   (step.headsign?'<p>'+esc(step.headsign)+' bound</p>':'')+
   '<p>Board '+esc(stop(step.departureTime,step.departureStop)||ui.unavailable)+'<br>Get off '+esc(stop(step.arrivalTime,step.arrivalStop)||ui.unavailable)+'</p></li>';
 }).join('');
 const credits=[...agencies].map(([name,uri])=>/^https?:\/\//i.test(uri||'')?'<a href="'+esc(uri)+'" target="_blank" rel="noopener noreferrer">'+esc(name)+'</a>':esc(name)).join(' · ');
 const distance=Number.isFinite(route.distance)?' · '+(route.distance/1000).toFixed(2)+' km':'';
 return '<p class="transit-total">'+ui.departure+' '+esc(scheduleTime(from?.departure))+' → '+ui.arrival+' '+esc(scheduleTime(to?.arrival))+'<br><strong>'+formatDuration(route.minutes)+'</strong>'+distance+(route.fare?' · '+esc(route.fare):'')+'</p>'+
  '<small>Google Maps'+(credits?' · '+credits:'')+'</small><ol class="transit-steps">'+steps+'</ol>';
}
function renderEdge(){
 const panel=$('#edge-settings');panel.hidden=!edge||!segments[edge];if(panel.hidden)return;
 const i=visits.findIndex((v,index)=>index<visits.length-1&&segmentKey(v,visits[index+1])===edge),r=result.routes[edge];
 const mode=segments[edge].mode,box=mapProvider==='mapbox';
 const controls=Object.entries(modes).map(([key,label])=>'<button data-mode="'+key+'" aria-pressed="'+(mode===key)+'" class="'+(mode===key?'active':'')+'">'+label+(box&&key==='TRANSIT'?' · Switch to Google Maps':'')+'</button>').join('');
 const koreaCoverageGap=!loading&&!box&&zone()==='Asia/Seoul'&&r?.status==='no-route'&&['WALK','DRIVE'].includes(mode);
 const message=koreaCoverageGap
  ?'Google Maps has limited walking and driving coverage in South Korea. Select Public transit to check this leg.'
  :r?.details||r?.message||'Waiting for route details';
 const info=!loading&&r?.status==='ok'&&mode==='TRANSIT'&&!box
  ?transitMarkup(r,result.rows[i],result.rows[i+1])
  :'<p>'+esc(loading?ui.calculating:message)+'</p>'+(!loading&&!koreaCoverageGap&&r&&r.status!=='ok'?'<button id="retry-route" type="button">'+ui.retry+'</button>':'');
 const previous=panel.querySelector('.edge-settings-content')?.scrollTop||0;
 panel.innerHTML='<div class="edge-settings-content"><button class="close" id="close-edge" aria-label="Close travel mode">×</button><h3>'+(i+1)+' → '+(i+2)+' travel mode</h3><div class="mode-buttons">'+controls+'</div>'+info+'</div>';
 panel.firstElementChild.scrollTop=previous;
 $('#close-edge').onclick=()=>{edge=null;renderEdge();renderMap();};
 $('#retry-route')?.addEventListener('click',()=>{
  provider().retry(visits[i].place,visits[i+1].place,mode);refresh('retry');
 });
 panel.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{
  const next=button.dataset.mode;
  if(mode===next)return;
  if(box&&next==='TRANSIT'){
   if(visits[i]?.place.source?.startsWith('mapbox')||visits[i+1]?.place.source?.startsWith('mapbox')){
    toast(ui.mapboxGoogleLocation);
    return;
   }
   toast('Opening Google Maps…');
   switchGoogle({transitEdge:edge});return;
  }
  segments[edge]={mode:next};refresh('mode');
 });
}
function decode(encoded){let index=0,lat=0,lng=0,points=[];while(index<encoded.length){const read=()=>{let b,shift=0,n=0;do{b=encoded.charCodeAt(index++)-63;n|=(b&31)<<shift;shift+=5;}while(b>=32);return n&1?~(n>>1):n>>1;};lat+=read();lng+=read();points.push({lat:lat/1e5,lng:lng/1e5});}return points;}
function graphics(proj){
 const unit=1;
 const locations=visits.map(v=>hasLocation(v.place)?proj(v.place):null);
 const offsets=visits.map((v,i)=>{if(!locations[i])return null;const same=visits.map((x,j)=>x.place.lat===v.place.lat&&x.place.lng===v.place.lng?j:-1).filter(j=>j>=0);const n=same.indexOf(i);return {x:locations[i].x+(same.length>1?(n-(same.length-1)/2)*40*unit:0),y:locations[i].y};});
 let out='';const casings=[],lines=[],arrows=[],edgeLabels=[];
 visits.slice(0,-1).forEach((v,i)=>{
 const k=segmentKey(v,visits[i+1]),r=result.routes[k],a=offsets[i],b=offsets[i+1];
 if(!a||!b||r?.status!=='ok'||r.source!=='live'||!r.polyline)return;
 const points=decode(r.polyline).map(proj),d=points.map((q,j)=>(j?'L':'M')+q.x+','+q.y).join(' ');
 const active=edge===k?' active':'';
 casings.push('<path class="route-casing'+active+'" d="'+d+'"/>');
 lines.push('<path class="edge-hit" data-edge="'+k+'" d="'+d+'"/><path class="map-edge'+active+'" data-edge="'+k+'" d="'+inkRoute(points,k,unit)+'" tabindex="0" role="button" aria-label="Travel mode from stop '+(i+1)+' to stop '+(i+2)+'"><title>'+esc(modes[r?.mode||segments[k].mode])+' · '+(r?.status==='ok'?formatDuration(r.minutes):ui.routeUnconfirmed)+'</title></path><path class="route-overprint" d="'+inkRoute(points,k,unit,true)+'"/>');
 lines.push('<path class="route-current" aria-hidden="true" d="'+d+'"/>');
 const arrowPath=routeArrows(points,unit,k);
 arrows.push('<g class="route-arrows"><path class="arrow-casing" d="'+arrowPath+'"/><path class="arrow-white" d="'+arrowPath+'"/></g>');
 if(edge===k)edgeLabels.push('<text x="'+((a.x+b.x)/2)+'" y="'+((a.y+b.y)/2-12)+'" class="node-time">'+esc(modes[r?.mode||segments[k].mode])+' '+(r?.status==='ok'?formatDuration(r.minutes):ui.unconfirmed)+'</text>');
 });
 out+=casings.join('')+lines.join('')+arrows.join('')+edgeLabels.join('');
 livePlaces.filter(p=>!visits.some(v=>v.place.id===p.id)).forEach(p=>{const q=proj(p);out+='<g class="map-place" data-place="'+esc(p.id)+'" tabindex="0" role="button" aria-label="'+esc(p.name)+' details" transform="translate('+q.x+','+q.y+')"><circle r="7" fill="#fff" stroke="#789282" stroke-width="2"/><text class="node-title" x="13" y="4" style="font-size:11px;font-weight:400">'+esc(p.name)+'</text></g>';});
 // Lay out the selected label first, then reserve its arrival line before other labels.
 const priority=visits.map((v,i)=>i).filter(i=>offsets[i]&&!visits[i].place.source?.startsWith('mapbox')).sort((a,b)=>(visits[b].id===selected?1:0)-(visits[a].id===selected?1:0));
 const occupied=offsets.filter(Boolean).map(q=>({x:q.x/unit-20,y:q.y/unit-20,w:40,h:40}));
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
 priority.reverse().forEach(i=>{const v=visits[i],q=offsets[i],active=v.id===selected,label=labels[i];if(v.place.source?.startsWith('mapbox'))return;
 out+='<g class="map-node" data-node="'+v.id+'" tabindex="0" role="button" aria-label="'+(i+1)+' · '+esc(v.place.name)+(i===0?' · Starting point':'')+'" transform="translate('+q.x+','+q.y+') scale('+unit+')">';
 if(q.x!==locations[i].x)out+='<line x1="0" y1="0" x2="'+((locations[i].x-q.x)/unit)+'" y2="0" stroke="#789282"/>';
 out+='<path class="node-outline" d="'+inkNode(v.id,active?21:17)+'" fill="'+mapPalette.marker+'" stroke="'+(active?'#F4F1E8':'#DDE9E1')+'" stroke-width="'+(active?5:2)+'"/><circle r="'+(active?20:16)+'" fill="'+mapPalette.marker+'" stroke="none"/><text class="node-number" text-anchor="middle" y="5" fill="white" font-size="13" font-weight="700">'+(i+1)+'</text>';
 out+='<text class="node-title" text-anchor="middle" x="'+label.x+'" y="'+label.y+'">'+esc(v.place.name)+'</text>';
 if(i===0)out+='<g class="node-start"><rect x="14" y="7" width="31" height="18" rx="5" fill="#DDE9E1" stroke="#164F3B"/><text x="29.5" y="20" text-anchor="middle" font-size="10" fill="#164F3B">Start</text></g>';
 if(active)out+='<text class="node-time" text-anchor="middle" y="39">'+esc(loading?ui.calculating:stamp(result.rows[i]?.arrival))+'</text>';
 out+='</g>';
 });return out;
}
function bindMap(el){
 el.onclick=e=>{const n=e.target.closest('[data-node]'),p=e.target.closest('[data-place]'),s=e.target.closest('[data-edge]');if(n)selectVisit(n.dataset.node,true);else if(p)selectPlace(livePlaces.find(x=>x.id===p.dataset.place));else if(s){edge=s.dataset.edge;renderEdge();renderMap();}};
 el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const target=e.target.closest('[role="button"]');if(target){e.preventDefault();target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}}};
}
function renderMap(){
 if(mapProvider==='mapbox'){mapboxRenderer?.render(visits,selected,result.routes);mapboxRenderer?.preview(selectedPlace&&!visits.some(v=>v.place.id===selectedPlace.id)?selectedPlace:null);return;}
 overlay?.draw();
}
function focusPlace(p){
 if(!hasLocation(p))return;
 if(mapProvider==='mapbox')mapboxRenderer?.focus(p);
 else gmap?.panTo({lat:p.lat,lng:p.lng});
}
new ResizeObserver(()=>{if(mapProvider==='mapbox')mapboxRenderer?.resize();renderMap();}).observe($('.map-area'));
function zoom(factor){
 const delta=factor<1?1:-1;
 if(mapProvider==='mapbox')mapboxRenderer?.zoom(delta);
 else if(gmap)gmap.setZoom(gmap.getZoom()+delta);
}
$('#zoom-in').onclick=()=>zoom(.8);$('#zoom-out').onclick=()=>zoom(1.25);
$('#fit').onclick=()=>{if(mapProvider==='mapbox'){
 const points=visits.map(v=>v.place).filter(validMapboxPlace);
 if(points.length){
  const narrow=matchMedia('(max-width: 800px)').matches;
  const top=$('header').getBoundingClientRect().bottom+18,bottom=narrow?Math.round(innerHeight*.36)+38:48;
  const leftPanel=$('#place-panel');
  const padding={top:Math.min(top,innerHeight*.36),bottom,left:!narrow&&!leftPanel.hidden?leftPanel.offsetWidth+48:32,right:narrow?32:$('.itinerary').offsetWidth+48};
  mapboxRenderer?.fit([[Math.min(...points.map(p=>p.lng))-.002,Math.min(...points.map(p=>p.lat))-.002],[Math.max(...points.map(p=>p.lng))+.002,Math.max(...points.map(p=>p.lat))+.002]],padding);
 }
 return;
}
 if(gmap){const b=new google.maps.LatLngBounds();(visits.length?visits.map(v=>v.place).filter(p=>hasLocation(p)&&!p.source?.startsWith('mapbox')):livePlaces).forEach(p=>b.extend({lat:p.lat,lng:p.lng}));if(!b.isEmpty())gmap.fitBounds(b,80);}
};
$('#visits').onclick=e=>{
 const remove=e.target.closest('[data-remove]'),move=e.target.closest('[data-move]'),s=e.target.closest('[data-edge]'),detail=e.target.closest('[data-details]');
 const restore=e.target.closest('[data-restore]'),relink=e.target.closest('[data-relink]');
 if(restore){retrySavedStop(restore.dataset.restore);}
 else if(relink){relinkSavedStop(relink.dataset.relink);}
 else if(detail){const visit=visits.find(v=>v.id===detail.dataset.details);if(visit)openGoogleDetails(visit.place);}
 else if(remove){visits=visits.filter(v=>v.id!==remove.dataset.remove);if(selected===remove.dataset.remove)selected=relinkStop=null;refresh();}
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
$('#date').onchange=()=>{if(schedule.date===$('#date').value)return;schedule.date=$('#date').value;refresh('date');if(selectedPlace&&!googleDetailsController)renderDetails();};
$('#time').onchange=()=>{if(schedule.time===$('#time').value)return;schedule.time=$('#time').value;refresh('time');};
$('#date').oninput=$('#date').onchange;$('#time').oninput=$('#time').onchange;
function showResults(list){
 showPlacePane('results');
 $('#results').innerHTML=list.length?list.map(p=>'<button type="button" class="result" data-result="'+esc(p.id)+'">'+esc(p.name)+'<small>'+esc(p.address)+'</small></button>').join(''):'<p>'+ui.noResults+'</p>';
 $('#results').querySelectorAll('[data-result]').forEach(button=>button.onclick=()=>selectPlace(list.find(p=>p.id===button.dataset.result)));
}
function showSearchStatus(message){
 placeRevision++;placeController?.abort();googleDetailsController?.abort();googleDetailsController=null;
 selectedPlace=null;$('#details').replaceChildren();renderMap();
 $('#results').textContent=message;showPlacePane('results');
}
// Keep the existing explicit-submit search UX: typing never spends Google quota.
// Debounce repeated submits, invalidate older results as soon as input changes.
$('#search').oninput=()=>{
 if(mapProvider==='mapbox'){searchRevision++;searchController?.abort();delayedMapboxSearch.cancel();if($('#search').value.trim().length>=2){showSearchStatus('Preparing search…');delayedMapboxSearch();}else if(!$('#place-panel').hidden)closePlacePane();return;}
 delayedSearch.cancel();searchRevision++;searchController?.abort();
 if(!$('#details').hidden)closePlacePane();
 $('#results').innerHTML='';
};
$('#search-form').onsubmit=e=>{
 e.preventDefault();if(mapProvider==='mapbox'){delayedMapboxSearch.cancel();searchMapbox();return;}
 if([...$('#search').value.trim()].length<requestConfig.minSearchLength){delayedSearch.cancel();showSearchStatus(ui.minQuery);return;}
 delayedSearch();
};
async function searchPlaces(reason){
 const query=$('#search').value.trim().replace(/\s+/g,' ');
 if(pendingGoogleSearch?.query===query&&pendingGoogleSearch.revision===searchRevision)return;
 const rev=++searchRevision;searchController?.abort();searchController=new AbortController();
 pendingGoogleSearch={query,revision:rev};
 showSearchStatus('Searching Google Places…');
 try{
   const list=await placesProvider.search(query,{signal:searchController.signal,reason,
    locationBias:tripDestination.center});
   if(rev!==searchRevision){monitor.record({api:'places-search',reason,id:'current-query',status:'stale-discarded'});return;}
   livePlaces=list;retainPlaces();showResults(livePlaces);renderMap();
 }catch(e){if(e.name!=='AbortError'&&rev===searchRevision)$('#results').textContent=e.code?.startsWith('API_')?e.message:'Place search failed. Check API settings and regional availability.';}
 finally{if(pendingGoogleSearch?.revision===rev)pendingGoogleSearch=null;}
}
async function searchMapbox(){
 const q=$('#search').value.trim();if(q.length<2){showSearchStatus(ui.minQuery);return;}
 if(pendingMapboxSearch?.query===q&&pendingMapboxSearch.revision===searchRevision)return;
 const rev=++searchRevision;searchController?.abort();searchController=new AbortController();
 pendingMapboxSearch={query:q,revision:rev};showSearchStatus('Searching Mapbox…');
 try{const map=mapboxRenderer?.map,c=map?.getZoom()>=5?map.getCenter():tripDestination.center;const list=await mapboxSearch.suggest(q,[c.lng,c.lat],searchController.signal);if(rev!==searchRevision||mapProvider!=='mapbox')return;showResults(list);}
 catch(e){if(e.name!=='AbortError'&&rev===searchRevision)$('#results').textContent=e.message;}
 finally{if(pendingMapboxSearch?.revision===rev)pendingMapboxSearch=null;}
}
async function connectGoogle(token,journeyCenter){
 await browserPermit();
 if(token!==mapSwitch)return;
 if(!config.browserKey)throw Error(ui.googleKeyMissing);
 await loadGoogleMaps(config.browserKey,{monitor});
 if(token!==mapSwitch)return;
 $('#google-map').style.display='block';
 const map=new google.maps.Map($('#google-map'),{...mapOptions(config.mapId),...(journeyCenter?{center:journeyCenter,zoom:12}:{})});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>finish(Error('Could not load Google Maps tiles.')),15000);
  const listener=map.addListener('tilesloaded',()=>finish());
  function finish(error){
   clearTimeout(timer);listener?.remove?.();
   if(error)reject(error);else resolve();
  }
  window.gm_authFailure=()=>finish(Error(ui.googleAuthSettings));
 });
 if(token!==mapSwitch)return;
 gmap=map;
 class ItineraryOverlay extends google.maps.OverlayView{
  onAdd(){this.el=document.createElementNS('http://www.w3.org/2000/svg','svg');Object.assign(this.el.style,{position:'absolute',left:'0',top:'0',width:'1px',height:'1px',overflow:'visible',pointerEvents:'none'});this.getPanes().overlayMouseTarget.appendChild(this.el);bindMap(this.el);}
  draw(){if(!this.el||mapProvider!=='google')return;const projection=this.getProjection();if(projection)this.el.innerHTML=graphics(p=>projection.fromLatLngToDivPixel(new google.maps.LatLng(p.lat,p.lng)));}
  onRemove(){this.el?.remove();}
 }
 overlay=new ItineraryOverlay();overlay.setMap(map);
 window.gm_authFailure=()=>{
  if(gmap!==map||mapProvider!=='google')return;
  google.maps.event.clearInstanceListeners(map);
  overlay.setMap(null);overlay=null;gmap=null;
  $('#google-map').replaceChildren();
  showMapError(ui.googleAuth,()=>switchGoogle());
 };
 map.addListener('click',e=>{if(mapProvider!=='google'||!e.placeId)return;e.stop();const existing=visits.find(v=>v.place.source==='live'&&v.place.id===e.placeId);if(existing)revealExisting(existing);else selectPlace({id:e.placeId});});
}
function rememberProvider(provider){try{localStorage.setItem('travel-link.map-provider',provider);}catch{}}
function currentBounds(){
 if(mapProvider==='mapbox')return mapboxRenderer?.bounds();
 const b=gmap?.getBounds?.();
 if(b){const sw=b.getSouthWest(),ne=b.getNorthEast();return [[sw.lng(),sw.lat()],[ne.lng(),ne.lat()]];}
 return null;
}
function updateProviderUI(){
 const box=mapProvider==='mapbox';$('.map-area').dataset.provider=mapProvider;
 $('#service').textContent=box?'Mapbox ▾':'Google Maps ▾';
 $('#source-badge').textContent=box?'MAPBOX':'GOOGLE / LIVE';
 $('#search').title=box?'Mapbox Search Box · United States, Canada, and Europe':'Search with Google Places';
 $('#map-disclaimer').textContent=box?'Mapbox · OpenStreetMap contributors':'Google Maps · Google Routes';
 document.querySelectorAll('[data-map-provider]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.mapProvider===mapProvider)));
}
function closeProviderMenu(){$('#map-provider-menu').hidden=true;$('#service').setAttribute('aria-expanded','false');}
function cancelSearchForSwitch(){closePlacePane();mapboxSearch.reset();$('#results').replaceChildren();clearTimeout(toast.timer);$('#notice').style.display='none';}
function globePadding(){
 if(document.body.classList.contains('arrival-screen'))return {top:Math.round(innerHeight*.95),bottom:0,left:0,right:0};
 const narrow=matchMedia('(max-width: 800px)').matches;
 const header=$('header').getBoundingClientRect(),panel=$('.itinerary').getBoundingClientRect();
 return {top:Math.min(header.bottom+16,innerHeight*.42),bottom:narrow?Math.min(innerHeight-panel.top+8,innerHeight*.45):38,
  left:16,right:narrow?16:innerWidth-panel.left+14};
}
function showMapError(message,retry,other=mapProvider==='mapbox'?switchGoogle:switchMapbox){
 clearTimeout(toast.timer);$('#notice').style.display='none';
 $('#mapbox-error-text').textContent=message;
 $('#mapbox-retry').onclick=()=>{ $('#mapbox-error').hidden=true;retry(); };
 $('#mapbox-return').onclick=()=>{ $('#mapbox-error').hidden=true;other(); };
 $('#mapbox-error').hidden=false;
}
function commitProvider(provider){
 mapProvider=provider;rememberProvider(provider);
 $('#mapbox-error').hidden=true;
 cancelSearchForSwitch();updateProviderUI();refresh('provider');
}
async function switchMapbox(options={}){
 if(serviceStopped)return;
 closeProviderMenu();
 if(!options.arrival&&Object.values(segments).some(segment=>segment.mode==='TRANSIT')){
  toast(ui.transitGoogleOnly);
  return;
 }
 if(pendingProvider==='mapbox'||mapProvider==='mapbox'&&mapboxRenderer?.ready)return;
 pendingProvider='mapbox';
 const token=++mapSwitch,bounds=options.initial?null:currentBounds();
 $('#mapbox-error').hidden=true;
 try{
  await configReady;if(token!==mapSwitch)return;
  await mapboxPermit();
  if(token!==mapSwitch)return;
  if(!/^pk\.[A-Za-z0-9._-]+$/.test(config.mapboxToken||''))throw Error(ui.mapboxTokenMissing);
  await loadMapbox();if(token!==mapSwitch)return;
  mapboxRenderer?.destroy();
  const renderer=new MapboxRenderer($('#mapbox-map'),{
   onSelect:id=>selectVisit(id,true),onPlace:selectPlace,onEdge:key=>{edge=key;renderEdge();},
   onError:message=>showMapError(message,()=>{renderer.destroy();switchMapbox(options);},switchGoogle)
  });
  mapboxRenderer=renderer;
  await renderer.activate(config.mapboxToken,bounds,bounds?null:globePadding(),document.body.classList.contains('arrival-screen'));
  if(token!==mapSwitch){renderer.destroy();return;}
  $('#google-map').style.display='none';
  commitProvider('mapbox');
 }catch(error){
  if(token!==mapSwitch)return;
  mapboxRenderer?.destroy();showMapError(error.message,()=>switchMapbox(options),switchGoogle);
 }finally{
  if(token===mapSwitch)pendingProvider=null;
 }
}
async function switchGoogle({transitEdge,journeyCenter}={}){
 if(serviceStopped)return;
 closeProviderMenu();
 if(pendingProvider==='google'||mapProvider==='google'&&gmap&&!transitEdge&&!journeyCenter)return;
 pendingProvider='google';
 const token=++mapSwitch;
 const bounds=currentBounds();
 $('#mapbox-error').hidden=true;
 try{
  await configReady;if(token!==mapSwitch)return;
  if(!gmap)await connectGoogle(token,journeyCenter);
  else if(journeyCenter){
   $('#google-map').style.display='block';
   const current=gmap.getCenter?.();
   if(current?.lat()!==journeyCenter.lat||current?.lng()!==journeyCenter.lng||gmap.getZoom()!==12){
    await new Promise(resolve=>{
     const listener=gmap.addListener('tilesloaded',finish),timeout=setTimeout(finish,2500);
     function finish(){clearTimeout(timeout);listener?.remove();resolve();}
     gmap.setOptions({center:journeyCenter,zoom:12});
    });
   }
  }
  if(token!==mapSwitch)return;
  $('#google-map').style.display='block';
  mapboxRenderer?.destroy();mapboxRenderer=null;
  const localBounds=bounds&&bounds[1][0]-bounds[0][0]>0&&bounds[1][0]-bounds[0][0]<40;
  if(localBounds&&!journeyCenter){
   const [[west,south],[east,north]]=bounds;
   gmap.fitBounds({west,south,east,north},0);
  }
  if(transitEdge&&segments[transitEdge]){segments[transitEdge]={mode:'TRANSIT'};edge=transitEdge;}
  commitProvider('google');
  if(transitEdge)onboarding.save(saveSnapshot());
 }catch(error){
  if(token!==mapSwitch)return;
  if(!gmap){$('#google-map').style.display='none';$('#google-map').replaceChildren();}
  showMapError(error.message,()=>switchGoogle({transitEdge,journeyCenter}),switchMapbox);
 }finally{
  if(token===mapSwitch)pendingProvider=null;
 }
}
$('#service').setAttribute('aria-haspopup','menu');$('#service').setAttribute('aria-expanded','false');
$('#service').onclick=()=>{const menu=$('#map-provider-menu');menu.hidden=!menu.hidden;$('#service').setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('[aria-checked="true"]').focus();};
$('#choose-google').onclick=()=>switchGoogle();$('#choose-mapbox').onclick=()=>switchMapbox();
document.addEventListener('click',e=>{if(!e.target.closest('.map-provider-picker'))closeProviderMenu();});
$('.map-provider-picker').onkeydown=e=>{if(e.key==='Escape'){closeProviderMenu();$('#service').focus();}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const buttons=[...$('#map-provider-menu').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);$('#map-provider-menu').hidden=false;$('#service').setAttribute('aria-expanded','true');buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}};
window.addEventListener('pagehide',()=>mapboxRenderer?.destroy());
let serviceStopped=false,checkingService=false;
function stopService(message){
 if(serviceStopped)return;
 serviceStopped=true;mapSwitch++;placeRevision++;searchRevision++;revision++;
 for(const request of [controller,searchController,placeController,googleDetailsController])request?.abort();
 delayedCalculation.cancel();delayedSearch.cancel();delayedMapboxSearch.cancel();
 mapboxRenderer?.destroy();
 if(gmap){
  google.maps.event?.clearInstanceListeners(gmap);
  gmap.unbindAll?.();
  $('#google-map').replaceChildren();
 }
 document.querySelector('#arrival')?.close();
 for(const node of document.body.children)node.hidden=true;
 const notice=document.createElement('h1');
 notice.id='service-stop';notice.tabIndex=-1;notice.textContent=message||'Travel Link is temporarily paused. Please check back later.';
 document.body.append(notice);notice.focus();
}
function serviceDenied(data){
 if(['API_SITE_STOPPED','API_USAGE_UNAVAILABLE'].includes(data?.code)){stopService(data.message);return true;}
 return false;
}
async function checkService(){
 if(serviceStopped||checkingService||document.hidden)return;
 checkingService=true;
 try{
  const response=await fetch('/api/service-status',{signal:AbortSignal.timeout(5000)});
  if(response.status===503)serviceDenied(await response.json());
 }catch{}finally{checkingService=false;}
}
const configReady=fetch('/api/config').then(r=>r.json()).then(c=>{
 config=c;if(serviceDenied(c))return;
 monitor.setEnabled(c.requestMonitor===true);if(c.requestMonitor)window.travelLinkRequests=monitor;
}).catch(()=>{});
async function browserPermit(signal,feature){
 await configReady;
 if(serviceStopped)throw Object.assign(Error('Travel Link is temporarily paused.'),{code:'API_SITE_STOPPED'});
 signal?.throwIfAborted();
 let options=config.browserOptions||{};
 if(config.code?.startsWith('API_'))throw Object.assign(Error(config.message),{code:config.code});
 if(config.usageGuard){
  const timeout=AbortSignal.timeout(8000);
  const response=await fetch('/api/usage/browser',{method:'POST',signal:signal?AbortSignal.any([signal,timeout]):timeout});
  const data=await response.json();
  serviceDenied(data);
  if(!response.ok||!data.allowed)throw Object.assign(Error(data.message||'Map services are temporarily unavailable.'),{code:data.code||'API_UNAVAILABLE'});
  options=data.browserOptions||{};
 }
 signal?.throwIfAborted();
 if(feature&&options[feature]===false)throw Object.assign(Error('This map feature is disabled.'),{code:'API_FEATURE_DISABLED'});
 return options;
}
decorateWoodPanels();
const narrowItinerary=matchMedia('(max-width: 800px)');
function sizeDayOverview(){ $('#day-overview').open=!narrowItinerary.matches; }
sizeDayOverview();narrowItinerary.addEventListener('change',sizeDayOverview);
const pickers=setupSchedulePickers({date:$('#date'),time:$('#time'),today:()=>dateInZone(zone())});
async function restoreStop(stop,savedZone,signal){
 const reference=stopReference(stop),id=restorePlaceId(reference);
 const visit={id:stop.id,stay:stop.stay,wait:stop.wait,reference};
 let restoreStatus='relink';
 if(id){
  try{
   signal?.throwIfAborted();
   const place=await placesProvider.describe({id},{signal,reason:'resume-trip'});
   if(!hasLocation(place)||!place.name)throw Error('Place details unavailable');
   return {...visit,place:{...place,zone:savedZone},restoreStatus:null};
  }catch(error){
   if(signal?.aborted||error.name==='AbortError')throw error;
   restoreStatus=['NOT_FOUND','INVALID_ARGUMENT'].includes(error.code)?'relink':'retry';
  }
 }
 return {...visit,restoreStatus,place:{id:stop.id,source:'unavailable',
  category:'Needs attention',name:restoreStatus==='retry'?'Place lookup failed':'Place needs relinking'}};
}
async function retrySavedStop(id){
 const visit=visits.find(v=>v.id===id&&v.restoreStatus==='retry');
 if(!visit)return;
 visit.restoreStatus='loading';render();
 const restored=await restoreStop({...visit,...visit.reference},zone());
 if(!visits.includes(visit))return;
 visit.place=restored.place;visit.restoreStatus=restored.restoreStatus;
 refresh('retry');
}
async function restoreSavedStops(stops,savedZone,signal){
 const restored=[];
 for(let offset=0;offset<stops.length;offset+=4){
  signal?.throwIfAborted();
  restored.push(...await Promise.all(stops.slice(offset,offset+4).map(stop=>restoreStop(stop,savedZone,signal))));
 }
 return restored;
}
async function relinkSavedStop(id){
 if(relinkStop===id){relinkStop=null;render();return;}
 relinkStop=id;render();
 if(mapProvider!=='google')await switchGoogle();
 if(relinkStop!==id||mapProvider!=='google')return;
 $('#search').focus();
 toast('Search for the original place or a replacement, then choose Link to this stop.');
}
const onboarding=setupOnboarding({
 searchDestination:async(query,signal)=>{
  await configReady;
  const search=()=>placesProvider.search(query,{signal,reason:'destination'});
  try{return await search();}
  catch(error){
   if(error.code!=='DESTINATION_SESSION_EXPIRED')throw error;
   const response=await fetch('/api/config',{signal});
   if(!response.ok){const data=await response.json();serviceDenied(data);throw Error(data.message||error.message);}
   return search();
  }
 },
 timeZone:(place,signal)=>placesProvider.timeZone(place,{signal,reason:'destination'}),
 restoreDestination:async(id,savedZone,signal)=>{
  const point=await placesProvider.restore(id,signal);
  signal?.throwIfAborted();
  return {...point,zone:savedZone||await placesProvider.timeZone(point,{signal,reason:'destination'})};
 },
 loadStops:restoreSavedStops,
 prepareGlobe:async()=>{
  await initialMap;
  if(!mapboxRenderer?.ready)await switchMapbox({initial:true,arrival:true});
  mapboxRenderer?.positionArrival();
 },
 raiseGlobe:reducedMotion=>mapboxRenderer?.raiseArrival(reducedMotion),
 onJourney:async({trip,destination,visits:saved,arrival})=>{
  controller?.abort();delayedCalculation.cancel();revision++;
  tripDestination={...destination,center:{lat:destination.lat,lng:destination.lng}};
  visits=saved;selected=edge=relinkStop=null;livePlaces=[];closePlacePane();
  const savedSegments=Object.fromEntries(saved.slice(0,-1).map((stop,i)=>[segmentKey(stop,saved[i+1]),{mode:trip.stops[i].mode}]));
  segments=reconcile(visits,savedSegments,defaults.mode);
  schedule={date:trip.date,time:trip.time};
  $('#date').value=schedule.date;$('#time').value=schedule.time;pickers.sync();
  result={rows:[],routes:{}};loading=true;render();
  if(arrival)await mapboxRenderer?.zoomArrival(tripDestination.center,matchMedia('(prefers-reduced-motion: reduce)').matches);
  await switchGoogle({journeyCenter:tripDestination.center});
  if(mapProvider!=='google')refresh('provider');
  else if(!arrival&&visits.filter(v=>hasLocation(v.place)).length>1)$('#fit').onclick();
 },
 onSignOut:()=>{
  visits=[];livePlaces=[];selected=edge=relinkStop=null;segments={};closePlacePane();
  refresh('provider');switchMapbox({initial:true,arrival:true}).then(()=>mapboxRenderer?.positionArrival());
 },
});
render();
configReady.then(()=>{if(!serviceStopped)onboarding.open();});
const serviceTimer=setInterval(()=>{
 if(serviceStopped)clearInterval(serviceTimer);
 else checkService();
},20000);
document.addEventListener('visibilitychange',checkService);
updateProviderUI();const initialMap=configReady.then(()=>{
 if(mapSwitch!==0)return;
 return switchMapbox({initial:true});
});
