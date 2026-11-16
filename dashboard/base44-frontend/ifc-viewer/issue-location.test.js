import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIssueLocation } from './issue-location.js';

const ground = { id: 7, base: 0, top: 3 };
const upstairs = { id: 11, base: 3, top: 6 };
const floors = [ground, upstairs];
const assignments = new Map([[20, upstairs.id], [21, ground.id]]);

test('an IFC reference locates the floor and does not create a point', () => {
 const room = { name: 'Labor', meshes: [] };
 const item = resolveIssueLocation({ focus: { id: 3, spaceID: 20 }, floors, assignments, room });
 assert.deepEqual(item, { floor: upstairs, room, element: null, point: null });
 const element = [{}];
 const part = resolveIssueLocation({ focus: { id: 3, spaceID: 999, elementID: 21 }, floors, assignments, element });
 assert.equal(part.floor, ground);
 assert.equal(part.element, element);
});

test('a valid point selects a uniquely matching storey without replacing the point', () => {
 const point = { x: 1, y: 4, z: 2 };
 const input = { focus: { id: 3 }, floors, assignments, point };
 assert.equal(resolveIssueLocation(input).floor, upstairs);
 assert.equal(resolveIssueLocation(input).point, point);
 assert.equal(resolveIssueLocation({ ...input, floors: [...floors, { id: 12, base: 3, top: 5 }] }).floor, undefined);
});

test('missing and unresolvable references do not produce a marker or floor', () => {
 assert.equal(resolveIssueLocation({ focus: { id: 0 }, floors, assignments }), null);
 assert.deepEqual(resolveIssueLocation({ focus: { id: 5, spaceID: 20 }, floors, assignments }),
  { floor: undefined, room: null, element: null, point: null });
});
