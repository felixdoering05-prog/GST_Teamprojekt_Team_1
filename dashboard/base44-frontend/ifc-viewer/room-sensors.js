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

/** Trimmed room name as the server accepts it, or '' if invalid. */
export function cleanRoomName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  return name.length <= 60 && !/[\u0000-\u001f\u007f]/.test(name) ? name : '';
}

function popup(entry, rename) {
  const box = document.createElement('div');
  box.className = 'sensor-popup' + (entry.stale ? ' stale' : '');
  const head = document.createElement('div'); head.className = 'sensor-head';
  const title = document.createElement('strong'); title.textContent = roomTitle(entry.room);
  if (rename) {
    title.className = 'sensor-name'; title.title = 'Doppelklick: Raumnamen ändern';
    title.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); rename(entry, title); });
  }
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
export function createRoomSensors(host, parent, rooms, camera, { planes = () => [], onRename } = {}) {
  const layer = document.createElement('div'); layer.className = 'sensor-layer'; layer.setAttribute('aria-live', 'polite');
  host.append(layer);
  let items = [], editing = null, pending = null;
  const names = new Map(); // space_id → gespeicherter Name, bis der Server ihn im Overlay bestätigt
  const errors = new Map(); // space_id → { text, until } für einen kurzen Hinweis nach fehlgeschlagenem Speichern
  function showError(element, space) {
    const error = errors.get(space);
    if (!error || error.until < Date.now()) { errors.delete(space); return; }
    const note = document.createElement('small'); note.className = 'sensor-error'; note.textContent = error.text;
    element.querySelector('.sensor-error')?.remove(); element.append(note);
    setTimeout(() => { note.remove(); if (errors.get(space)?.until <= Date.now()) errors.delete(space); }, error.until - Date.now());
  }
  const point = new THREE.Vector3();
  function rename(entry, title) {
    if (editing) return;
    const input = document.createElement('input');
    input.className = 'sensor-name-input'; input.maxLength = 60; input.value = title.textContent;
    input.setAttribute('aria-label', 'Raumname');
    const previous = title.textContent;
    editing = { space_id: entry.space_id, input };
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      const name = cleanRoomName(input.value);
      input.replaceWith(title);
      editing = null;
      if (save && name && name !== previous) {
        title.textContent = name; names.set(entry.space_id, name);
        title.closest('.sensor-popup')?.classList.add('saving');
        onRename(entry.space_id, name);
      }
      if (pending) { const list = pending; pending = null; api.set(list); }
    };
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    title.replaceWith(input); input.focus(); input.select();
  }
  const api = {
    set(list) {
      if (editing) { pending = list; return items.length; }
      layer.replaceChildren();
      items = [];
      for (const entry of sanitizeRoomSensors(list)) {
        const room = rooms.get(entry.space_id); if (!room) continue;
        if (names.has(entry.space_id)) {
          if (roomTitle(entry.room) === names.get(entry.space_id)) names.delete(entry.space_id);
          else entry.room = names.get(entry.space_id);
        }
        const element = popup(entry, onRename && rename); element.hidden = true; layer.append(element);
        element.dataset.space = String(entry.space_id);
        showError(element, entry.space_id);
        items.push({ room, element });
      }
      return items.length;
    },
    /** Server answer to a rename: on error the old name returns and a short note is shown. */
    renamed({ space_id, error }) {
      const element = items.find(item => item.element.dataset.space === String(space_id))?.element;
      element?.classList.remove('saving');
      if (!error) return;
      names.delete(space_id);
      errors.set(space_id, { text: String(error).slice(0, 80), until: Date.now() + 5000 });
      if (element) showError(element, space_id);
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
  return api;
}
