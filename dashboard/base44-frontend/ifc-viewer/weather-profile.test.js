import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWeatherProfile } from './weather-profile.js';

const sample = () => ({ schema: 1, year: 2025, timezone: 'UTC', station: { id: '01420', name: 'Frankfurt/Main' },
  source: { url: 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/historical/stundenwerte_TU_01420_19810101_20251231_hist.zip', sha256: '0'.repeat(64), attribution: 'DWD' },
  hours: Array.from({ length: 8760 }, (_, i) => [Number(new Date(Date.UTC(2024, 11, 31, 23) + i * 3600000).toISOString().slice(0, 13).replaceAll(/[-T:]/g, '')), i / 1000, 3]),
});
test('DWD UTC readings map to German winter/summer time without smoothing or shifted dates', () => {
  const profile = createWeatherProfile(sample());
  assert.equal(profile.lookup(0, 0).timestamp, '2024-12-31T23:00:00.000Z');
  assert.equal(profile.lookup(196, 14).timestamp, '2025-07-16T12:00:00.000Z');
  assert.equal(profile.lookup(364, 23).timestamp, '2025-12-31T22:00:00.000Z');
  assert.equal(profile.lookup(196, 14).quality, 3);
});
test('DST gap is missing and repeated autumn hour explicitly chooses the earlier reading', () => {
  const profile = createWeatherProfile(sample());
  const march30 = 88, october26 = 298;
  assert.equal(profile.lookup(march30, 2).temperature, null);
  assert.equal(profile.lookup(march30, 2).timestamp, null);
  const autumn = profile.lookup(october26, 2);
  assert.equal(autumn.timestamp, '2025-10-26T00:00:00.000Z');
  assert.equal(autumn.ambiguous, true);
  assert.equal(profile.lookup(october26, 3).ambiguous, false);
});
test('missing values remain null, zero is a valid reading, invalid datasets are rejected', () => {
  const data = sample(); data.hours[0][1] = null; data.hours[1][1] = 0;
  const profile = createWeatherProfile(data);
  assert.equal(profile.lookup(0, 0).temperature, null);
  assert.equal(profile.lookup(0, 1).temperature, 0);
  assert.equal(profile.lookup(-1, 0).temperature, null);
  assert.throws(() => createWeatherProfile({ ...data, station: { id: '12345' } }));
  assert.throws(() => createWeatherProfile({ ...data, hours: data.hours.slice(1) }));
  data.hours[0][1] = -999; assert.throws(() => createWeatherProfile(data));
  data.hours[0][1] = null; data.hours[1][0] = data.hours[0][0]; assert.throws(() => createWeatherProfile(data));
});
test('the shipped DWD snapshot contains a complete UTC grid and preserves the actual observed year', () => {
  const data = JSON.parse(readFileSync(new URL('../public/weather/frankfurt-2025.json', import.meta.url)));
  const profile = createWeatherProfile(data);
  assert.equal(profile.station.name, 'Frankfurt/Main');
  assert.equal(data.hours.length, 8760);
  assert.ok(data.hours.filter(row => row[1] !== null).length > 8600);
  const temperatures = data.hours.map(row => row[1]).filter(Number.isFinite);
  assert.ok(Math.min(...temperatures) < 0 && Math.max(...temperatures) > 30);
});
