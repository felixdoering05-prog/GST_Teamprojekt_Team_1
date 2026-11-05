import * as THREE from 'three';
import {HEAT_STOPS} from '../../dashboard/base44-frontend/ifc-viewer/heat-simulation.js';
export function mountNativeHeat(root,render,applyMap){
 const uniforms={air:{value:0},gain:{value:0},sun:{value:new THREE.Vector3(0,1,0)},available:{value:false}};
 const colors=HEAT_STOPS.map(s=>new THREE.Color(s.color).convertLinearToSRGB());
 const palette=colors.map((c,i)=>`vec3 c${i}=vec3(${c.r.toFixed(8)},${c.g.toFixed(8)},${c.b.toFixed(8)});`).join('');
 const ramp=colors.slice(1).map((_,i)=>`if(t<=${HEAT_STOPS[i+1].value.toFixed(1)})return mix(c${i},c${i+1},clamp((t-(${HEAT_STOPS[i].value.toFixed(1)}))/10.0,0.0,1.0));`).join('');
 const material=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,toneMapped:false,vertexShader:'varying vec3 n;void main(){n=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`uniform float air;uniform float gain;uniform vec3 sun;uniform bool available;varying vec3 n;vec3 ramp(float t){${palette}${ramp}return c6;}void main(){float exposure=max(0.0,dot(normalize(n),sun));float t=air+gain*(.35+.65*exposure)-1.2*(1.0-exposure);vec3 c=ramp(t);c=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));gl_FragColor=vec4(available?c:vec3(.55,.6,.65),1.0);#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
 root.traverse(o=>{if(o.isMesh)o.material=material});
 window.d21SetWeather=value=>{const valid=typeof value?.temperature==='number'&&Number.isFinite(value.temperature)&&value.temperature>=-90&&value.temperature<=65;uniforms.available.value=valid;uniforms.air.value=valid?value.temperature:0;uniforms.gain.value=Number.isFinite(value?.radiation)?Math.max(0,Math.min(18,value.radiation/60)):0;const angle=((value?.hour??12)-12)*Math.PI/12;uniforms.sun.value.set(Math.sin(angle),.8,Math.cos(angle)).normalize();if(value?.map_view)applyMap(value.map_view);render()};
 for(const id of ['home-mode','tools','home','commands','selection'])document.getElementById(id).hidden=true;
 document.getElementById('model-mode').textContent='Heatmap · simulierte Oberflächen';document.getElementById('hint').textContent='Wettermodell als Grundlage · keine gemessenen Raumtemperaturen';
 window.d21SetWeather({});window.webkit?.messageHandlers?.ifcHeatReady?.postMessage('ready');
 window.addEventListener('pagehide',()=>{delete window.d21SetWeather;material.dispose()},{once:true});
}
