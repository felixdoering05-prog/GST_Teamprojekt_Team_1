import * as THREE from 'three';
import { HEAT_STOPS, ROOM_TEMPERATURE_SCENARIOS, heatColor, normalizeScenario, scenarioConditions, simulatedRoomTemperature, surfaceTemperature } from './heat-simulation.js';

// One GPU material for all IFC meshes; no geometry copying on time/season changes.
export function mountHeatLayer({ scene, root, groundY = 0, render, roomSpaces = [] }) {
  let scenario = normalizeScenario({ source: 'dwd', airTemperature: null }), disposed = false, selected;
  const uniforms = {
    heatAir: { value: 0 }, heatGain: { value: 0 }, heatSun: { value: new THREE.Vector3() },
    heatGround: { value: false }, heatOpacity: { value: 1 },
    heatAvailable: { value: false }, heatNoData: { value: new THREE.Color('#94a3b8') },
  };
  // CSS legend and heatColor() interpolate sRGB; use the same ramp before output conversion.
  const colors = HEAT_STOPS.map(stop => new THREE.Color(stop.color).convertLinearToSRGB());
  const palette = colors.map((color, index) => `vec3 c${index} = vec3(${color.r.toFixed(8)},${color.g.toFixed(8)},${color.b.toFixed(8)});`).join('\n');
  const ramp = colors.slice(1).map((_, index) => `if(t <= ${HEAT_STOPS[index + 1].value.toFixed(1)}) return mix(c${index},c${index + 1},clamp((t - (${HEAT_STOPS[index].value.toFixed(1)}))/10.0,0.0,1.0));`).join('\n');
  function material(ground) {
    return new THREE.ShaderMaterial({
      uniforms: { ...uniforms, heatGround: { value: ground }, heatOpacity: { value: ground ? .58 : 1 } },
      transparent: ground, depthWrite: !ground, side: THREE.DoubleSide, clipping: true, toneMapped: false,
      vertexShader: `varying vec3 heatPosition; varying vec3 heatNormal;
        #include <clipping_planes_pars_vertex>
        void main(){ vec4 world = modelMatrix * vec4(position,1.0); heatPosition=world.xyz;
          heatNormal=normalize(mat3(modelMatrix)*normal); vec4 mvPosition=viewMatrix*world;
          gl_Position=projectionMatrix*mvPosition;
          #include <clipping_planes_vertex>
        }`,
      fragmentShader: `uniform float heatAir; uniform float heatGain; uniform vec3 heatSun;
        uniform bool heatGround; uniform bool heatAvailable; uniform vec3 heatNoData; uniform float heatOpacity; varying vec3 heatPosition; varying vec3 heatNormal;
        #include <clipping_planes_pars_fragment>
        vec3 ramp(float t){${palette} ${ramp} return c6;}
        vec3 heatToLinear(vec3 value){return mix(value/12.92,pow((value+.055)/1.055,vec3(2.4)),step(vec3(.04045),value));}
        void main(){
          #include <clipping_planes_fragment>
          float exposure=max(0.0,dot(normalize(heatNormal),heatSun));
          float pattern=.5+.5*sin(heatPosition.x*.055)*cos(heatPosition.z*.045);
          float surface=heatGround ? .28+.55*pattern : .35+.65*exposure;
          float temperature=heatAir+heatGain*surface-(heatGround ? 2.5*(1.0-pattern) : 1.2*(1.0-exposure));
          gl_FragColor=vec4(heatAvailable ? heatToLinear(ramp(temperature)) : heatNoData,heatOpacity);
          #include <colorspace_fragment>
        }`,
    });
  }
  const modelMaterial = material(false), groundMaterial = material(true), originals = new Map();
  root?.traverse(object => { if (object.isMesh) originals.set(object, object.material); });
  const overlays = [], readingByGuid = new Map();
  for (const space of roomSpaces) {
    if (!space.globalId || !Array.isArray(space.meshes) || !space.meshes.length) continue;
    for (const source of space.meshes) {
      const overlay = source.clone(false);
      overlay.material = new THREE.MeshBasicMaterial({ color: '#94a3b8', transparent: true, opacity: .48, side: THREE.DoubleSide, depthTest: false, depthWrite: false, clipping: true, toneMapped: false });
      overlay.renderOrder = 4; overlay.visible = false;
      overlay.userData = { ...overlay.userData, heatGlobalId: space.globalId, heatRoomName: space.name, storey: space.storeyID, floorIndex: space.floorIndex, floorCount: space.floorCount, basePosition: overlay.position.clone(), heatReading: null, heatTemperature: null, heatScenario: null };
      root.add(overlay); overlays.push(overlay);
    }
  }
  let selectedFloor = null;
  const geometry = new THREE.PlaneGeometry(1100, 1300);
  const ground = new THREE.Mesh(geometry, groundMaterial); ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, groundY + .12, -300); ground.renderOrder = 1; scene.add(ground);
  const readout = document.createElement('div'); readout.id = 'heat-readout'; readout.hidden = true;
  readout.setAttribute('role', 'status'); document.body.append(readout);
  function readSelection() {
    if (scenario.mode === 'measured') {
      if (!selected?.reading) {
        const count = new Set(overlays.filter(mesh => mesh.userData.heatReading).map(mesh => mesh.userData.heatGlobalId)).size;
        readout.textContent = count ? `${count} IFC-Räume mit echten Messwerten · Geschoss wählen und einen eingefärbten Raum anklicken.` : 'Keine echten Raumtemperaturwerte mit passender IFC-Raumzuordnung verfügbar.';
        readout.hidden = false; return;
      }
      const reading = selected.reading;
      const timestamp = new Date(reading.measuredAt);
      const time = Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Zeitpunkt unbekannt';
      readout.textContent = `${reading.roomCode || ''} ${reading.roomName || selected.roomName || 'Raum'} · ${Number(reading.temperature).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${reading.unit || '°C'} · ${time} · Sensor ${reading.sensorCode || reading.sensorID || 'unbekannt'} · echte Messung`;
      readout.hidden = false; return;
    }
    if (scenario.mode === 'simulated-rooms') {
      if (!selected || !Number.isFinite(selected.temperature)) {
        const count = new Set(overlays.filter(mesh => Number.isFinite(mesh.userData.heatTemperature)).map(mesh => mesh.userData.heatGlobalId)).size;
        readout.textContent = count ? `${count} IFC-Räume · Szenariowerte, keine Messungen · eingefärbten Raum anklicken.` : 'Keine IFC-Räume mit GlobalId und Raumgeometrie für die Simulation verfügbar.';
        readout.hidden = false; return;
      }
      readout.textContent = `${selected.roomName || 'Raum'} · ${selected.temperature.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C · ${selected.scenarioLabel} · simuliert, keine Messung`;
      readout.hidden = false; return;
    }
    if (!selected) return;
    const temperature = surfaceTemperature(scenario, selected.position, selected.normal, selected.ground);
    if (temperature === null) { readout.textContent = 'Kein Wetter-Messwert für diese Stunde · keine Temperatureinfärbung'; readout.hidden = false; return; }
    readout.textContent = `${selected.ground ? 'Kartenfläche' : 'Modelloberfläche'} · ${temperature.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} °C · simuliert`;
    readout.hidden = false;
  }
  function update(value) {
    const previousMode = scenario.mode;
    scenario = normalizeScenario(value);
    if (previousMode !== scenario.mode) selected = undefined;
    readingByGuid.clear();
    if (scenario.mode === 'measured') {
      for (const reading of (Array.isArray(value?.roomReadings) ? value.roomReadings.slice(0, 1000) : [])) {
        if (typeof reading?.globalId !== 'string' || !reading.globalId || reading.globalId.length > 100 ||
            !Number.isFinite(reading.temperature) || reading.unit !== '°C' ||
            !Number.isFinite(Date.parse(reading.measuredAt)) || reading.source !== 'real') continue;
        const previous = readingByGuid.get(reading.globalId);
        if (!previous || Date.parse(reading.measuredAt) > Date.parse(previous.measuredAt)) readingByGuid.set(reading.globalId, reading);
      }
      for (const overlay of overlays) {
        const reading = readingByGuid.get(overlay.userData.heatGlobalId);
        overlay.userData.heatReading = reading || null;
        overlay.userData.heatTemperature = reading ? reading.temperature : null;
        overlay.userData.heatScenario = null;
        if (reading) overlay.material.color.set(heatColor(reading.temperature));
      }
      root?.traverse(object => { if (object.isMesh && originals.has(object)) object.material = originals.get(object); });
      ground.visible = false;
      setFloor(selectedFloor);
      const hint = document.querySelector('#hint');
      if (hint) hint.textContent = 'Ziehen: drehen · Scrollen: zoomen · eingefärbten Raum anklicken: Messwert';
      selected = undefined;
      readSelection();
      window.parent.postMessage({ type: 'd21-heat-status', matchedRooms: new Set(overlays.map(mesh => mesh.userData.heatGlobalId).filter(id => readingByGuid.has(id))).size, readings: readingByGuid.size }, location.origin);
      document.querySelector('#model-mode').textContent = 'Raumtemperaturen · Messung';
      render(); return;
    }
    if (scenario.mode === 'simulated-rooms') {
      const preset = ROOM_TEMPERATURE_SCENARIOS.find(item => item.id === value?.roomSimulation?.preset) || ROOM_TEMPERATURE_SCENARIOS[1];
      const temperatures = new Map();
      for (const space of roomSpaces) {
        if (!space.globalId || !Array.isArray(space.meshes) || !space.meshes.length || temperatures.has(space.globalId)) continue;
        const temperature = simulatedRoomTemperature(space.globalId, space.floorIndex, space.floorCount, preset.id);
        if (Number.isFinite(temperature)) temperatures.set(space.globalId, temperature);
      }
      for (const overlay of overlays) {
        const temperature = temperatures.get(overlay.userData.heatGlobalId);
        overlay.userData.heatReading = null;
        overlay.userData.heatTemperature = Number.isFinite(temperature) ? temperature : null;
        overlay.userData.heatScenario = preset.label;
        if (Number.isFinite(temperature)) overlay.material.color.set(heatColor(temperature));
      }
      root?.traverse(object => { if (object.isMesh && originals.has(object)) object.material = originals.get(object); });
      ground.visible = false;
      setFloor(selectedFloor);
      const hint = document.querySelector('#hint');
      if (hint) hint.textContent = 'Ziehen: drehen · Scrollen: zoomen · eingefärbten Raum anklicken: Simulationswert';
      selected = undefined;
      readSelection();
      window.parent.postMessage({ type: 'd21-heat-status', mode: 'simulated-rooms', matchedRooms: temperatures.size, readings: 0, simulated: true }, location.origin);
      document.querySelector('#model-mode').textContent = 'Raumtemperaturen · Simulation';
      render(); return;
    }
    root?.traverse(object => { if (object.isMesh && originals.has(object)) object.material = modelMaterial; });
    const hint = document.querySelector('#hint');
    if (hint) hint.textContent = 'Ziehen: drehen · Scrollen: zoomen · Fläche anklicken: simulierte Temperatur';
    const condition = scenarioConditions(scenario);
    uniforms.heatAir.value = condition.air ?? 0; uniforms.heatAvailable.value = condition.available;
    uniforms.heatGain.value = condition.gain; uniforms.heatSun.value.fromArray(condition.direction);
    overlays.forEach(overlay => { overlay.visible = false; });
    ground.visible = scenario.campus && condition.available;
    if (previousMode !== scenario.mode) readout.hidden = true; else readSelection();
    render();
  }
  function receive(event) {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'd21-heat-state') update(event.data.scenario);
  }
  window.addEventListener('message', receive);
  window.parent.postMessage({ type: 'd21-heat-ready' }, location.origin);
  document.body.classList.add('heat-mode');
  document.querySelector('#model-mode').textContent = 'Heat map';
  document.querySelector('#home-mode').hidden = true; document.querySelector('#tools').hidden = true;

  update(scenario);
  return {
    ground,
    get targets() { return overlays.filter(overlay => overlay.visible && (overlay.userData.heatReading || Number.isFinite(overlay.userData.heatTemperature))); },
    setFloor(floorID) {
      selectedFloor = floorID;
      overlays.forEach(overlay => {
        const hasReading = Boolean(overlay.userData.heatReading) || Number.isFinite(overlay.userData.heatTemperature);
        overlay.visible = ['measured', 'simulated-rooms'].includes(scenario.mode) && hasReading && (floorID === null || floorID === undefined || overlay.userData.storey === floorID);
      });
      selected = undefined; readSelection(); render();
    },
    select(hit) {
      if (scenario.mode === 'measured') {
        selected = hit?.object?.userData?.heatReading ? { reading: hit.object.userData.heatReading, roomName: hit.object.userData.heatRoomName } : undefined;
        readout.hidden = !selected && scenario.mode !== 'measured'; readSelection(); return;
      }
      if (scenario.mode === 'simulated-rooms') {
        const data = hit?.object?.userData;
        selected = Number.isFinite(data?.heatTemperature) ? { temperature: data.heatTemperature, roomName: data.heatRoomName, scenarioLabel: data.heatScenario } : undefined;
        readout.hidden = !selected && scenario.mode !== 'simulated-rooms'; readSelection(); return;
      }
      selected = hit ? { position: hit.point.toArray(), normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray(), ground: hit.object === ground } : undefined;
      readout.hidden = !selected; readSelection();
    },
    dispose() {
      if (disposed) return; disposed = true;
      window.removeEventListener('message', receive);
      for (const [mesh, original] of originals) mesh.material = original;
      scene.remove(ground); geometry.dispose(); modelMaterial.dispose(); groundMaterial.dispose(); overlays.forEach(overlay => { root.remove(overlay); overlay.material.dispose(); }); readout.remove();
    },
  };
}
