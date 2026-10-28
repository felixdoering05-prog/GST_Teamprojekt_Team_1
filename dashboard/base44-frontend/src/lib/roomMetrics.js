import { METRIC_KEYS, evaluateValue, worstLevel } from '@/lib/metrics';
import { formatTime } from '@/lib/dates';

/** Aktuelle Messwerte eines Raums je Messgröße, inklusive Bewertung. */
export function readingsForRoom(room, sensors, latest, thresholds) {
  const out = {};
  METRIC_KEYS.forEach((key) => {
    const sensor = sensors.find((s) => s.room_id === room.id && s.metric === key) || null;
    const measurement = sensor ? latest[sensor.id] || null : null;
    const value = measurement ? measurement.value : null;
    const evaluation =
      value === null ? { level: 'unknown', reason: 'Kein Messwert vorhanden' } : evaluateValue(key, value, thresholds);
    out[key] = { value, level: evaluation.level, reason: evaluation.reason, sensor, measurement };
  });
  return out;
}

export function statusFromReadings(readings) {
  return worstLevel(Object.values(readings).map((r) => r.level));
}

export function statusForRoom(room, sensors, latest, thresholds) {
  return statusFromReadings(readingsForRoom(room, sensors, latest, thresholds));
}

export function readingsCount(room, sensors, latest) {
  return sensors.filter((s) => s.room_id === room.id).length;
}

/** Messwerte je Stunde gruppiert (Gebäudemittel je Messgröße). */
export function seriesByHour(series, metrics = METRIC_KEYS) {
  const buckets = new Map();
  series.forEach((m) => {
    if (!metrics.includes(m.metric)) return;
    const d = new Date(m.measured_at);
    if (Number.isNaN(d.getTime())) return;
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    if (!buckets.has(key)) buckets.set(key, { t: key, sums: {}, counts: {} });
    const bucket = buckets.get(key);
    bucket.sums[m.metric] = (bucket.sums[m.metric] || 0) + Number(m.value);
    bucket.counts[m.metric] = (bucket.counts[m.metric] || 0) + 1;
  });
  return [...buckets.values()]
    .sort((a, b) => new Date(a.t) - new Date(b.t))
    .map((bucket) => {
      const row = { t: bucket.t, label: formatTime(bucket.t) };
      METRIC_KEYS.forEach((key) => {
        row[key] = bucket.counts[key] ? Math.round((bucket.sums[key] / bucket.counts[key]) * 10) / 10 : null;
      });
      return row;
    });
}

/** Messreihe eines Raums für eine Messgröße, aufsteigend sortiert. */
export function roomSeries(room, sensors, series, metricKey) {
  const ids = sensors.filter((s) => s.room_id === room.id && s.metric === metricKey).map((s) => s.id);
  return series
    .filter((m) => ids.includes(m.sensor_id))
    .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
}
