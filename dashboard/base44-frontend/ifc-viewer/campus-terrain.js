import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TERRAIN_COLOR = '#e7ebe7';
export const D21_WAY = 148028797;
const roadStyles = [
  { kind: 'rail', width: 1.5, fill: '#aab9b8' },
  { kind: 'path', width: 1.55, fill: '#f7f7f1' },
  { kind: 'service', width: 3.25, edge: '#d4dcd7', fill: '#f1f2ed' },
  { kind: 'local', width: 5.9, edge: '#c7d1cd', fill: '#fafaf5' },
  { kind: 'main', width: 9, edge: '#bccac7', fill: '#fafaf6' },
];
const areaColors = { green: '#cbd9ca', paving: '#dce2df', water: '#b5cdd4' };
const streetNames = ['Haardtring', 'Berliner Allee', 'Schöfferstraße', 'Stephanstraße', 'Birkenweg', 'Holzhofallee'];
const fadeWidth = ([west, north, east, south]) => Math.min(65, Math.min(east - west, south - north) * .16);

function trace(context, points, close = false) {
  context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  if (close) context.closePath();
}

function drawStreetLabels(context, roads, bounds, names) {
  const [west, north, east, south] = bounds;
  context.font = '600 7px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeStyle = '#f8faf6';
  context.lineWidth = 1.8;
  context.fillStyle = '#52676a';
  for (const name of names) {
    let best;
    for (const road of roads.filter(item => item.name === name)) {
      for (let index = 1; index < road.points.length; index++) {
        const [ax, az] = road.points[index - 1], [bx, bz] = road.points[index];
        const x = (ax + bx) / 2, z = (az + bz) / 2;
        if (x < west + 75 || x > east - 75 || z < north + 65 || z > south - 65) continue;
        const distance = Math.hypot(bx - ax, bz - az);
        if (!best || distance > best.distance) best = { x, z, distance, angle: Math.atan2(bz - az, bx - ax) };
      }
    }
    if (!best) continue;
    let { angle } = best;
    if (Math.abs(angle) > Math.PI / 2) angle -= Math.sign(angle) * Math.PI;
    context.save();
    context.translate(best.x, best.z);
    context.rotate(angle);
    context.strokeText(name, 0, 0);
    context.fillText(name, 0, 0);
    context.restore();
  }
}

function terrainTexture(data, buildings, muted) {
  const [west, north, east, south] = data.bounds;
  const width = east - west, depth = south - north;
  const canvas = document.createElement('canvas');
  const scale = (muted ? 1536 : 2304) / Math.max(width, depth);
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(depth * scale);
  const context = canvas.getContext('2d');
  context.setTransform(canvas.width / width, 0, 0, canvas.height / depth, -west * canvas.width / width, -north * canvas.height / depth);
  context.fillStyle = TERRAIN_COLOR;
  context.fillRect(west, north, width, depth);
  for (const { kind, rings } of data.areas) {
    context.fillStyle = areaColors[kind];
    context.beginPath();
    for (const ring of rings) trace(context, ring, true);
    context.fill('evenodd');
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const { kind, width, edge, fill } of roadStyles) {
    context.beginPath();
    for (const road of data.roads) if (road.kind === kind) trace(context, road.points);
    if (edge) {
      context.strokeStyle = edge; context.lineWidth = width + 1.5;
      context.stroke();
    }
    context.strokeStyle = fill; context.lineWidth = width;
    context.stroke();
  }
  context.save();
  context.translate(1.6, 2.1);
  context.fillStyle = '#52676b25';
  for (const { rings } of buildings) {
    context.beginPath();
    for (const ring of rings) trace(context, ring, true);
    context.fill('evenodd');
  }
  context.restore();
  if (!muted) drawStreetLabels(context, data.roads, data.bounds, data.streetNames ?? streetNames);
  const fade = fadeWidth(data.bounds);
  for (const [x, z, dx, dz] of [[west, north, 1, 0], [east, north, -1, 0], [west, north, 0, 1], [west, south, 0, -1]]) {
    const gradient = context.createLinearGradient(x, z, x + dx * fade, z + dz * fade);
    gradient.addColorStop(0, TERRAIN_COLOR);
    gradient.addColorStop(1, TERRAIN_COLOR + '00');
    context.fillStyle = gradient;
    context.fillRect(west, north, width, depth);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function reliefHeight(building, muted) {
  if (building.id === D21_WAY) return muted ? .1 : 4.2;
  if (muted) return .075;
  return building.height ? THREE.MathUtils.clamp(building.height * .38, 1.4, 8.5) : 2.4;
}

function buildingRelief(buildings, bounds, muted) {
  const [west, north, east, south] = bounds;
  const fade = fadeWidth(bounds);
  const terrain = new THREE.Color(TERRAIN_COLOR);
  const shaded = new THREE.Color();
  const colors = {
    normal: [new THREE.Color('#d3d9d7'), new THREE.Color('#b9c4c2')],
    campus: [new THREE.Color('#b7c9c2'), new THREE.Color('#94aaa4')],
    d21: [new THREE.Color('#648e83'), new THREE.Color('#456c62')],
  };
  const parts = [];
  for (const building of buildings) {
    const [outline, ...holes] = building.rings.map(ring => ring.map(([x, z]) => new THREE.Vector2(x, -z)));
    const shape = new THREE.Shape(outline);
    shape.holes = holes.map(points => new THREE.Path(points));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: reliefHeight(building, muted), bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    const color = colors[building.id === D21_WAY ? 'd21' : building.campus ? 'campus' : 'normal'];
    const positions = geometry.attributes.position;
    const values = new Float32Array(positions.count * 3);
    for (const { start, count, materialIndex } of geometry.groups) {
      for (let index = start; index < start + count; index++) {
        const x = positions.getX(index), z = positions.getZ(index);
        const strength = THREE.MathUtils.clamp(Math.min(x - west, east - x, z - north, south - z) / fade, 0, 1);
        shaded.copy(terrain).lerp(color[materialIndex], strength).toArray(values, index * 3);
        positions.setY(index, positions.getY(index) * strength);
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
    parts.push(geometry);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
}

export function mountCampusTerrain(group, data, { outline, subdued }, keep) {
  const [west, north, east, south] = data.bounds;
  const buildings = data.buildings.filter(item => outline || item.id !== D21_WAY);
  const texture = keep(terrainTexture(data, buildings, subdued));
  const surface = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(east - west, south - north)),
    keep(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.set((east + west) / 2, 0, (south + north) / 2);
  surface.name = 'Campus-Grundkarte';
  if (!buildings.length) { group.add(surface); return; }
  const relief = buildingRelief(buildings, data.bounds, subdued);
  keep(relief.geometry); keep(relief.material);
  relief.position.y = .012;
  relief.name = 'Campus-Gebäudekörper';
  group.add(surface, relief);
}
