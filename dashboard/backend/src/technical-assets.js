const express = require('express');
const { readFile } = require('node:fs/promises');
const { can } = require('./team-permissions');
const { dayOf } = require('./energy-records');
const { modelIndex } = require('./model-state');
const { campusBuildingID, campusModelFile } = require('./campus');

const STATUSES = ['in_betrieb', 'wartung', 'stoerung'];
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const validID = (value) => /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647;
const sqlDay = (date) => date instanceof Date ? date.toISOString().slice(0, 10) : date;
const canReadModel = (access, modelID) => can(access, 'bim') && (modelID === 'campus-d21' || can(access, 'documents'));
const present = (row, access) => ({ ...row,
  next_maintenance: sqlDay(row.next_maintenance), planned_maintenance: sqlDay(row.planned_maintenance),
  ifc_reference: row.ifc_reference && canReadModel(access, row.ifc_reference.model_id) ? row.ifc_reference : null,
});

async function initTechnicalAssets(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_technical_assets (
    id SERIAL PRIMARY KEY, building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
    name TEXT NOT NULL, system TEXT NOT NULL, location TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('in_betrieb','wartung','stoerung')),
    planned_maintenance DATE, data_quality INTEGER CHECK(data_quality BETWEEN 0 AND 100),
    notes TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query('CREATE INDEX IF NOT EXISTS app_technical_assets_building_idx ON app_technical_assets(building_id,id)');
  await db.query('ALTER TABLE app_technical_assets ADD COLUMN IF NOT EXISTS ifc_reference JSONB');
  await db.query(`CREATE TABLE IF NOT EXISTS app_technical_asset_observations (
    asset_id INTEGER NOT NULL REFERENCES app_technical_assets(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL, observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_quality INTEGER, entered_fault BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY(asset_id,revision))`);
  // Existing assets have a current state. Historical transitions cannot be reconstructed from it.
  await db.query(`INSERT INTO app_technical_asset_observations(asset_id,revision,data_quality)
    SELECT id,revision,data_quality FROM app_technical_assets a
    WHERE NOT EXISTS (SELECT 1 FROM app_technical_asset_observations o WHERE o.asset_id=a.id)
    ON CONFLICT DO NOTHING`);
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

async function validateReference(db, access, input, campusOptions) {
  if (input === null) return null;
  const { model_id, element_id, global_id, label } = input ?? {};
  if (typeof model_id !== 'string' || (model_id !== 'campus-d21' && !validID(model_id)) ||
      !Number.isInteger(element_id) || !validID(element_id) ||
      typeof global_id !== 'string' || !/^[0-3][A-Za-z0-9_$]{21}$/.test(global_id) ||
      typeof label !== 'string' || !label.trim() || label.length > 160) throw error('Bitte ein IFC-Bauteil oder einen Raum auswählen.');
  if (!canReadModel(access, model_id)) throw error('Dafür brauchst du Zugriff auf das IFC-Modell.', 403);
  let content;
  if (model_id === 'campus-d21') {
    if (campusBuildingID(campusOptions) !== String(access.building_id)) throw error('IFC-Modell gehört nicht zu diesem Gebäude.', 404);
    const file = await campusModelFile(campusOptions);
    content = await readFile(file.filename);
  } else {
    const doc = (await db.query("SELECT content FROM app_documents WHERE id=$1 AND building_id=$2 AND mime_type='application/x-step'",
      [model_id, access.building_id])).rows[0];
    if (!doc) throw error('IFC-Modell gehört nicht zu diesem Gebäude.', 404);
    content = doc.content;
  }
  const matches = modelIndex(content).entities.filter(entity => entity.globalID === global_id);
  if (matches.length !== 1 || matches[0].id !== element_id) throw error('Das Objekt ist im IFC-Modell nicht eindeutig verfügbar.');
  return { model_id, element_id, global_id, label: label.replace(/[\x00-\x1f\x7f]/g, ' ').trim() || `IFC #${element_id}` };
}

function technicalAssetsRouter(db, campusOptions) {
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
    res.json({ items: rows.map(row => present(row, req.buildingAccess)), can_edit: can(req.buildingAccess, 'maintenance', 'edit') });
  }));
  router.post(base, wrap(async (req, res) => {
    const input = parseAsset(req.body);
    const created = (await db.query(`WITH created AS (
      INSERT INTO app_technical_assets (building_id,name,system,location,status,planned_maintenance,data_quality,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    ), observed AS (
      INSERT INTO app_technical_asset_observations(asset_id,revision,data_quality) SELECT id,revision,data_quality FROM created
    ) SELECT * FROM created`, [req.params.assetBuilding, ...input])).rows[0];
    res.status(201).json(present(created, req.buildingAccess));
  }));
  router.patch(base + '/:assetID', wrap(async (req, res) => {
    if (!validID(req.params.assetID) || !Number.isInteger(req.body?.revision)) throw error('Ungültige Anlage oder Revision.');
    const input = parseAsset(req.body);
    const saved = (await db.query(`WITH previous AS (
      SELECT id,status,data_quality FROM app_technical_assets WHERE id=$1 AND building_id=$2 AND revision=$3
    ), saved AS (
      UPDATE app_technical_assets SET name=$4,system=$5,location=$6,status=$7,planned_maintenance=$8,
        data_quality=$9,notes=$10,updated_at=now(),revision=revision+1
      WHERE id=$1 AND building_id=$2 AND revision=$3 RETURNING *
    ), observed AS (
      INSERT INTO app_technical_asset_observations(asset_id,revision,data_quality,entered_fault)
      SELECT s.id,s.revision,s.data_quality,s.status='stoerung' AND p.status<>'stoerung' FROM saved s JOIN previous p ON s.id=p.id
      WHERE p.status<>s.status OR p.data_quality IS DISTINCT FROM s.data_quality
    ) SELECT * FROM saved`, [req.params.assetID, req.params.assetBuilding, req.body.revision, ...input])).rows[0];
    if (!saved) throw error('Anlage ist nicht verfügbar oder wurde inzwischen geändert.', 409);
    res.json(present(saved, req.buildingAccess));
  }));
  router.put(base + '/:assetID/ifc-reference', wrap(async (req, res) => {
    if (!validID(req.params.assetID) || !Number.isInteger(req.body?.revision) || req.body.revision < 0) throw error('Ungültige Anlage oder Revision.');
    if (!can(req.buildingAccess, 'bim')) throw error('Dafür brauchst du Zugriff auf das IFC-Modell.', 403);
    const reference = await validateReference(db, req.buildingAccess, req.body.reference, campusOptions);
    const saved = (await db.query(`UPDATE app_technical_assets SET ifc_reference=$4,revision=revision+1,updated_at=now()
      WHERE id=$1 AND building_id=$2 AND revision=$3 RETURNING *`,
    [req.params.assetID, req.buildingAccess.building_id, req.body.revision, reference && JSON.stringify(reference)])).rows[0];
    if (!saved) throw error('Anlage ist nicht verfügbar oder wurde inzwischen geändert.', 409);
    res.json(present(saved, req.buildingAccess));
  }));
  router.use((err, req, res, next) => err.status ? res.status(err.status).json({ error: err.message }) : next(err));
  return router;
}

module.exports = { initTechnicalAssets, technicalAssetsRouter };
