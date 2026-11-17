// Home-Assistant-Import (Weg b): Eine Custom Integration in Home Assistant schickt ausgewählte
// Sensorwerte an den Projektserver. Auf dem Server liegt nie ein Home-Assistant-Zugang, nur der
// SHA-256-Hash eines eigenen, widerrufbaren Brückenschlüssels pro Gebäude.
const express=require('express');
const {suggestRoom}=require('./ha-rooms');
const {service}=require('./twin');
const {randomBytes,randomUUID,randomInt,createHash}=require('node:crypto');
const {accessibleBuilding}=require('./collaboration');
const {accountLimits,reached}=require('./account-limits');

const hash=v=>createHash('sha256').update(v).digest('hex');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const PAIRING_MINUTES=10,PUSH_SECONDS=50,RETENTION_DAYS=90,HISTORY_DAYS=30;
const HA_REDIRECT='kitrifftgebaeude://ha-auth';
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Nur diese Messgrößen werden übernommen. Personen, Standorte, Kameras, Anwesenheit usw. sind ausgeschlossen.
const METRICS={
 temperature:{device_class:'temperature',unit:'°C',label:'Temperatur',units:{'°C':v=>v,'°F':v=>(v-32)*5/9,'K':v=>v-273.15},range:[-60,120]},
 humidity:{device_class:'humidity',unit:'%',label:'Luftfeuchte',units:{'%':v=>v},range:[0,100]},
 co2:{device_class:'carbon_dioxide',unit:'ppm',label:'CO₂',units:{'ppm':v=>v},range:[0,20000]},
 power:{device_class:'power',unit:'W',label:'Leistung',units:{'W':v=>v,'kW':v=>v*1000},range:[-1e6,1e7]},
 energy:{device_class:'energy',unit:'kWh',label:'Energie',units:{'Wh':v=>v/1000,'kWh':v=>v,'MWh':v=>v*1000},range:[0,1e9]}
};
const BY_CLASS=Object.fromEntries(Object.entries(METRICS).map(([metric,m])=>[m.device_class,metric]));
const TELEMETRY_METRICS=new Set(['temperature','humidity','co2']);
const ENTITY_RE=/^sensor\.[a-z0-9_]{1,200}$/,LIGHT_RE=/^light\.[a-z0-9_]{1,200}$/,REF_RE=/^[A-Za-z0-9_.-]{1,64}$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function initHAImport(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_ha_links(
  id TEXT PRIMARY KEY,building_id INTEGER NOT NULL UNIQUE REFERENCES app_buildings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',pairing_hash TEXT UNIQUE,pairing_expires_at TIMESTAMPTZ,token_hash TEXT UNIQUE,
  instance_name TEXT NOT NULL DEFAULT '',ha_version TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,
  paired_at TIMESTAMPTZ,last_inventory_at TIMESTAMPTZ,last_push_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query("ALTER TABLE app_ha_links ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'bridge'");
 await db.query(`CREATE TABLE IF NOT EXISTS app_ha_areas(link_id TEXT NOT NULL REFERENCES app_ha_links(id) ON DELETE CASCADE,area_id TEXT NOT NULL,name TEXT NOT NULL,room_id TEXT,PRIMARY KEY(link_id,area_id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_ha_devices(link_id TEXT NOT NULL REFERENCES app_ha_links(id) ON DELETE CASCADE,device_id TEXT NOT NULL,name TEXT NOT NULL,manufacturer TEXT NOT NULL DEFAULT '',model TEXT NOT NULL DEFAULT '',area_id TEXT,PRIMARY KEY(link_id,device_id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_ha_entities(link_id TEXT NOT NULL REFERENCES app_ha_links(id) ON DELETE CASCADE,entity_id TEXT NOT NULL,name TEXT NOT NULL,metric TEXT NOT NULL,source_unit TEXT NOT NULL,device_id TEXT,area_id TEXT,selected BOOLEAN NOT NULL DEFAULT false,PRIMARY KEY(link_id,entity_id))`);
 // Room per device/sensor/lamp overrides the area's room (devices without area, areas spanning rooms).
 await db.query('ALTER TABLE app_ha_devices ADD COLUMN IF NOT EXISTS room_id TEXT');
 await db.query('ALTER TABLE app_ha_entities ADD COLUMN IF NOT EXISTS room_id TEXT');
 await db.query('ALTER TABLE app_ha_entities ADD COLUMN IF NOT EXISTS supports_color BOOLEAN NOT NULL DEFAULT false');
 await db.query('ALTER TABLE app_ha_entities ADD COLUMN IF NOT EXISTS light_state JSONB');
 await db.query('ALTER TABLE app_ha_entities ADD COLUMN IF NOT EXISTS light_caps JSONB');
 await db.query(`CREATE TABLE IF NOT EXISTS app_ha_samples(link_id TEXT NOT NULL REFERENCES app_ha_links(id) ON DELETE CASCADE,entity_id TEXT NOT NULL,metric TEXT NOT NULL,value DOUBLE PRECISION NOT NULL,measured_at TIMESTAMPTZ NOT NULL,PRIMARY KEY(link_id,entity_id,measured_at))`);
 await db.query('CREATE INDEX IF NOT EXISTS app_ha_samples_time ON app_ha_samples(link_id,measured_at)');
 await db.query(`CREATE TABLE IF NOT EXISTS app_ha_events(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,kind TEXT NOT NULL,count INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query('CREATE INDEX IF NOT EXISTS app_ha_events_user ON app_ha_events(user_id,kind,created_at)');
}

// Freitext aus Home Assistant: Steuerzeichen raus, gekürzt.
const clean=(v,max=100)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const onlyKeys=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
const ref=v=>v===undefined||v===null||v===''?null:typeof v==='string'&&REF_RE.test(v)?v:fail('Ungültige Geräte- oder Bereichskennung.');
const buildingParam=v=>/^[1-9]\d{0,9}$/.test(v)&&Number(v)<=2147483647;

function normalize(entity,value){
 const m=METRICS[entity.metric],convert=m?.units[entity.source_unit];
 if(!convert||typeof value!=='number'||!Number.isFinite(value))return null;
 const v=convert(value);return v>=m.range[0]&&v<=m.range[1]?Math.round(v*1000)/1000:null;
}
function parsePoints(list,max){
 if(!Array.isArray(list)||!list.length||list.length>max)fail(`Bitte 1–${max} Messwerte senden.`);
 const now=Date.now();
 return list.map(p=>{
  if(!onlyKeys(p,['entity_id','value','measured_at'])||typeof p.entity_id!=='string'||!ENTITY_RE.test(p.entity_id)||typeof p.value!=='number'||!Number.isFinite(p.value)||typeof p.measured_at!=='string'||p.measured_at.length>40)fail('Ungültiger Messwert.');
  const t=Date.parse(p.measured_at);if(!/(Z|[+-]\d\d:\d\d)$/.test(p.measured_at)||!Number.isFinite(t))fail('Zeitpunkt bitte als ISO 8601 mit Zeitzone.');
  if(t>now+5*60000||t<now-HISTORY_DAYS*86400000)fail(`Zeitpunkt liegt außerhalb der letzten ${HISTORY_DAYS} Tage.`);
  return {entity_id:p.entity_id,value:p.value,measured_at:new Date(t).toISOString()};
 });
}

// Geräteübersicht übernehmen (Brücke und App nutzen dieselbe Prüfung).
async function applyInventory(c,link,b){
  if(!onlyKeys(b,['areas','devices','entities'])||!Array.isArray(b.areas)||b.areas.length>200||!Array.isArray(b.devices)||b.devices.length>500||!Array.isArray(b.entities)||b.entities.length>500)fail('Ungültige Geräteübersicht (max. 200 Bereiche, 500 Geräte, 500 Sensoren).');
  const areas=new Map(),devices=new Map(),entities=new Map();
  for(const a of b.areas){if(!onlyKeys(a,['area_id','name'])||!ref(a.area_id)||!clean(a.name))fail('Ungültiger Bereich.');areas.set(a.area_id,clean(a.name));}
  for(const d of b.devices){if(!onlyKeys(d,['device_id','name','manufacturer','model','area_id'])||!ref(d.device_id))fail('Ungültiges Gerät.');const area=ref(d.area_id);devices.set(d.device_id,{name:clean(d.name)||d.device_id,manufacturer:clean(d.manufacturer),model:clean(d.model),area_id:area&&areas.has(area)?area:null});}
  let lights=0;
  for(const e of b.entities){
   if(e&&typeof e.entity_id==='string'&&LIGHT_RE.test(e.entity_id)){
    // Lampen: nur Name, Gerät, Bereich und ob Farbe möglich ist.
    if(!onlyKeys(e,['entity_id','name','supports_color','supports_brightness','supports_temp','min_kelvin','max_kelvin','device_id','area_id'])||['supports_color','supports_brightness','supports_temp'].some(k=>e[k]!==undefined&&typeof e[k]!=='boolean'))fail('Ungültige Lampe.');
    const kelvin=v=>v===undefined||v===null?null:Number.isInteger(v)&&v>=1000&&v<=12000?v:fail('Ungültiger Farbtemperaturbereich.');
    const minK=kelvin(e.min_kelvin),maxK=kelvin(e.max_kelvin);if(minK&&maxK&&minK>maxK)fail('Ungültiger Farbtemperaturbereich.');
    const caps={brightness:e.supports_brightness!==false,color:e.supports_color===true,temp:e.supports_temp===true,min_kelvin:e.supports_temp===true?minK||2000:null,max_kelvin:e.supports_temp===true?maxK||6500:null};
    if(++lights>100)fail('Höchstens 100 Lampen übernehmen.');
    const device=ref(e.device_id),area=ref(e.area_id);
    entities.set(e.entity_id,{name:clean(e.name)||e.entity_id,metric:'light',unit:'',supports_color:caps.color,caps,device_id:device&&devices.has(device)?device:null,area_id:area&&areas.has(area)?area:null});
    continue;
   }
   if(!onlyKeys(e,['entity_id','name','device_class','unit','device_id','area_id'])||typeof e.entity_id!=='string'||!ENTITY_RE.test(e.entity_id))fail('Nur Sensoren (sensor.*) und Lampen (light.*) sind erlaubt.');
   const metric=BY_CLASS[e.device_class];
   if(!metric)fail(`Nicht unterstützte Sensorart bei ${e.entity_id}. Erlaubt: Temperatur, Luftfeuchte, CO₂, Leistung, Energie.`);
   if(typeof e.unit!=='string'||!METRICS[metric].units[e.unit])fail(`Nicht unterstützte Einheit bei ${e.entity_id}.`);
   const device=ref(e.device_id),area=ref(e.area_id);
   entities.set(e.entity_id,{name:clean(e.name)||e.entity_id,metric,unit:e.unit,supports_color:false,caps:null,device_id:device&&devices.has(device)?device:null,area_id:area&&areas.has(area)?area:null});
  }
  // Bereiche und Geräte nur speichern, wenn ein übernommener Sensor sie braucht (Datensparsamkeit).
  const usedDevices=new Set([...entities.values()].map(e=>e.device_id).filter(Boolean));
  const usedAreas=new Set([...entities.values()].map(e=>e.area_id).concat([...devices].filter(([id])=>usedDevices.has(id)).map(([,d])=>d.area_id)).filter(Boolean));
  await c.query('DELETE FROM app_ha_areas WHERE link_id=$1 AND NOT (area_id = ANY($2::text[]))',[link.id,[...usedAreas]]);
  for(const id of usedAreas)await c.query('INSERT INTO app_ha_areas(link_id,area_id,name) VALUES($1,$2,$3) ON CONFLICT(link_id,area_id) DO UPDATE SET name=EXCLUDED.name',[link.id,id,areas.get(id)]);
  await c.query('DELETE FROM app_ha_devices WHERE link_id=$1 AND NOT (device_id = ANY($2::text[]))',[link.id,[...usedDevices]]);
  for(const id of usedDevices){const d=devices.get(id);await c.query('INSERT INTO app_ha_devices(link_id,device_id,name,manufacturer,model,area_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(link_id,device_id) DO UPDATE SET name=EXCLUDED.name,manufacturer=EXCLUDED.manufacturer,model=EXCLUDED.model,area_id=EXCLUDED.area_id',[link.id,id,d.name,d.manufacturer,d.model,d.area_id]);}
  await c.query('DELETE FROM app_ha_entities WHERE link_id=$1 AND NOT (entity_id = ANY($2::text[]))',[link.id,[...entities.keys()]]);
  for(const [id,e] of entities)await c.query(`INSERT INTO app_ha_entities(link_id,entity_id,name,metric,source_unit,device_id,area_id,supports_color,light_caps) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT(link_id,entity_id) DO UPDATE SET name=EXCLUDED.name,metric=EXCLUDED.metric,source_unit=EXCLUDED.source_unit,device_id=EXCLUDED.device_id,area_id=EXCLUDED.area_id,supports_color=EXCLUDED.supports_color,light_caps=EXCLUDED.light_caps,selected=app_ha_entities.selected AND app_ha_entities.metric=EXCLUDED.metric`,[link.id,id,e.name,e.metric,e.unit,e.device_id,e.area_id,e.supports_color,e.caps?JSON.stringify(e.caps):null]);
  await c.query('UPDATE app_ha_links SET last_inventory_at=now() WHERE id=$1',[link.id]);
}

// Lampenzustand, wie ihn das iPhone in Home Assistant gelesen hat.
function parseLights(list){
 if(!Array.isArray(list)||list.length>100)fail('Höchstens 100 Lampenzustände senden.');
 return list.map(l=>{
  if(!onlyKeys(l,['entity_id','available','is_on','brightness','rgb','color_temp_kelvin'])||l.color_temp_kelvin!==undefined&&l.color_temp_kelvin!==null&&!(Number.isInteger(l.color_temp_kelvin)&&l.color_temp_kelvin>=1000&&l.color_temp_kelvin<=12000)||typeof l.entity_id!=='string'||!LIGHT_RE.test(l.entity_id)||typeof l.available!=='boolean'||!(l.is_on===null||typeof l.is_on==='boolean')
   ||l.brightness!==undefined&&l.brightness!==null&&!(Number.isInteger(l.brightness)&&l.brightness>=0&&l.brightness<=255)
   ||l.rgb!==undefined&&l.rgb!==null&&!(Array.isArray(l.rgb)&&l.rgb.length===3&&l.rgb.every(x=>Number.isInteger(x)&&x>=0&&x<=255)))fail('Ungültiger Lampenzustand.');
  return {entity_id:l.entity_id,state:{available:l.available,is_on:l.available?l.is_on:null,brightness:l.brightness??null,rgb:l.rgb??null,color_temp_kelvin:l.color_temp_kelvin??null,updated_at:new Date().toISOString()}};
 });
}
async function storeLights(c,link,lights){
 let n=0;for(const l of lights){const r=await c.query("UPDATE app_ha_entities SET light_state=$3 WHERE link_id=$1 AND entity_id=$2 AND metric='light' AND selected",[link.id,l.entity_id,JSON.stringify(l.state)]);n+=Number(r.affectedRows??r.rowCount??0);}
 return n;
}

// Brückenschlüssel prüfen und Sperren in der etablierten Reihenfolge (Konto, Gebäude, Verbindung) setzen.
async function bridgeLink(c,req){
 const m=/^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization')||'');if(!m)fail('Home-Assistant-Brücke nicht gekoppelt.',401);
 const token=hash(m[1]);
 const id=(await c.query("SELECT user_id,building_id FROM app_ha_links WHERE token_hash=$1 AND status='active'",[token])).rows[0];
 if(!id)fail('Home-Assistant-Brücke nicht gekoppelt.',401);
 await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[id.user_id]);await c.query('SELECT id FROM app_buildings WHERE id=$1 FOR UPDATE',[id.building_id]);
 const link=(await c.query("SELECT * FROM app_ha_links WHERE token_hash=$1 AND status='active' FOR UPDATE",[token])).rows[0];
 if(!link)fail('Home-Assistant-Brücke nicht gekoppelt.',401);return link;
}
async function selectedIDs(c,linkID){return (await c.query('SELECT entity_id FROM app_ha_entities WHERE link_id=$1 AND selected ORDER BY entity_id',[linkID])).rows.map(r=>r.entity_id);}
async function eventCount(c,user,kind,interval){return Number((await c.query(`SELECT COALESCE(SUM(count),0) n FROM app_ha_events WHERE user_id=$1 AND kind=$2 AND created_at>now()-interval '${interval}'`,[user,kind])).rows[0].n);}
async function storePoints(c,link,points){
 const entities=new Map((await c.query('SELECT entity_id,metric,source_unit FROM app_ha_entities WHERE link_id=$1 AND selected',[link.id])).rows.map(e=>[e.entity_id,e]));
 let stored=0,ignored=0;
 for(const p of points){
  const e=entities.get(p.entity_id),value=e&&normalize(e,p.value);
  if(value===null||value===undefined){ignored++;continue;}
  const r=await c.query('INSERT INTO app_ha_samples(link_id,entity_id,metric,value,measured_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[link.id,p.entity_id,e.metric,value,p.measured_at]);
  stored+=Number(r.affectedRows??r.rowCount??0);
 }
 await c.query(`DELETE FROM app_ha_samples WHERE link_id=$1 AND measured_at<now()-interval '${RETENTION_DAYS} days'`,[link.id]);
 return {stored,ignored};
}

const errors=(e,req,res,next)=>e.status?res.status(e.status).json({error:e.message}):next(e);
// Antwort erst nach COMMIT senden (sonst könnte z. B. ein Token ausgeliefert werden, das nie gespeichert wurde).
const deferred=res=>({s:200,b:undefined,status(v){this.s=v;return this;},json(v){this.b=v;return this;},set:(...a)=>res.set(...a)});
const failedPairings=new Map();
function pairingAllowed(ip){const now=Date.now(),list=(failedPairings.get(ip)||[]).filter(t=>now-t<600000);failedPairings.set(ip,list);return list.length<20;}

function bridgeRouter(db){
 const r=express.Router();
 r.use('/ha-bridge',(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 const tx=fn=>wrap(async(req,res)=>{const c=await db.connect(),reply=deferred(res);try{await c.query('BEGIN');await fn(c,req,reply);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}res.status(reply.s).json(reply.b);});
 // client_id-Seite für den offiziellen Home-Assistant-Login (IndieAuth): HA liest hier,
 // wohin es nach der Anmeldung zurückleiten darf (nur in die App).
 r.get('/ha-client',(req,res)=>{res.set('Cache-Control','public, max-age=3600').type('html').send('<!doctype html><html lang="de"><head><meta charset="utf-8"><title>KI trifft Gebäude</title><link rel="redirect_uri" href="'+HA_REDIRECT+'"></head><body><p>KI trifft Gebäude – Anmeldung mit Home Assistant. Diese Seite wird nur von Home Assistant gelesen.</p></body></html>');});
 r.post('/ha-bridge/pair',tx(async(c,req,res)=>{
  const b=req.body||{},ip=req.ip||'unknown';
  if(!pairingAllowed(ip))fail('Zu viele Kopplungsversuche. Bitte in 10 Minuten erneut versuchen.',429);
  if(!onlyKeys(b,['code','instance_name','ha_version'])||typeof b.code!=='string'||b.code.length>20)fail('Bitte den Kopplungscode aus der App eingeben.');
  const code=b.code.toUpperCase().replace(/[\s-]/g,'');
  const link=code.length===8?(await c.query("SELECT * FROM app_ha_links WHERE pairing_hash=$1 AND status='pending' AND pairing_expires_at>now() FOR UPDATE",[hash(code)])).rows[0]:null;
  if(!link){failedPairings.get(ip).push(Date.now());fail('Kopplungscode ungültig oder abgelaufen.',401);}
  const token=randomBytes(32).toString('hex');
  await c.query("UPDATE app_ha_links SET status='active',pairing_hash=NULL,pairing_expires_at=NULL,token_hash=$2,instance_name=$3,ha_version=$4,paired_at=now(),revision=revision+1 WHERE id=$1",[link.id,hash(token),clean(b.instance_name),clean(b.ha_version,40)]);
  const building=(await c.query('SELECT name FROM app_buildings WHERE id=$1',[link.building_id])).rows[0];
  res.status(201).json({token,link_id:link.id,building:building.name,interval_seconds:60});
 }));
 r.post('/ha-bridge/inventory',tx(async(c,req,res)=>{
  const link=await bridgeLink(c,req);await applyInventory(c,link,req.body||{});
  res.json({selected:await selectedIDs(c,link.id),interval_seconds:60});
 }));
 r.post('/ha-bridge/states',tx(async(c,req,res)=>{
  const link=await bridgeLink(c,req),b=req.body||{};
  if(!onlyKeys(b,['states']))fail('Ungültige Messwerte.');
  const points=parsePoints(b.states,200);
  if(link.last_push_at&&Date.now()-Date.parse(link.last_push_at)<PUSH_SECONDS*1000){res.set('Retry-After','60');fail('Maximal ein Paket pro Minute.',429);}
  const limits=await accountLimits(c,link.user_id);
  if(reached(limits,'ha_values_hour',await eventCount(c,link.user_id,'states','1 hour')+points.length-1))fail('Stundenlimit für Home-Assistant-Messwerte erreicht.',429);
  const result=await storePoints(c,link,points);
  await c.query("INSERT INTO app_ha_events(user_id,kind,count) VALUES($1,'states',$2)",[link.user_id,points.length]);
  await c.query('UPDATE app_ha_links SET last_push_at=now() WHERE id=$1',[link.id]);
  res.status(201).json({...result,selected:await selectedIDs(c,link.id)});
 }));
 r.post('/ha-bridge/history',tx(async(c,req,res)=>{
  const link=await bridgeLink(c,req),b=req.body||{};
  if(!onlyKeys(b,['points']))fail('Ungültiger Verlauf.');
  const points=parsePoints(b.points,2000);
  if(reached(await accountLimits(c,link.user_id),'ha_history_day',await eventCount(c,link.user_id,'history_request','24 hours')))fail('Tageslimit für Verlaufsimporte erreicht.',429);
  const result=await storePoints(c,link,points);
  await c.query("INSERT INTO app_ha_events(user_id,kind,count) VALUES($1,'history_request',1)",[link.user_id]);
  res.status(201).json(result);
 }));
 r.delete('/ha-bridge/link',tx(async(c,req,res)=>{const link=await bridgeLink(c,req);await c.query('DELETE FROM app_ha_links WHERE id=$1',[link.id]);res.json({ok:true});}));
 r.use(errors);return r;
}

async function overview(db,building,user){
 const owner=building.user_id===user;
 const link=(await db.query('SELECT * FROM app_ha_links WHERE building_id=$1',[building.id])).rows[0];
 const rooms=(await db.query(`SELECT id,data->>'name' AS name,data->>'room_code' AS room_code FROM app_twin_records WHERE user_id=$1 AND entity='Room' AND data->>'building_id'=$2 AND data->>'source' IS DISTINCT FROM 'demo' ORDER BY data->>'room_code',id LIMIT 500`,[building.user_id,String(building.id)])).rows.map(r=>({id:r.id,name:r.name||r.room_code||'Raum',room_code:r.room_code||''}));
 const limits=await accountLimits(db,building.user_id);
 const base={role:owner?'owner':'member',rooms,limits:{entities:limits.values.ha_entities}};
 if(!link)return {...base,link:null,areas:[],devices:[],entities:[]};
 const [areas,devices,entities]=await Promise.all([
  db.query('SELECT area_id,name,room_id FROM app_ha_areas WHERE link_id=$1 ORDER BY name,area_id',[link.id]),
  db.query('SELECT device_id,name,manufacturer,model,area_id,room_id FROM app_ha_devices WHERE link_id=$1 ORDER BY name,device_id',[link.id]),
  db.query(`SELECT e.entity_id,e.name,e.metric,e.device_id,e.area_id,e.room_id,e.selected,e.supports_color,e.light_state,e.light_caps,s.value,s.measured_at FROM app_ha_entities e
   LEFT JOIN LATERAL (SELECT value,measured_at FROM app_ha_samples WHERE link_id=e.link_id AND entity_id=e.entity_id ORDER BY measured_at DESC LIMIT 1) s ON true
   WHERE e.link_id=$1 ORDER BY e.metric,e.name,e.entity_id`,[link.id])
 ]);
 // Effective room: sensor/lamp > device > area. Suggestions only where nothing is assigned yet.
 const areaRoom=new Map(areas.rows.map(a=>[a.area_id,a.room_id])),deviceRoom=new Map(devices.rows.map(d=>[d.device_id,d.room_id||areaRoom.get(d.area_id)||null]));
 const effective=e=>e.room_id||(e.device_id&&deviceRoom.get(e.device_id))||(e.area_id&&areaRoom.get(e.area_id))||null;
 const suggestions={areas:{},devices:{},entities:{}};
 if(rooms.length){
  for(const a of areas.rows)if(!a.room_id){const r=suggestRoom(a.name,rooms);if(r)suggestions.areas[a.area_id]=r;}
  for(const d of devices.rows)if(!deviceRoom.get(d.device_id)){const r=suggestRoom(d.name,rooms);if(r)suggestions.devices[d.device_id]=r;}
  for(const e of entities.rows)if(e.selected&&!effective(e)){const r=suggestRoom(e.name,rooms);if(r)suggestions.entities[e.entity_id]=r;}
 }
 return {...base,suggestions,
  link:{id:link.id,status:link.status,mode:link.mode,instance_name:link.instance_name,ha_version:link.ha_version,revision:link.revision,paired_at:link.paired_at,last_inventory_at:link.last_inventory_at,last_push_at:link.last_push_at,pairing_expires_at:owner&&link.status==='pending'?link.pairing_expires_at:null},
  areas:areas.rows,devices:devices.rows.map(d=>({...d,room_id:d.room_id||null,effective_room_id:deviceRoom.get(d.device_id)})),
  entities:entities.rows.map(e=>({entity_id:e.entity_id,name:e.name,metric:e.metric,unit:METRICS[e.metric]?.unit||'',supports_color:e.supports_color,capabilities:e.light_caps||null,light:e.metric==='light'&&e.selected&&e.light_state?e.light_state:null,device_id:e.device_id,area_id:e.area_id,room_id:e.room_id||null,effective_room_id:effective(e),selected:e.selected,latest:e.measured_at?{value:Number(e.value),measured_at:new Date(e.measured_at).toISOString()}:null}))};
}

function haImportRouter(db,requireAccount){
 const r=express.Router(),base='/buildings/:haBuilding/home-assistant';
 r.use(base,requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');if(!buildingParam(req.params.haBuilding))return res.status(400).json({error:'Ungültiges Gebäude.'});next();});
 const read=async(req)=>{const b=await accessibleBuilding(db,req.params.haBuilding,req.account.id);if(!b)fail('Gebäude nicht gefunden.',404);return b;};
 // Schreibende Aktionen: nur der Besitzer, weil Daten und Limits auf sein Konto zählen.
 const ownerTx=fn=>wrap(async(req,res)=>{
  const c=await db.connect(),reply=deferred(res);
  try{await c.query('BEGIN');const b=await accessibleBuilding(c,req.params.haBuilding,req.account.id,true);
   if(!b)fail('Gebäude nicht gefunden.',404);if(b.user_id!==req.account.id)fail('Nur der Besitzer des Gebäudes kann Home Assistant verbinden und Daten auswählen.',403);
   const link=(await c.query('SELECT * FROM app_ha_links WHERE building_id=$1 FOR UPDATE',[b.id])).rows[0];
   await fn(c,req,reply,b,link);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  res.status(reply.s).json(reply.b);
 });
 const checkRevision=(link,body)=>{if(body.revision!==undefined&&body.revision!==link.revision)fail('Die Auswahl wurde inzwischen geändert. Bitte neu laden.',409);};
 r.get(base,wrap(async(req,res)=>{const b=await read(req);res.json(await overview(db,b,req.account.id));}));
 r.get(base+'/history',wrap(async(req,res)=>{
  const b=await read(req),entity=String(req.query.entity_id||''),hours=Number(req.query.hours||24);
  if(!ENTITY_RE.test(entity)||!Number.isInteger(hours)||hours<1||hours>HISTORY_DAYS*24)fail('Bitte Sensor und 1–720 Stunden angeben.');
  const e=(await db.query('SELECT e.metric,e.link_id FROM app_ha_entities e JOIN app_ha_links l ON l.id=e.link_id WHERE l.building_id=$1 AND e.entity_id=$2',[b.id,entity])).rows[0];
  if(!e)fail('Sensor nicht gefunden.',404);
  const rows=(await db.query(`SELECT value,measured_at FROM app_ha_samples WHERE link_id=$1 AND entity_id=$2 AND measured_at>now()-make_interval(hours=>$3) ORDER BY measured_at DESC LIMIT 1001`,[e.link_id,entity,hours])).rows;
  res.json({entity_id:entity,metric:e.metric,unit:METRICS[e.metric].unit,truncated:rows.length>1000,points:rows.slice(0,1000).reverse().map(p=>({value:Number(p.value),measured_at:new Date(p.measured_at).toISOString()}))});
 }));
 r.post(base+'/pairing',ownerTx(async(c,req,res,b,link)=>{
  if(Object.keys(req.body||{}).length)fail('Keine weiteren Angaben erwartet.');
  if(link&&link.status==='active')fail('Home Assistant ist bereits verbunden. Zum Neukoppeln zuerst trennen.',409);
  const others=Number((await c.query('SELECT COUNT(*) n FROM app_ha_links WHERE user_id=$1 AND building_id<>$2',[b.user_id,b.id])).rows[0].n);
  if(reached(await accountLimits(c,b.user_id),'ha_links',others))fail('Limit für Home-Assistant-Verbindungen erreicht.',429);
  const code=Array.from({length:8},()=>CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  const expires=new Date(Date.now()+PAIRING_MINUTES*60000).toISOString(),id=link?.id||randomUUID();
  if(link)await c.query('UPDATE app_ha_links SET pairing_hash=$2,pairing_expires_at=$3,revision=revision+1 WHERE id=$1',[id,hash(code),expires]);
  else await c.query('INSERT INTO app_ha_links(id,building_id,user_id,pairing_hash,pairing_expires_at) VALUES($1,$2,$3,$4,$5)',[id,b.id,b.user_id,hash(code),expires]);
  res.status(201).json({link_id:id,code:code.slice(0,4)+'-'+code.slice(4),expires_at:expires});
 }));
 r.put(base+'/entities',ownerTx(async(c,req,res,b,link)=>{
  const body=req.body||{};if(!link)fail('Home Assistant ist nicht verbunden.',404);
  if(!onlyKeys(body,['selected','revision'])||!Array.isArray(body.selected)||body.selected.length>500||body.selected.some(x=>typeof x!=='string'||!(ENTITY_RE.test(x)||LIGHT_RE.test(x)))||new Set(body.selected).size!==body.selected.length)fail('Bitte eine Liste von Sensor-Entitäten senden.');
  checkRevision(link,body);
  const max=(await accountLimits(c,b.user_id)).values.ha_entities;if(max!==null&&body.selected.length>max)fail(`Höchstens ${max} Sensoren pro Gebäude übernehmen.`,429);
  const known=new Set((await c.query('SELECT entity_id FROM app_ha_entities WHERE link_id=$1',[link.id])).rows.map(r=>r.entity_id));
  if(body.selected.some(x=>!known.has(x)))fail('Unbekannter Sensor. Bitte neu laden.',409);
  await c.query('UPDATE app_ha_entities SET selected=(entity_id = ANY($2::text[])) WHERE link_id=$1',[link.id,body.selected]);
  await c.query('UPDATE app_ha_links SET revision=revision+1 WHERE id=$1',[link.id]);
  res.json(await overview(c,b,req.account.id));
 }));
 r.put(base+'/areas',ownerTx(async(c,req,res,b,link)=>{
  const body=req.body||{};if(!link)fail('Home Assistant ist nicht verbunden.',404);
  if(!onlyKeys(body,['mapping','revision'])||!body.mapping||typeof body.mapping!=='object'||Array.isArray(body.mapping)||Object.keys(body.mapping).length>200)fail('Ungültige Raumzuordnung.');
  checkRevision(link,body);
  const areas=new Set((await c.query('SELECT area_id FROM app_ha_areas WHERE link_id=$1',[link.id])).rows.map(r=>r.area_id));
  const rooms=new Set((await c.query(`SELECT id FROM app_twin_records WHERE user_id=$1 AND entity='Room' AND data->>'building_id'=$2 AND data->>'source' IS DISTINCT FROM 'demo'`,[b.user_id,String(b.id)])).rows.map(r=>r.id));
  for(const [area,room] of Object.entries(body.mapping)){
   if(!areas.has(area))fail('Unbekannter Home-Assistant-Bereich.',409);
   if(room!==null&&(typeof room!=='string'||!rooms.has(room)))fail('Raum gehört nicht zu diesem Gebäude.');
   await c.query('UPDATE app_ha_areas SET room_id=$3 WHERE link_id=$1 AND area_id=$2',[link.id,area,room]);
  }
  await c.query('UPDATE app_ha_links SET revision=revision+1 WHERE id=$1',[link.id]);
  res.json(await overview(c,b,req.account.id));
 }));
 // Raum je Gerät, Sensor oder Lampe (überschreibt den Bereich). null = wieder dem Bereich folgen.
 r.put(base+'/assignments',ownerTx(async(c,req,res,b,link)=>{
  const body=req.body||{};if(!link)fail('Home Assistant ist nicht verbunden.',404);
  const map=v=>v===undefined?{}:(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=500?v:fail('Ungültige Raumzuordnung.'));
  if(!onlyKeys(body,['devices','entities','areas','revision']))fail('Ungültige Raumzuordnung.');
  const devices=map(body.devices),entities=map(body.entities),areas=map(body.areas);
  checkRevision(link,body);
  const rooms=new Set((await c.query(`SELECT id FROM app_twin_records WHERE user_id=$1 AND entity='Room' AND data->>'building_id'=$2 AND data->>'source' IS DISTINCT FROM 'demo'`,[b.user_id,String(b.id)])).rows.map(r=>r.id));
  const ok=room=>room===null||(typeof room==='string'&&rooms.has(room));
  const known=async(sql)=>new Set((await c.query(sql,[link.id])).rows.map(r=>Object.values(r)[0]));
  const kd=await known('SELECT device_id FROM app_ha_devices WHERE link_id=$1'),ke=await known('SELECT entity_id FROM app_ha_entities WHERE link_id=$1'),ka=await known('SELECT area_id FROM app_ha_areas WHERE link_id=$1');
  for(const [id,room] of Object.entries(devices)){if(!kd.has(id))fail('Unbekanntes Gerät. Bitte neu laden.',409);if(!ok(room))fail('Raum gehört nicht zu diesem Gebäude.');await c.query('UPDATE app_ha_devices SET room_id=$3 WHERE link_id=$1 AND device_id=$2',[link.id,id,room]);}
  for(const [id,room] of Object.entries(entities)){if(!ke.has(id))fail('Unbekannter Sensor. Bitte neu laden.',409);if(!ok(room))fail('Raum gehört nicht zu diesem Gebäude.');await c.query('UPDATE app_ha_entities SET room_id=$3 WHERE link_id=$1 AND entity_id=$2',[link.id,id,room]);}
  for(const [id,room] of Object.entries(areas)){if(!ka.has(id))fail('Unbekannter Home-Assistant-Bereich.',409);if(!ok(room))fail('Raum gehört nicht zu diesem Gebäude.');await c.query('UPDATE app_ha_areas SET room_id=$3 WHERE link_id=$1 AND area_id=$2',[link.id,id,room]);}
  await c.query('UPDATE app_ha_links SET revision=revision+1 WHERE id=$1',[link.id]);
  res.json(await overview(c,b,req.account.id));
 }));
 // Raum anlegen, z. B. beim Antippen im Gebäudeplan, wenn er noch nicht in der Raumliste steht. Gleicher Name = vorhandener Raum.
 r.post(base+'/rooms',ownerTx(async(c,req,res,b)=>{
  const body=req.body||{};const name=typeof body.name==='string'?body.name.replace(/[\x00-\x1f\x7f]/g,' ').trim():'';const code=typeof body.room_code==='string'?body.room_code.replace(/[\x00-\x1f\x7f]/g,' ').trim():'';
  if(!onlyKeys(body,['name','room_code'])||!name||name.length>100||code.length>60)fail('Raumname mit 1 bis 100 Zeichen angeben.');
  const existing=(await c.query(`SELECT id,data->>'name' AS name,data->>'room_code' AS room_code FROM app_twin_records WHERE user_id=$1 AND entity='Room' AND data->>'building_id'=$2 AND data->>'source' IS DISTINCT FROM 'demo' AND lower(data->>'name')=lower($3) AND COALESCE(data->>'room_code','')=$4 LIMIT 1`,[b.user_id,String(b.id),name,code])).rows[0];
  if(existing){res.json({id:existing.id,name:existing.name,room_code:existing.room_code||'',created:false});return;}
  const count=Number((await c.query(`SELECT COUNT(*) n FROM app_twin_records WHERE user_id=$1 AND entity='Room' AND data->>'building_id'=$2`,[b.user_id,String(b.id)])).rows[0].n);if(count>=500)fail('Höchstens 500 Räume pro Gebäude.',429);
  const room=await service(c,b.user_id).entities.Room.create({name,room_code:code||name.slice(0,60),building_id:String(b.id),source:'real',notes:'Aus dem Gebäudeplan für die Home-Assistant-Zuordnung angelegt'});
  res.status(201).json({id:room.id,name,room_code:code||name.slice(0,60),created:true});
 }));
 // App-Weg: Das iPhone holt die Werte im Heimnetz aus Home Assistant und lädt sie hier hoch.
 // Der Home-Assistant-Zugang bleibt im Schlüsselbund des iPhones; der Server kennt ihn nicht.
 const appLink=link=>{if(!link||link.status!=='active'||link.mode!=='app')fail('Home Assistant ist nicht über die App verbunden.',409);return link;};
 r.post(base+'/app-connect',ownerTx(async(c,req,res,b,link)=>{
  const body=req.body||{};
  if(!onlyKeys(body,['instance_name','ha_version']))fail('Ungültige Angaben.');
  if(link&&link.status==='active'&&link.mode!=='app')fail('Home Assistant ist bereits über die Integration verbunden. Zum Wechseln zuerst trennen.',409);
  if(!link){
   const others=Number((await c.query('SELECT COUNT(*) n FROM app_ha_links WHERE user_id=$1 AND building_id<>$2',[b.user_id,b.id])).rows[0].n);
   if(reached(await accountLimits(c,b.user_id),'ha_links',others))fail('Limit für Home-Assistant-Verbindungen erreicht.',429);
   await c.query("INSERT INTO app_ha_links(id,building_id,user_id,status,mode,instance_name,ha_version,paired_at) VALUES($1,$2,$3,'active','app',$4,$5,now())",[randomUUID(),b.id,b.user_id,clean(body.instance_name),clean(body.ha_version,40)]);
  }else await c.query("UPDATE app_ha_links SET status='active',mode='app',pairing_hash=NULL,pairing_expires_at=NULL,token_hash=NULL,instance_name=$2,ha_version=$3,paired_at=COALESCE(paired_at,now()),revision=revision+1 WHERE id=$1",[link.id,clean(body.instance_name),clean(body.ha_version,40)]);
  res.status(link?200:201).json(await overview(c,b,req.account.id));
 }));
 r.put(base+'/inventory',ownerTx(async(c,req,res,b,link)=>{
  await applyInventory(c,appLink(link),req.body||{});
  res.json(await overview(c,b,req.account.id));
 }));
 r.post(base+'/samples',ownerTx(async(c,req,res,b,link)=>{
  appLink(link);const body=req.body||{};
  if(!onlyKeys(body,['points','lights'])||body.points===undefined&&body.lights===undefined)fail('Ungültige Messwerte.');
  const points=body.points===undefined?[]:parsePoints(body.points,2000),lights=body.lights===undefined?[]:parseLights(body.lights);
  if(reached(await accountLimits(c,b.user_id),'ha_sync_hour',await eventCount(c,b.user_id,'app_sync','1 hour')))fail('Stundenlimit für Abgleiche erreicht. Bitte später erneut versuchen.',429);
  const result=points.length?await storePoints(c,link,points):{stored:0,ignored:0};
  result.lights=await storeLights(c,link,lights);
  await c.query("INSERT INTO app_ha_events(user_id,kind,count) VALUES($1,'app_sync',1)",[b.user_id]);
  await c.query('UPDATE app_ha_links SET last_push_at=now() WHERE id=$1',[link.id]);
  res.status(201).json({...result,selected:await selectedIDs(c,link.id)});
 }));
 // Schalten passiert auf dem iPhone direkt in Home Assistant. Vorher prüft der Server Rechte,
 // Auswahl und das Kontolimit light_minute (gleiche Tabelle wie die bisherigen Lichtaufträge).
 r.post(base+'/lights/:haLight/command',ownerTx(async(req_c,req,res,b,link)=>{
  const c=req_c;appLink(link);const body=req.body||{},key=(req.get('X-Request-ID')||'').toLowerCase(),entity=req.params.haLight;
  if(!LIGHT_RE.test(entity)||!onlyKeys(body,['on','brightness','rgb','color_temp_kelvin'])||body.rgb!==undefined&&body.color_temp_kelvin!==undefined
   ||body.color_temp_kelvin!==undefined&&!(Number.isInteger(body.color_temp_kelvin)&&body.color_temp_kelvin>=1000&&body.color_temp_kelvin<=12000)||typeof body.on!=='boolean'||!UUID_RE.test(key)
   ||body.brightness!==undefined&&!(Number.isInteger(body.brightness)&&body.brightness>=1&&body.brightness<=255)
   ||body.rgb!==undefined&&!(Array.isArray(body.rgb)&&body.rgb.length===3&&body.rgb.every(x=>Number.isInteger(x)&&x>=0&&x<=255))
   ||!body.on&&(body.brightness!==undefined||body.rgb!==undefined||body.color_temp_kelvin!==undefined))fail('Bitte einen gültigen Lichtauftrag senden.');
  const light=(await c.query("SELECT supports_color,light_caps FROM app_ha_entities WHERE link_id=$1 AND entity_id=$2 AND metric='light' AND selected",[link.id,entity])).rows[0];
  if(!light)fail('Lampe nicht übernommen.',404);
  if(body.rgb&&!light.supports_color)fail('Diese Lampe unterstützt keine Farbe.',409);
  const caps=light.light_caps||{};
  if(body.brightness!==undefined&&caps.brightness===false)fail('Diese Lampe lässt sich nicht dimmen.',409);
  if(body.color_temp_kelvin!==undefined&&(!caps.temp||body.color_temp_kelvin<caps.min_kelvin||body.color_temp_kelvin>caps.max_kelvin))fail('Diese Farbtemperatur kann die Lampe nicht.',409);
  if((await c.query('SELECT 1 FROM app_ha_commands WHERE user_id=$1 AND request_key=$2',[req.account.id,key])).rows.length)fail('Dieser Auftrag wurde bereits angenommen.',409);
  const n=(await c.query("SELECT COUNT(*) n FROM app_ha_commands WHERE user_id=$1 AND created_at>now()-interval '1 minute'",[req.account.id])).rows[0].n;
  if(reached(await accountLimits(c,req.account.id),'light_minute',n))fail('Bitte kurz warten: Lichtlimit pro Minute erreicht.',429);
  await c.query("INSERT INTO app_ha_commands(user_id,light_key,request_key,desired_on,status,finished_at) VALUES($1,$2,$3,$4,'delegated',now())",[req.account.id,entity.slice(0,200),key,body.on]);
  res.status(201).json({allowed:true});
 }));
 r.delete(base,ownerTx(async(c,req,res,b,link)=>{if(link)await c.query('DELETE FROM app_ha_links WHERE id=$1',[link.id]);res.json({ok:true,deleted:!!link});}));
 r.use(errors);return r;
}

// Für Telemetrie, Raumtemperaturen und KI-Auswertung: Temperatur, Luftfeuchte und CO₂ als Echtdaten.
async function haTelemetry(db,building,limit=500){
 const link=(await db.query("SELECT id FROM app_ha_links WHERE building_id=$1",[building.id])).rows[0];
 if(!link)return {sensors:[],measurements:[],truncated:false};
 const entities=(await db.query(`SELECT e.entity_id,e.name,e.metric,COALESCE(e.room_id,d.room_id,a.room_id,da.room_id) AS room_id FROM app_ha_entities e LEFT JOIN app_ha_devices d ON d.link_id=e.link_id AND d.device_id=e.device_id LEFT JOIN app_ha_areas a ON a.link_id=e.link_id AND a.area_id=e.area_id LEFT JOIN app_ha_areas da ON da.link_id=d.link_id AND da.area_id=d.area_id WHERE e.link_id=$1 AND e.selected AND e.metric = ANY($2::text[]) ORDER BY e.entity_id LIMIT 100`,[link.id,[...TELEMETRY_METRICS]])).rows;
 const id=e=>'ha:'+link.id.slice(0,8)+':'+e,code=e=>('HA-'+e.replace(/^sensor\./,'')).slice(0,100);
 const rows=entities.length?(await db.query('SELECT entity_id,metric,value,measured_at FROM app_ha_samples WHERE link_id=$1 AND entity_id = ANY($2::text[]) ORDER BY measured_at DESC LIMIT $3',[link.id,entities.map(e=>e.entity_id),limit+1])).rows:[];
 return {truncated:rows.length>limit,
  sensors:entities.map(e=>({id:id(e.entity_id),sensor_code:code(e.entity_id),name:e.name,metric:e.metric,unit:METRICS[e.metric].unit,status:'aktiv',room_id:e.room_id||'',source:'real'})),
  measurements:rows.slice(0,limit).map(p=>{const t=new Date(p.measured_at).toISOString();return {id:id(p.entity_id)+':'+t,sensor_id:id(p.entity_id),sensor_code:code(p.entity_id),metric:p.metric,value:Number(p.value),unit:METRICS[p.metric].unit,measured_at:t,source:'real',quality:'ok'};})};
}
async function haRoomTemperatures(db,building){
 return (await db.query(`SELECT DISTINCT ON (x.room_id) x.room_id,s.value,s.measured_at FROM app_ha_links l JOIN app_ha_entities e ON e.link_id=l.id AND e.selected AND e.metric='temperature'
  LEFT JOIN app_ha_devices d ON d.link_id=l.id AND d.device_id=e.device_id LEFT JOIN app_ha_areas a ON a.link_id=l.id AND a.area_id=e.area_id LEFT JOIN app_ha_areas da ON da.link_id=l.id AND da.area_id=d.area_id
  CROSS JOIN LATERAL (SELECT COALESCE(e.room_id,d.room_id,a.room_id,da.room_id) AS room_id) x
  JOIN app_ha_samples s ON s.link_id=l.id AND s.entity_id=e.entity_id WHERE l.building_id=$1 AND x.room_id IS NOT NULL ORDER BY x.room_id,s.measured_at DESC`,[building.id])).rows.map(r=>({room_id:r.room_id,value:Number(r.value),measured_at:new Date(r.measured_at).toISOString()}));
}


// Importierte Lampen eines Gebäudes mit wirksamem Raum (Lampe > Gerät > Bereich) für Nala und das 3D-Raumlicht.
async function haLamps(db,buildingID){
 const rows=(await db.query(`SELECT l.user_id AS owner,l.mode,l.status,e.entity_id,e.name,e.supports_color,e.light_caps,e.light_state,x.room_id,r.data->>'name' AS room_name,r.data->>'ifc_global_id' AS room_gid
  FROM app_ha_links l JOIN app_ha_entities e ON e.link_id=l.id AND e.selected AND e.metric='light'
  LEFT JOIN app_ha_devices d ON d.link_id=l.id AND d.device_id=e.device_id LEFT JOIN app_ha_areas a ON a.link_id=l.id AND a.area_id=e.area_id LEFT JOIN app_ha_areas da ON da.link_id=d.link_id AND da.area_id=d.area_id
  CROSS JOIN LATERAL (SELECT COALESCE(e.room_id,d.room_id,a.room_id,da.room_id) AS room_id) x
  LEFT JOIN app_twin_records r ON r.id=x.room_id AND r.entity='Room'
  WHERE l.building_id=$1 ORDER BY e.name,e.entity_id LIMIT 50`,[buildingID])).rows;
 return rows.map(r=>({owner:r.owner,app_mode:r.mode==='app'&&r.status==='active',entity_id:r.entity_id,name:r.name,supports_color:r.supports_color===true,caps:r.light_caps||{},state:r.light_state||null,room_id:r.room_id||null,room:r.room_name||'',room_gid:r.room_gid||null}));
}

module.exports={haLamps,initHAImport,haImportRouter,bridgeRouter,haTelemetry,haRoomTemperatures,METRICS};
