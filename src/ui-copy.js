export const language='en';
export const locale='en-US';

export const ui={
  calculating:'Calculating…',
  unconfirmed:'Unconfirmed',
  routeUnconfirmed:'Route unconfirmed',
  retry:'Try again',
  start:'Start',
  estimatedEnd:'Estimated end',
  totalDuration:'Total duration',
  travelTime:'Travel time',
  visitTime:'Visit time',
  totalDistance:'Total distance',
  waitTime:'Wait time',
  arrival:'Arrival',
  departure:'Departure',
  stay:'Stay',
  travelDate:'Travel date',
  departureTime:'Departure time',
  nextDay:'Next day',
  add:'Add to itinerary',
  added:'Added · View in itinerary',
  placeDetails:'View place details',
  changePlace:'Change linked place',
  noResults:'No places found.',
  minQuery:'Enter at least two characters to search.',
  openingHoursUnavailable:'Opening hours unavailable',
  unavailable:'Unavailable',
  transitGoogleOnly:'Public transit routes are available in Google Maps.',
  mapboxTokenMissing:'Set the Mapbox public token in .env and restart the server.',
  googleKeyMissing:'The Google Maps browser key is missing.',
  googleAuth:'Google Maps authentication failed.',
  googleAuthSettings:'Google Maps authentication failed. Check the browser key and its API restrictions.',
  mapboxAuth:'Mapbox authentication failed. Check the token and allowed URLs.',
  mapboxGoogleLocation:'Search for this place in Google Maps to use it in a Google route.',
  modes:{WALK:'Walking',TRANSIT:'Public transit',DRIVE:'Driving'},
};

export function formatDuration(minutes){
  if(!Number.isFinite(minutes))return ui.unconfirmed;
  const hours=Math.floor(minutes/60),remainder=minutes%60;
  return [hours?`${hours} hr`:'',remainder||!hours?`${remainder} min`:''].filter(Boolean).join(' ');
}
