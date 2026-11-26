import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canUseBuilding, clearBuildingParameters, legacyIssuesLocation, linkedBuildingTeam, resolveBuildingScope } from './buildingScope.js';

const d21 = { id: 21, name: 'D21' };
const other = { id: 42, name: 'Labor B' };
const foreign = { id: 52, name: 'Werkstatt C' };
const team = { id: 1, buildings: [d21, other] };
const shared = { id: 2, buildings: [foreign] };
const groups = [{ id: 7, name: 'Campus', buildings: [d21] }];

test('all, a group and a specific building resolve to different data scopes', () => {
  assert.deepEqual(resolveBuildingScope(team, groups, 'all').buildings, [d21, other]);
  assert.deepEqual(resolveBuildingScope(team, groups, 'group:7').buildings, [d21]);
  const chosen = resolveBuildingScope(team, groups, 'building:42');
  assert.equal(chosen.label, other.name);
  assert.equal(chosen.building, other);
  assert.deepEqual(chosen.buildings, [other]);
  assert.equal(resolveBuildingScope(team, groups, 'building:52').value, 'all');
});

test('a direct link can find the target team, and module rights still apply', () => {
  assert.equal(linkedBuildingTeam([team, shared], team, '52'), shared);
  assert.equal(linkedBuildingTeam([team], team, '52'), undefined);
  const viewer = { permissions: { issues: 'read', structure: 'none' } };
  assert.equal(canUseBuilding(viewer, 'issues'), true);
  assert.equal(canUseBuilding(viewer, 'issues', 'edit'), false);
  assert.equal(canUseBuilding(viewer, 'structure'), false);
});

test('old issue links keep their filters, detail IDs and fragment', () => {
  const target = legacyIssuesLocation({ search: '?building=21&issue=401&status=active', hash: '#entry' });
  assert.equal(target.pathname, '/meldungen');
  assert.equal(target.hash, '#entry');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(target.search)),
    { building: '21', issue: '401', status: 'active', ansicht: 'maengel' });
});

test('an explicit building change removes stale detail parameters and keeps view filters', () => {
  assert.equal(clearBuildingParameters('?building=21&room=101&focusRoom=101&model=8&issue=401&unit=eg&mode=rooms&status=active').toString(),
    'mode=rooms&status=active');
});
