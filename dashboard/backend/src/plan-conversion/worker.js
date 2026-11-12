const {Pool}=require('pg');
const Q=require('./queue');
const {analyzePlans}=require('./provider');
const {generateIFC,prepareGeometry}=require('./model');
const FAILURE_MESSAGES={needs_input:'Grundriss oder Maßstab nicht eindeutig. Bitte gut lesbaren, bemaßten Plan hochladen.',invalid_geometry:'Die erkannte Geometrie ist nicht konsistent. Bitte Plan prüfen oder einen klareren Ausschnitt hochladen.',provider_unreachable:'Gemini momentan nicht erreichbar. Bitte später erneut versuchen.',provider_limit:'Gemini-Nutzungslimit erreicht. Bitte später erneut versuchen.',provider_rejected:'Gemini hat die Anfrage abgelehnt. Serverkonfiguration prüfen lassen.',provider_response_invalid:'Keine vollständige Geometrie von Gemini erhalten.',provider_config:'Plananalyse auf dem Server noch nicht richtig konfiguriert.',model_generation_failed:'IFC-Erzeugung konnte nicht zuverlässig abgeschlossen werden.',output_too_large:'Der Entwurf überschreitet die erlaubte Größe.',worker_interrupted:'Verarbeitung unterbrochen. Bitte neuen Auftrag starten.',consent_changed:'Plananalyse inzwischen deaktiviert oder Einstellung geändert.',source_changed:'Quelldateien wurden verändert oder entfernt.'};
async function processNext(c,{analyze=analyzePlans,generate=generateIFC,enabled=process.env.PLAN_CONVERSION_ENABLED==='true'}={}){
 if(!enabled)return false;
 // One dedicated PostgreSQL connection owns the session lock until the job ends.
 const lock=(await c.query('SELECT pg_try_advisory_lock(610212) locked')).rows[0].locked;if(!lock)return false;
 let job;
 try{
  await c.query("UPDATE app_plan_jobs SET status='failed',failure_code='worker_interrupted',lease_until=NULL,updated_at=now() WHERE status='running' AND lease_until<now()");
  await c.query("UPDATE app_plan_jobs SET status=CASE WHEN status='ready' THEN 'rejected' ELSE status END,output_ifc=NULL,preview_png=NULL,analysis=NULL,updated_at=now() WHERE (output_ifc IS NOT NULL OR preview_png IS NOT NULL OR analysis IS NOT NULL) AND updated_at<now()-interval '7 days'");
  job=(await c.query("UPDATE app_plan_jobs SET status='running',attempts=attempts+1,phase=CASE WHEN phase='model_only' THEN 'model_only' ELSE 'analysis' END,lease_until=now()+interval '5 minutes',updated_at=now() WHERE id=(SELECT id FROM app_plan_jobs WHERE status='queued' AND not_before<=now() ORDER BY created_at LIMIT 1) RETURNING *")).rows[0];if(!job)return false;
  if(!await Q.permitted(c,job))throw Object.assign(Error(),{code:'consent_changed'});
  let docs;try{docs=await Q.validateSources(c,job);}catch{throw Object.assign(Error(),{code:'source_changed'});}
  const analysis=job.phase==='model_only'?{...prepareGeometry(job.analysis),model:job.provider_model,usage:null}:await analyze(docs);
  const updated=await c.query("UPDATE app_plan_jobs SET analysis=$2,provider_model=$3,usage=$4,phase='modelling',updated_at=now() WHERE id=$1 AND status='running' RETURNING id",[job.id,JSON.stringify(analysis.geometry),analysis.model,JSON.stringify(analysis.usage)]);
  if(!updated.rows.length||!await Q.permitted(c,job))throw Object.assign(Error(),{code:'consent_changed'});
  const result=await generate(analysis.geometry);
  await c.query('BEGIN');
  try{
   await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[job.user_id]);
   await c.query('SELECT id FROM app_buildings WHERE id=$1 FOR UPDATE',[job.building_id]);
   if(!await Q.permitted(c,job))throw Object.assign(Error(),{code:'consent_changed'});
   try{await Q.validateSources(c,job);}catch{throw Object.assign(Error(),{code:'source_changed'});}
   const completed=await c.query("UPDATE app_plan_jobs SET status='ready',phase='review',output_ifc=$2,preview_png=$3,warnings=$4,lease_until=NULL,updated_at=now() WHERE id=$1 AND status='running' RETURNING id",[job.id,result.ifc,result.preview,JSON.stringify([...(analysis.warnings||[]),...result.warnings])]);
   if(completed.rows.length)await c.query("INSERT INTO app_notifications(user_id,kind,title,building_id) VALUES($1,'plan_ready',$2,$3)",[job.user_id,'Dein 3D-Gebäudeentwurf ist fertig. Bitte vor der Übernahme prüfen.',job.building_id]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}
  return true;
 }catch(e){
  if(!job)throw e;
  const code=Object.hasOwn(FAILURE_MESSAGES,e.code)?e.code:'model_generation_failed';
  await c.query("UPDATE app_plan_jobs SET status=$2,failure_code=$3,warnings=$4,analysis=COALESCE($5::jsonb,analysis),provider_model=COALESCE($6,provider_model),usage=COALESCE($7::jsonb,usage),output_ifc=NULL,preview_png=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND status='running'",[job.id,code==='needs_input'?'needs_input':code==='consent_changed'?'cancelled':'failed',code,JSON.stringify([FAILURE_MESSAGES[code]]),e.geometry?JSON.stringify(e.geometry):null,e.provider_model||null,e.usage?JSON.stringify(e.usage):null]);
  console.error('plan-job',job.id,code);return true;
 }finally{await c.query('SELECT pg_advisory_unlock(610212)');}
}
async function start(){
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});let stopped=false;
 process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
 while(!stopped){let c,worked=false;try{c=await pool.connect();worked=await processNext(c);}catch{console.error('plan-worker: database or schema unavailable');}finally{c?.release();}if(!worked&&!stopped)await new Promise(r=>setTimeout(r,5000));}
 await pool.end();
}
if(require.main===module)start().catch(()=>process.exit(1));
module.exports={processNext,FAILURE_MESSAGES};
