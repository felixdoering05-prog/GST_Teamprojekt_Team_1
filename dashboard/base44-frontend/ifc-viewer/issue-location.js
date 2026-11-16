export function resolveIssueLocation({ focus, floors, assignments, room, element, point }) {
  if (!focus || !Number.isInteger(focus.id) || focus.id <= 0) return null;
  const referencedFloor = (room ? assignments.get(focus.spaceID) : undefined) ?? (element ? assignments.get(focus.elementID) : undefined);
  let floor = floors.find(item => item.id === referencedFloor);
  if (!floor && point) {
    const candidates = floors.filter(item => point.y >= item.base && point.y < item.top);
    if (candidates.length === 1) [floor] = candidates;
  }
  return { floor, room: room || null, element: element || null, point: point || null };
}
