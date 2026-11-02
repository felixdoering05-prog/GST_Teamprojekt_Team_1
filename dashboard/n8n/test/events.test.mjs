import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { githubEvents, healthEvent } from '../src/events.mjs';
const first = '2026-11-02T12:00:00.000Z';
const later = '2026-11-02T12:05:00.000Z';
const issue = overrides => ({ number: 7, title: 'Test', state: 'open', created_at: '2026-11-01T00:00:00Z', updated_at: first, assignees: [], ...overrides });
test('baseline, changed assignment, merged PR and no duplicate', () => {
  const state = {};
  const pr = issue({ number: 9, merged_at: null });
  assert.equal(githubEvents(state, [issue({})], [pr], first)[0].status, 'Ausgangsstand gespeichert');
  const changed = [issue({ assignees: [{ login: 'BGrimm101' }] })];
  const merged = [{ ...pr, state: 'closed', merged_at: later, updated_at: later }];
  const events = githubEvents(state, changed, merged, later);
  assert.deepEqual(events.map(x => x.reasons), [['Zuständigkeit geändert'], ['zusammengeführt']]);
  assert.equal(githubEvents(state, changed, merged, later)[0].status, 'keine Änderungen');
});
test('new task is recorded; PRs from issues endpoint are not duplicated', () => {
  const state = {};
  githubEvents(state, [], [], first);
  const events = githubEvents(state, [issue({ created_at: later, updated_at: later }), issue({ number: 8, pull_request: {} })], [], later);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].reasons, ['neu']);
});
test('invalid / overflowing response leaves persisted cursor unchanged', () => {
  const state = {};
  githubEvents(state, [issue({})], [], first);
  const before = JSON.stringify(state);
  assert.throws(() => githubEvents(state, {}, [], later));
  assert.throws(() => githubEvents(state, Array.from({ length: 100 }, (_, i) => issue({ number: i, updated_at: later })), [], later));
  assert.equal(JSON.stringify(state), before);
});
test('health detects gateway errors, network errors, recovery and monitoring gaps', () => {
  const state = {};
  const healthy = { statusCode: 200, body: { status: 'ok' } };
  const publicOK = { statusCode: 401 };
  assert.equal(healthEvent(state, healthy, publicOK, first).status, 'erreichbar');
  assert.equal(healthEvent(state, healthy, { statusCode: 502 }, later).event, 'Störung erkannt');
  assert.equal(healthEvent(state, { error: 'timeout' }, publicOK, later).status, 'Störung');
  assert.equal(healthEvent(state, healthy, publicOK, '2026-11-02T12:15:00Z').event, 'wieder erreichbar');
  assert.equal(healthEvent(state, healthy, publicOK, '2026-11-02T12:25:00Z').monitoringGapMinutes, 10);
});
test('generated n8n Code nodes run the actual tested functions with n8n item interfaces', async () => {
  for (const file of ['github', 'health']) {
    const workflow = JSON.parse(await readFile(new URL(`../workflows/${file}.json`, import.meta.url)));
    assert.equal(workflow.active, false);
    const state = {};
    const responses = {
      'Aufgaben lesen': { body: [issue({})] }, 'Pull Requests lesen': { body: [] },
      'App intern prüfen': { statusCode: 200, body: { status: 'ok' } }, 'Öffentlichen Zugang prüfen': { statusCode: 401 },
    };
    const context = { $getWorkflowStaticData: () => state, $: name => ({ first: () => ({ json: responses[name] }) }) };
    const result = vm.runInNewContext(`(function(){ ${workflow.nodes.at(-1).parameters.jsCode} })()`, context);
    assert.equal(result.length, 1);
    assert.equal(typeof result[0].json.status, 'string');
  }
});
