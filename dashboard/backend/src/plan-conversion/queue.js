const {randomUUID,createHash}=require('node:crypto');
const {aiEnabled}=require('../ai-preferences');
const MIME=['image/jpeg','image/png','image/webp','application/pdf'];
const POLICY_VERSION=1,MAX_BYTES=10*1024*1024;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function initPlanConversion(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_plan_settings(building_id INTEGER PRIMARY KEY REFERENCES app_buildings(id) ON DELETE CASCADE,enabled BOOLEAN NOT NULL DEFAULT false,revision INTEGER NOT NULL DEFAULT 1,policy_version INTEGER NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_plan_jobs(id TEXT PRIMARY KEY,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,request_key TEXT NOT NULL,document_ids INTEGER[] NOT NULL,source_hashes JSONB NOT NULL,settings_revision INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','running','ready','approved','rejected','failed','cancelled','needs_input')),phase TEXT NOT NULL DEFAULT 'analysis',attempts INTEGER NOT NULL DEFAULT 0,not_before TIMESTAMPTZ NOT NULL DEFAULT now(),lease_until TIMESTAMPTZ,analysis JSONB,output_ifc BYTEA,preview_png BYTEA,output_document_id INTEGER REFERENCES app_documents(id) ON DELETE SET NULL,warnings JSONB NOT NULL DEFAULT '[]',failure_code TEXT,provider_model TEXT,usage JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(user_id,request_key))`);
 await db.query('CREATE INDEX IF NOT EXISTS app_plan_job_poll_idx ON app_plan_jobs(status,not_before,lease_until)');
 await db.query('CREATE INDEX IF NOT EXISTS app_plan_job_owner_idx ON app_plan_jobs(user_id,building_id,created_at)');
}
async function setting(db,building){return (await db.query('SELECT enabled,revision,policy_version FROM app_plan_settings WHERE building_id=$1',[building])).rows[0]||{enabled:false,revision:0,policy_version:POLICY_VERSION};}
async function permitted(db,job){const b=(await db.query('SELECT user_id FROM app_buildings WHERE id=$1',[job.building_id])).rows[0],s=await setting(db,job.building_id);return b?.user_id===job.user_id&&s.enabled&&s.policy_version===POLICY_VERSION&&s.revision===job.settings_revision&&await aiEnabled(db,job.user_id);}
async function sourceFiles(db,building,ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!Number.isInteger(id)||id<1||id>2147483647))fail('Bitte ein bis vier Plan-Dateien wählen.');
 const docs=(await db.query('SELECT id,mime_type,size,content FROM app_documents WHERE building_id=$1 AND id=ANY($2::int[]) ORDER BY id',[building,ids])).rows;
 if(docs.length!==ids.length)fail('Plan nicht gefunden.',404);
 if(docs.some(d=>!MIME.includes(d.mime_type))||docs.reduce((n,d)=>n+d.size,0)>MAX_BYTES)fail('Plananalyse: JPG, PNG, WebP oder PDF, zusammen maximal 10 MB.',413);
 return docs;
}
async function quota(db,user){
 await db.query('SELECT pg_advisory_xact_lock(610211)');
 const r=(await db.query("SELECT COUNT(*) FILTER(WHERE user_id=$1) own,COUNT(*) total FROM app_plan_jobs WHERE created_at>now()-interval '24 hours'",[user])).rows[0];
 if(Number(r.own)>=3||Number(r.total)>=10)fail('Plananalyse-Limit erreicht: 3 Aufträge pro Konto / 10 im Projekt innerhalb von 24 Stunden.',429);
 if(Number((await db.query("SELECT count(*) n FROM app_plan_jobs WHERE user_id=$1 AND status IN ('queued','running','ready')",[user])).rows[0].n)>=3)fail('Bitte zuerst vorhandene Planentwürfe prüfen.',429);
}
async function enqueue(db,{building,user,documentIds,requestKey,automatic=false}){
 const previous=(await db.query('SELECT id,status,building_id,document_ids FROM app_plan_jobs WHERE user_id=$1 AND request_key=$2',[user,requestKey])).rows[0];if(previous){if(!Array.isArray(documentIds))fail('Bitte Plan-Dateien wählen.');if(previous.building_id!==building||JSON.stringify([...previous.document_ids].sort())!==JSON.stringify([...documentIds].sort()))fail('Diese Auftragskennung wurde bereits für andere Pläne verwendet.',409);return {id:previous.id,status:previous.status};}
 const s=await setting(db,building);if(!s.enabled||s.policy_version!==POLICY_VERSION||!await aiEnabled(db,user))fail('Plananalyse bitte für dieses Gebäude und KI für dein Konto aktivieren.',403);
 const owner=(await db.query('SELECT user_id FROM app_buildings WHERE id=$1',[building])).rows[0];if(owner?.user_id!==user)fail('Nur der Eigentümer kann Pläne analysieren.',404);
 let docs=await sourceFiles(db,building,documentIds),pending;
 if(automatic){pending=(await db.query("SELECT * FROM app_plan_jobs WHERE building_id=$1 AND user_id=$2 AND status='queued' AND not_before>now() AND settings_revision=$3 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[building,user,s.revision])).rows[0];if(pending&&new Set([...pending.document_ids,...documentIds]).size<=4){const ids=[...new Set([...pending.document_ids,...documentIds])];docs=await sourceFiles(db,building,ids);}else{pending=null;}}
 const hashes=Object.fromEntries(docs.map(d=>[String(d.id),hash(d.content)]));
 if(pending&&docs.length<=4){const updated=await db.query("UPDATE app_plan_jobs SET document_ids=$2,source_hashes=$3,not_before=now()+interval '20 seconds',updated_at=now() WHERE id=$1 RETURNING id,status",[pending.id,docs.map(d=>d.id),JSON.stringify(hashes)]);return updated.rows[0];}
 await quota(db,user);const id=randomUUID();return (await db.query("INSERT INTO app_plan_jobs(id,building_id,user_id,request_key,document_ids,source_hashes,settings_revision,status,not_before) VALUES($1,$2,$3,$4,$5,$6,$7,'queued',now()+($8 * interval '1 second')) RETURNING id,status",[id,building,user,requestKey,docs.map(d=>d.id),JSON.stringify(hashes),s.revision,automatic?20:0])).rows[0];
}
async function enqueueUpload(db,building,user,doc,{enabled=process.env.PLAN_CONVERSION_ENABLED==='true'}={}){
 if(!enabled||building.user_id!==user||!MIME.includes(doc.mime_type))return null;
 if(!(await setting(db,building.id)).enabled)return null;
 try{return await enqueue(db,{building:building.id,user,documentIds:[doc.id],requestKey:'upload:'+doc.id,automatic:true})}catch(e){if([403,413,429].includes(e.status))return {status:'not_queued',reason:e.message};throw e}
}
async function validateSources(db,job){const docs=await sourceFiles(db,job.building_id,job.document_ids);if(docs.some(d=>hash(d.content)!==job.source_hashes[String(d.id)]))fail('Eine Quelldatei hat sich geändert. Bitte neuen Auftrag anlegen.',409);return docs;}
const SUMMARY='id,building_id,status,phase,attempts,document_ids,warnings,failure_code,provider_model,usage,output_document_id,created_at,updated_at';
module.exports={initPlanConversion,setting,permitted,sourceFiles,validateSources,enqueue,enqueueUpload,POLICY_VERSION,MAX_BYTES,MIME,SUMMARY,fail};
