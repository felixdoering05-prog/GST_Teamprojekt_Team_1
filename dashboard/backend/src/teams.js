const {initAttachments, attachmentRoutes}=require('./scoped-attachments');
const express=require('express');
const {buildingAccess,can,ensureBuildingRoles}=require('./team-permissions');
const MAX_LOGO=2*1024*1024;
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const idOK=value=>/^[1-9]\d*$/.test(String(value||''))&&Number(value)<=2147483647;
const HEX=/^#[0-9a-f]{6}$/i;

async function initTeams(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_teams(
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  is_default BOOLEAN NOT NULL DEFAULT false,
  primary_color TEXT NOT NULL DEFAULT '#596b3d',
  accent_color TEXT NOT NULL DEFAULT '#cbd5a3',
  background_color TEXT,
  logo_type TEXT,
  logo BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK((logo IS NULL)=(logo_type IS NULL))
 )`);
 await db.query('ALTER TABLE app_teams ADD COLUMN IF NOT EXISTS background_color TEXT');
 await db.query(`CREATE TABLE IF NOT EXISTS app_team_titles(id SERIAL PRIMARY KEY,team_id INTEGER NOT NULL REFERENCES app_teams(id) ON DELETE CASCADE,name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),UNIQUE(team_id,name))`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_team_member_titles(team_id INTEGER NOT NULL REFERENCES app_teams(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,title_id INTEGER NOT NULL REFERENCES app_team_titles(id) ON DELETE CASCADE,PRIMARY KEY(team_id,user_id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_user_contact_profiles(user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',share_with_team BOOLEAN NOT NULL DEFAULT false,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query('CREATE UNIQUE INDEX IF NOT EXISTS app_teams_default_owner_idx ON app_teams(owner_id) WHERE is_default=true');
 await db.query('ALTER TABLE app_buildings ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES app_teams(id) ON DELETE SET NULL');
 await db.query('CREATE INDEX IF NOT EXISTS app_buildings_team_idx ON app_buildings(team_id,id)');
 await db.query(`CREATE TABLE IF NOT EXISTS app_building_groups(
  id SERIAL PRIMARY KEY,team_id INTEGER NOT NULL REFERENCES app_teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),created_by INTEGER NOT NULL REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(team_id,name))`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_building_group_items(
  group_id INTEGER NOT NULL REFERENCES app_building_groups(id) ON DELETE CASCADE,
  building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id,building_id))`);
 await initAttachments(db,'group');
 const owners=(await db.query('SELECT DISTINCT user_id FROM app_buildings WHERE team_id IS NULL')).rows;
 for(const row of owners){
  const team=await ensureDefaultTeam(db,Number(row.user_id));
  await db.query('UPDATE app_buildings SET team_id=$2 WHERE user_id=$1 AND team_id IS NULL',[row.user_id,team.id]);
 }
}

async function ensureDefaultTeam(db,userID){
 await db.query(`INSERT INTO app_teams(owner_id,name,is_default)
  VALUES($1,'Mein Team',true) ON CONFLICT(owner_id) WHERE is_default=true DO NOTHING`,[userID]);
 const team=(await db.query('SELECT id,owner_id,name,is_default,primary_color,accent_color,(logo IS NOT NULL) has_logo FROM app_teams WHERE owner_id=$1 AND is_default=true',[userID])).rows[0];
 if(team)await db.query('UPDATE app_buildings SET team_id=$2 WHERE user_id=$1 AND team_id IS NULL',[userID,team.id]);
 return team;
}

async function accessibleTeam(db,teamID,userID){
 const team=(await db.query(`SELECT t.id,t.owner_id,t.name,t.is_default,t.primary_color,t.accent_color,t.background_color,(t.logo IS NOT NULL) has_logo,u.name AS leader_name
  FROM app_teams t JOIN app_users u ON u.id=t.owner_id WHERE t.id=$1`,[teamID])).rows[0];
 if(!team)return null;
 const isOwner=Number(team.owner_id)===Number(userID);
 const buildings=(await db.query(`SELECT b.id,b.name,b.address,b.user_id AS owner_id,b.team_id,
   (b.user_id=$2) AS is_owner
  FROM app_buildings b WHERE b.team_id=$1 AND (b.user_id=$2 OR EXISTS(
   SELECT 1 FROM app_building_members m WHERE m.building_id=b.id AND m.user_id=$2 AND m.status='accepted')) ORDER BY b.id`,[teamID,userID])).rows;
 if(!isOwner&&!buildings.length)return null;
 let canManageGroups=isOwner;
 if(!isOwner&&buildings.length){for(const b of buildings){const access=await buildingAccess(db,b.id,userID);if(access?.role?.can_manage_members){canManageGroups=true;break;}}}
 return {...team,id:Number(team.id),owner_id:Number(team.owner_id),is_owner:isOwner,can_manage:isOwner,can_manage_groups:canManageGroups,buildings};
}

function teamScopeMiddleware(db){
 return async(req,res,next)=>{
  try{
   const path=req.path.split('/').filter(Boolean);
   if(path[0]==='teams'||path[0]==='auth'){req.teamScope=null;return next();}
   const raw=req.get('X-D21-Team');
   if(!raw){req.teamScope=null;return next();}
   if(!idOK(raw))return res.status(400).json({error:'Ungültige Team-Auswahl.'});
   const team=await accessibleTeam(db,Number(raw),req.account.id);
   if(!team)return res.status(404).json({error:'Team nicht gefunden.'});
   req.teamScope={id:team.id,owner_id:team.owner_id,is_owner:team.is_owner,is_default:team.is_default,buildingIDs:team.buildings.map(row=>Number(row.id))};
   const buildingFilter = req.get('X-D21-Buildings');
   if (buildingFilter) {
    if (buildingFilter !== 'none' && !/^[1-9]\d{0,9}(,[1-9]\d{0,9})*$/.test(buildingFilter)) {
     return res.status(400).json({error:'Ungültige Gebäude-Auswahl.'});
    }
    const selected = new Set(buildingFilter.split(',').map(Number));
    req.teamScope.buildingIDs = req.teamScope.buildingIDs.filter(id => selected.has(id));
    req.teamScope.hasBuildingFilter = true;
   }
   next();
  }catch(error){next(error);}
 };
}

function teamsRouter(db,requireAccount){
 const r=express.Router();
 const teamID=req=>idOK(req.params.teamID)?Number(req.params.teamID):null;
 const currentTeam=async(req,res)=>{
  const id=teamID(req);if(!id){res.status(400).json({error:'Ungültige Team-ID.'});return null;}
  const team=await accessibleTeam(db,id,req.account.id);
  if(!team){res.status(404).json({error:'Team nicht gefunden.'});return null;}
  return team;
 };
 r.get('/teams',requireAccount,wrap(async(req,res)=>{
  await ensureDefaultTeam(db,req.account.id);
  const rows=(await db.query(`SELECT t.id FROM app_teams t WHERE t.owner_id=$1 OR EXISTS(
    SELECT 1 FROM app_buildings b WHERE b.team_id=t.id AND (b.user_id=$1 OR EXISTS(
      SELECT 1 FROM app_building_members m WHERE m.building_id=b.id AND m.user_id=$1 AND m.status='accepted')))
    ORDER BY t.is_default DESC,t.id`,[req.account.id])).rows;
  const teams=[];for(const row of rows){const team=await accessibleTeam(db,Number(row.id),req.account.id);if(team)teams.push(team);}
  res.json(teams);
 }));
 r.get('/teams/:teamID/building-navigation',requireAccount,wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  const ids=team.buildings.map(building=>Number(building.id));
  const contents=(await db.query(`SELECT b.id,
    EXISTS(SELECT 1 FROM app_twin_records t WHERE t.entity='Sensor' AND t.data->>'building_id'=b.id::text) AS sensors,
    EXISTS(SELECT 1 FROM app_twin_records t WHERE t.entity='EnergyReading' AND t.data->>'building_id'=b.id::text) AS energy,
    EXISTS(SELECT 1 FROM app_technical_assets a WHERE a.building_id=b.id) AS assets,
    EXISTS(SELECT 1 FROM app_maintenance m WHERE m.building_id=b.id) AS maintenance,
    EXISTS(SELECT 1 FROM app_building_issues i WHERE i.building_id=b.id) AS issues,
    EXISTS(SELECT 1 FROM app_twin_records t WHERE t.entity='Alert' AND t.data->>'building_id'=b.id::text) AS alerts,
    EXISTS(SELECT 1 FROM app_building_schedules s WHERE s.building_id=b.id) AS schedule
    FROM app_buildings b WHERE b.id=ANY($1::int[])`,[ids])).rows;
  const rows=await Promise.all(contents.map(async({id,...content})=>{
   const access=await buildingAccess(db,id,req.account.id);
   if(!access)return null;
   for(const category of Object.keys(content)){
    const module=category==='alerts'?'issues':category==='assets'?'maintenance':category;
    content[category]=can(access,module,'read')&&content[category];
   }
   return {id,content,is_owner:access.is_owner,permissions:access.role?.permissions||{}};
  }));
  res.set('Cache-Control','private, no-store').json(rows.filter(Boolean));
 }));
 r.post('/teams',requireAccount,wrap(async(req,res)=>{
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  if(!name||name.length>80)return res.status(400).json({error:'Teamname erforderlich (maximal 80 Zeichen).'});
  await ensureDefaultTeam(db,req.account.id);
  const row=(await db.query('INSERT INTO app_teams(owner_id,name) VALUES($1,$2) RETURNING id',[req.account.id,name])).rows[0];
  res.status(201).json(await accessibleTeam(db,Number(row.id),req.account.id));
 }));
 r.get('/teams/:teamID/logo',requireAccount,wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  const row=(await db.query('SELECT logo,logo_type FROM app_teams WHERE id=$1',[team.id])).rows[0];
  if(!row?.logo)return res.status(404).json({error:'Für dieses Team ist kein Logo hinterlegt.'});
  res.set('Content-Type',row.logo_type).set('Cache-Control','private, no-store').send(Buffer.from(row.logo));
 }));
 r.put('/teams/:teamID/logo',requireAccount,express.raw({type:'image/*',limit:MAX_LOGO}),wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann das Logo ändern.'});
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Bitte ein Logo auswählen.'});
  const mime=req.get('Content-Type')?.split(';')[0].toLowerCase();const bytes=req.body;
  const valid=mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
   ||mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
   ||mime==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)return res.status(415).json({error:'Erlaubt sind echte PNG-, JPEG- oder WebP-Bilder bis 2 MB.'});
  await db.query('UPDATE app_teams SET logo=$2,logo_type=$3,updated_at=now() WHERE id=$1',[team.id,bytes,mime]);
  res.json({ok:true,has_logo:true});
 }));
 r.delete('/teams/:teamID/logo',requireAccount,wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann das Logo ändern.'});
  await db.query('UPDATE app_teams SET logo=NULL,logo_type=NULL,updated_at=now() WHERE id=$1',[team.id]);res.json({ok:true,has_logo:false});
 }));
 r.patch('/teams/:teamID',requireAccount,wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann Teamname und Design ändern.'});
  const body=req.body||{};if(Object.keys(body).some(key=>!['name','primary_color','accent_color','background_color'].includes(key)))return res.status(400).json({error:'Ungültige Teameinstellung.'});
  const name=body.name===undefined?team.name:typeof body.name==='string'?body.name.trim():'';
  const primary=body.primary_color===undefined?team.primary_color:body.primary_color;
  const accent=body.accent_color===undefined?team.accent_color:body.accent_color;
  const background=body.background_color===undefined?team.background_color:body.background_color;
  if(!name||name.length>80||!HEX.test(primary)||!HEX.test(accent)||(background!==null&&background!==''&&!HEX.test(background)))return res.status(400).json({error:'Teamname, gültige Haupt-/Akzentfarbe und optionale Hintergrundfarbe angeben.'});
  await db.query('UPDATE app_teams SET name=$2,primary_color=$3,accent_color=$4,background_color=$5,updated_at=now() WHERE id=$1',[team.id,name,primary,accent,background||null]);
  res.json(await accessibleTeam(db,team.id,req.account.id));
 }));
 r.get('/teams/:teamID/members',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;const rows=(await db.query(`SELECT u.id,u.name,CASE WHEN EXISTS(SELECT 1 FROM app_teams t WHERE t.id=$1 AND t.owner_id=u.id) THEN 'Leitung' ELSE COALESCE(string_agg(DISTINCT r.name,', '),'Employee') END AS role,mt.name AS title,CASE WHEN bool_or(m.status='accepted') THEN 'accepted' ELSE 'pending' END AS status FROM app_users u JOIN app_building_members m ON m.user_id=u.id JOIN app_buildings b ON b.id=m.building_id LEFT JOIN app_building_roles r ON r.id=m.role_id LEFT JOIN app_team_member_titles x ON x.team_id=$1 AND x.user_id=u.id LEFT JOIN app_team_titles mt ON mt.id=x.title_id WHERE b.team_id=$1 AND m.status IN ('accepted','pending') GROUP BY u.id,u.name,mt.name UNION SELECT u.id,u.name,'Leitung',mt.name,'accepted' FROM app_users u JOIN app_teams t ON t.owner_id=u.id AND t.id=$1 LEFT JOIN app_team_member_titles x ON x.team_id=t.id AND x.user_id=u.id LEFT JOIN app_team_titles mt ON mt.id=x.title_id ORDER BY name,id`,[team.id])).rows;res.json(rows);}));
 r.get('/teams/:teamID/titles',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;res.json((await db.query('SELECT id,name FROM app_team_titles WHERE team_id=$1 ORDER BY name',[team.id])).rows);}));
 r.post('/teams/:teamID/titles',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann Titel verwalten.'});const name=typeof req.body?.name==='string'?req.body.name.trim():'';if(!name||name.length>60)return res.status(400).json({error:'Bitte einen Titel mit höchstens 60 Zeichen eingeben.'});const row=(await db.query('INSERT INTO app_team_titles(team_id,name) VALUES($1,$2) ON CONFLICT(team_id,name) DO NOTHING RETURNING id,name',[team.id,name])).rows[0];if(!row)return res.status(409).json({error:'Dieser Titel existiert bereits.'});res.status(201).json(row);}));
 r.delete('/teams/:teamID/titles/:titleID',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann Titel entfernen.'});if(!idOK(req.params.titleID))return res.status(400).json({error:'Ungültiger Titel.'});const result=await db.query('DELETE FROM app_team_titles WHERE id=$1 AND team_id=$2 RETURNING id',[req.params.titleID,team.id]);if(!result.rowCount)return res.status(404).json({error:'Titel nicht gefunden.'});res.json({ok:true});}));
 r.put('/teams/:teamID/members/:userID/title',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann Titel zuweisen.'});const user=Number(req.params.userID),title=req.body?.title_id?Number(req.body.title_id):null;if(!idOK(user)||(title&&!idOK(title)))return res.status(400).json({error:'Ungültige Auswahl.'});if(title){const valid=(await db.query(`SELECT 1 FROM app_team_titles WHERE id=$1 AND team_id=$2 AND EXISTS(SELECT 1 FROM app_building_members m JOIN app_buildings b ON b.id=m.building_id WHERE m.user_id=$3 AND b.team_id=$2 AND m.status='accepted')`,[title,team.id,user])).rows[0];if(!valid)return res.status(400).json({error:'Titel oder Teammitglied nicht gefunden.'});await db.query('INSERT INTO app_team_member_titles(team_id,user_id,title_id) VALUES($1,$2,$3) ON CONFLICT(team_id,user_id) DO UPDATE SET title_id=EXCLUDED.title_id',[team.id,user,title]);}else await db.query('DELETE FROM app_team_member_titles WHERE team_id=$1 AND user_id=$2',[team.id,user]);res.json({ok:true});}));
 r.delete('/teams/:teamID',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann ein Team entfernen.'});const client=await db.connect();try{await client.query('BEGIN');await ensureDefaultTeam(client,req.account.id);await client.query('UPDATE app_buildings SET team_id=NULL WHERE team_id=$1 AND user_id=$2',[team.id,req.account.id]);const result=await client.query('DELETE FROM app_teams WHERE id=$1 AND owner_id=$2 RETURNING id',[team.id,req.account.id]);if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Team nicht gefunden.'});}await ensureDefaultTeam(client,req.account.id);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}res.json({ok:true});}));
 r.get('/profile/team-contact',requireAccount,wrap(async(req,res)=>{const row=(await db.query('SELECT phone,email,share_with_team FROM app_user_contact_profiles WHERE user_id=$1',[req.account.id])).rows[0];res.set('Cache-Control','private, no-store').json(row||{phone:'',email:'',share_with_team:false});}));
 r.patch('/profile/team-contact',requireAccount,wrap(async(req,res)=>{const body=req.body||{};if(Object.keys(body).some(key=>!['phone','email','share_with_team'].includes(key)))return res.status(400).json({error:'Ungültige Kontaktdaten.'});const phone=body.phone,email=body.email,share=body.share_with_team;if(typeof phone!=='string'||phone.length>40||/[\x00-\x1f]/.test(phone)||typeof email!=='string'||email.length>254||(email&&!/^\S+@\S+\.\S+$/.test(email))||typeof share!=='boolean')return res.status(400).json({error:'Telefonnummer, E-Mail und Freigabe prüfen.'});const row=(await db.query(`INSERT INTO app_user_contact_profiles(user_id,phone,email,share_with_team) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET phone=EXCLUDED.phone,email=EXCLUDED.email,share_with_team=EXCLUDED.share_with_team,updated_at=now() RETURNING phone,email,share_with_team`,[req.account.id,phone.trim(),email.trim(),share])).rows[0];res.set('Cache-Control','private, no-store').json(row);}));
 r.get('/teams/:teamID/members/:userID/contact',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;if(!idOK(req.params.userID))return res.status(400).json({error:'Ungültiges Mitglied.'});if(Number(req.params.userID)===Number(req.account.id)){const own=(await db.query('SELECT phone,email FROM app_user_contact_profiles WHERE user_id=$1',[req.account.id])).rows[0];return res.set('Cache-Control','private, no-store').json(own||{phone:'',email:''});}const member=(await db.query(`SELECT 1 FROM app_buildings b JOIN app_building_members m ON m.building_id=b.id WHERE b.team_id=$1 AND m.user_id=$2 AND m.status='accepted' LIMIT 1`,[team.id,req.params.userID])).rows[0];if(!member)return res.status(404).json({error:'Teammitglied nicht gefunden.'});const values=(await db.query('SELECT phone,email FROM app_user_contact_profiles WHERE user_id=$1 AND share_with_team=true',[req.params.userID])).rows[0];if(!values)return res.status(404).json({error:'Dieses Mitglied hat keine Kontaktdaten für das Team freigegeben.'});res.set('Cache-Control','private, no-store').json(values);}));
 r.put('/teams/:teamID/buildings/:buildingID',requireAccount,wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann Gebäude zuordnen.'});
  if(!idOK(req.params.buildingID))return res.status(400).json({error:'Ungültige Gebäude-ID.'});
  const result=await db.query('UPDATE app_buildings SET team_id=$3 WHERE id=$1 AND user_id=$2 RETURNING id,name,team_id',[Number(req.params.buildingID),req.account.id,team.id]);
  if(!result.rows.length)return res.status(404).json({error:'Eigenes Gebäude nicht gefunden.'});
  res.json(result.rows[0]);
 }));
 const groupManage=async(req,res,team,buildingIDs)=>{
  const allowed=new Set(team.buildings.map(b=>Number(b.id)));if(!buildingIDs?.length||buildingIDs.some(id=>!allowed.has(Number(id)))){res.status(403).json({error:'Die Gruppe darf nur Gebäude umfassen, auf die du Zugriff hast.'});return false;}
  for(const id of buildingIDs){const access=await buildingAccess(db,id,req.account.id);if(!access||(!access.is_owner&&!access.role?.can_manage_members)){res.status(403).json({error:'Für mindestens ein Gruppen-Gebäude fehlt die Mitgliederverwaltung.'});return false;}}
  return true;
 };
 attachmentRoutes(r,db,requireAccount,'group','/teams/:teamID/groups/:parentID/files',async(req,res,write)=>{
  const team=await currentTeam(req,res); if(!team)return false;
  const rows=(await db.query('SELECT i.building_id FROM app_building_groups g JOIN app_building_group_items i ON i.group_id=g.id WHERE g.id=$1 AND g.team_id=$2',[req.params.parentID,team.id])).rows;
  const ids=rows.map(row=>Number(row.building_id));
  if(!ids.length) return team.is_owner && (await db.query('SELECT id FROM app_building_groups WHERE id=$1 AND team_id=$2',[req.params.parentID,team.id])).rows.length>0;
  if(!ids.every(id=>team.buildings.some(b=>Number(b.id)===id)))return false;
  return !write || groupManage(req,res,team,ids);
 });
 const groupQuery=`SELECT g.id,g.team_id,g.name,g.created_at,COALESCE(json_agg(json_build_object('id',b.id,'name',b.name) ORDER BY b.name) FILTER(WHERE b.id IS NOT NULL),'[]') buildings
   FROM app_building_groups g LEFT JOIN app_building_group_items i ON i.group_id=g.id LEFT JOIN app_buildings b ON b.id=i.building_id WHERE g.team_id=$1 GROUP BY g.id ORDER BY g.name,g.id`;
 r.get('/teams/:teamID/groups',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;const allowed=new Set(team.buildings.map(b=>Number(b.id)));res.json((await db.query(groupQuery,[team.id])).rows.map(group=>({...group,partial:group.buildings.some(building=>!allowed.has(Number(building.id))),buildings:group.buildings.filter(building=>allowed.has(Number(building.id)))})));}));
 r.post('/teams/:teamID/groups',requireAccount,wrap(async(req,res)=>{
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';const ids=req.body?.building_ids;
  if(!name||name.length>80||!Array.isArray(ids)||!ids.length||new Set(ids.map(Number)).size!==ids.length)return res.status(400).json({error:'Name und mindestens ein Gebäude auswählen.'});
  const team=await currentTeam(req,res);if(!team)return;if(!await groupManage(req,res,team,ids.map(Number)))return;
  const allowed=new Set(team.buildings.map(b=>Number(b.id)));if(ids.some(id=>!idOK(id)||!allowed.has(Number(id))))return res.status(403).json({error:'Die Gruppe darf nur Gebäude umfassen, auf die du Zugriff hast.'});
  const client=await db.connect();try{await client.query('BEGIN');const g=(await client.query('INSERT INTO app_building_groups(team_id,name,created_by) VALUES($1,$2,$3) RETURNING id',[team.id,name,req.account.id])).rows[0];for(const id of ids)await client.query('INSERT INTO app_building_group_items(group_id,building_id) VALUES($1,$2)',[g.id,Number(id)]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'Dieser Gruppenname ist bereits vergeben.'});throw error;}finally{client.release();}
  res.status(201).json((await db.query(groupQuery,[team.id])).rows.find(g=>g.name===name));
 }));
 // Change a single membership without replacing concurrent changes to the group.
 const changeMembership=wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  const {groupID,buildingID}=req.params;
  if(!idOK(groupID)||!idOK(buildingID))return res.status(400).json({error:'Ungültige Zuordnung.'});
  const client=await db.connect();
  try {
   await client.query('BEGIN');
   const group=await client.query('SELECT id FROM app_building_groups WHERE team_id=$1 AND id=$2 FOR UPDATE',[team.id,groupID]);
   if(!group.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Gruppe nicht gefunden.'});}
   const current=(await client.query('SELECT building_id FROM app_building_group_items WHERE group_id=$1',[groupID])).rows.map(row=>Number(row.building_id));
   if(!current.length&&!team.is_owner){await client.query('ROLLBACK');return res.status(403).json({error:'Nur die Teamleitung kann eine leere Gruppe verwalten.'});}
   if(!await groupManage(req,res,team,[...new Set([...current,Number(buildingID)])])){await client.query('ROLLBACK');return;}
   if(req.method==='PUT')await client.query('INSERT INTO app_building_group_items(group_id,building_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[groupID,buildingID]);
   else await client.query('DELETE FROM app_building_group_items WHERE group_id=$1 AND building_id=$2',[groupID,buildingID]);
   await client.query('COMMIT');res.json({ok:true});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 });
 r.put('/teams/:teamID/groups/:groupID/buildings/:buildingID',requireAccount,changeMembership);
 r.delete('/teams/:teamID/groups/:groupID/buildings/:buildingID',requireAccount,changeMembership);
 r.patch('/teams/:teamID/groups/:groupID',requireAccount,wrap(async(req,res)=>{
  const groupID=Number(req.params.groupID),name=typeof req.body?.name==='string'?req.body.name.trim():'';const ids=req.body?.building_ids;
  if(idOK(groupID)&&name&&name.length<=80&&ids===undefined){
   const team=await currentTeam(req,res);if(!team)return;
   const group=(await db.query(groupQuery,[team.id])).rows.find(row=>Number(row.id)===groupID);
   if(!group)return res.status(404).json({error:'Gruppe nicht gefunden.'});
   if(group.buildings.length){if(!await groupManage(req,res,team,group.buildings.map(b=>Number(b.id))))return;}
   else if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann eine leere Gruppe umbenennen.'});
   await db.query('UPDATE app_building_groups SET name=$3,updated_at=now() WHERE id=$1 AND team_id=$2',[groupID,team.id,name]);
   return res.json({...group,name});
  }
  if(!idOK(groupID)||!name||name.length>80||!Array.isArray(ids)||!ids.length||new Set(ids.map(Number)).size!==ids.length)return res.status(400).json({error:'Gruppenname und mindestens ein Gebäude auswählen.'});
  const team=await currentTeam(req,res);if(!team)return;
  const exists=(await db.query('SELECT id FROM app_building_groups WHERE id=$1 AND team_id=$2',[groupID,team.id])).rows[0];if(!exists)return res.status(404).json({error:'Gruppe nicht gefunden.'});
  const oldIDs=(await db.query('SELECT building_id FROM app_building_group_items WHERE group_id=$1',[groupID])).rows.map(row=>Number(row.building_id));if(!await groupManage(req,res,team,[...new Set([...oldIDs,...ids.map(Number)])]))return;
  const allowed=new Set(team.buildings.map(b=>Number(b.id)));if(ids.some(id=>!idOK(id)||!allowed.has(Number(id))))return res.status(403).json({error:'Die Gruppe darf nur Gebäude umfassen, auf die du Zugriff hast.'});
  const client=await db.connect();try{await client.query('BEGIN');await client.query('UPDATE app_building_groups SET name=$3,updated_at=now() WHERE id=$1 AND team_id=$2',[groupID,team.id,name]);await client.query('DELETE FROM app_building_group_items WHERE group_id=$1',[groupID]);for(const id of ids)await client.query('INSERT INTO app_building_group_items(group_id,building_id) VALUES($1,$2)',[groupID,Number(id)]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'Dieser Gruppenname ist bereits vergeben.'});throw error;}finally{client.release();}
  res.json((await db.query(groupQuery,[team.id])).rows.find(g=>Number(g.id)===groupID));
 }));
 r.delete('/teams/:teamID/groups/:groupID',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;const ids=(await db.query('SELECT i.building_id FROM app_building_group_items i JOIN app_building_groups g ON g.id=i.group_id WHERE g.id=$1 AND g.team_id=$2',[req.params.groupID,team.id])).rows.map(row=>Number(row.building_id));if(!ids.length&&!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann eine leere Gruppe löschen.'});if(ids.length&&!await groupManage(req,res,team,ids))return;const result=await db.query('DELETE FROM app_building_groups WHERE id=$1 AND team_id=$2',[req.params.groupID,team.id]);if(!result.rowCount)return res.status(404).json({error:'Gruppe nicht gefunden.'});res.json({ok:true});}));
 r.post('/teams/:teamID/groups/:groupID/assign',requireAccount,wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  const target=Number(req.body?.user_id),sourceBuildingID=Number(req.body?.role_building_id),sourceRoleID=Number(req.body?.role_id);
  if(!idOK(target)||target===Number(req.account.id)||!idOK(sourceBuildingID)||!idOK(sourceRoleID))return res.status(400).json({error:'Teammitglied, Gebäudegruppe und Rolle auswählen.'});
  const group=(await db.query('SELECT id FROM app_building_groups WHERE id=$1 AND team_id=$2',[req.params.groupID,team.id])).rows[0];
  if(!group)return res.status(404).json({error:'Gruppe nicht gefunden.'});
  const buildings=(await db.query('SELECT b.id,b.user_id FROM app_building_group_items i JOIN app_buildings b ON b.id=i.building_id WHERE i.group_id=$1 ORDER BY b.id',[group.id])).rows;
  if(!buildings.length)return res.status(400).json({error:'Die Gruppe enthält keine Gebäude.'});
  if(!buildings.some(b=>Number(b.id)===sourceBuildingID))return res.status(400).json({error:'Die gewählte Rolle muss aus einem Gebäude dieser Gruppe stammen.'});
  if(buildings.some(b=>Number(b.user_id)===target))return res.status(400).json({error:'Die Person ist Eigentümer eines Gebäudes in dieser Gruppe; Eigentümerrechte können nicht überschrieben werden.'});
  if(!await groupManage(req,res,team,buildings.map(b=>Number(b.id))))return;
  const contact=(await db.query("SELECT id FROM app_contacts WHERE low_id=$1 AND high_id=$2 AND status='accepted'",[Math.min(target,req.account.id),Math.max(target,req.account.id)])).rows[0];
  if(!contact)return res.status(400).json({error:'Die Person muss zuerst als bestätigter Kontakt verbunden sein.'});
  const sourceAccess=await buildingAccess(db,sourceBuildingID,req.account.id);
  const sourceRoles=await ensureBuildingRoles(db,sourceBuildingID);
  const sourceRole=sourceRoles.find(role=>Number(role.id)===sourceRoleID);
  if(!sourceRole)return res.status(400).json({error:'Die ausgewählte Rolle gehört nicht zum gewählten Gebäude.'});
  if(!sourceAccess||(!sourceAccess.is_owner&&Number(sourceRole.sort_order)<=Number(sourceAccess.role.sort_order)))return res.status(403).json({error:'Du kannst diese Rolle nicht vergeben.'});
  const prepared=[];
  for(const building of buildings){
   const actor=await buildingAccess(db,building.id,req.account.id);
   if(!actor||(!actor.is_owner&&!actor.role?.can_manage_members))return res.status(403).json({error:'Für mindestens ein Gruppen-Gebäude fehlt die Mitgliederverwaltung.'});
   if(!actor.is_owner&&Number(sourceRole.sort_order)<=Number(actor.role.sort_order))return res.status(403).json({error:'Die ausgewählte Rolle ist in mindestens einem Gebäude zu hoch eingestuft.'});
   const roles=await ensureBuildingRoles(db,building.id);
   const chosen=roles.find(role=>role.role_key===sourceRole.role_key && role.name===sourceRole.name && JSON.stringify(role.permissions)===JSON.stringify(sourceRole.permissions) && role.can_manage_members===sourceRole.can_manage_members) || roles.find(role=>role.name===sourceRole.name&&JSON.stringify(role.permissions)===JSON.stringify(sourceRole.permissions)&&role.can_manage_members===sourceRole.can_manage_members);
   if(chosen && !actor.is_owner && Number(chosen.sort_order)<=Number(actor.role.sort_order))return res.status(403).json({error:'Die Rolle ist in diesem Gebäude zu hoch eingestuft.'});
   const existing=(await db.query('SELECT m.status,r.sort_order FROM app_building_members m LEFT JOIN app_building_roles r ON r.id=m.role_id WHERE m.building_id=$1 AND m.user_id=$2',[building.id,target])).rows[0];
   if(existing&&!actor.is_owner&&Number(existing.sort_order)<=Number(actor.role.sort_order))return res.status(403).json({error:'Eine bestehende höhere oder gleichrangige Rolle darf nicht geändert werden.'});
   prepared.push({buildingID:Number(building.id),roleID:chosen?Number(chosen.id):null,existing:existing||null,actor});
  }
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   for(const item of prepared){
    let roleID=item.roleID;
    if(!roleID){
     const next=Number((await client.query('SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM app_building_roles WHERE building_id=$1',[item.buildingID])).rows[0].next);
     if(!item.actor.is_owner&&next<=Number(item.actor.role.sort_order))throw Object.assign(new Error('Die übertragene Rolle wäre nicht niedriger als deine eigene.'),{status:403});
     const role=(await client.query(`INSERT INTO app_building_roles(building_id,role_key,name,sort_order,permissions,can_manage_members,is_system)
      VALUES($1,$2,$3,$4,$5,$6,false) RETURNING id`,
      [item.buildingID,'group-'+require('node:crypto').randomUUID(),sourceRole.name,next,JSON.stringify(sourceRole.permissions),sourceRole.can_manage_members])).rows[0];
     roleID=Number(role.id);
    }
    if(item.existing)await client.query('UPDATE app_building_members SET role_id=$3 WHERE building_id=$1 AND user_id=$2',[item.buildingID,target,roleID]);
    else await client.query("INSERT INTO app_building_members(building_id,user_id,status,role_id) VALUES($1,$2,'pending',$3)",[item.buildingID,target,roleID]);
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  res.json({ok:true,buildings:prepared.length,role:sourceRole.name});
 }));
 return r;
}

module.exports={initTeams,ensureDefaultTeam,accessibleTeam,teamScopeMiddleware,teamsRouter};

