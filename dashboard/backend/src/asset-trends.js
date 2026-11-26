const { dayOf } = require('./energy-records');

const DAY = 86400000;
const isoDay = time => new Date(time).toISOString().slice(0, 10);
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayOf(value) === value && value >= '1900-01-01';
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const ids = rows => rows.map(row => row.id);
const mean = values => values.length ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length * 10) / 10 : null;

function periods({ from, to, asset_id: assetID } = {}, now) {
  const asOf = isoDay(now);
  if (!validDay(from) || !validDay(to) || from > to || to > asOf || Date.parse(to) - Date.parse(from) >= 366 * DAY) {
    throw failure('Wähle einen Zeitraum bis heute mit höchstens 366 Tagen.');
  }
  if (assetID != null && ((typeof assetID !== 'string' && typeof assetID !== 'number') || !/^[1-9]\d{0,9}$/.test(String(assetID)) || Number(assetID) > 2147483647)) {
    throw failure('Ungültige Anlage.');
  }
  const start = Date.parse(from);
  const end = Date.parse(to) + DAY;
  const previousStart = start - (end - start);
  return {
    assetID: assetID == null ? null : Number(assetID), asOf, from, to,
    previousFrom: isoDay(previousStart), previousTo: isoDay(start - DAY), end: isoDay(end),
  };
}

function faults(rows, period, prefix) {
  const observed = rows.filter(row => row[`${prefix}_observed`]);
  return {
    period,
    count: observed.length ? observed.reduce((sum, row) => sum + Number(row[`${prefix}_faults`]), 0) : null,
    asset_ids: ids(observed),
    complete: observed.length > 0 && rows.every(row => row[`${prefix}_covered`]),
  };
}

async function assetTrendContext(db, building, filter, now = new Date()) {
  const { assetID, asOf, from, to, previousFrom, previousTo, end } = periods(filter, now);
  const rows = (await db.query(`SELECT a.id,a.name,h.*,
    m.tasks,m.dated,m.overdue FROM app_technical_assets a
    CROSS JOIN LATERAL (
      SELECT MIN(observed_at)<$5::timestamptz AS current_observed, MIN(observed_at)<=$4::timestamptz AS current_covered,
        MIN(observed_at)<$4::timestamptz AS previous_observed, MIN(observed_at)<=$3::timestamptz AS previous_covered,
        COUNT(*) FILTER (WHERE entered_fault AND observed_at >= $4::timestamptz AND observed_at < $5::timestamptz) AS current_faults,
        COUNT(*) FILTER (WHERE entered_fault AND observed_at >= $3::timestamptz AND observed_at < $4::timestamptz) AS previous_faults,
        (ARRAY_AGG(data_quality ORDER BY observed_at DESC,revision DESC) FILTER (WHERE observed_at <= $4::timestamptz))[1] AS quality_start,
        (ARRAY_AGG(data_quality ORDER BY observed_at DESC,revision DESC) FILTER (WHERE observed_at < $5::timestamptz))[1] AS quality_end
      FROM app_technical_asset_observations WHERE asset_id=a.id AND observed_at < $5::timestamptz
    ) h CROSS JOIN LATERAL (
      SELECT COUNT(*) AS tasks,
        COUNT(*) FILTER (WHERE work_status<>'completed' AND next_due IS NOT NULL) AS dated,
        COUNT(*) FILTER (WHERE work_status<>'completed' AND next_due<$6::date) AS overdue
      FROM app_maintenance WHERE building_id=a.building_id AND asset_id=a.id
    ) m WHERE a.building_id=$1 AND ($2::int IS NULL OR a.id=$2) ORDER BY lower(a.name),a.id`,
  [building.id, assetID, previousFrom + 'T00:00:00Z', from + 'T00:00:00Z', end + 'T00:00:00Z', asOf])).rows;
  if (assetID !== null && !rows.length) throw failure('Anlage nicht in diesem Gebäude gefunden.', 404);
  const period = { from, to };
  const quality = rows.filter(row => row.quality_end != null);
  const comparable = quality.filter(row => row.quality_start != null);
  const tasks = rows.reduce((sum, row) => sum + Number(row.tasks), 0);
  return {
    building: { id: building.id, name: building.name },
    assets: rows.map(({ id, name }) => ({ id, name })),
    faults: {
      current: faults(rows, period, 'current'),
      previous: faults(rows, { from: previousFrom, to: previousTo }, 'previous'),
    },
    quality: {
      period, average_percent: mean(quality.map(row => row.quality_end)), asset_ids: ids(quality),
      change_percentage_points: mean(comparable.map(row => row.quality_end - row.quality_start)), comparable_asset_ids: ids(comparable),
    },
    overdue: {
      as_of: asOf, count: tasks ? rows.reduce((sum, row) => sum + Number(row.overdue), 0) : null,
      recorded_tasks: tasks, dated_open_tasks: rows.reduce((sum, row) => sum + Number(row.dated), 0),
      asset_ids: ids(rows.filter(row => Number(row.tasks) > 0)), historical_available: false,
    },
  };
}

module.exports = { assetTrendContext };
