import * as THREE from 'three';
export function hull(points){const a=[...new Map(points.map(p=>[p.map(v=>v.toFixed(4)).join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(a.length<3)return a;const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const l=[],u=[];for(const p of a){while(l.length>=2&&cross(l.at(-2),l.at(-1),p)<=0)l.pop();l.push(p);}for(const p of [...a].reverse()){while(u.length>=2&&cross(u.at(-2),u.at(-1),p)<=0)u.pop();u.push(p);}const all=[...l.slice(0,-1),...u.slice(0,-1)];if(all.length<=128)return all;return all.filter((_,i)=>i%Math.ceil(all.length/128)===0);}
export function placementGeometry(root,bounds,coordination){
 if(!Array.isArray(coordination)||coordination.length!==16||!coordination.every(Number.isFinite))throw Error('Modellreferenz fehlt.');const matrix=new THREE.Matrix4().fromArray(coordination);if(Math.abs(matrix.determinant())<1e-12)throw Error('Modellreferenz ungültig.');
 const center=bounds.getCenter(new THREE.Vector3()),original=center.clone().applyMatrix4(matrix.invert());let count=0;root.traverse(o=>{if(o.isMesh)count+=o.geometry.attributes.position.count});const step=Math.max(1,Math.ceil(count/16000)),points=[],p=new THREE.Vector3();root.updateMatrixWorld(true);
 root.traverse(o=>{if(!o.isMesh)return;const positions=o.geometry.attributes.position;for(let i=0;i<positions.count;i+=step){p.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);points.push([p.x-center.x,p.z-center.z]);}});
 return {center:[original.x,-original.z,original.y],outline:hull(points)};
}
