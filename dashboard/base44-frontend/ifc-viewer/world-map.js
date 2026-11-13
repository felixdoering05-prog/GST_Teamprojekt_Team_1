import * as THREE from 'three';
import { coordinateTile, tilePosition } from './campus-projection.js';

// Preserve the consented overview for buildings that have coordinates and no saved terrain yet.
export function addWorldMap(scene, center, groundY) {
  const group = new THREE.Group();
  scene.add(group);
  const zoom = 19, count = 2 ** zoom;
  const [middleX, middleY] = coordinateTile(center, zoom);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const tiles = [];
  const bounds = new THREE.Box3();
  const warning = document.querySelector('#map-status');
  const retry = document.querySelector('#map-retry');
  const loader = new THREE.TextureLoader().setCrossOrigin('anonymous');
  const frustum = new THREE.Frustum();
  const view = new THREE.Matrix4();
  let disposed = false, render = () => {};
  for (let y = middleY - 1; y <= middleY + 1; y++) {
    if (y < 0 || y >= count) continue;
    for (let x = middleX - 1; x <= middleX + 1; x++) {
      const { x: east, z: south, size } = tilePosition(x, y, zoom, center);
      const material = new THREE.MeshBasicMaterial({ color: '#eceeea', toneMapped: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(east, groundY - .03, south);
      mesh.scale.set(size, size, 1);
      group.add(mesh);
      const box = new THREE.Box3(
        new THREE.Vector3(east - size / 2, groundY - .1, south - size / 2),
        new THREE.Vector3(east + size / 2, groundY + .1, south + size / 2),
      );
      bounds.union(box);
      tiles.push({ mesh, box, x: ((x % count) + count) % count, y, state: 'idle' });
    }
  }
  function retryTiles() {
    for (const tile of tiles) if (tile.state === 'error') tile.state = 'idle';
    render();
  }
  return {
    bounds: bounds.expandByScalar(4),
    setVisible(visible) {
      group.visible = visible;
      if (!visible && warning) warning.hidden = true;
      if (visible) {
        const note = document.querySelector('#map-attribution');
        const attribution = document.createElement('a');
        attribution.href = 'https://www.openstreetmap.org/copyright';
        attribution.textContent = '© OpenStreetMap-Mitwirkende';
        attribution.target = '_blank';
        attribution.rel = 'noreferrer';
        note.replaceChildren(attribution);
        note.hidden = false;
        if (retry) retry.onclick = retryTiles;
      }
    },
    update(camera, repaint) {
      if (!group.visible || disposed) return;
      render = repaint;
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      let failed = false;
      for (const tile of tiles) {
        tile.mesh.visible = frustum.intersectsBox(tile.box);
        if (!tile.mesh.visible) continue;
        if (tile.state === 'error') failed = true;
        if (tile.state !== 'idle') continue;
        tile.state = 'loading';
        loader.load(`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`, texture => {
          if (disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          tile.mesh.material.map = texture;
          tile.mesh.material.needsUpdate = true;
          tile.state = 'ready';
          if (group.visible) render();
        }, undefined, () => {
          if (disposed) return;
          tile.state = 'error';
          if (group.visible) render();
        });
      }
      if (warning) warning.hidden = !failed;
    },
    dispose() {
      disposed = true;
      scene.remove(group);
      geometry.dispose();
      for (const { mesh } of tiles) {
        mesh.material.map?.dispose();
        mesh.material.dispose();
      }
      if (retry?.onclick === retryTiles) retry.onclick = null;
    },
  };
}
