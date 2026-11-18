import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDeviceLights, roomLightSetter } from './room-light.js';

test('every mapped room receives device state, brightness, and warm-white fallback for non-RGB lamps', () => {
  const received = new Map();
  const rooms = new Map(Array.from({ length: 75 }, (_, i) => [i + 1, (...args) => received.set(i + 1, args)]));
  applyDeviceLights(Array.from({ length: 75 }, (_, i) => ({ space_id: i + 1, on: true, available: true, brightness: 80 })), rooms);
  assert.equal(received.size, 75);
  assert.deepEqual(received.get(75), [true, '#ffe7d3', true, true, 80]);
  applyDeviceLights([{space_id:75,on:false,available:true,rgb:[0,20,255],brightness:0}],rooms);
  assert.deepEqual(received.get(75), [false,'#0014ff',true,true,0]);
});
test('light effect dims, switches off, preserves partial availability, and releases removed device bindings', () => {
  const toggle = { dataset: {}, setAttribute(key, value) { this[key] = value; } };
  const mesh = { material: { color: { set(color) { this.value = color; } } } };
  const set = roomLightSetter(toggle, [mesh]);
  set(true, '#3388ff', true, true, 255); const full = mesh.material.opacity;
  assert.equal(mesh.visible, true); assert.equal(toggle.disabled, true);
  set(true, '#3388ff', true, true, 30); assert.ok(mesh.material.opacity < full);
  set(true, '#3388ff', true, true, 0); assert.equal(mesh.visible, false);
  set(true, '#3388ff', true, false, 100); assert.equal(mesh.visible, true); assert.match(toggle.textContent, /teilweise/);
  set(false, '#3388ff', true, false, 0); assert.equal(mesh.visible, false); assert.match(toggle.textContent, /nicht verfügbar/);
  set(false); assert.equal(toggle.disabled, false); assert.equal(toggle.dataset.linked, 'false');
});
test('no invented geometry or bindings for missing and invalid room identifiers', () => {
  const toggle = { dataset: {}, setAttribute() {} };
  roomLightSetter(toggle, [])(true); assert.equal(toggle.disabled, true); assert.match(toggle.textContent, /Ohne Raumgeometrie/);
  const rooms = new Map([[1, () => assert.fail('invalid ID must not select a room')]]);
  applyDeviceLights([{space_id:'1',on:true},{space_id:-1,on:true},{space_id:999,on:true}], rooms);
});
