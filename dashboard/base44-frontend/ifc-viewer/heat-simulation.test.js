import test from 'node:test';
import assert from 'node:assert/strict';
import { HEAT_STOPS, normalizeScenario, scenarioConditions, surfaceTemperature, heatColor, seasonForDay, scenarioDate } from './heat-simulation.js';

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
  assert.deepEqual(normalizeScenario({ day: NaN, hour: '12', campus: false }), { day: 196, hour: 14, campus: false });
  assert.deepEqual(normalizeScenario(null), { day: 196, hour: 14, campus: true });
  assert.deepEqual(normalizeScenario({ day: 999, hour: -2 }), { day: 364, hour: 0, campus: true });
  assert.equal(seasonForDay(0).id, 'winter'); assert.equal(seasonForDay(79).id, 'spring');
  assert.equal(seasonForDay(171).id, 'summer'); assert.equal(seasonForDay(265).id, 'autumn');
  assert.equal(seasonForDay(355).id, 'winter');
  assert.equal(scenarioDate(0), '01. Januar'); assert.equal(scenarioDate(364), '31. Dezember');
});
