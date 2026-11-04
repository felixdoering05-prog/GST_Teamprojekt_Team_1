import * as THREE from 'three';
import { HEAT_STOPS, normalizeScenario, scenarioConditions, surfaceTemperature } from './heat-simulation.js';

// One GPU material for all IFC meshes; no geometry copying on time/season changes.
export function mountHeatLayer({ scene, root, groundY = 0, render }) {
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
  root?.traverse(object => { if (object.isMesh) { originals.set(object, object.material); object.material = modelMaterial; } });
  const geometry = new THREE.PlaneGeometry(1100, 1300);
  const ground = new THREE.Mesh(geometry, groundMaterial); ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, groundY + .12, -300); ground.renderOrder = 1; scene.add(ground);
  const readout = document.createElement('div'); readout.id = 'heat-readout'; readout.hidden = true;
  readout.setAttribute('role', 'status'); document.body.append(readout);
  function readSelection() {
    if (!selected) return;
    const temperature = surfaceTemperature(scenario, selected.position, selected.normal, selected.ground);
    if (temperature === null) { readout.textContent = 'Kein Wetter-Messwert für diese Stunde · keine Temperatureinfärbung'; readout.hidden = false; return; }
    readout.textContent = `${selected.ground ? 'Kartenfläche' : 'Modelloberfläche'} · ${temperature.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} °C · simuliert`;
    readout.hidden = false;
  }
  function update(value) {
    scenario = normalizeScenario(value);
    const condition = scenarioConditions(scenario);
    uniforms.heatAir.value = condition.air ?? 0; uniforms.heatAvailable.value = condition.available;
    uniforms.heatGain.value = condition.gain; uniforms.heatSun.value.fromArray(condition.direction);
    ground.visible = scenario.campus && condition.available; readSelection(); render();
  }
  function receive(event) {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'd21-heat-state') update(event.data.scenario);
  }
  window.addEventListener('message', receive);
  window.parent.postMessage({ type: 'd21-heat-ready' }, location.origin);
  document.body.classList.add('heat-mode');
  document.querySelector('#model-mode').textContent = 'Heat map · Simulation';
  document.querySelector('#home-mode').hidden = true; document.querySelector('#tools').hidden = true;
  document.querySelector('#hint').textContent = 'Ziehen: drehen · Scrollen: zoomen · Fläche anklicken: simulierte Temperatur';
  update(scenario);
  return {
    ground,
    select(hit) {
      selected = hit ? { position: hit.point.toArray(), normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray(), ground: hit.object === ground } : undefined;
      readout.hidden = !selected; readSelection();
    },
    dispose() {
      if (disposed) return; disposed = true;
      window.removeEventListener('message', receive);
      for (const [mesh, original] of originals) mesh.material = original;
      scene.remove(ground); geometry.dispose(); modelMaterial.dispose(); groundMaterial.dispose(); readout.remove();
    },
  };
}
