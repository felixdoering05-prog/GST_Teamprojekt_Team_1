const express=require('express');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {accessibleBuilding}=require('./collaboration');
const {service}=require('./twin');
const {METRIC_META}=require('./twin/thresholdRules');
const hash=v=>createHash('sha256').update(v).digest('hex');
async function initSensorDevices(db){await db.query(`CREATE TABLE IF NOT EXISTS app_sensor_devices(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,token_hash TEXT UNIQUE NOT NULL,sensors JSONB NOT NULL,last_key TEXT,last_hash TEXT,last_at TIMESTAMPTZ,revoked BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);}
function sensorDevicesRouter(db,requireAccount){
 const r=express.Router();
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 r.post('/buildings/:deviceBuilding/sensor-devices',requireAccount,wrap(async(req,res)=>{
  const b=req.body||{};
  if(!/^[1-9]\d{0,9}$/.test(req.params.deviceBuilding)||Number(req.params.deviceBuilding)>2147483647||Object.keys(b).some(k=>k!=='room')||typeof b.room!=='string'||!b.room.trim()||b.room.length>80)return res.status(400).json({error:'Gebäude und Raumname erforderlich.'});
  const c=await db.connect();try{await c.query('BEGIN');const building=await accessibleBuilding(c,req.params.deviceBuilding,req.account.id,true);
   if(!building||building.user_id!==req.account.id){await c.query('ROLLBACK');return res.status(404).json({error:'Gebäude nicht gefunden.'});}
   if(Number((await c.query('SELECT count(*) n FROM app_sensor_devices WHERE user_id=$1',[req.account.id])).rows[0].n)>=20){await c.query('ROLLBACK');return res.status(409).json({error:'Maximal 20 Geräte.'});}
   const api=service(c,req.account.id).entities,id=randomUUID(),token=randomBytes(32).toString('hex'),sensors={};
   const room=await api.Room.create({name:b.room.trim(),room_code:'ESP-'+id.slice(0,8),building_id:String(building.id),source:'demo'});
   for(const metric of ['temperature','humidity','co2']){const s=await api.Sensor.create({name:'ESP32 Simulation '+METRIC_META[metric].label,sensor_code:'ESP-'+id.slice(0,8)+'-'+metric,metric,unit:METRIC_META[metric].unit,building_id:String(building.id),room_id:room.id,source:'demo',status:'aktiv',hardware_type:'ESP32-S3 SIMULATION'});sensors[metric]=s.id;}
   await c.query('INSERT INTO app_sensor_devices(id,user_id,building_id,token_hash,sensors) VALUES($1,$2,$3,$4,$5)',[id,req.account.id,building.id,hash(token),JSON.stringify(sensors)]);await c.query('COMMIT');res.set('Cache-Control','private, no-store').status(201).json({id,token,source:'demo',room_id:room.id});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 r.delete('/sensor-devices/:device',requireAccount,wrap(async(req,res)=>{await db.query('UPDATE app_sensor_devices SET revoked=true WHERE id=$1 AND user_id=$2',[req.params.device,req.account.id]);res.json({ok:true});}));
 r.post('/sensor-input',wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');const token=req.get('X-D21-Device')||'';
  if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({error:'Gerätezugang ungültig.'});
  const b=req.body||{},ranges={temperature:[-40,85],humidity:[0,100],co2:[250,10000]};
  if(Object.keys(b).some(k=>!['request_key','temperature','humidity','co2'].includes(k))||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(b.request_key||'')||Object.entries(ranges).some(([k,[min,max]])=>typeof b[k]!=='number'||!Number.isFinite(b[k])||b[k]<min||b[k]>max))return res.status(400).json({error:'Ungültige simulierte Messwerte.'});
  const c=await db.connect();try{await c.query('BEGIN');
   // Read identity first; then use the established user/building/device lock ordering.
   const identity=(await c.query('SELECT user_id,building_id FROM app_sensor_devices WHERE token_hash=$1 AND revoked=false',[hash(token)])).rows[0];
   if(!identity){await c.query('ROLLBACK');return res.status(401).json({error:'Gerätezugang ungültig.'});}
   await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[identity.user_id]);await c.query('SELECT id FROM app_buildings WHERE id=$1 FOR UPDATE',[identity.building_id]);
   const d=(await c.query('SELECT * FROM app_sensor_devices WHERE token_hash=$1 AND revoked=false FOR UPDATE',[hash(token)])).rows[0];if(!d){await c.query('ROLLBACK');return res.status(401).json({error:'Gerätezugang ungültig.'});}
   const digest=hash(JSON.stringify(b));if(d.last_key===b.request_key){await c.query('COMMIT');return res.status(d.last_hash===digest?200:409).json({cached:d.last_hash===digest});}
   if(d.last_at&&Date.now()-Date.parse(d.last_at)<55000){await c.query('ROLLBACK');return res.status(429).json({error:'Maximal ein Paket pro Minute.'});}
   const api=service(c,d.user_id).entities,now=new Date().toISOString();
   for(const metric of Object.keys(ranges)){const s=(await api.Sensor.filter({id:d.sensors[metric]},{limit:1})).items[0];if(!s)throw Error('Device sensor missing');if(s.building_id!==String(d.building_id)||s.source!=='demo'||s.metric!==metric)throw Error('Device sensor mapping invalid');await api.Measurement.create({building_id:String(d.building_id),room_id:s.room_id,sensor_id:s.id,sensor_code:s.sensor_code,metric,value:b[metric],unit:METRIC_META[metric].unit,source:'demo',quality:'ok',measured_at:now});}
   await c.query('UPDATE app_sensor_devices SET last_key=$2,last_hash=$3,last_at=now() WHERE id=$1',[d.id,b.request_key,digest]);await c.query('COMMIT');res.status(201).json({imported:3,source:'demo'});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));return r;
}
module.exports={initSensorDevices,sensorDevicesRouter};
