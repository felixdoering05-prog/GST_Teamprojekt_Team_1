// LiDAR room scans from the iPhone (Apple RoomPlan). The app uploads the captured structure as JSON;
// the ifc-worker (ifc-analysis/roomscan.py) builds an IFC4 draft that the person checks and adds to the building.
// No AI provider is involved: room names and types are derived locally from RoomPlan labels and furniture.
const express=require('express');
const {accessibleBuilding,notifyBuilding}=require('./collaboration');
const MAX_BODY=4*1024*1024,MAX_ACCOUNT=250*1024*1024;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CATEGORIES=['table','chair','sofa','bed','storage','fireplace','television','refrigerator','stove','oven','dishwasher','washerDryer','sink','toilet','bathtub','stairs','unknown'];
const LABELS=['bathroom','bedroom','diningRoom','kitchen','livingRoom','unidentified'];
const SUMMARY='id,building_id,status,summary,warnings,failure_code,output_document_id,created_at,updated_at';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const invalid=()=>fail('Der Scan hat ein ungültiges Format. Bitte App aktualisieren und erneut scannen.');
const num=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)invalid();return v;};
const text=(v,max)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v))invalid();return v.trim();};
const list=(v,max,min=0)=>{if(!Array.isArray(v)||v.length<min||v.length>max)invalid();return v;};
const only=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))invalid();};
function box(v,extra=[]){
 only(v,['transform','size',...extra]);
 list(v.transform,16,16).forEach(n=>num(n,-1000,1000));list(v.size,3,3).forEach(n=>num(n,0,100));
 return {transform:v.transform,size:v.size};
}
/** Strict copy of the RoomPlan export; unknown fields are rejected, never passed to the worker. */
function validateScan(scan){
 only(scan,['version','building_name','storey','walls','doors','windows','openings','objects','floors']);
 if(scan.version!==1)invalid();
 const walls=list(scan.walls,600,1).map(w=>box(w));
 const objects=list(scan.objects??[],600).map(o=>{const b=box(o,['category']);if(!CATEGORIES.includes(o.category))invalid();return {...b,category:o.category};});
 const floors=list(scan.floors??[],60).map(f=>{
  only(f,['corners','label','name']);
  const corners=list(f.corners,200,3).map(c=>list(c,3,3).map(n=>num(n,-1000,1000)));
  if(f.label!=null&&!LABELS.includes(f.label))invalid();
  return {corners,label:f.label??null,name:f.name==null?null:text(f.name,80)};
 });
 return {version:1,building_name:scan.building_name==null?null:text(scan.building_name,120)||null,storey:text(scan.storey??'Erdgeschoss',80)||'Erdgeschoss',
  walls,doors:list(scan.doors??[],200).map(d=>box(d)),windows:list(scan.windows??[],200).map(d=>box(d)),openings:list(scan.openings??[],200).map(d=>box(d)),objects,floors};
}
async function initRoomScan(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_room_scan_jobs(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,request_key TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','running','ready','approved','rejected','failed')),payload JSONB,output_ifc BYTEA,summary JSONB,warnings JSONB NOT NULL DEFAULT '[]',failure_code TEXT,output_document_id INTEGER REFERENCES app_documents(id) ON DELETE SET NULL,lease_until TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(user_id,request_key))`);
 await db.query('CREATE INDEX IF NOT EXISTS app_room_scan_poll_idx ON app_room_scan_jobs(status,created_at)');
 await db.query('CREATE INDEX IF NOT EXISTS app_room_scan_owner_idx ON app_room_scan_jobs(user_id,building_id,created_at)');
}
function roomScanRouter(db,requireAccount){
 const r=express.Router();
 r.use('/buildings/:buildingId/room-scans',requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 r.param('buildingId',(req,res,next,v)=>/^[1-9]\d{0,9}$/.test(v)&&Number(v)<=2147483647?next():res.status(400).json({error:'Ungültiges Gebäude.'}));
 r.param('scanJob',(req,res,next,v)=>UUID.test(v)?next():res.status(400).json({error:'Ungültiger Scan-Auftrag.'}));
 async function building(c,req,lock=false){const b=await accessibleBuilding(c,req.params.buildingId,req.account.id,lock);if(!b)fail('Gebäude nicht gefunden.',404);return b;}
 async function tx(fn){const c=await db.connect();try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 const job=(c,req,lock='')=>c.query(`SELECT * FROM app_room_scan_jobs WHERE id=$1 AND building_id=$2 AND user_id=$3${lock}`,[req.params.scanJob,req.params.buildingId,req.account.id]).then(x=>x.rows[0]);
 const view=j=>Object.fromEntries(SUMMARY.split(',').map(k=>[k,j[k]]));
 r.get('/buildings/:buildingId/room-scans',wrap(async(req,res)=>{
  await building(db,req);
  res.json({available:true,jobs:(await db.query(`SELECT ${SUMMARY} FROM app_room_scan_jobs WHERE building_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 10`,[req.params.buildingId,req.account.id])).rows});
 }));
 // Raw bytes like document uploads: the global 16 kB JSON parser never sees the scan.
 r.post('/buildings/:buildingId/room-scans',express.raw({type:'application/octet-stream',limit:MAX_BODY}),wrap(async(req,res)=>{
  const key=String(req.get('X-Request-ID')||'').toLowerCase();if(!UUID.test(key))fail('Ungültige Anfrage-Kennung.');
  await building(db,req);
  if(!Buffer.isBuffer(req.body)||!req.body.length)fail('Bitte die Scan-Daten senden.');
  let scan;try{scan=JSON.parse(req.body.toString('utf8'));}catch{invalid();}
  const payload=validateScan(scan);
  res.status(202).json(await tx(async c=>{
   const b=await building(c,req,true);
   const old=(await c.query('SELECT id,status,building_id FROM app_room_scan_jobs WHERE user_id=$1 AND request_key=$2',[req.account.id,key])).rows[0];
   if(old){if(old.building_id!==b.id)fail('Diese Anfrage-Kennung wurde bereits verwendet.',409);return {id:old.id,status:old.status};}
   const usage=(await c.query("SELECT COUNT(*) FILTER(WHERE status IN ('queued','running','ready')) active,COUNT(*) FILTER(WHERE created_at>now()-interval '24 hours') today FROM app_room_scan_jobs WHERE user_id=$1",[req.account.id])).rows[0];
   if(Number(usage.active)>=3)fail('Bitte zuerst die vorhandenen Raumscans prüfen oder verwerfen.',429);
   if(Number(usage.today)>=20)fail('Limit erreicht: 20 Raumscans pro Konto innerhalb von 24 Stunden.',429);
   return (await c.query("INSERT INTO app_room_scan_jobs(building_id,user_id,request_key,status,payload) VALUES($1,$2,$3,'queued',$4) RETURNING id,status",[b.id,req.account.id,key,JSON.stringify(payload)])).rows[0];
  }));
 }));
 r.get('/buildings/:buildingId/room-scans/:scanJob',wrap(async(req,res)=>{
  await building(db,req);const j=await job(db,req);if(!j)fail('Scan-Auftrag nicht gefunden.',404);res.json(view(j));
 }));
 r.get('/buildings/:buildingId/room-scans/:scanJob/ifc',wrap(async(req,res)=>{
  await building(db,req);const j=await job(db,req);if(!j?.output_ifc)fail('IFC-Entwurf nicht verfügbar.',404);
  res.set({'Content-Type':'application/x-step','Content-Disposition':'attachment; filename="raumscan-entwurf.ifc"','X-Content-Type-Options':'nosniff'}).send(Buffer.from(j.output_ifc));
 }));
 r.post('/buildings/:buildingId/room-scans/:scanJob/approve',wrap(async(req,res)=>{
  res.json(await tx(async c=>{
   const b=await building(c,req,true);const j=await job(c,req,' FOR UPDATE');if(!j)fail('Scan-Auftrag nicht gefunden.',404);
   if(j.status==='approved'&&j.output_document_id)return {document_id:j.output_document_id};
   if(j.status!=='ready'||!j.output_ifc)fail('Der IFC-Entwurf ist noch nicht bereit.',409);
   const content=Buffer.from(j.output_ifc);
   const used=Number((await c.query('SELECT COALESCE(SUM(d.size),0) total FROM app_documents d JOIN app_buildings b ON b.id=d.building_id WHERE b.user_id=$1',[b.user_id])).rows[0].total);
   if(used+content.length>MAX_ACCOUNT)fail('Speicherlimit erreicht: maximal 250 MB pro Konto.',413);
   const storey=String(j.summary?.storey||'Scan').replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,60);
   const name=`Raumscan ${storey} ${new Date().toISOString().slice(0,10)}.ifc`;
   const d=(await c.query("INSERT INTO app_documents(building_id,name,mime_type,size,content,upload_key) VALUES($1,$2,'application/x-step',$3,$4,$5) RETURNING id,building_id,name,mime_type,size,created_at",[b.id,name,content.length,content,j.id])).rows[0];
   await c.query("UPDATE app_room_scan_jobs SET status='approved',output_document_id=$2,output_ifc=NULL,updated_at=now() WHERE id=$1",[j.id,d.id]);
   await notifyBuilding(c,b.id,req.account.id,'file',`${String(req.account.name||'').split(' ')[0]||'Jemand'} hat ein IFC-Modell aus einem LiDAR-Raumscan hinzugefügt.`);
   return {document_id:d.id,document:d};
  }));
 }));
 r.post('/buildings/:buildingId/room-scans/:scanJob/reject',wrap(async(req,res)=>{
  await tx(async c=>{await building(c,req,true);const done=await c.query("UPDATE app_room_scan_jobs SET status='rejected',payload=NULL,output_ifc=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND building_id=$2 AND user_id=$3 AND status IN ('queued','ready','failed') RETURNING id",[req.params.scanJob,req.params.buildingId,req.account.id]);if(!done.rows.length)fail('Scan-Auftrag nicht gefunden oder bereits abgeschlossen.',409);});
  res.json({ok:true});
 }));
 r.use((e,req,res,next)=>{if(e.type==='entity.too.large')return res.status(413).json({error:'Scan zu groß (maximal 4 MB). Bitte weniger Räume auf einmal senden.'});if(e.type==='entity.parse.failed')return res.status(400).json({error:'Ungültige Anfrage.'});return e.status?res.status(e.status).json({error:e.message}):next(e);});
 return r;
}
module.exports={initRoomScan,roomScanRouter,validateScan};
