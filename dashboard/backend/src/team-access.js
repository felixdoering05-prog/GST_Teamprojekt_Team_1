const express=require('express');
const {randomUUID}=require('node:crypto');
const {MODULES,buildingAccess,ensureBuildingRoles,can}=require('./team-permissions');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const idOK=v=>/^[1-9]\d{0,9}$/.test(String(v))&&Number(v)<=2147483647;
const fail=(res,status,error)=>res.status(status).json({error});
const LEVELS=new Set(['none','read','edit']);
function cleanPermissions(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!MODULES.includes(key)))return null;
 const out=Object.fromEntries(MODULES.map(key=>[key,input[key]??'none']));
 if(Object.values(out).some(value=>!LEVELS.has(value)))return null;
 return out;
}
async function accessible(db,req,res){
 const id=req.params.buildingId;
 if(!idOK(id)){fail(res,400,'Ungültiges Gebäude.');return null;}
 await ensureBuildingRoles(db,Number(id));
 const access=await buildingAccess(db,Number(id),req.account.id);
 if(!access){fail(res,404,'Gebäude nicht gefunden.');return null;}
 return access;
}
async function roleRows(db,buildingID){return (await db.query(`SELECT id,role_key,name,sort_order,permissions,can_manage_members,is_system
 FROM app_building_roles WHERE building_id=$1 ORDER BY sort_order,id`,[buildingID])).rows;}
async function mayManageTarget(db,access,buildingID,targetID){
 if(access.is_owner)return true;
 if(!access.role?.can_manage_members)return false;
 const target=(await db.query(`SELECT r.sort_order FROM app_building_members m JOIN app_building_roles r ON r.id=m.role_id
  WHERE m.building_id=$1 AND m.user_id=$2`,[buildingID,targetID])).rows[0];
 return !!target&&Number(target.sort_order)>Number(access.role.sort_order);
}
function teamAccessRouter(db,requireAccount){
 const r=express.Router();
 r.get('/buildings/:buildingId/team-access',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  const [roles,members]=await Promise.all([
   roleRows(db,Number(req.params.buildingId)),
   db.query(`SELECT u.id,u.name,m.status,m.role_id,r.name AS role_name,r.role_key,r.sort_order
    FROM app_building_members m JOIN app_users u ON u.id=m.user_id JOIN app_building_roles r ON r.id=m.role_id
    WHERE m.building_id=$1
    UNION ALL SELECT u.id,u.name,'owner',NULL,'Eigentümer','owner',-1 FROM app_buildings b JOIN app_users u ON u.id=b.user_id WHERE b.id=$1
    ORDER BY sort_order,id`,[req.params.buildingId]),
  ]);
  res.set('Cache-Control','private, no-store').json({building_id:Number(req.params.buildingId),is_owner:access.is_owner,
   actor_role:access.role||{role_key:'owner',name:'Eigentümer',sort_order:-1},can_manage_members:access.is_owner||!!access.role?.can_manage_members,
   can_manage_roles:access.is_owner,roles:(access.is_owner||access.role?.can_manage_members)?roles:roles.map(({id,role_key,name,sort_order,is_system})=>({id,role_key,name,sort_order,is_system})),members:members.rows});
 }));
 r.post('/buildings/:buildingId/team-access/members',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!access.is_owner&&!access.role?.can_manage_members)return fail(res,403,'Du darfst dieses Team nicht verwalten.');
  const target=Number(req.body?.user_id),roleID=Number(req.body?.role_id);
  if(!idOK(target)||target===req.account.id||!idOK(roleID))return fail(res,400,'Bitte Person und Rolle auswählen.');
  const buildingID=Number(req.params.buildingId);
  const buildingOwner=(await db.query('SELECT user_id FROM app_buildings WHERE id=$1',[buildingID])).rows[0]?.user_id;
  if(Number(buildingOwner)===target)return fail(res,400,'Der Gebäudeeigentümer ist bereits Teil dieses Teams.');
  const chosen=(await db.query('SELECT id,sort_order FROM app_building_roles WHERE id=$1 AND building_id=$2',[roleID,buildingID])).rows[0];
  if(!chosen)return fail(res,400,'Diese Rolle gehört nicht zu diesem Gebäude.');
  if(!access.is_owner&&Number(chosen.sort_order)<=Number(access.role.sort_order))return fail(res,403,'Du kannst nur eine niedrigere Rolle vergeben.');
  const contact=(await db.query("SELECT id FROM app_contacts WHERE low_id=$1 AND high_id=$2 AND status='accepted'",[Math.min(target,req.account.id),Math.max(target,req.account.id)])).rows[0];
  if(!contact)return fail(res,400,'Bitte zuerst die Kontaktanfrage bestätigen lassen.');
  const existing=(await db.query('SELECT status FROM app_building_members WHERE building_id=$1 AND user_id=$2',[buildingID,target])).rows[0];
  if(existing)return fail(res,409,'Diese Person ist bereits eingeladen oder Mitglied.');
  if(Number((await db.query('SELECT COUNT(*) AS count FROM app_building_members WHERE building_id=$1',[buildingID])).rows[0].count)>=50)return fail(res,400,'Maximal 50 Mitglieder pro Gebäude.');
  await db.query('INSERT INTO app_building_members(building_id,user_id,status,role_id) VALUES($1,$2,\'pending\',$3)',[buildingID,target,roleID]);
  const b=(await db.query('SELECT name FROM app_buildings WHERE id=$1',[buildingID])).rows[0];
  await db.query('INSERT INTO app_notifications(user_id,kind,title,building_id) VALUES($1,\'invitation\',$2,$3)',[target,`${String(req.account.name).split(' ')[0]} lädt dich zu „${b.name}“ ein.`,buildingID]);
  res.status(201).json({ok:true});
 }));
 r.patch('/buildings/:buildingId/team-access/members/:memberId/role',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  const buildingID=Number(req.params.buildingId),targetID=Number(req.params.memberId),roleID=Number(req.body?.role_id);
  if(!idOK(targetID)||!idOK(roleID))return fail(res,400,'Ungültige Person oder Rolle.');
  if(!await mayManageTarget(db,access,buildingID,targetID))return fail(res,403,'Du kannst nur Personen mit einer niedrigeren Rolle verwalten.');
  const chosen=(await db.query('SELECT id,sort_order FROM app_building_roles WHERE id=$1 AND building_id=$2',[roleID,buildingID])).rows[0];
  if(!chosen)return fail(res,400,'Diese Rolle gehört nicht zu diesem Gebäude.');
  if(!access.is_owner&&Number(chosen.sort_order)<=Number(access.role.sort_order))return fail(res,403,'Du kannst nur eine niedrigere Rolle vergeben.');
  const updated=await db.query("UPDATE app_building_members SET role_id=$3 WHERE building_id=$1 AND user_id=$2 AND status IN ('pending','accepted') RETURNING user_id",[buildingID,targetID,roleID]);
  if(!updated.rowCount)return fail(res,404,'Teammitglied nicht gefunden.');
  res.json({ok:true});
 }));
 r.delete('/buildings/:buildingId/team-access/members/:memberId',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  const buildingID=Number(req.params.buildingId),targetID=Number(req.params.memberId);
  if(!idOK(targetID)||!await mayManageTarget(db,access,buildingID,targetID))return fail(res,403,'Du kannst nur Personen mit einer niedrigeren Rolle verwalten.');
  await db.query('DELETE FROM app_building_members WHERE building_id=$1 AND user_id=$2',[buildingID,targetID]);
  await db.query('DELETE FROM app_notifications WHERE building_id=$1 AND user_id=$2',[buildingID,targetID]);
  res.json({ok:true});
 }));
 r.post('/buildings/:buildingId/team-access/roles',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!access.is_owner)return fail(res,403,'Nur der Gebäudeeigentümer kann Rollen erstellen.');
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  const permissions=cleanPermissions(req.body?.permissions),canManageMembers=req.body?.can_manage_members===true;
  if(!name||name.length>80||!permissions||typeof req.body?.can_manage_members!=='boolean')return fail(res,400,'Bitte Rollenname und gültige Funktionsrechte angeben.');
  const buildingID=Number(req.params.buildingId);
  const next=Number((await db.query('SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM app_building_roles WHERE building_id=$1',[buildingID])).rows[0].next);
  const role=(await db.query(`INSERT INTO app_building_roles(building_id,role_key,name,sort_order,permissions,can_manage_members,is_system)
    VALUES($1,$2,$3,$4,$5,$6,false) RETURNING id,role_key,name,sort_order,permissions,can_manage_members,is_system`,[buildingID,`custom-${randomUUID()}`,name,next,JSON.stringify(permissions),canManageMembers])).rows[0];
  res.status(201).json(role);
 }));
 r.patch('/buildings/:buildingId/team-access/roles/order',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!access.is_owner)return fail(res,403,'Nur der Gebäudeeigentümer kann die Rangfolge ändern.');
  const buildingID=Number(req.params.buildingId),ids=req.body?.role_ids;
  const roles=await roleRows(db,buildingID);
  if(!Array.isArray(ids)||ids.length!==roles.length||new Set(ids.map(Number)).size!==roles.length||ids.some(id=>!roles.some(role=>Number(role.id)===Number(id))))return fail(res,400,'Die vollständige Rollenreihenfolge angeben.');
  const client=await db.connect();
  try{await client.query('BEGIN');
   // Move to a temporary range first so UNIQUE(building_id,sort_order) remains valid.
   await client.query('UPDATE app_building_roles SET sort_order=sort_order+1000000 WHERE building_id=$1',[buildingID]);
   for(let i=0;i<ids.length;i++)await client.query('UPDATE app_building_roles SET sort_order=$3 WHERE building_id=$1 AND id=$2',[buildingID,Number(ids[i]),i]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  res.json({ok:true,roles:await roleRows(db,buildingID)});
 }));
 r.patch('/buildings/:buildingId/team-access/roles/:roleId',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!access.is_owner)return fail(res,403,'Nur der Gebäudeeigentümer kann Rollen bearbeiten.');
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  const permissions=cleanPermissions(req.body?.permissions);
  if(!name||name.length>80||!permissions||typeof req.body?.can_manage_members!=='boolean')return fail(res,400,'Bitte Rollenname und gültige Funktionsrechte angeben.');
  const updated=await db.query(`UPDATE app_building_roles SET name=$3,permissions=$4,can_manage_members=$5 WHERE building_id=$1 AND id=$2
   RETURNING id,role_key,name,sort_order,permissions,can_manage_members,is_system`,[req.params.buildingId,req.params.roleId,name,JSON.stringify(permissions),req.body.can_manage_members]);
  if(!updated.rowCount)return fail(res,404,'Rolle nicht gefunden.');
  res.json(updated.rows[0]);
 }));
 r.delete('/buildings/:buildingId/team-access/roles/:roleId',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!access.is_owner)return fail(res,403,'Nur der Gebäudeeigentümer kann Rollen löschen.');
  const buildingID=Number(req.params.buildingId),roleID=Number(req.params.roleId);
  const role=(await db.query('SELECT is_system FROM app_building_roles WHERE building_id=$1 AND id=$2',[buildingID,roleID])).rows[0];
  if(!role)return fail(res,404,'Rolle nicht gefunden.');
  if(role.is_system)return fail(res,400,'Die drei Standardrollen können nicht gelöscht werden.');
  if(Number((await db.query('SELECT COUNT(*) AS n FROM app_building_members WHERE building_id=$1 AND role_id=$2',[buildingID,roleID])).rows[0].n))return fail(res,409,'Ordne zuerst alle Mitglieder einer anderen Rolle zu.');
  await db.query('DELETE FROM app_building_roles WHERE building_id=$1 AND id=$2',[buildingID,roleID]);
  res.json({ok:true});
 }));
 return r;
}

async function initBuildingSchedules(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_building_schedules(
  id SERIAL PRIMARY KEY,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),details TEXT NOT NULL DEFAULT '' CHECK(length(details)<=2000),
  starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ,created_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(ends_at IS NULL OR ends_at>=starts_at))`);
 await db.query(`ALTER TABLE app_building_schedules ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'appointment',ADD COLUMN IF NOT EXISTS interval_days INTEGER,ADD COLUMN IF NOT EXISTS reminder_days INTEGER,ADD COLUMN IF NOT EXISTS room_id INTEGER,ADD COLUMN IF NOT EXISTS sensor_id INTEGER`);
 await db.query('CREATE INDEX IF NOT EXISTS app_building_schedules_scope_idx ON app_building_schedules(building_id,starts_at,id)');
}
function scheduleRouter(db,requireAccount){
 const r=express.Router();
 r.get('/buildings/:buildingId/schedules',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!can(access,'schedule','read'))return fail(res,403,'Du darfst Zeitpläne in diesem Gebäude nicht einsehen.');
  const rows=(await db.query(`SELECT s.id,s.building_id,s.title,s.details,s.starts_at,s.ends_at,s.kind,s.interval_days,s.reminder_days,s.room_id,s.sensor_id,COALESCE(room.data->>'name',room.data->>'room_code') AS room_name,sensor.data->>'name' AS sensor_name,s.created_at,s.updated_at,u.name AS created_by_name FROM app_building_schedules s LEFT JOIN app_users u ON u.id=s.created_by LEFT JOIN app_twin_records room ON room.id=s.room_id AND room.entity='Room' LEFT JOIN app_twin_records sensor ON sensor.id=s.sensor_id AND sensor.entity='Sensor' WHERE s.building_id=$1 ORDER BY s.starts_at,s.id LIMIT 500`,[req.params.buildingId])).rows;
  const rooms=(await db.query(`SELECT id,COALESCE(data->>'name',data->>'room_code','Raum') AS name FROM app_twin_records WHERE user_id=$2 AND entity='Room' AND data->>'building_id'=$1 AND data->>'source' IS DISTINCT FROM 'demo' ORDER BY name,id LIMIT 500`,[String(req.params.buildingId),access.owner_id])).rows;
  const sensors=(await db.query(`SELECT id,COALESCE(data->>'name',data->>'sensor_code','Sensor') AS name FROM app_twin_records WHERE user_id=$2 AND entity='Sensor' AND data->>'building_id'=$1 AND data->>'source' IS DISTINCT FROM 'demo' ORDER BY name,id LIMIT 500`,[String(req.params.buildingId),access.owner_id])).rows;
  res.set('Cache-Control','private, no-store').json({items:rows,rooms,sensors,can_edit:can(access,'schedule','edit')});
 }));
 r.post('/buildings/:buildingId/schedules',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!can(access,'schedule','edit'))return fail(res,403,'Du darfst Zeitpläne in diesem Gebäude nicht bearbeiten.');
  if(Object.keys(req.body||{}).some(key=>!['title','details','starts_at','ends_at','kind','interval_days','reminder_days','room_id','sensor_id'].includes(key)))return fail(res,400,'Bitte Titel, Zeitraum und Wartungsangaben prüfen.');
  const title=typeof req.body?.title==='string'?req.body.title.trim():'';
  const details=typeof req.body?.details==='string'?req.body.details.trim():'';
  const starts=new Date(req.body?.starts_at),ends=req.body?.ends_at?new Date(req.body.ends_at):null;
  const kind=req.body?.kind??'appointment',interval=req.body?.interval_days??null,reminder=req.body?.reminder_days??null,room=req.body?.room_id??null,sensor=req.body?.sensor_id??null;
  if(!title||title.length>120||details.length>2000||!['appointment','maintenance'].includes(kind)||!Number.isFinite(starts.getTime())||(ends&&!Number.isFinite(ends.getTime()))||(ends&&ends<starts)||(interval!==null&&(!Number.isInteger(interval)||interval<1||interval>3650))||(reminder!==null&&(!Number.isInteger(reminder)||reminder<0||reminder>365))||(kind==='appointment'&&(interval!==null||reminder!==null||room!==null||sensor!==null)))return fail(res,400,'Bitte Titel, Zeitraum und gültige Wartungsangaben prüfen.');
  for(const [entity,id] of [['Room',room],['Sensor',sensor]])if(id!==null){if(!Number.isInteger(Number(id))||Number(id)<1||!(await db.query(`SELECT 1 FROM app_twin_records WHERE id=$1 AND user_id=$2 AND entity=$3 AND data->>'building_id'=$4 AND data->>'source' IS DISTINCT FROM 'demo'`,[Number(id),access.owner_id,entity,String(req.params.buildingId)])).rows.length)return fail(res,400,`${entity==='Room'?'Raum':'Sensor'} gehört nicht zu diesem Gebäude.`);}
  const row=(await db.query(`INSERT INTO app_building_schedules(building_id,title,details,starts_at,ends_at,kind,interval_days,reminder_days,room_id,sensor_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id,building_id,title,details,starts_at,ends_at,kind,interval_days,reminder_days,room_id,sensor_id,created_at,updated_at`,[req.params.buildingId,title,details,starts,ends,kind,interval,reminder,room,sensor,req.account.id])).rows[0];
  res.status(201).json(row);
 }));
 r.patch('/buildings/:buildingId/schedules/:scheduleId',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!can(access,'schedule','edit'))return fail(res,403,'Du darfst Zeitpläne in diesem Gebäude nicht bearbeiten.');
  const title=typeof req.body?.title==='string'?req.body.title.trim():'';
  const details=typeof req.body?.details==='string'?req.body.details.trim():'';
  const starts=new Date(req.body?.starts_at),ends=req.body?.ends_at?new Date(req.body.ends_at):null;
  const kind=req.body?.kind??'appointment',interval=req.body?.interval_days??null,reminder=req.body?.reminder_days??null,room=req.body?.room_id??null,sensor=req.body?.sensor_id??null;
  if(Object.keys(req.body||{}).some(key=>!['title','details','starts_at','ends_at','kind','interval_days','reminder_days','room_id','sensor_id'].includes(key))||!idOK(req.params.scheduleId)||!title||title.length>120||details.length>2000||!['appointment','maintenance'].includes(kind)||!Number.isFinite(starts.getTime())||(ends&&!Number.isFinite(ends.getTime()))||(ends&&ends<starts)||(interval!==null&&(!Number.isInteger(interval)||interval<1||interval>3650))||(reminder!==null&&(!Number.isInteger(reminder)||reminder<0||reminder>365))||(kind==='appointment'&&(interval!==null||reminder!==null||room!==null||sensor!==null)))return fail(res,400,'Bitte Titel, Zeitraum und gültige Wartungsangaben prüfen.');
  for(const [entity,id] of [['Room',room],['Sensor',sensor]])if(id!==null){if(!Number.isInteger(Number(id))||Number(id)<1||!(await db.query(`SELECT 1 FROM app_twin_records WHERE id=$1 AND user_id=$2 AND entity=$3 AND data->>'building_id'=$4 AND data->>'source' IS DISTINCT FROM 'demo'`,[Number(id),access.owner_id,entity,String(req.params.buildingId)])).rows.length)return fail(res,400,`${entity==='Room'?'Raum':'Sensor'} gehört nicht zu diesem Gebäude.`);}
  const row=(await db.query(`UPDATE app_building_schedules SET title=$3,details=$4,starts_at=$5,ends_at=$6,kind=$7,interval_days=$8,reminder_days=$9,room_id=$10,sensor_id=$11,updated_by=$12,updated_at=now() WHERE building_id=$1 AND id=$2 RETURNING id,building_id,title,details,starts_at,ends_at,kind,interval_days,reminder_days,room_id,sensor_id,created_at,updated_at`,[req.params.buildingId,req.params.scheduleId,title,details,starts,ends,kind,interval,reminder,room,sensor,req.account.id])).rows[0];
  if(!row)return fail(res,404,'Zeitplaneintrag nicht gefunden.');res.json(row);
 }));
 r.delete('/buildings/:buildingId/schedules/:scheduleId',requireAccount,wrap(async(req,res)=>{
  const access=await accessible(db,req,res);if(!access)return;
  if(!can(access,'schedule','edit'))return fail(res,403,'Du darfst Zeitpläne in diesem Gebäude nicht bearbeiten.');
  if(!idOK(req.params.scheduleId))return fail(res,400,'Ungültiger Zeitplaneintrag.');
  const removed=await db.query('DELETE FROM app_building_schedules WHERE building_id=$1 AND id=$2',[req.params.buildingId,req.params.scheduleId]);
  if(!removed.rowCount)return fail(res,404,'Zeitplaneintrag nicht gefunden.');res.json({ok:true});
 }));
 return r;
}
module.exports={teamAccessRouter,initBuildingSchedules,scheduleRouter};
