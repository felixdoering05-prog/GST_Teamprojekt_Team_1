import * as THREE from 'three';
export function localPoint(lon,lat,view){const north=(lat-view.latitude)*111320,east=(lon-view.longitude)*111320*Math.cos(view.latitude*Math.PI/180);return [east/view.meters_per_unit,-north/view.meters_per_unit];}
export function mountMapEnvironment(scene,groundY,render){
 let previous='',group,groundMesh,groundGroup,lastView,pendingGround;
 function clear(){if(!group)return;scene.remove(group);group.traverse(x=>{x.geometry?.dispose();x.material?.dispose();});group=null;}
 const note=document.createElement('div');note.id='map-attribution';document.body.append(note);
 const placeGround=()=>{
  if(!groundMesh||!lastView)return;
  if(!groundGroup){groundGroup=new THREE.Group();scene.add(groundGroup);}
  groundGroup.position.y=groundY+.012/ (lastView.meters_per_unit||1);groundGroup.rotation.y=lastView.heading*Math.PI/180;
  if(groundMesh.parent!==groundGroup)groundGroup.add(groundMesh);render();
 };
 const apply=view=>{
  const signature=JSON.stringify(view);if(signature===previous)return;previous=signature;clear();note.replaceChildren();
  if(!view?.features||!Array.isArray(view.features)||!Number.isFinite(view.meters_per_unit)||view.meters_per_unit<=0)return;
  lastView=view;placeGround();if(pendingGround){apply.setGround(...pendingGround);pendingGround=null;}
  group=new THREE.Group();group.position.y=groundY+.03;group.rotation.y=view.heading*Math.PI/180;
  const unit=view.meters_per_unit;
  for(const feature of view.features.slice(0,200)){
   const coords=feature.geometry.map(p=>localPoint(p[0],p[1],view));
   if(!coords.some(p=>Math.abs(p[0]*view.meters_per_unit)<=50&&Math.abs(p[1]*view.meters_per_unit)<=50))continue;
   if(feature.kind==='road'){
    for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.001)continue;
     const road=new THREE.Mesh(new THREE.BoxGeometry(feature.width/unit,.035/unit,length),new THREE.MeshStandardMaterial({color:feature.width<=2?'#f1f3f5':'#e2e6eb',roughness:1}));road.position.set((a[0]+b[0])/2,.02/unit,(a[1]+b[1])/2);road.rotation.y=Math.atan2(dx,dz);road.receiveShadow=true;group.add(road);
    }
   }else{
    // Omit the footprint containing the model's anchor; the IFC supplies that building.
    let contains=false;for(let i=0,j=coords.length-1;i<coords.length;j=i++){const a=coords[i],b=coords[j];if((a[1]>0)!==(b[1]>0)&&0<(b[0]-a[0])*(-a[1])/(b[1]-a[1])+a[0])contains=!contains;}
    if(feature.kind==='building'&&contains)continue;
    const shape=new THREE.Shape(coords.map(p=>new THREE.Vector2(p[0],-p[1])));
    const geometry=feature.kind==='building'?new THREE.ExtrudeGeometry(shape,{depth:feature.height/unit,bevelEnabled:false}):new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:feature.kind==='building'?'#f5f6f7':'#eef3ef',roughness:1,side:THREE.DoubleSide}));mesh.position.y=feature.kind==='building'?.04/unit:.005/unit;mesh.castShadow=feature.kind==='building';mesh.receiveShadow=true;group.add(mesh);
   }
  }
  scene.add(group);
  const attribution=document.createElement('a');attribution.href='https://www.openstreetmap.org/copyright';attribution.textContent='© OpenStreetMap-Mitwirkende';attribution.target='_blank';attribution.rel='noopener';note.append(attribution,document.createTextNode(' · Umgebung vereinfacht; fehlende Höhen geschätzt · Position manuell'));render();
 };
 apply.setGround=(url,metres)=>{
  // North-up map image (Apple Maps snapshot from the app) as ground under the model; receives shadows.
  if(!lastView||!Number.isFinite(metres)||metres<=0){pendingGround=[url,metres];return;}
  const size=metres/lastView.meters_per_unit;
  new THREE.TextureLoader().load(url,texture=>{
   texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
   if(groundMesh){groundMesh.geometry.dispose();groundMesh.material.map?.dispose();groundMesh.material.dispose();groundMesh.removeFromParent();}
   groundMesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshLambertMaterial({map:texture}));
   groundMesh.rotation.x=-Math.PI/2;groundMesh.receiveShadow=true;placeGround();
   if(!note.querySelector('.ground-credit')){const credit=document.createElement('span');credit.className='ground-credit';credit.textContent=' · Kartenboden: Apple Karten';note.append(credit);}
  });
 };
 return apply;
}
