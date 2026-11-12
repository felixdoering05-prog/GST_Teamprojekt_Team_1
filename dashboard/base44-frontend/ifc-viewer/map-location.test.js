import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ifcAngle, locationFromInput, mapLocation } from './map-location.js';
import { terrainFromModelMap } from './map-environment.js';

test('coordinates, OSM marker links and full Google Maps links resolve locally', () => {
  const frankfurt = { latitude: 50.1109, longitude: 8.6821 };
  for (const input of [
    '50.1109, 8.6821',
    '50,1109; 8,6821',
    'https://www.openstreetmap.org/?mlat=50.1109&mlon=8.6821#map=15/51/9',
    'https://www.openstreetmap.org/#map=19/50.1109/8.6821',
    'https://www.google.com/maps/@50.1109,8.6821,19z',
    'https://www.google.de/maps/place/Frankfurt/@51,9,19z/data=!3d50.1109!4d8.6821',
    'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=50.1109%2C8.6821',
  ]) assert.deepEqual(locationFromInput(input), frankfurt, input);
  for (const input of ['90, 8', '50.1, 181', 'https://maps.app.goo.gl/abc', 'https://example.com/maps/@50,8,19z', 'https://www.google.com/maps/search/?query=Frankfurt', 'https://www.openstreetmap.org/?mlat=&mlon=8']) {
    assert.equal(locationFromInput(input), null, input);
  }
});

test('IFC site compound angles preserve signs and fractional seconds', () => {
  assert.equal(ifcAngle([{ value: 50 }, { value: 6 }, { value: 0 }]), 50.1);
  assert.equal(ifcAngle({ value: [50, 6, 39, 240000] }), 50.1109);
  assert.equal(ifcAngle([0, -30, 0]), -.5);
  assert.equal(ifcAngle([-8, -40, -10, -500000]), -(8 + 40 / 60 + 10.5 / 3600));
  assert.equal(ifcAngle([8, 60, 0]), null);
  assert.equal(mapLocation(null, 8), null);
});

test('custom terrain uses the common terrain schema and leaves the anchor clear for the IFC', () => {
  const center = [[8.6819, 50.1108], [8.6823, 50.1108], [8.6823, 50.111], [8.6819, 50.111], [8.6819, 50.1108]];
  const neighbor = center.map(([lon, lat]) => [lon + .0006, lat]);
  const view = { latitude: 50.1109, longitude: 8.6821, features: [
    { kind: 'building', geometry: center, height: 12 },
    { kind: 'building', geometry: neighbor, height: 9 },
    { kind: 'road', geometry: [[8.6817, 50.1107], [8.6827, 50.1107]], name: 'Braubachstraße', width: 7 },
    { kind: 'green', geometry: neighbor },
  ] };
  const data = terrainFromModelMap(view);
  assert.equal(data.buildings.length, 1);
  assert.equal(data.buildings[0].height, 9);
  assert.equal(data.areas[0].kind, 'green');
  assert.equal(data.roads[0].kind, 'local');
  assert.deepEqual(data.streetNames, ['Braubachstraße']);
  assert.ok(data.buildings[0].rings[0].every(([x]) => x > 0));
});
