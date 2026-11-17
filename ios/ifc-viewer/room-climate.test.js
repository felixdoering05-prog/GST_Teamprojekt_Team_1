import { test } from 'node:test';
import assert from 'node:assert/strict';
import { climateColors, CLIMATE } from './room-climate.js';
const list = [
  { space_id: 7, room: 'R1 · Küche', source: 'real', values: [{ metric: 'temperature', value: 23 }, { metric: 'co2', value: 1500 }] },
  { space_id: 9, room: 'Bad', source: 'real', stale: true, values: [{ metric: 'humidity', value: 50 }] },
  { space_id: -1, room: 'kaputt', values: [{ metric: 'temperature', value: 20 }] },
];
test('rooms are coloured only for the chosen metric', () => {
  assert.deepEqual(climateColors(list, 'temperature').map(r => r.space_id), [7]);
  assert.deepEqual(climateColors(list, 'humidity').map(r => [r.space_id, r.color, r.stale]), [[9, '#4caf7a', true]]);
  assert.equal(climateColors(list, 'co2')[0].color, '#d1495b');
  assert.match(climateColors(list, 'temperature')[0].text, /Küche: 23,0 °C/);
  assert.deepEqual(climateColors(list, 'radon'), []);
});
test('scales are monotonic and clamp', () => {
  assert.equal(CLIMATE.co2.color(300), '#4caf7a');
  assert.equal(CLIMATE.co2.color(5000), '#d1495b');
  assert.equal(CLIMATE.humidity.color(NaN), null);
  assert.equal(CLIMATE.temperature.color(10), '#477ac5');
});
