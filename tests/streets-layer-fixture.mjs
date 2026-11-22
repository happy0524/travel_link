// Structural subset of the actual Streets v12 JSON fetched during implementation.
// No tiles, credentials or geographic feature data. Additional app layer checks
// that applying a basemap palette cannot modify an application's route layer.
export const streetsFixture={version:8,sources:{
 composite:{type:'vector',url:'mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2,mapbox.mapbox-bathymetry-v2'},
 itinerary:{type:'geojson',data:{type:'FeatureCollection',features:[]}}
},layers:[
 {id:'land',type:'background',paint:{'background-color':'white'}},
 {id:'landcover',type:'fill',source:'composite','source-layer':'landcover'},
 {id:'landuse',type:'fill',source:'composite','source-layer':'landuse'},
 {id:'water',type:'fill',source:'composite','source-layer':'water'},
 {id:'waterway',type:'line',source:'composite','source-layer':'waterway'},
 {id:'water-depth',type:'fill',source:'composite','source-layer':'depth'},
 {id:'hillshade',type:'fill',source:'composite','source-layer':'hillshade'},
 {id:'building',type:'fill',source:'composite','source-layer':'building',paint:{'fill-color':'gray','fill-outline-color':'gray'}},
 {id:'road-street',type:'line',source:'composite','source-layer':'road'},
 {id:'road-primary',type:'line',source:'composite','source-layer':'road'},
 {id:'road-motorway-trunk',type:'line',source:'composite','source-layer':'road'},
 {id:'road-label',type:'symbol',source:'composite','source-layer':'road',layout:{'text-field':['coalesce',['get','name_en'],['get','name']]},paint:{'text-halo-color':'white'}},
 {id:'poi-label',type:'symbol',source:'composite','source-layer':'poi_label',layout:{'text-field':['get','name']},filter:['<=',['get','filterrank'],3]},
 {id:'building-number-label',type:'symbol',source:'composite','source-layer':'housenum_label'},
 {id:'itinerary-route',type:'line',source:'itinerary',paint:{'line-color':'#355423'}}
]};
