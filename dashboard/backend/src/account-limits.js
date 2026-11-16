// Per-account limits that only project admins can change (see admin.js).
// Concurrency guards ("service busy"), login protection and per-file size limits are not part of this.
const {unlimitedConversations}=require('./conversation-limits');

const CATALOG=[
 {key:'assistant_day',label:'KI-Fragen pro 24 Stunden',default:20,group:'conversation'},
 {key:'assistant_minute',label:'KI-Fragen pro Minute',default:3,group:'conversation'},
 {key:'voice_day',label:'Sprachaufträge pro Art und 24 Stunden',default:20,group:'conversation'},
 {key:'live_day',label:'Live-Gespräche pro 24 Stunden',default:10,group:'conversation'},
 {key:'plan_day',label:'Planaufträge pro 24 Stunden',default:3,group:'plan'},
 {key:'plan_open',label:'Offene Planentwürfe',default:3,group:'plan'},
 {key:'scan_day',label:'Raumscans pro 24 Stunden',default:20},
 {key:'scan_open',label:'Offene Raumscans',default:3},
 {key:'storage_mb',label:'Speicher für eigene Gebäude (MB)',default:250},
 {key:'issues_building',label:'Mängel pro eigenem Gebäude',default:300},
 {key:'map_hour',label:'Kartenladungen pro Stunde',default:10},
 {key:'weather_hour',label:'Wetterabrufe pro Stunde',default:6},
 {key:'light_minute',label:'Lichtaufträge pro Minute',default:20},
 {key:'ha_links',label:'Home-Assistant-Verbindungen (eigene Gebäude)',default:2},
 {key:'ha_entities',label:'Home-Assistant-Sensoren pro Gebäude',default:50},
 {key:'ha_values_hour',label:'Home-Assistant-Messwerte pro Stunde',default:3000},
 {key:'ha_history_day',label:'Home-Assistant-Verlaufsimporte pro 24 Stunden',default:5},
 {key:'message_minute',label:'Chatnachrichten pro Minute und Gebäude',default:20},
 {key:'contact_hour',label:'Kontaktanfragen pro Stunde',default:20}
];
const KEYS=new Set(CATALOG.map(x=>x.key));
const MAX_VALUE=1000000;

async function initAccountLimits(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_user_limits(
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  unlimited BOOLEAN NOT NULL DEFAULT false,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

function planEnvExempt(userID){
 return (process.env.PLAN_DAILY_QUOTA_EXEMPT_USER_IDS||'').split(',').map(v=>v.trim()).some(v=>/^[1-9]\d{0,9}$/.test(v)&&Number(v)<=2147483647&&Number(v)===Number(userID));
}

function resolve(row,userID){
 const unlimited=!!row?.unlimited,overrides=row?.overrides&&typeof row.overrides==='object'?row.overrides:{};
 const envConversation=unlimitedConversations(userID),envPlan=planEnvExempt(userID);
 const values={};
 for(const item of CATALOG){
  let value=item.default;
  if(Object.prototype.hasOwnProperty.call(overrides,item.key)){const v=overrides[item.key];value=v===null?null:Number.isInteger(v)&&v>=0&&v<=MAX_VALUE?v:item.default;}
  if(unlimited||item.group==='conversation'&&envConversation||item.key==='plan_day'&&envPlan)value=null;
  values[item.key]=value;
 }
 return {unlimited,values,
  // Project-wide budgets (all accounts together) are skipped only for fully unlimited accounts
  // and, as before, for the conversation exemption from the environment.
  projectExempt:group=>unlimited||group==='conversation'&&envConversation};
}

async function accountLimits(db,userID){
 const row=(await db.query('SELECT unlimited,overrides FROM app_user_limits WHERE user_id=$1',[userID])).rows[0];
 return resolve(row,userID);
}
// true when count already reached the account's limit for key (null = unlimited).
function reached(limits,key,count){const v=limits.values[key];return v!==null&&Number(count)>=v;}

function validate(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return 'Ungültige Limits.';
 if(Object.keys(body).some(k=>!['unlimited','limits','revision'].includes(k)))return 'Unbekannte Felder.';
 if(typeof body.unlimited!=='boolean')return 'Bitte „unbegrenzt“ angeben.';
 const l=body.limits??{};
 if(!l||typeof l!=='object'||Array.isArray(l))return 'Ungültige Limits.';
 for(const [k,v] of Object.entries(l)){if(!KEYS.has(k))return `Unbekanntes Limit: ${k}`;if(v!==null&&!(Number.isInteger(v)&&v>=0&&v<=MAX_VALUE))return `Ungültiger Wert für ${k}.`;}
 if(body.revision!==undefined&&!(Number.isInteger(body.revision)&&body.revision>=0))return 'Ungültige Revision.';
 return null;
}

async function describe(db,userID){
 const row=(await db.query('SELECT unlimited,overrides,revision,updated_at FROM app_user_limits WHERE user_id=$1',[userID])).rows[0];
 const r=resolve(row,userID),overrides=row?.overrides||{};
 return {user_id:Number(userID),unlimited:r.unlimited,revision:row?Number(row.revision):0,updated_at:row?.updated_at||null,
  limits:CATALOG.map(x=>{const overridden=Object.prototype.hasOwnProperty.call(overrides,x.key);
   return {key:x.key,label:x.label,default:x.default,overridden,override:overridden?overrides[x.key]:null,effective:r.values[x.key]};})};
}

async function saveLimits(db,userID,body,adminID){
 const limits=body.limits??{};
 const c=await db.connect();
 try{
  await c.query('BEGIN');
  if(!(await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[userID])).rows.length){await c.query('ROLLBACK');return {status:404};}
  const current=(await c.query('SELECT revision FROM app_user_limits WHERE user_id=$1',[userID])).rows[0];
  if(body.revision!==undefined&&body.revision!==(current?Number(current.revision):0)){await c.query('ROLLBACK');return {status:409};}
  await c.query(`INSERT INTO app_user_limits(user_id,unlimited,overrides,updated_by) VALUES($1,$2,$3,$4)
   ON CONFLICT(user_id) DO UPDATE SET unlimited=EXCLUDED.unlimited,overrides=EXCLUDED.overrides,updated_by=EXCLUDED.updated_by,updated_at=now(),revision=app_user_limits.revision+1`,[userID,body.unlimited,JSON.stringify(limits),adminID]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 return {status:200,body:await describe(db,userID)};
}

module.exports={CATALOG,initAccountLimits,accountLimits,reached,validate,describe,saveLimits};
