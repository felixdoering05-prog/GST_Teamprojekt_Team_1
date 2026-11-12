import { readFile, writeFile } from 'node:fs/promises';
import { campusPoint } from '../ifc-viewer/campus-projection.js';

const [input, output, retrieved] = process.argv.slice(2);
if (!input || !output || !/^\d{4}-\d{2}-\d{2}$/.test(retrieved || '')) {
  throw new Error('Aufruf: node scripts/import-campus-terrain.mjs osm.json campus-terrain.json YYYY-MM-DD');
}
const data = JSON.parse(await readFile(input, 'utf8'));
const bbox = data.bounds && [data.bounds.minlon, data.bounds.minlat, data.bounds.maxlon, data.bounds.maxlat];
if (!bbox?.every(Number.isFinite) || !Array.isArray(data.elements)) throw new Error('Ungültiger OSM-Kartenausschnitt.');

const project = coordinates => campusPoint(coordinates).map(value => Math.round(value * 10) / 10);
const [west, north] = project([bbox[0], bbox[3]]);
const [east, south] = project([bbox[2], bbox[1]]);
const nodes = new Map(data.elements.filter(element => element.type === 'node').map(node => [node.id, project([node.lon, node.lat])]));
const ways = new Map(data.elements.filter(element => element.type === 'way').map(way => [way.id, way]));
const buildings = [], areas = [], roads = [];

function coordinates(ids, ring = false) {
  if (!ids?.length || (ring && ids[0] !== ids.at(-1))) return null;
  const points = (ring ? ids.slice(0, -1) : ids).map(id => nodes.get(id));
  if (points.some(point => !point) || points.length < (ring ? 3 : 2)) return null;
  return points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
}

function joinedRings(members) {
  const remaining = members.map(member => ways.get(member.ref)?.nodes?.slice());
  if (remaining.some(ids => !ids?.length)) return [];
  const rings = [];
  while (remaining.length) {
    const chain = remaining.pop();
    while (chain[0] !== chain.at(-1)) {
      const tail = chain.at(-1);
      const index = remaining.findIndex(ids => ids[0] === tail || ids.at(-1) === tail);
      if (index === -1) return [];
      const [next] = remaining.splice(index, 1);
      if (next[0] !== tail) next.reverse();
      chain.push(...next.slice(1));
    }
    const ring = coordinates(chain, true);
    if (ring?.length >= 3) rings.push(ring);
  }
  return rings;
}

function contains(points, [x, z]) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [ax, az] = points[previous], [bx, bz] = points[index];
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside;
  }
  return inside;
}

function areaKind(tags) {
  if (tags.building && !['no', 'roof', 'bridge', 'construction', 'carport'].includes(tags.building)) return 'building';
  if (tags.natural === 'water' || tags.landuse === 'basin') return 'water';
  if (tags.amenity === 'parking' || tags.highway === 'pedestrian' && tags.area === 'yes') return 'paving';
  if (['grass', 'meadow', 'village_green', 'recreation_ground', 'greenery', 'forest'].includes(tags.landuse) ||
    ['grassland', 'scrub', 'wood'].includes(tags.natural) || ['park', 'garden', 'pitch'].includes(tags.leisure)) return 'green';
  return null;
}

function addPolygon(id, tags, rings, kind) {
  if (kind !== 'building') { areas.push({ kind, rings }); return; }
  const ring = rings[0];
  const size = Math.abs(ring.reduce((sum, [x, z], index) => {
    const [nx, nz] = ring[(index + 1) % ring.length];
    return sum + x * nz - nx * z;
  }, 0) / 2);
  if (size < 12) return;
  const explicitHeight = Number(String(tags.height || '').replace(/\s*m$/, ''));
  const levels = Number(tags['building:levels']);
  const height = explicitHeight > 0 ? explicitHeight : levels > 0 ? levels * 3 : null;
  buildings.push({
    id, rings, ...(height !== null && { height }),
    ...(['university', 'college'].includes(tags.building) && { campus: true }),
  });
}

const relationWays = new Set();
for (const element of data.elements) {
  const tags = element.tags || {};
  const kind = areaKind(tags);
  if (element.type !== 'relation' || tags.type !== 'multipolygon' || !kind) continue;
  const members = element.members.filter(member => member.type === 'way');
  const outer = joinedRings(members.filter(member => member.role === 'outer' || member.role === ''));
  const innerMembers = members.filter(member => member.role === 'inner');
  const inner = joinedRings(innerMembers);
  if (!outer.length || innerMembers.length && !inner.length) continue;
  for (const [index, ring] of outer.entries()) {
    addPolygon(`r${element.id}-${index}`, tags, [ring, ...inner.filter(hole => contains(ring, hole[0]))], kind);
  }
  for (const member of members) relationWays.add(member.ref);
}

for (const way of ways.values()) {
  const tags = way.tags || {};
  const kind = areaKind(tags);
  if (kind && !relationWays.has(way.id)) {
    const ring = coordinates(way.nodes, true);
    if (ring?.length >= 3) addPolygon(way.id, tags, [ring], kind);
  }
  if (tags.area === 'yes' || tags.location === 'underground' || tags.indoor === 'yes' ||
    tags.tunnel && tags.tunnel !== 'no' || Number(tags.level) > 0) continue;
  let road;
  if (['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link'].includes(tags.highway)) road = 'main';
  else if (['residential', 'unclassified', 'living_street', 'pedestrian'].includes(tags.highway)) road = 'local';
  else if (tags.highway === 'service') road = 'service';
  else if (['footway', 'cycleway', 'path', 'steps'].includes(tags.highway)) road = 'path';
  else if (['rail', 'tram'].includes(tags.railway)) road = 'rail';
  if (!road) continue;
  const points = coordinates(way.nodes);
  if (points?.length >= 2) roads.push({ kind: road, points, ...(tags.name && { name: tags.name }) });
}

if (!buildings.some(building => building.id === 148028797) || !roads.length || !areas.length) {
  throw new Error('Der Ausschnitt enthält D21 oder die zugehörige Umgebung nicht vollständig.');
}
await writeFile(output, JSON.stringify({
  source: `https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox.map(value => value.toFixed(4)).join(',')}`,
  attribution: '© OpenStreetMap-Mitwirkende', license: 'ODbL-1.0', retrieved, bbox,
  bounds: [west, north, east, south], buildings, roads, areas,
}) + '\n');
console.log(`${buildings.length} Gebäude, ${roads.length} Straßen- und Wegabschnitte, ${areas.length} Flächen`);
