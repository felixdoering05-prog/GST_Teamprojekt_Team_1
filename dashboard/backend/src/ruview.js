// Experimentelle WLAN-Präsenz über RuView (ESP32-CSI).
//
// Ablauf: ESP32-Knoten im Heimnetz senden ihre Vitalpakete per UDP an eine
// lokale Brücke (sensorik/ruview-bridge). Die Brücke fasst sie zusammen und
// meldet je Knoten Anwesenheit, Bewegung, Personenzahl, Atemfrequenz und
// Signalstärke an POST /ruview-input. Rohdaten (CSI) verlassen das Heimnetz nie.
//
// Die Funktion ist nur aktiv, solange der Gebäudeeigentümer sie in seinen
// Einstellungen eingeschaltet hat (app_ui_preferences.ruview_enabled).
const express = require('express');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { accessibleBuilding } = require('./collaboration');
const { can } = require('./team-permissions');

const hash = value => createHash('sha256').update(value).digest('hex');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const validBuilding = value => /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647;

const MAX_BRIDGES_PER_BUILDING = 3;
const MAX_NODES = 8;
const MIN_INTERVAL_MS = 4000;          // Brücke meldet alle 10 s; Puffer für Netzschwankungen.
const HISTORY_HOURS = 24;              // Verlauf wird danach automatisch verworfen.
const STALE_MS = 60000;                // Präsenzwerte älter als 60 s gelten als veraltet.

async function initRuView(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_ruview_bridges(
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    last_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS app_ruview_nodes(
    bridge_id TEXT NOT NULL REFERENCES app_ruview_bridges(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL,
    room_label TEXT,
    presence BOOLEAN NOT NULL,
    motion REAL NOT NULL,
    persons INTEGER NOT NULL,
    breathing_bpm REAL,
    rssi INTEGER,
    pps REAL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(bridge_id,node_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS app_ruview_samples(
    id BIGSERIAL PRIMARY KEY,
    bridge_id TEXT NOT NULL REFERENCES app_ruview_bridges(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    presence BOOLEAN NOT NULL,
    motion REAL NOT NULL,
    persons INTEGER NOT NULL,
    breathing_bpm REAL)`);
  await db.query('CREATE INDEX IF NOT EXISTS app_ruview_samples_idx ON app_ruview_samples(bridge_id,node_id,at)');
}

async function ownerEnabled(db, userID) {
  const row = (await db.query('SELECT ruview_enabled FROM app_ui_preferences WHERE user_id=$1', [userID])).rows[0];
  return Boolean(row?.ruview_enabled);
}

const isNumber = value => typeof value === 'number' && Number.isFinite(value);
function validNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const allowed = ['node_id', 'presence', 'motion', 'persons', 'breathing_bpm', 'rssi', 'pps'];
  if (Object.keys(node).some(key => !allowed.includes(key))) return false;
  return Number.isInteger(node.node_id) && node.node_id >= 0 && node.node_id <= 255
    && typeof node.presence === 'boolean'
    && isNumber(node.motion) && node.motion >= 0 && node.motion <= 1e6
    && Number.isInteger(node.persons) && node.persons >= 0 && node.persons <= 16
    && (node.breathing_bpm === null || (isNumber(node.breathing_bpm) && node.breathing_bpm >= 4 && node.breathing_bpm <= 60))
    && (node.rssi === undefined || (Number.isInteger(node.rssi) && node.rssi >= -127 && node.rssi <= 0))
    && (node.pps === undefined || (isNumber(node.pps) && node.pps >= 0 && node.pps <= 1000));
}

const publicBridge = row => ({ id: row.id, label: row.label, last_at: row.last_at ? new Date(row.last_at).toISOString() : null });
function publicNode(row, now = Date.now()) {
  const updated = new Date(row.updated_at);
  return {
    bridge_id: row.bridge_id, node_id: row.node_id, room: row.room_label || null,
    presence: row.presence, motion: Number(row.motion), persons: row.persons,
    breathing_bpm: row.breathing_bpm === null ? null : Number(row.breathing_bpm),
    rssi: row.rssi, pps: row.pps === null ? null : Number(row.pps),
    updated_at: updated.toISOString(), stale: now - updated.getTime() > STALE_MS,
  };
}

function ruviewRouter(db, requireAccount) {
  const r = express.Router();
  const noStore = (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };

  // Eigentümer/Bearbeiter: Brücke anlegen. Der Schlüssel wird nur einmal angezeigt.
  r.post('/buildings/:building/ruview-bridges', requireAccount, noStore, wrap(async (req, res) => {
    const body = req.body || {};
    if (!validBuilding(req.params.building) || Object.keys(body).some(key => key !== 'label')
      || typeof body.label !== 'string' || !body.label.trim() || body.label.length > 60) {
      return res.status(400).json({ error: 'Gebäude und Name der Brücke erforderlich.' });
    }
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const building = await accessibleBuilding(c, req.params.building, req.account.id, true);
      if (!building || !can(req.buildingAccess, 'sensors', 'edit')) {
        await c.query('ROLLBACK');
        return res.status(404).json({ error: 'Gebäude nicht gefunden oder keine Bearbeitungsrechte.' });
      }
      if (!await ownerEnabled(c, building.user_id)) {
        await c.query('ROLLBACK');
        return res.status(403).json({ error: 'WLAN-Präsenz ist in den Einstellungen des Gebäudeeigentümers ausgeschaltet.' });
      }
      const count = Number((await c.query('SELECT count(*) n FROM app_ruview_bridges WHERE building_id=$1 AND revoked=false', [building.id])).rows[0].n);
      if (count >= MAX_BRIDGES_PER_BUILDING) {
        await c.query('ROLLBACK');
        return res.status(409).json({ error: `Maximal ${MAX_BRIDGES_PER_BUILDING} Brücken pro Gebäude.` });
      }
      const id = randomUUID(), token = randomBytes(32).toString('hex');
      await c.query('INSERT INTO app_ruview_bridges(id,user_id,building_id,token_hash,label) VALUES($1,$2,$3,$4,$5)',
        [id, building.user_id, building.id, hash(token), body.label.trim()]);
      await c.query('COMMIT');
      res.status(201).json({ id, token, label: body.label.trim() });
    } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  }));

  // Aktueller Stand aller Knoten eines Gebäudes (ohne Schlüssel).
  r.get('/buildings/:building/ruview', requireAccount, noStore, wrap(async (req, res) => {
    if (!validBuilding(req.params.building)) return res.status(400).json({ error: 'Ungültiges Gebäude.' });
    const building = await accessibleBuilding(db, req.params.building, req.account.id);
    if (!building) return res.status(404).json({ error: 'Gebäude nicht gefunden.' });
    const enabled = await ownerEnabled(db, building.user_id);
    if (!enabled) return res.json({ enabled: false, bridges: [], nodes: [] });
    const bridges = (await db.query('SELECT * FROM app_ruview_bridges WHERE building_id=$1 AND revoked=false ORDER BY created_at,id', [building.id])).rows;
    const nodes = (await db.query(`SELECT n.* FROM app_ruview_nodes n JOIN app_ruview_bridges b ON b.id=n.bridge_id
      WHERE b.building_id=$1 AND b.revoked=false ORDER BY n.bridge_id,n.node_id`, [building.id])).rows;
    res.json({ enabled: true, stale_after_seconds: STALE_MS / 1000, bridges: bridges.map(publicBridge), nodes: nodes.map(row => publicNode(row)) });
  }));

  // Verlauf eines Knotens (höchstens 24 h, für Diagramme).
  r.get('/buildings/:building/ruview/:bridge/nodes/:node/history', requireAccount, noStore, wrap(async (req, res) => {
    if (!validBuilding(req.params.building) || !/^\d{1,3}$/.test(req.params.node)) return res.status(400).json({ error: 'Ungültige Anfrage.' });
    const building = await accessibleBuilding(db, req.params.building, req.account.id);
    if (!building || !await ownerEnabled(db, building.user_id)) return res.status(404).json({ error: 'Nicht gefunden.' });
    const hours = Math.min(HISTORY_HOURS, Math.max(1, Number.parseInt(req.query.hours, 10) || 1));
    const rows = (await db.query(`SELECT s.at,s.presence,s.motion,s.persons,s.breathing_bpm FROM app_ruview_samples s
      JOIN app_ruview_bridges b ON b.id=s.bridge_id
      WHERE b.building_id=$1 AND b.id=$2 AND b.revoked=false AND s.node_id=$3 AND s.at > now() - ($4 || ' hours')::interval
      ORDER BY s.at LIMIT 10000`, [building.id, req.params.bridge, Number(req.params.node), String(hours)])).rows;
    res.json(rows.map(row => ({ at: new Date(row.at).toISOString(), presence: row.presence, motion: Number(row.motion),
      persons: row.persons, breathing_bpm: row.breathing_bpm === null ? null : Number(row.breathing_bpm) })));
  }));

  // Raumname für einen Knoten setzen.
  r.put('/buildings/:building/ruview/:bridge/nodes/:node', requireAccount, noStore, wrap(async (req, res) => {
    const body = req.body || {};
    if (!validBuilding(req.params.building) || !/^\d{1,3}$/.test(req.params.node)
      || Object.keys(body).some(key => key !== 'room') || !(body.room === null || (typeof body.room === 'string' && body.room.length <= 80))) {
      return res.status(400).json({ error: 'Ungültiger Raumname.' });
    }
    const building = await accessibleBuilding(db, req.params.building, req.account.id);
    if (!building || !can(req.buildingAccess, 'sensors', 'edit')) return res.status(404).json({ error: 'Nicht gefunden.' });
    const result = await db.query(`UPDATE app_ruview_nodes n SET room_label=$4 FROM app_ruview_bridges b
      WHERE b.id=n.bridge_id AND b.building_id=$1 AND b.id=$2 AND n.node_id=$3 AND b.revoked=false RETURNING n.*`,
    [building.id, req.params.bridge, Number(req.params.node), body.room ? body.room.trim() || null : null]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Knoten nicht gefunden.' });
    res.json(publicNode(result.rows[0]));
  }));

  // Brücke sperren. Gespeicherte Werte dieser Brücke werden mit gelöscht.
  r.delete('/buildings/:building/ruview-bridges/:bridge', requireAccount, noStore, wrap(async (req, res) => {
    if (!validBuilding(req.params.building)) return res.status(400).json({ error: 'Ungültiges Gebäude.' });
    const building = await accessibleBuilding(db, req.params.building, req.account.id);
    if (!building || !can(req.buildingAccess, 'sensors', 'edit')) return res.status(404).json({ error: 'Nicht gefunden.' });
    const result = await db.query('UPDATE app_ruview_bridges SET revoked=true WHERE id=$1 AND building_id=$2 AND revoked=false RETURNING id', [req.params.bridge, building.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Brücke nicht gefunden.' });
    await db.query('DELETE FROM app_ruview_nodes WHERE bridge_id=$1', [req.params.bridge]);
    await db.query('DELETE FROM app_ruview_samples WHERE bridge_id=$1', [req.params.bridge]);
    res.json({ revoked: true });
  }));

  // Eingang der Heim-Brücke (Gerätezugang statt Kontositzung).
  r.post('/ruview-input', noStore, wrap(async (req, res) => {
    const token = req.get('X-Ruview-Bridge') || '';
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ error: 'Brückenzugang ungültig.' });
    const body = req.body || {};
    if (Object.keys(body).some(key => key !== 'nodes') || !Array.isArray(body.nodes) || !body.nodes.length
      || body.nodes.length > MAX_NODES || !body.nodes.every(validNode)
      || new Set(body.nodes.map(node => node.node_id)).size !== body.nodes.length) {
      return res.status(400).json({ error: 'Ungültige Präsenzdaten.' });
    }
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const bridge = (await c.query('SELECT * FROM app_ruview_bridges WHERE token_hash=$1 AND revoked=false FOR UPDATE', [hash(token)])).rows[0];
      if (!bridge) { await c.query('ROLLBACK'); return res.status(401).json({ error: 'Brückenzugang ungültig.' }); }
      if (!await ownerEnabled(c, bridge.user_id)) {
        await c.query('ROLLBACK');
        return res.status(403).json({ error: 'WLAN-Präsenz ist ausgeschaltet. Es werden keine Daten gespeichert.' });
      }
      if (bridge.last_at && Date.now() - Date.parse(bridge.last_at) < MIN_INTERVAL_MS) {
        await c.query('ROLLBACK');
        return res.status(429).json({ error: 'Zu viele Meldungen. Höchstens eine alle 5 Sekunden.' });
      }
      for (const node of body.nodes) {
        const breathing = node.breathing_bpm ?? null;
        await c.query(`INSERT INTO app_ruview_nodes(bridge_id,node_id,presence,motion,persons,breathing_bpm,rssi,pps,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(bridge_id,node_id) DO UPDATE SET presence=EXCLUDED.presence,
          motion=EXCLUDED.motion,persons=EXCLUDED.persons,breathing_bpm=EXCLUDED.breathing_bpm,rssi=EXCLUDED.rssi,pps=EXCLUDED.pps,updated_at=now()`,
        [bridge.id, node.node_id, node.presence, node.motion, node.persons, breathing, node.rssi ?? null, node.pps ?? null]);
        await c.query('INSERT INTO app_ruview_samples(bridge_id,node_id,presence,motion,persons,breathing_bpm) VALUES($1,$2,$3,$4,$5,$6)',
          [bridge.id, node.node_id, node.presence, node.motion, node.persons, breathing]);
      }
      await c.query(`DELETE FROM app_ruview_samples WHERE bridge_id=$1 AND at < now() - interval '${HISTORY_HOURS} hours'`, [bridge.id]);
      await c.query('UPDATE app_ruview_bridges SET last_at=now() WHERE id=$1', [bridge.id]);
      await c.query('COMMIT');
      res.status(201).json({ stored: body.nodes.length });
    } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  }));
  return r;
}

module.exports = { initRuView, ruviewRouter, validNode, STALE_MS };
