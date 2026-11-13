import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roomNumber, roomReadings } from './roomHeat.js';

test('D21 room numbers preserve floor prefixes and room suffixes', () => {
  assert.equal(roomNumber('001', 'EG', true), '00.01');
  assert.equal(roomNumber('211.1', '2. OG', true), '02.11.1');
  assert.equal(roomNumber('013a', 'EG', true), '00.13A');
  assert.equal(roomNumber('01', 'KG', true), 'UG.01');
  assert.equal(roomNumber('Besprechungsraum', 'EG', false), '');
});

test('room readings require a unique IFC identity or room number on the matching floor', () => {
  const floor = { name: '1.OG', rooms: [
    { id: 1, number: '101', globalIds: ['space-a'] },
    { id: 2, number: '102', globalIds: ['space-b'] },
    { id: 3, number: '102', globalIds: ['space-c', 'space-c-duplicate'] },
    { id: 4, number: '103', globalIds: ['space-d'] },
  ] };
  const measurements = {
    floors: [{ id: 'first', name: '1. OG', level: 1 }, { id: 'ground', name: 'EG', level: 0 }],
    rooms: [
      { floor_id: 'first', room_code: '1.01', reading: { value: 21 } },
      { floor_id: 'ground', room_code: '01.01', reading: { value: 99 } },
      { floor_id: 'first', room_code: '01.02', reading: { value: 99 } },
      { ifc_global_id: 'space-c-duplicate', reading: { value: 23 } },
      { floor_id: 'first', room_code: '01.03', ifc_global_id: 'unknown', reading: { value: 99 } },
    ],
  };
  assert.deepEqual(roomReadings(floor, measurements, true), { 1: { value: 21 }, 3: { value: 23 } });
});
