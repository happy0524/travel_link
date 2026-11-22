import {loadGoogleMaps} from './efficient-providers.js';
import {language,ui} from './ui-copy.js';

const normalize=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'');
const broadTypes=new Set(['street','route','address','street_address','neighborhood','locality','political','postal_code']);
const categoryTypes={
  park:['park','national_park'], museum:['museum','art_museum','history_museum'],
  cafe:['cafe','coffee_shop'], restaurant:['restaurant'], hotel:['hotel','lodging'],
  bakery:['bakery'], library:['library'], university:['university'],
  plaza:['plaza'], landmark:['historical_landmark','tourist_attraction'],
  train_station:['train_station','transit_station'],
};

function streetAddress(value){
  const street=String(value||'').toLowerCase().replace(/^[^,]+,\s*(?=\d+\s)/,'').split(',')[0];
  return /^\s*\d+\s+\S/.test(street)?normalize(street.replace(/\b(avenue|street|road|boulevard|east|west|north|south)\b/g,
    token=>({avenue:'ave',street:'st',road:'rd',boulevard:'blvd',east:'e',west:'w',north:'n',south:'s'})[token])):'';
}

export function resolveGoogleCandidates(place,places,{rematch=false}={}){
  const expected=new Set(place.googleTypes||[]);
  for(const category of String(place.category||'').toLowerCase().split(/\s*·\s*/)){
    for(const type of categoryTypes[category.replace(/ /g,'_')]||[])expected.add(type);
  }
  const name=normalize(place.name),street=streetAddress(place.address);
  const candidates=places.filter(p=>p.id&&p.location).map(p=>{
    const lat=p.location.latitude??p.location.lat(),lng=p.location.longitude??p.location.lng();
    const distance=Math.hypot((lat-place.lat)*111000,(lng-place.lng)*111000*Math.cos(place.lat*Math.PI/180));
    const candidateName=normalize(p.displayName),type=p.primaryType||p.types?.[0];
    const candidateStreet=streetAddress(p.formattedAddress);
    const addressMatches=Boolean(street&&street===candidateStreet);
    const typeMatches=Boolean(type&&!broadTypes.has(type)&&[type,...(p.types||[])].some(candidateType=>expected.has(candidateType)));
    return {id:p.id,distance,nameMatches:Boolean(name&&candidateName===name),similarName:name.length>=6&&candidateName.length>=6&&(name.includes(candidateName)||candidateName.includes(name)),addressMatches,typeMatches};
  }).filter(p=>p.distance<=600&&(p.nameMatches||p.similarName||p.addressMatches&&p.typeMatches));
  const matches=candidates.filter(p=>p.nameMatches&&p.typeMatches&&(street?p.addressMatches&&p.distance<=150:p.distance<=40));
  if(!rematch&&!broadTypes.has(place.featureType)&&matches.length===1)return {id:matches[0].id};
  candidates.sort((a,b)=>Number(b.nameMatches)-Number(a.nameMatches)||Number(b.addressMatches)-Number(a.addressMatches)||Number(b.typeMatches)-Number(a.typeMatches)||a.distance-b.distance);
  return {candidates:candidates.slice(0,4)};
}

// The key is an app-owned sample ID. Mapbox Search Box results stay in memory.
function sampleLinkKey(place){return `travel-link.google-place:${place.id}`;}
function savedGooglePlaceId(place){
  if(place.source!=='example')return null;
  try{return localStorage.getItem(sampleLinkKey(place));}catch{return null;}
}
export function rememberGooglePlaceId(place,id){
  place.googlePlaceId=id;
  if(place.source==='example')try{localStorage.setItem(sampleLinkKey(place),id);}catch{}
}

export async function findGoogleCandidates(place,key,signal,{rematch=false,search}={}){
  if(!key)throw new Error(ui.googleKeyMissing);
  await loadGoogleMaps(key);
  await google.maps.importLibrary('places');
  signal.throwIfAborted();
  if(!customElements.get('gmp-place-details'))throw new Error('Could not load Google Places UI Kit. Check that it is enabled.');
  if(!rematch){
    const linkedId=savedGooglePlaceId(place)||place.googlePlaceId;
    if(linkedId)return {id:linkedId};
    if(place.source==='live')return {id:place.id};
  }
  return search(place,{rematch,signal});
}

export function createGoogleWidget(placeId,{Place,compact=false,media=true,onLoad,onError}){
  const widget=document.createElement(compact?'gmp-place-details-compact':'gmp-place-details');
  const request=document.createElement('gmp-place-details-place-request');
  request.place=new Place({id:placeId,requestedLanguage:language});
  widget.append(request);
  const tags=compact?['name','address','type']:['name','address',...(media?['media','summary']:[]),'rating','type','opening-hours','website','attribution'];
  for(const tag of tags)widget.append(document.createElement('gmp-place-'+tag));
  if(onLoad)widget.addEventListener('gmp-load',onLoad,{once:true});
  if(onError)widget.addEventListener('gmp-error',onError,{once:true});
  return widget;
}
