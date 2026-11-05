import { IFCBUILDINGSTOREY, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELAGGREGATES } from 'web-ifc';

export function readStoreys(api, modelID) {
  const collect = type => {
    const ids = api.GetLineIDsWithType(modelID, type);
    return Array.from({ length: ids.size() }, (_, i) => api.GetLine(modelID, ids.get(i), false));
  };
  const storeys = collect(IFCBUILDINGSTOREY).map(line => ({
    id: line.expressID,
    name: line.Name?.value || line.LongName?.value || `Geschoss ${line.expressID}`,
    elevation: Number(line.Elevation?.value) || 0,
  })).sort((a, b) => a.elevation - b.elevation || a.id - b.id);
  const assignments = new Map(storeys.map(floor => [floor.id, floor.id]));
  const relations = [
    ...collect(IFCRELCONTAINEDINSPATIALSTRUCTURE).map(line => [line.RelatingStructure?.value, line.RelatedElements || []]),
    ...collect(IFCRELAGGREGATES).map(line => [line.RelatingObject?.value, line.RelatedObjects || []]),
  ];
  // Traverse spatial nesting once; cyclic and unordered relations cannot cause repeated scans.
  const childrenOf = new Map();
  for (const [parent, children] of relations) childrenOf.set(parent, [...(childrenOf.get(parent) || []), ...children.map(child => child.value)]);
  const queue = [...assignments.keys()];
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index];
    for (const child of childrenOf.get(parent) || []) if (!assignments.has(child)) {
      assignments.set(child, assignments.get(parent)); queue.push(child);
    }
  }
  return { storeys, assignments };
}

// Local clipping is independent of shared visibility and therefore never saves floor cuts.
export function floorCut(storeys, selectedID, gap = 0, gapIndex) {
  const index = storeys.findIndex(floor => floor.id === selectedID);
  if (index < 0) return null;
  const floor = storeys[index];
  const next = storeys[index + 1];
  const previous = storeys[index - 1];
  const height = next ? next.base - floor.base : previous ? floor.base - previous.base : floor.top - floor.base;
  return Math.min(floor.base + Math.max(height, .1), floor.ceiling ?? Infinity) + (gapIndex ?? index) * gap - .04;
}
