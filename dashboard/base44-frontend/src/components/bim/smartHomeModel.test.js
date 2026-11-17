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
