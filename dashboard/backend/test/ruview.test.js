const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { initAccounts, accountRouter } = require('../src/accounts');

let db, server, url, owner, other, building, bridge;

before(async () => {
  const pg = new PGlite();
  await pg.waitReady;
  db = { query: (s, p) => pg.query(s, p), connect: async () => ({ query: (s, p) => pg.query(s, p), release() {} }) };
  await initAccounts(db);
  const app = express();
  app.use(express.json());
  app.use('/api/v1', accountRouter(db));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  url = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  owner = (await request('/auth/register', 'POST', { name: 'Owner', email: 'ruview-owner@example.test', password: 'SafeTestPassword123' })).data;
  other = (await request('/auth/register', 'POST', { name: 'Other', email: 'ruview-other@example.test', password: 'SafeTestPassword456' })).data;
  building = (await request('/buildings', 'POST', { name: 'Wohnung' }, owner.token)).data;
  db.close = () => pg.close();
});
after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); });

async function request(path, method = 'GET', body, token, bridgeToken) {
  const response = await fetch(url + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-D21-Session': token } : {}), ...(bridgeToken ? { 'X-Ruview-Bridge': bridgeToken } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
const node = (extra = {}) => ({ node_id: 1, presence: true, motion: 0.8, persons: 1, breathing_bpm: 14.5, rssi: -63, pps: 47, ...extra });
const allowNextReport = () => db.query("UPDATE app_ruview_bridges SET last_at=now() - interval '1 minute'");

test('feature is off by default and blocks bridge setup', async () => {
  const prefs = await request('/profile/ui?view=appearance', 'GET', null, owner.token);
  assert.equal(prefs.data.ruview_enabled, false);
  assert.deepEqual((await request(`/buildings/${building.id}/ruview`, 'GET', null, owner.token)).data, { enabled: false, bridges: [], nodes: [] });
  assert.equal((await request(`/buildings/${building.id}/ruview-bridges`, 'POST', { label: 'Mac' }, owner.token)).status, 403);
});

test('owner enables the setting and creates a bridge; others cannot', async () => {
  const prefs = (await request('/profile/ui?view=appearance', 'GET', null, owner.token)).data;
  const updated = await request('/profile/ui?view=appearance', 'PATCH', { ruview_enabled: true, revision: prefs.revision }, owner.token);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.ruview_enabled, true);
  assert.equal((await request(`/buildings/${building.id}/ruview-bridges`, 'POST', { label: 'Mac' })).status, 401);
  assert.equal((await request(`/buildings/${building.id}/ruview-bridges`, 'POST', { label: 'Mac' }, other.token)).status, 404);
  assert.equal((await request(`/buildings/${building.id}/ruview-bridges`, 'POST', { label: '' }, owner.token)).status, 400);
  const created = await request(`/buildings/${building.id}/ruview-bridges`, 'POST', { label: 'Mac Wohnzimmer' }, owner.token);
  assert.equal(created.status, 201);
  assert.match(created.data.token, /^[a-f0-9]{64}$/);
  bridge = created.data;
  const stored = (await db.query('SELECT token_hash FROM app_ruview_bridges WHERE id=$1', [bridge.id])).rows[0];
  assert.notEqual(stored.token_hash, bridge.token);
});

test('bridge reports presence, breathing and is rate limited', async () => {
  assert.equal((await request('/ruview-input', 'POST', { nodes: [node()] })).status, 401);
  assert.equal((await request('/ruview-input', 'POST', { nodes: [node({ persons: 99 })] }, null, bridge.token)).status, 400);
  assert.equal((await request('/ruview-input', 'POST', { nodes: [node({ breathing_bpm: 200 })] }, null, bridge.token)).status, 400);
  assert.equal((await request('/ruview-input', 'POST', { nodes: [node(), node()] }, null, bridge.token)).status, 400);
  assert.equal((await request('/ruview-input', 'POST', { nodes: [node({ extra: 1 })] }, null, bridge.token)).status, 400);
  const first = await request('/ruview-input', 'POST', { nodes: [node(), node({ node_id: 2, presence: false, persons: 0, breathing_bpm: null })] }, null, bridge.token);
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal((await request('/ruview-input', 'POST', { nodes: [node()] }, null, bridge.token)).status, 429);
  const state = (await request(`/buildings/${building.id}/ruview`, 'GET', null, owner.token)).data;
  assert.equal(state.enabled, true);
  assert.equal(state.bridges.length, 1);
  assert.equal(state.nodes.length, 2);
  assert.equal(state.nodes[0].presence, true);
  assert.equal(state.nodes[0].breathing_bpm, 14.5);
  assert.equal(state.nodes[1].breathing_bpm, null);
  assert.equal(state.nodes[0].stale, false);
  assert.equal((await request(`/buildings/${building.id}/ruview`, 'GET', null, other.token)).status, 404);
  const history = await request(`/buildings/${building.id}/ruview/${bridge.id}/nodes/1/history?hours=2`, 'GET', null, owner.token);
  assert.equal(history.status, 200);
  assert.equal(history.data.length, 1);
});

test('owner names a node room', async () => {
  const named = await request(`/buildings/${building.id}/ruview/${bridge.id}/nodes/1`, 'PUT', { room: 'Wohnzimmer' }, owner.token);
  assert.equal(named.status, 200);
  assert.equal(named.data.room, 'Wohnzimmer');
  assert.equal((await request(`/buildings/${building.id}/ruview/${bridge.id}/nodes/1`, 'PUT', { room: 'x' }, other.token)).status, 404);
});

test('switching the setting off stops storage and hides data', async () => {
  const prefs = (await request('/profile/ui?view=appearance', 'GET', null, owner.token)).data;
  await request('/profile/ui?view=appearance', 'PATCH', { ruview_enabled: false, revision: prefs.revision }, owner.token);
  await allowNextReport();
  assert.equal((await request('/ruview-input', 'POST', { nodes: [node()] }, null, bridge.token)).status, 403);
  assert.equal((await request(`/buildings/${building.id}/ruview`, 'GET', null, owner.token)).data.enabled, false);
  const again = (await request('/profile/ui?view=appearance', 'GET', null, owner.token)).data;
  await request('/profile/ui?view=appearance', 'PATCH', { ruview_enabled: true, revision: again.revision }, owner.token);
});

test('revoking a bridge deletes its data and blocks its key', async () => {
  assert.equal((await request(`/buildings/${building.id}/ruview-bridges/${bridge.id}`, 'DELETE', null, other.token)).status, 404);
  assert.equal((await request(`/buildings/${building.id}/ruview-bridges/${bridge.id}`, 'DELETE', null, owner.token)).status, 200);
  assert.equal(Number((await db.query('SELECT count(*) n FROM app_ruview_samples')).rows[0].n), 0);
  await allowNextReport();
  assert.equal((await request('/ruview-input', 'POST', { nodes: [node()] }, null, bridge.token)).status, 401);
});
