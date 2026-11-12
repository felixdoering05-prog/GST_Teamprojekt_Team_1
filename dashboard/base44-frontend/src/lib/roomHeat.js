const normalize = value => String(value ?? '').trim().replace(/\s+/g, '').toLocaleLowerCase('de-DE');
const roomCode = value => normalize(value).replace(/^raum(?=\d|[euk]g)/, '');
const numberedCode = /^[a-z]{0,3}[.-]?\d[\da-z.-]*$/;

export function floorLevel(name) {
  const compact = normalize(name).replace(/\./g, '');
  if (['eg', 'erdgeschoss'].includes(compact)) return 0;
  if (['kg', 'ug', 'kellergeschoss', 'untergeschoss'].includes(compact)) return -1;
  const upper = compact.match(/^(\d+)(?:og|obergeschoss)$/);
  if (upper) return Number(upper[1]);
  const lower = compact.match(/^(\d+)(?:ug|kg)$/);
  return lower ? -Number(lower[1]) : null;
}

export function roomNumber(number, floorName, campus) {
  const code = roomCode(number);
  if (!numberedCode.test(code)) return '';
  if (!campus) return code.toUpperCase();
  const level = floorLevel(floorName);
  if (level === -1 && /^\d{2}[a-z]?$/.test(code)) return `UG.${code.toUpperCase()}`;
  const match = code.match(/^(\d)(\d{2})([a-z]?(?:\.\d+)?)$/);
  if (match && Number(match[1]) === level) return `${match[1].padStart(2, '0')}.${match[2]}${match[3].toUpperCase()}`;
  return code.toUpperCase();
}

export function roomReadings(floor, measurements, campus) {
  if (!floor || !measurements) return {};
  const level = floorLevel(floor.name);
  const matchingFloors = new Set(measurements.floors.filter(item =>
    normalize(item.name) === normalize(floor.name) || (level !== null && item.level === level)).map(item => item.id));
  function canonicalCode(value) {
    const code = roomCode(value);
    if (!campus) return code;
    if (level === -1) return code.replace(/^(?:kg|-0?1)\./, 'ug.');
    if (level === 0) return code.replace(/^(?:eg|0)\./, '00.');
    return code.replace(/^(\d)\./, '0$1.');
  }
  const aliasesByRoom = new Map(floor.rooms.map(space => [space.id, new Set(
    [space.number, roomNumber(space.number, floor.name, campus)].map(canonicalCode).filter(code => numberedCode.test(code)),
  )]));
  const aliasCounts = new Map();
  for (const aliases of aliasesByRoom.values()) {
    for (const alias of aliases) aliasCounts.set(alias, (aliasCounts.get(alias) || 0) + 1);
  }
  const readings = {};
  for (const space of floor.rooms) {
    const byID = measurements.rooms.filter(room => room.ifc_global_id && space.globalIds.includes(room.ifc_global_id.trim()));
    const candidates = byID.length || matchingFloors.size !== 1 ? byID : measurements.rooms.filter(room => {
      const code = canonicalCode(room.room_code);
      return !room.ifc_global_id?.trim() && matchingFloors.has(room.floor_id) && aliasesByRoom.get(space.id).has(code);
    });
    if (candidates.length !== 1 || !candidates[0].reading) continue;
    const [match] = candidates;
    if (byID.length || aliasCounts.get(canonicalCode(match.room_code)) === 1) readings[space.id] = match.reading;
  }
  return readings;
}
