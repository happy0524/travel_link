// Independent sample coordinates. Opening hours are deliberately unconfirmed.
export const destination={
 title:'A day in New York',zone:'America/New_York',
 center:{lat:40.7527,lng:-73.9822},zoom:14,
};
export const places=[
 {id:'empire-state',name:'Empire State Building',category:'Architecture · Viewpoint',address:'350 Fifth Avenue, New York, NY',lat:40.7484,lng:-73.9857,googlePlaceId:'ChIJtcaxrqlZwokRfwmmibzPsTU',googleTypes:['premise','tourist_attraction','historical_landmark']},
 {id:'bryant-park',name:'Bryant Park',category:'Park · Walking',lat:40.7536,lng:-73.9832},
 {id:'grand-central',name:'Grand Central Terminal',category:'History · Architecture',address:'89 East 42nd Street, New York, NY 10017',lat:40.7527,lng:-73.9772,googlePlaceId:'ChIJ-b2RmVlZwokRpb1pwEQjss0',googleTypes:['point_of_interest','historical_landmark']},
 {id:'times-square',name:'Times Square',category:'Plaza · City',address:'Broadway and Seventh Avenue, Midtown Manhattan, New York',lat:40.7580,lng:-73.9855,googlePlaceId:'ChIJmQJIxlVYwokRLgeuocVOGVU',googleTypes:['tourist_attraction','plaza']},
 {id:'guggenheim',name:'Solomon R. Guggenheim Museum',category:'Art museum',address:'1071 Fifth Avenue, New York, NY 10128',lat:40.78306,lng:-73.95889,googlePlaceId:'ChIJmZ5emqJYwokRuDz79o0coAQ',googleTypes:['museum','art_museum','art_gallery']},
 {id:'central-park',name:'Central Park South',category:'Park · Walking',lat:40.7681,lng:-73.9819},
 {id:'ny-public-library',name:'New York Public Library',category:'Culture · Architecture',lat:40.7532,lng:-73.9822},
 {id:'flatiron',name:'Flatiron Building',category:'Architecture',lat:40.7411,lng:-73.9897},
 {id:'washington-square',name:'Washington Square Park',category:'Park · Walking',lat:40.7308,lng:-73.9973}
].map(p=>({...p,zone:destination.zone,source:'example',hours:null}));

export const samplePlaceIds=['grand-central','empire-state','times-square','guggenheim'];
