const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { accessibleBuilding } = require('./collaboration');
const MAX_MODEL = 20 * 1024 * 1024;
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// The original is a private read-only deployment file, never a frontend build asset or DB upload.
function campusRouter(db, requireAccount, options = {}) {
  const router = express.Router();
  router.use(requireAccount, (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const model = async (req, res) => {
    const buildingID = String(options.buildingID ?? process.env.D21_CAMPUS_BUILDING_ID ?? '');
    if (!/^[1-9]\d*$/.test(buildingID) || Number(buildingID) > 2147483647) {
      res.status(503).json({error:'Das D21-Campusmodell ist auf dem Projektserver nicht konfiguriert.'}); return null;
    }
    const configuredBuilding = (await db.query('SELECT id FROM app_buildings WHERE id=$1', [buildingID])).rows[0];
    if (!configuredBuilding) {
      res.status(503).json({error:'Die D21-Gebäudezuordnung ist auf dem Projektserver nicht eingerichtet.'}); return null;
    }
    if (!await accessibleBuilding(db, buildingID, req.account.id)) {
      res.status(404).json({error:'Das D21-Campusmodell ist für dieses Konto nicht freigegeben.'}); return null;
    }
    const filename = options.file ?? process.env.D21_CAMPUS_MODEL_FILE ?? '/run/d21-models/H_DA_D21_Final.ifc';
    if (!path.isAbsolute(filename)) { res.status(503).json({error:'Das D21-Modell ist auf dem Projektserver noch nicht eingerichtet.'}); return null; }
    let handle;
    try {
      handle = await fs.open(filename, 'r');
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > MAX_MODEL) { res.status(413).json({error:'Das D21-IFC muss eine Datei bis 20 MiB sein.'}); return null; }
      const header = Buffer.alloc(Math.min(4096, stat.size)); await handle.read(header, 0, header.length, 0);
      if (!header.toString('utf8').trimStart().startsWith('ISO-10303-21;') || !header.includes('FILE_SCHEMA')) { res.status(415).json({error:'Die bereitgestellte Datei ist kein unterstütztes IFC-Modell.'}); return null; }
      return { filename, size: stat.size };
    } catch (error) {
      if (['ENOENT','EACCES','EISDIR'].includes(error.code)) { res.status(503).json({error:'Das D21-Modell ist auf dem Projektserver noch nicht eingerichtet.'}); return null; }
      throw error;
    } finally { await handle?.close(); }
  };
  router.get('/d21', wrap(async (req, res) => {
    const file = await model(req, res); if (!file) return;
    res.json({ id:'campus-d21', name:'H_DA_D21_Final.ifc', size:file.size, read_only:true });
  }));
  router.get('/d21/model', wrap(async (req, res) => {
    const file = await model(req, res); if (!file) return;
    res.set({ 'Content-Type':'application/x-step', 'X-Content-Type-Options':'nosniff', 'Content-Disposition':'attachment; filename="H_DA_D21_Final.ifc"' });
    res.sendFile(file.filename, { lastModified:false, cacheControl:false, dotfiles:'deny' });
  }));
  return router;
}
module.exports = { campusRouter, MAX_MODEL };
