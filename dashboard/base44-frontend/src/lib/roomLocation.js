import { matchIssueRoom } from '../../ifc-viewer/issue-location.js';

export function roomDetailLink(buildingID, roomID) {
  return '/gebaeude?' + new URLSearchParams({ building: buildingID, section: 'rooms', room: roomID });
}

export function roomAssistantLink(buildingID, roomID) {
  return '/assistent?' + new URLSearchParams({ building: buildingID, room: roomID });
}

export function resolveBuildingRoom({ rooms = [], floors = [] } = {}, { roomID, globalId, label, building } = {}) {
  if (roomID) return rooms.find(room => room.id === roomID);
  if (globalId) {
    const matches = rooms.filter(room => room.ifc_global_id === globalId);
    if (matches.length) return matches.length === 1 ? matches[0] : undefined;
  }
  if (!label) return undefined;
  const candidates = globalId ? rooms.filter(room => !room.ifc_global_id) : rooms;
  const match = matchIssueRoom({
    location: label,
    building,
    floors,
    rooms: new Map(candidates.map(room => [room.id, { name: room.name, aliases: [room.room_code, [room.room_code, room.name].filter(Boolean).join(' ')] }])),
    assignments: new Map(candidates.map(room => [room.id, room.floor_id])),
  });
  return candidates.find(room => room.id === match?.spaceID);
}

export function roomModelFocus(room, floor) {
  return {
    label: room.room_code || room.name,
    globalId: room.ifc_global_id,
    floor: floor?.name,
    location: [floor?.name, room.room_code || room.name].filter(Boolean).join(' · '),
  };
}
