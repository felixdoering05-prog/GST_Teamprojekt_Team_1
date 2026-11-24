const express = require('express');
const { widgetCatalog } = require('./widget-catalog');

const columns = 'presentation_mode, theme, font_scale, dashboard_layout, language, revision';
const defaults = { presentation_mode: false, theme: 'system', font_scale: 100, dashboard_layout: null, language: null, revision: 0 };
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const responseFor = (req, value) => req.query.view === 'appearance' ? value
  : { presentation_mode: value.presentation_mode, revision: value.revision };

async function initUIPreferences(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_ui_preferences(
    user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    presentation_mode BOOLEAN NOT NULL DEFAULT false, revision INTEGER NOT NULL DEFAULT 1)`);
  await db.query(`ALTER TABLE app_ui_preferences
    ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
    ADD COLUMN IF NOT EXISTS font_scale INTEGER NOT NULL DEFAULT 100 CHECK (font_scale IN (90,100,115,130)),
    ADD COLUMN IF NOT EXISTS dashboard_layout JSONB,
    ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('de','en'))`);
}

function validLayout(layout) {
  if (layout === null) return true;
  if (!Array.isArray(layout) || layout.length > widgetCatalog.length) return false;
  const ids = new Set();
  for (const widget of layout) {
    if (!widget || typeof widget !== 'object' || Object.keys(widget).some(key => !['id', 'size', 'filter', 'building_id'].includes(key))
      || !widgetCatalog.includes(widget.id) || ids.has(widget.id)
      || !['small', 'medium', 'wide'].includes(widget.size)
      || (widget.id === 'issues' ? !['all', 'open', 'done'].includes(widget.filter) : widget.filter !== undefined)
      || (widget.building_id !== undefined && (widget.id !== 'model' || !Number.isInteger(widget.building_id)
        || widget.building_id < 1 || widget.building_id > 2147483647))) return false;
    ids.add(widget.id);
  }
  return true;
}

const validators = {
  presentation_mode: value => typeof value === 'boolean',
  theme: value => ['light', 'dark', 'system'].includes(value),
  font_scale: value => [90, 100, 115, 130].includes(value),
  dashboard_layout: validLayout,
  language: value => ['de', 'en'].includes(value),
};

function uiPreferencesRouter(db, requireAccount) {
  const router = express.Router();
  router.use('/profile/ui', requireAccount, (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  router.get('/profile/ui', wrap(async (req, res) => {
    const result = await db.query(`SELECT ${columns} FROM app_ui_preferences WHERE user_id=$1`, [req.account.id]);
    res.json(responseFor(req, result.rows[0] || defaults));
  }));
  router.patch('/profile/ui', wrap(async (req, res) => {
    const { revision, ...fields } = req.body || {};
    const entries = Object.entries(fields);
    if (!Number.isInteger(revision) || revision < 0 || !entries.length
      || entries.some(([key, value]) => !Object.hasOwn(validators, key) || !validators[key](value))) {
      return res.status(400).json({ error: 'Ungültige Darstellungseinstellung.' });
    }
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE', [req.account.id]);
      const current = (await client.query(`SELECT ${columns} FROM app_ui_preferences WHERE user_id=$1`, [req.account.id])).rows[0] || defaults;
      if (current.revision !== revision) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Einstellung inzwischen geändert. Bitte neu laden.' });
      }
      const value = { ...current, ...fields };
      const { rows } = await client.query(`INSERT INTO app_ui_preferences(user_id,presentation_mode,theme,font_scale,dashboard_layout,language)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE
        SET presentation_mode=EXCLUDED.presentation_mode, theme=EXCLUDED.theme,
          font_scale=EXCLUDED.font_scale, dashboard_layout=EXCLUDED.dashboard_layout, language=EXCLUDED.language,
          revision=app_ui_preferences.revision+1 RETURNING ${columns}`,
      [req.account.id, value.presentation_mode, value.theme, value.font_scale, JSON.stringify(value.dashboard_layout), value.language]);
      await client.query('COMMIT');
      res.json(responseFor(req, rows[0]));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));
  return router;
}

module.exports = { initUIPreferences, uiPreferencesRouter };
