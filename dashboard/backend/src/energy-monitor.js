const express = require('express');
const { METRICS } = require('./ha-import');
const { can } = require('./team-permissions');

const role = (family, label, metric, counter = false) => ({ family, label, metric, counter });
const ROLES = {
  load: role('strom', 'Gebäudelast', 'power'),
  solar: role('strom', 'PV-Leistung', 'power'),
  grid: role('strom', 'Netzleistung', 'power'),
  ev: role('strom', 'Ladestation', 'power'),
  load_total: role('strom', 'Stromverbrauch · Zähler', 'energy', true),
  solar_total: role('strom', 'PV-Ertrag · Zähler', 'energy', true),
  import_total: role('strom', 'Netzbezug · Zähler', 'energy', true),
  export_total: role('strom', 'Einspeisung · Zähler', 'energy', true),
  solar_forecast: role('strom', 'PV-Prognose für heute', 'energy'),
  battery: role('strom', 'Speicher · Ladezustand', 'battery'),
  battery_health: role('strom', 'Speicher · Batteriezustand', 'battery'),
  battery_power: role('strom', 'Speicherleistung', 'power'),
  battery_temperature: role('strom', 'Speichertemperatur', 'temperature'),
  outdoor_temperature: role('strom', 'Außentemperatur', 'temperature'),
  irradiance: role('strom', 'Sonneneinstrahlung', 'irradiance'),
  water_total: role('wasser', 'Wasserverbrauch · Zähler', 'water', true),
  water_flow: role('wasser', 'Wasserdurchfluss', 'water_flow'),
  tank: role('wasser', 'Wasserspeicher · Inhalt', 'volume_storage'),
};

const NUMBER_FIELDS = {
  battery_capacity: 1e6, battery_reserve: 100, emergency_load: 1e7,
  tank_capacity: 1e6, standard_rate: 1e6, export_rate: 1e6, water_rate: 1e6, reduced_rate: 1e6,
};
const TIME_FIELDS = ['reduced_from', 'reduced_to'];
const FLAGS = ['invert_battery', 'invert_grid'];
const SETTINGS_FIELDS = ['meters', 'modules', ...Object.keys(NUMBER_FIELDS), ...TIME_FIELDS, ...FLAGS];
const FRESH_MS = 3600000;
const SUPPORTED_METRICS = [...new Set(Object.values(ROLES).map(({ metric }) => metric))];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

async function initEnergyMonitor(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_energy_monitor (
    building_id INTEGER PRIMARY KEY REFERENCES app_buildings(id) ON DELETE CASCADE,
    settings JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1
  )`);
}

async function readSettings(db, buildingID) {
  const row = (await db.query('SELECT settings,revision FROM app_energy_monitor WHERE building_id=$1', [buildingID])).rows[0];
  return { settings: { meters: {}, modules: [], ...row?.settings }, revision: row?.revision || 0 };
}

async function sensorCatalog(db, buildingID, now) {
  return (await db.query(`SELECT e.link_id,e.entity_id,e.name,e.metric,p.value,p.measured_at
    FROM app_ha_links l
    JOIN app_ha_entities e ON e.link_id=l.id AND e.selected
    LEFT JOIN LATERAL (
      SELECT value,measured_at FROM app_ha_samples
        WHERE link_id=e.link_id AND entity_id=e.entity_id AND metric=e.metric AND measured_at <= $3
        ORDER BY measured_at DESC LIMIT 1
    ) p ON true
    WHERE l.building_id=$1 AND l.status='active' AND e.metric=ANY($2::text[])
    ORDER BY e.name,e.entity_id`, [buildingID, SUPPORTED_METRICS, now])).rows;
}

function validateSettings(input, catalog, previous) {
  if (!object(input) || Object.keys(input).some((key) => !SETTINGS_FIELDS.includes(key)) ||
      !object(input.meters) || !Array.isArray(input.modules) || input.modules.length > 64)
    fail('Ungültige Energie-Einstellungen.');
  const byID = new Map(catalog.map((sensor) => [sensor.entity_id, sensor.metric]));
  const meters = {};
  for (const [key, id] of Object.entries(input.meters)) {
    if (!Object.hasOwn(ROLES, key) || typeof id !== 'string' || !/^sensor\.[a-z0-9_]{1,200}$/.test(id) ||
        (byID.get(id) !== ROLES[key].metric && previous.meters[key] !== id))
      fail('Bitte für jede Messgröße einen passenden ausgewählten Sensor verwenden.');
    meters[key] = id;
  }
  const seen = new Set();
  const modules = input.modules.map((module) => {
    if (!object(module) || Object.keys(module).some((key) => !['entity_id', 'group'].includes(key)) ||
        typeof module.entity_id !== 'string' || !/^sensor\.[a-z0-9_]{1,200}$/.test(module.entity_id) ||
        typeof module.group !== 'string' || !module.group.trim() || module.group.trim().length > 48 ||
        seen.has(module.entity_id) ||
        (byID.get(module.entity_id) !== 'power' && !previous.modules.some((item) => item.entity_id === module.entity_id)))
      fail('Bitte pro PV-Modul einen eindeutigen Leistungssensor und einen String angeben.');
    seen.add(module.entity_id);
    return { entity_id: module.entity_id, group: module.group.trim() };
  });
  const settings = { meters, modules };
  for (const [key, max] of Object.entries(NUMBER_FIELDS)) {
    const value = input[key] ?? null;
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) fail('Kapazitäten, Reserve und Preise prüfen.');
    settings[key] = value;
  }
  for (const key of TIME_FIELDS) {
    const value = input[key] || '';
    if (typeof value !== 'string' || (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) fail('Tarifzeit im Format HH:MM angeben.');
    settings[key] = value;
  }
  if (settings.reduced_rate !== null && (!settings.reduced_from || !settings.reduced_to || settings.reduced_from === settings.reduced_to))
    fail('Für den günstigeren Tarif zwei verschiedene Uhrzeiten angeben.');
  for (const key of FLAGS) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') fail('Vorzeichen der Leistung prüfen.');
    settings[key] = input[key] === true;
  }
  return settings;
}

const shortSensor = (sensor) => ({ entity_id: sensor.entity_id, name: sensor.name, metric: sensor.metric, unit: METRICS[sensor.metric].unit });
function measuredSensor(sensor, now, factor = 1) {
  return {
    ...shortSensor(sensor),
    latest: sensor.measured_at ? {
      value: factor * sensor.value, time: new Date(sensor.measured_at).toISOString(),
      stale: now - new Date(sensor.measured_at) > FRESH_MS,
    } : null,
  };
}

async function readHistory(db, link, todayIDs, counterIDs, now) {
  const [intervals, daily] = await Promise.all([
    todayIDs.length ? db.query(`SELECT s.entity_id,date_bin('30 minutes', s.measured_at, TIMESTAMPTZ '1970-01-01 00:00:00+00') AS time,
      AVG(s.value) AS value,MAX(s.value) AS high,MIN(s.value) AS low
      FROM app_ha_samples s JOIN app_ha_entities e USING (link_id,entity_id,metric)
      WHERE s.link_id=$1 AND s.entity_id=ANY($2::text[]) AND e.selected AND s.measured_at <= $3
        AND s.measured_at >= (date_trunc('day',$3::timestamptz AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')
      GROUP BY s.entity_id,time ORDER BY time`, [link, todayIDs, now]) : { rows: [] },
    counterIDs.length ? db.query(`WITH points AS (
      SELECT s.entity_id,s.measured_at,s.value-LAG(s.value) OVER (PARTITION BY s.entity_id ORDER BY s.measured_at) AS delta
      FROM app_ha_samples s JOIN app_ha_entities e USING (link_id,entity_id,metric)
      WHERE s.link_id=$1 AND s.entity_id=ANY($2::text[]) AND e.selected
        AND s.measured_at BETWEEN $3::timestamptz-interval '31 days' AND $3::timestamptz
    )
    SELECT entity_id,to_char(measured_at AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD') AS day,SUM(delta) AS value
    FROM points WHERE delta >= 0
      AND (measured_at AT TIME ZONE 'Europe/Berlin')::date >= ($3::timestamptz AT TIME ZONE 'Europe/Berlin')::date - 30
    GROUP BY entity_id,day ORDER BY day`, [link, counterIDs, now]) : { rows: [] },
  ]);
  const index = (items) => {
    const map = new Map();
    for (const { entity_id, ...item } of items.rows) {
      if (!map.has(entity_id)) map.set(entity_id, []);
      map.get(entity_id).push(item);
    }
    return map;
  };
  return { intervals: index(intervals), daily: index(daily) };
}

async function liveEnergy(db, buildingID, family, now = new Date()) {
  const [{ settings }, catalog] = await Promise.all([readSettings(db, buildingID), sensorCatalog(db, buildingID, now)]);
  const byID = new Map(catalog.map((item) => [item.entity_id, item]));
  const supported = Object.values(ROLES).filter((item) => item.family === family && item.metric !== 'temperature').map((item) => item.metric);
  const roles = Object.entries(ROLES).filter(([key, item]) => item.family === family && byID.get(settings.meters[key])?.metric === item.metric);
  const modules = family === 'strom' ? settings.modules.filter((item) => byID.get(item.entity_id)?.metric === 'power') : [];
  const todayIDs = [...new Set([...roles.filter(([, item]) => !item.counter).map(([key]) => settings.meters[key]), ...modules.map((item) => item.entity_id)])];
  const counterIDs = [...new Set(roles.filter(([, item]) => item.counter).map(([key]) => settings.meters[key]))];
  const { intervals, daily } = await readHistory(db, catalog[0]?.link_id, todayIDs, counterIDs, now);
  const series = (id, factor = 1) => {
    const points = intervals.get(id) || [];
    return {
      ...measuredSensor(byID.get(id), now, factor),
      points: points.map((item) => ({ time: new Date(item.time).toISOString(), value: factor * Number(item.value) })),
      peak: points.length ? Math.max(...points.map((item) => factor === 1 ? Number(item.high) : -Number(item.low))) : null,
      days: (daily.get(id) || []).map((item) => ({ day: item.day, value: Number(item.value) })),
    };
  };
  const { meters, modules: _modules, ...parameters } = settings;
  return {
    now: now.toISOString(),
    settings: parameters,
    channels: Object.fromEntries(roles.map(([key, item]) => [
      key, { ...series(meters[key], (key === 'battery_power' && settings.invert_battery || key === 'grid' && settings.invert_grid) ? -1 : 1), label: item.label },
    ])),
    modules: modules.map((item) => ({ ...series(item.entity_id), group: item.group })),
    sensors: catalog.filter((item) => supported.includes(item.metric)).map((item) => measuredSensor(item, now)),
  };
}

function energyMonitorRouter(db) {
  const r = express.Router();
  const base = '/buildings/:energyMonitorBuilding/energy';
  r.param('energyMonitorBuilding', (req, res, next, id) => {
    if (!/^\d+$/.test(id) || !req.buildingAccess) return res.status(404).json({ error: 'Gebäude nicht gefunden.' });
    next();
  });
  r.get(base + '/live', wrap(async (req, res) => {
    const family = req.query.medium;
    if (!['strom', 'wasser'].includes(family)) fail('Strom oder Wasser auswählen.');
    res.set('Cache-Control', 'private, no-store').json(await liveEnergy(db, req.buildingAccess.building_id, family));
  }));
  r.get(base + '/settings', wrap(async (req, res) => {
    if (!can(req.buildingAccess, 'energy', 'edit')) fail('Dafür hast du in diesem Gebäude keine Berechtigung.', 403);
    const id = req.buildingAccess.building_id;
    const [data, sensors] = await Promise.all([readSettings(db, id), sensorCatalog(db, id, new Date())]);
    res.set('Cache-Control', 'private, no-store').json({ ...data, sensors: sensors.map(shortSensor), roles: ROLES });
  }));
  r.put(base + '/settings', wrap(async (req, res) => {
    const id = req.buildingAccess.building_id;
    const [data, sensors] = await Promise.all([readSettings(db, id), sensorCatalog(db, id, new Date())]);
    if (req.body?.revision !== data.revision) fail('Einstellungen wurden inzwischen geändert. Bitte neu laden.', 409);
    const settings = validateSettings(req.body.settings, sensors, data.settings);
    const result = await db.query(`INSERT INTO app_energy_monitor(building_id,settings) VALUES($1,$2)
      ON CONFLICT(building_id) DO UPDATE SET settings=EXCLUDED.settings,revision=app_energy_monitor.revision+1
      WHERE app_energy_monitor.revision=$3 RETURNING revision`, [id, JSON.stringify(settings), data.revision]);
    if (!result.rows.length) fail('Einstellungen wurden inzwischen geändert. Bitte neu laden.', 409);
    res.set('Cache-Control', 'private, no-store').json({ settings, revision: result.rows[0].revision });
  }));
  r.use((error, _req, res, next) => error.status ? res.status(error.status).json({ error: error.message }) : next(error));
  return r;
}

module.exports = { initEnergyMonitor, energyMonitorRouter };
