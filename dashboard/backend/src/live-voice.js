const {cachedWeather}=require('./building-weather');
const {deviceContext}=require('./assistant-devices');
const express=require('express');
const {readFileSync}=require('node:fs');
const {accessibleBuilding}=require('./collaboration');
const {aiEnabled,aiPreference,disabledMessage}=require('./ai-preferences');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
async function initLiveVoice(db){await db.query(`CREATE TABLE IF NOT EXISTS app_live_voice_sessions(session_key TEXT PRIMARY KEY,usage_id INTEGER NOT NULL REFERENCES app_voice_usage(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,preference_revision INTEGER NOT NULL,expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '120 seconds')`);}
// Signed WebSocket URLs are short-lived and must point to ElevenLabs' conversation endpoint only.
function signedURL(value){if(typeof value!=='string'||value.length<40||value.length>4000)return false;try{const u=new URL(value);return u.protocol==='wss:'&&u.hostname==='api.elevenlabs.io'&&u.pathname==='/v1/convai/conversation'&&!u.username&&!u.password;}catch{return false;}}
function liveVoiceRouter(db,requireAccount,options={}){
 const r=express.Router(),base='/buildings/:liveBuilding/voice/live';
 const agent=options.agentID||process.env.ELEVENLABS_AGENT_ID||'';
 const enabled=options.enabled??process.env.ELEVENLABS_ENABLED==='true';
 const key=options.getKey||(()=>readFileSync(process.env.ELEVENLABS_API_KEY_FILE||'/run/d21-voice/elevenlabs-api-key','utf8').trim());
 const fetchProvider=options.fetch||global.fetch;
 r.use(base,requireAccount,wrap(async(req,res,next)=>{res.set('Cache-Control','private, no-store');if(!/^[1-9]\d*$/.test(req.params.liveBuilding)||Number(req.params.liveBuilding)>2147483647)fail('Ungültiges Gebäude.');const b=await accessibleBuilding(db,req.params.liveBuilding,req.account.id);if(!b)fail('Gebäude nicht gefunden.',404);req.liveBuilding=b;next();}));
 r.post(base,wrap(async(req,res)=>{
  const transport=req.query.transport;if(transport!==undefined&&transport!=='websocket')fail('Unbekannte Verbindungsart.');const websocket=transport==='websocket';
  if(!await aiEnabled(db,req.account.id))fail(disabledMessage,403);
  if(!enabled||!/^agent_[a-zA-Z0-9]{8,100}$/.test(agent))fail('Live-Sprachassistent ist noch nicht eingerichtet.',503);
  const requestKey=req.get('X-Request-ID')||'';if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestKey)||Object.keys(req.body||{}).length)fail('Leere Startanfrage mit gültiger Kennung erforderlich.');
  const sessionKey=requestKey.toLowerCase(),c=await db.connect();let usage,preference;
  try{
   await c.query('BEGIN');await c.query('SELECT id FROM app_ai_budget WHERE id=1 FOR UPDATE');
   preference=await aiPreference(c,req.account.id);
   if(!await aiEnabled(c,req.account.id))fail(disabledMessage,403);
   if((await c.query('SELECT 1 FROM app_voice_usage WHERE user_id=$1 AND request_key=$2',[req.account.id,sessionKey])).rows.length)fail('Gesprächsstart bereits verwendet. Bitte bewusst ein neues Gespräch starten.',409);
   const counts=(await c.query("SELECT COUNT(*) total,COUNT(*) FILTER(WHERE user_id=$1 AND kind='live') own,COUNT(*) FILTER(WHERE status='processing' AND created_at>now()-interval '2 minutes') active,COUNT(*) FILTER(WHERE user_id=$1 AND kind='live' AND status='processing' AND created_at>now()-interval '2 minutes') own_active FROM app_voice_usage WHERE created_at>now()-interval '24 hours'",[req.account.id])).rows[0];
   if(Number(counts.own)>=10||Number(counts.total)>=100)fail('Live-Gesprächskontingent für 24 Stunden erreicht.',429);
   if(Number(counts.active)>=2||Number(counts.own_active)>=1)fail('Es läuft bereits ein Gespräch. Bitte dieses zuerst beenden.',409);
   usage=(await c.query("INSERT INTO app_voice_usage(user_id,building_id,request_key,kind) VALUES($1,$2,$3,'live') RETURNING id",[req.account.id,req.liveBuilding.id,sessionKey])).rows[0].id;
   await c.query('INSERT INTO app_live_voice_sessions(session_key,usage_id,user_id,building_id,preference_revision) VALUES($1,$2,$3,$4,$5)',[sessionKey,usage,req.account.id,req.liveBuilding.id,preference.revision]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  try{
   if(!await aiEnabled(db,req.account.id)||!await accessibleBuilding(db,req.liveBuilding.id,req.account.id))fail(disabledMessage,403);
   const response=await fetchProvider(websocket?'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id='+encodeURIComponent(agent):'https://api.elevenlabs.io/v1/convai/conversation/token?agent_id='+encodeURIComponent(agent),{headers:{'xi-api-key':key()},signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!response.ok)fail(response.status===429?'ElevenLabs-Limit erreicht.':'Live-Verbindung konnte nicht vorbereitet werden.',response.status===429?429:502);
   const data=await response.json();
   if(websocket){if(!signedURL(data.signed_url))fail('Ungültige Gesprächsberechtigung.',502);}
   else if(typeof data.token!=='string'||data.token.length<20||data.token.length>20000)fail('Ungültige Gesprächsberechtigung.',502);
   const current=await aiPreference(db,req.account.id);
   if(!await aiEnabled(db,req.account.id)||current.revision!==preference.revision||!await accessibleBuilding(db,req.liveBuilding.id,req.account.id))fail('Freigabe oder Gebäudezugang wurde geändert.',403);
   const devices=(await db.query("SELECT name,kind,is_on FROM app_devices WHERE building_id=$1 AND mode='simulation' AND kind IN ('light','plug') ORDER BY id LIMIT 50",[req.liveBuilding.id])).rows;
   const documents=(await db.query('SELECT name,mime_type FROM app_documents WHERE building_id=$1 ORDER BY id DESC LIMIT 10',[req.liveBuilding.id])).rows;
   res.json({...(websocket?{signed_url:data.signed_url,transport:'websocket'}:{token:data.token}),session_id:sessionKey,max_seconds:120,dynamic_variables:{building_context:JSON.stringify({building_name:req.liveBuilding.name,weather:await cachedWeather(db,req.liveBuilding.id),authorized_lights:await deviceContext(db,req.account.id,req.liveBuilding.id,options.homeAssistant||{}),latest_documents:documents,limitations:'Nur freigegebene Lampen dieses Kontos und Gebäudes dürfen mit control_lights gesteuert werden. Wetterwerte sind regionale Modellwerte/Prognosen mit Abrufzeit, keine Gebäudemessungen; Quelle und Alter beachten. Keine Dateiinhalte oder Geometrie. Listen sind begrenzte Ausschnitte.'})}});
  }catch(e){await db.query("UPDATE app_voice_usage SET status='failed' WHERE id=$1",[usage]);if(e.status)throw e;fail('Live-Verbindung nicht erreichbar.',503);}
 }));
 r.get(base+'/:session',wrap(async(req,res)=>{
  const session=(await db.query('SELECT s.*,u.status FROM app_live_voice_sessions s JOIN app_voice_usage u ON u.id=s.usage_id WHERE s.session_key=$1 AND s.user_id=$2 AND s.building_id=$3',[req.params.session,req.account.id,req.liveBuilding.id])).rows[0];
  if(!session)fail('Gespräch nicht gefunden.',404);const pref=await aiPreference(db,req.account.id);
  const active=session.status==='processing'&&Date.parse(session.expires_at)>Date.now()&&await aiEnabled(db,req.account.id)&&pref.revision===session.preference_revision;
  if(!active)await db.query("UPDATE app_voice_usage SET status='ended' WHERE id=$1 AND status='processing'",[session.usage_id]);res.json({active});
 }));
 r.delete(base+'/:session',wrap(async(req,res)=>{await db.query("UPDATE app_voice_usage SET status='ended' WHERE id IN (SELECT usage_id FROM app_live_voice_sessions WHERE session_key=$1 AND user_id=$2 AND building_id=$3)",[req.params.session,req.account.id,req.liveBuilding.id]);res.json({ok:true});}));
 r.use((e,req,res,next)=>e.status?res.status(e.status).json({error:e.message}):next(e));return r;
}
module.exports={initLiveVoice,liveVoiceRouter,signedURL};
