import test from 'node:test';
import assert from 'node:assert/strict';
import { HEAT_STOPS, simulatedRoomTemperature, normalizeScenario, scenarioConditions, surfaceTemperature, heatColor, seasonForDay, scenarioDate } from './heat-simulation.js';

test('legend anchors and out-of-scale temperatures use the same fixed ramp', () => {
  for (const stop of HEAT_STOPS) assert.equal(heatColor(stop.value), stop.color);
  assert.equal(heatColor(-100), HEAT_STOPS[0].color);
  assert.equal(heatColor(100), HEAT_STOPS.at(-1).color);
  assert.equal(heatColor(5), '#16aad6');
  assert.equal(heatColor(NaN), '#94a3b8');
});
test('winter is cooler than summer; daytime surfaces differ by exposure', () => {
  const summer = { day: 196, hour: 14 }, winter = { day: 14, hour: 14 };
  assert.ok(scenarioConditions(summer).air > scenarioConditions(winter).air + 20);
  const direction = scenarioConditions(summer).direction;
  assert.ok(surfaceTemperature(summer, [0, 0, 0], direction) > surfaceTemperature(summer, [0, 0, 0], direction.map(value => -value)) + 10);
  const midnight = { day: 196, hour: 0 };
  assert.equal(scenarioConditions(midnight).gain, 0);
  assert.ok(surfaceTemperature(summer) > surfaceTemperature(midnight));
});

test('DWD readings replace the assumed air temperature exactly; missing observations never become zero or synthetic data', () => {
  const measured = { source: 'dwd', airTemperature: 7.3, day: 196, hour: 14 };
  assert.equal(scenarioConditions(measured).air, 7.3);
  assert.equal(scenarioConditions({ ...measured, airTemperature: 0 }).air, 0);
  assert.ok(Math.abs(surfaceTemperature(measured) - surfaceTemperature({ ...measured, airTemperature: 9.3 }) + 2) < 1e-10);
  for (const airTemperature of [null, undefined, NaN, Infinity, -999, '7.3']) {
    const state = { ...measured, airTemperature };
    assert.equal(scenarioConditions(state).available, false);
    assert.equal(scenarioConditions(state).air, null);
    assert.equal(surfaceTemperature(state), null);
    assert.equal(heatColor(surfaceTemperature(state)), '#94a3b8');
  }
});
test('the full annual cycle remains finite, smooth at year end and within the displayed scale', () => {
  for (let day = 0; day < 365; day++) for (const hour of [0, 6, 12, 18, 23]) {
    for (const ground of [false, true]) {
      const value = surfaceTemperature({ day, hour }, [230, 0, -400], [0, 1, 0], ground);
      assert.ok(Number.isFinite(value) && value >= -10 && value <= 50, `day ${day}, hour ${hour}: ${value}`);
    }
  }
  assert.ok(Math.abs(scenarioConditions({day:364,hour:14}).air-scenarioConditions({day:0,hour:14}).air) < .1);
});
test('state normalization rejects invalid messages, dates and season boundaries remain consistent', () => {
  assert.deepEqual(normalizeScenario({ day: NaN, hour: '12', campus: false }), { mode: 'simulation', day: 196, hour: 14, campus: false });
  assert.deepEqual(normalizeScenario(null), { mode: 'simulation', day: 196, hour: 14, campus: true });
  assert.deepEqual(normalizeScenario({ day: 999, hour: -2 }), { mode: 'simulation', day: 364, hour: 0, campus: true });
  assert.equal(seasonForDay(0).id, 'winter'); assert.equal(seasonForDay(79).id, 'spring');
  assert.equal(seasonForDay(171).id, 'summer'); assert.equal(seasonForDay(265).id, 'autumn');
  assert.equal(seasonForDay(355).id, 'winter');
  assert.equal(scenarioDate(0), '01. Januar'); assert.equal(scenarioDate(364), '31. Dezember');
});

test('room scenarios stay explicit, deterministic and separate from measured mode', () => {
  assert.equal(normalizeScenario({mode:'measured'}).mode,'measured');
  assert.equal(normalizeScenario({mode:'simulated-rooms'}).mode,'simulated-rooms');
  assert.equal(normalizeScenario({mode:'unknown'}).mode,'simulation');
  assert.equal(simulatedRoomTemperature(''),null);
  assert.equal(simulatedRoomTemperature(null),null);
  const winter=simulatedRoomTemperature('room-id',0,1,'winter');
  assert.equal(winter,simulatedRoomTemperature('room-id',0,1,'winter'));
  assert.ok(Number.isFinite(winter));
  assert.ok(simulatedRoomTemperature('room-id',0,1,'summer')>winter);
});
