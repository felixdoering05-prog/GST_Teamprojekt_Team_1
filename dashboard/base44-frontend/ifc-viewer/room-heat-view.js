import { Box3, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Plane, Vector3 } from 'three';
import { makeFloorPlan, readRoomFootprints, roomOverlayGeometry } from './room-floor-geometry.js';
import { ROOM_NO_DATA, roomHeatColor } from './room-heat-colors.js';

export function mountRoomHeatView({ api, modelID, scene, root, spatial, storeys, elementTypes, renderer, campus, fit, render }) {
  const roomsByFloor = readRoomFootprints(api, modelID, spatial, root.matrixWorld);
  const geometryByFloor = new Map(storeys.map(floor => [floor.id, floor]));
  const floors = spatial.storeys.filter(floor => roomsByFloor.has(floor.id) || (!campus && geometryByFloor.has(floor.id))).map(floor => {
    const rooms = roomsByFloor.get(floor.id) || [];
    const bases = rooms.map(room => room.base).sort((a, b) => a - b);
    const geometry = geometryByFloor.get(floor.id);
    return { id: floor.id, name: floor.name, rooms, base: bases[Math.floor(bases.length / 2)] ?? geometry.base, top: geometry?.top ?? Infinity };
  }).sort((a, b) => a.base - b.base);
  for (const [index, floor] of floors.entries()) {
    const next = floors.slice(index + 1).find(item => item.base > floor.base + .3);
    floor.cut = Math.max(floor.base + .12, Math.min(floor.base + 1.65, floor.top, (next?.base ?? Infinity) - .08));
  }

  const boundsByMesh = new Map(root.children.map(mesh => [mesh, new Box3().setFromObject(mesh)]));
  const overlays = new Group();
  scene.add(overlays);
  const material = new MeshBasicMaterial({ color: ROOM_NO_DATA, side: DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const selectionMaterial = new LineBasicMaterial({ color: '#172c40', toneMapped: false });
  const selection = new LineSegments(undefined, selectionMaterial);
  selection.visible = false;
  selection.position.y = .008;
  scene.add(selection);
  const readout = document.createElement('div');
  readout.id = 'room-heat-readout';
  readout.setAttribute('role', 'status');
  readout.hidden = true;
  document.body.append(readout);
  const cachedPlans = new Map();
  const send = (type, data) => window.parent.postMessage({ type, ...data }, location.origin);
  let activeFloor, activeRoom;

  function clearOverlays() {
    for (const mesh of [...overlays.children]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      overlays.remove(mesh);
    }
  }

  function showFloor(floor) {
    activeFloor = floor;
    clearOverlays();
    const bottom = floor.base - .32;
    const bounds = new Box3();
    renderer.clippingPlanes = [
      new Plane(new Vector3(0, 1, 0), -bottom),
      new Plane(new Vector3(0, -1, 0), floor.cut),
    ];
    for (const [mesh, box] of boundsByMesh) {
      mesh.visible = box.min.y <= floor.cut && box.max.y >= bottom;
      if (mesh.visible) bounds.union(box);
    }
    for (const room of floor.rooms) {
      const overlay = new Mesh(roomOverlayGeometry(room), material.clone());
      overlay.userData.roomID = room.id;
      overlays.add(overlay);
    }
    if (!cachedPlans.has(floor.id)) cachedPlans.set(floor.id, makeFloorPlan(floor, root.children, boundsByMesh, elementTypes));
    const plan = cachedPlans.get(floor.id);
    if (plan) {
      const [x, z, width, depth] = plan.viewBox;
      bounds.min.set(x, bottom, z);
      bounds.max.set(x + width, floor.cut, z + depth);
    }
    if (!bounds.isEmpty()) fit(false, bounds);
    send('d21-room-heat-plan', { floorId: floor.id, plan });
  }

  function receive(event) {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'd21-room-heat-state') return;
    const { floorId, roomId, values, roomLabel } = event.data;
    const floor = floors.find(item => item.id === floorId);
    if (!floor) return;
    const changedFloor = activeFloor !== floor;
    if (changedFloor) showFloor(floor);
    const selectedMesh = overlays.children.find(mesh => mesh.userData.roomID === roomId);
    for (const mesh of overlays.children) {
      mesh.material.color.set(roomHeatColor(values?.[mesh.userData.roomID]));
    }
    if (changedFloor || activeRoom !== roomId) {
      selection.geometry.dispose();
      if (selectedMesh) selection.geometry = new EdgesGeometry(selectedMesh.geometry);
      selection.visible = Boolean(selectedMesh);
      activeRoom = roomId;
    }
    const value = values?.[roomId];
    readout.hidden = !selectedMesh;
    readout.textContent = selectedMesh ? `Raum ${roomLabel} · ${Number.isFinite(value) ? value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' °C' : 'Kein Messwert'}` : '';
    render();
  }

  window.addEventListener('message', receive);
  send('d21-room-heat-floors', {
    floors: floors.map(({ id, name, rooms }) => ({
      id, name, rooms: rooms.map(({ id, number, globalIds }) => ({ id, number, globalIds })),
    })),
  });
  return {
    fit(top) {
      if (!activeFloor) return fit(top);
      const plan = cachedPlans.get(activeFloor.id);
      if (!plan) return fit(top);
      const [x, z, width, depth] = plan.viewBox;
      fit(top, new Box3(new Vector3(x, activeFloor.base, z), new Vector3(x + width, activeFloor.cut, z + depth)));
    },
    pick(ray) {
      const room = ray.intersectObjects(overlays.children, false)[0]?.object.userData.roomID;
      if (room === undefined || !activeFloor) return;
      send('d21-room-heat-selected', { floorId: activeFloor.id, roomId: room === activeRoom ? null : room });
    },
    dispose() {
      window.removeEventListener('message', receive);
      clearOverlays();
      material.dispose();
      selection.geometry.dispose();
      selectionMaterial.dispose();
      scene.remove(selection);
      readout.remove();
      scene.remove(overlays);
    },
  };
}
