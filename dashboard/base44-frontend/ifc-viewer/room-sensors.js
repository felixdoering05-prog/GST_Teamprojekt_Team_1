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
    result.push({ space_id: item.space_id, room, values, stale: item.stale === true, real: item.source === 'real', updated_at: time, ...(item.source === 'mixed' ? { mixed: true } : {}) });
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

/** Saved room names from the parent page (renamed rooms, also without sensors). */
export function sanitizeRoomNames(list) {
  const result = new Map();
  if (!Array.isArray(list)) return result;
  for (const item of list.slice(0, 500)) {
    if (!Number.isInteger(item?.space_id) || item.space_id <= 0 || typeof item.room !== 'string') continue;
    const name = item.room.trim().slice(0, 60);
    if (name && !result.has(item.space_id)) result.set(item.space_id, name);
  }
  return result;
}

function popup({ title: name, sensor }, { rename, close }) {
  const box = document.createElement('div');
  box.className = 'sensor-popup' + (sensor?.stale ? ' stale' : '') + (sensor ? '' : ' empty');
  const head = document.createElement('div'); head.className = 'sensor-head';
  const title = document.createElement('strong'); title.textContent = name;
  if (rename) {
    title.className = 'sensor-name'; title.title = 'Doppelklick: Raumnamen ändern';
    title.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); rename(title); });
  }
  head.append(title);
  if (sensor) {
    const badge = document.createElement('span'); badge.className = 'sensor-badge';
    badge.textContent = sensor.stale ? 'alt' : sensor.real ? 'live' : sensor.mixed ? 'Gemischt' : 'Simulation';
    head.append(badge);
  }
  const closer = document.createElement('button'); closer.type = 'button'; closer.className = 'sensor-close';
  closer.textContent = '×'; closer.setAttribute('aria-label', 'Raum-Popup schließen');
  closer.addEventListener('click', event => { event.stopPropagation(); close(); });
  head.append(closer);
  box.append(head);
  if (!sensor) {
    const note = document.createElement('small'); note.className = 'sensor-time'; note.textContent = 'Keine Sensordaten für diesen Raum';
    box.append(note);
    return box;
  }
  const values = document.createElement('div'); values.className = 'sensor-values';
  for (const v of sensor.values) {
    const cell = document.createElement('span');
    const number = document.createElement('b'); number.textContent = formatValue(v);
    const label = document.createElement('small'); label.textContent = LABELS[v.metric];
    cell.append(number, label); values.append(cell);
  }
  box.append(values);
  if (sensor.updated_at) {
    const time = document.createElement('small'); time.className = 'sensor-time';
    time.textContent = 'Stand ' + new Date(sensor.updated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    box.append(time);
  }
  return box;
}

/**
 * One popup per IFC room, shown only for the room the user clicked.
 * host: HTML layer above the canvas. rooms: Map<space_id, { anchor: THREE.Vector3, meshes: THREE.Mesh[], label: string }>,
 * where anchor is the room centre in the local coordinates of the room volumes' parent. The popup follows storey cuts and
 * separated storeys because the current offset and visibility of the room volume are read on every frame.
 * planes: returns the active clipping planes (world space).
 */
export function createRoomSensors(host, parent, rooms, camera, { planes = () => [], onRename, onChange = () => {} } = {}) {
  const layer = document.createElement('div'); layer.className = 'sensor-layer'; layer.setAttribute('aria-live', 'polite');
  host.append(layer);
  let sensors = new Map(), saved = new Map(), selected = null, element = null, editing = false, pending = null;
  const names = new Map(); // space_id → gespeicherter Name, bis der Server ihn bestätigt
  const errors = new Map(); // space_id → { text, until } für einen kurzen Hinweis nach fehlgeschlagenem Speichern
  const meshes = [...rooms.values()].flatMap(room => room.meshes);
  const point = new THREE.Vector3();
  const box = new THREE.Box3(), part = new THREE.Box3(), size = new THREE.Vector3();
  function roomAt(at) {
    let best, volume = Infinity;
    for (const [space, room] of rooms) {
      if (!room.meshes.some(m => m.layers.isEnabled(0))) continue;
      box.makeEmpty(); for (const m of room.meshes) box.union(part.setFromObject(m));
      box.min.y -= .3; // Boden unter dem Raumvolumen gehört noch zum Raum
      if (!box.containsPoint(at)) continue;
      const v = box.getSize(size).x * size.y * size.z;
      if (v < volume) { volume = v; best = space; }
    }
    return best;
  }
  function titleFor(space) {
    if (names.has(space)) return names.get(space);
    if (saved.has(space)) return saved.get(space);
    return roomTitle(sensors.get(space)?.room || rooms.get(space)?.label || '');
  }
  function showError(space) {
    const error = errors.get(space);
    if (!element || !error || error.until < Date.now()) { if (error?.until < Date.now()) errors.delete(space); return; }
    const note = document.createElement('small'); note.className = 'sensor-error'; note.textContent = error.text;
    element.querySelector('.sensor-error')?.remove(); element.append(note);
    setTimeout(() => { note.remove(); if (errors.get(space)?.until <= Date.now()) errors.delete(space); }, error.until - Date.now());
  }
  function draw() {
    if (editing) return;
    layer.replaceChildren(); element = null;
    if (selected === null || !rooms.has(selected)) return;
    const space = selected;
    element = popup({ title: titleFor(space), sensor: sensors.get(space) }, { rename: onRename && (title => rename(space, title)), close: () => api.select(null) });
    element.dataset.space = String(space); element.hidden = true;
    layer.append(element); showError(space);
    onChange();
  }
  function rename(space, title) {
    if (editing) return;
    const input = document.createElement('input');
    input.className = 'sensor-name-input'; input.maxLength = 60; input.value = title.textContent;
    input.setAttribute('aria-label', 'Raumname');
    const previous = title.textContent;
    editing = true;
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      const name = cleanRoomName(input.value);
      input.replaceWith(title);
      editing = false;
      if (save && name && name !== previous) {
        title.textContent = name; names.set(space, name);
        title.closest('.sensor-popup')?.classList.add('saving');
        onRename(space, name);
      }
      if (pending) { const [list, nameList] = pending; pending = null; api.set(list, nameList); }
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
    set(list, nameList) {
      if (editing) { pending = [list, nameList]; return; }
      sensors = new Map(sanitizeRoomSensors(list).map(entry => [entry.space_id, entry]));
      saved = sanitizeRoomNames(nameList);
      for (const [space, name] of names) {
        const confirmed = saved.get(space) ?? roomTitle(sensors.get(space)?.room || '');
        if (confirmed === name) names.delete(space);
      }
      draw();
    },
    /**
     * Selects the room under the pointer: a visible room volume in front of the clicked geometry, or the room whose
     * bounds contain the clicked point (e.g. its floor in a storey cut). Clicking the open room again or elsewhere closes.
     */
    pick(ray, { element, allowed = () => true } = {}) {
      const limit = element ? element.distance + .05 : Infinity;
      let space = ray.intersectObjects(meshes, false).find(hit => hit.object.layers.isEnabled(0) && allowed(hit) && hit.distance <= limit)?.object.userData.expressID;
      if (space === undefined && element) space = roomAt(element.point);
      const found = space !== undefined && rooms.has(space);
      api.select(found && space !== selected ? space : null);
      return found;
    },
    select(space) {
      if (editing || space === selected) return;
      selected = space; draw();
    },
    get selected() { return selected; },
    /** Server answer to a rename: on error the old name returns and a short note is shown. */
    renamed({ space_id, error }) {
      element?.classList.remove('saving');
      if (!error) return;
      names.delete(space_id);
      errors.set(space_id, { text: String(error).slice(0, 80), until: Date.now() + 5000 });
      if (selected === space_id) { draw(); }
    },
    update() {
      if (!element || selected === null) return;
      const room = rooms.get(selected), mesh = room.meshes[0];
      const shown = room.meshes.some(m => m.layers.isEnabled(0));
      point.copy(room.anchor);
      if (mesh?.userData.basePosition) point.y += mesh.position.y - mesh.userData.basePosition.y;
      parent.localToWorld(point);
      // Liegt die Raummitte über dem Geschossschnitt, sitzt das Popup auf der Schnittfläche.
      for (const plane of planes()) { const d = plane.distanceToPoint(point); if (d < 0) point.addScaledVector(plane.normal, -d); }
      if (!shown || planes().some(plane => plane.distanceToPoint(point) < -1e-4)) { element.hidden = true; return; }
      point.project(camera);
      element.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      element.style.left = `${(point.x + 1) * innerWidth / 2}px`;
      element.style.top = `${(1 - point.y) * innerHeight / 2}px`;
    },
    dispose() { layer.remove(); element = null; },
  };
  return api;
}
