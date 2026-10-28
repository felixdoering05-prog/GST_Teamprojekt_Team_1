import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IfcAPI } from 'web-ifc';

const status = document.querySelector('#status');
const panel = document.querySelector('#selection');
const buttons = [...document.querySelectorAll('button')];
buttons.forEach(button => button.disabled = true);
let api, modelID, renderer, controls, root, scene, camera, selected;
let destroyed = false;
const maxVertices = 1_000_000;
const maxMeshes = 10_000;
const report = message => window.webkit?.messageHandlers.ifcState?.postMessage(message);
function release() {
  if (destroyed) return;
  destroyed = true;
  controls?.dispose();
  root?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  renderer?.dispose();
  if (api && modelID !== undefined) { api.CloseModel(modelID); modelID = undefined; }
}
function fail(error) {
  release();
  buttons.forEach(button => button.disabled = true);
  status.hidden = false; status.className = 'error';
  status.textContent = error?.message || 'Das IFC-Modell konnte nicht geöffnet werden.';
  report(`error:${status.textContent}`);
}
window.addEventListener('error', event => fail(event.error));
window.addEventListener('unhandledrejection', event => fail(event.reason));
window.addEventListener('pagehide', release);
window.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('Der Grafikspeicher reicht nicht aus. Bitte ein kleineres IFC-Modell öffnen.')); }, true);

async function open() {
  const response = await fetch('model.ifc');
  if (!response.ok) throw new Error('Die IFC-Datei konnte nicht gelesen werden.');
  const bytes = new Uint8Array(await response.arrayBuffer());
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
  const ray = new THREE.Raycaster(); let down;
  renderer.domElement.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener('click', event => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    ray.setFromCamera(new THREE.Vector2(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2), camera);
    const hit = ray.intersectObjects(root.children)[0];
    if (selected) selected.material.emissive.set(0);
    selected = hit?.object; panel.hidden = !selected;
    if (selected) {
      selected.material.emissive.set(0x136c76);
      const line = api.GetLine(modelID, selected.userData.expressID, false);
      const text = value => typeof value?.value === 'string' ? value.value : '';
      panel.textContent = [text(line.Name) || 'Bauteil', api.GetNameFromTypeCode(line.type), `IFC-ID: ${selected.userData.expressID}`, text(line.GlobalId)].filter(Boolean).join('\n');
    }
    renderer.render(scene, camera);
  });
  buttons.forEach(button => button.disabled = false);
  status.hidden = true;
  renderer.render(scene, camera);
  report(`ready:${meshes}`);
}
open().catch(fail);
