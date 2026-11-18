const express=require('express');
const {buildingAccess,ensureBuildingRoles}=require('./team-permissions');
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
   req.teamScope={id:team.id,owner_id:team.owner_id,is_owner:team.is_owner,buildingIDs:team.buildings.map(row=>Number(row.id))};
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
  res.set('Content-Type',row.logo_type).set('Cache-Control','private, no-store').send(row.logo);
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
 r.put('/teams/:teamID/members/:userID/title',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;if(!team.is_owner)return res.status(403).json({error:'Nur die Teamleitung kann Titel zuweisen.'});const user=Number(req.params.userID),title=req.body?.title_id?Number(req.body.title_id):null;if(!idOK(user)||(title&&!idOK(title)))return res.status(400).json({error:'Ungültige Auswahl.'});if(title){const valid=(await db.query(`SELECT 1 FROM app_team_titles WHERE id=$1 AND team_id=$2 AND EXISTS(SELECT 1 FROM app_building_members m JOIN app_buildings b ON b.id=m.building_id WHERE m.user_id=$3 AND b.team_id=$2 AND m.status='accepted')`,[title,team.id,user])).rows[0];if(!valid)return res.status(400).json({error:'Titel oder Teammitglied nicht gefunden.'});await db.query('INSERT INTO app_team_member_titles(team_id,user_id,title_id) VALUES($1,$2,$3) ON CONFLICT(team_id,user_id) DO UPDATE SET title_id=EXCLUDED.title_id',[team.id,user,title]);}else await db.query('DELETE FROM app_team_member_titles WHERE team_id=$1 AND user_id=$2',[team.id,user]);res.json({ok:true});}));
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
 const groupQuery=`SELECT g.id,g.team_id,g.name,g.created_at,COALESCE(json_agg(json_build_object('id',b.id,'name',b.name) ORDER BY b.name) FILTER(WHERE b.id IS NOT NULL),'[]') buildings
   FROM app_building_groups g LEFT JOIN app_building_group_items i ON i.group_id=g.id LEFT JOIN app_buildings b ON b.id=i.building_id WHERE g.team_id=$1 GROUP BY g.id ORDER BY g.name,g.id`;
 r.get('/teams/:teamID/groups',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;const allowed=new Set(team.buildings.map(b=>Number(b.id)));res.json((await db.query(groupQuery,[team.id])).rows.map(group=>({...group,buildings:group.buildings.filter(building=>allowed.has(Number(building.id)))})));}));
 r.post('/teams/:teamID/groups',requireAccount,wrap(async(req,res)=>{
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';const ids=req.body?.building_ids;
  if(!name||name.length>80||!Array.isArray(ids)||!ids.length||new Set(ids.map(Number)).size!==ids.length)return res.status(400).json({error:'Name und mindestens ein Gebäude auswählen.'});
  const team=await currentTeam(req,res);if(!team)return;if(!await groupManage(req,res,team,ids.map(Number)))return;
  const allowed=new Set(team.buildings.map(b=>Number(b.id)));if(ids.some(id=>!idOK(id)||!allowed.has(Number(id))))return res.status(403).json({error:'Die Gruppe darf nur Gebäude umfassen, auf die du Zugriff hast.'});
  const client=await db.connect();try{await client.query('BEGIN');const g=(await client.query('INSERT INTO app_building_groups(team_id,name,created_by) VALUES($1,$2,$3) RETURNING id',[team.id,name,req.account.id])).rows[0];for(const id of ids)await client.query('INSERT INTO app_building_group_items(group_id,building_id) VALUES($1,$2)',[g.id,Number(id)]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'Dieser Gruppenname ist bereits vergeben.'});throw error;}finally{client.release();}
  res.status(201).json((await db.query(groupQuery,[team.id])).rows.find(g=>g.name===name));
 }));
 r.patch('/teams/:teamID/groups/:groupID',requireAccount,wrap(async(req,res)=>{
  const groupID=Number(req.params.groupID),name=typeof req.body?.name==='string'?req.body.name.trim():'';const ids=req.body?.building_ids;
  if(!idOK(groupID)||!name||name.length>80||!Array.isArray(ids)||!ids.length||new Set(ids.map(Number)).size!==ids.length)return res.status(400).json({error:'Gruppenname und mindestens ein Gebäude auswählen.'});
  const team=await currentTeam(req,res);if(!team)return;
  const exists=(await db.query('SELECT id FROM app_building_groups WHERE id=$1 AND team_id=$2',[groupID,team.id])).rows[0];if(!exists)return res.status(404).json({error:'Gruppe nicht gefunden.'});
  const oldIDs=(await db.query('SELECT building_id FROM app_building_group_items WHERE group_id=$1',[groupID])).rows.map(row=>Number(row.building_id));if(!await groupManage(req,res,team,[...new Set([...oldIDs,...ids.map(Number)])]))return;
  const allowed=new Set(team.buildings.map(b=>Number(b.id)));if(ids.some(id=>!idOK(id)||!allowed.has(Number(id))))return res.status(403).json({error:'Die Gruppe darf nur Gebäude umfassen, auf die du Zugriff hast.'});
  const client=await db.connect();try{await client.query('BEGIN');await client.query('UPDATE app_building_groups SET name=$3,updated_at=now() WHERE id=$1 AND team_id=$2',[groupID,team.id,name]);await client.query('DELETE FROM app_building_group_items WHERE group_id=$1',[groupID]);for(const id of ids)await client.query('INSERT INTO app_building_group_items(group_id,building_id) VALUES($1,$2)',[groupID,Number(id)]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'Dieser Gruppenname ist bereits vergeben.'});throw error;}finally{client.release();}
  res.json((await db.query(groupQuery,[team.id])).rows.find(g=>Number(g.id)===groupID));
 }));
 r.delete('/teams/:teamID/groups/:groupID',requireAccount,wrap(async(req,res)=>{const team=await currentTeam(req,res);if(!team)return;const ids=(await db.query('SELECT i.building_id FROM app_building_group_items i JOIN app_building_groups g ON g.id=i.group_id WHERE g.id=$1 AND g.team_id=$2',[req.params.groupID,team.id])).rows.map(row=>Number(row.building_id));if(!ids.length)return res.status(404).json({error:'Gruppe nicht gefunden oder leer.'});if(!await groupManage(req,res,team,ids))return;const result=await db.query('DELETE FROM app_building_groups WHERE id=$1 AND team_id=$2',[req.params.groupID,team.id]);if(!result.rowCount)return res.status(404).json({error:'Gruppe nicht gefunden.'});res.json({ok:true});}));
 r.post('/teams/:teamID/groups/:groupID/assign',requireAccount,wrap(async(req,res)=>{
  const team=await currentTeam(req,res);if(!team)return;
  const target=Number(req.body?.user_id),assignments=req.body?.assignments;if(!idOK(target)||target===Number(req.account.id)||!Array.isArray(assignments))return res.status(400).json({error:'Person und Rolle je Gebäude auswählen.'});
  const group=(await db.query('SELECT id FROM app_building_groups WHERE id=$1 AND team_id=$2',[req.params.groupID,team.id])).rows[0];if(!group)return res.status(404).json({error:'Gruppe nicht gefunden.'});
  const buildings=(await db.query('SELECT b.id,b.user_id FROM app_building_group_items i JOIN app_buildings b ON b.id=i.building_id WHERE i.group_id=$1 ORDER BY b.id',[group.id])).rows;if(!buildings.length)return res.status(400).json({error:'Die Gruppe enthält keine Gebäude.'});
  if(!await groupManage(req,res,team,buildings.map(b=>Number(b.id))))return;
  const contact=(await db.query("SELECT id FROM app_contacts WHERE low_id=$1 AND high_id=$2 AND status='accepted'",[Math.min(target,req.account.id),Math.max(target,req.account.id)])).rows[0];if(!contact)return res.status(400).json({error:'Die Person muss zuerst als bestätigter Kontakt verbunden sein.'});
  if(assignments.length!==buildings.length||new Set(assignments.map(a=>Number(a.building_id))).size!==buildings.length)return res.status(400).json({error:'Für jedes Gruppen-Gebäude genau eine Rolle auswählen.'});
  const prepared=[];for(const b of buildings){if(Number(b.user_id)===target)return res.status(400).json({error:'Die Person ist Eigentümer eines Gebäudes in dieser Gruppe; Eigentümerrechte können nicht überschrieben werden.'});const actor=await buildingAccess(db,b.id,req.account.id);if(!actor||(!actor.is_owner&&!actor.role?.can_manage_members))return res.status(403).json({error:'Für mindestens ein Gruppen-Gebäude fehlt die Mitgliederverwaltung.'});const assignment=assignments.find(a=>Number(a.building_id)===Number(b.id));if(!assignment||!idOK(assignment.role_id))return res.status(400).json({error:'Für jedes Gruppen-Gebäude eine gültige Rolle auswählen.'});const roles=await ensureBuildingRoles(db,b.id);const chosen=roles.find(r=>Number(r.id)===Number(assignment.role_id));if(!chosen)return res.status(400).json({error:'Die ausgewählte Rolle gehört nicht zum jeweiligen Gebäude.'});if(!actor.is_owner&&Number(chosen.sort_order)<=Number(actor.role.sort_order))return res.status(403).json({error:'Du kannst nur eine niedrigere Rolle vergeben.'});const existing=(await db.query('SELECT m.status,r.sort_order FROM app_building_members m LEFT JOIN app_building_roles r ON r.id=m.role_id WHERE m.building_id=$1 AND m.user_id=$2',[b.id,target])).rows[0];if(existing&&!actor.is_owner&&Number(existing.sort_order)<=Number(actor.role.sort_order))return res.status(403).json({error:'Eine bestehende höhere oder gleichrangige Rolle darf nicht geändert werden.'});prepared.push({buildingID:Number(b.id),roleID:Number(chosen.id),existing:existing||null});}
  const client=await db.connect();try{await client.query('BEGIN');for(const p of prepared){if(p.existing)await client.query('UPDATE app_building_members SET role_id=$3 WHERE building_id=$1 AND user_id=$2',[p.buildingID,target,p.roleID]);else await client.query("INSERT INTO app_building_members(building_id,user_id,status,role_id) VALUES($1,$2,'pending',$3)",[p.buildingID,target,p.roleID]);}await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}res.json({ok:true,buildings:prepared.length});
 }));
 return r;
}

module.exports={initTeams,ensureDefaultTeam,accessibleTeam,teamScopeMiddleware,teamsRouter};

