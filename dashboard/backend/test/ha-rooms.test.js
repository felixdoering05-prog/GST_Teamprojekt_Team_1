const {test}=require('node:test'),assert=require('node:assert/strict');
const {suggestRoom}=require('../src/ha-rooms');
test('room suggestions from Home Assistant names: synonyms, floors, no guess when ambiguous',()=>{
 const rooms=[{id:'r1',name:'Wohnen',room_code:'EG.01'},{id:'r2',name:'Küche',room_code:'EG.02'},{id:'r3',name:'Bad',room_code:'EG.03'},{id:'r4',name:'Bad',room_code:'OG.03'},{id:'r5',name:'Schlafen',room_code:'OG.01'}];
 for(const [n,want] of [['Wohnzimmer','r1'],['Wohnzimmer Deckenlampe','r1'],['Living Room','r1'],['Kitchen','r2'],['Bad OG','r4'],['Bad EG Licht','r3'],['Schlafzimmer Temperatur','r5'],['Bad',null],['Garage',null],['',null]])
  assert.equal(suggestRoom(n,rooms),want,n);
});
