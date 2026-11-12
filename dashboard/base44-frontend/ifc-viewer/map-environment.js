import * as THREE from 'three';
import { campusPoint } from './campus-projection.js';
import { mountCampusTerrain, TERRAIN_COLOR } from './campus-terrain.js';

function enclosesAnchor(ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [ax, az] = ring[previous], [bx, bz] = ring[index];
    if ((az > 0) !== (bz > 0) && 0 < ax - (bx - ax) * az / (bz - az)) inside = !inside;
  }
  return inside;
}

export function terrainFromModelMap(view) {
  const origin = [view.longitude, view.latitude];
  const extent = Number.isFinite(view.area_width_m) && view.area_width_m > 0 ? view.area_width_m / 2 : 200;
  const bounds = [-extent, -extent, extent, extent];
  const buildings = [], roads = [], areas = [], names = new Map();
  for (const [index, feature] of view.features.entries()) {
    const points = feature.geometry.map(point => campusPoint(point, origin));
    if (feature.kind === 'road') {
      const kind = feature.width <= 2 ? 'path' : feature.width <= 4 ? 'service' : feature.width <= 7 ? 'local' : 'main';
      roads.push({ kind, points, name: feature.name });
      if (feature.name && (kind === 'main' || kind === 'local')) {
        const length = points.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - points[i][0], z - points[i][1]), 0);
        names.set(feature.name, (names.get(feature.name) || 0) + length);
      }
    } else if (feature.kind === 'building') {
      if (!enclosesAnchor(points)) buildings.push({ id: index, rings: [points.slice(0, -1)], height: feature.height });
    } else if (feature.kind === 'green') areas.push({ kind: 'green', rings: [points.slice(0, -1)] });
  }
  const streetNames = [...names].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
  return { buildings, roads, areas, bounds, streetNames };
}

export function mountMapEnvironment(scene, groundY, render, { visible = true } = {}) {
  const note = document.querySelector('#map-attribution');
  let revision, group, mapBounds, resources = [];

  function dispose() {
    if (group) scene.remove(group);
    for (const resource of resources) resource.dispose();
    group = null;
    mapBounds = null;
    resources = [];
    if (note) note.hidden = true;
  }

  return {
    get bounds() { return mapBounds; },
    setVisible(value) {
      visible = value;
      if (group) group.visible = visible;
      if (note) note.hidden = !visible || !group;
    },
    setView(view) {
      const current = view?.revision ?? null;
      if (current === revision || Number.isInteger(revision) && (current === null || current < revision)) return;
      revision = current;
      dispose();
      if (!view?.features?.length || !Number.isFinite(view.meters_per_unit) || view.meters_per_unit <= 0) {
        render();
        return;
      }
      const data = terrainFromModelMap(view);
      const extent = data.bounds[2];
      group = new THREE.Group();
      group.position.y = groundY;
      group.rotation.y = view.heading * Math.PI / 180;
      group.scale.setScalar(1 / view.meters_per_unit);
      group.visible = visible;
      const keep = resource => { resources.push(resource); return resource; };
      const ground = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(extent * 8, extent * 8)),
        keep(new THREE.MeshBasicMaterial({ color: TERRAIN_COLOR, toneMapped: false })),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -.04;
      group.add(ground);
      mountCampusTerrain(group, data, { outline: false, subdued: false }, keep);
      scene.add(group);
      group.updateMatrixWorld();
      mapBounds = new THREE.Box3(new THREE.Vector3(-extent * .83, 0, -extent * .83), new THREE.Vector3(extent * .83, 8, extent * .83)).applyMatrix4(group.matrixWorld);
      if (note) {
        const attribution = document.createElement('a');
        attribution.href = 'https://www.openstreetmap.org/copyright';
        attribution.textContent = '© OpenStreetMap-Mitwirkende';
        attribution.target = '_blank';
        attribution.rel = 'noopener';
        note.replaceChildren(attribution, document.createTextNode(' · Gelände vereinfacht'));
        note.hidden = !visible;
      }
      render();
    },
    dispose,
  };
}
