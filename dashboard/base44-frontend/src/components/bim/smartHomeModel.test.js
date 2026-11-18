import test from 'node:test';
import assert from 'node:assert/strict';
import { modelLights } from './smartHomeModel.js';
test('model bindings do not leak into another model and imported lamps are not duplicated', () => {
 const lamps = [{ key: 'desk', entity_id: 'light.desk', location: { document_id: 1, space_id: 20 } }];
 const imported = { entities: [{ selected: true, metric: 'light', entity_id: 'light.desk' }, { selected: true, metric: 'light', entity_id: 'light.bed', effective_room_id: 'room-a', light: { available: true, updated_at: new Date().toISOString() } }] };
 const lights = modelLights({ documentID: 2, lamps, imported, names: [{ room_id: 'room-a', space_id: 40 }] });
 assert.equal(lights.length, 2); assert.equal(lights[0].space, null); assert.equal(lights[1].space, 40); assert.equal(lights[1].control, null);
});
test('planned devices cannot be switched and stale imported states are unavailable', () => {
 const lights = modelLights({ documentID: 1, devices: [{ id: 3, kind: 'plug', mode: 'planned' }], imported: { entities: [{ selected: true, metric: 'light', entity_id: 'light.old', light: { available: true, updated_at: '2020-01-01T00:00:00Z' } }] } });
 assert.equal(lights[0].control, null); assert.equal(lights[0].available, false); assert.equal(lights[1].available, false);
});
test('room-name assignments appear in the same room as the lighting effect, without guessing duplicates or reusing stale IDs', () => {
 const spaces = [{id:20,name:'01 · Arbeitszimmer',aliases:['01','Arbeitszimmer']},{id:21,name:'02 · Flur',aliases:['02','Flur']},{id:22,name:'03 · Flur',aliases:['03','Flur']}];
 const devices = [{id:1,kind:'light',mode:'simulation',document_id:null,space_id:999,room:'Arbeitszimmer'},
  {id:2,kind:'light',mode:'simulation',room:'Flur'}, {id:3,kind:'light',mode:'simulation',document_id:8,space_id:20,room:'Arbeitszimmer'}];
 const lights = modelLights({documentID:7,spaces,devices});
 assert.equal(lights[0].space,20);assert.equal(lights[1].space,null);assert.equal(lights[2].space,null);
});
test('a separator inside the original room name is not split into invented room aliases', () => {
 const spaces = [{id:20,name:'A · B',aliases:['A · B']}];
 const devices = [{id:1,kind:'light',mode:'simulation',room:'A'},{id:2,kind:'light',mode:'simulation',room:'A · B'}];
 const lights = modelLights({documentID:7,spaces,devices});
 assert.equal(lights[0].space,null);assert.equal(lights[1].space,20);
});
