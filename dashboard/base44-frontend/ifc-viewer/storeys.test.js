import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IfcAPI, IFCBUILDINGSTOREY, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELAGGREGATES } from 'web-ifc';
import { exampleIFC } from './example.js';
import { readStoreys, floorCut } from './storeys.js';

test('reference sample parses as IFC4 and assigns every visible element to one of three storeys', async () => {
  const api = new IfcAPI();
  await api.Init();
  const id = api.OpenModel(exampleIFC(), { COORDINATE_TO_ORIGIN: true });
  try {
    assert.ok(api.IsModelOpen(id));
    const { storeys, assignments } = readStoreys(api, id);
    assert.deepEqual(storeys.map(floor => floor.elevation), [0, 3.6, 7.2]);
    const rendered = [];
    api.StreamAllMeshes(id, mesh => { if (mesh.geometries.size()) rendered.push(mesh.expressID); });
    assert.ok(rendered.length > 80, 'sample contains real walls, slabs and windows');
    assert.ok(rendered.every(element => storeys.some(floor => floor.id === assignments.get(element))));
  } finally { api.CloseModel(id); api.Dispose(); }
});

test('spatial nesting resolves unordered and cyclic relations without inventing floors', () => {
  const lines = {
    1: { expressID: 1, Name: { value: 'EG' }, Elevation: { value: 0 } },
    10: { RelatingStructure: { value: 30 }, RelatedElements: [{ value: 99 }] },
    11: { RelatingStructure: { value: 1 }, RelatedElements: [{ value: 20 }] },
    12: { RelatingObject: { value: 20 }, RelatedObjects: [{ value: 30 }] },
    13: { RelatingObject: { value: 30 }, RelatedObjects: [{ value: 20 }] },
  };
  const groups = new Map([[IFCBUILDINGSTOREY, [1]], [IFCRELCONTAINEDINSPATIALSTRUCTURE, [10,11]], [IFCRELAGGREGATES, [12,13]]]);
  const api = { GetLine: (_, id) => lines[id], GetLineIDsWithType: (_, type) => ({ size: () => groups.get(type).length, get: i => groups.get(type)[i] }) };
  const { storeys, assignments } = readStoreys(api, 0);
  assert.equal(storeys.length, 1);
  assert.equal(assignments.get(99), 1);
  assert.equal(assignments.has(100), false);
});

test('floor cuts use model-space geometry heights and keep separation local', () => {
  const floors = [{id:1,base:-5,top:-1.5},{id:2,base:-1.4,top:2.1},{id:3,base:2.2,top:6}];
  assert.equal(floorCut(floors, null), null);
  assert.equal(floorCut([], 1), null);
  assert.ok(Math.abs(floorCut(floors, 1) - (-1.44)) < 1e-9);
  assert.ok(Math.abs(floorCut(floors, 2, 4) - 6.16) < 1e-9);
  assert.ok(Math.abs(floorCut(floors, 3) - 5.76) < 1e-9);
  assert.equal(floors[1].base, -1.4);
  assert.ok(Math.abs(floorCut([{id:1,base:0,top:3.8,ceiling:3.5}], 1) - 3.46) < 1e-9, 'top-storey roof slab is removed completely');
});
