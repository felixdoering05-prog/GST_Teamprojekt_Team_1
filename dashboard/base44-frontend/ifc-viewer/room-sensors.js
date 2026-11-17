import * as THREE from 'three';

// Messwert-Popups über IFC-Räumen (z. B. ESP32 + BME280 im Schlafzimmer). Die Werte lädt die
// Web-Oberfläche angemeldet vom Server und schickt sie per postMessage; der Viewer zeigt sie nur an.
const UNITS = { temperature: '°C', humidity: '%', co2: 'ppm' };
const LABELS = { temperature: 'Temperatur', humidity: 'Luftfeuchte', co2: 'CO₂' };
const DECIMALS = { temperature: 1, humidity: 0, co2: 0 };

/** Accepts only well-formed entries from the parent page. */
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
    const time = typeof item.updated_at === 'string' && Number.isFinite(Date.parse(item.updated_at)) ? item.updated_at : null;
    result.push({ space_id: item.space_id, room, values, stale: item.stale === true, real: item.source === 'real', updated_at: time });
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

function popup(entry) {
  const box = document.createElement('div');
  box.className = 'sensor-popup' + (entry.stale ? ' stale' : '');
  const head = document.createElement('div'); head.className = 'sensor-head';
  const title = document.createElement('strong'); title.textContent = roomTitle(entry.room);
  const badge = document.createElement('span'); badge.className = 'sensor-badge';
  badge.textContent = entry.stale ? 'alt' : entry.real ? 'live' : 'Demo';
  head.append(title, badge);
  const values = document.createElement('div'); values.className = 'sensor-values';
  for (const v of entry.values) {
    const cell = document.createElement('span');
    const number = document.createElement('b'); number.textContent = formatValue(v);
    const label = document.createElement('small'); label.textContent = LABELS[v.metric];
    cell.append(number, label); values.append(cell);
  }
  box.append(head, values);
  if (entry.updated_at) {
    const time = document.createElement('small'); time.className = 'sensor-time';
    time.textContent = 'Stand ' + new Date(entry.updated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    box.append(time);
  }
  return box;
}

/**
 * host: HTML layer above the canvas. rooms: Map<space_id, { anchor: THREE.Vector3, meshes: THREE.Mesh[] }>, where
 * anchor is the room centre in the local coordinates of the room volumes' parent. The popups follow storey cuts and
 * separated storeys because the current offset and visibility of the room volume are read on every frame.
 * planes: returns the active clipping planes (world space).
 */
export function createRoomSensors(host, parent, rooms, camera, { planes = () => [] } = {}) {
  const layer = document.createElement('div'); layer.className = 'sensor-layer'; layer.setAttribute('aria-live', 'polite');
  host.append(layer);
  let items = [];
  const point = new THREE.Vector3();
  return {
    set(list) {
      layer.replaceChildren();
      items = [];
      for (const entry of sanitizeRoomSensors(list)) {
        const room = rooms.get(entry.space_id); if (!room) continue;
        const element = popup(entry); element.hidden = true; layer.append(element);
        items.push({ room, element });
      }
      return items.length;
    },
    update() {
      for (const { room, element } of items) {
        const mesh = room.meshes[0];
        const shown = room.meshes.some(m => m.layers.isEnabled(0));
        point.copy(room.anchor);
        if (mesh?.userData.basePosition) point.y += mesh.position.y - mesh.userData.basePosition.y;
        parent.localToWorld(point);
        // Liegt die Raummitte über dem Geschossschnitt, sitzt das Popup auf der Schnittfläche.
        for (const plane of planes()) { const d = plane.distanceToPoint(point); if (d < 0) point.addScaledVector(plane.normal, -d); }
        if (!shown || planes().some(plane => plane.distanceToPoint(point) < -1e-4)) { element.hidden = true; continue; }
        point.project(camera);
        element.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
        element.style.left = `${(point.x + 1) * innerWidth / 2}px`;
        element.style.top = `${(1 - point.y) * innerHeight / 2}px`;
      }
    },
    setVisible(on) { layer.hidden = !on; },
    dispose() { layer.remove(); items = []; },
  };
}
