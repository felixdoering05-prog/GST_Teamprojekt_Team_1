const express=require('express');
const {readFile}=require('node:fs/promises');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const adminIDs=()=>new Set((process.env.D21_ADMIN_USER_IDS||'').split(',').filter(v=>/^[1-9]\d*$/.test(v)).map(Number));
async function initAdmin(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_api_usage_hourly(hour TIMESTAMPTZ NOT NULL,category TEXT NOT NULL,method TEXT NOT NULL,status_class INTEGER NOT NULL,count BIGINT NOT NULL DEFAULT 0,duration_ms DOUBLE PRECISION NOT NULL DEFAULT 0,PRIMARY KEY(hour,category,method,status_class))`);
}
function usageMiddleware(db){
 let warned=0;
 return (req,res,next)=>{
  if(!req.path.startsWith('/api/')||req.path==='/api/health'||req.path.startsWith('/api/v1/admin/'))return next();
  const started=process.hrtime.bigint();
  const section=req.path.split('/')[3];
  const category=['auth','buildings','documents','contacts','notifications','profile','twin','twin-functions'].includes(section)?section:'other';
  const method=['GET','POST','PATCH','PUT','DELETE','OPTIONS','HEAD'].includes(req.method)?req.method:'OTHER';
  res.once('finish',()=>{
   const duration=Number(process.hrtime.bigint()-started)/1e6;
   db.query(`INSERT INTO app_api_usage_hourly(hour,category,method,status_class,count,duration_ms) VALUES(date_trunc('hour',now()),$1,$2,$3,1,$4) ON CONFLICT(hour,category,method,status_class) DO UPDATE SET count=app_api_usage_hourly.count+1,duration_ms=app_api_usage_hourly.duration_ms+EXCLUDED.duration_ms`,[category,method,Math.floor(res.statusCode/100),duration]).catch(()=>{if(Date.now()-warned>60000){warned=Date.now();console.error('API usage metrics temporarily unavailable');}});
  });next();
 };
}
function adminRouter(db,requireAccount,options={}){
 const r=express.Router();r.use(requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 const allowed=req=>(options.adminIDs||adminIDs()).has(Number(req.account.id));
 r.get('/me',(req,res)=>res.json({admin:allowed(req)}));
 r.use((req,res,next)=>allowed(req)?next():res.status(403).json({error:'Dieser Bereich ist nur für die Projektadministration freigegeben.'}));
 r.get('/overview',wrap(async(req,res)=>{
  const [counts,ai,usage,series,first,database]=await Promise.all([
   db.query(`SELECT (SELECT COUNT(*) FROM app_users) AS users,(SELECT COUNT(*) FROM app_buildings) AS buildings,(SELECT COUNT(*) FROM app_documents) AS files,(SELECT COALESCE(SUM(size),0) FROM app_documents) AS file_bytes,(SELECT COUNT(*) FROM app_sessions WHERE expires_at>now()) AS sessions`),
   db.query(`SELECT COUNT(*) AS requests,COUNT(*) FILTER(WHERE status='done') AS successful,COUNT(*) FILTER(WHERE status='failed') AS failed,COUNT(*) FILTER(WHERE status='processing') AS processing,COUNT(*) FILTER(WHERE error_code=429) AS limited,MIN(created_at) AS oldest_in_window FROM app_ai_requests WHERE created_at>now()-interval '24 hours'`),
   db.query(`SELECT COALESCE(SUM(count),0) AS requests,COALESCE(SUM(count) FILTER(WHERE status_class>=4),0) AS errors,COALESCE(SUM(duration_ms)/NULLIF(SUM(count),0),0) AS average_ms FROM app_api_usage_hourly WHERE hour>=date_trunc('hour',now()-interval '24 hours')`),
   db.query(`SELECT hour,SUM(count) AS requests,COALESCE(SUM(count) FILTER(WHERE status_class>=4),0) AS errors FROM app_api_usage_hourly WHERE hour>=date_trunc('hour',now()-interval '24 hours') GROUP BY hour ORDER BY hour`),
   db.query('SELECT MIN(hour) AS since FROM app_api_usage_hourly'),
   db.query('SELECT pg_database_size(current_database()) AS bytes').catch(()=>({rows:[{bytes:null}]}))
  ]);
  let host=null,host_error=null;
  try{const raw=await (options.readSnapshot||(()=>readFile(process.env.D21_ADMIN_SNAPSHOT_FILE||'/run/d21-admin/status.json','utf8')))();if(raw.length>200000)throw Error();host=JSON.parse(raw);if(host.version!==1||!Number.isFinite(Date.parse(host.collected_at)))throw Error();}
  catch{host=null;host_error='Server-Messdaten sind noch nicht verfügbar.';}
  let key_configured=false;try{const key=await readFile(process.env.GEMINI_API_KEY_FILE||'/run/d21-ai/gemini-api-key','utf8');key_configured=key.trim().length>=20;}catch{}
  res.json({generated_at:new Date().toISOString(),counts:{...counts.rows[0],database_bytes:database.rows[0]?.bytes},ai:{...ai.rows[0],provider:'Google Gemini',model:process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',enabled:process.env.GEMINI_ENABLED==='true',key_configured,limits:{account_24h:20,project_24h:100,account_minute:3,concurrent:2},provider_limits:'Zusätzliche Anbieter-Limits werden nicht automatisch vom Anbieter abgefragt. Beobachtet bei h_da: 2 Anfragen / 10 Sekunden; h_da ist hier nicht als aktiv bestätigt.',note:'Rollierende 24 Stunden. Angenommene fehlgeschlagene Anfragen zählen mit; Wiederholungen aus dem Antwortcache nicht. Die älteste Anfrage fällt schrittweise aus dem Fenster, kein gemeinsamer Reset.'},http:{...usage.rows[0],since:first.rows[0]?.since,series:series.rows,note:'Stündliche Zähler seit Einrichtung, laufende Stunde enthalten. Ohne Gesundheitsprüfung und Verwaltungsabfragen. Keine Anfrageinhalte oder URLs gespeichert.'},host,host_error,host_stale:host?Date.now()-Date.parse(host.collected_at)>120000:true});
 }));
 r.get('/users',wrap(async(req,res)=>{
  const limit=Number(req.query.limit||50),offset=Number(req.query.offset||0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000)return res.status(400).json({error:'Ungültige Seitenauswahl.'});
  const [total,users]=await Promise.all([
   db.query('SELECT COUNT(*) AS count FROM app_users'),
   db.query(`SELECT u.id,u.name,u.email,u.created_at,(SELECT COUNT(*) FROM app_sessions s WHERE s.user_id=u.id AND s.expires_at>now()) AS active_sessions,(SELECT COUNT(*) FROM app_buildings b WHERE b.user_id=u.id) AS buildings,(SELECT COALESCE(SUM(d.size),0) FROM app_documents d JOIN app_buildings b ON b.id=d.building_id WHERE b.user_id=u.id) AS file_bytes,(SELECT COUNT(*) FROM app_ai_requests a WHERE a.user_id=u.id AND a.created_at>now()-interval '24 hours') AS ai_requests FROM app_users u ORDER BY u.id LIMIT $1 OFFSET $2`,[limit,offset])
  ]);
  res.json({total:Number(total.rows[0].count),limit,offset,users:users.rows.map(u=>({...u,admin:(options.adminIDs||adminIDs()).has(u.id)}))});
 }));
 return r;
}
module.exports={initAdmin,adminRouter,usageMiddleware};
