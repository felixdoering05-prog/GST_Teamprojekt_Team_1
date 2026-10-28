const express = require('express');
const {randomUUID} = require('node:crypto');
const seed = require('./seed');
const {runThresholdCheck} = require('./thresholdRules');
const names = ['Building','Floor','Room','Sensor','Measurement','EnergyReading','Alert','ThresholdConfig'];
const schemas = Object.fromEntries(names.map(name => [name,require(`./${name}.json`)]));
const refs = {building_id:'Building',floor_id:'Floor',room_id:'Room',sensor_id:'Sensor'};
const MAX_ROWS = 20000;
const fail = (message,status=400) => {const error=new Error(message);error.status=status;throw error;};
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
async function initTwin(db) {
 await db.query(`ALTER TABLE app_buildings ADD COLUMN IF NOT EXISTS twin_data JSONB NOT NULL DEFAULT '{}'::jsonb`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_twin_records (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entity TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query('CREATE INDEX IF NOT EXISTS app_twin_owner_idx ON app_twin_records(user_id,entity)');
}
function validate(entity,input,partial=false) {
 const schema=schemas[entity];
 if(!Object.hasOwn(schemas,entity))fail('Unbekannter Datentyp.',404);
 if(!input||Array.isArray(input)||typeof input!=='object')fail('Datensatz erforderlich.');
 const result={};
 for(const [key,value] of Object.entries(input)) {
  const field=schema.properties[key];
  if(!Object.hasOwn(schema.properties,key))fail(`Unbekanntes Feld: ${key}`);
  if(value===null){if(schema.required.includes(key))fail(`Pflichtfeld: ${key}`);result[key]=null;continue;}
  if(field.type==='number' && (typeof value!=='number'||!Number.isFinite(value)))fail(`Ungültige Zahl: ${key}`);
  if(field.type==='string' && (typeof value!=='string'||value.length>4000))fail(`Ungültiger Text: ${key}`);
  if(field.type==='array' && (!Array.isArray(value)||value.length>500||value.some(x=>typeof x!=='string'||x.length>200)))fail(`Ungültige Liste: ${key}`);
  if(field.enum&&!field.enum.includes(value))fail(`Ungültige Auswahl: ${key}`);
  if(field.type==='string'&&(/_at$|^period_/.test(key))&&value&&!Number.isFinite(Date.parse(value)))fail(`Ungültiger Zeitpunkt: ${key}`);
  result[key]=value;
 }
 if(!partial)for(const [key,field] of Object.entries(schema.properties))if(result[key]===undefined&&field.default!==undefined)result[key]=field.default;
 if(!partial)for(const key of schema.required)if(result[key]===undefined||result[key]===null||result[key]==='')fail(`Pflichtfeld: ${key}`);
 if(entity==='Building' && ((result.name?.length||0)>200||(result.address?.length||0)>500))fail('Gebäudename maximal 200 Zeichen, Adresse maximal 500 Zeichen.');
 return result;
}
function matches(row,filter={}) {
 if(!filter||Array.isArray(filter)||typeof filter!=='object'||Object.keys(filter).length>20)fail('Ungültiger Filter.');
 return Object.entries(filter).every(([key,expected])=>{
  if(!/^[a-z_]+$/.test(key))fail('Ungültiges Filterfeld.');
  const actual=row[key];
  if(expected!==null&&typeof expected==='object') {
   if(Array.isArray(expected))fail('Ungültiger Filter.');
   return Object.entries(expected).every(([op,v])=>{
    if(op==='$ne')return actual!==v;
    if(op==='$gte')return actual!=null&&actual>=v;
    if(op==='$in'&&Array.isArray(v)&&v.length<=100)return v.includes(actual);
    fail('Unbekannter Filteroperator.');
   });
  }
  return actual===expected;
 });
}
function service(db,userId) {
 async function all(entity) {
  if(!Object.hasOwn(schemas,entity))fail('Unbekannter Datentyp.',404);
  if(entity==='Building')return (await db.query('SELECT * FROM app_buildings WHERE user_id=$1 ORDER BY id LIMIT 20001',[userId])).rows.map(b=>({...b.twin_data,id:String(b.id),name:b.name,address:b.address,source:b.twin_data.source||'real',created_date:new Date(b.created_at).toISOString()}));
  return (await db.query('SELECT * FROM app_twin_records WHERE user_id=$1 AND entity=$2 ORDER BY created_at,id LIMIT 20001',[userId,entity])).rows.map(r=>({...r.data,id:r.id,created_date:new Date(r.created_at).toISOString(),updated_date:new Date(r.updated_at).toISOString()}));
 }
 async function get(entity,id) {
  const rows=await all(entity);const row=rows.find(r=>r.id===String(id));
  if(!row)fail('Datensatz nicht gefunden.',404);return row;
 }
 async function query(entity,filter={},options={}) {
  let rows=(await all(entity)).filter(r=>matches(r,filter));
  const sort=options.sort||'created_date', key=sort.replace(/^-/,'');
  if(!['id','created_date','updated_date',...Object.keys(schemas[entity].properties)].includes(key))fail('Ungültige Sortierung.');
  rows.sort((a,b)=>{const v=a[key],w=b[key];const order=v==null?(w==null?0:-1):w==null?1:v<w?-1:v>w?1:0;return (sort[0]==='-'?-order:order)||a.id.localeCompare(b.id)});
  const offset=options.cursor===undefined?0:Number(options.cursor);
  const limit=Number(options.limit??500);
  if(!Number.isInteger(offset)||offset<0||offset>MAX_ROWS||!Number.isInteger(limit)||limit<1||limit>500)fail('Ungültige Seitengröße.');
  const items=rows.slice(offset,offset+limit), has_more=offset+limit<rows.length;
  return {items,has_more,next_cursor:has_more?String(offset+limit):null};
 }
 async function references(entity,data) {
  const parents={};
  for(const [field,parent] of Object.entries(refs))if(data[field])parents[field]=await get(parent,data[field]);
  if(data.sensor_ids)for(const id of data.sensor_ids)await get('Sensor',id);
  for(const parent of Object.values(parents))if(data.building_id&&parent.building_id&&parent.building_id!==data.building_id)fail('Zuordnung gehört zu einem anderen Gebäude.');
  if(parents.sensor_id&&data.room_id&&parents.sensor_id.room_id!==data.room_id)fail('Sensor gehört zu einem anderen Raum.');
  if(entity==='Measurement'&&parents.sensor_id&&parents.sensor_id.metric!==data.metric)fail('Messgröße passt nicht zum Sensor.');
 }
 async function create(entity,input) {
  const data=validate(entity,input);await references(entity,data);
  const count=Number((await db.query('SELECT COUNT(*) AS count FROM app_twin_records WHERE user_id=$1',[userId])).rows[0].count)+Number((await db.query('SELECT COUNT(*) AS count FROM app_buildings WHERE user_id=$1',[userId])).rows[0].count);
  if(count>=MAX_ROWS)fail('Prototyp-Limit von 20.000 Datensätzen pro Konto erreicht.',413);
  if(entity==='Building') {
   const row=(await db.query('INSERT INTO app_buildings(user_id,name,address,twin_data) VALUES($1,$2,$3,$4) RETURNING id',[userId,data.name,data.address||'',JSON.stringify(data)])).rows[0];
   return get(entity,String(row.id));
  }
  const id=randomUUID();await db.query('INSERT INTO app_twin_records(id,user_id,entity,data) VALUES($1,$2,$3,$4)',[id,userId,entity,JSON.stringify(data)]);return { ...data, id, created_date:new Date().toISOString() };
 }
 async function update(entity,id,input) {
  const old=await get(entity,id);const patch=validate(entity,input,true);
  const {id:_,created_date,updated_date,...original}=old;
  const data=validate(entity,{...original,...patch});await references(entity,data);
  if(entity==='Building')await db.query('UPDATE app_buildings SET name=$1,address=$2,twin_data=$3 WHERE id=$4 AND user_id=$5',[data.name,data.address||'',JSON.stringify(data),id,userId]);
  else await db.query('UPDATE app_twin_records SET data=$1,updated_at=now() WHERE id=$2 AND user_id=$3 AND entity=$4',[JSON.stringify(data),id,userId,entity]);
  return get(entity,id);
 }
 async function remove(entity,id) {
  await get(entity,id);
  const dependents=(await db.query('SELECT data FROM app_twin_records WHERE user_id=$1',[userId])).rows;
  if(dependents.some(({data})=>Object.entries(refs).some(([key,type])=>type===entity&&data[key]===id)||(entity==='Sensor'&&data.sensor_ids?.includes(id))))fail('Es bestehen noch zugeordnete Datensätze. Bitte zuerst diese Zuordnungen entfernen.',409);
  // Buildings with files cannot be deleted by demo cleanup or generic CRUD.
  if(entity==='Building') {
   if(Number((await db.query('SELECT COUNT(*) AS count FROM app_documents WHERE building_id=$1',[id])).rows[0].count))fail('Das Gebäude enthält noch Dateien und kann hier nicht gelöscht werden.',409);
   await db.query('DELETE FROM app_buildings WHERE id=$1 AND user_id=$2',[id,userId]);
  } else await db.query('DELETE FROM app_twin_records WHERE id=$1 AND user_id=$2 AND entity=$3',[id,userId,entity]);
  return {ok:true};
 }
 const entities=Object.fromEntries(names.map(entity=>[entity,{
  list:async(sort,limit)=> (await query(entity,{}, {sort,limit})).items,
  filter:(filter,options)=>query(entity,filter,options),
  count:async(filter={})=>(await all(entity)).filter(r=>matches(r,filter)).length,
  create:input=>create(entity,input),update:(id,input)=>update(entity,id,input),delete:id=>remove(entity,id),
  bulkCreate:async inputs=>{if(!Array.isArray(inputs)||inputs.length>200)fail('Maximal 200 Datensätze je Import.');const out=[];for(const input of inputs)out.push(await create(entity,input));return out;},
  bulkUpdate:async inputs=>{if(!Array.isArray(inputs)||inputs.length>200)fail('Maximal 200 Datensätze.');const out=[];for(const {id,...input} of inputs)out.push(await update(entity,id,input));return out;},
  deleteMany:async filter=>{if(!filter||Object.keys(filter).length===0)fail('Filter zum Löschen erforderlich.');for(const row of (await all(entity)).filter(r=>matches(r,filter)))await remove(entity,row.id);return {ok:true};}
 }]));
 return {entities};
}
function twinRouter(db,requireAccount) {
 const router=express.Router();router.use(requireAccount);
 router.post('/twin/:entity/:action',express.json({limit:'2mb'}),wrap(async(req,res)=>{
  const entity=req.params.entity, action=req.params.action;
  if(!Object.hasOwn(schemas,entity))fail('Unbekannter Datentyp.',404);
  if(!['list','filter','count','create','update','delete','bulkCreate','bulkUpdate','deleteMany'].includes(action))fail('Unbekannte Aktion.',404);
  const body=req.body||{};const read=['list','filter','count'].includes(action);
  const execute=async client=>{
   const api=service(client,req.account.id).entities[entity];
   if(action==='list')return api.list(body.sort,body.limit);
   if(action==='filter')return api.filter(body.filter,body.options);
   if(action==='count')return api.count(body.filter);
   if(action==='create')return api.create(body.data);
   if(action==='update')return api.update(String(body.id),body.data);
   if(action==='delete')return api.delete(String(body.id));
   if(action==='bulkCreate'||action==='bulkUpdate')return api[action](body.data);
   return api.deleteMany(body.filter);
  };
  res.json(read?await execute(db):await transaction(db,req.account.id,execute));
 }));
 router.post('/twin-functions/:name',wrap(async(req,res)=>{
  if(!['seedDemoData','runThresholdCheck'].includes(req.params.name))fail('Unbekannte Funktion.',404);
  const result=await transaction(db,req.account.id,async client=>{
   const api=service(client,req.account.id);
   if(req.params.name==='seedDemoData')return seed(api);
   const sinceHours=Math.min(72,Math.max(1,Number(req.body?.sinceHours)||4));
   const r=await runThresholdCheck(api,{sinceHours});
   return {checked:r.checkedSensors,sensors_total:r.sensorsTotal,created:r.created,resolved:r.resolved,violations:r.violations,window_hours:r.windowHours,message:`${r.violations.length} Grenzwertüberschreitungen, ${r.created} neue Meldungen.`};
  });res.json(result);
 }));
 router.use((err,req,res,next)=>{
  if(err.type==='entity.too.large')return res.status(413).json({error:'Import zu groß.'});
  if(err.status)return res.status(err.status).json({error:err.message});next(err);
 });return router;
}
async function transaction(db,userId,fn) {
 const client=await db.connect();
 try {await client.query('BEGIN');await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[userId]);const result=await fn(client);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
module.exports={initTwin,twinRouter,service,transaction};
