import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addCampusMap } from './campus-map.js';
import { mountHeatLayer } from './heat-layer.js';
import { TERRAIN_COLOR } from './campus-terrain.js';

// The campus remains usable before a private model is provisioned or when access is denied.
export function mountCampusOnly() {
  const scene=new THREE.Scene();scene.background=new THREE.Color(TERRAIN_COLOR);
  const camera=new THREE.OrthographicCamera(-300,300,300,-300,.1,20000);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  document.querySelector('#scene').append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.minZoom=.15;controls.maxZoom=25;controls.maxPolarAngle=Math.PI*.49;
  const heatMode=new URLSearchParams(location.search).get('heat')==='true';
  const map=addCampusMap(scene,{outline:true,subdued:heatMode});let height=600,lastAspect=innerWidth/innerHeight;
  function projection(){const aspect=innerWidth/innerHeight;camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();}
  function render(){map.update(camera,render);renderer.render(scene,camera);}
  function fit(campus=true,top=false){
    const bounds=campus?map.bounds:new THREE.Box3(new THREE.Vector3(-65,0,-65),new THREE.Vector3(65,0,65));
    const center=bounds.getCenter(new THREE.Vector3());const span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
    height=span*1.2/Math.min(innerWidth/innerHeight,1);lastAspect=innerWidth/innerHeight;camera.zoom=1;projection();
    camera.position.copy(center).add(top||campus?new THREE.Vector3(0,span*3,span*.001):new THREE.Vector3(span*1.5,span*2,span*1.5));controls.target.copy(center);controls.update();render();
  }
  for(const selector of ['#tools','#home-mode','#home','#selection','#commands','#explode','#levels'])document.querySelector(selector).hidden=true;
  document.querySelector('#model-mode').textContent='Campus h_da';
  document.querySelector('#campus-fit').hidden=false;document.querySelector('#map-attribution').hidden=false;
  for(const button of document.querySelectorAll('#camera-tools button,#view-controls button,#modes button'))button.disabled=false;
  document.querySelector('#fit').onclick=()=>fit(false);document.querySelector('#campus-fit').onclick=()=>fit(true);document.querySelector('#top').onclick=()=>fit(false,true);
  document.querySelector('#toggle-labels').onclick=event=>{const visible=event.currentTarget.getAttribute('aria-pressed')!=='true';event.currentTarget.setAttribute('aria-pressed',String(visible));map.setLabels(visible);render();};
  for(const [id,factor]of[['zoom-in',1.25],['zoom-out',.8]])document.getElementById(id).onclick=()=>{camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.15,25);camera.updateProjectionMatrix();render();};
  controls.addEventListener('change',render);
  const heat = heatMode ? mountHeatLayer({scene,render}) : null;
  if(heat){
    const ray=new THREE.Raycaster();let down;
    renderer.domElement.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
    renderer.domElement.addEventListener('pointerup',event=>{
      if(!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>6)return;
      down=undefined;ray.setFromCamera(new THREE.Vector2(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2),camera);
      heat.select(heat.ground.visible ? ray.intersectObject(heat.ground)[0] : undefined);
    });
    renderer.domElement.addEventListener('pointercancel',()=>{down=undefined;});
  }
  const observer=new ResizeObserver(()=>{const aspect=innerWidth/innerHeight;height*=Math.min(lastAspect,1)/Math.min(aspect,1);lastAspect=aspect;projection();renderer.setSize(innerWidth,innerHeight);render();});observer.observe(document.body);
  window.addEventListener('pagehide',()=>{observer.disconnect();controls.dispose();heat?.dispose();map.dispose();renderer.dispose();},{once:true});
  document.querySelector('#status').hidden=true;renderer.setSize(innerWidth,innerHeight);fit();
}
