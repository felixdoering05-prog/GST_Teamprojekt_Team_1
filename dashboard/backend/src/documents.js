const express = require('express');
const path = require('node:path');
const MAX_FILE = 25 * 1024 * 1024;
const MAX_ACCOUNT = 250 * 1024 * 1024;
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
const idOK = value => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647;
function fileType(buffer, name) {
 const extension=path.extname(name).toLowerCase();
 if(extension==='.pdf' && buffer.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(['.jpg','.jpeg'].includes(extension) && buffer.length>=3 && buffer[0]===255 && buffer[1]===216 && buffer[2]===255)return 'image/jpeg';
 if(extension==='.png' && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(extension==='.webp' && buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP')return 'image/webp';
 if(extension==='.dwg' && /^AC10\d{2}$/.test(buffer.subarray(0,6).toString('ascii')))return 'application/acad';
 return null;
}
async function initDocuments(db) {
 await db.query(`CREATE TABLE IF NOT EXISTS app_documents (
  id SERIAL PRIMARY KEY, building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0),
  content BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query('CREATE INDEX IF NOT EXISTS app_documents_building_idx ON app_documents(building_id)');
 await db.query('ALTER TABLE app_documents ADD COLUMN IF NOT EXISTS upload_key TEXT');
 await db.query('CREATE UNIQUE INDEX IF NOT EXISTS app_documents_upload_key_idx ON app_documents(building_id,upload_key) WHERE upload_key IS NOT NULL');
}
function documentRouter(db,requireAccount) {
 const router=express.Router();
 router.use(requireAccount);
 router.param('buildingId',(req,res,next,value)=>idOK(value)?next():res.status(400).json({error:'Ungültige Gebäude-ID.'}));
 router.param('documentId',(req,res,next,value)=>idOK(value)?next():res.status(400).json({error:'Ungültige Datei-ID.'}));
 const owned=async(req,res)=>{
  const result=await db.query('SELECT id FROM app_buildings WHERE id=$1 AND user_id=$2',[req.params.buildingId,req.account.id]);
  if(!result.rows.length){res.status(404).json({error:'Gebäude nicht gefunden.'});return false;}return true;
 };
 router.get('/buildings/:buildingId/documents',wrap(async(req,res)=>{
  if(!await owned(req,res))return;
  res.json((await db.query('SELECT id,building_id,name,mime_type,size,created_at FROM app_documents WHERE building_id=$1 ORDER BY id DESC',[req.params.buildingId])).rows);
 }));
 // Authenticate before buffering. Files are sent as raw bytes, never as base64 JSON.
 router.post('/buildings/:buildingId/documents',express.raw({type:'application/octet-stream',limit:MAX_FILE}),wrap(async(req,res)=>{
  if(!await owned(req,res))return;
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Bitte eine nicht leere Datei auswählen.'});
  let name;try{name=decodeURIComponent(req.get('X-File-Name')||'')}catch{return res.status(400).json({error:'Ungültiger Dateiname.'})}
  name=name.replace(/[\x00-\x1f\x7f/\\]/g,'_').trim();
  if(!name||name.length>200)return res.status(400).json({error:'Dateiname erforderlich (maximal 200 Zeichen).'});
  const mime=fileType(req.body,name);
  if(!mime)return res.status(415).json({error:'Erlaubt sind PDF, JPG, PNG, WebP und DWG mit passender Dateikennung.'});
  const uploadKey=req.get('X-Upload-ID')||null;
  if(uploadKey&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uploadKey))return res.status(400).json({error:'Ungültige Upload-Kennung.'});
  const client=await db.connect();
  try {
   await client.query('BEGIN');
   // Serialize quota checks for the same account, including simultaneous phone/browser uploads.
   await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id]);
   if(uploadKey) {
    const existing=(await client.query('SELECT * FROM app_documents WHERE building_id=$1 AND upload_key=$2',[req.params.buildingId,uploadKey])).rows[0];
    if(existing) {
     if(!Buffer.from(existing.content).equals(req.body)){await client.query('ROLLBACK');return res.status(409).json({error:'Diese Upload-Kennung wurde bereits für eine andere Datei verwendet.'});}
     const {content,upload_key,...metadata}=existing;
     await client.query('COMMIT');return res.json(metadata);
    }
   }
   const usage=(await client.query('SELECT COALESCE(SUM(d.size),0) AS total FROM app_documents d JOIN app_buildings b ON b.id=d.building_id WHERE b.user_id=$1',[req.account.id])).rows[0];
   if(Number(usage.total)+req.body.length>MAX_ACCOUNT){await client.query('ROLLBACK');return res.status(413).json({error:'Speicherlimit erreicht: maximal 250 MB pro Konto.'});}
   const doc=(await client.query('INSERT INTO app_documents(building_id,name,mime_type,size,content,upload_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,building_id,name,mime_type,size,created_at',[req.params.buildingId,name,mime,req.body.length,req.body,uploadKey])).rows[0];
   await client.query('COMMIT');res.status(201).json(doc);
  } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }));
 // Mutations use the same account lock as uploads to keep quota and delete/retry ordering consistent.
 router.patch('/documents/:documentId',wrap(async(req,res)=>{
  let name=typeof req.body?.name==='string'?req.body.name.trim():'';
  if(!name||name.length>200||/[\x00-\x1f\x7f/\\]/.test(name))return res.status(400).json({error:'Bitte einen Dateinamen ohne Pfad oder Steuerzeichen eingeben (maximal 200 Zeichen).'});
  const client=await db.connect();
  try {
   await client.query('BEGIN');await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id]);
   const doc=(await client.query('SELECT d.id,d.mime_type FROM app_documents d JOIN app_buildings b ON b.id=d.building_id WHERE d.id=$1 AND b.user_id=$2',[req.params.documentId,req.account.id])).rows[0];
   if(!doc){await client.query('ROLLBACK');return res.status(404).json({error:'Datei nicht gefunden.'});}
   const extensions={'application/pdf':['.pdf'],'image/jpeg':['.jpg','.jpeg'],'image/png':['.png'],'image/webp':['.webp'],'application/acad':['.dwg']};
   if(!extensions[doc.mime_type]?.includes(path.extname(name).toLowerCase())){await client.query('ROLLBACK');return res.status(400).json({error:'Die passende Dateiendung muss erhalten bleiben.'});}
   const updated=(await client.query('UPDATE app_documents SET name=$1 WHERE id=$2 RETURNING id,building_id,name,mime_type,size,created_at',[name,doc.id])).rows[0];
   await client.query('COMMIT');res.json(updated);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }));
 router.delete('/documents/:documentId',wrap(async(req,res)=>{
  const client=await db.connect();
  try{
   await client.query('BEGIN');await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id]);
   const removed=await client.query('DELETE FROM app_documents d USING app_buildings b WHERE d.building_id=b.id AND d.id=$1 AND b.user_id=$2 RETURNING d.id',[req.params.documentId,req.account.id]);
   await client.query('COMMIT');
   if(!removed.rows.length)return res.status(404).json({error:'Datei nicht gefunden.'});
   res.json({ok:true});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }));
 router.get('/documents/:documentId',wrap(async(req,res)=>{
  const doc=(await db.query('SELECT d.* FROM app_documents d JOIN app_buildings b ON b.id=d.building_id WHERE d.id=$1 AND b.user_id=$2',[req.params.documentId,req.account.id])).rows[0];
  if(!doc)return res.status(404).json({error:'Datei nicht gefunden.'});
  const encoded=encodeURIComponent(doc.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
  const disposition=doc.mime_type==='application/acad'?'attachment':'inline';
  res.set({'Content-Type':doc.mime_type,'Content-Length':String(doc.size),'Content-Disposition':`${disposition}; filename="document-${doc.id}${path.extname(doc.name).toLowerCase()}"; filename*=UTF-8''${encoded}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});
  res.send(Buffer.from(doc.content));
 }));
 router.use((err,req,res,next)=>{
  if(err.type==='entity.too.large')return res.status(413).json({error:'Maximal 25 MB pro Datei.'});
  next(err);
 });
 return router;
}
module.exports={initDocuments,documentRouter,fileType,MAX_FILE};
