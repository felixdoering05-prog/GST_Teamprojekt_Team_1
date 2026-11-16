// Deterministic measurement of vector plans (DXF, DWG, vector PDF) by the Python extractor in plan-extract/.
// The extractor runs locally without network access; only file paths and fixed arguments are passed.
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {promisify}=require('node:util');
const {PlanError}=require('./model');
const exec=promisify(execFile);
const KIND={'application/pdf':'pdf','application/acad':'dwg','application/dxf':'dxf'};
const CAD=new Set(['application/acad','application/dxf']);
const SKIP_REASONS={no_vectors:'enthält keine Vektorlinien',no_scale:'Maßstab nicht bestimmbar',no_walls:'keine Wände erkannt',too_complex:'zu umfangreich',
 dwg_conversion_failed:'DWG konnte nicht umgewandelt werden',dxf_unreadable:'DXF nicht lesbar',unreadable:'nicht lesbar',detection_failed:'Erkennung fehlgeschlagen'};
const config=()=>({root:process.env.PLAN_WORK_DIR||'/tmp/d21-plans',python:process.env.PLAN_PYTHON||'/opt/plan-venv/bin/python',script:process.env.PLAN_EXTRACT_SCRIPT||path.join(__dirname,'..','..','plan-extract','run.py')});
async function run(runner,python,script,args,cwd){
 let stdout;
 try{({stdout}=await runner(python,['-E','-s',script,...args],{cwd,timeout:180000,killSignal:'SIGKILL',maxBuffer:256*1024,env:{PATH:'/usr/bin:/bin',HOME:cwd,PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}}));}
 catch(e){stdout=e.stdout||'';}
 const last=String(stdout).trim().split('\n').pop()||'';let out;try{out=JSON.parse(last);}catch{throw new PlanError('model_generation_failed');}
 if(out.error)throw new PlanError('model_generation_failed');return out;
}
async function readLimited(file,max){const info=await fs.stat(file);if(info.size>max)throw new PlanError('output_too_large');return fs.readFile(file);}
function skippedNotes(skipped,docs){return (skipped||[]).filter(s=>!['no_vectors','raster_page'].includes(s.reason)).map(s=>`Plan ${docs[s.input]?.name||s.input+1}: ${SKIP_REASONS[s.reason]||'nicht auswertbar'}.`).slice(0,4);}
async function extractVector(docs,{runner=exec,...opts}={}){
 const usable=docs.filter(d=>KIND[d.mime_type]);if(!usable.length)return null;
 const {root,python,script}={...config(),...opts};
 await fs.mkdir(root,{recursive:true,mode:0o700});const dir=await fs.mkdtemp(path.join(root,'vec-'));
 try{
  const inputs=[];
  for(const [i,d] of usable.entries()){const file=path.join(dir,`plan-${i}.${KIND[d.mime_type]}`);await fs.writeFile(file,d.content,{mode:0o600});inputs.push(`${file}:${KIND[d.mime_type]}`);}
  const out=path.join(dir,'candidates.json'),labels=path.join(dir,'labels.png');
  await run(runner,python,script,['extract','--out',out,'--labels',labels,...inputs],dir);
  const candidates=JSON.parse((await readLimited(out,4*1024*1024)).toString('utf8'));
  if(!Array.isArray(candidates.levels))throw new PlanError('model_generation_failed');
  const png=candidates.levels.length?await readLimited(labels,3*1024*1024).catch(()=>null):null;
  return {candidates,labels:png,documents:usable.map(d=>d.id),notes:skippedNotes(candidates.skipped,usable),cadOnly:docs.every(d=>CAD.has(d.mime_type))};
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
  const output=await readLimited(ifc,4*1024*1024),png=await readLimited(preview,2*1024*1024),rep=JSON.parse((await readLimited(report,1024*1024)).toString('utf8'));
  if(!output.subarray(0,64).toString().includes('ISO-10303-21')||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new PlanError('model_generation_failed');
  const levels=rep.quality?.levels;if(!Array.isArray(levels)||!levels.length||levels.every(l=>!l.walls))throw new PlanError('model_generation_failed');
  return {ifc:output,preview:png,quality:rep.quality,warnings:[...(rep.summary||[]),...(rep.warnings||[])].filter(s=>typeof s==='string').map(s=>s.slice(0,300)).slice(0,24)};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={extractVector,buildVector,KIND,CAD};
