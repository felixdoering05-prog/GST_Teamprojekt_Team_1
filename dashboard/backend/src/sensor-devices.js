const express=require('express');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {accessibleBuilding}=require('./collaboration');
const {service}=require('./twin');
const {METRIC_META}=require('./twin/thresholdRules');
const {validateRoom}=require('./equipment');
const hash=v=>createHash('sha256').update(v).digest('hex');
async function initSensorDevices(db){await db.query(`CREATE TABLE IF NOT EXISTS app_sensor_devices(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,token_hash TEXT UNIQUE NOT NULL,sensors JSONB NOT NULL,last_key TEXT,last_hash TEXT,last_at TIMESTAMPTZ,revoked BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 // Echte Hardware und Zuordnung zu einem IFC-Raum (Dokument + IfcSpace-Express-ID).
 await db.query(`ALTER TABLE app_sensor_devices ADD COLUMN IF NOT EXISTS hardware TEXT NOT NULL DEFAULT 'simulation'`);
 await db.query('ALTER TABLE app_sensor_devices ADD COLUMN IF NOT EXISTS document_id INTEGER');
 await db.query('ALTER TABLE app_sensor_devices ADD COLUMN IF NOT EXISTS space_id INTEGER');
 await db.query('ALTER TABLE app_sensor_devices ADD COLUMN IF NOT EXISTS room_label TEXT');
 await db.query('ALTER TABLE app_sensor_devices ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0');
}
// simulation: synthetische Werte (Demo). bme280: echte Temperatur/Feuchte, kein CO2-Sensor.
const HARDWARE={simulation:{source:'demo',metrics:['temperature','humidity','co2'],label:'ESP32-S3 SIMULATION'},bme280:{source:'real',metrics:['temperature','humidity'],label:'ESP32 + BME280'}};
const RANGES={temperature:[-40,85],humidity:[0,100],co2:[250,10000]};
const hardwareOf=d=>HARDWARE[d.hardware]?HARDWARE[d.hardware]:HARDWARE.simulation;
const publicDevice=d=>({id:d.id,building_id:d.building_id,hardware:d.hardware||'simulation',source:hardwareOf(d).source,room:d.room_label||null,document_id:d.document_id??null,space_id:d.space_id??null,revision:d.revision||0,last_at:d.last_at?new Date(d.last_at).toISOString():null});
// GlobalId des IfcSpace (erstes Attribut), nur zur stabilen Zuordnung des Raum-Datensatzes.
function spaceGlobalId(content,spaceID){const m=new RegExp('#'+spaceID+"\\s*=\\s*IFCSPACE\\s*\\(\\s*'([0-9A-Za-z_$]{22})'",'i').exec(Buffer.from(content).toString('utf8'));return m?m[1]:null;}
async function ifcRoomRecord(c,api,building,documentID,spaceID,label){
 const doc=(await c.query('SELECT content FROM app_documents WHERE id=$1',[documentID])).rows[0];
 const globalID=doc&&spaceGlobalId(doc.content,spaceID)||`doc${documentID}-space${spaceID}`;
 const existing=(await api.Room.filter({building_id:String(building),ifc_global_id:globalID},{limit:2})).items.filter(r=>r.source!=='demo');
 if(existing.length)return existing[0];
 const code=label.split(' · ')[0].slice(0,60)||`IFC-${spaceID}`;
 return api.Room.create({name:label.slice(0,100),room_code:code,building_id:String(building),ifc_global_id:globalID,source:'real',notes:`Aus IFC-Dokument ${documentID}, IfcSpace #${spaceID}`});
}
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

 // Geräte eines Gebäudes (ohne Schlüssel), z. B. für die Raumzuordnung in der App.
 r.get('/buildings/:deviceBuilding/sensor-devices',requireAccount,wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!/^[1-9]\d{0,9}$/.test(req.params.deviceBuilding)||Number(req.params.deviceBuilding)>2147483647)return res.status(400).json({error:'Ungültiges Gebäude.'});
  const building=await accessibleBuilding(db,req.params.deviceBuilding,req.account.id);if(!building)return res.status(404).json({error:'Gebäude nicht gefunden.'});
  res.json((await db.query('SELECT * FROM app_sensor_devices WHERE building_id=$1 AND user_id=$2 AND revoked=false ORDER BY created_at,id LIMIT 20',[building.id,building.user_id])).rows.map(publicDevice));
 }));
 // Eigentümer: Hardware auf echten BME280 umstellen und/oder einem IFC-Raum zuordnen.
 r.put('/sensor-devices/:device',requireAccount,wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');const b=req.body||{};
  const bad=msg=>res.status(400).json({error:msg});
  if(Object.keys(b).some(k=>!['hardware','document_id','space_id','revision'].includes(k))||!Number.isInteger(b.revision)||b.revision<0)return bad('Bitte Hardware/Raum und aktuelle Revision senden.');
  if(b.hardware!==undefined&&!Object.hasOwn(HARDWARE,b.hardware))return bad('Unbekannte Hardware.');
  const placing=b.document_id!==undefined||b.space_id!==undefined;
  const c=await db.connect();try{await c.query('BEGIN');
   const d=(await c.query('SELECT * FROM app_sensor_devices WHERE id=$1 AND user_id=$2 AND revoked=false FOR UPDATE',[req.params.device,req.account.id])).rows[0];
   if(!d){await c.query('ROLLBACK');return res.status(404).json({error:'Gerät nicht gefunden.'});}
   if(d.revision!==b.revision){await c.query('ROLLBACK');return res.status(409).json({error:'Gerät inzwischen geändert. Bitte neu laden.'});}
   const api=service(c,req.account.id).entities;let sensors=d.sensors,hardware=d.hardware||'simulation';
   if(b.hardware&&b.hardware!==hardware){
    if(b.hardware!=='bme280'){await c.query('ROLLBACK');return bad('Ein echtes Gerät kann nicht zurück auf Simulation gestellt werden.');}
    // Neue, echte Sensoren anlegen; alte Simulationswerte bleiben als Demo getrennt erhalten.
    sensors={};const hw=HARDWARE.bme280;
    for(const metric of hw.metrics){const s=await api.Sensor.create({name:'ESP32 '+METRIC_META[metric].label,sensor_code:'ESP-'+d.id.slice(0,8)+'-'+metric+'-real',metric,unit:METRIC_META[metric].unit,building_id:String(d.building_id),source:'real',status:'aktiv',hardware_type:hw.label});sensors[metric]=s.id;}
    hardware='bme280';
   }
   let room={document_id:d.document_id,space_id:d.space_id,room_label:d.room_label};
   if(placing){
    const v=await validateRoom(c,d.building_id,{document_id:b.document_id??null,space_id:b.space_id??null});
    room={document_id:v.document_id,space_id:v.space_id,room_label:v.document_id?v.room:null};
   }
   // Raum-Datensatz (echt) für IFC-Zuordnung, damit Heatmap/Raumtemperaturen die Werte finden.
   if(room.document_id&&HARDWARE[hardware].source==='real'){
    const record=await ifcRoomRecord(c,api,d.building_id,room.document_id,room.space_id,room.room_label);
    for(const id of Object.values(sensors))await api.Sensor.update(id,{room_id:record.id,name:room.room_label.split(' · ').pop()+' '+METRIC_META[Object.keys(sensors).find(k=>sensors[k]===id)].label});
   }
   const row=(await c.query('UPDATE app_sensor_devices SET hardware=$2,sensors=$3,document_id=$4,space_id=$5,room_label=$6,revision=revision+1,last_key=NULL,last_hash=NULL WHERE id=$1 RETURNING *',[d.id,hardware,JSON.stringify(sensors),room.document_id,room.space_id,room.room_label])).rows[0];
   await c.query('COMMIT');res.json(publicDevice(row));
  }catch(e){await c.query('ROLLBACK');if(e.status)return res.status(e.status).json({error:e.message});throw e;}finally{c.release();}
 }));
 // 3D-Ansicht: neueste Werte je IFC-Raum eines Modells. Nur lesend, nur für Gebäudezugang.
 r.get('/documents/:sensorDoc/sensor-overlay',requireAccount,wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!/^[1-9]\d{0,9}$/.test(req.params.sensorDoc)||Number(req.params.sensorDoc)>2147483647)return res.status(400).json({error:'Ungültiges Modell.'});
  const doc=(await db.query("SELECT id,building_id FROM app_documents WHERE id=$1 AND mime_type='application/x-step'",[req.params.sensorDoc])).rows[0];
  const building=doc&&await accessibleBuilding(db,doc.building_id,req.account.id);if(!building)return res.status(404).json({error:'Modell nicht gefunden.'});
  const devices=(await db.query('SELECT * FROM app_sensor_devices WHERE building_id=$1 AND user_id=$2 AND document_id=$3 AND revoked=false ORDER BY created_at,id LIMIT 20',[building.id,building.user_id,doc.id])).rows;
  const rooms=[];
  for(const d of devices){
   const hw=hardwareOf(d),values=[];
   for(const metric of hw.metrics){
    const m=(await db.query("SELECT data FROM app_twin_records WHERE user_id=$1 AND entity='Measurement' AND data->>'sensor_id'=$2 AND data->>'building_id'=$3 AND data->>'source'=$4 ORDER BY created_at DESC,id DESC LIMIT 1",[building.user_id,d.sensors?.[metric]||'',String(building.id),hw.source])).rows[0]?.data;
    if(m&&typeof m.value==='number'&&Number.isFinite(m.value))values.push({metric,label:METRIC_META[metric].label,value:m.value,unit:METRIC_META[metric].unit,measured_at:new Date(m.measured_at).toISOString()});
   }
   const latest=values.reduce((t,v)=>v.measured_at>t?v.measured_at:t,'');
   rooms.push({space_id:d.space_id,room:d.room_label,device_id:d.id,source:hw.source,hardware:d.hardware||'simulation',values,updated_at:latest||null,stale:!latest||Date.now()-Date.parse(latest)>180000});
  }
  res.json({document_id:doc.id,generated_at:new Date().toISOString(),rooms});
 }));
 r.delete('/sensor-devices/:device',requireAccount,wrap(async(req,res)=>{await db.query('UPDATE app_sensor_devices SET revoked=true WHERE id=$1 AND user_id=$2',[req.params.device,req.account.id]);res.json({ok:true});}));
 r.post('/sensor-input',wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');const token=req.get('X-D21-Device')||'';
  if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({error:'Gerätezugang ungültig.'});
  const b=req.body||{};
  // Format zuerst grob prüfen; welche Messgrößen Pflicht sind, hängt von der Hardware des Geräts ab.
  if(Object.keys(b).some(k=>!['request_key',...Object.keys(RANGES)].includes(k))||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(b.request_key||'')||Object.entries(RANGES).some(([k,[min,max]])=>k in b&&(typeof b[k]!=='number'||!Number.isFinite(b[k])||b[k]<min||b[k]>max)))return res.status(400).json({error:'Ungültige Messwerte.'});
  const c=await db.connect();try{await c.query('BEGIN');
   // Read identity first; then use the established user/building/device lock ordering.
   const identity=(await c.query('SELECT user_id,building_id FROM app_sensor_devices WHERE token_hash=$1 AND revoked=false',[hash(token)])).rows[0];
   if(!identity){await c.query('ROLLBACK');return res.status(401).json({error:'Gerätezugang ungültig.'});}
   await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[identity.user_id]);await c.query('SELECT id FROM app_buildings WHERE id=$1 FOR UPDATE',[identity.building_id]);
   const d=(await c.query('SELECT * FROM app_sensor_devices WHERE token_hash=$1 AND revoked=false FOR UPDATE',[hash(token)])).rows[0];if(!d){await c.query('ROLLBACK');return res.status(401).json({error:'Gerätezugang ungültig.'});}
   const digest=hash(JSON.stringify(b));if(d.last_key===b.request_key){await c.query('COMMIT');return res.status(d.last_hash===digest?200:409).json({cached:d.last_hash===digest});}
   if(d.last_at&&Date.now()-Date.parse(d.last_at)<55000){await c.query('ROLLBACK');return res.status(429).json({error:'Maximal ein Paket pro Minute.'});}
   const hw=hardwareOf(d);
   if(hw.metrics.some(k=>typeof b[k]!=='number')||Object.keys(b).some(k=>k!=='request_key'&&!hw.metrics.includes(k))){await c.query('ROLLBACK');return res.status(400).json({error:`Dieses Gerät sendet genau: ${hw.metrics.join(', ')}.`});}
   const api=service(c,d.user_id).entities,now=new Date().toISOString();
   for(const metric of hw.metrics){const s=(await api.Sensor.filter({id:d.sensors[metric]},{limit:1})).items[0];if(!s)throw Error('Device sensor missing');if(s.building_id!==String(d.building_id)||s.source!==hw.source||s.metric!==metric)throw Error('Device sensor mapping invalid');await api.Measurement.create({building_id:String(d.building_id),...(s.room_id?{room_id:s.room_id}:{}),sensor_id:s.id,sensor_code:s.sensor_code,metric,value:b[metric],unit:METRIC_META[metric].unit,source:hw.source,quality:'ok',measured_at:now});}
   await c.query('UPDATE app_sensor_devices SET last_key=$2,last_hash=$3,last_at=now() WHERE id=$1',[d.id,b.request_key,digest]);await c.query('COMMIT');res.status(201).json({imported:hw.metrics.length,source:hw.source});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));return r;
}
module.exports={initSensorDevices,sensorDevicesRouter};
