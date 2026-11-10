const express=require('express');
const POLICY_VERSION=1;
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
async function initAIPreferences(db){await db.query(`CREATE TABLE IF NOT EXISTS app_ai_preferences(user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,enabled BOOLEAN NOT NULL DEFAULT false,policy_version INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);await db.query('ALTER TABLE app_ai_preferences ADD COLUMN IF NOT EXISTS device_control_enabled BOOLEAN NOT NULL DEFAULT false');}
async function aiPreference(db,user){return (await db.query('SELECT enabled,policy_version,revision,updated_at,device_control_enabled FROM app_ai_preferences WHERE user_id=$1',[user])).rows[0]||{enabled:false,policy_version:0,revision:0,updated_at:null,device_control_enabled:false};}
async function aiEnabled(db,user){const value=await aiPreference(db,user);return value.enabled&&value.policy_version===POLICY_VERSION;}
const disabledMessage='KI und Sprache bitte einmal unter Profil → KI-Einstellungen für dein Konto aktivieren.';
function aiPreferencesRouter(db,requireAccount){
 const r=express.Router();r.use('/profile/ai',requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 r.get('/profile/ai',wrap(async(req,res)=>res.json({...await aiPreference(db,req.account.id),current_policy_version:POLICY_VERSION})));
 r.patch('/profile/ai',wrap(async(req,res)=>{
  const b=req.body||{};if(Object.keys(b).some(k=>!['enabled','revision','policy_version','device_control_enabled'].includes(k))||typeof b.enabled!=='boolean'||b.device_control_enabled!==undefined&&typeof b.device_control_enabled!=='boolean'||!Number.isInteger(b.revision)||b.revision<0||b.enabled&&b.policy_version!==POLICY_VERSION)return res.status(400).json({error:'Bitte die aktuelle KI-Einstellung prüfen.'});
  const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id]);
   const old=await aiPreference(c,req.account.id);if(old.revision!==b.revision){await c.query('ROLLBACK');return res.status(409).json({error:'Die Einstellung wurde auf einem anderen Gerät geändert. Bitte neu laden.'});}
   const result=(await c.query(`INSERT INTO app_ai_preferences(user_id,enabled,policy_version,device_control_enabled,revision) VALUES($1,$2,$3,$4,1) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,policy_version=EXCLUDED.policy_version,device_control_enabled=EXCLUDED.device_control_enabled,revision=app_ai_preferences.revision+1,updated_at=now() RETURNING enabled,policy_version,revision,updated_at,device_control_enabled`,[req.account.id,b.enabled,POLICY_VERSION,b.enabled&&b.device_control_enabled===true])).rows[0];
   if(!b.enabled)await c.query("UPDATE app_plan_jobs SET status='cancelled',failure_code='consent_changed',output_ifc=NULL,preview_png=NULL,lease_until=NULL,updated_at=now() WHERE user_id=$1 AND status IN ('queued','running','ready')",[req.account.id]);
   if(!b.enabled)await c.query("UPDATE app_voice_usage SET status='revoked' WHERE user_id=$1 AND kind='live' AND status='processing'",[req.account.id]);
   await c.query('COMMIT');res.json({...result,current_policy_version:POLICY_VERSION});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));return r;
}
async function deviceControlEnabled(db,user){return await aiEnabled(db,user)&&(await aiPreference(db,user)).device_control_enabled===true;}
module.exports={deviceControlEnabled,initAIPreferences,aiPreferencesRouter,aiEnabled,aiPreference,POLICY_VERSION,disabledMessage};
