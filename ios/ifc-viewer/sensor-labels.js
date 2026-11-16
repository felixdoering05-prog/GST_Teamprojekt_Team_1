import * as THREE from 'three';

// Messwert-Popups über IFC-Räumen (z. B. ESP32 + BME280 im Schlafzimmer). Die Werte kommen vom
// Server über die App; der Viewer zeigt sie nur an. Labels schweben über der Raummitte und bleiben
// auch durch Wände sichtbar.
const UNITS = { temperature: '°C', humidity: '%', co2: 'ppm' };
const DECIMALS = { temperature: 1, humidity: 0, co2: 0 };

/** Accepts only well-formed entries from the native side. */
export function sanitizeRoomSensors(list) {
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const item of list.slice(0, 50)) {
    if (!Number.isInteger(item?.space_id) || item.space_id <= 0) continue;
    const values = (Array.isArray(item.values) ? item.values : [])
      .filter(v => Object.hasOwn(UNITS, v?.metric) && Number.isFinite(v.value))
      .slice(0, 3)
      .map(v => ({ metric: v.metric, value: v.value }));
    if (!values.length) continue;
    const room = typeof item.room === 'string' ? item.room.slice(0, 60) : '';
    result.push({ space_id: item.space_id, room, values, stale: item.stale === true, real: item.source === 'real' });
  }
  return result;
}

export function formatValue(v) {
  return v.value.toLocaleString('de-DE', { minimumFractionDigits: DECIMALS[v.metric], maximumFractionDigits: DECIMALS[v.metric] }) + ' ' + UNITS[v.metric];
}

/** Short room title: the long name after "HP-03 · " if present. */
export function roomTitle(room) {
  const parts = room.split(' · ').filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' · ') : parts[0] || 'Raum';
}

function texture(entry) {
  const scale = 2, w = 300 * scale, h = 120 * scale, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), r = 26 * scale, tip = 16 * scale, body = h - tip;
  g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, body, r); g.arcTo(w, body, 0, body, r);
  g.lineTo(w / 2 + tip, body); g.lineTo(w / 2, h); g.lineTo(w / 2 - tip, body);
  g.arcTo(0, body, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath();
  g.fillStyle = entry.stale ? 'rgba(90,96,104,.92)' : 'rgba(17,52,96,.94)'; g.fill();
  g.lineWidth = 3 * scale; g.strokeStyle = entry.stale ? '#c7cbd1' : '#7fb6ff'; g.stroke();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${22 * scale}px -apple-system, sans-serif`;
  g.fillText(roomTitle(entry.room) + (entry.stale ? ' · alt' : entry.real ? '' : ' · Demo'), w / 2, 27 * scale);
  g.font = `700 ${34 * scale}px -apple-system, sans-serif`;
  g.fillText(entry.values.map(formatValue).join('  ·  '), w / 2, 70 * scale);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * anchors: Map<space_id, THREE.Vector3> in scene coordinates (top centre of the room volume).
 */
export function createSensorLabels(scene, anchors) {
  const group = new THREE.Group(); group.name = 'room-sensors'; scene.add(group);
  const clear = () => { for (const s of [...group.children]) { s.material.map?.dispose(); s.material.dispose(); group.remove(s); } };
  return {
    group,
    set(list) {
      clear();
      for (const entry of sanitizeRoomSensors(list)) {
        const anchor = anchors.get(entry.space_id); if (!anchor) continue;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(entry), depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
        sprite.center.set(.5, 0); sprite.position.copy(anchor);
        sprite.scale.set(.30, .12, 1); sprite.renderOrder = 12; sprite.userData.spaceID = entry.space_id;
        group.add(sprite);
      }
      return group.children.length;
    },
    dispose: clear,
  };
}
