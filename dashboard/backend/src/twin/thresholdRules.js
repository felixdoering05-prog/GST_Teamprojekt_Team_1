// Regelbasierte Grenzwertprüfung – Grundlage der Meldungen.
// Bewusst ohne KI-Modell: Die Prüfung vergleicht Messwerte mit definierten Grenzwerten.

const DEFAULT_THRESHOLDS = {
  temperature: { warning_min: 19, warning_max: 26, critical_min: 16, critical_max: 28 },
  co2: { warning_min: null, warning_max: 1000, critical_min: null, critical_max: 1500 },
  humidity: { warning_min: 30, warning_max: 60, critical_min: 25, critical_max: 70 },
};

const METRIC_META = {
  temperature: { label: 'Temperatur', unit: '°C', decimals: 1 },
  co2: { label: 'CO₂', unit: 'ppm', decimals: 0 },
  humidity: { label: 'Luftfeuchte', unit: '%', decimals: 0 },
};

function formatValue(metricKey, value) {
  const meta = METRIC_META[metricKey] || { unit: '', decimals: 1 };
  if (value === null || value === undefined) return '–';
  const num = Number(value);
  if (Number.isNaN(num)) return '–';
  return `${num.toLocaleString('de-DE', { minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals })} ${meta.unit}`.trim();
}

function mergeThresholds(rows = []) {
  const merged = {};
  Object.keys(DEFAULT_THRESHOLDS).forEach((key) => {
    merged[key] = { ...DEFAULT_THRESHOLDS[key] };
  });
  rows.forEach((row) => {
    if (!row || !row.metric) return;
    merged[row.metric] = {
      warning_min: row.warning_min ?? null,
      warning_max: row.warning_max ?? null,
      critical_min: row.critical_min ?? null,
      critical_max: row.critical_max ?? null,
    };
  });
  return merged;
}

/** Bewertet einen Messwert gegen die Grenzwerte. */
function evaluateValue(metricKey, value, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds[metricKey] || DEFAULT_THRESHOLDS[metricKey];
  const num = Number(value);
  if (value === null || value === undefined || Number.isNaN(num)) return null;
  if (!t) return null;
  const has = (v) => v !== null && v !== undefined;

  if (has(t.critical_max) && num > t.critical_max) {
    return { level: 'critical', threshold: t.critical_max, direction: 'max', message: `${formatValue(metricKey, num)} überschreitet den kritischen Grenzwert von ${formatValue(metricKey, t.critical_max)}` };
  }
  if (has(t.critical_min) && num < t.critical_min) {
    return { level: 'critical', threshold: t.critical_min, direction: 'min', message: `${formatValue(metricKey, num)} unterschreitet den kritischen Grenzwert von ${formatValue(metricKey, t.critical_min)}` };
  }
  if (has(t.warning_max) && num > t.warning_max) {
    return { level: 'warning', threshold: t.warning_max, direction: 'max', message: `${formatValue(metricKey, num)} überschreitet den Grenzwert von ${formatValue(metricKey, t.warning_max)}` };
  }
  if (has(t.warning_min) && num < t.warning_min) {
    return { level: 'warning', threshold: t.warning_min, direction: 'min', message: `${formatValue(metricKey, num)} unterschreitet den Grenzwert von ${formatValue(metricKey, t.warning_min)}` };
  }
  return { level: 'ok', threshold: has(t.warning_max) ? t.warning_max : null, direction: null, message: 'Innerhalb der definierten Grenzwerte' };
}

async function loadMeasurements(base44, since, maxPages = 4) {
  const out = [];
  let cursor;
  let pages = 0;
  let hasMore = true;
  while (hasMore && pages < maxPages) {
    const options = { sort: '-measured_at', limit: 500 };
    if (cursor) options.cursor = cursor;
    const page = await base44.entities.Measurement.filter({ measured_at: { $gte: since } }, options);
    out.push(...(page.items || []));
    hasMore = Boolean(page.has_more);
    cursor = page.next_cursor;
    pages += 1;
  }
  return out;
}

function latestPerSensor(measurements) {
  const latest = {};
  measurements.forEach((m) => {
    if (!m.sensor_id) return;
    const current = latest[m.sensor_id];
    if (!current || new Date(m.measured_at) > new Date(current.measured_at)) latest[m.sensor_id] = m;
  });
  return latest;
}

/**
 * Führt einen Prüflauf aus: erzeugt Meldungen für Grenzwertüberschreitungen
 * und schließt Meldungen, deren Messwert wieder im Sollbereich liegt.
 */
async function runThresholdCheck(base44, options = {}) {
  const sinceHours = options.sinceHours || 4;
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

  const [thresholdRows, sensors, rooms, alertPage] = await Promise.all([
    base44.entities.ThresholdConfig.list('metric'),
    base44.entities.Sensor.list('sensor_code'),
    base44.entities.Room.list('room_code'),
    base44.entities.Alert.filter({ status: { $in: ['offen', 'quittiert'] } }, { limit: 200 }),
  ]);

  const measurements = await loadMeasurements(base44, since);
  const thresholds = mergeThresholds(thresholdRows);
  const latest = latestPerSensor(measurements);

  const sensorById = {};
  sensors.forEach((s) => { sensorById[s.id] = s; });
  const roomById = {};
  rooms.forEach((r) => { roomById[r.id] = r; });

  const activeAlerts = alertPage.items || [];
  const activeKey = {};
  activeAlerts.forEach((a) => { activeKey[`${a.sensor_id}|${a.metric}`] = a; });

  const newAlerts = [];
  const violations = [];
  const okSensorIds = {};

  Object.keys(latest).forEach((sensorId) => {
    const measurement = latest[sensorId];
    const sensor = sensorById[sensorId];
    if (!sensor) return;
    const result = evaluateValue(measurement.metric, measurement.value, thresholds);
    if (!result) return;

    if (result.level === 'ok') {
      okSensorIds[sensorId] = true;
      return;
    }

    const room = roomById[sensor.room_id];
    const roomLabel = room ? `${room.room_code} ${room.name}` : sensor.sensor_code;
    violations.push({
      sensor_id: sensorId,
      sensor_code: sensor.sensor_code,
      room_id: sensor.room_id,
      room_label: roomLabel,
      metric: measurement.metric,
      value: measurement.value,
      level: result.level,
      threshold: result.threshold,
      message: result.message,
    });

    if (activeKey[`${sensorId}|${measurement.metric}`]) return;

    newAlerts.push({
      title: `${METRIC_META[measurement.metric]?.label || measurement.metric} ${result.level === 'critical' ? 'kritisch' : 'außerhalb des Sollbereichs'}`,
      message: `${roomLabel}: ${result.message}`,
      severity: result.level,
      metric: measurement.metric,
      value: measurement.value,
      threshold: result.threshold,
      room_id: sensor.room_id,
      room_label: roomLabel,
      sensor_id: sensorId,
      sensor_code: sensor.sensor_code,
      building_id: sensor.building_id || null,
      triggered_at: measurement.measured_at,
      status: 'offen',
      detection: 'regelbasiert',
      source: measurement.source || 'demo',
    });
  });

  if (newAlerts.length) await base44.entities.Alert.bulkCreate(newAlerts);

  // Meldungen schließen, wenn der Messwert wieder im Sollbereich liegt
  const toResolve = activeAlerts.filter((a) => okSensorIds[a.sensor_id]);
  if (toResolve.length) {
    await base44.entities.Alert.bulkUpdate(
      toResolve.map((a) => ({
        id: a.id,
        status: 'erledigt',
        resolution_note: 'Grenzwert im letzten Prüflauf wieder eingehalten (regelbasierte Prüfung).',
      })),
    );
  }

  return {
    checkedSensors: Object.keys(latest).length,
    sensorsTotal: sensors.length,
    violations,
    created: newAlerts.length,
    resolved: toResolve.length,
    windowHours: sinceHours,
  };
}
module.exports={DEFAULT_THRESHOLDS,METRIC_META,formatValue,mergeThresholds,evaluateValue,runThresholdCheck};
