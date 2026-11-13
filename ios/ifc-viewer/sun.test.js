import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunPosition } from './sun.js';
test('sun in Darmstadt: high in the south at summer noon, below horizon at winter midnight', () => {
  const noon = sunPosition(new Date('2026-06-21T11:30:00Z'), 49.87, 8.65);
  assert.ok(noon.altitude * 180 / Math.PI > 60, 'summer noon altitude');
  assert.ok(Math.abs(noon.azimuth * 180 / Math.PI - 180) < 15, 'azimuth roughly south');
  const night = sunPosition(new Date('2026-12-21T23:00:00Z'), 49.87, 8.65);
  assert.ok(night.altitude < 0, 'below horizon at night');
  const morning = sunPosition(new Date('2026-03-20T06:30:00Z'), 49.87, 8.65);
  assert.ok(morning.azimuth * 180 / Math.PI > 70 && morning.azimuth * 180 / Math.PI < 110, 'equinox morning sun in the east');
});
