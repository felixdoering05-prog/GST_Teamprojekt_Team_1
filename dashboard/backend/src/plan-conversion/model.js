// The provider describes geometry only. It cannot supply commands, paths or code.
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {promisify}=require('node:util');
const exec=promisify(execFile);
class PlanError extends Error {constructor(code){super(code);this.code=code;}}
const bad=()=>{throw new PlanError('invalid_geometry')};
const keys=(v,list)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!list.includes(k)))bad();};
const num=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)bad();return v;};
const text=v=>{if(typeof v!=='string'||v.length>160||/[\x00-\x1f]/.test(v))bad();return v;};
const point=p=>{if(!Array.isArray(p)||p.length!==2)bad();return p.map(n=>num(n,-100000,100000));};
const array=(v,max,min=0)=>{if(!Array.isArray(v)||v.length<min||v.length>max)bad();return v;};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function validateGeometry(g){
 keys(g,['status','reason','warnings','levels']);if(!['ok','needs_input'].includes(g.status))bad();text(g.reason);array(g.warnings,20).forEach(text);
 if(g.status==='needs_input')throw new PlanError('needs_input');
 const names=new Set();let count=0;
 array(g.levels,4,1).forEach(l=>{
  keys(l,['name','elevation','height','height_assumed','width','depth','dimension_evidence','boundary','walls','openings','rooms']);text(l.name);if(!l.name||names.has(l.name))bad();names.add(l.name);
  num(l.elevation,-10000,30000);num(l.height,1800,6000);if(typeof l.height_assumed!=='boolean'||l.height_assumed&&l.height!==2500)bad();num(l.width,1000,100000);num(l.depth,1000,100000);
  array(l.dimension_evidence,6,2).forEach(v=>{keys(v,['axis','mm','label']);if(!['x','y'].includes(v.axis)||!text(v.label))bad();num(v.mm,1000,100000);});
  for(const axis of ['x','y'])if(!l.dimension_evidence.some(d=>d.axis===axis&&Math.abs(d.mm-l[axis==='x'?'width':'depth'])<=Math.max(30,d.mm*.02)))bad();
  array(l.boundary,32,3).forEach(point);
  const xs=l.boundary.map(p=>p[0]),ys=l.boundary.map(p=>p[1]);
  if(Math.abs(Math.max(...xs)-Math.min(...xs)-l.width)>30||Math.abs(Math.max(...ys)-Math.min(...ys)-l.depth)>30)bad();
  const inside=p=>{point(p);if(p[0]<Math.min(...xs)-1000||p[0]>Math.max(...xs)+1000||p[1]<Math.min(...ys)-1000||p[1]>Math.max(...ys)+1000)bad();};
  array(l.walls,160,4).forEach(w=>{keys(w,['a','b','thickness']);inside(w.a);inside(w.b);if(dist(w.a,w.b)<100)bad();num(w.thickness,60,1000);});
  count+=l.walls.length;if(count>240)bad();
  array(l.openings,100).forEach(o=>{keys(o,['kind','at','width','height','sill']);if(!['door','window'].includes(o.kind))bad();inside(o.at);num(o.width,300,5000);num(o.height,300,l.height);num(o.sill,0,l.height-o.height);if(o.kind==='door'&&o.sill!==0)bad();
   if(!l.walls.some(w=>{const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],length=dist(w.a,w.b),t=((o.at[0]-w.a[0])*dx+(o.at[1]-w.a[1])*dy)/(length*length);return t>=o.width/length/2&&t<=1-o.width/length/2&&dist(o.at,[w.a[0]+t*dx,w.a[1]+t*dy])<50;}))bad();
  });
  array(l.rooms,80).forEach(r=>{keys(r,['name','point']);text(r.name);inside(r.point);});
 });return g;
}
function recipe(g,preview){
 validateGeometry(g);const lines=[];const cmd=(c,p)=>lines.push(c+' '+JSON.stringify(p));
 cmd('new',{name:'KI-Planentwurf – ungeprüft',language:'en'});cmd('delete',{ids:[100001]});
 cmd('material',{name:'Entwurf',color:'#c7d7e9'});cmd('type',{category:'floor',name:'Entwurfsdecke 200 mm ANNAHME',thickness:200});
 const types=new Set();
 g.levels.forEach((l,i)=>{
  if(i===0){cmd('modify',{id:100000,name:l.name,elevation:l.elevation});}else cmd('level',{name:l.name,elevation:l.elevation});
  [...new Set(l.walls.map(w=>w.thickness))].forEach(t=>{if(!types.has(t)){cmd('type',{category:'wall',name:'Wand-'+t,thickness:t,material:'Entwurf'});types.add(t);}});
  l.walls.forEach(w=>cmd('wall',{points:[w.a,w.b],type:'Wand-'+w.thickness,height:l.height,level:l.name}));
  cmd('floor',{boundary:l.boundary,type:'Entwurfsdecke 200 mm ANNAHME',level:l.name});
  l.openings.forEach((o,j)=>{const name='O-'+i+'-'+j;cmd('type',{category:o.kind,name,width:o.width,height:o.height,...(o.kind==='window'?{sill:o.sill}:{})});cmd(o.kind,{at:o.at,type:name,level:l.name});});
  l.rooms.forEach((r,j)=>cmd('room',{point:r.point,name:r.name,number:i+'-'+j,level:l.name,top_level:l.name,limit_offset:l.height}));
 });
 cmd('render',{view:'{3D}',width:1200,height:900,path:preview,azimuth:315,elevation:50});
 cmd('inspect',{});cmd('elements',{category:'room',limit:400});return lines.join('\n')+'\n';
}
async function generateIFC(g,{root=process.env.PLAN_WORK_DIR||'/tmp/d21-plans',binary=process.env.BIMCRAFT_BIN||'/opt/bimcraft/bin/bimcraft-cli',runner=exec}={}){
 await fs.mkdir(root,{recursive:true,mode:0o700});const dir=await fs.mkdtemp(path.join(root,'job-'));
 try{
  const script=path.join(dir,'model.txt'),preview=path.join(dir,'preview.png'),ifc=path.join(dir,'model.ifc');
  await fs.writeFile(script,recipe(g,preview),{mode:0o600});
  const {stdout}=await runner(binary,['run','--script',script,'--save',ifc],{timeout:120000,killSignal:'SIGKILL',maxBuffer:512*1024,env:{...process.env,BIMCRAFT_NO_UPDATE_CHECK:'1'}});
  const records=stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
  if(records.some(r=>r.error||r.ok===false))throw new PlanError('model_generation_failed');
  const inspection=records.find(r=>r.counts&&r.levels);
  if(!inspection||!inspection.counts.wall)throw new PlanError('model_generation_failed');
  const info=await fs.stat(ifc),image=await fs.stat(preview);if(info.size>4*1024*1024||image.size>2*1024*1024)throw new PlanError('output_too_large');
  const output=await fs.readFile(ifc),png=await fs.readFile(preview);
  if(!output.subarray(0,64).toString().includes('ISO-10303-21')||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new PlanError('model_generation_failed');
  const warnings=['Vorläufiger KI-Entwurf: Maße, Wände und Öffnungen vor Verwendung prüfen.','Dach und Treppen nicht rekonstruiert. Deckenstärke 200 mm angenommen.',...g.warnings];
  if(g.levels.some(l=>l.height_assumed))warnings.push('Geschosshöhe mangels Planangabe mit 2,50 m angenommen.');
  const rooms=records.find(r=>Array.isArray(r.elements))?.elements||[];
  if(rooms.some(r=>r.enclosed===false))warnings.push('Mindestens ein Raum ist nicht geschlossen. Raumgrenzen nacharbeiten.');
  if(inspection.warnings?.length)warnings.push('BIMCraft meldet Modellhinweise; Entwurf sorgfältig prüfen.');
  return {ifc:output,preview:png,warnings};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={PlanError,validateGeometry,recipe,generateIFC};
