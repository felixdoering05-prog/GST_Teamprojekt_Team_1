import {placementGeometry} from './placement-geometry.js';
import {mountNativeHeat} from './heat.js';
import { mountMapEnvironment } from './map-environment.js';
import { displaySun } from './sun.js';
import { mountSynchronization } from './sync.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IfcAPI, IFCRELAGGREGATES, IFCBUILDINGSTOREY, IFCSPACE, IFCWALL, IFCWALLSTANDARDCASE, IFCWALLELEMENTEDCASE, IFCDOOR, IFCWINDOW, IFCROOF, IFCSLAB } from 'web-ifc';
import { ElementAppearance } from './interactions.js';
import { mountCommands } from './commands.js';
import { createIssueMarkers } from './issue-markers.js';

const placementMode=new URLSearchParams(location.search).get('placement')==='true';
const roomsMode=new URLSearchParams(location.search).get('rooms')==='true';
const heatMode=new URLSearchParams(location.search).get('heat')==='true';
const previewMode=new URLSearchParams(location.search).get('preview')==='true';
const darkPreview=new URLSearchParams(location.search).get('theme')==='dark';
const previewColor=darkPreview?'#99c5ff':'#174a80';
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
  const response = await fetch('model.ifc');
  if (!response.ok) throw new Error('Die IFC-Datei konnte nicht gelesen werden.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const header = new TextDecoder().decode(bytes.subarray(0, 4096));
  if (!header.trimStart().startsWith('ISO-10303-21;') || !header.includes('FILE_SCHEMA')) throw new Error('Bitte eine unkomprimierte IFC-Datei auswählen (IFC2x3 oder IFC4).');
  api = new IfcAPI();
  await api.Init(path => new URL(path, location.href).href, true);
  modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  if (modelID < 0 || !api.IsModelOpen(modelID)) throw new Error('Das IFC-Format wird nicht unterstützt oder die Datei ist beschädigt.');
  if (roomsMode) { window.webkit?.messageHandlers?.ifcRooms?.postMessage(roomFootprints(api, modelID)); report('ready:rooms'); return; }
  scene = new THREE.Scene(); scene.background = new THREE.Color(previewMode?(darkPreview?'#132137':'#eaf1fa'):'#ffffff');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5d6b75, 2.1));
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
        const material = new THREE.MeshStandardMaterial({ color: previewMode?new THREE.Color(previewColor):new THREE.Color(color.x, color.y, color.z), opacity: previewMode?1:color.w, transparent: !previewMode && color.w < 1, side: THREE.DoubleSide, roughness: .8 });
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
  if(placementMode){const geometry=placementGeometry(root,bounds,api.GetCoordinationMatrix(modelID));window.webkit?.messageHandlers?.ifcPlacement?.postMessage(geometry);report('ready:placement');return;}
  root.position.sub(center);
  const span = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), .1);
  // Near/far chosen for depth precision: tiny near planes make stacked ground layers flicker (z-fighting).
  camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, Math.max(span / 500, .05), span * 40);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The scene is static while the camera moves: compute shadows only when something changes.
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight);
  document.querySelector('#scene').append(renderer.domElement);
  root.updateMatrixWorld(true);
  const centeredBounds = new THREE.Box3().setFromObject(root);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 12, span * 12),new THREE.ShadowMaterial({opacity:.14}));
  ground.rotation.x = -Math.PI/2; ground.position.y = centeredBounds.min.y - span*.001; ground.receiveShadow=true; scene.add(ground);
  light.position.set(-span,span*2,span*.6); light.castShadow=true;light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-span*2,right:span*2,top:span*2,bottom:-span*2,near:.1,far:span*8});light.shadow.normalBias=span*.0002;light.shadow.camera.updateProjectionMatrix();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle=Math.PI*.49;
  controls.minDistance = span / 100; controls.maxDistance = span * 20;
  function fit(top = false) {
    const distance = span * .625 / Math.tan(THREE.MathUtils.degToRad(22.5)) / Math.min(camera.aspect, 1);
    camera.up.set(0, 1, 0); camera.position.copy(top ? new THREE.Vector3(0, distance, distance * .001) : new THREE.Vector3(distance * .7, distance * .55, distance * .7));
    controls.target.set(0, 0, 0); controls.update();
  }
  fit();
  if(previewMode){document.querySelectorAll('body > :not(#scene)').forEach(x=>x.hidden=true);renderer.render(scene,camera);report('ready:preview');return;}
  document.querySelector('#fit').onclick = () => fit();
  document.querySelector('#top').onclick = () => fit(true);
  controls.addEventListener('change', () => renderer.render(scene, camera));
  const observer = new ResizeObserver(() => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); renderer.render(scene, camera);
  }); observer.observe(document.body);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  const render = () => renderer.render(scene, camera);
  const refreshShadows = () => { renderer.shadowMap.needsUpdate = true; render(); };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mapBase = mountMapEnvironment(scene, centeredBounds.min.y - span*.001,render);
  // Sun from the building's location: realistic shadow direction; the map group is rotated by the heading.
  function setSun(view) {
    const sun = displaySun(view.latitude, view.longitude), unit = view.meters_per_unit || 1;
    const dir = new THREE.Vector3(Math.sin(sun.azimuth) * Math.cos(sun.altitude), Math.sin(sun.altitude), -Math.cos(sun.azimuth) * Math.cos(sun.altitude))
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), view.heading * Math.PI / 180);
    const reach = Math.max(span * 1.6, 60 / unit);
    light.position.copy(dir.multiplyScalar(reach * 2)); light.target.position.set(0, 0, 0); scene.add(light.target);
    Object.assign(light.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: .1, far: reach * 5 });
    light.shadow.mapSize.set(2048, 2048); light.shadow.map?.dispose(); light.shadow.map = null; light.shadow.camera.updateProjectionMatrix();
    light.intensity = sun.live ? 2.8 : 2.4; refreshShadows();
  }
  const applyMap = view => { mapBase(view); if (view && Number.isFinite(view.latitude)) setSun(view); else refreshShadows(); };
  window.d21SetGround = (url, metres) => { mapBase.setGround(url, metres, () => { ground.visible = false; refreshShadows(); }); };
  // Gentle motion: fly in once, then orbit slowly until the person touches the model.
  let orbiting = false;
  function tick() { if (!orbiting || destroyed) return; controls.update(); render(); requestAnimationFrame(tick); }
  function startOrbit() { if (reduceMotion || heatMode || previewMode) return; controls.autoRotate = true; controls.autoRotateSpeed = .3; orbiting = true; requestAnimationFrame(tick); setTimeout(() => { orbiting = false; controls.autoRotate = false; }, 25000); }
  controls.addEventListener('start', () => { orbiting = false; controls.autoRotate = false; });
  if (!reduceMotion && !heatMode) {
    const end = camera.position.clone(), startPos = end.clone().multiplyScalar(1.9).add(new THREE.Vector3(0, span * .6, 0)), t0 = performance.now();
    camera.position.copy(startPos);
    const fly = now => { if (destroyed) return; const k = Math.min(1, (now - t0) / 1800), e = 1 - Math.pow(1 - k, 3); camera.position.lerpVectors(startPos, end, e); controls.update(); render(); if (k < 1 && !orbiting) requestAnimationFrame(fly); else startOrbit(); };
    requestAnimationFrame(fly);
  }
  const text = value => typeof value?.value === 'string' ? value.value : '';
  function updateSelection() {
    if(heatMode)return;
    const id = appearance.selectedID;
    panel.hidden = id === undefined;
    if (id !== undefined) {
      const line = api.GetLine(modelID, id, false);
      info.textContent = [text(line.Name) || 'Bauteil', api.GetNameFromTypeCode(line.type), `IFC-ID: ${id}`, text(line.GlobalId)].filter(Boolean).join('\n');
      document.querySelector('#color').value = '#' + appearance.elements.get(id)[0].material.color.getHexString();
    }
    document.querySelector('#show-all').textContent = appearance.hiddenCount ? `Alles anzeigen (${appearance.hiddenCount})` : 'Alles anzeigen';
    renderer.shadowMap.needsUpdate = true; render();
  }
  let synchronization; const roomLights = new Map();
  const changed = operation => synchronization?.change(operation);
  const cancelCommand = mountCommands({ appearance, types: elementTypes, update: updateSelection, changed, destroyed: () => destroyed });
  const ray = new THREE.Raycaster();
  // Defect markers (native app only); a tap on a marker opens the defect, a tap on geometry offers
  // "report a defect here" with the hit point in model coordinates.
  const issues = heatMode || previewMode || !window.webkit?.messageHandlers?.ifcIssueRequest ? null : createIssueMarkers(root);
  function pick(x, y) {
    if(heatMode)return;
    ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), camera);
    cancelCommand();
    const issueID = issues?.hit(ray);
    if (issueID) { window.webkit.messageHandlers.ifcIssue?.postMessage(issueID); return; }
    const hit = ray.intersectObjects(appearance.visibleMeshes, false)[0];
    appearance.select(hit?.object.userData.expressID);
    updateSelection();
    if (issues) {
      const local = hit ? root.worldToLocal(hit.point.clone()) : undefined;
      window.webkit?.messageHandlers?.ifcPick?.postMessage(local ? { x: local.x, y: local.y, z: local.z } : {});
    }
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
  document.querySelector('#command-execute').disabled = true;
  if (issues) {
    window.d21SetIssues = list => { issues.set(list); render(); };
    window.d21FocusIssue = id => {
      const p = issues.position(id); if (!p) return false;
      orbiting = false; controls.autoRotate = false;
      const offset = camera.position.clone().sub(controls.target).setLength(Math.max(span * .3, 6));
      controls.target.copy(p); camera.position.copy(p.clone().add(offset)); controls.update(); render(); return true;
    };
    window.d21RequestIssues = () => window.webkit?.messageHandlers?.ifcIssueRequest?.postMessage('load');
    window.d21RequestIssues();
  }
  // The smart-home overlay is retired from the viewer; device control lives under Geräte.
  document.querySelector('#modes')?.remove(); document.querySelector('#home')?.remove();
  if(heatMode)mountNativeHeat(root,render,applyMap);
  else synchronization = mountSynchronization({appearance,roomLights,update:updateSelection,environment:applyMap});
  status.hidden = true;
  renderer.render(scene, camera);
  report(`ready:${meshes}`);
}
open().catch(fail);

// Room footprints for on-device indoor positioning: every IfcSpace as floor triangles (x/z, metres,
// same coordinates as the viewer before centring) with its storey and vertical extent. Nothing leaves the phone.
function roomFootprints(api, modelID) {
  const label = value => (value && typeof value === 'object' && 'value' in value ? String(value.value ?? '') : String(value ?? '')).trim();
  const storeyOf = new Map(), storeys = new Map();
  const storeyIDs = api.GetLineIDsWithType(modelID, IFCBUILDINGSTOREY);
  for (let i = 0; i < storeyIDs.size(); i++) { const id = storeyIDs.get(i); storeys.set(id, label(api.GetLine(modelID, id, false).Name) || `Geschoss ${i + 1}`); }
  const rels = api.GetLineIDsWithType(modelID, IFCRELAGGREGATES);
  for (let i = 0; i < rels.size(); i++) {
    const rel = api.GetLine(modelID, rels.get(i), false), parent = rel.RelatingObject?.value;
    if (!storeys.has(parent)) continue;
    for (const child of rel.RelatedObjects || []) storeyOf.set(child.value, parent);
  }
  const rooms = [], spaceIDs = api.GetLineIDsWithType(modelID, IFCSPACE);
  let budget = 400000;
  for (let n = 0; n < spaceIDs.size() && budget > 0; n++) {
    const id = spaceIDs.get(n), line = api.GetLine(modelID, id, false);
    const tris = []; let minY = Infinity, maxY = -Infinity;
    const flat = api.GetFlatMesh(modelID, id);
    for (let i = 0; i < flat.geometries.size(); i++) {
      const placed = flat.geometries.get(i), data = api.GetGeometry(modelID, placed.geometryExpressID), m = placed.flatTransformation;
      try {
        const v = api.GetVertexArray(data.GetVertexData(), data.GetVertexDataSize());
        const idx = api.GetIndexArray(data.GetIndexData(), data.GetIndexDataSize());
        const pt = k => { const x = v[k * 6], y = v[k * 6 + 1], z = v[k * 6 + 2]; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; };
        for (let t = 0; t + 2 < idx.length; t += 3) {
          const a = pt(idx[t]), b = pt(idx[t + 1]), c = pt(idx[t + 2]);
          minY = Math.min(minY, a[1], b[1], c[1]); maxY = Math.max(maxY, a[1], b[1], c[1]);
          const area = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
          if (Math.abs(area) < 1e-4) continue; // vertical walls of the space volume add nothing to the footprint
          const r = x => Math.round(x * 100) / 100;
          tris.push(r(a[0]), r(a[2]), r(b[0]), r(b[2]), r(c[0]), r(c[2]));
        }
      } finally { data.delete(); }
    }
    if (!tris.length) continue;
    budget -= tris.length;
    const storey = storeyOf.get(id);
    rooms.push({ id, name: [label(line.Name), label(line.LongName)].filter(Boolean).join(' · ') || `Raum ${n + 1}`, storey: storeys.get(storey) || '', storey_id: storey || 0, min_y: Math.round(minY * 100) / 100, max_y: Math.round(maxY * 100) / 100, tris });
  }
  // Walls (bottom faces) and doors (centre + width) for a readable plan; the app assigns them to floors by height.
  const walls = [], doors = [], r2 = x => Math.round(x * 100) / 100;
  let wallBudget = 600000;
  for (const type of [IFCWALL, IFCWALLSTANDARDCASE, IFCWALLELEMENTEDCASE, IFCDOOR]) {
    const ids = api.GetLineIDsWithType(modelID, type);
    for (let n = 0; n < ids.size() && wallBudget > 0; n++) {
      const id = ids.get(n), flat = api.GetFlatMesh(modelID, id), points = [];
      for (let i = 0; i < flat.geometries.size(); i++) {
        const placed = flat.geometries.get(i), data = api.GetGeometry(modelID, placed.geometryExpressID), m = placed.flatTransformation;
        try {
          const v = api.GetVertexArray(data.GetVertexData(), data.GetVertexDataSize());
          const idx = api.GetIndexArray(data.GetIndexData(), data.GetIndexDataSize());
          for (let t = 0; t + 2 < idx.length; t++) { const k = idx[t]; const x = v[k * 6], y = v[k * 6 + 1], z = v[k * 6 + 2]; points.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); }
        } finally { data.delete(); }
      }
      // points holds the element's triangles as consecutive x/y/z triples (three vertices per triangle).
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      const coords = points;
      for (let i = 0; i < coords.length; i += 3) { minX = Math.min(minX, coords[i]); maxX = Math.max(maxX, coords[i]); minY = Math.min(minY, coords[i + 1]); maxY = Math.max(maxY, coords[i + 1]); minZ = Math.min(minZ, coords[i + 2]); maxZ = Math.max(maxZ, coords[i + 2]); }
      if (!Number.isFinite(minY)) continue;
      if (type === IFCDOOR) { doors.push({ x: r2((minX + maxX) / 2), z: r2((minZ + maxZ) / 2), w: r2(Math.max(maxX - minX, maxZ - minZ)), min_y: r2(minY), max_y: r2(maxY) }); continue; }
      const tris = [];
      for (let i = 0; i + 8 < coords.length; i += 9) {
        const a = [coords[i], coords[i + 1], coords[i + 2]], b = [coords[i + 3], coords[i + 4], coords[i + 5]], c = [coords[i + 6], coords[i + 7], coords[i + 8]];
        if (Math.max(a[1], b[1], c[1]) > minY + 0.05) continue;
        const area = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
        if (Math.abs(area) < 1e-4) continue;
        tris.push(r2(a[0]), r2(a[2]), r2(b[0]), r2(b[2]), r2(c[0]), r2(c[2]));
      }
      if (!tris.length) continue;
      wallBudget -= tris.length;
      walls.push({ min_y: r2(minY), max_y: r2(maxY), tris });
    }
  }
  return { rooms, walls, doors, storeys: [...storeys].map(([id, name]) => ({ id, name })), truncated: budget <= 0 || wallBudget <= 0 };
}
