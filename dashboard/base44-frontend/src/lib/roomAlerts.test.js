import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readingStatus, roomAnomalies } from './roomAlerts.js';
import { resolveBuildingRoom, roomAssistantLink } from './roomLocation.js';

const floor = { id: 'eg', name: 'EG' };
const room = { id: 'room-a', name: 'Büro', room_code: '101', floor_id: floor.id, ifc_global_id: 'ifc-room-a' };
const other = { ...room, id: 'room-b', floor_id: 'og', ifc_global_id: 'ifc-room-b' };
const floors = [floor, { id: 'og', name: '1. OG' }];
const policy = { temperature: { warning_max: 26, critical_max: 28 } };
const now = Date.parse('2026-11-25T12:00:00Z');
const reading = { value: 29, source: 'real', unit: '°C', measured_at: '2026-11-25T11:50:00Z' };

test('room IDs and IFC identities disambiguate repeated room codes', () => {
  const structure = { rooms: [room, other], floors };
  assert.equal(resolveBuildingRoom(structure, { label: '101' }), undefined);
  assert.equal(resolveBuildingRoom(structure, { label: 'D21 · EG · 101', building: 'D21' }), room);
  assert.equal(resolveBuildingRoom(structure, { roomID: 'missing', label: 'EG · 101' }), undefined);
  assert.equal(resolveBuildingRoom(structure, { globalId: other.ifc_global_id }), other);
  assert.equal(resolveBuildingRoom(structure, { globalId: 'wrong-model-room', label: 'EG · 101' }), undefined);
  assert.equal(roomAssistantLink(21, room.id), '/assistent?building=21&room=room-a');
});

test('active alarms and fresh threshold breaches identify rooms even without geometry', () => {
  const result = roomAnomalies({ rooms: [room, other], floors },
    { rooms: [{ ...room, reading }], floors, thresholds: policy },
    [{ id: 'alert', status: 'quittiert', room_id: other.id, value: 1200, metric: 'co2', triggered_at: '2026-11-20T00:00:00Z' },
      { id: 'resolved', status: 'erledigt', room_id: room.id }], now);
  assert.equal(result.length, 2);
  const warm = result.find(row => row.room.id === room.id);
  assert.equal(warm.floor.name, 'EG');
  assert.match(warm.reasons[0].reason, /kritischem Grenzwert/);
  assert.equal(warm.reasons[0].reading, reading);
  const alert = result.find(row => row.room.id === other.id).reasons[0];
  assert.equal(alert.reading.unit, 'ppm');
  assert.equal(readingStatus(alert.reading, now), 'stale');
});

test('missing, invalid and stale samples cannot create new threshold findings', () => {
  assert.equal(readingStatus(null, now), 'missing');
  assert.equal(readingStatus({ ...reading, measured_at: 'invalid' }, now), 'unknown-time');
  assert.equal(readingStatus({ ...reading, measured_at: '2026-11-25T12:30:00Z' }, now), 'unknown-time');
  assert.deepEqual(roomAnomalies(null, { rooms: [{ ...room, reading: { ...reading, measured_at: '2026-11-18T12:00:00Z' } }],
    floors, thresholds: policy }, [], now), []);
});
