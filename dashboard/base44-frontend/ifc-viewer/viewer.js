import { mountMapEnvironment } from './map-environment.js';
import { mountSynchronization } from './sync.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IfcAPI, IFCSPACE, IFCWALL, IFCWALLSTANDARDCASE, IFCWALLELEMENTEDCASE, IFCDOOR, IFCWINDOW, IFCROOF, IFCSLAB } from 'web-ifc';
import { ElementAppearance } from './interactions.js';
import { mountCommands } from './commands.js';
import { exampleIFC } from './example.js';
import { readStoreys, floorCut } from './storeys.js';
import { addSurroundings } from './surroundings.js';

const isExample = new URLSearchParams(location.search).get('example') === 'true';

const status = document.querySelector('#status');
const panel = document.querySelector('#selection');
const buttons = [...document.querySelectorAll('button')];
buttons.forEach(button => button.disabled = true);
let api, modelID, renderer, controls, root, scene, camera;
const appearance = new ElementAppearance();
const elementTypes = new Map();
const info = document.querySelector('#selection-info');
const home = document.querySelector('#home');
const roomsPanel = document.querySelector('#rooms');
let roomEffects;
let releaseSurroundings;
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
  releaseSurroundings?.();
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
  const bytes = isExample ? exampleIFC() : await new Promise((resolve, reject) => {
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
  scene = new THREE.Scene(); scene.background = new THREE.Color('#e5e9ee');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8798b3, 2.6));
  const light = new THREE.DirectionalLight(0xfffbef, 2.5); scene.add(light);
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
        const type = api.GetLineType(modelID, flat.expressID);
        const previewColor = type === IFCWINDOW ? '#264b8a' : type === IFCSLAB ? '#d9dfe5' : '#f0f0ec';
        const material = new THREE.MeshStandardMaterial({ color: isExample ? new THREE.Color(previewColor) : new THREE.Color(color.x, color.y, color.z), opacity: color.w, transparent: color.w < 1, side: THREE.DoubleSide, roughness: .85 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
        mesh.userData.expressID = flat.expressID;
        mesh.castShadow = true; mesh.receiveShadow = true;
        root.add(mesh);
        appearance.add(flat.expressID, mesh);

      } finally { data.delete(); }
    }
  });
  const categories = new Map([[IFCWALL,'walls'],[IFCWALLSTANDARDCASE,'walls'],[IFCWALLELEMENTEDCASE,'walls'],[IFCDOOR,'doors'],[IFCWINDOW,'windows'],[IFCROOF,'roofs'],[IFCSLAB,'slabs']]);
  for (const id of appearance.elements.keys()) elementTypes.set(id, categories.get(api.GetLineType(modelID,id)));
  if (!meshes) throw new Error('In dieser IFC-Datei wurde keine darstellbare 3D-Geometrie gefunden.');
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  if (![center.x, center.y, center.z].every(Number.isFinite)) throw new Error('Die Modell-Koordinaten sind ungültig.');
  root.position.sub(center);
  const span = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), .1);
  let viewHeight = span * 1.3 / Math.min(innerWidth / innerHeight, 1);
  let lastAspect = innerWidth / innerHeight;
  camera = new THREE.OrthographicCamera(-viewHeight * innerWidth / innerHeight / 2, viewHeight * innerWidth / innerHeight / 2, viewHeight / 2, -viewHeight / 2, span / 10000, span * 100);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
  document.querySelector('#scene').append(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.minZoom = .3; controls.maxZoom = 12;
  controls.maxPolarAngle = Math.PI * .49;
  root.updateMatrixWorld(true);
  const centeredBounds = new THREE.Box3().setFromObject(root);
  releaseSurroundings = addSurroundings(scene, centeredBounds, isExample);
  light.position.set(-span, span * 2, span * .6);
  light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, {left:-span*2,right:span*2,top:span*2,bottom:-span*2,near:.1,far:span*8});
  light.shadow.normalBias = .04;
  function frustum() {
    const aspect = innerWidth / innerHeight;
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }
  function fit(top = false) {
    const distance = span * 4;
    const modelBounds = new THREE.Box3().setFromObject(root);
    const target = modelBounds.getCenter(new THREE.Vector3());
    const modelSpan = Math.max(...modelBounds.getSize(new THREE.Vector3()).toArray(), .1);
    viewHeight = modelSpan * (isExample ? 1.9 : 1.45) / Math.min(innerWidth / innerHeight, 1);
    lastAspect = innerWidth / innerHeight;
    camera.zoom = 1; frustum();
    camera.up.set(0, 1, 0); camera.position.copy(target).add(top ? new THREE.Vector3(0, distance, distance * .001) : new THREE.Vector3(distance * .7, distance * .65, distance * .7));
    controls.target.copy(target); controls.update();
  }
  fit();
  document.querySelector('#fit').onclick = () => fit();
  document.querySelector('#top').onclick = () => fit(true);
  controls.addEventListener('change', () => render());
  const observer = new ResizeObserver(() => {
    const aspect = innerWidth / innerHeight;
    viewHeight *= Math.min(lastAspect, 1) / Math.min(aspect, 1); lastAspect = aspect;
    frustum(); renderer.setSize(innerWidth, innerHeight); render();
  }); observer.observe(document.body);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  let updateLabels = () => {};
  const render = () => { renderer.render(scene, camera); updateLabels(); };
  const applyMap = mountMapEnvironment(scene,centeredBounds.min.y-span*.001,render);
  for (const [id, factor] of [['zoom-in', 1.25], ['zoom-out', .8]]) document.getElementById(id).onclick = () => {
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, .3, 12); camera.updateProjectionMatrix(); render();
  };

  const spatial = readStoreys(api, modelID);
  const floorBounds = new Map();
  for (const [id, meshes] of appearance.elements) {
    const floorID = spatial.assignments.get(id);
    for (const mesh of meshes) {
      mesh.userData.basePosition = mesh.position.clone(); mesh.userData.storey = floorID;
      if (floorID === undefined) continue;
      if (!floorBounds.has(floorID)) floorBounds.set(floorID, new THREE.Box3());
      floorBounds.get(floorID).expandByObject(mesh);
    }
  }
  const storeys = spatial.storeys.filter(floor => floorBounds.has(floor.id)).map(floor => ({
    ...floor, base: floorBounds.get(floor.id).min.y, top: floorBounds.get(floor.id).max.y,
  }));
  for (const floor of storeys) {
    for (const mesh of root.children) {
      if (mesh.userData.storey !== floor.id || !['slabs', 'roofs'].includes(elementTypes.get(mesh.userData.expressID))) continue;
      const slab = new THREE.Box3().setFromObject(mesh);
      if (slab.min.y > floor.base + (floor.top - floor.base) * .5) floor.ceiling = Math.min(floor.ceiling ?? Infinity, slab.min.y);
    }
  }
  let selectedFloor = null, exploded = false;
  const gap = span * .14;
  const labelHost = document.querySelector('#labels');
  const titleLabel = document.createElement('div'); titleLabel.className = 'model-label';
  const marker = document.createElement('span'); marker.className = 'marker'; marker.textContent = isExample ? '3D' : 'IFC';
  const titleText = document.createElement('span'); const title = document.createElement('strong');
  title.textContent = isExample ? 'Beispielcampus' : 'Gebäudemodell';
  const subtitle = document.createElement('small'); subtitle.textContent = isExample ? 'Stilvorschau · keine D21-Geometrie' : `${meshes} Geometrien · ${storeys.length} Geschosse`;
  titleText.append(title, subtitle); titleLabel.append(marker, titleText); labelHost.append(titleLabel);
  const floorLabels = storeys.map(floor => {
    const label = document.createElement('div'); label.className = 'model-label floor-label'; label.textContent = floor.name; labelHost.append(label); return label;
  });
  const placeLabel = (label, point) => {
    point.project(camera);
    label.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > .95 || Math.abs(point.y) > .95;
    label.style.left = `${(point.x + 1) * innerWidth / 2}px`; label.style.top = `${(1 - point.y) * innerHeight / 2}px`;
  };
  updateLabels = () => {
    const displayedFloor = storeys.find(floor => floor.id === selectedFloor);
    const top = displayedFloor ? floorCut(storeys, selectedFloor, exploded ? gap : 0) : centeredBounds.max.y + (exploded ? Math.max(0, storeys.length - 1) * gap : 0);
    placeLabel(titleLabel, new THREE.Vector3(0, top + span * .09, 0));
    floorLabels.forEach((label, index) => {
      label.hidden = !exploded || (selectedFloor !== null && index > storeys.findIndex(floor => floor.id === selectedFloor));
      if (!label.hidden) {
        const point = floorBounds.get(storeys[index].id).getCenter(new THREE.Vector3());
        point.y = storeys[index].base + index * gap + .4;
        placeLabel(label, point);
      }
    });
  };
  function refreshView() {
    const cut = floorCut(storeys, selectedFloor, exploded ? gap : 0);
    renderer.clippingPlanes = cut === null ? [] : [new THREE.Plane(new THREE.Vector3(0, -1, 0), cut)];
    for (const mesh of root.children) {
      const index = storeys.findIndex(floor => floor.id === mesh.userData.storey);
      mesh.position.copy(mesh.userData.basePosition);
      if (exploded && index >= 0) mesh.position.y += index * gap;
    }
    roomEffects?.children.forEach(mesh => {
      const index = storeys.findIndex(floor => floor.id === spatial.assignments.get(mesh.userData.expressID));
      mesh.position.copy(mesh.userData.basePosition);
      if (exploded && index >= 0) mesh.position.y += index * gap;
    });
    root.updateMatrixWorld(true);
    document.querySelector('#all-floors').setAttribute('aria-pressed', String(selectedFloor === null));
    document.querySelector('#explode').setAttribute('aria-pressed', String(exploded));
    document.querySelectorAll('[data-floor]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.floor) === selectedFloor)));
    render();
  }
  const floorList = document.querySelector('#floor-list');
  [...storeys].reverse().forEach(floor => {
    const button = document.createElement('button'); button.textContent = floor.name; button.dataset.floor = String(floor.id); button.setAttribute('aria-pressed', 'false');
    button.onclick = () => { selectedFloor = floor.id; appearance.select(undefined); panel.hidden = true; refreshView(); };
    floorList.append(button);
  });
  document.querySelector('#floor-count').textContent = String(storeys.length);
  const mobile = window.matchMedia('(max-width: 600px)');
  const floorToggle = document.querySelector('#toggle-floors');
  function collapseFloors(collapsed) {
    floorToggle.setAttribute('aria-expanded', String(!collapsed));
    floorToggle.setAttribute('aria-label', collapsed ? 'Geschosse anzeigen' : 'Geschosse einklappen');
    for (const selector of ['#all-floors', '#floor-list', '#floor-note']) document.querySelector(selector).hidden = collapsed;
  }
  floorToggle.onclick = () => collapseFloors(floorToggle.getAttribute('aria-expanded') === 'true');
  const responsiveFloors = () => collapseFloors(mobile.matches);
  responsiveFloors(); mobile.addEventListener('change', responsiveFloors);
  window.addEventListener('pagehide', () => mobile.removeEventListener('change', responsiveFloors), { once: true });
  document.querySelector('#floor-note').textContent = storeys.length ? 'Etage wählen, um das Gebäude bis zu diesem Geschoss freizulegen.' : 'Keine Geschosszuordnung mit Geometrie im IFC vorhanden.';
  document.querySelector('#all-floors').onclick = () => { selectedFloor = null; refreshView(); };
  document.querySelector('#explode').onclick = () => { exploded = !exploded; refreshView(); fit(); render(); };
  document.querySelector('#toggle-labels').onclick = event => {
    labelHost.hidden = !labelHost.hidden; event.currentTarget.setAttribute('aria-pressed', String(!labelHost.hidden));
  };
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
  let synchronization; const roomLights = new Map();
  const changed = operation => synchronization?.change(operation);
  const cancelCommand = mountCommands({ appearance, types: elementTypes, update: updateSelection, changed, destroyed: () => destroyed });
  const ray = new THREE.Raycaster();
  function pick(x, y) {
    ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), camera);
    cancelCommand();
    const cut = floorCut(storeys, selectedFloor, exploded ? gap : 0);
    appearance.select(ray.intersectObjects(appearance.visibleMeshes, false).find(hit => cut === null || hit.point.y <= cut)?.object.userData.expressID);
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
  document.querySelector('#color').addEventListener('change', event => { if (appearance.selectedID !== undefined) changed({action:'color',ids:[appearance.selectedID],color:event.target.value}); });
  document.querySelector('#hide').onclick = () => { const id=appearance.selectedID; appearance.hide(); updateSelection(); if(id!==undefined) changed({action:'hide',ids:[id]}); };
  document.querySelector('#close-selection').onclick = () => { appearance.select(undefined); updateSelection(); };
  document.querySelector('#show-all').onclick = () => { appearance.showAll(); updateSelection(); changed({action:'show',ids:[...appearance.elements.keys()]}); };
  document.querySelector('#reset-colors').onclick = () => { appearance.resetColors(); updateSelection(); changed({action:'reset-colors',ids:[...appearance.elements.keys()]}); };
  function mode(smart) {
    cancelCommand(); document.querySelector('#commands').hidden = true;
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
        const material = new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
        const effect = new THREE.Mesh(geometry, material);
        effect.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
        effect.position.sub(center); effect.visible = false;
        effect.userData.expressID = id; effect.userData.basePosition = effect.position.clone();
        effect.renderOrder=3;roomEffects.add(effect); meshes.push(effect);
      } finally { data.delete(); }
    }
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', 'false');
    toggle.setAttribute('aria-label', `Licht simulieren: ${label.textContent}`);
    toggle.textContent = meshes.length ? 'Licht aus' : 'Ohne Raumgeometrie'; toggle.disabled = !meshes.length;
    toggle.dataset.noGeometry=String(!meshes.length);
    roomLights.set(id,(on,color='#ffd35c',linked=false,available=true)=>{toggle.setAttribute('aria-checked',String(on));toggle.textContent=!meshes.length?'Ohne Raumgeometrie':linked?(!available?'Gerät nicht erreichbar':on?'Licht an · Geräte':'Licht aus · Geräte'):on?'Licht an':'Licht aus';toggle.dataset.linked=String(linked);toggle.disabled=linked||!meshes.length;meshes.forEach(mesh=>{mesh.visible=on;mesh.material.color.set(color);});});
    toggle.onclick = () => {
      const on = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(on)); toggle.textContent = on ? 'Licht an' : 'Licht aus';
      meshes.forEach(mesh => mesh.visible = on); render(); changed({action:'light',ids:[id],on});
    };
    row.append(toggle); roomsPanel.append(row);
  }
  if (!spaceIDs.size()) roomsPanel.textContent = 'Keine Räume im IFC erkannt. Bitte in Revit Räume anlegen und beim IFC-Export die Raumgeometrie (IFCSPACE) einschließen. Wände allein enthalten noch keine Raumzuordnung.';
  buttons.forEach(button => button.disabled = false);
  document.querySelector('#explode').disabled = storeys.length < 2;
  document.querySelector('#command-execute').disabled = true;
  if (new URLSearchParams(location.search).get('mode') === 'smart-home') mode(true);
  if (isExample) {
    const note = document.createElement('div'); note.id = 'sync-status'; note.textContent = 'Beispielmodell · frei erfundene Geometrie · Änderungen bleiben lokal'; document.body.append(note);
  } else synchronization = mountSynchronization({appearance,roomLights,update:updateSelection,environment:applyMap});
  status.hidden = true;
  render();
  report(`ready:${meshes}`);
}
open().catch(fail);
