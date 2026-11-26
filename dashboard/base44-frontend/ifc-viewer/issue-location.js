const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('de-DE')
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ');

const floorTerm = String.raw`(?:erdgeschoss|eg|parterre|\d{1,2}\.?\s*(?:ober\s*geschoss|unter\s*geschoss|stock(?:werk)?|og|ug)|(?:ober\s*geschoss|unter\s*geschoss|stock(?:werk)?|og|ug)\s*\d{1,2})`;
const floorOnly = new RegExp('^' + floorTerm + '$');
const inlineFloor = new RegExp('^(' + floorTerm + ')\\s+(.+)$|^(.+?)\\s+(' + floorTerm + ')$');
const roomKey = name => normalize(name).replace(/^raum\s+(?=\d)/, '');

function floorKey(value) {
  const name = normalize(value);
  if (/^(?:eg|erdgeschoss|parterre)$/.test(name)) return 'eg';
  const before = name.match(/^(\d{1,2})\.?\s*(ober\s*geschoss|unter\s*geschoss|stock(?:werk)?|og|ug)$/);
  const after = name.match(/^(ober\s*geschoss|unter\s*geschoss|stock(?:werk)?|og|ug)\s*(\d{1,2})$/);
  const number = before?.[1] ?? after?.[2];
  if (number === undefined) return name;
  const type = before?.[2] ?? after[1];
  return (/^(?:unter|ug)/.test(type) ? 'ug' : 'og') + Number(number);
}

export function matchIssueRoom({ location, building, floors, assignments, rooms }) {
  const parts = normalize(location).split(/\s*[,;|·]\s*/).filter(Boolean);
  if (parts.length > 1 && parts[0] === normalize(building)) parts.shift();
  if (!parts.length) return null;

  const candidates = (name, floor) => [...rooms].filter(([id, room]) =>
    (!floor || assignments.get(id) === floor.id) &&
    [room.name, ...room.aliases].some(alias => roomKey(alias) === roomKey(name)));

  const direct = candidates(parts.join(' · '));
  if (direct.length) return direct.length === 1 ? { spaceID: direct[0][0] } : null;

  if (parts.length === 1) {
    const inline = parts[0].match(inlineFloor);
    if (inline) parts.splice(0, 1, inline[1] || inline[4], inline[2] || inline[3]);
  }

  const floorParts = parts.filter(part => floors.some(floor => floorKey(floor.name) === floorKey(part))
    || floorOnly.test(part));
  if (floorParts.length !== 1) return null;
  const possibleFloors = floors.filter(floor => floorKey(floor.name) === floorKey(floorParts[0]));
  if (possibleFloors.length !== 1) return null;
  const [floor] = possibleFloors;
  const roomName = parts.filter(part => part !== floorParts[0]).join(' · ');
  const matches = roomName ? candidates(roomName, floor) : [];
  return { floor, spaceID: matches.length === 1 ? matches[0][0] : undefined };
}

export function modelRoomMatch({ focus, floors, assignments, rooms }) {
  if (focus.spaceID || focus.elementID || focus.point) return { spaceID: focus.spaceID };
  if (focus.globalId) {
    const matches = [...rooms].filter(([, room]) => room.globalId === focus.globalId);
    if (matches.length === 1) return { spaceID: matches[0][0] };
    const floorMatch = floors.filter(floor => focus.floor && floorKey(floor.name) === floorKey(focus.floor));
    return { floor: floorMatch.length === 1 ? floorMatch[0] : null };
  }
  return focus.location ? matchIssueRoom({ ...focus, floors, assignments, rooms }) : null;
}

export function resolveIssueLocation({ focus, floors, assignments, room, element, point, textFloor }) {
  if (!focus || (!(Number.isInteger(focus.id) && focus.id > 0) && !focus.label)) return null;
  const referencedFloor = (room ? assignments.get(focus.spaceID) : undefined) ?? (element ? assignments.get(focus.elementID) : undefined);
  let floor = floors.find(item => item.id === referencedFloor);
  if (!floor && point) {
    const candidates = floors.filter(item => point.y >= item.base && point.y < item.top);
    if (candidates.length === 1) [floor] = candidates;
  }
  return { floor: floor || textFloor, room: room || null, element: element || null, point: point || null };
}
