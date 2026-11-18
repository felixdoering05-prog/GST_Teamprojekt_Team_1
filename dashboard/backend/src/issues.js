const {accountLimits,reached}=require('./account-limits');
const express=require('express');
const {accessibleBuilding,accessSQL,notifyBuilding}=require('./collaboration');
const {buildingAccess,can}=require('./team-permissions');
const {campusBuildingID}=require('./campus');
// Defect reports ("Mängel") per building: text, optional photo and an optional position in an IFC model
// (model coordinates as used by the iOS viewer and room locator). Members may report and change the
// status; reporter and owner may edit, replace the photo or delete.
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const idOK=value=>/^[1-9]\d{0,9}$/.test(String(value))&&Number(value)<=2147483647;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const STATUS=['open','in_progress','done'];
const PRIORITY=['low','normal','high','urgent'];
const OVERVIEW_LIMIT=500;
const MAX_LIST=5000,MAX_PHOTO=2*1024*1024;
const firstName=name=>name?String(name).trim().split(/\s+/)[0].slice(0,100):'Ehemaliges Mitglied';
const COLUMNS='i.id,i.building_id,i.user_id,i.title,i.description,i.status,i.priority,i.room,i.document_id,i.space_id,i.element_id,i.x,i.y,i.z,(i.photo IS NOT NULL) AS has_photo,i.revision,i.created_at,i.updated_at,u.name AS reporter_name';
async function initIssues(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_building_issues(
 id SERIAL PRIMARY KEY,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
 user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done')),room TEXT NOT NULL DEFAULT '' CHECK(length(room)<=100),
 document_id INTEGER REFERENCES app_documents(id) ON DELETE SET NULL,space_id INTEGER,
 x DOUBLE PRECISION,y DOUBLE PRECISION,z DOUBLE PRECISION,photo BYTEA,photo_type TEXT,request_key TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(building_id,request_key))`);
 await db.query('CREATE INDEX IF NOT EXISTS app_building_issues_building_idx ON app_building_issues(building_id,id)');
 await db.query(`ALTER TABLE app_building_issues
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK(priority IN ('low','normal','high','urgent')),
  ADD COLUMN IF NOT EXISTS element_id INTEGER CHECK(element_id > 0)`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_issue_history(
  issue_id INTEGER NOT NULL REFERENCES app_building_issues(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, actor_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, changes JSONB NOT NULL DEFAULT '{}', occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(issue_id,revision))`);
}
async function recordChange(db, id, revision, actor, action, changes = {}) {
 await db.query('INSERT INTO app_issue_history(issue_id,revision,actor_id,action,changes) VALUES($1,$2,$3,$4,$5)',
  [id,revision,actor,action,JSON.stringify(changes)]);
}
function present(row,account,owner){
 // A position is only meaningful together with the model it was recorded in.
 const located=row.document_id!=null&&[row.x,row.y,row.z].every(Number.isFinite);
 return {id:row.id,building_id:row.building_id,title:row.title,description:row.description,status:row.status,priority:row.priority,room:row.room,document_id:row.document_id,
  element_id:row.document_id==null?null:row.element_id,
  space_id:row.document_id==null?null:row.space_id,point:located?{x:row.x,y:row.y,z:row.z}:null,has_photo:row.has_photo,
  reporter:firstName(row.reporter_name),is_mine:row.user_id===account,can_edit:row.user_id===account||owner===account,
  revision:row.revision,created_at:row.created_at,updated_at:row.updated_at};
}
function text(value,max,label,required=false){
 if(value==null&&!required)return '';
 if(typeof value!=='string')fail(`${label} fehlt.`);const s=value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').trim();
 if(required&&!s)fail(`${label} fehlt.`);if(s.length>max)fail(`${label}: höchstens ${max} Zeichen.`);return s;
}
async function location(db,building,b){
 if(b.document_id==null){if(b.space_id!=null||b.point!=null||b.element_id!=null)fail('Raum und Position brauchen ein IFC-Modell.');return {document_id:null,space_id:null,element_id:null,x:null,y:null,z:null};}
 if(!Number.isInteger(b.document_id)||!idOK(b.document_id))fail('Ungültiges IFC-Modell.');
 if(b.space_id!=null&&(!Number.isInteger(b.space_id)||!idOK(b.space_id)))fail('Ungültiger IFC-Raum.');
 if(b.element_id!=null&&(!Number.isInteger(b.element_id)||!idOK(b.element_id)))fail('Ungültiges IFC-Bauteil.');
 let point=null;
 if(b.point!=null){
  const p=b.point;if(typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['x','y','z'].includes(k))||![p.x,p.y,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<1e6))fail('Ungültige Position im Modell.');
  point=p;
 }
 const doc=(await db.query("SELECT id FROM app_documents WHERE id=$1 AND building_id=$2 AND mime_type='application/x-step'",[b.document_id,building])).rows[0];
 if(!doc)fail('IFC-Modell gehört nicht zu diesem Gebäude.',404);
 return {document_id:b.document_id,space_id:b.space_id??null,element_id:b.element_id??null,x:point?.x??null,y:point?.y??null,z:point?.z??null};
}
function photoType(buffer){
 if(buffer.length>3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return 'image/jpeg';
 if(buffer.length>8&&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'image/png';
 return null;
}
function issuesRouter(db,requireAccount,campusOptions){
 const r=express.Router(),base='/buildings/:issueBuilding/issues';
 r.use(base,requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');if(!idOK(req.params.issueBuilding))return res.status(400).json({error:'Ungültiges Gebäude.'});next();});
 async function building(c,req,lock=false){const b=await accessibleBuilding(c,req.params.issueBuilding,req.account.id,lock);if(!b)fail('Gebäude nicht gefunden.',404);return b;}
 async function issue(c,req,b,lock=false){
  if(!idOK(req.params.issue))fail('Ungültiger Mangel.');
  const row=(await c.query(`SELECT ${COLUMNS} FROM app_building_issues i LEFT JOIN app_users u ON u.id=i.user_id WHERE i.id=$1 AND i.building_id=$2${lock?' FOR UPDATE OF i':''}`,[req.params.issue,b.id])).rows[0];
  if(!row)fail('Mangel nicht gefunden.',404);return row;
 }
 async function tx(fn){const c=await db.connect();try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 r.get('/issues',requireAccount,wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const {building_id: buildingID, before, status} = req.query;
  if ([buildingID,before].some(value=>value!==undefined&&(typeof value!=='string'||!idOK(value)))
   || status!==undefined&&!['open','done'].includes(status)) fail('Ungültiger Meldungsfilter.');
  const rows=(await db.query(`SELECT ${COLUMNS},b.user_id AS owner_id,b.name AS building_name,b.address AS building_address
   FROM app_building_issues i JOIN app_buildings b ON b.id=i.building_id LEFT JOIN app_users u ON u.id=i.user_id
   WHERE ${accessSQL.replaceAll('$2','$1')} AND ($2::int IS NULL OR b.id=$2) AND ($3::int IS NULL OR i.id<$3)
    AND ($4::text IS NULL OR ($4='open' AND i.status IN ('open','in_progress')) OR i.status=$4)
   ORDER BY i.id DESC LIMIT ${OVERVIEW_LIMIT+1}`,[req.account.id,buildingID??null,before??null,status??null])).rows;
  const truncated=rows.length>OVERVIEW_LIMIT;
  const permitted=[];
  for(const row of rows){const access=await buildingAccess(db,row.building_id,req.account.id);if(access&&can(access,'issues','read'))permitted.push(row);}
  res.json({truncated,next_before:truncated?rows[OVERVIEW_LIMIT-1].id:null,issues:permitted.slice(0,OVERVIEW_LIMIT).map(row=>({
   ...present(row,req.account.id,row.owner_id),building_name:row.building_name,building_address:row.building_address
  }))});
 }));
 r.get(base+'/:issue',wrap(async(req,res)=>{
  const b=await building(db,req),row=await issue(db,req,b);
  const history=(await db.query(`SELECT h.revision,h.action,h.changes,h.occurred_at,u.name AS actor
   FROM app_issue_history h LEFT JOIN app_users u ON u.id=h.actor_id WHERE h.issue_id=$1
   ORDER BY h.revision DESC LIMIT 100`,[row.id])).rows.map(entry=>({...entry,actor:firstName(entry.actor)}));
  // Older reports may carry only a room label. Use the building's current model for a name lookup.
  // Stored coordinates and IFC IDs still belong exclusively to the originally linked document.
  let location_model = row.document_id;
  if (!location_model && row.room) {
   const current = await db.query("SELECT id FROM app_documents WHERE building_id=$1 AND mime_type='application/x-step' ORDER BY id DESC LIMIT 1",[b.id]);
   location_model = current.rows[0]?.id ?? (campusBuildingID(campusOptions) === String(b.id) ? 'campus-d21' : null);
  }
  res.json({...present(row,req.account.id,b.user_id),location_model,building_name:b.name,building_address:b.address,history});
 }));
 r.get(base,wrap(async(req,res)=>{
  const b=await building(db,req);
  const rows=(await db.query(`SELECT ${COLUMNS} FROM app_building_issues i LEFT JOIN app_users u ON u.id=i.user_id WHERE i.building_id=$1 ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,i.id DESC LIMIT ${MAX_LIST}`,[b.id])).rows;
  res.json(rows.map(x=>present(x,req.account.id,b.user_id)));
 }));
 r.post(base,wrap(async(req,res)=>{
  const body=req.body||{};
  if(typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['title','description','room','document_id','space_id','element_id','point','priority','request_key'].includes(k)))fail('Bitte die Angaben prüfen.');
  if(typeof body.request_key!=='string'||!UUID.test(body.request_key))fail('Ungültige Anfragekennung.');
  if(body.priority!==undefined&&!PRIORITY.includes(body.priority))fail('Ungültige Priorität.');
  const title=text(body.title,120,'Titel',true),description=text(body.description,2000,'Beschreibung'),room=text(body.room,100,'Raum');
  const result=await tx(async c=>{
   const b=await building(c,req,true);
   const existing=(await c.query(`SELECT ${COLUMNS} FROM app_building_issues i LEFT JOIN app_users u ON u.id=i.user_id WHERE i.building_id=$1 AND i.request_key=$2`,[b.id,body.request_key])).rows[0];
   if(existing){if(existing.user_id!==req.account.id||existing.title!==title)fail('Diese Meldung wurde bereits anders gespeichert.',409);return {status:200,row:existing,owner:b.user_id};}
   const lim=await accountLimits(c,b.user_id);
   if(reached(lim,'issues_building',(await c.query('SELECT COUNT(*) n FROM app_building_issues WHERE building_id=$1',[b.id])).rows[0].n))fail(`Höchstens ${lim.values.issues_building} Mängel pro Gebäude. Bitte erledigte Meldungen löschen.`,409);
   const at=await location(c,b.id,body);
   const id=(await c.query('INSERT INTO app_building_issues(building_id,user_id,title,description,room,document_id,space_id,x,y,z,request_key,priority,element_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',[b.id,req.account.id,title,description,room,at.document_id,at.space_id,at.x,at.y,at.z,body.request_key,body.priority??null,at.element_id])).rows[0].id;
   await recordChange(c,id,0,req.account.id,'created');
   await notifyBuilding(c,b.id,req.account.id,'issue',`Neuer Mangel in ${String(b.name||'Gebäude').slice(0,80)}: ${title.slice(0,80)}`);
   const row=(await c.query(`SELECT ${COLUMNS} FROM app_building_issues i LEFT JOIN app_users u ON u.id=i.user_id WHERE i.id=$1`,[id])).rows[0];
   return {status:201,row,owner:b.user_id};
  });
  res.status(result.status).json(present(result.row,req.account.id,result.owner));
 }));
 r.patch(base+'/:issue',wrap(async(req,res)=>{
  const body=req.body||{};
  if(typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['status','title','description','room','priority','revision'].includes(k))||!Number.isInteger(body.revision)||body.revision<0)fail('Bitte die Änderung prüfen.');
  if(body.status!==undefined&&!STATUS.includes(body.status))fail('Ungültiger Status.');
  if(body.priority!==undefined&&!PRIORITY.includes(body.priority))fail('Ungültige Priorität.');
  const result=await tx(async c=>{
   const b=await building(c,req),row=await issue(c,req,b,true);
   if(row.revision!==body.revision)fail('Mangel wurde inzwischen geändert. Bitte neu laden.',409);
   const editing=['title','description','room','priority'].some(k=>body[k]!==undefined);
   if(editing&&row.user_id!==req.account.id&&b.user_id!==req.account.id&&!can(req.buildingAccess,'issues','edit'))fail('Nur die meldende Person, eine berechtigte Teamrolle oder der Eigentümer kann die Angaben ändern.',403);
   const next={status:body.status??row.status,title:body.title===undefined?row.title:text(body.title,120,'Titel',true),description:body.description===undefined?row.description:text(body.description,2000,'Beschreibung'),room:body.room===undefined?row.room:text(body.room,100,'Raum'),priority:body.priority??row.priority};
   const changed=Object.keys(next).filter(key=>next[key]!==row[key]);
   if(!changed.length)return {row,owner:b.user_id};
   await c.query('UPDATE app_building_issues SET status=$2,title=$3,description=$4,room=$5,priority=$6,revision=revision+1,updated_at=now() WHERE id=$1',[row.id,next.status,next.title,next.description,next.room,next.priority]);
   const changes=Object.fromEntries(changed.map(key=>[key,['status','priority'].includes(key)?{from:row[key],to:next[key]}:true]));
   await recordChange(c,row.id,row.revision+1,req.account.id,'edited',changes);
   if(body.status!==undefined&&body.status!==row.status&&row.user_id&&row.user_id!==req.account.id){
    const label={open:'wieder offen',in_progress:'in Arbeit',done:'erledigt'}[body.status];
    await c.query('INSERT INTO app_notifications(user_id,kind,title,building_id) VALUES($1,$2,$3,$4)',[row.user_id,'issue',`Mangel „${row.title.slice(0,80)}“ ist ${label}`,b.id]);
   }
   return {row:await issue(c,req,b),owner:b.user_id};
  });
  res.json(present(result.row,req.account.id,result.owner));
 }));
 r.delete(base+'/:issue',wrap(async(req,res)=>{
  await tx(async c=>{
   const b=await building(c,req),row=await issue(c,req,b,true);
   if(row.user_id!==req.account.id&&b.user_id!==req.account.id&&!can(req.buildingAccess,'issues','edit'))fail('Nur die meldende Person, eine berechtigte Teamrolle oder der Eigentümer kann löschen.',403);
   await c.query('DELETE FROM app_building_issues WHERE id=$1',[row.id]);
  });
  res.json({ok:true});
 }));
 // Photos as raw bytes (not base64 JSON); authenticated and checked before buffering.
 r.put(base+'/:issue/photo',wrap(async(req,res,next)=>{const b=await building(db,req),row=await issue(db,req,b);if(row.user_id!==req.account.id&&b.user_id!==req.account.id&&!can(req.buildingAccess,'issues','edit'))fail('Nur die meldende Person, eine berechtigte Teamrolle oder der Eigentümer kann das Foto ändern.',403);next();}),
  express.raw({type:['image/jpeg','image/png','application/octet-stream'],limit:MAX_PHOTO}),wrap(async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||!req.body.length)fail('Bitte ein Foto auswählen.');
  const type=photoType(req.body);if(!type)fail('Erlaubt sind JPG- und PNG-Fotos.',415);
  const result=await tx(async c=>{const b=await building(c,req),row=await issue(c,req,b,true);
   if(row.user_id!==req.account.id&&b.user_id!==req.account.id&&!can(req.buildingAccess,'issues','edit'))fail('Nur die meldende Person, eine berechtigte Teamrolle oder der Eigentümer kann das Foto ändern.',403);
   const changed=await c.query('UPDATE app_building_issues SET photo=$2,photo_type=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND photo IS DISTINCT FROM $2',[row.id,req.body,type]);
   if(changed.rowCount)await recordChange(c,row.id,row.revision+1,req.account.id,'photo');
   return {row:await issue(c,req,b),owner:b.user_id};});
  res.json(present(result.row,req.account.id,result.owner));
 }));
 r.get(base+'/:issue/photo',wrap(async(req,res)=>{
  const b=await building(db,req);if(!idOK(req.params.issue))fail('Ungültiger Mangel.');
  const row=(await db.query('SELECT photo,photo_type FROM app_building_issues WHERE id=$1 AND building_id=$2',[req.params.issue,b.id])).rows[0];
  if(!row?.photo)fail('Kein Foto vorhanden.',404);
  res.set({'Content-Type':row.photo_type,'X-Content-Type-Options':'nosniff','Content-Disposition':'inline'});res.send(Buffer.from(row.photo));
 }));
 r.use((e,req,res,next)=>{if(e.type==='entity.too.large')return res.status(413).json({error:'Das Foto ist zu groß (höchstens 2 MB).'});return e.status&&e.status<500?res.status(e.status).json({error:e.message}):next(e);});
 return r;
}
module.exports={initIssues,issuesRouter};
