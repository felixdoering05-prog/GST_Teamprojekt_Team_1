const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { buildingAccess, can } = require('./team-permissions');
const MAX_MODEL = 20 * 1024 * 1024;
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function campusBuildingID(options = {}) {
  const id = String(options.buildingID ?? process.env.D21_CAMPUS_BUILDING_ID ?? '');
  return /^[1-9]\d*$/.test(id) && Number(id) <= 2147483647 ? id : null;
}

async function campusModelFile(options = {}) {
  const missing = () => Object.assign(new Error('Das D21-Modell ist auf dem Projektserver noch nicht eingerichtet.'), { status: 503 });
  const filename = options.file ?? process.env.D21_CAMPUS_MODEL_FILE ?? '/run/d21-models/H_DA_D21_Final.ifc';
  if (!path.isAbsolute(filename)) throw missing();
  let handle;
  try {
    handle = await fs.open(filename, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_MODEL) throw Object.assign(new Error('Das D21-IFC muss eine Datei bis 20 MiB sein.'), { status: 413 });
    const header = Buffer.alloc(Math.min(4096, stat.size));
    await handle.read(header, 0, header.length, 0);
    if (!header.toString('utf8').trimStart().startsWith('ISO-10303-21;') || !header.includes('FILE_SCHEMA')) {
      throw Object.assign(new Error('Die bereitgestellte Datei ist kein unterstütztes IFC-Modell.'), { status: 415 });
    }
    return { filename, size: stat.size };
  } catch (error) {
    if (['ENOENT','EACCES','EISDIR'].includes(error.code)) throw missing();
    throw error;
  } finally { await handle?.close(); }
}

// The original is a private read-only deployment file, never a frontend build asset or DB upload.
function campusRouter(db, requireAccount, options = {}) {
  const router = express.Router();
  router.use(requireAccount, (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const model = async (req, res) => {
    const buildingID = campusBuildingID(options);
    if (!buildingID) {
      res.status(503).json({error:'Das D21-Campusmodell ist auf dem Projektserver nicht konfiguriert.'}); return null;
    }
    const configuredBuilding = (await db.query('SELECT id FROM app_buildings WHERE id=$1', [buildingID])).rows[0];
    if (!configuredBuilding) {
      res.status(503).json({error:'Die D21-Gebäudezuordnung ist auf dem Projektserver nicht eingerichtet.'}); return null;
    }
    const access = await buildingAccess(db, buildingID, req.account.id);
    if (!access) {
      res.status(404).json({error:'Das D21-Campusmodell ist für dieses Konto nicht freigegeben.'}); return null;
    }
    if (!can(access, 'bim', 'read')) { res.status(403).json({error:'Dafür hast du in diesem Gebäude keine Berechtigung.'}); return null; }
    try {
      return { ...await campusModelFile(options), buildingID };
    } catch (error) {
      if (error.status) { res.status(error.status).json({ error: error.message }); return null; }
      throw error;
    }
  };
  router.get('/d21', wrap(async (req, res) => {
    const file = await model(req, res); if (!file) return;
    res.json({ id:'campus-d21', name:'H_DA_D21_Final.ifc', size:file.size, read_only:true, building_id:file.buildingID });
  }));
  router.get('/d21/model', wrap(async (req, res) => {
    const file = await model(req, res); if (!file) return;
    res.set({ 'Content-Type':'application/x-step', 'X-Content-Type-Options':'nosniff', 'Content-Disposition':'attachment; filename="H_DA_D21_Final.ifc"' });
    res.sendFile(file.filename, { lastModified:false, cacheControl:false, dotfiles:'deny' });
  }));
  return router;
}
module.exports = { campusRouter, campusBuildingID, campusModelFile, MAX_MODEL };
