const express=require('express');
const {accessibleBuilding,notifyBuilding}=require('./collaboration');
// Defect reports ("Mängel") per building: text, optional photo and an optional position in an IFC model
// (model coordinates as used by the iOS viewer and room locator). Members may report and change the
// status; reporter and owner may edit, replace the photo or delete.
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const idOK=value=>/^[1-9]\d{0,9}$/.test(String(value))&&Number(value)<=2147483647;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const STATUS=['open','in_progress','done'];
const MAX_ISSUES=300,MAX_PHOTO=2*1024*1024;
const firstName=name=>name?String(name).trim().split(/\s+/)[0].slice(0,100):'Ehemaliges Mitglied';
const COLUMNS='i.id,i.building_id,i.user_id,i.title,i.description,i.status,i.room,i.document_id,i.space_id,i.x,i.y,i.z,(i.photo IS NOT NULL) AS has_photo,i.revision,i.created_at,i.updated_at,u.name AS reporter_name';
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
}
function present(row,account,owner){
 // A position is only meaningful together with the model it was recorded in.
 const located=row.document_id!=null&&[row.x,row.y,row.z].every(Number.isFinite);
 return {id:row.id,title:row.title,description:row.description,status:row.status,room:row.room,document_id:row.document_id,
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
 if(b.document_id==null){if(b.space_id!=null||b.point!=null)fail('Raum und Position brauchen ein IFC-Modell.');return {document_id:null,space_id:null,x:null,y:null,z:null};}
 if(!Number.isInteger(b.document_id)||!idOK(b.document_id))fail('Ungültiges IFC-Modell.');
 if(b.space_id!=null&&(!Number.isInteger(b.space_id)||!idOK(b.space_id)))fail('Ungültiger IFC-Raum.');
 let point=null;
 if(b.point!=null){
  const p=b.point;if(typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['x','y','z'].includes(k))||![p.x,p.y,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<1e6))fail('Ungültige Position im Modell.');
  point=p;
 }
 const doc=(await db.query("SELECT id FROM app_documents WHERE id=$1 AND building_id=$2 AND mime_type='application/x-step'",[b.document_id,building])).rows[0];
 if(!doc)fail('IFC-Modell gehört nicht zu diesem Gebäude.',404);
 return {document_id:b.document_id,space_id:b.space_id??null,x:point?.x??null,y:point?.y??null,z:point?.z??null};
}
function photoType(buffer){
 if(buffer.length>3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return 'image/jpeg';
 if(buffer.length>8&&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'image/png';
 return null;
}
function issuesRouter(db,requireAccount){
 const r=express.Router(),base='/buildings/:issueBuilding/issues';
 r.use(base,requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');if(!idOK(req.params.issueBuilding))return res.status(400).json({error:'Ungültiges Gebäude.'});next();});
 async function building(c,req,lock=false){const b=await accessibleBuilding(c,req.params.issueBuilding,req.account.id,lock);if(!b)fail('Gebäude nicht gefunden.',404);return b;}
 async function issue(c,req,b,lock=false){
  if(!idOK(req.params.issue))fail('Ungültiger Mangel.');
  const row=(await c.query(`SELECT ${COLUMNS} FROM app_building_issues i LEFT JOIN app_users u ON u.id=i.user_id WHERE i.id=$1 AND i.building_id=$2${lock?' FOR UPDATE OF i':''}`,[req.params.issue,b.id])).rows[0];
  if(!row)fail('Mangel nicht gefunden.',404);return row;
 }
 async function tx(fn){const c=await db.connect();try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 r.get(base,wrap(async(req,res)=>{
  const b=await building(db,req);
  const rows=(await db.query(`SELECT ${COLUMNS} FROM app_building_issues i LEFT JOIN app_users u ON u.id=i.user_id WHERE i.building_id=$1 ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,i.id DESC LIMIT ${MAX_ISSUES}`,[b.id])).rows;
  res.json(rows.map(x=>present(x,req.account.id,b.user_id)));
 }));
 r.post(base,wrap(async(req,res)=>{
  const body=req.body||{};
  if(typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['title','description','room','document_id','space_id','point','request_key'].includes(k)))fail('Bitte die Angaben prüfen.');
  if(typeof body.request_key!=='string'||!UUID.test(body.request_key))fail('Ungültige Anfragekennung.');
  const title=text(body.title,120,'Titel',true),description=text(body.description,2000,'Beschreibung'),room=text(body.room,100,'Raum');
  const result=await tx(async c=>{
   const b=await building(c,req,true);
   const existing=(await c.query(`SELECT ${COLUMNS} FROM app_building_issues i LEFT JOIN app_users u ON u.id=i.user_id WHERE i.building_id=$1 AND i.request_key=$2`,[b.id,body.request_key])).rows[0];
   if(existing){if(existing.user_id!==req.account.id||existing.title!==title)fail('Diese Meldung wurde bereits anders gespeichert.',409);return {status:200,row:existing,owner:b.user_id};}
   if(Number((await c.query('SELECT COUNT(*) n FROM app_building_issues WHERE building_id=$1',[b.id])).rows[0].n)>=MAX_ISSUES)fail(`Höchstens ${MAX_ISSUES} Mängel pro Gebäude. Bitte erledigte Meldungen löschen.`,409);
   const at=await location(c,b.id,body);
   const id=(await c.query('INSERT INTO app_building_issues(building_id,user_id,title,description,room,document_id,space_id,x,y,z,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[b.id,req.account.id,title,description,room,at.document_id,at.space_id,at.x,at.y,at.z,body.request_key])).rows[0].id;
   await notifyBuilding(c,b.id,req.account.id,'issue',`Neuer Mangel in ${String(b.name||'Gebäude').slice(0,80)}: ${title.slice(0,80)}`);
   const row=(await c.query(`SELECT ${COLUMNS} FROM app_building_issues i LEFT JOIN app_users u ON u.id=i.user_id WHERE i.id=$1`,[id])).rows[0];
   return {status:201,row,owner:b.user_id};
  });
  res.status(result.status).json(present(result.row,req.account.id,result.owner));
 }));
 r.patch(base+'/:issue',wrap(async(req,res)=>{
  const body=req.body||{};
  if(typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['status','title','description','room','revision'].includes(k))||!Number.isInteger(body.revision)||body.revision<0)fail('Bitte die Änderung prüfen.');
  if(body.status!==undefined&&!STATUS.includes(body.status))fail('Ungültiger Status.');
  const result=await tx(async c=>{
   const b=await building(c,req),row=await issue(c,req,b,true);
   if(row.revision!==body.revision)fail('Mangel wurde inzwischen geändert. Bitte neu laden.',409);
   const editing=['title','description','room'].some(k=>body[k]!==undefined);
   if(editing&&row.user_id!==req.account.id&&b.user_id!==req.account.id)fail('Nur die meldende Person oder der Eigentümer kann den Text ändern.',403);
   const next={status:body.status??row.status,title:body.title===undefined?row.title:text(body.title,120,'Titel',true),description:body.description===undefined?row.description:text(body.description,2000,'Beschreibung'),room:body.room===undefined?row.room:text(body.room,100,'Raum')};
   await c.query('UPDATE app_building_issues SET status=$2,title=$3,description=$4,room=$5,revision=revision+1,updated_at=now() WHERE id=$1',[row.id,next.status,next.title,next.description,next.room]);
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
   if(row.user_id!==req.account.id&&b.user_id!==req.account.id)fail('Nur die meldende Person oder der Eigentümer kann löschen.',403);
   await c.query('DELETE FROM app_building_issues WHERE id=$1',[row.id]);
  });
  res.json({ok:true});
 }));
 // Photos as raw bytes (not base64 JSON); authenticated and checked before buffering.
 r.put(base+'/:issue/photo',wrap(async(req,res,next)=>{const b=await building(db,req),row=await issue(db,req,b);if(row.user_id!==req.account.id&&b.user_id!==req.account.id)fail('Nur die meldende Person oder der Eigentümer kann das Foto ändern.',403);next();}),
  express.raw({type:['image/jpeg','image/png','application/octet-stream'],limit:MAX_PHOTO}),wrap(async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||!req.body.length)fail('Bitte ein Foto auswählen.');
  const type=photoType(req.body);if(!type)fail('Erlaubt sind JPG- und PNG-Fotos.',415);
  const result=await tx(async c=>{const b=await building(c,req),row=await issue(c,req,b,true);
   if(row.user_id!==req.account.id&&b.user_id!==req.account.id)fail('Nur die meldende Person oder der Eigentümer kann das Foto ändern.',403);
   await c.query('UPDATE app_building_issues SET photo=$2,photo_type=$3,revision=revision+1,updated_at=now() WHERE id=$1',[row.id,req.body,type]);
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
