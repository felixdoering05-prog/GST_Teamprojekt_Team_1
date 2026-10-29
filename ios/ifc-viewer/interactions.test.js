import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ElementAppearance } from './interactions.js';
const mesh = color => new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color }));
test('multi-part IFC entity: select, recolor, hide, restore, reset without affecting neighbors', () => {
  const state = new ElementAppearance(), a = mesh('#ffffff'), b = mesh('#888888'), other = mesh('#123456');
  state.add(10, a); state.add(10, b); state.add(11, other);
  state.select(10); assert.notEqual(a.material.emissive.getHex(), 0); assert.notEqual(b.material.emissive.getHex(), 0);
  state.color('#ff0000'); assert.equal(a.material.color.getHexString(), 'ff0000'); assert.equal(b.material.color.getHexString(), 'ff0000'); assert.equal(other.material.color.getHexString(), '123456');
  state.hide(); assert.equal(state.selectedID, undefined); assert.equal(state.hiddenCount, 1); assert.deepEqual(state.visibleMeshes, [other]); assert.equal(a.material.emissive.getHex(), 0);
  state.showAll(); assert.equal(state.hiddenCount, 0); assert.equal(a.material.color.getHexString(), 'ff0000');
  state.resetColors(); assert.equal(a.material.color.getHexString(), 'ffffff'); assert.equal(b.material.color.getHexString(), '888888');
  state.select(11); state.select(999); assert.equal(state.selectedID, undefined); assert.equal(other.material.emissive.getHex(), 0);
});
