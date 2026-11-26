import { evaluateValue, metric } from './metrics.js';
import { resolveBuildingRoom } from './roomLocation.js';

const day = 24 * 60 * 60 * 1000;

export function readingStatus(reading, now = Date.now()) {
  if (!Number.isFinite(reading?.value)) return 'missing';
  const time = Date.parse(reading.measured_at);
  if (!Number.isFinite(time) || time > now + 5 * 60 * 1000) return 'unknown-time';
  return now - time > day ? 'stale' : 'current';
}

export function alertReading(alert) {
  return {
    value: alert.value,
    unit: alert.unit || metric(alert.metric).unit,
    source: alert.source,
    sensor_code: alert.sensor_code,
    measured_at: alert.triggered_at,
  };
}

export function roomAnomalies(structure, telemetry, alerts, now = Date.now()) {
  const rooms = new Map((structure?.rooms ?? []).map(room => [room.id, room]));
  const measured = new Map((telemetry?.rooms ?? []).map(room => [room.id, room]));
  for (const room of measured.values()) rooms.set(room.id, { ...rooms.get(room.id), ...room });
  const floors = new Map([...(structure?.floors ?? []), ...(telemetry?.floors ?? [])].map(floor => [floor.id, floor]));
  const findings = new Map();
  function add(room, item) {
    if (!findings.has(room.id)) findings.set(room.id, { room, floor: floors.get(room.floor_id), reasons: [] });
    findings.get(room.id).reasons.push(item);
  }

  for (const alert of alerts) {
    if (!['offen', 'quittiert'].includes(alert.status)) continue;
    const room = resolveBuildingRoom({ rooms: [...rooms.values()], floors: [...floors.values()] },
      { roomID: alert.room_id, label: alert.room_label });
    if (!room) continue;
    add(room, { key: alert.id, reason: alert.message || alert.title || 'Aktive Sensorwarnung',
      metric: alert.metric, reading: alertReading(alert), sampleLabel: 'Messwert der Warnung' });
  }

  for (const room of measured.values()) {
    const reading = room.reading;
    if (readingStatus(reading, now) !== 'current' || !telemetry.thresholds?.temperature) continue;
    const alreadyReported = findings.get(room.id)?.reasons.some(item => item.metric === 'temperature'
      && item.reading.value === reading.value && Date.parse(item.reading.measured_at) === Date.parse(reading.measured_at));
    if (alreadyReported) continue;
    const result = evaluateValue('temperature', reading.value, telemetry.thresholds);
    if (['warning', 'critical'].includes(result.level)) {
      add(room, { key: 'temperature', reason: result.reason, reading, sampleLabel: 'Letzter Temperaturmesswert' });
    }
  }
  return [...findings.values()].sort((a, b) => (a.room.room_code || a.room.name).localeCompare(b.room.room_code || b.room.name, 'de', { numeric: true }));
}
