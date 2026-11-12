import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { bimStoreys, mountBimStoreys, storeySlice } from './bim-storeys.js';

test('campus storeys use the room floor datum and exclude IFC reference levels', () => {
  const storeys = [
    { id: 1, name: 'KG', base: -3, top: -.25 },
    { id: 2, name: 'UK BP EG', base: -.25, top: 0 },
    { id: 3, name: 'EG', base: -.3, top: 3.6 },
    { id: 4, name: '1. OG', base: 3.4, top: 6.9 },
  ];
  const roomBases = new Map([[1, [-2.5]], [3, [.12, 0, 0]], [4, [3.6]]]);
  const floors = bimStoreys(storeys, roomBases, true);
  assert.deepEqual(floors.map(({ id, base }) => [id, base]), [[1, -2.5], [3, 0], [4, 3.6]]);
  assert.deepEqual(storeySlice(floors, floors[1]), { bottom: -.36, top: 1.55 });
  assert.equal(bimStoreys(storeys, roomBases, false).length, 4);
});

test('a storey cut hides the other levels while preserving local and shared element visibility', () => {
  const floors = [{ id: 1, base: 0, top: 3 }, { id: 2, base: 3, top: 6 }, { id: 3, base: 6, top: 9 }];
  const root = new Group(), roomEffects = new Group();
  const geometry = new BoxGeometry(2, 2, 2), material = new MeshBasicMaterial();
  const meshes = floors.map(floor => {
    const mesh = new Mesh(geometry, material);
    mesh.position.y = floor.base + 1;
    mesh.userData = { storey: floor.id, basePosition: mesh.position.clone() };
    root.add(mesh);
    return mesh;
  });
  meshes[0].scale.y = 1.9;
  meshes[0].visible = false;
  const renderer = { clippingPlanes: [], shadowMap: {} };
  const view = mountBimStoreys({
    root, roomEffects, floors, renderer, fullBounds: new Box3().setFromObject(root),
    boundsByMesh: new Map(), render() {}, motion: { matches: true },
  });
  view.setView(floors[1], false);
  assert.deepEqual(meshes.map(mesh => mesh.layers.isEnabled(0)), [false, true, false]);
  assert.equal(view.canPick({ object: meshes[1], point: new Vector3(0, 4, 0) }), true);
  assert.equal(view.canPick({ object: meshes[1], point: new Vector3(0, 5, 0) }), false);
  assert.equal(view.canPick({ object: meshes[2], point: new Vector3(0, 4, 0) }), false);
  view.setView(floors[1], true);
  assert.equal(meshes[0].position.y, 1);
  assert.ok(meshes[1].position.y > 7);
  assert.equal(meshes[2].position.y, 7);
  assert.equal(renderer.clippingPlanes.length, 0);
  view.setView(null, true);
  assert.ok(meshes[2].position.y > 7);
  assert.equal(renderer.clippingPlanes.length, 0);
  view.setView(null, false);
  assert.deepEqual(meshes.map(mesh => mesh.layers.isEnabled(0)), [true, true, true]);
  assert.equal(meshes[2].position.y, 7);
  assert.equal(meshes[0].visible, false);
  geometry.dispose(); material.dispose();
});
