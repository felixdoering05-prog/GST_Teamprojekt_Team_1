const express = require('express');
const { can } = require('./team-permissions');
const { dayOf } = require('./energy-records');

const STATUSES = ['in_betrieb', 'wartung', 'stoerung'];
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const validID = (value) => /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647;
const sqlDay = (date) => date instanceof Date ? date.toISOString().slice(0, 10) : date;
const present = (row) => ({ ...row, next_maintenance: sqlDay(row.next_maintenance), planned_maintenance: sqlDay(row.planned_maintenance) });

async function initTechnicalAssets(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_technical_assets (
    id SERIAL PRIMARY KEY, building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
    name TEXT NOT NULL, system TEXT NOT NULL, location TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('in_betrieb','wartung','stoerung')),
    planned_maintenance DATE, data_quality INTEGER CHECK(data_quality BETWEEN 0 AND 100),
    notes TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query('CREATE INDEX IF NOT EXISTS app_technical_assets_building_idx ON app_technical_assets(building_id,id)');
}

function parseAsset(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('Anlagendaten fehlen.');
  const text = (key, max, required = false) => {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if ((required && !value) || value.length > max) throw error('Bitte Name, System, Standort und Notizen prüfen.');
    return value;
  };
  if (!STATUSES.includes(input.status)) throw error('Ungültiger Anlagenstatus.');
  const date = input.planned_maintenance ?? null;
  if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || dayOf(date) !== date)) throw error('Ungültiger Wartungstermin.');
  const quality = input.data_quality ?? null;
  if (quality !== null && (!Number.isInteger(quality) || quality < 0 || quality > 100)) throw error('Datenqualität zwischen 0 und 100 Prozent angeben.');
  return [text('name', 120, true), text('system', 100, true), text('location', 120, true), input.status, date, quality, text('notes', 2000)];
}

function technicalAssetsRouter(db) {
  const router = express.Router();
  const base = '/buildings/:assetBuilding/assets';
  router.use(base, (req, res, next) => {
    if (!validID(req.params.assetBuilding) || !req.buildingAccess) return res.status(404).json({ error: 'Gebäude nicht gefunden.' });
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  router.get(base, wrap(async (req, res) => {
    const rows = (await db.query(`SELECT a.*,
      CASE WHEN EXISTS (SELECT 1 FROM app_maintenance m WHERE m.asset_id=a.id)
        THEN (SELECT MIN(m.next_due) FROM app_maintenance m WHERE m.asset_id=a.id AND m.work_status<>'completed')
        ELSE a.planned_maintenance END AS next_maintenance
      FROM app_technical_assets a WHERE a.building_id=$1 ORDER BY lower(a.name), a.id`, [req.params.assetBuilding])).rows;
    res.json({ items: rows.map(present), can_edit: can(req.buildingAccess, 'maintenance', 'edit') });
  }));
  router.post(base, wrap(async (req, res) => {
    const input = parseAsset(req.body);
    const created = (await db.query(`INSERT INTO app_technical_assets
      (building_id,name,system,location,status,planned_maintenance,data_quality,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [req.params.assetBuilding, ...input])).rows[0];
    res.status(201).json(present(created));
  }));
  router.patch(base + '/:assetID', wrap(async (req, res) => {
    if (!validID(req.params.assetID) || !Number.isInteger(req.body?.revision)) throw error('Ungültige Anlage oder Revision.');
    const input = parseAsset(req.body);
    const saved = (await db.query(`UPDATE app_technical_assets
      SET name=$4,system=$5,location=$6,status=$7,planned_maintenance=$8,data_quality=$9,notes=$10,updated_at=now(),revision=revision+1
      WHERE id=$1 AND building_id=$2 AND revision=$3 RETURNING *`, [req.params.assetID, req.params.assetBuilding, req.body.revision, ...input])).rows[0];
    if (!saved) throw error('Anlage ist nicht verfügbar oder wurde inzwischen geändert.', 409);
    res.json(present(saved));
  }));
  router.use((err, req, res, next) => err.status ? res.status(err.status).json({ error: err.message }) : next(err));
  return router;
}

module.exports = { initTechnicalAssets, technicalAssetsRouter };
