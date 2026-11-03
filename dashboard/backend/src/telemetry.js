const express=require('express');
const {createHash}=require('node:crypto');
const {accessibleBuilding}=require('./collaboration');
const {service}=require('./twin');
const {mergeThresholds,METRIC_META}=require('./twin/thresholdRules');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const text=(v,max=100)=>typeof v==='string'?v.slice(0,max):'';
const validSource=v=>v==='real'||v==='demo';
function validTimestamp(value){
 if(typeof value!=='string'||value.length>40)return false;
 const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:Z|([+-])(\d\d):(\d\d))$/.exec(value);if(!m)return false;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60&&(!m[7]||Number(m[8])<24&&Number(m[9])<60)&&Number.isFinite(Date.parse(value));
}
async function initTelemetry(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_measurement_imports (
 building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(building_id,user_id,request_key))`);
}
async function telemetrySnapshot(db,building,source){
 if(!validSource(source))fail('Bitte Echt- oder Demodaten auswählen.');
 const records=async(entity,limit,filterSource=true)=>(await db.query(`SELECT id,data FROM app_twin_records WHERE user_id=$1 AND entity=$2 AND data->>'building_id'=$3 ${filterSource?"AND data->>'source'=$4":''} ORDER BY created_at DESC,id LIMIT ${limit+1}`,[building.user_id,entity,String(building.id),...(filterSource?[source]:[])])).rows;
 const [sensors,measurements,energy,thresholdRows]=await Promise.all([
  records('Sensor',100),records('Measurement',500),records('EnergyReading',100),
  db.query("SELECT data FROM app_twin_records WHERE user_id=$1 AND entity='ThresholdConfig' ORDER BY created_at,id LIMIT 100",[building.user_id])
 ]);
 const thresholds=mergeThresholds(thresholdRows.rows.map(r=>r.data));
 const points=measurements.slice(0,500).filter(r=>METRIC_META[r.data.metric]&&typeof r.data.value==='number'&&Number.isFinite(r.data.value)&&Number.isFinite(Date.parse(r.data.measured_at))).map(({id,data:d})=>({id,sensor_id:text(d.sensor_id),sensor_code:text(d.sensor_code),metric:d.metric,value:d.value,unit:METRIC_META[d.metric].unit,measured_at:new Date(d.measured_at).toISOString(),source,quality:['ok','verdaechtig','fehlend'].includes(d.quality)?d.quality:'ok'})).sort((a,b)=>a.measured_at.localeCompare(b.measured_at)||a.id.localeCompare(b.id));
 return {source,generated_at:new Date().toISOString(),truncated:sensors.length>100||measurements.length>500||energy.length>100,
  scope:'Maximal 100 Sensoren, 500 zuletzt gespeicherte Messungen und 100 zuletzt gespeicherte Energiezeiträume dieses Gebäudes. Echt/Demo getrennt. Quelle real bedeutet importiert, nicht unabhängig verifiziert.',
  sensors:sensors.slice(0,100).filter(r=>METRIC_META[r.data.metric]).map(({id,data:d})=>({id,sensor_code:text(d.sensor_code),name:text(d.name)||text(d.sensor_code),metric:d.metric,unit:METRIC_META[d.metric].unit,status:text(d.status),room_id:text(d.room_id),source})),
  measurements:points,
  energy:energy.slice(0,100).filter(r=>typeof r.data.value==='number'&&Number.isFinite(r.data.value)).map(({id,data:d})=>({id,medium:text(d.medium),value:d.value,unit:text(d.unit,20),period_start:text(d.period_start),period_end:text(d.period_end),source})),thresholds};
}
async function analysisContext(db,building,source){
 const snapshot=await telemetrySnapshot(db,building,source);
 const metrics=Object.keys(METRIC_META).map(metric=>{
  const points=snapshot.measurements.filter(p=>p.metric===metric&&p.quality==='ok');
  if(!points.length)return {metric,count:0};
  const values=points.map(p=>p.value);return {metric,unit:METRIC_META[metric].unit,count:points.length,min:Math.min(...values),max:Math.max(...values),mean:Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(3)),first_at:points[0].measured_at,last_at:points.at(-1).measured_at};
 });
 return {mode:'measurement-analysis',building:{name:building.name},source,metrics,thresholds:snapshot.thresholds,truncated:snapshot.truncated,
  limitations:['Begrenzter Ausschnitt zuletzt gespeicherter Werte, keine vollständigen Zeitreihen.','Nur Qualität ok; keine Dateiinhalte, Adresse, Namen von Personen, Chatverläufe oder Zugangsdaten.','Mittelwerte können mehrere Sensoren zusammenfassen. Keine Raumdiagnose, Prognose oder Modelltraining.','real = als Messung importiert, nicht unabhängig verifiziert; demo = Beispieldaten.'],scope:snapshot.scope};
}
function telemetryRouter(db,requireAccount){
 const r=express.Router(),base='/buildings/:telemetryBuilding/telemetry';
 r.use(base,requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');if(!/^[1-9]\d*$/.test(req.params.telemetryBuilding)||Number(req.params.telemetryBuilding)>2147483647)return res.status(400).json({error:'Ungültiges Gebäude.'});next();});
 r.get(base,wrap(async(req,res)=>{
  const b=await accessibleBuilding(db,req.params.telemetryBuilding,req.account.id);if(!b)return res.status(404).json({error:'Gebäude nicht gefunden.'});
  res.json(await telemetrySnapshot(db,b,req.query.source||'real'));
 }));
 r.post(base+'/sensors',wrap(async(req,res)=>{
  const b=req.body||{};
  if(Object.keys(b).some(k=>!['name','sensor_code','metric','source'].includes(k))||!validSource(b.source)||!Object.hasOwn(METRIC_META,b.metric)||typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.sensor_code!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(b.sensor_code))fail('Bitte Name, eindeutige Sensorkennung, Messgröße und Quelle prüfen.');
  const c=await db.connect();try{
   await c.query('BEGIN');const building=await accessibleBuilding(c,req.params.telemetryBuilding,req.account.id,true);if(!building){await c.query('ROLLBACK');return res.status(404).json({error:'Gebäude nicht gefunden.'});}
   const api=service(c,building.user_id).entities;
   const page=await api.Sensor.filter({building_id:String(building.id),source:b.source},{limit:500});
   const existing=page.items.filter(s=>s.sensor_code?.toLowerCase()===b.sensor_code.toLowerCase());
   if(existing.length){if(existing.length!==1||existing[0].metric!==b.metric||existing[0].name!==b.name.trim())fail('Diese Sensorkennung ist bereits anders vergeben.',409);await c.query('COMMIT');return res.json(existing[0]);}
   if(page.has_more||page.items.length>=100)fail('Maximal 100 Sensoren je Gebäude und Quelle.',409);
   const sensor=await api.Sensor.create({name:b.name.trim(),sensor_code:b.sensor_code,metric:b.metric,unit:METRIC_META[b.metric].unit,building_id:String(building.id),source:b.source,status:'aktiv'});
   await c.query('COMMIT');res.status(201).json(sensor);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 r.post(base+'/import',wrap(async(req,res)=>{
  const body=req.body||{};
  if(Object.keys(body).some(k=>!['source','rows','request_key'].includes(k))||!validSource(body.source)||typeof body.request_key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.request_key)||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>200)fail('Import benötigt Quelle, UUID und 1–200 Messwerte.');
  const c=await db.connect();try{
   await c.query('BEGIN');const b=await accessibleBuilding(c,req.params.telemetryBuilding,req.account.id,true);if(!b){await c.query('ROLLBACK');return res.status(404).json({error:'Gebäude nicht gefunden.'});}
   const key=body.request_key.toLowerCase(),hash=createHash('sha256').update(JSON.stringify({source:body.source,rows:body.rows})).digest('hex');
   const old=(await c.query('SELECT payload_hash,result FROM app_measurement_imports WHERE building_id=$1 AND user_id=$2 AND request_key=$3',[b.id,req.account.id,key])).rows[0];
   if(old){if(old.payload_hash!==hash)fail('Diese Import-ID wurde bereits mit anderen Daten verwendet.',409);await c.query('COMMIT');return res.json({...old.result,cached:true});}
   const api=service(c,b.user_id).entities;
   const sensors=(await api.Sensor.filter({building_id:String(b.id),source:body.source},{limit:500}));
   if(sensors.has_more)fail('Für den Import bitte maximal 500 Sensoren pro Quelle/Gebäude verwenden.');
   const prepared=body.rows.map((row,index)=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['sensor_code','value','measured_at'].includes(k))||typeof row.sensor_code!=='string'||row.sensor_code.length>100||typeof row.value!=='number'||!Number.isFinite(row.value)||!validTimestamp(row.measured_at))fail(`Zeile ${index+2}: Sensor, Wert oder ISO-Zeitpunkt mit Zeitzone ungültig.`);
    const found=sensors.items.filter(s=>s.sensor_code?.toLowerCase()===row.sensor_code.trim().toLowerCase());
    if(found.length!==1)fail(`Zeile ${index+2}: Sensor im Gebäude und in dieser Datenquelle nicht eindeutig vorhanden.`);
    const sensor=found[0];return {building_id:String(b.id),sensor_id:sensor.id,sensor_code:sensor.sensor_code,...(sensor.room_id?{room_id:sensor.room_id}:{}),metric:sensor.metric,unit:METRIC_META[sensor.metric]?.unit||sensor.unit,value:row.value,measured_at:new Date(row.measured_at).toISOString(),source:body.source,quality:'ok'};
   });
   await api.Measurement.bulkCreate(prepared);
   const result={imported:prepared.length,source:body.source};
   await c.query('INSERT INTO app_measurement_imports(building_id,user_id,request_key,payload_hash,result) VALUES($1,$2,$3,$4,$5)',[b.id,req.account.id,key,hash,JSON.stringify(result)]);
   await c.query('COMMIT');res.status(201).json(result);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 r.use((e,req,res,next)=>e.status?res.status(e.status).json({error:e.message}):next(e));return r;
}
module.exports={initTelemetry,telemetryRouter,telemetrySnapshot,analysisContext};
