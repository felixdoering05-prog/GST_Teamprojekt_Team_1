import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeIssues, STATUS_COLORS } from './issue-markers.js';
test('only well-formed defect markers reach the scene', () => {
  const list = sanitizeIssues([
    { id: 1, status: 'open', point: { x: 1, y: 2, z: 3 } },
    { id: 2, status: 'weird', point: { x: 0, y: 0, z: 0 } },
    { id: 3, status: 'done', point: null },
    { id: 0, status: 'open', point: { x: 1, y: 1, z: 1 } },
    { id: '5', status: 'open', point: { x: 1, y: 1, z: 1 } },
    { id: 6, status: 'open', point: { x: Infinity, y: 1, z: 1 } },
    { id: 7, status: 'in_progress', point: { x: -1, y: 0.5, z: 9, extra: 'x' } },
  ]);
  assert.deepEqual(list.map(x => x.id), [1, 2, 7]);
  assert.equal(list[1].status, 'open', 'unknown status falls back to open');
  assert.deepEqual(list[2].point, { x: -1, y: 0.5, z: 9 });
  assert.deepEqual(sanitizeIssues('nope'), []);
  assert.equal(sanitizeIssues(Array.from({ length: 400 }, (_, i) => ({ id: i + 1, status: 'open', point: { x: 0, y: 0, z: 0 } }))).length, 300);
  assert.ok(STATUS_COLORS.open && STATUS_COLORS.in_progress && STATUS_COLORS.done);
});
