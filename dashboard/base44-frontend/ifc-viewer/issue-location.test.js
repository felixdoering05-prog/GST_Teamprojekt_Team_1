import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchIssueRoom, resolveIssueLocation } from './issue-location.js';

const ground = { id: 7, name: 'Erdgeschoss', base: 0, top: 3 };
const upstairs = { id: 11, name: 'Obergeschoss 1', base: 3, top: 6 };
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

const roomAreas = new Map([
 [20, { name: '3 · Besprechungsraum', aliases: ['3', 'Besprechungsraum'] }],
 [21, { name: '3 · Technik', aliases: ['3', 'Technik'] }],
]);

test('a recorded building, floor and room label select the matching room even when codes repeat', () => {
 const input = { building: 'D21', floors, assignments, rooms: roomAreas };
 assert.deepEqual(matchIssueRoom({ ...input, location: 'D21, 1. Stock, Raum 3' }), { floor: upstairs, spaceID: 20 });
 assert.deepEqual(matchIssueRoom({ ...input, location: 'Raum 3 EG' }), { floor: ground, spaceID: 21 });
 assert.deepEqual(matchIssueRoom({ ...input, location: '1. OG Besprechungsraum' }), { floor: upstairs, spaceID: 20 });
 assert.deepEqual(matchIssueRoom({ ...input, location: 'D21, Besprechungsraum' }), { spaceID: 20 });
 assert.equal(matchIssueRoom({ ...input, location: 'Raum 3' }), null);
});

test('ambiguous and unknown rooms only select an explicitly verified floor', () => {
 const input = { building: 'D21', floors, assignments, rooms: roomAreas };
 assert.deepEqual(matchIssueRoom({ ...input, location: '1. OG, Flur 3' }), { floor: upstairs, spaceID: undefined });
 assert.deepEqual(matchIssueRoom({ ...input, location: '1. OG' }), { floor: upstairs, spaceID: undefined });
 assert.equal(matchIssueRoom({ ...input, location: 'D21, 2. OG, Besprechungsraum' }), null);
 assert.equal(matchIssueRoom({ ...input, location: '3. Raum' }), null);
 const sameFloor = new Map([...assignments, [21, upstairs.id]]);
 assert.deepEqual(matchIssueRoom({ ...input, location: '1. OG, Raum 3', assignments: sameFloor }), { floor: upstairs, spaceID: undefined });
});

test('a floor lookup leaves the exact point empty', () => {
 assert.deepEqual(resolveIssueLocation({ focus: { id: 5 }, floors, assignments, textFloor: upstairs }),
  { floor: upstairs, room: null, element: null, point: null });
});
