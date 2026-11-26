const { buildingAccess, can } = require('./team-permissions');
const { DAY, MEDIUMS, dayOf, uniqueReadings, unitKey } = require('./energy-records');
const { reference } = require('./passport-energy-demo');

const GROUP_MEDIA = {
  strom: ['strom', 'netzbezug', 'pv_erzeugung', 'eigenverbrauch', 'einspeisung'],
  wasser: ['wasser', 'kaltwasser', 'warmwasser'],
};

const monthStart = (year, month) => new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
const previousDay = (day) => new Date(Date.parse(day) - DAY).toISOString().slice(0, 10);
const amount = (rows, field) => {
  const values = rows.map((row) => row[field]).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};
const readingDay = (row) => dayOf(row.period_end || row.period_start || row.reading_date);
const between = (day, range) => day && (!range || (day >= range.from && day <= range.to));

function periodRanges(months, endMonth) {
  if (months === 'all') return { current: null, previous: null };
  const [year, month] = endMonth.split('-').map(Number);
  const from = monthStart(year, month - Number(months));
  return {
    current: { from, to: previousDay(monthStart(year, month)) },
    previous: { from: monthStart(year, month - 2 * Number(months)), to: previousDay(from) },
  };
}

function totalsRows(rows) {
  const main = new Map();
  const scope = (row) => JSON.stringify([row.building_id, row.medium, row.unit, row.source]);
  for (const row of rows) {
    if (row.meter_level !== 'main') continue;
    const key = scope(row);
    if (!main.has(key)) main.set(key, []);
    main.get(key).push(row);
  }
  return rows.filter((row) => {
    if (row.meter_level !== 'sub') return true;
    const end = readingDay(row);
    const start = dayOf(row.period_start) || end;
    return !main.get(scope(row))?.some((parent) =>
      (dayOf(parent.period_start) || readingDay(parent)) <= end && readingDay(parent) >= start);
  });
}

function monthlySeries(rows) {
  const points = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    const month = readingDay(row).slice(0, 7);
    points.set(month, (points.get(month) || 0) + row.value);
  }
  const sorted = [...points.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!sorted.length) return [];
  const [first] = sorted[0], [last] = sorted.at(-1);
  const [year, month] = first.split('-').map(Number);
  const [lastYear, lastMonth] = last.split('-').map(Number);
  const span = (lastYear - year) * 12 + lastMonth - month;
  if (span > 240) return sorted.map(([month, value]) => ({ month, value }));
  return Array.from({ length: span + 1 }, (_, i) => {
    const monthKey = monthStart(year, month - 1 + i).slice(0, 7);
    return { month: monthKey, value: points.get(monthKey) ?? null };
  });
}

function summarize(medium, rows, previous) {
  const [label, defaultUnit] = MEDIUMS[medium];
  const units = [...new Set([defaultUnit, ...rows.map((row) => row.unit), ...previous.map((row) => row.unit)])];
  const series = units.map((unit) => {
    const currentRows = totalsRows(rows.filter((row) => row.unit === unit));
    const priorRows = totalsRows(previous.filter((row) => row.unit === unit));
    return { unit, current: amount(currentRows, 'value'), previous: amount(priorRows, 'value'), points: monthlySeries(currentRows) };
  });
  const meterKey = (row) => JSON.stringify([row.building_id, unitKey(row), row.meter_code, row.unit]);
  const meters = new Map();
  for (const row of rows) if (row.meter_code && !meters.has(meterKey(row))) meters.set(meterKey(row), row);
  return { medium, label, series, cost_eur: amount(totalsRows(rows), 'cost_eur'),
    meter_count: meters.size, latest: rows[0] || null, meters: [...meters.values()] };
}

function overview(readings, filters) {
  const group = filters.group ? GROUP_MEDIA[filters.group] : null;
  const buildingsMatch = (row) => !filters.building || (filters.building === 'unassigned' ? !row.building_id : row.building_id === filters.building);
  const available = readings.filter(buildingsMatch);
  const source = filters.source || (available.length && available.every((row) => row.source === 'demo') ? 'demo' : 'real');
  const ranges = periodRanges(filters.months, filters.end);
  const sourceReadings = uniqueReadings(readings.filter((row) => row.source === source));
  const buildingRows = sourceReadings.filter(buildingsMatch);
  const usageUnits = new Map();
  for (const row of buildingRows) {
    if (unitKey(row)) usageUnits.set(unitKey(row), row.unit_name || row.unit_id);
  }
  const matchesUnit = (row) => !filters.unit || unitKey(row) === filters.unit;
  const scoped = buildingRows.filter(matchesUnit);
  const current = scoped.filter((row) => between(readingDay(row), ranges.current))
    .sort((a, b) => (dayOf(b.reading_date) || readingDay(b)).localeCompare(dayOf(a.reading_date) || readingDay(a)) || b.id.localeCompare(a.id));
  const previous = ranges.previous ? scoped.filter((row) => between(readingDay(row), ranges.previous)) : [];
  const dataMedia = new Set(buildingRows.map((row) => row.medium));
  const media = Object.keys(MEDIUMS).filter((medium, index) => index < 4 || dataMedia.has(medium) || filters.medium === medium);
  const summaryMedia = group || (filters.medium ? [filters.medium] : media);
  const summaries = summaryMedia.map((medium) => summarize(medium, current.filter((r) => r.medium === medium),
    previous.filter((r) => r.medium === medium)));
  const historyMedia = filters.medium ? [filters.medium] : group;
  const rows = historyMedia ? current.filter((row) => historyMedia.includes(row.medium)) : current;
  const showReference = filters.reference && source === 'demo' && !filters.unit && !historyMedia &&
    between(periodRanges('1', reference.reference_month).current.to, ranges.current);
  return {
    source, ranges, media, summaries: historyMedia ? summaries : summaries.map(({ meters, ...rest }) => rest),
    units: [...usageUnits].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    readings: rows.slice(filters.offset, filters.offset + 50), reading_count: rows.length,
    reference: showReference ? {
      month: reference.reference_month, version: reference.reference_version, metrics: reference.metrics, hints: reference.hints,
    } : null,
    has_unassigned: sourceReadings.some((row) => !row.building_id),
  };
}

async function getPassportEnergy(db, req, res) {
  const filters = {
    building: req.query.building || '', unit: req.query.unit || '', medium: req.query.medium || '',
    group: req.query.group || '',
    months: req.query.months || '12', end: req.query.end || dayOf(new Date().toISOString()).slice(0, 7),
    source: req.query.source || '', offset: Number(req.query.offset || 0),
  };
  if (![filters.building, filters.unit, filters.medium, filters.group, filters.end].every((value) => typeof value === 'string') ||
      (filters.building && filters.building !== 'unassigned' && !/^[1-9]\d{0,9}$/.test(filters.building)) ||
      (filters.medium && !Object.hasOwn(MEDIUMS, filters.medium)) ||
      (filters.group && (!Object.hasOwn(GROUP_MEDIA, filters.group) || (filters.medium && !GROUP_MEDIA[filters.group].includes(filters.medium)))) ||
      !['1', '3', '12', 'all'].includes(filters.months) ||
      !/^(19\d{2}|2\d{3})-(0[1-9]|1[0-2])$/.test(filters.end) || !['', 'real', 'demo'].includes(filters.source) ||
      !Number.isSafeInteger(filters.offset) || filters.offset < 0) {
    return res.status(400).json({ error: 'Ungültiger Verbrauchsfilter.' });
  }
  const userID = req.account.id;
  const teamIDs = req.teamScope?.buildingIDs;
  const candidates = (await db.query(`SELECT b.id,b.name,b.twin_data->>'code' AS code FROM app_buildings b WHERE (b.user_id=$1 OR EXISTS (
    SELECT 1 FROM app_building_members m WHERE m.building_id=b.id AND m.user_id=$1 AND m.status='accepted'
  )) AND ($2::int[] IS NULL OR b.id=ANY($2::int[])) ORDER BY b.name,b.id`, [userID, teamIDs || null])).rows;
  const buildings = [];
  for (const row of candidates) {
    const access = await buildingAccess(db, row.id, userID);
    if (can(access, 'energy', 'read')) buildings.push({ id: String(row.id), name: row.name, can_edit: can(access, 'energy', 'edit') });
  }
  if (filters.building && filters.building !== 'unassigned' && !buildings.some((row) => row.id === filters.building)) {
    return res.status(404).json({ error: 'Gebäude nicht gefunden oder Energiedaten nicht freigegeben.' });
  }
  filters.reference = candidates.some((row) => String(row.id) === filters.building && row.code === reference.building.code);
  const includeUnassigned = !req.teamScope || (!req.teamScope.hasBuildingFilter && req.teamScope.is_owner && req.teamScope.is_default);
  const records = (await db.query(`SELECT id,data FROM app_twin_records WHERE entity='EnergyReading' AND (
    data->>'building_id'=ANY($1::text[]) OR ($2::boolean AND user_id=$3 AND data->>'building_id' IS NULL)
  ) ORDER BY created_at,id`, [buildings.map((row) => row.id), includeUnassigned, userID])).rows;
  const data = records.map((row) => ({ ...row.data, id: row.id }));
  if (filters.reference && !req.query.end && (filters.source === 'demo' || (!filters.source &&
      !data.some((row) => row.building_id === filters.building && row.source === 'real')))) filters.end = reference.reference_month;
  return res.json({ ...overview(data, filters), buildings, end: filters.end });
}

module.exports = { getPassportEnergy, overview, periodRanges };
