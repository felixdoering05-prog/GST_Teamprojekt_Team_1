import * as THREE from 'three';
import locations from './campus-locations.json';
import footprint from './d21-footprint.json';
import { campusPoint, coordinateTile, tilePosition } from './campus-projection.js';

// Public map tiles are loaded only when visible; browser HTTP caching remains enabled.
export function addCampusMap(scene, { groundY = 0, outline = false, center = null } = {}) {
  const group = new THREE.Group(); group.position.y = groundY - .03; scene.add(group);
  const tiles = [], labels = [], resources = new Set(); let disposed = false, repaint = () => {};
  const keep = resource => { resources.add(resource); return resource; };
  const zoom = center ? 19 : 17;
  const origin = center || undefined;
  const [centerX, centerY] = center ? coordinateTile(center, zoom) : [0, 0];
  const [west, north] = center ? [centerX - 1, centerY - 1] : coordinateTile([8.6308, 49.8703], zoom);
  const [east, south] = center ? [centerX + 1, centerY + 1] : coordinateTile([8.6425, 49.8620], zoom);
  const tileCount = 2 ** zoom;
  const geometry = keep(new THREE.PlaneGeometry(1, 1));
  for (let y = north; y <= south; y++) for (let x = west; x <= east; x++) {
    const position = tilePosition(x, y, zoom, origin);
    const material = keep(new THREE.MeshBasicMaterial({ color:'#eceeea', toneMapped:false }));
    const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, 0, position.z); mesh.scale.set(position.size, position.size, 1); group.add(mesh);
    const box = new THREE.Box3(new THREE.Vector3(position.x-position.size/2,groundY-.1,position.z-position.size/2),new THREE.Vector3(position.x+position.size/2,groundY+.1,position.z+position.size/2));
    tiles.push({mesh,box,x:((x % tileCount) + tileCount) % tileCount,y,state:'idle'});
  }
  if (outline) {
    const shape = new THREE.Shape(footprint.coordinates.map(coordinate => { const [x,z]=campusPoint(coordinate);return new THREE.Vector2(x,-z); }));
    const mesh = new THREE.Mesh(keep(new THREE.ShapeGeometry(shape)), keep(new THREE.MeshBasicMaterial({color:'#8baa19',toneMapped:false,side:THREE.DoubleSide})));
    mesh.rotation.x=-Math.PI/2;mesh.position.y=.08;group.add(mesh);
  }
  const labelGroup = new THREE.Group(); group.add(labelGroup);
  for (const building of (center ? [] : locations.buildings)) {
    if (building.code === 'D21' && !outline) continue;
    const canvas = document.createElement('canvas');canvas.width=128;canvas.height=56;
    const context=canvas.getContext('2d');context.fillStyle=building.code==='D21'?'#087f80':'#ffffffeb';context.beginPath();context.roundRect(0,0,128,56,10);context.fill();
    context.fillStyle=building.code==='D21'?'#fff':'#42502a';context.font='600 32px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(building.code,64,29);
    const texture=keep(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(keep(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false})));sprite.scale.set(14,6.125,1);
    const [x,z]=campusPoint(building.coordinates);sprite.position.set(x,1,z);sprite.renderOrder=5;labelGroup.add(sprite);labels.push(sprite);
  }
  const warning=document.querySelector('#map-status');const retry=document.querySelector('#map-retry');
  if(retry)retry.onclick=()=>{tiles.forEach(tile=>{if(tile.state==='error')tile.state='idle';});repaint();};
  const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  const frustum=new THREE.Frustum();
  const campusBounds = new THREE.Box3();
  if (center) campusBounds.setFromObject(group).expandByScalar(4);
  else { for (const building of locations.buildings) { const [x,z]=campusPoint(building.coordinates);campusBounds.expandByPoint(new THREE.Vector3(x,groundY,z)); } campusBounds.expandByScalar(45); }
  return {
    bounds:campusBounds,
    setLabels(visible){labelGroup.visible=visible;},
    update(camera,render){
      repaint=render;camera.updateMatrixWorld();frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      let failed=false;
      for(const tile of tiles){
        tile.mesh.visible=frustum.intersectsBox(tile.box);
        if(!tile.mesh.visible)continue;
        if(tile.state==='error')failed=true;
        if(tile.state!=='idle')continue;
        tile.state='loading';loader.load(`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`,texture=>{
          if(disposed){texture.dispose();return;}keep(texture);texture.colorSpace=THREE.SRGBColorSpace;tile.mesh.material.map=texture;tile.mesh.material.needsUpdate=true;tile.state='ready';repaint();
        },undefined,()=>{if(!disposed){tile.state='error';repaint();}});
      }
      if(warning)warning.hidden=!failed;
    },
    dispose(){disposed=true;scene.remove(group);for(const resource of resources)resource.dispose();}
  };
}
