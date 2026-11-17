import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRoomSensors, formatValue, roomTitle, cleanRoomName, sanitizeRoomNames } from './room-sensors.js';

test('room sensor entries from the parent page are validated', () => {
  const list = sanitizeRoomSensors([
    { space_id: 1500, room: 'HP-03 · Zimmer III', source: 'real', stale: false, values: [{ metric: 'temperature', value: 21.46 }, { metric: 'humidity', value: 48.6 }, { metric: 'pressure', value: 992 }] },
    { space_id: -1, values: [{ metric: 'temperature', value: 20 }] },
    { space_id: 7, values: [{ metric: 'temperature', value: Infinity }] },
    { space_id: 8, room: 42, values: [{ metric: 'co2', value: 400 }] },
    'nonsense',
  ]);
  assert.deepEqual(list, [
    { space_id: 1500, room: 'HP-03 · Zimmer III', values: [{ metric: 'temperature', value: 21.46 }, { metric: 'humidity', value: 48.6 }], stale: false, real: true, updated_at: null },
    { space_id: 8, room: '', values: [{ metric: 'co2', value: 400 }], stale: false, real: false, updated_at: null },
  ]);
  assert.deepEqual(sanitizeRoomSensors(undefined), []);
});

test('values and room titles are formatted for the popup', () => {
  assert.equal(formatValue({ metric: 'temperature', value: 21.46 }), '21,5 °C');
  assert.equal(formatValue({ metric: 'humidity', value: 48.6 }), '49 %');
  assert.equal(roomTitle('HP-03 · Zimmer III'), 'Zimmer III');
  assert.equal(roomTitle('Schlafzimmer'), 'Schlafzimmer');
  assert.equal(roomTitle(''), 'Raum');
});

test('renamed room names are trimmed and validated like on the server', () => {
  assert.equal(cleanRoomName('  Schlafzimmer   Benjamin '), 'Schlafzimmer Benjamin');
  assert.equal(cleanRoomName('Bad\nOben'), 'Bad Oben');
  assert.equal(cleanRoomName('Bad\u0007'), '');
  assert.equal(cleanRoomName('x'.repeat(61)), '');
  assert.equal(cleanRoomName('   '), '');
});

test('saved room names for all rooms are validated', () => {
  const names = sanitizeRoomNames([{ space_id: 245, room: '  Schlafzimmer ' }, { space_id: 245, room: 'Doppelt' }, { space_id: 0, room: 'x' }, { space_id: 7, room: '' }, { space_id: 8, room: 5 }, null]);
  assert.deepEqual([...names], [[245, 'Schlafzimmer']]);
  assert.equal(sanitizeRoomNames('nonsense').size, 0);
});
