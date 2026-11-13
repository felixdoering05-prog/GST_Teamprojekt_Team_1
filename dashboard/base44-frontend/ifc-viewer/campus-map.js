import * as THREE from 'three';
import locations from './campus-locations.json';
import footprint from './d21-footprint.json';
import { campusPoint } from './campus-projection.js';
import { D21_WAY, TERRAIN_COLOR, mountCampusTerrain, reliefHeight } from './campus-terrain.js';

const terrainURL = '/campus-data/campus-terrain.json';
const overviewLabels = new Set(['D21', 'A10', 'A20', 'B10', 'C10', 'D10', 'D22']);

function labelSprite(code, keep) {
  const primary = code === 'D21';
  const canvas = document.createElement('canvas');
  canvas.width = 144;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = primary ? '#365c55' : '#f5f8f5';
  context.strokeStyle = primary ? '#f5f8f5' : '#c4d1cd';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(2, 2, 140, 60, 17);
  context.fill();
  context.stroke();
  context.fillStyle = primary ? '#fff' : '#3d5359';
  context.font = '650 33px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(code, 72, 33);
  const texture = keep(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = keep(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false }));
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = primary ? 7 : 6;
  if (primary) sprite.center.y = -.26;
  return sprite;
}

export function addCampusMap(scene, { groundY = 0, outline = false, subdued = false } = {}) {
  const group = new THREE.Group();
  group.position.y = groundY - .03;
  scene.add(group);
  const resources = new Set();
  const keep = resource => { resources.add(resource); return resource; };
  const background = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(6000, 6000)),
    keep(new THREE.MeshBasicMaterial({ color: TERRAIN_COLOR, toneMapped: false })),
  );
  background.rotation.x = -Math.PI / 2;
  background.position.y = -.028;
  group.add(background);

  let marker;
  if (outline) {
    const points = footprint.coordinates.map(coordinate => {
      const [x, z] = campusPoint(coordinate);
      return new THREE.Vector2(x, -z);
    });
    marker = new THREE.Mesh(
      keep(new THREE.ShapeGeometry(new THREE.Shape(points))),
      keep(new THREE.MeshBasicMaterial({ color: '#648e83', toneMapped: false })),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = .03;
    group.add(marker);
  }
  const labelGroup = new THREE.Group();
  group.add(labelGroup);
  const campusBounds = new THREE.Box3();
  const labels = locations.buildings.filter(building => building.code !== 'D21' || outline || !subdued).sort((a, b) =>
    Number(b.code === 'D21') - Number(a.code === 'D21') ||
    Number(overviewLabels.has(b.code)) - Number(overviewLabels.has(a.code))).map(building => {
    const [x, z] = campusPoint(building.coordinates);
    const sprite = labelSprite(building.code, keep);
    const primary = building.code === 'D21';
    sprite.position.set(x, primary ? (outline ? 6 : 16) : 3.5, z);
    labelGroup.add(sprite);
    campusBounds.expandByPoint(new THREE.Vector3(x, groundY, z));
    return { sprite, code: building.code, primary, overview: overviewLabels.has(building.code) };
  });
  campusBounds.expandByScalar(45);
  const warning = document.querySelector('#map-status');
  const retry = document.querySelector('#map-retry');
  let request, loaded = false, failed = false, disposed = false, repaint = () => {};
  const projected = new THREE.Vector3();

  async function load() {
    request = new AbortController();
    try {
      const response = await fetch(terrainURL, { signal: request.signal });
      if (!response.ok) throw new Error('Campus-Geodaten fehlen.');
      const data = await response.json();
      if (disposed) return;
      mountCampusTerrain(group, data, { outline, subdued }, keep);
      if (marker) {
        marker.visible = false;
        const d21 = data.buildings.find(item => item.id === D21_WAY);
        if (d21) labels[0].sprite.position.y = reliefHeight(d21, subdued) + 1.3;
      }
      loaded = true;
    } catch {
      if (!disposed) failed = true;
    } finally {
      request = null;
      if (!disposed && group.visible) repaint();
    }
  }
  if (retry) {
    retry.disabled = false;
    retry.onclick = () => { failed = false; repaint(); };
  }

  function layoutLabels(camera) {
    if (!labelGroup.visible) return;
    group.updateMatrixWorld();
    camera.updateMatrixWorld();
    const metresPerPixel = (camera.top - camera.bottom) / (camera.zoom * Math.max(innerHeight, 1));
    const detailed = metresPerPixel < .72;
    const visible = [];
    const displayed = new Set();
    for (const { sprite, code, primary, overview } of labels) {
      const width = primary ? 50 : 35, height = width / 2.25;
      projected.setFromMatrixPosition(sprite.matrixWorld).project(camera);
      const x = (projected.x + 1) * innerWidth / 2;
      const y = (1 - projected.y) * innerHeight / 2 + (sprite.center.y - .5) * height;
      sprite.visible = (primary || detailed || overview) && projected.z >= -1 && projected.z <= 1 &&
        (detailed || !displayed.has(code)) &&
        x > width / 2 && x < innerWidth - width / 2 && y > height / 2 && y < innerHeight - height / 2 &&
        !visible.some(label => Math.abs(label.x - x) < (label.width + width) / 2 + 5 &&
          Math.abs(label.y - y) < (label.height + height) / 2 + 5);
      if (!sprite.visible) continue;
      displayed.add(code);
      visible.push({ x, y, width, height });
      sprite.scale.set(width * metresPerPixel, height * metresPerPixel, 1);
    }
  }

  return {
    bounds: campusBounds,
    setVisible(visible) {
      group.visible = visible;
      if (!visible && warning) warning.hidden = true;
    },
    setLabels(visible) { labelGroup.visible = visible; },
    update(camera, render) {
      if (!group.visible || disposed) return;
      repaint = render;
      if (!request && !loaded && !failed) void load();
      if (warning) warning.hidden = !failed;
      layoutLabels(camera);
    },
    dispose() {
      disposed = true;
      request?.abort();
      if (retry) retry.onclick = null;
      scene.remove(group);
      for (const resource of resources) resource.dispose();
    },
  };
}
