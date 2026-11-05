import test from 'node:test';
import assert from 'node:assert/strict';
import { campusPoint, coordinateTile, tilePosition, D21_LOCATION, footprintHeading } from './campus-projection.js';
test('campus metres have east-positive and south-positive axes anchored at D21', () => {
  assert.deepEqual(campusPoint(D21_LOCATION), [0, -0]);
  const east = campusPoint([D21_LOCATION[0]+.001,D21_LOCATION[1]]);
  const north = campusPoint([D21_LOCATION[0],D21_LOCATION[1]+.001]);
  assert.ok(east[0]>71 && east[0]<73 && Math.abs(east[1])<.001);
  assert.ok(north[1]<-111 && north[1]>-112);
});
test('the D21 tile contains the origin and adjacent tile edges coincide', () => {
  const [x,y]=coordinateTile(D21_LOCATION,17), tile=tilePosition(x,y,17), next=tilePosition(x+1,y+1,17);
  assert.ok(Math.abs(tile.x)<=tile.size/2 && Math.abs(tile.z)<=tile.size/2);
  assert.ok(Math.abs(next.x-tile.x-tile.size)<1e-7);
  assert.ok(Math.abs(next.z-tile.z-tile.size)<1e-7);
  assert.ok(Math.abs(footprintHeading([[8,49],[8.001,49],[8.001,49.0001],[8,49.0001],[8,49]])) < 1e-8);
});
