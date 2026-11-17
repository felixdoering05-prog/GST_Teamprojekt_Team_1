// Correction editor: the owner moves, deletes and adds walls, doors and windows, names rooms and can mark a known
// distance. The edited geometry is validated strictly here and rebuilt by plan-extract (no AI, no new quota).
const {fail}=require('./queue');
const MAX_COORD=200000;
const bad=msg=>fail(msg||'Die Korrektur ist ungültig. Bitte Editor neu laden.');
const num=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const point=v=>Array.isArray(v)&&v.length===2&&v.every(c=>num(c,-MAX_COORD,MAX_COORD))?[Math.round(v[0]*10)/10,Math.round(v[1]*10)/10]:bad();
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,16}$/.test(v)?v:bad();
const plain=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)?v.trim():bad('Raumnamen: 1 bis 60 Zeichen, keine Steuerzeichen.');
const keys=(o,allowed)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))bad();};
const list=(v,min,max)=>Array.isArray(v)&&v.length>=min&&v.length<=max?v:bad();

/** Editor view of a finished job: geometry after review/edits in mm (y up) plus the photo overlay mapping. */
function editorView(job){
 const final=job.analysis?.final;
 if(job.analysis?.source!=='vector'||!Array.isArray(final)||!final.length)return null;
 return {roof:roofOf(job.analysis?.candidates),levels:final.map((l,i)=>({index:i,name:l.name,source:l.source?.kind==='raster'?'raster':'vector',width:l.width,depth:l.depth,
  elevation:l.elevation??0,height:l.height??2500,offset:Array.isArray(l.offset)?l.offset:[0,0],
  scale:{method:l.scale?.method??null,estimated:l.scale?.estimated===true},
  walls:(l.walls||[]).map(w=>({id:w.id,a:w.a,b:w.b,thickness:w.thickness})),
  openings:(l.openings||[]).map(o=>({id:o.id,kind:o.kind,wall:o.wall,at:o.at,width:o.width})),
  rooms:(l.rooms||[]).map(r=>({id:r.id,name:r.name,area_m2:r.area_m2,point:r.point,polygon:r.polygon})),
  image:l.raster?.image?{name:l.raster.image,size_px:l.raster.size_px,mm_per_px:l.raster.mm_per_px,origin_px:l.raster.origin_px,image_scale:l.raster.image_scale??1}:null}))};
}

/** body.levels[i] = {walls, openings, rooms, reference?} -> candidates for plan-extract build (edited levels). */
function editedCandidates(body,final){
 keys(body,['levels','request_key']);
 const levels=list(body.levels,1,4);if(levels.length!==final.length)bad();
 return {version:1,skipped:[],levels:levels.map((l,i)=>{
  keys(l,['walls','openings','rooms','reference']);const base=final[i];
  const ids=new Map();
  const walls=list(l.walls,3,400).map((w,k)=>{
   keys(w,['id','a','b','thickness']);const a=point(w.a),b=point(w.b);
   if(Math.hypot(b[0]-a[0],b[1]-a[1])<100)bad('Eine Wand ist kürzer als 10 cm.');
   if(!num(w.thickness,50,1000))bad('Wandstärke zwischen 5 und 100 cm angeben.');
   const nid=`W${k+1}`;if(ids.has(id(w.id)))bad();ids.set(w.id,nid);
   return {id:nid,a,b,thickness:Math.round(w.thickness*10)/10};
  });
  const openings=list(l.openings,0,400).map(o=>{
   keys(o,['id','kind','wall','at','width']);if(!['door','window','opening'].includes(o.kind))bad();
   const wall=ids.get(id(o.wall));if(!wall)bad();if(!num(o.width,300,6000))bad('Öffnungen zwischen 30 cm und 6 m breit.');
   const door=o.kind!=='window';
   return {kind:o.kind,wall,at:point(o.at),width:Math.round(o.width),height:door?2010:1350,sill:door?0:900,height_assumed:true,evidence:'user'};
  });
  const room_names=list(l.rooms,0,200).map(r=>{keys(r,['point','name']);return {point:point(r.point),name:plain(r.name,60)};});
  let reference;
  if(l.reference!==undefined&&l.reference!==null){keys(l.reference,['a','b','mm']);if(!num(l.reference.mm,100,200000))bad('Bekannte Strecke: 10 cm bis 200 m.');
   reference={a:point(l.reference.a),b:point(l.reference.b),mm:l.reference.mm};if(Math.hypot(reference.b[0]-reference.a[0],reference.b[1]-reference.a[1])<50)bad('Die markierte Strecke ist zu kurz.');}
  return {name:base.name,source:base.source,scale:base.scale,height:base.height??2500,height_assumed:base.height_assumed??true,elevation:base.elevation??0,
   width:base.width,depth:base.depth,...(base.raster?{raster:base.raster}:{}),...(Array.isArray(base.offset)?{offset:base.offset}:{}),walls,openings,rooms:[],texts:[],room_names,...(reference?{reference}:{}),edited:true,warnings:[]};
 })};
}

// Roof of the top storey: flat (with parapet), gable or shed; pitch in degrees, ridge along the long or short side.
const ROOF_TYPES=['flat','gable','shed'];
function validRoof(r){keys(r,['type','pitch','ridge']);if(!ROOF_TYPES.includes(r.type))bad('Unbekannte Dachform.');
 if(r.type==='flat')return {type:'flat'};
 if(!Number.isInteger(r.pitch)||r.pitch<5||r.pitch>60)bad('Dachneigung zwischen 5 und 60 Grad angeben.');
 if(!['long','short'].includes(r.ridge))bad('Firstrichtung längs oder quer angeben.');return {type:r.type,pitch:r.pitch,ridge:r.ridge};}
function roofOf(candidates){const r=candidates?.roof;try{return r?validRoof(r):{type:'flat'};}catch{return {type:'flat'};}}
// Storeys in building order (bottom to top). EG sits at height 0; storeys below it get negative elevations.
const LEVEL_NAMES=['2. UG','UG','EG','1. OG','2. OG','3. OG','DG'];
const SLAB=200;
/** body.levels = [{index, name, height, offset}] -> which recognised plans become which storey, stacked by name order.
 *  Plans that are not listed are left out. Geometry is taken from the current draft (no AI, no new quota). */
function stackedCandidates(body,final,previous){
 keys(body,['levels','request_key','roof']);
 const roof=body.roof===undefined?roofOf(previous):validRoof(body.roof);
 const chosen=list(body.levels,1,4).map(l=>{
  keys(l,['index','name','height','offset']);
  if(!Number.isInteger(l.index)||l.index<0||l.index>=final.length)bad();
  if(!LEVEL_NAMES.includes(l.name))bad('Unbekannte Ebene.');
  if(!num(l.height,2000,6000))bad('Geschosshöhe zwischen 2,00 und 6,00 m angeben.');
  const offset=l.offset===undefined?[0,0]:list(l.offset,2,2);
  if(!offset.every(v=>num(v,-50000,50000)))bad('Versatz höchstens 50 m.');
  return {index:l.index,name:l.name,height:Math.round(l.height),offset:offset.map(v=>Math.round(v))};
 });
 if(new Set(chosen.map(l=>l.index)).size!==chosen.length)bad('Jeder Plan kann nur einer Ebene zugeordnet werden.');
 if(new Set(chosen.map(l=>l.name)).size!==chosen.length)bad('Jede Ebene darf nur einmal vorkommen.');
 chosen.sort((a,b)=>LEVEL_NAMES.indexOf(a.name)-LEVEL_NAMES.indexOf(b.name));
 // Elevations: EG (or the lowest storey above ground) at 0, the rest stacked with a 20 cm slab in between.
 let ground=chosen.findIndex(l=>LEVEL_NAMES.indexOf(l.name)>=LEVEL_NAMES.indexOf('EG'));if(ground<0)ground=chosen.length;
 const elev=new Array(chosen.length).fill(0);
 for(let i=ground+1;i<chosen.length;i++)elev[i]=elev[i-1]+chosen[i-1].height+SLAB;
 for(let i=ground-1;i>=0;i--)elev[i]=(i+1<chosen.length?elev[i+1]:0)-chosen[i].height-SLAB;
 return {version:1,skipped:[],roof,levels:chosen.map((l,i)=>{
  const base=final[l.index];
  const walls=(base.walls||[]).map(w=>({id:w.id,a:w.a,b:w.b,thickness:w.thickness}));
  if(walls.length<3)bad('Für diese Ebene wurden zu wenige Wände erkannt. Bitte zuerst im Editor korrigieren.');
  const ids=new Set(walls.map(w=>w.id));
  const openings=(base.openings||[]).filter(o=>ids.has(o.wall)).map(o=>{const door=o.kind!=='window';return {kind:o.kind,wall:o.wall,at:o.at,width:o.width,height:door?2010:1350,sill:door?0:900,height_assumed:true,evidence:'user'};});
  const room_names=(base.rooms||[]).filter(r=>Array.isArray(r.point)&&typeof r.name==='string'&&r.name.trim()).map(r=>({point:r.point,name:r.name.slice(0,60)}));
  return {name:l.name,source:base.source,scale:base.scale,height:l.height,height_assumed:false,elevation:elev[i],width:base.width,depth:base.depth,
   ...(base.raster?{raster:base.raster}:{}),offset:l.offset,walls,openings,rooms:[],texts:[],room_names,edited:true,warnings:[]};
 })};
}
module.exports={editorView,editedCandidates,stackedCandidates,roofOf,LEVEL_NAMES};
