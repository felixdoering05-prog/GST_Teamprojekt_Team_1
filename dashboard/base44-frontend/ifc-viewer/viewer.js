import { mountMapEnvironment } from './map-environment.js';
import { mountSynchronization } from './sync.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IfcAPI, IFCSITE, IFCSPACE, IFCWALL, IFCWALLSTANDARDCASE, IFCWALLELEMENTEDCASE, IFCDOOR, IFCWINDOW, IFCROOF, IFCSLAB, IFCCOLUMN, IFCCOLUMNSTANDARDCASE } from 'web-ifc';
import { ElementAppearance } from './interactions.js';
import { mountCommands } from './commands.js';
import { exampleIFC } from './example.js';
import { readStoreys, floorCut } from './storeys.js';
import { addSurroundings } from './surroundings.js';
import { addCampusMap } from './campus-map.js';
import { addWorldMap } from './world-map.js';
import { footprintHeading } from './campus-projection.js';
import footprint from './d21-footprint.json';
import { mountCampusOnly } from './campus-only.js';
import { mountHeatLayer } from './heat-layer.js';
import { mountRoomHeatView } from './room-heat-view.js';
import { bimStoreys, mountBimStoreys } from './bim-storeys.js';
import { bimSurface, mountBimCamera, studioGround } from './bim-stage.js';
import { ifcAngle, mapLocation } from './map-location.js';

const isExample = new URLSearchParams(location.search).get('example') === 'true';
const isCampus = new URLSearchParams(location.search).get('campus') === 'd21';
const isHeat = new URLSearchParams(location.search).get('heat') === 'true';
const isRoomHeat = new URLSearchParams(location.search).get('room-heat') === 'true';
const isDashboard = new URLSearchParams(location.search).get('presentation') === 'dashboard';
const isBim = new URLSearchParams(location.search).get('presentation') === 'bim';
if (isDashboard) document.body.classList.add('dashboard-presentation');
if (isRoomHeat) document.body.classList.add('room-heat-mode');

const status = document.querySelector('#status');
const panel = document.querySelector('#selection');
const buttons = [...document.querySelectorAll('button')];
buttons.forEach(button => button.disabled = true);
let api, modelID, renderer, controls, root, scene, camera, modelPlacement;
const appearance = new ElementAppearance();
const elementTypes = new Map();
const info = document.querySelector('#selection-info');
const home = document.querySelector('#home');
const roomsPanel = document.querySelector('#rooms');
let roomEffects;
let releaseSurroundings;
let heatLayer;
let roomHeatView;
let disposeBimStage;
let destroyed = false;
const maxVertices = 1_000_000;
const maxMeshes = 10_000;
const report = message => window.webkit?.messageHandlers.ifcState?.postMessage(message);
function modelSite() {
  try {
    const ids = api.GetLineIDsWithType(modelID, IFCSITE);
    const sites = new Map();
    for (let index = 0; index < ids.size(); index++) {
      const site = api.GetLine(modelID, ids.get(index), false);
      const point = mapLocation(ifcAngle(site?.RefLatitude), ifcAngle(site?.RefLongitude));
      if (point && (point.latitude !== 0 || point.longitude !== 0)) sites.set(JSON.stringify(point), point);
    }
    return sites.size === 1 ? sites.values().next().value : null;
  } catch {
    return null;
  }
}
function release() {
  if (destroyed) return;
  destroyed = true;
  controls?.dispose();
  heatLayer?.dispose();
  roomHeatView?.dispose();
  disposeBimStage?.();
  root?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  roomEffects?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  releaseSurroundings?.();
  renderer?.dispose();
  if (api && modelID !== undefined) { api.CloseModel(modelID); modelID = undefined; }
}
function fail(error) {
  release();
  document.querySelectorAll('button, input, select').forEach(control => control.disabled = true);
  status.hidden = false; status.className = 'error';
  status.textContent = error?.message || 'Das IFC-Modell konnte nicht geöffnet werden.';
  if (isRoomHeat) window.parent.postMessage({ type: 'd21-room-heat-error', message: status.textContent }, location.origin);
  report(`error:${status.textContent}`);
}
window.addEventListener('error', event => fail(event.error));
window.addEventListener('unhandledrejection', event => fail(event.reason));
window.addEventListener('pagehide', release);
window.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('Der Grafikspeicher reicht nicht aus. Bitte ein kleineres IFC-Modell öffnen.')); }, true);

async function open() {
  // The parent authenticates the download. Only IFC bytes enter the viewer, never a session token.
  const loaded = isExample ? { bytes: exampleIFC(), placement: null } : await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('Das Modell wurde nicht übertragen. Bitte erneut öffnen.')); }, 60000);
    function receive(event) {
      if (event.source !== window.parent || event.origin !== location.origin) return;
      if (event.data?.type === 'd21-ifc-request') { window.parent.postMessage({ type: 'd21-ifc-ready' }, location.origin); return; }
      if (event.data?.type !== 'd21-ifc-model') return;
      const buffer = event.data.buffer;
      if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength || buffer.byteLength > 20 * 1024 * 1024) return;
      clearTimeout(timer); window.removeEventListener('message', receive); resolve({ bytes: new Uint8Array(buffer), placement: event.data.placement || null });
    }
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'd21-ifc-ready' }, location.origin);
  });
  const bytes = loaded.bytes; modelPlacement = loaded.placement;
  const hasLocation = Number.isFinite(modelPlacement?.latitude) && Number.isFinite(modelPlacement?.longitude) && Math.abs(modelPlacement.latitude) <= 85.05112878 && Math.abs(modelPlacement.longitude) <= 180;
  const showWorldMap = !isCampus && !isExample && !isRoomHeat && hasLocation && modelPlacement?.map_provider_consent === true;
  const header = new TextDecoder().decode(bytes.subarray(0, 4096));
  if (!header.trimStart().startsWith('ISO-10303-21;') || !header.includes('FILE_SCHEMA')) throw new Error('Bitte eine unkomprimierte IFC-Datei auswählen (IFC2x3 oder IFC4).');
  api = new IfcAPI();
  await api.Init(path => new URL(path, location.href).href, true);
  modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  if (modelID < 0 || !api.IsModelOpen(modelID)) throw new Error('Das IFC-Format wird nicht unterstützt oder die Datei ist beschädigt.');
  if (isBim) document.body.classList.add('bim-presentation');
  scene = new THREE.Scene();
  if (!isBim) scene.background = new THREE.Color(isRoomHeat ? '#e6ebef' : isDashboard ? '#d7d1c6' : '#ddd8ce');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8798b3, isBim ? 1.85 : 2.6));
  const light = new THREE.DirectionalLight(0xfffbef, isBim ? 2.4 : 2.5); scene.add(light);
  const categories = new Map([[IFCWALL,'walls'],[IFCWALLSTANDARDCASE,'walls'],[IFCWALLELEMENTEDCASE,'walls'],[IFCDOOR,'doors'],[IFCWINDOW,'windows'],[IFCROOF,'roofs'],[IFCSLAB,'slabs']]);
  if (isRoomHeat || isBim) for (const type of [IFCCOLUMN, IFCCOLUMNSTANDARDCASE]) categories.set(type, 'columns');
  const edgeMaterial = isBim ? new THREE.LineBasicMaterial({ color: '#445761', transparent: true, opacity: .24, depthWrite: false }) : null;
  root = new THREE.Group(); scene.add(root);
  let vertices = 0, meshes = 0;
  api.StreamAllMeshes(modelID, flat => {
    const type = api.GetLineType(modelID, flat.expressID);
    if ((isRoomHeat || isBim) && type === IFCSPACE) return;
    const category = categories.get(type);
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
        const previewColor = type === IFCWINDOW ? '#264b8a' : type === IFCSLAB ? '#d9dfe5' : '#f0f0ec';
        const surface = isBim ? bimSurface(category, color) : { color: isExample ? new THREE.Color(previewColor) : new THREE.Color(color.x, color.y, color.z), opacity: color.w, transparent: color.w < 1, roughness: .85 };
        const material = new THREE.MeshStandardMaterial({ ...surface, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
        mesh.userData.expressID = flat.expressID;
        mesh.castShadow = !isBim || !material.transparent; mesh.receiveShadow = true;
        if (isBim && ['walls', 'slabs', 'roofs', 'columns'].includes(category)) {
          geometry.computeBoundingBox();
          if (geometry.boundingBox.getSize(new THREE.Vector3()).length() > 1.8) {
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial);
            mesh.add(edges);
          }
        }
        root.add(mesh);
        elementTypes.set(flat.expressID, category);
        appearance.add(flat.expressID, mesh);

      } finally { data.delete(); }
    }
  });
  if (!meshes) throw new Error('In dieser IFC-Datei wurde keine darstellbare 3D-Geometrie gefunden.');
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  if (![center.x, center.y, center.z].every(Number.isFinite)) throw new Error('Die Modell-Koordinaten sind ungültig.');
  const heading = isRoomHeat ? 0 : isCampus ? footprintHeading(footprint.coordinates) : hasLocation ? Math.PI / 2 - (modelPlacement.model_heading_degrees || 0) * Math.PI / 180 : 0;
  root.rotation.y = heading;
  root.position.copy(center).multiplyScalar(-1).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
  const span = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), .1);
  let viewHeight = span * 1.3 / Math.min(innerWidth / innerHeight, 1);
  let lastAspect = innerWidth / innerHeight;
  let fittedRoomSize;
  camera = new THREE.OrthographicCamera(-viewHeight * innerWidth / innerHeight / 2, viewHeight * innerWidth / innerHeight / 2, viewHeight / 2, -viewHeight / 2, span / 10000, span * 100);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: isBim });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = isBim ? .92 : .95;
  renderer.shadowMap.enabled = !isRoomHeat; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = !isBim;
  renderer.setPixelRatio(Math.min(devicePixelRatio, isBim ? 1.65 : 2)); renderer.setSize(innerWidth, innerHeight);
  document.querySelector('#scene').append(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.minZoom = .3; controls.maxZoom = 12;
  controls.maxPolarAngle = Math.PI * .49;
  root.updateMatrixWorld(true);
  const centeredBounds = new THREE.Box3().setFromObject(root);
  if (!isCampus && !isRoomHeat && !isBim && !showWorldMap) releaseSurroundings = addSurroundings(scene, centeredBounds, isExample);
  const studio = isBim && studioGround(scene, centeredBounds);
  light.position.copy(isBim ? new THREE.Vector3(-.82, 1.48, .73).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).multiplyScalar(span) : new THREE.Vector3(-span, span * 2, span * .6));
  light.castShadow = true; light.shadow.mapSize.setScalar(isBim && innerWidth > 720 ? 1536 : 1024);
  const shadowSpan = span * (isBim ? .79 : 2);
  Object.assign(light.shadow.camera, {left:-shadowSpan,right:shadowSpan,top:shadowSpan,bottom:-shadowSpan,near:.1,far:span*8});
  light.shadow.normalBias = isBim ? .075 : .04;
  if (isBim) {
    light.shadow.bias = -.00022;
    light.shadow.radius = 2.25;
  }
  light.shadow.intensity = isBim ? .68 : 1;
  if (isBim) {
    const fill = new THREE.DirectionalLight('#e1f0ff', .7);
    fill.position.copy(light.position).multiplyScalar(-1); fill.position.y = span * .5;
    scene.add(fill);
    renderer.shadowMap.needsUpdate = true;
  }
  function frustum() {
    const aspect = innerWidth / innerHeight;
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }
  function fit(top = false, modelBounds = new THREE.Box3().setFromObject(root)) {
    const distance = span * 4;
    const target = modelBounds.getCenter(new THREE.Vector3());
    const size = modelBounds.getSize(new THREE.Vector3());
    lastAspect = innerWidth / innerHeight;
    const perspective = isRoomHeat ? new THREE.Vector3(distance * .28, distance * 1.15, distance * .8) : new THREE.Vector3(distance * .7, distance * .65, distance * .7);
    camera.up.set(0, 1, 0); camera.position.copy(target).add(top ? new THREE.Vector3(0, distance, distance * .001) : perspective);
    if (isRoomHeat) {
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      const projected = axis => new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, axis).toArray()
        .reduce((total, value, index) => total + Math.abs(value) * size.getComponent(index), 0);
      fittedRoomSize = { width: projected(0), height: projected(1) };
      viewHeight = Math.max(fittedRoomSize.width / lastAspect, fittedRoomSize.height, .1) * 1.24;
    } else {
      const modelSpan = Math.max(...size.toArray(), .1);
      viewHeight = modelSpan * (isDashboard ? 1.04 : isExample ? 1.9 : 1.45) / Math.min(lastAspect, 1);
    }
    camera.zoom = 1; frustum();
    controls.target.copy(target); controls.update();
  }
  fit();
  let updateLabels = () => {}, campusEnvironment, worldEnvironment, campusVisible = !isBim, bimCamera, bimFloors, updateBimView;
  let renderRequest = 0;
  const draw = () => {
    if (campusVisible) campusEnvironment?.update(camera, render);
    worldEnvironment?.update(camera, render);
    renderer.render(scene, camera);
    updateLabels();
  };
  const render = isBim ? () => {
    if (renderRequest || destroyed) return;
    renderRequest = requestAnimationFrame(time => {
      renderRequest = 0;
      if (bimCamera?.update(time)) render();
      if (bimFloors?.update(time)) render();
      controls.update();
      draw();
    });
  } : draw;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (isBim) {
    const updateMotion = () => { controls.enableDamping = !motion.matches; };
    updateMotion();
    controls.dampingFactor = .17;
    motion.addEventListener('change', updateMotion);
    bimCamera = mountBimCamera({
      camera, controls, heading, span, motion, render,
      setHeight(height) { viewHeight = height; frustum(); },
      getHeight: () => viewHeight,
    });
    controls.addEventListener('start', () => bimCamera.cancel());
    disposeBimStage = () => {
      cancelAnimationFrame(renderRequest);
      motion.removeEventListener('change', updateMotion);
      studio.geometry.dispose(); studio.material.dispose(); edgeMaterial.dispose();
    };
    bimCamera.fit(centeredBounds, { animate: false });
  }
  const fitView = top => {
    if (roomHeatView) return roomHeatView.fit(top);
    if (bimCamera) return updateBimView?.({ top, campus: top && campusVisible, refit: true });
    fit(top);
  };
  document.querySelector('#fit').onclick = () => fitView(false);
  document.querySelector('#top').onclick = () => fitView(true);
  if (isRoomHeat) {
    const fitButton = document.querySelector('#fit');
    fitButton.setAttribute('aria-label', 'Geschoss einpassen'); fitButton.title = 'Geschoss einpassen';
  }
  controls.addEventListener('change', () => render());
  const observer = new ResizeObserver(() => {
    const aspect = innerWidth / innerHeight;
    if (bimCamera) bimCamera.resize();
    else if (fittedRoomSize) viewHeight = Math.max(fittedRoomSize.width / aspect, fittedRoomSize.height, .1) * 1.24;
    else viewHeight *= Math.min(lastAspect, 1) / Math.min(aspect, 1);
    lastAspect = aspect;
    frustum(); renderer.setSize(innerWidth, innerHeight); render();
  }); observer.observe(document.body);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  const modelMap = isCampus || isExample || isRoomHeat ? null :
    mountMapEnvironment(scene, centeredBounds.min.y - span * .001, render, { visible: !isBim });
  if (modelMap) {
    const dispose = releaseSurroundings;
    releaseSurroundings = () => { dispose?.(); modelMap.dispose(); };
  }
  function applyMap(view) {
    if (!modelMap) return;
    const hadTerrain = Boolean(modelMap.bounds);
    modelMap.setView(view);
    if (isBim) {
      const hasTerrain = Boolean(modelMap.bounds || worldEnvironment);
      document.querySelector('#campus-fit').hidden = !hasTerrain;
      if (campusVisible && hadTerrain !== Boolean(modelMap.bounds)) updateBimView?.({ campus: hasTerrain, refit: true });
    } else if (!hadTerrain || !modelMap.bounds) worldEnvironment?.setVisible(!modelMap.bounds);
  }
  for (const [id, factor] of [['zoom-in', 1.25], ['zoom-out', .8]]) document.getElementById(id).onclick = () => {
    bimCamera?.cancel();
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, .3, 12); camera.updateProjectionMatrix(); render();
  };
  for (const [id, angle] of [['rotate-left', Math.PI / 2], ['rotate-right', -Math.PI / 2]]) {
    document.getElementById(id).onclick = () => {
      const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
      controls.update(); render();
    };
  }

  const spatial = readStoreys(api, modelID);
  const floorBounds = new Map();
  const boundsByMesh = new Map();
  for (const [id, meshes] of appearance.elements) {
    const floorID = spatial.assignments.get(id);
    for (const mesh of meshes) {
      mesh.userData.basePosition = mesh.position.clone(); mesh.userData.storey = floorID;
      if (isBim) boundsByMesh.set(mesh, new THREE.Box3().setFromObject(mesh));
      if (floorID === undefined) continue;
      if (!floorBounds.has(floorID)) floorBounds.set(floorID, new THREE.Box3());
      if (isBim) floorBounds.get(floorID).union(boundsByMesh.get(mesh));
      else floorBounds.get(floorID).expandByObject(mesh);
    }
  }
  const storeys = spatial.storeys.filter(floor => floorBounds.has(floor.id)).map(floor => ({
    ...floor, base: floorBounds.get(floor.id).min.y, top: floorBounds.get(floor.id).max.y,
  }));
  for (const floor of isBim ? [] : storeys) {
    for (const mesh of root.children) {
      if (mesh.userData.storey !== floor.id || !['slabs', 'roofs'].includes(elementTypes.get(mesh.userData.expressID))) continue;
      const slab = new THREE.Box3().setFromObject(mesh);
      if (slab.min.y > floor.base + (floor.top - floor.base) * .5) floor.ceiling = Math.min(floor.ceiling ?? Infinity, slab.min.y);
    }
  }
  if (isCampus && !isRoomHeat) {
    const ground = storeys.find(floor => /^EG$|Erdgeschoss/i.test(floor.name))?.base ?? centeredBounds.min.y;
    campusEnvironment = addCampusMap(scene, { groundY: ground, subdued: isDashboard || isHeat });
    releaseSurroundings = () => campusEnvironment.dispose();
    document.querySelector('#map-attribution').hidden = false;
    const campusButton = document.querySelector('#campus-fit'); campusButton.hidden = false;
    campusEnvironment.setVisible(campusVisible);
    document.querySelector('#map-attribution').hidden = !campusVisible;
    campusButton.onclick = () => {
      if (isBim) return updateBimView?.({ campus: !campusVisible, reset: true });
      const target = campusEnvironment.bounds.getCenter(new THREE.Vector3());
      const size = Math.max(...campusEnvironment.bounds.getSize(new THREE.Vector3()).toArray());
      viewHeight = size * 1.2 / Math.min(innerWidth / innerHeight, 1); lastAspect = innerWidth / innerHeight;
      camera.zoom = 1; frustum(); camera.position.copy(target).add(new THREE.Vector3(0, size * 3, size * .001)); controls.target.copy(target); controls.update(); render();
    };
  } else if (showWorldMap) {
    worldEnvironment = addWorldMap(scene, [modelPlacement.longitude, modelPlacement.latitude], centeredBounds.min.y);
    worldEnvironment.setVisible(!isBim);
    const dispose = releaseSurroundings;
    releaseSurroundings = () => { dispose?.(); worldEnvironment.dispose(); };
  }
  let selectedFloor = null, separatedFloor = null, exploded = false;
  const gap = span * .14;
  const selectedFloorCut = () => floorCut(storeys, selectedFloor,
    selectedFloor !== null && separatedFloor === selectedFloor ? gap : 0, 1);
  function updateSeparationControl() {
    const button = document.querySelector('#explode');
    const separated = selectedFloor !== null && separatedFloor === selectedFloor;
    button.disabled = selectedFloor === null || !storeys.length;
    button.setAttribute('aria-pressed', String(separated));
    button.setAttribute('aria-label', separated ? 'Ausgewähltes Geschoss wieder einfügen' : 'Ausgewähltes Geschoss absetzen');
    button.title = selectedFloor === null ? 'Wähle zuerst ein Geschoss aus.' : button.getAttribute('aria-label');
    button.textContent = separated ? 'Geschoss einfügen' : 'Geschoss absetzen';
  }
  const labelHost = document.querySelector('#labels');
  const titleLabel = document.createElement('div'); titleLabel.className = 'model-label';
  const marker = document.createElement('span'); marker.className = 'marker'; marker.textContent = isExample ? '3D' : 'IFC';
  const titleText = document.createElement('span'); const title = document.createElement('strong');
  title.textContent = isCampus ? 'D21 · Hochschule Darmstadt' : isExample ? 'Beispielcampus' : 'Gebäudemodell';
  const subtitle = document.createElement('small'); subtitle.textContent = isCampus ? 'Original-IFC · Lage nach h_da' : isExample ? 'Stilvorschau · keine D21-Geometrie' : `${meshes} Geometrien · ${storeys.length} Geschosse`;
  titleText.append(title, subtitle); titleLabel.append(marker, titleText); labelHost.append(titleLabel);
  const floorLabels = (isBim ? [] : storeys).map(floor => {
    const label = document.createElement('div'); label.className = 'model-label floor-label'; label.textContent = floor.name; labelHost.append(label); return label;
  });
  const placeLabel = (label, point) => {
    point.project(camera);
    label.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > .95 || Math.abs(point.y) > .95;
    label.style.left = `${(point.x + 1) * innerWidth / 2}px`; label.style.top = `${(1 - point.y) * innerHeight / 2}px`;
  };
  updateLabels = () => {
    const displayedFloor = storeys.find(floor => floor.id === selectedFloor);
    const top = displayedFloor ? selectedFloorCut() : centeredBounds.max.y + (separatedFloor ? gap : 0);
    if (isBim) titleLabel.hidden = true;
    else placeLabel(titleLabel, new THREE.Vector3(0, top + span * .09, 0));
    floorLabels.forEach((label, index) => {
      label.hidden = separatedFloor !== storeys[index].id;
      if (!label.hidden) {
        const point = floorBounds.get(storeys[index].id).getCenter(new THREE.Vector3());
        point.y = storeys[index].base + gap + .4;
        placeLabel(label, point);
      }
    });
  };
  function refreshView() {
    const cut = selectedFloorCut();
    renderer.clippingPlanes = cut === null ? [] : [new THREE.Plane(new THREE.Vector3(0, -1, 0), cut)];
    for (const mesh of root.children) {
      mesh.position.copy(mesh.userData.basePosition);
      if (mesh.userData.storey === separatedFloor) mesh.position.y += gap;
    }
    roomEffects?.children.forEach(mesh => {
      const storey = spatial.assignments.get(mesh.userData.expressID);
      mesh.position.copy(mesh.userData.basePosition);
      if (storey === separatedFloor) mesh.position.y += gap;
    });
    root.updateMatrixWorld(true);
    document.querySelector('#all-floors').setAttribute('aria-pressed', String(selectedFloor === null));
    updateSeparationControl();
    document.querySelectorAll('[data-floor]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.floor) === selectedFloor)));
    heatLayer?.setFloor(selectedFloor);
    render();
  }
  const floorList = document.querySelector('#floor-list');
  (isBim ? [] : [...storeys].reverse()).forEach(floor => {
    const button = document.createElement('button'); button.textContent = floor.name; button.dataset.floor = String(floor.id); button.setAttribute('aria-pressed', 'false');
    button.onclick = () => { selectedFloor = floor.id; if (separatedFloor !== null) separatedFloor = floor.id; heatLayer?.select(undefined); appearance.select(undefined); panel.hidden = true; refreshView(); };
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
  const responsiveFloors = () => collapseFloors(isHeat || mobile.matches);
  responsiveFloors(); mobile.addEventListener('change', responsiveFloors);
  window.addEventListener('pagehide', () => mobile.removeEventListener('change', responsiveFloors), { once: true });
  document.querySelector('#floor-note').textContent = storeys.length ? 'Etage wählen, um das Gebäude bis dahin freizulegen. „Geschoss absetzen“ löst nur die Auswahl; alle übrigen bleiben zusammen.' : 'Keine Geschosszuordnung mit Geometrie im IFC vorhanden.';
  document.querySelector('#all-floors').onclick = () => { selectedFloor = null; separatedFloor = null; heatLayer?.select(undefined); refreshView(); };
  document.querySelector('#explode').onclick = () => { if (selectedFloor === null) return; separatedFloor = separatedFloor === selectedFloor ? null : selectedFloor; heatLayer?.select(undefined); refreshView(); fit(); render(); };
  document.querySelector('#toggle-labels').onclick = event => {
    labelHost.hidden = !labelHost.hidden; event.currentTarget.setAttribute('aria-pressed', String(!labelHost.hidden));
    campusEnvironment?.setLabels(!labelHost.hidden); render();
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
    if (isBim) renderer.shadowMap.needsUpdate = true;
    render();
  }
  let synchronization; const roomLights = new Map();
  const changed = operation => synchronization?.change(operation);
  const cancelCommand = mountCommands({ appearance, types: elementTypes, update: updateSelection, changed, destroyed: () => destroyed });
  const ray = new THREE.Raycaster();
  function pick(x, y) {
    if (isDashboard) return;
    ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), camera);
    if (roomHeatView) { roomHeatView.pick(ray); return; }
    cancelCommand();
    const cut = selectedFloorCut();
    if (isHeat) {
      const targets = [...appearance.visibleMeshes, ...(heatLayer?.targets || []), ...(heatLayer?.ground.visible ? [heatLayer.ground] : [])];
      const hits = ray.intersectObjects(targets, false).filter(hit => cut === null || hit.point.y <= cut);
      heatLayer?.select(hits.find(hit => hit.object.userData.heatGlobalId) || hits[0]);
      return;
    }
    appearance.select(ray.intersectObjects(appearance.visibleMeshes, false).find(hit =>
      bimFloors ? bimFloors.canPick(hit) : cut === null || hit.point.y <= cut)?.object.userData.expressID);
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
  if (isRoomHeat) {
    roomHeatView = mountRoomHeatView({ api, modelID, scene, root, spatial, storeys, elementTypes, renderer, campus: isCampus, fit, render });
    buttons.forEach(button => button.disabled = false);
    status.hidden = true;
    render();
    return;
  }
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
  const roomBases = new Map();
  if (isBim) {
    roomEffects.position.copy(root.position);
    roomEffects.rotation.copy(root.rotation);
    roomEffects.updateMatrixWorld(true);
  }
  const spaceIDs = api.GetLineIDsWithType(modelID, IFCSPACE);
  const heatRoomSpaces = [];
  let roomVertices = 0, roomMeshes = 0;
  for (let n = 0; n < spaceIDs.size(); n++) {
    const id = spaceIDs.get(n), line = api.GetLine(modelID, id, false);
    const row = document.createElement('div'); row.className = 'room';
    const label = document.createElement('span');
    label.textContent = [text(line.Name), text(line.LongName)].filter(Boolean).join(' · ') || `Raum ${n + 1}`;
    row.append(label);
    const meshes = [], heatMeshes = [], flat = api.GetFlatMesh(modelID, id);
    const floorID = spatial.assignments.get(id);
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
        if (!isBim) effect.position.sub(center);
        effect.visible = false;
        effect.userData.expressID = id; effect.userData.basePosition = effect.position.clone(); effect.userData.storey = floorID;
        effect.renderOrder=3;roomEffects.add(effect); meshes.push(effect); heatMeshes.push(effect);
        if (isBim && floorID !== undefined) {
          const bounds = new THREE.Box3().setFromObject(effect);
          boundsByMesh.set(effect, bounds);
          const base = bounds.min.y;
          if (!roomBases.has(floorID)) roomBases.set(floorID, []);
          roomBases.get(floorID).push(base);
        }
      } finally { data.delete(); }
    }
    heatRoomSpaces.push({ globalId: text(line.GlobalId), name: label.textContent, storeyID: spatial.assignments.get(id), floorIndex: storeys.findIndex(floor => floor.id === spatial.assignments.get(id)), floorCount: storeys.length, meshes: heatMeshes });
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
  updateSeparationControl();
  document.querySelector('#command-execute').disabled = true;
  if (new URLSearchParams(location.search).get('mode') === 'smart-home') mode(true);
  if (isExample || isCampus) {
    const note = document.createElement('div'); note.id = 'sync-status'; note.textContent = isCampus ? 'D21-Originalmodell · Ansichtsänderungen bleiben lokal' : 'Beispielmodell · frei erfundene Geometrie · Änderungen bleiben lokal'; document.body.append(note);
  } else synchronization = mountSynchronization({appearance,roomLights,update:updateSelection,environment:applyMap});
  if (isHeat) {
    const groundY = storeys.find(floor => /^EG$|Erdgeschoss/i.test(floor.name))?.base ?? centeredBounds.min.y;
    heatLayer = mountHeatLayer({ scene, root, groundY, render, roomSpaces: heatRoomSpaces });
    heatLayer.setFloor(selectedFloor);
    document.querySelector('#model-mode').onclick = () => {};
    document.querySelector('#sync-status')?.remove();
  }
  const formatCount = value => new Intl.NumberFormat('de-DE').format(value);
  document.querySelector('#viewer-summary-title').textContent = isCampus ? 'D21 · Hochschule Darmstadt' : isExample ? 'Beispielcampus' : 'IFC-Modell';
  document.querySelector('#viewer-summary-state').textContent = 'Modell geladen';
  document.querySelector('#viewer-mesh-count').textContent = formatCount(meshes);
  document.querySelector('#viewer-floor-count').textContent = formatCount(storeys.length);
  document.querySelector('#viewer-room-count').textContent = formatCount(spaceIDs.size());
  document.querySelector('#viewer-summary').hidden = isHeat || isDashboard;
  if (isBim) {
    const floors = bimStoreys(storeys, roomBases, isCampus);
    const floorSelect = document.querySelector('#bim-floor');
    const explodeButton = document.querySelector('#explode');
    const campusButton = document.querySelector('#campus-fit');
    const fitButton = document.querySelector('#fit');
    const activeView = document.querySelector('#bim-active-view');
    const full = floorSelect.options[0];
    const floorName = floor => floor.name.replace(/^(\d+)\.\s*OG$/, '$1. OG');
    for (const floor of [...floors].reverse()) {
      floorSelect.add(new Option(floorName(floor), String(floor.id)));
    }
    floorSelect.disabled = !floors.length;
    if (!floors.length) full.textContent = 'Keine Geschosse im IFC';
    explodeButton.disabled = floors.length < 2;
    explodeButton.textContent = 'Geschosse trennen';
    explodeButton.setAttribute('aria-label', explodeButton.textContent);
    explodeButton.title = explodeButton.textContent;
    campusButton.setAttribute('aria-pressed', 'false');
    if (isCampus || modelMap) {
      document.querySelector('#view-controls').prepend(campusButton);
      campusButton.textContent = 'Gelände';
      campusButton.setAttribute('aria-label', 'Gelände anzeigen');
      campusButton.title = 'Gelände anzeigen';
      if (modelMap) campusButton.onclick = () => {
        if (modelMap.bounds || worldEnvironment) updateBimView({ campus: !campusVisible, reset: true });
      };
      campusButton.hidden = !(isCampus || modelMap?.bounds || worldEnvironment);
    }
    bimFloors = mountBimStoreys({ root, roomEffects, floors, renderer, fullBounds: centeredBounds, boundsByMesh, render, motion });
    labelHost.replaceChildren();
    const labels = floors.map(floor => {
      const label = document.createElement('div');
      label.className = 'model-label floor-label';
      label.textContent = floorName(floor);
      label.hidden = true;
      labelHost.append(label);
      return [floor, label];
    });
    updateLabels = () => {
      for (const [floor, label] of labels) {
        if (!exploded || selectedFloor !== null && floor.id !== selectedFloor) { label.hidden = true; continue; }
        const point = floorBounds.get(floor.id).getCenter(new THREE.Vector3());
        point.y = floor.base + bimFloors.elevationOffset(floor.id) + 1.15;
        placeLabel(label, point);
      }
    };
    updateBimView = ({ top = false, campus = false, reset = false, refit = false } = {}) => {
      const terrain = campusEnvironment || (modelMap?.bounds ? modelMap : worldEnvironment);
      campus = campus && Boolean(terrain?.bounds);
      if (reset) { selectedFloor = null; exploded = false; }
      const floor = floors.find(item => item.id === selectedFloor) || null;
      campusVisible = campus;
      if (modelMap !== terrain) modelMap?.setVisible(false);
      if (worldEnvironment !== terrain) worldEnvironment?.setVisible(false);
      terrain?.setVisible(campus);
      document.body.classList.toggle('campus-view', campus);
      if (terrain) document.querySelector('#map-attribution').hidden = !campus;
      studio.visible = !floor && !campus && !exploded;
      light.shadow.intensity = campus || exploded ? 0 : floor ? .43 : .68;
      if (!refit) {
        appearance.select(undefined);
        cancelCommand();
        panel.hidden = true;
        bimFloors.setView(floor, exploded);
        renderer.shadowMap.needsUpdate = true;
      }
      campusButton.setAttribute('aria-pressed', String(campus));
      if (terrain) {
        campusButton.textContent = campus ? 'Zum Modell' : 'Gelände';
        campusButton.setAttribute('aria-label', campus ? 'Zum Gebäudemodell zurück' : 'Gelände anzeigen');
        campusButton.title = campusButton.getAttribute('aria-label');
      }
      explodeButton.setAttribute('aria-pressed', String(exploded));
      explodeButton.textContent = floor ? (exploded ? 'Geschoss einfügen' : 'Geschoss absetzen') : 'Geschosse trennen';
      explodeButton.setAttribute('aria-label', explodeButton.textContent);
      explodeButton.title = explodeButton.textContent;
      floorSelect.value = floor ? String(floor.id) : '';
      activeView.textContent = campus ? (isCampus ? 'Campus h_da' : 'Gelände')
        : floor ? (exploded ? 'Geschoss abgesetzt' : 'Geschossschnitt aktiv') : exploded ? 'Geschosse getrennt' : '';
      fitButton.setAttribute('aria-label', floor ? 'Geschoss einpassen' : 'Modell einpassen');
      fitButton.title = fitButton.getAttribute('aria-label');
      bimCamera.fit(campus ? terrain.bounds : bimFloors.bounds(), { top: top || campus, cut: Boolean(floor), align: !campus });
    };
    floorSelect.onchange = () => {
      selectedFloor = floorSelect.value ? Number(floorSelect.value) : null;
      exploded = false;
      updateBimView();
    };
    explodeButton.onclick = () => {
      exploded = !exploded;
      updateBimView();
    };
    fitButton.setAttribute('aria-label', 'Modell einpassen');
    fitButton.title = 'Modell einpassen';
    document.querySelector('#bim-view-settings').hidden = false;
    if (modelMap) {
      function receiveTerrain(event) {
        if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'd21-bim-terrain') return;
        applyMap(event.data.view);
        if (modelMap.bounds) updateBimView({ campus: true, reset: true });
      }
      window.addEventListener('message', receiveTerrain);
      window.addEventListener('pagehide', () => window.removeEventListener('message', receiveTerrain), { once: true });
      window.parent.postMessage({ type: 'd21-bim-location', site: modelSite() }, location.origin);
    }
  }
  status.hidden = true;
  render();
  report(`ready:${meshes}`);
}
if (isCampus && new URLSearchParams(location.search).get('map-only') === 'true') mountCampusOnly();
else open().catch(fail);
