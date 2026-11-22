export function googlePlaceId(value){
  if(typeof value!=='string')return null;
  const id=value.replace(/^places\//,'');
  return id.length>0&&id.length<=2048&&!/[\s/\p{Cc}]/u.test(id)?id:null;
}

export function stopReference(stop){
  // The old placeId exclusively held a Google ID, including for linked Mapbox stops.
  const legacy=!stop.provider||stop.provider==='google'?googlePlaceId(stop.placeId):null;
  const provider=['google','mapbox','mapbox-tile'].includes(stop.provider)?stop.provider:legacy?'google':'unknown';
  return {provider,
    providerPlaceId:provider==='google'?googlePlaceId(stop.providerPlaceId)||legacy:null,
    googlePlaceId:googlePlaceId(stop.googlePlaceId)||(provider!=='google'?legacy:null)};
}

export function referenceForPlace(place){
  return stopReference({provider:place.source==='live'?'google':place.source,providerPlaceId:place.id,googlePlaceId:place.googlePlaceId});
}

export function restorePlaceId(reference){
  return reference.googlePlaceId||reference.providerPlaceId;
}
