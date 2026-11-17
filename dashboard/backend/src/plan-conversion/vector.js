// Deterministic measurement of vector plans (DXF, DWG, vector PDF) and recognition of photos/scans (raster path,
// OpenCV) by the Python extractor in plan-extract/. Runs locally without network access; only file paths and fixed
// arguments are passed. A measured vector plan always wins over photos of it.
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {promisify}=require('node:util');
const {PlanError}=require('./model');
const exec=promisify(execFile);
const KIND={'application/pdf':'pdf','application/acad':'dwg','application/dxf':'dxf','image/jpeg':'image','image/png':'image','image/webp':'image'};
const IMAGE_NAME=/^plan-\d-\d{1,3}\.jpg$/;
const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const CAD=new Set(['application/acad','application/dxf']);
const SKIP_REASONS={unreadable_image:'Bild nicht lesbar',too_large:'Bild zu groß',no_vectors:'enthält keine Vektorlinien',no_scale:'Maßstab nicht bestimmbar',no_walls:'keine Wände erkannt',too_complex:'zu umfangreich',
 dwg_conversion_failed:'DWG konnte nicht umgewandelt werden',dxf_unreadable:'DXF nicht lesbar',unreadable:'nicht lesbar',detection_failed:'Erkennung fehlgeschlagen'};
const config=()=>({root:process.env.PLAN_WORK_DIR||'/tmp/d21-plans',python:process.env.PLAN_PYTHON||'/opt/plan-venv/bin/python',script:process.env.PLAN_EXTRACT_SCRIPT||path.join(__dirname,'..','..','plan-extract','run.py')});
async function run(runner,python,script,args,cwd){
 let stdout;
 try{({stdout}=await runner(python,['-E','-s',script,...args],{cwd,timeout:360000,killSignal:'SIGKILL',maxBuffer:256*1024,env:{PATH:'/usr/bin:/bin',HOME:cwd,PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}}));}
 catch(e){stdout=e.stdout||'';}
 const last=String(stdout).trim().split('\n').pop()||'';let out;try{out=JSON.parse(last);}catch{throw new PlanError('model_generation_failed');}
 if(out.error)throw new PlanError('model_generation_failed');return out;
}
async function readLimited(file,max){const info=await fs.stat(file);if(info.size>max)throw new PlanError('output_too_large');return fs.readFile(file);}
function skippedNotes(skipped,docs){return (skipped||[]).filter(s=>!['no_vectors','raster_page'].includes(s.reason)&&docs[s.input]).map(s=>`Plan ${docs[s.input]?.name||s.input+1}: ${SKIP_REASONS[s.reason]||'nicht auswertbar'}.`).slice(0,4);}
async function extractVector(docs,{runner=exec,...opts}={}){
 const usable=docs.filter(d=>KIND[d.mime_type]);if(!usable.length)return null;
 const {root,python,script}={...config(),...opts};
 await fs.mkdir(root,{recursive:true,mode:0o700});const dir=await fs.mkdtemp(path.join(root,'vec-'));
 try{
  const inputs=[];
  for(const [i,d] of usable.entries()){const file=path.join(dir,`plan-${i}.${EXT[d.mime_type]||KIND[d.mime_type]}`);await fs.writeFile(file,d.content,{mode:0o600});inputs.push(`${file}:${KIND[d.mime_type]}`);}
  const out=path.join(dir,'candidates.json'),labels=path.join(dir,'labels.png'),plans=path.join(dir,'plans');
  await fs.mkdir(plans,{mode:0o700});
  await run(runner,python,script,['extract','--out',out,'--labels',labels,'--plan-dir',plans,...inputs],dir);
  const candidates=JSON.parse((await readLimited(out,16*1024*1024)).toString('utf8'));
  if(!Array.isArray(candidates.levels))throw new PlanError('model_generation_failed');
  const png=candidates.levels.length?await readLimited(labels,3*1024*1024).catch(()=>null):null;
  const raster=candidates.levels.some(l=>l.source?.kind==='raster');
  // Documents that actually produced a level (a photo next to a measured PDF is not used).
  const used=[...new Set(candidates.levels.map(l=>usable[l.source?.input]?.id).filter(Boolean))];
  const notes=[...skippedNotes(candidates.skipped,usable),...(Array.isArray(candidates.notes)?candidates.notes.filter(n=>typeof n==='string').map(n=>n.slice(0,200)):[])].slice(0,6);
  // Plan photos for the editor: fixed name pattern only, JPEG magic checked, at most 4 x 2 MiB.
  const images=[];
  for(const l of candidates.levels){const name=l.raster?.image;if(typeof name!=='string'||!IMAGE_NAME.test(name)||images.some(i=>i.name===name)||images.length>=4)continue;
   const content=await readLimited(path.join(plans,name),2*1024*1024).catch(()=>null);if(content&&content.subarray(0,3).toString('hex')==='ffd8ff')images.push({name,content});else delete l.raster.image;}
  return {candidates,labels:png,images,documents:used.length?used:usable.map(d=>d.id),notes,cadOnly:docs.every(d=>CAD.has(d.mime_type)),raster};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
async function buildVector(analysis,{runner=exec,...opts}={}){
 const {root,python,script}={...config(),...opts};
 await fs.mkdir(root,{recursive:true,mode:0o700});const dir=await fs.mkdtemp(path.join(root,'ifc-'));
 try{
  const cand=path.join(dir,'candidates.json'),review=path.join(dir,'review.json'),ifc=path.join(dir,'model.ifc'),preview=path.join(dir,'preview.png'),report=path.join(dir,'report.json');
  await fs.writeFile(cand,JSON.stringify(analysis.candidates),{mode:0o600});
  const args=['build','--candidates',cand,'--ifc',ifc,'--preview',preview,'--report',report];
  if(analysis.review){await fs.writeFile(review,JSON.stringify(analysis.review),{mode:0o600});args.push('--review',review);}
  await run(runner,python,script,args,dir);
  // Large buildings (hundreds of walls, shared window geometry) stay below the app's 20 MB IFC preview limit.
  const output=await readLimited(ifc,18*1024*1024),png=await readLimited(preview,4*1024*1024),rep=JSON.parse((await readLimited(report,6*1024*1024)).toString('utf8'));
  if(!output.subarray(0,64).toString().includes('ISO-10303-21')||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new PlanError('model_generation_failed');
  const levels=rep.quality?.levels;if(!Array.isArray(levels)||!levels.length||levels.every(l=>!l.walls))throw new PlanError('model_generation_failed');
  return {ifc:output,preview:png,quality:rep.quality,levels:Array.isArray(rep.levels)?rep.levels:null,warnings:[...(rep.summary||[]),...(rep.warnings||[])].filter(s=>typeof s==='string').map(s=>s.slice(0,300)).slice(0,24)};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={extractVector,buildVector,KIND,CAD,IMAGE_NAME};
