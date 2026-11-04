import * as THREE from 'three';
export function localPoint(lon,lat,view){const north=(lat-view.latitude)*111320,east=(lon-view.longitude)*111320*Math.cos(view.latitude*Math.PI/180);return [east/view.meters_per_unit,-north/view.meters_per_unit];}
export function mountMapEnvironment(scene,groundY,render){
 let previous='',group;
 function clear(){if(!group)return;scene.remove(group);group.traverse(x=>{x.geometry?.dispose();x.material?.dispose();});group=null;}
 const note=document.createElement('div');note.id='map-attribution';document.body.append(note);
 return view=>{
  const signature=JSON.stringify(view);if(signature===previous)return;previous=signature;clear();note.replaceChildren();
  if(!view?.features||!Array.isArray(view.features)||!Number.isFinite(view.meters_per_unit)||view.meters_per_unit<=0)return;
  group=new THREE.Group();group.position.y=groundY+.03;group.rotation.y=view.heading*Math.PI/180;
  const unit=view.meters_per_unit;
  for(const feature of view.features.slice(0,200)){
   const coords=feature.geometry.map(p=>localPoint(p[0],p[1],view));
   if(feature.kind==='road'){
    for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.001)continue;
     const road=new THREE.Mesh(new THREE.BoxGeometry(feature.width/unit,.035/unit,length),new THREE.MeshStandardMaterial({color:feature.width<=2?'#dce0e2':'#c6ccd1',roughness:1}));road.position.set((a[0]+b[0])/2,.02/unit,(a[1]+b[1])/2);road.rotation.y=Math.atan2(dx,dz);road.receiveShadow=true;group.add(road);
    }
   }else{
    // Omit the footprint containing the model's anchor; the IFC supplies that building.
    let contains=false;for(let i=0,j=coords.length-1;i<coords.length;j=i++){const a=coords[i],b=coords[j];if((a[1]>0)!==(b[1]>0)&&0<(b[0]-a[0])*(-a[1])/(b[1]-a[1])+a[0])contains=!contains;}
    if(feature.kind==='building'&&contains)continue;
    const shape=new THREE.Shape(coords.map(p=>new THREE.Vector2(p[0],-p[1])));
    const geometry=feature.kind==='building'?new THREE.ExtrudeGeometry(shape,{depth:feature.height/unit,bevelEnabled:false}):new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:feature.kind==='building'?'#e6e7e5':'#d7e3d7',roughness:1,side:THREE.DoubleSide}));mesh.position.y=feature.kind==='building'?.04/unit:.005/unit;mesh.castShadow=feature.kind==='building';mesh.receiveShadow=true;group.add(mesh);
   }
  }
  scene.add(group);
  const attribution=document.createElement('a');attribution.href='https://www.openstreetmap.org/copyright';attribution.textContent='© OpenStreetMap-Mitwirkende';attribution.target='_blank';attribution.rel='noopener';note.append(attribution,document.createTextNode(' · Umgebung vereinfacht; fehlende Höhen geschätzt · Position manuell'));render();
 };
}
