import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRoomSensors, formatValue, roomTitle } from './sensor-labels.js';

test('room sensor entries are validated before rendering', () => {
  const list = sanitizeRoomSensors([
    { space_id: 1500, room: 'HP-03 · Zimmer III', source: 'real', stale: false, values: [{ metric: 'temperature', value: 21.46 }, { metric: 'humidity', value: 48.6 }, { metric: 'pressure', value: 992 }] },
    { space_id: -1, values: [{ metric: 'temperature', value: 20 }] },
    { space_id: 7, values: [{ metric: 'temperature', value: Infinity }] },
    { space_id: 8, room: 42, values: [{ metric: 'co2', value: 400 }] },
    'nonsense',
  ]);
  assert.deepEqual(list, [
    { space_id: 1500, room: 'HP-03 · Zimmer III', values: [{ metric: 'temperature', value: 21.46 }, { metric: 'humidity', value: 48.6 }], stale: false, real: true },
    { space_id: 8, room: '', values: [{ metric: 'co2', value: 400 }], stale: false, real: false },
  ]);
  assert.deepEqual(sanitizeRoomSensors(null), []);
});

test('values and titles are formatted for the popup', () => {
  assert.equal(formatValue({ metric: 'temperature', value: 21.46 }), '21,5 °C');
  assert.equal(formatValue({ metric: 'humidity', value: 48.6 }), '49 %');
  assert.equal(roomTitle('HP-03 · Zimmer III'), 'Zimmer III');
  assert.equal(roomTitle('Schlafzimmer'), 'Schlafzimmer');
  assert.equal(roomTitle(''), 'Raum');
});
