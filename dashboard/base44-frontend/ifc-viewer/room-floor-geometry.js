import { Box3, BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';
import { IFCSPACE } from 'web-ifc';

const EPSILON = .003;
const round = value => Math.round(value * 1000) / 1000;
const pointKey = point => point.join(',');
const edgeKey = (a, b) => [pointKey(a), pointKey(b)].sort().join('/');
const svgPoint = point => point.join(' ');
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const triangleArea = ([a, b, c]) => Math.abs(cross(a, b, c)) / 2;
const centroid = triangle => [0, 1].map(axis => triangle.reduce((sum, point) => sum + point[axis], 0) / 3);

function floorFootprint(api, modelID, id, matrix) {
  const flat = api.GetFlatMesh(modelID, id);
  const pieces = [];
  for (let i = 0; i < flat.geometries.size(); i++) {
    const placed = flat.geometries.get(i);
    const transform = matrix.clone().multiply(new Matrix4().fromArray(placed.flatTransformation));
    const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
    try {
      const source = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
      const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
      const vertices = [];
      let base = Infinity;
      for (let j = 0; j < source.length; j += 6) {
        const point = new Vector3(source[j], source[j + 1], source[j + 2]).applyMatrix4(transform);
        vertices.push(point);
        base = Math.min(base, point.y);
      }
      const triangles = [];
      for (let j = 0; j < indices.length; j += 3) {
        const face = [vertices[indices[j]], vertices[indices[j + 1]], vertices[indices[j + 2]]];
        if (face.some(point => Math.abs(point.y - base) > EPSILON)) continue;
        const triangle = face.map(point => [round(point.x), round(point.z)]);
        if (triangleArea(triangle) > .00001) triangles.push(triangle);
      }
      if (triangles.length) pieces.push({ base, triangles });
    } finally { geometry.delete(); }
  }
  return pieces;
}

function footprintOutline(triangles) {
  const edges = new Map();
  for (const [a, b, c] of triangles) {
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(start, end);
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [start, end]);
    }
  }
  return {
    key: [...edges.keys()].sort().join('|'),
    path: [...edges.values()].map(([start, end]) => `M${svgPoint(start)}L${svgPoint(end)}`).join(''),
  };
}

function describeRoom(room) {
  const triangles = room.pieces.flatMap(piece => piece.triangles);
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  let largest = 0, label, totalArea = 0;
  const weighted = [0, 0];
  for (const triangle of triangles) {
    for (const [x, z] of triangle) {
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], z);
      bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], z);
    }
    const area = triangleArea(triangle);
    const middle = centroid(triangle);
    totalArea += area;
    weighted[0] += middle[0] * area;
    weighted[1] += middle[1] * area;
    if (area > largest) {
      largest = area;
      label = middle;
    }
  }
  const center = weighted.map(value => value / totalArea);
  if (triangles.some(([a, b, c]) => {
    const signs = [cross(a, b, center), cross(b, c, center), cross(c, a, center)];
    return signs.every(value => value >= 0) || signs.every(value => value <= 0);
  })) label = center;
  const path = triangles.map(([a, b, c]) => {
    const points = cross(a, b, c) > 0 ? [a, b, c] : [a, c, b];
    return `M${points.map(svgPoint).join('L')}Z`;
  }).join('');
  return { id: room.id, number: room.number, bounds, label: label.map(round), path, outline: room.pieces.map(piece => piece.outline.path).join('') };
}

export function readRoomFootprints(api, modelID, spatial, matrix) {
  const roomsByFloor = new Map();
  const spaces = api.GetLineIDsWithType(modelID, IFCSPACE);
  for (let i = 0; i < spaces.size(); i++) {
    const id = spaces.get(i);
    const floorID = spatial.assignments.get(id);
    if (floorID === undefined) continue;
    const pieces = floorFootprint(api, modelID, id, matrix).map(piece => ({
      ...piece, outline: footprintOutline(piece.triangles),
    }));
    if (!pieces.length) continue;
    const line = api.GetLine(modelID, id, false);
    const number = line.Name?.value?.trim() || '';
    const signature = pieces.map(piece => `${round(piece.base)}:${piece.outline.key}`).sort().join(';');
    if (!roomsByFloor.has(floorID)) roomsByFloor.set(floorID, new Map());
    const floor = roomsByFloor.get(floorID);
    const key = `${number}:${signature}`;
    if (!floor.has(key)) floor.set(key, { id, number, pieces, globalIds: [] });
    if (line.GlobalId?.value) floor.get(key).globalIds.push(line.GlobalId.value);
  }
  return new Map([...roomsByFloor].map(([id, rooms]) => [id, [...rooms.values()].map((room, index) => ({
    ...room,
    base: Math.min(...room.pieces.map(piece => piece.base)),
    plan: describeRoom({ ...room, number: room.number || String(index + 1).padStart(2, '0') }),
  }))]));
}

export function roomOverlayGeometry(room) {
  const positions = room.pieces.flatMap(({ base, triangles }) => triangles.flatMap(triangle =>
    triangle.flatMap(([x, z]) => [x, base + .06, z])));
  return new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
}

function wallSection(mesh, height, edges) {
  const { position } = mesh.geometry.attributes;
  const index = mesh.geometry.index;
  const vertices = Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  for (let i = 0; i < index.count; i += 3) {
    const a = vertices[index.getX(i)], b = vertices[index.getX(i + 1)], c = vertices[index.getX(i + 2)];
    const points = [];
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      if ((start.y > height) === (end.y > height)) continue;
      const fraction = (height - start.y) / (end.y - start.y);
      points.push([round(start.x + fraction * (end.x - start.x)), round(start.z + fraction * (end.z - start.z))]);
    }
    if (points.length === 2 && pointKey(points[0]) !== pointKey(points[1])) edges.set(edgeKey(...points), points);
  }
}

export function makeFloorPlan(floor, meshes, boundsByMesh, elementTypes) {
  const edges = new Map();
  const bounds = new Box3();
  const height = floor.base + Math.min(1.2, (floor.cut - floor.base) * .8) + .0007;
  for (const mesh of meshes) {
    if (!['walls', 'doors', 'windows', 'columns'].includes(elementTypes.get(mesh.userData.expressID))) continue;
    const box = boundsByMesh.get(mesh);
    if (box.min.y >= height || box.max.y <= height) continue;
    wallSection(mesh, height, edges);
  }
  for (const points of edges.values()) {
    for (const [x, z] of points) bounds.expandByPoint(new Vector3(x, 0, z));
  }
  for (const { plan } of floor.rooms) {
    const [minX, minZ, maxX, maxZ] = plan.bounds;
    bounds.expandByPoint(new Vector3(minX, 0, minZ));
    bounds.expandByPoint(new Vector3(maxX, 0, maxZ));
  }
  if (bounds.isEmpty()) return null;
  return {
    viewBox: [bounds.min.x - 1, bounds.min.z - 1, bounds.max.x - bounds.min.x + 2, bounds.max.z - bounds.min.z + 2],
    walls: [...edges.values()].map(([start, end]) => `M${svgPoint(start)}L${svgPoint(end)}`).join(''),
    rooms: floor.rooms.map(room => room.plan),
  };
}
