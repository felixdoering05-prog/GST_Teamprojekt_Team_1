const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { initUIPreferences, uiPreferencesRouter } = require('../src/ui-preferences');

test('migrates legacy preferences, validates layouts and keeps changes per account', async t => {
 const pg = new PGlite();
 await pg.waitReady;
 t.after(() => pg.close());
 await pg.exec(`CREATE TABLE app_users(id INTEGER PRIMARY KEY);
  INSERT INTO app_users VALUES (1), (2);
  CREATE TABLE app_ui_preferences(user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
   presentation_mode BOOLEAN NOT NULL DEFAULT false,revision INTEGER NOT NULL DEFAULT 1);
  INSERT INTO app_ui_preferences VALUES (1,true,7)`);
 const db = { query: pg.query.bind(pg), connect: async () => ({ query: pg.query.bind(pg), release() {} }) };
 await initUIPreferences(db);
 await initUIPreferences(db);
 const app = express();
 app.use(express.json(), uiPreferencesRouter(db, (req, res, next) => {
  const id = Number(req.get('X-Test-User'));
  if (![1, 2].includes(id)) return res.sendStatus(401);
  req.account = { id };
  next();
 }));
 const server = app.listen(0, '127.0.0.1');
 await once(server, 'listening');
 t.after(() => new Promise(resolve => server.close(resolve)));
 async function call(id, body, view = '?view=appearance') {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/profile/ui${view}`, {
   method: body ? 'PATCH' : 'GET', headers: { 'X-Test-User': String(id), 'Content-Type': 'application/json' },
   body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: response.status === 401 ? null : await response.json() };
 }
 const defaults = { presentation_mode: false, revision: 0, theme: 'system', font_scale: 100, dashboard_layout: null, language: null };
 assert.deepEqual((await call(1)).data, { ...defaults, presentation_mode: true, revision: 7 });
 assert.deepEqual((await call(2)).data, defaults);
 assert.equal((await call(0)).status, 401);

 const layout = [{ id: 'issues', size: 'wide', filter: 'open' }, { id: 'model', size: 'small' }];
 const changed = await call(1, { revision: 7, theme: 'dark', font_scale: 130, dashboard_layout: layout });
 assert.equal(changed.status, 200);
 assert.deepEqual(changed.data, { ...defaults, theme: 'dark', font_scale: 130, dashboard_layout: layout, presentation_mode: true, revision: 8 });
 assert.equal((await call(1, { revision: 7, theme: 'light' })).status, 409);
 assert.equal((await call(1, { revision: 8, font_scale: 135 })).status, 400);
 assert.equal((await call(1, { revision: 8, dashboard_layout: [layout[1], layout[1]] })).status, 400);
 assert.equal((await call(1, { revision: 8, dashboard_layout: [{ id: 'rooms', size: 'wide', filter: 'done' }] })).status, 400);
 assert.equal((await call(1, { revision: 8, user_id: 2, theme: 'light' })).status, 400);

 assert.deepEqual((await call(1, { revision: 8, presentation_mode: false }, '')).data,
  { presentation_mode: false, revision: 9 });
 assert.deepEqual((await call(1)).data, { ...changed.data, presentation_mode: false, revision: 9 });
 assert.deepEqual((await call(2)).data, defaults);
 assert.equal((await call(1, { revision: 9, dashboard_layout: null })).data.dashboard_layout, null);
 assert.equal((await call(1, { revision: 10, language: 'en' })).data.language, 'en');
 assert.equal((await call(1, { revision: 11, language: 'fr' })).status, 400);
 assert.equal((await call(2)).data.language, null);
});
