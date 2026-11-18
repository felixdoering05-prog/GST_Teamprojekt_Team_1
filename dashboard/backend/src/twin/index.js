const {syncBuildingLocation}=require('../building-weather');
const express = require('express');
const {randomUUID} = require('node:crypto');
const seed = require('./seed');
const {runThresholdCheck} = require('./thresholdRules');
const {buildingAccess,can} = require('../team-permissions');
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
  if(field.type==='boolean' && typeof value!=='boolean')fail(`Ungültiger Wahrheitswert: ${key}`);
  if(field.type==='string' && (typeof value!=='string'||value.length>4000))fail(`Ungültiger Text: ${key}`);
  if(field.type==='array' && (!Array.isArray(value)||value.length>500||value.some(x=>typeof x!=='string'||x.length>200)))fail(`Ungültige Liste: ${key}`);
  if(field.enum&&!field.enum.includes(value))fail(`Ungültige Auswahl: ${key}`);
  if(field.type==='string'&&(/_at$|^period_/.test(key))&&value&&!Number.isFinite(Date.parse(value)))fail(`Ungültiger Zeitpunkt: ${key}`);
  result[key]=value;
 }
 if(!partial)for(const [key,field] of Object.entries(schema.properties))if(result[key]===undefined&&field.default!==undefined)result[key]=field.default;
 if(!partial)for(const key of schema.required)if(result[key]===undefined||result[key]===null||result[key]==='')fail(`Pflichtfeld: ${key}`);
 if(entity==='Building') {
  if((result.name?.length||0)>200||(result.address?.length||0)>500)fail('Gebäudename maximal 200 Zeichen, Adresse maximal 500 Zeichen.');
  const hasLatitude=result.latitude!==undefined&&result.latitude!==null, hasLongitude=result.longitude!==undefined&&result.longitude!==null;
  if(hasLatitude!==hasLongitude)fail('Bitte Breitengrad und Längengrad gemeinsam angeben.');
  if(hasLatitude&&(result.latitude < -85.05112878||result.latitude > 85.05112878||result.longitude < -180||result.longitude > 180))fail('Die Koordinaten liegen außerhalb des gültigen Kartenbereichs.');
  if(result.model_heading_degrees!==undefined&&result.model_heading_degrees!==null&&(result.model_heading_degrees<0||result.model_heading_degrees>360))fail('Die Modellrichtung muss zwischen 0° und 360° liegen.');
 }
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
function service(db,userId,scope={}) {
 const sharedOwners=[...new Set([Number(userId),...(scope.ownerIds||[]).map(Number)])];
 const buildingIDs=scope.buildingIDs?new Set(scope.buildingIDs.map(String)):null;
 const ownerByBuilding=scope.ownerByBuilding||{};
 const visibleRecord=row=>{
  if(!buildingIDs)return true;
  const buildingID=row.data?.building_id;
  if(buildingID===undefined||buildingID===null)return Number(row.user_id)===Number(userId);
  return buildingIDs.has(String(buildingID));
 };
 async function storageOwner(entity,id){
  if(entity==='Building'){
   const row=(await db.query('SELECT user_id FROM app_buildings WHERE id=$1 AND user_id=ANY($2::int[])',[id,sharedOwners])).rows[0];
   if(!row||buildingIDs&&!buildingIDs.has(String(id)))fail('Datensatz nicht gefunden.',404);
   return Number(row.user_id);
  }
  const row=(await db.query('SELECT user_id,data FROM app_twin_records WHERE id=$1 AND entity=$2 AND user_id=ANY($3::int[])',[String(id),entity,sharedOwners])).rows[0];
  if(!row||!visibleRecord(row))fail('Datensatz nicht gefunden.',404);
  return Number(row.user_id);
 }
 function ownerForData(entity,data){
  if(entity==='Building'||data?.building_id==null)return Number(userId);
  return Number(ownerByBuilding[String(data.building_id)]||userId);
 }
 async function all(entity) {
  if(!Object.hasOwn(schemas,entity))fail('Unbekannter Datentyp.',404);
  if(entity==='Building')return (await db.query('SELECT * FROM app_buildings WHERE user_id=ANY($1::int[]) ORDER BY id LIMIT 20001',[sharedOwners])).rows.filter(b=>!buildingIDs||buildingIDs.has(String(b.id))).map(b=>({...b.twin_data,id:String(b.id),name:b.name,address:b.address,source:b.twin_data.source||'real',created_date:new Date(b.created_at).toISOString()}));
  return (await db.query('SELECT * FROM app_twin_records WHERE user_id=ANY($1::int[]) AND entity=$2 ORDER BY created_at,id LIMIT 20001',[sharedOwners,entity])).rows.filter(visibleRecord).map(r=>({...r.data,id:r.id,created_date:new Date(r.created_at).toISOString(),updated_date:new Date(r.updated_at).toISOString()}));
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
  const storageOwner=ownerForData(entity,data);
  const count=Number((await db.query('SELECT COUNT(*) AS count FROM app_twin_records WHERE user_id=$1',[storageOwner])).rows[0].count)+Number((await db.query('SELECT COUNT(*) AS count FROM app_buildings WHERE user_id=$1',[storageOwner])).rows[0].count);
  if(count>=MAX_ROWS)fail('Prototyp-Limit von 20.000 Datensätzen pro Konto erreicht.',413);
  if(entity==='Building') {
   const row=(await db.query('INSERT INTO app_buildings(user_id,name,address,twin_data) VALUES($1,$2,$3,$4) RETURNING id',[userId,data.name,data.address||'',JSON.stringify(data)])).rows[0];
   await syncBuildingLocation(db,row.id,data);return {...data,id:String(row.id),created_date:new Date().toISOString()};
  }
  const id=randomUUID();await db.query('INSERT INTO app_twin_records(id,user_id,entity,data) VALUES($1,$2,$3,$4)',[id,storageOwner,entity,JSON.stringify(data)]);return { ...data, id, created_date:new Date().toISOString() };
 }
 async function update(entity,id,input) {
  const old=await get(entity,id);const patch=validate(entity,input,true);
  const {id:_,created_date,updated_date,...original}=old;
  const data=validate(entity,{...original,...patch});await references(entity,data);
  const storageOwnerID=await storageOwner(entity,id);
  if(entity!=='Building'&&original.building_id!=null&&data.building_id!=null&&ownerForData(entity,data)!==storageOwnerID)fail('Datensätze können nicht zwischen Gebäudeeigentümern verschoben werden.',403);
  if(entity==='Building'){await db.query('UPDATE app_buildings SET name=$1,address=$2,twin_data=$3 WHERE id=$4 AND user_id=$5',[data.name,data.address||'',JSON.stringify(data),id,storageOwnerID]);await syncBuildingLocation(db,id,data);}
  else await db.query('UPDATE app_twin_records SET data=$1,updated_at=now() WHERE id=$2 AND user_id=$3 AND entity=$4',[JSON.stringify(data),id,storageOwnerID,entity]);
  return get(entity,id);
 }
 async function remove(entity,id) {
  await get(entity,id);
  const storageOwnerID=await storageOwner(entity,id);
  if(entity==='Building'&&storageOwnerID!==Number(userId))fail('Nur der Eigentümer kann ein Gebäude löschen.',403);
  const dependents=(await db.query('SELECT data FROM app_twin_records WHERE user_id=ANY($1::int[])',[sharedOwners])).rows.filter(visibleRecord);
  if(dependents.some(({data})=>Object.entries(refs).some(([key,type])=>type===entity&&data[key]===id)||(entity==='Sensor'&&data.sensor_ids?.includes(id))))fail('Es bestehen noch zugeordnete Datensätze. Bitte zuerst diese Zuordnungen entfernen.',409);
  // Buildings with files cannot be deleted by demo cleanup or generic CRUD.
  if(entity==='Building') {
   if(Number((await db.query('SELECT COUNT(*) AS count FROM app_documents WHERE building_id=$1',[id])).rows[0].count))fail('Das Gebäude enthält noch Dateien und kann hier nicht gelöscht werden.',409);
   if(storageOwnerID!==Number(userId))fail('Nur der Eigentümer kann ein Gebäude löschen.',403);
   await db.query('DELETE FROM app_buildings WHERE id=$1 AND user_id=$2',[id,storageOwnerID]);
  } else await db.query('DELETE FROM app_twin_records WHERE id=$1 AND user_id=$2 AND entity=$3',[id,storageOwnerID,entity]);
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
  const module={Building:'buildings',Floor:'structure',Room:'structure',Sensor:'sensors',Measurement:'sensors',EnergyReading:'energy',Alert:'issues',ThresholdConfig:'sensors'}[entity];
  async function scopedStorage(connection,operation){
   const rows=(await connection.query(`SELECT b.id,b.user_id FROM app_buildings b WHERE b.user_id=$1 OR EXISTS(
    SELECT 1 FROM app_building_members m WHERE m.building_id=b.id AND m.user_id=$1 AND m.status='accepted')
    AND ($2::int IS NULL OR b.team_id=$2)`,[req.account.id,req.teamScope?.id??null])).rows;
   const buildingIDs=[],ownerIds=new Set([Number(req.account.id)]),ownerByBuilding={};
   for(const row of rows){
    const access=await buildingAccess(connection,Number(row.id),req.account.id);
    if(access){ownerIds.add(Number(row.user_id));if(can(access,module,operation)){buildingIDs.push(String(row.id));ownerByBuilding[String(row.id)]=Number(row.user_id);}}
   }
   return {buildingIDs,ownerIds:[...ownerIds],ownerByBuilding};
  }
  async function authorizeData(connection,data,operation){
   const buildingID=entity==='Building'?data?.id:data?.building_id;
   if(!buildingID){
    const [owned,membership]=await Promise.all([
     connection.query('SELECT 1 FROM app_buildings WHERE user_id=$1 LIMIT 1',[req.account.id]),
     connection.query("SELECT 1 FROM app_building_members WHERE user_id=$1 AND status='accepted' LIMIT 1",[req.account.id]),
    ]);
    if(membership.rows.length&&!owned.rows.length)fail('Diese Aktion braucht ein Gebäude, auf das du Zugriff hast.',403);
    return;
   }
   if(req.teamScope&&!req.teamScope.buildingIDs.includes(Number(buildingID)))fail('Gebäude nicht in diesem Team gefunden.',404);
   const access=await buildingAccess(connection,Number(buildingID),req.account.id);
   if(!access)fail('Gebäude nicht gefunden.',404);
   if(!can(access,module,operation))fail('Dafür hast du in diesem Gebäude keine Berechtigung.',403);
  }
  async function authorizeExisting(connection,id,operation,scope){
   if(entity==='Building')return authorizeData(connection,{id},operation);
   const row=(await connection.query('SELECT data FROM app_twin_records WHERE id=$1 AND user_id=ANY($2::int[]) AND entity=$3',[String(id),scope.ownerIds,entity])).rows[0];
   if(!row)fail('Datensatz nicht gefunden.',404);
   await authorizeData(connection,row.data,operation);
   return row.data;
  }
  async function authorizeReadResults(result){
   const rows=action==='list'?result:action==='filter'?result.items:[];
   if(action==='count'&&/^\d+$/.test(String(body.filter?.building_id??''))){
    const access=await buildingAccess(db,Number(body.filter.building_id),req.account.id);
    if(!access)fail('Gebäude nicht gefunden.',404);
    if(!can(access,module,'read'))fail('Dafür hast du in diesem Gebäude keine Berechtigung.',403);
    return result;
   }
   if(action==='count')return result;
   const permitted=[];
   for(const row of rows){try{await authorizeData(db,row,'read');permitted.push(row);}catch(error){if(error.status!==403&&error.status!==404)throw error;}}
   if(action==='list')return permitted;
   if(action==='filter')return {...result,items:permitted,has_more:result.has_more||false};
   return result;
  }
  async function authorizeMutation(connection,scope){
   if(action==='create')return authorizeData(connection,body.data,'edit');
   if(action==='bulkCreate'){
    if(!Array.isArray(body.data))fail('Datensätze erforderlich.');
    for(const row of body.data)await authorizeData(connection,row,'edit');return;
   }
   if(action==='update'||action==='delete'){
    const old=await authorizeExisting(connection,body.id,'edit',scope);
    if(action==='update'&&entity!=='Building'&&body.data&&Object.hasOwn(body.data,'building_id'))await authorizeData(connection,{...old,...body.data},'edit');
    return;
   }
   if(action==='bulkUpdate'){
    if(!Array.isArray(body.data))fail('Datensätze erforderlich.');
    for(const row of body.data){
     const old=await authorizeExisting(connection,row.id,'edit',scope);
     if(entity!=='Building'&&Object.hasOwn(row,'building_id'))await authorizeData(connection,{...old,...row},'edit');
    }
    return;
   }
   if(action==='deleteMany'){
    const rows=await service(connection,req.account.id,scope).entities[entity].filter(body.filter,{limit:500});
    if(rows.has_more)fail('Bitte lösche höchstens 500 Datensätze pro Anfrage.',413);
    for(const row of rows.items)await authorizeExisting(connection,row.id,'edit',scope);
   }
  }
  const execute=async (client,scope)=>{
   const api=service(client,req.account.id,scope).entities[entity];
   if(action==='list')return api.list(body.sort,body.limit);
   if(action==='filter')return api.filter(body.filter,body.options);
   if(action==='count')return api.count(body.filter);
   if(action==='create')return api.create(body.data);
   if(action==='update')return api.update(String(body.id),body.data);
   if(action==='delete')return api.delete(String(body.id));
   if(action==='bulkCreate'||action==='bulkUpdate')return api[action](body.data);
   return api.deleteMany(body.filter);
  };
  if(read){const scope=await scopedStorage(db,'read'),result=await execute(db,scope);res.json(await authorizeReadResults(result));return;}
  res.json(await transaction(db,req.account.id,async client=>{const scope=await scopedStorage(client,'edit');await authorizeMutation(client,scope);return execute(client,scope);}));
 }));
 router.post('/twin-functions/:name',wrap(async(req,res)=>{
  if(!['seedDemoData','runThresholdCheck'].includes(req.params.name))fail('Unbekannte Funktion.',404);
  const members=(await db.query("SELECT 1 FROM app_building_members WHERE user_id=$1 AND status='accepted' LIMIT 1",[req.account.id])).rows;
  const owned=(await db.query('SELECT 1 FROM app_buildings WHERE user_id=$1 LIMIT 1',[req.account.id])).rows;
  if(members.length&&!owned.length)fail('Diese kontoübergreifende Funktion steht für Gebäudemitglieder nicht zur Verfügung.',403);
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

