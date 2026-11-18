export const METRIC_LABELS = { temperature: 'Temperatur', humidity: 'Luftfeuchte', co2: 'CO₂' };
export const METRIC_UNITS = { temperature: '°C', humidity: '%', co2: 'ppm' };
export const roomName = value => String(value || '').split(' · ').slice(1).join(' · ') || String(value || 'Raum');
export function modelLights({ documentID, spaces = [], lamps = [], devices = [], imported = {}, names = [] }) {
  const spaceByRoom = new Map(names.map(r => [r.room_id, r.space_id]));
  const aliases = new Map(), key = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
  for (const space of spaces) for (const name of [space.name, ...String(space.name || '').split(' · ')]) {
    const alias = key(name); if (alias) aliases.set(alias, aliases.has(alias) && aliases.get(alias) !== space.id ? null : space.id);
  }
  const placed = (document, space, room) => document != null
    ? document === documentID ? space ?? aliases.get(key(room)) ?? null : null
    : aliases.get(key(room)) ?? null;
  const remote = lamps.map(l => ({ ...l, id: `ha:${l.key}`, kind: 'light', source: 'Home Assistant', control: 'ha',
    space: placed(l.location?.document_id, l.location?.space_id, l.location?.room) }));
  const known = new Set(lamps.map(l => l.entity_id).filter(Boolean));
  const local = devices.filter(d => ['light', 'plug'].includes(d.kind)).map(d => ({ ...d, id: `device:${d.id}`, deviceID: d.id,
    source: d.mode === 'simulation' ? 'Simulation' : 'Geplant', available: d.mode === 'simulation',
    control: d.mode === 'simulation' ? 'simulation' : null, supports_rgb: d.mode === 'simulation' && d.kind === 'light',
    space: placed(d.document_id, d.space_id, d.room) }));
  const snapshots = (imported.entities || []).filter(e => e.selected && e.metric === 'light' && !known.has(e.entity_id)).map(e => ({
    id: `import:${e.entity_id}`, name: e.name, kind: 'light', source: 'Home Assistant · iPhone', control: null,
    space: spaceByRoom.get(e.effective_room_id) ?? null, available: e.light?.available === true && Date.now() - Date.parse(e.light.updated_at) < 180000,
    is_on: e.light?.is_on ?? null, checked_at: e.light?.updated_at,
  }));
  return [...remote, ...local, ...snapshots];
}
