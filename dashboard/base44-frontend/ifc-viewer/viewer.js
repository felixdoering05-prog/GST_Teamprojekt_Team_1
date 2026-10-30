import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IfcAPI, IFCSPACE } from 'web-ifc';
import { ElementAppearance } from './interactions.js';

const status = document.querySelector('#status');
const panel = document.querySelector('#selection');
const buttons = [...document.querySelectorAll('button')];
buttons.forEach(button => button.disabled = true);
let api, modelID, renderer, controls, root, scene, camera;
const appearance = new ElementAppearance();
const info = document.querySelector('#selection-info');
const home = document.querySelector('#home');
const roomsPanel = document.querySelector('#rooms');
let roomEffects;
let destroyed = false;
const maxVertices = 1_000_000;
const maxMeshes = 10_000;
const report = message => window.webkit?.messageHandlers.ifcState?.postMessage(message);
function release() {
  if (destroyed) return;
  destroyed = true;
  controls?.dispose();
  root?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  roomEffects?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  renderer?.dispose();
  if (api && modelID !== undefined) { api.CloseModel(modelID); modelID = undefined; }
}
function fail(error) {
  release();
  document.querySelectorAll('button, input').forEach(control => control.disabled = true);
  status.hidden = false; status.className = 'error';
  status.textContent = error?.message || 'Das IFC-Modell konnte nicht geöffnet werden.';
  report(`error:${status.textContent}`);
}
window.addEventListener('error', event => fail(event.error));
window.addEventListener('unhandledrejection', event => fail(event.reason));
window.addEventListener('pagehide', release);
window.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('Der Grafikspeicher reicht nicht aus. Bitte ein kleineres IFC-Modell öffnen.')); }, true);

async function open() {
  // The parent authenticates the download. Only IFC bytes enter the viewer, never a session token.
  const bytes = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('Das Modell wurde nicht übertragen. Bitte erneut öffnen.')); }, 60000);
    function receive(event) {
      if (event.source !== window.parent || event.origin !== location.origin) return;
      if (event.data?.type === 'd21-ifc-request') { window.parent.postMessage({ type: 'd21-ifc-ready' }, location.origin); return; }
      if (event.data?.type !== 'd21-ifc-model') return;
      const buffer = event.data.buffer;
      if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength || buffer.byteLength > 20 * 1024 * 1024) return;
      clearTimeout(timer); window.removeEventListener('message', receive); resolve(new Uint8Array(buffer));
    }
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'd21-ifc-ready' }, location.origin);
  });
  const header = new TextDecoder().decode(bytes.subarray(0, 4096));
  if (!header.trimStart().startsWith('ISO-10303-21;') || !header.includes('FILE_SCHEMA')) throw new Error('Bitte eine unkomprimierte IFC-Datei auswählen (IFC2x3 oder IFC4).');
  api = new IfcAPI();
  await api.Init(path => new URL(path, location.href).href, true);
  modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  if (modelID < 0 || !api.IsModelOpen(modelID)) throw new Error('Das IFC-Format wird nicht unterstützt oder die Datei ist beschädigt.');
  scene = new THREE.Scene(); scene.background = new THREE.Color('#eef3f5');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x687c86, 2.8));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(10, 20, 15); scene.add(light);
  root = new THREE.Group(); scene.add(root);
  let vertices = 0, meshes = 0;
  api.StreamAllMeshes(modelID, flat => {
    for (let i = 0; i < flat.geometries.size(); i++) {
      const placed = flat.geometries.get(i);
      const data = api.GetGeometry(modelID, placed.geometryExpressID);
      try {
        const source = api.GetVertexArray(data.GetVertexData(), data.GetVertexDataSize());
        const indices = api.GetIndexArray(data.GetIndexData(), data.GetIndexDataSize());
        if (!source.length || !indices.length) continue;
        vertices += source.length / 6; meshes++;
        if (vertices > maxVertices || meshes > maxMeshes) throw new Error('Dieses Modell ist für die erste mobile Version zu groß. Bitte ein einzelnes Geschoss oder einen kleineren IFC-Ausschnitt exportieren.');
        const positions = new Float32Array(source.length / 2), normals = new Float32Array(source.length / 2);
        for (let v = 0, p = 0; v < source.length; v += 6, p += 3) {
          positions.set(source.subarray(v, v + 3), p); normals.set(source.subarray(v + 3, v + 6), p);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
        const color = placed.color;
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color.x, color.y, color.z), opacity: color.w, transparent: color.w < 1, side: THREE.DoubleSide, roughness: .8 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
        mesh.userData.expressID = flat.expressID;
        root.add(mesh);
        appearance.add(flat.expressID, mesh);
      } finally { data.delete(); }
    }
  });
  if (!meshes) throw new Error('In dieser IFC-Datei wurde keine darstellbare 3D-Geometrie gefunden.');
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  if (![center.x, center.y, center.z].every(Number.isFinite)) throw new Error('Die Modell-Koordinaten sind ungültig.');
  root.position.sub(center);
  const span = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), .1);
  camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, span / 10000, span * 100);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
  document.querySelector('#scene').append(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = span / 100; controls.maxDistance = span * 20;
  function fit(top = false) {
    const distance = span * .625 / Math.tan(THREE.MathUtils.degToRad(22.5)) / Math.min(camera.aspect, 1);
    camera.up.set(0, 1, 0); camera.position.copy(top ? new THREE.Vector3(0, distance, distance * .001) : new THREE.Vector3(distance * .7, distance * .55, distance * .7));
    controls.target.set(0, 0, 0); controls.update();
  }
  fit();
  document.querySelector('#fit').onclick = () => fit();
  document.querySelector('#top').onclick = () => fit(true);
  controls.addEventListener('change', () => renderer.render(scene, camera));
  const observer = new ResizeObserver(() => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); renderer.render(scene, camera);
  }); observer.observe(document.body);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  const render = () => renderer.render(scene, camera);
  const text = value => typeof value?.value === 'string' ? value.value : '';
  function updateSelection() {
    const id = appearance.selectedID;
    panel.hidden = id === undefined;
    if (id !== undefined) {
      const line = api.GetLine(modelID, id, false);
      info.textContent = [text(line.Name) || 'Bauteil', api.GetNameFromTypeCode(line.type), `IFC-ID: ${id}`, text(line.GlobalId)].filter(Boolean).join('\n');
      document.querySelector('#color').value = '#' + appearance.elements.get(id)[0].material.color.getHexString();
    }
    document.querySelector('#show-all').textContent = appearance.hiddenCount ? `Alles anzeigen (${appearance.hiddenCount})` : 'Alles anzeigen';
    render();
  }
  const ray = new THREE.Raycaster();
  function pick(x, y) {
    ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), camera);
    appearance.select(ray.intersectObjects(appearance.visibleMeshes, false)[0]?.object.userData.expressID);
    updateSelection();
  }
  // Cancel long presses during rotation, multi-touch, pointer cancellation or page exit.
  let down, holdTimer, held = false;
  const pointers = new Set();
  function cancelHold() { clearTimeout(holdTimer); holdTimer = undefined; }
  renderer.domElement.addEventListener('pointerdown', event => {
    pointers.add(event.pointerId); cancelHold();
    if (pointers.size !== 1) { down = undefined; return; }
    down = { x: event.clientX, y: event.clientY }; held = false;
    holdTimer = setTimeout(() => { if (down && pointers.size === 1) { held = true; pick(down.x, down.y); } }, 550);
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) { cancelHold(); down = undefined; }
  });
  window.addEventListener('pointerup', event => {
    pointers.delete(event.pointerId); cancelHold();
    if (event.target === renderer.domElement && down && !held) pick(event.clientX, event.clientY);
    down = undefined;
  });
  window.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); cancelHold(); down = undefined; });
  renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('pagehide', cancelHold, { once: true });
  document.querySelector('#color').addEventListener('input', event => { appearance.color(event.target.value); render(); });
  document.querySelector('#hide').onclick = () => { appearance.hide(); updateSelection(); };
  document.querySelector('#close-selection').onclick = () => { appearance.select(undefined); updateSelection(); };
  document.querySelector('#show-all').onclick = () => { appearance.showAll(); updateSelection(); };
  document.querySelector('#reset-colors').onclick = () => { appearance.resetColors(); updateSelection(); };
  function mode(smart) {
    home.hidden = !smart;
    document.querySelector('#tools').hidden = smart;
    document.querySelector('#model-mode').setAttribute('aria-pressed', String(!smart));
    document.querySelector('#home-mode').setAttribute('aria-pressed', String(smart));
    appearance.select(undefined); updateSelection();
  }
  document.querySelector('#model-mode').onclick = () => mode(false);
  document.querySelector('#home-mode').onclick = () => mode(true);
  roomEffects = new THREE.Group(); scene.add(roomEffects);
  const spaceIDs = api.GetLineIDsWithType(modelID, IFCSPACE);
  let roomVertices = 0, roomMeshes = 0;
  for (let n = 0; n < spaceIDs.size(); n++) {
    const id = spaceIDs.get(n), line = api.GetLine(modelID, id, false);
    const row = document.createElement('div'); row.className = 'room';
    const label = document.createElement('span');
    label.textContent = [text(line.Name), text(line.LongName)].filter(Boolean).join(' · ') || `Raum ${n + 1}`;
    row.append(label);
    const meshes = [], flat = api.GetFlatMesh(modelID, id);
    for (let i = 0; i < flat.geometries.size(); i++) {
      const placed = flat.geometries.get(i), data = api.GetGeometry(modelID, placed.geometryExpressID);
      try {
        const source = api.GetVertexArray(data.GetVertexData(), data.GetVertexDataSize());
        const indices = api.GetIndexArray(data.GetIndexData(), data.GetIndexDataSize());
        if (!source.length || !indices.length) continue;
        roomVertices += source.length / 6; roomMeshes++;
        if (roomVertices > maxVertices || roomMeshes > maxMeshes) continue;
        const positions = new Float32Array(source.length / 2);
        for (let v = 0, p = 0; v < source.length; v += 6, p += 3) positions.set(source.subarray(v, v + 3), p);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
        const material = new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false });
        const effect = new THREE.Mesh(geometry, material);
        effect.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
        effect.position.sub(center); effect.visible = false;
        roomEffects.add(effect); meshes.push(effect);
      } finally { data.delete(); }
    }
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', 'false');
    toggle.setAttribute('aria-label', `Licht simulieren: ${label.textContent}`);
    toggle.textContent = meshes.length ? 'Licht aus' : 'Ohne Raumgeometrie'; toggle.disabled = !meshes.length;
    toggle.onclick = () => {
      const on = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(on)); toggle.textContent = on ? 'Licht an' : 'Licht aus';
      meshes.forEach(mesh => mesh.visible = on); render();
    };
    row.append(toggle); roomsPanel.append(row);
  }
  if (!spaceIDs.size()) roomsPanel.textContent = 'Keine Räume im IFC erkannt. Bitte in Revit Räume anlegen und beim IFC-Export die Raumgeometrie (IFCSPACE) einschließen. Wände allein enthalten noch keine Raumzuordnung.';
  buttons.forEach(button => button.disabled = false);
  if (new URLSearchParams(location.search).get('mode') === 'smart-home') mode(true);
  status.hidden = true;
  renderer.render(scene, camera);
  report(`ready:${meshes}`);
}
open().catch(fail);
