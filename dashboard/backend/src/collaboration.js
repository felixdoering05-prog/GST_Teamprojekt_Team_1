const express=require('express');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const idOK=v=>/^[1-9]\d*$/.test(String(v))&&Number(v)<=2147483647;
const firstName=name=>String(name).trim().split(/\s+/)[0].slice(0,100);
async function initCollaboration(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_contacts (
 id SERIAL PRIMARY KEY, low_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 high_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 requester_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(low_id,high_id), CHECK(low_id<high_id))`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_contact_attempts (user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query('CREATE INDEX IF NOT EXISTS app_contact_attempt_idx ON app_contact_attempts(user_id,created_at)');
 await db.query(`CREATE TABLE IF NOT EXISTS app_building_members (
 building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(building_id,user_id))`);
 await db.query('CREATE INDEX IF NOT EXISTS app_member_user_idx ON app_building_members(user_id,status)');
 await db.query(`CREATE TABLE IF NOT EXISTS app_messages (
 id SERIAL PRIMARY KEY,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),request_key TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(building_id,user_id,request_key))`);
 await db.query('CREATE INDEX IF NOT EXISTS app_messages_building_idx ON app_messages(building_id,id)');
 await db.query('ALTER TABLE app_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
 await db.query(`CREATE TABLE IF NOT EXISTS app_notifications (
 id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,title TEXT NOT NULL,building_id INTEGER REFERENCES app_buildings(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),read_at TIMESTAMPTZ)`);
 await db.query('CREATE INDEX IF NOT EXISTS app_notifications_user_idx ON app_notifications(user_id,id)');
 await db.query('ALTER TABLE app_notifications ADD COLUMN IF NOT EXISTS message_id INTEGER REFERENCES app_messages(id) ON DELETE SET NULL');
}
const accessSQL=`(b.user_id=$2 OR EXISTS(SELECT 1 FROM app_building_members m WHERE m.building_id=b.id AND m.user_id=$2 AND m.status='accepted'))`;
async function accessibleBuilding(db,id,user,lock=false){
 if(lock){
  const found=await accessibleBuilding(db,id,user);if(!found)return null;
  // Match the existing twin API: quota owner first, building second. Recheck membership under lock.
  await db.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[found.user_id]);
 }
 return (await db.query(`SELECT b.* FROM app_buildings b WHERE b.id=$1 AND ${accessSQL}${lock?' FOR UPDATE OF b':''}`,[id,user])).rows[0];
}
async function notify(db,user,kind,title,building=null){await db.query('INSERT INTO app_notifications(user_id,kind,title,building_id) VALUES($1,$2,$3,$4)',[user,kind,title,building]);}
async function notifyBuilding(db,building,actor,kind,title,message=null){
 await db.query(`INSERT INTO app_notifications(user_id,kind,title,building_id,message_id)
 SELECT user_id,$3,$4,$1,$5 FROM (SELECT user_id FROM app_buildings WHERE id=$1 UNION SELECT user_id FROM app_building_members WHERE building_id=$1 AND status='accepted') recipients WHERE user_id<>$2`,[building,actor,kind,title,message]);
}
async function transaction(db,fn){const c=await db.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function respondTransaction(db,res,fn){
 let status=200,payload={ok:true};
 const deferred={status(value){status=value;return this;},json(value){payload=value;return null;}};
 await transaction(db,c=>fn(c,deferred));res.status(status).json(payload);
}
function collaborationRouter(db,requireAccount){
 const r=express.Router(); r.use(requireAccount);
 for(const key of ['contactId','buildingId','memberId','notificationId'])r.param(key,(req,res,next,v)=>idOK(v)?next():res.status(400).json({error:'Ungültige Kennung.'}));
 const fail=(res,status,error)=>{res.status(status).json({error});return null;};
 r.get('/contacts',wrap(async(req,res)=>{
  const rows=(await db.query(`SELECT c.id,c.status,c.requester_id,c.low_id,c.high_id,u.id AS user_id,u.name FROM app_contacts c JOIN app_users u ON u.id=CASE WHEN c.low_id=$1 THEN c.high_id ELSE c.low_id END WHERE (c.low_id=$1 OR c.high_id=$1) AND (c.status='accepted' OR c.requester_id<>$1) ORDER BY c.id DESC`,[req.account.id])).rows;
  res.json(rows.map(x=>({id:x.id,user_id:x.user_id,name:firstName(x.name),status:x.status})));
 }));
 r.post('/contacts',wrap(async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))return fail(res,400,'Bitte eine gültige E-Mail eingeben.');
  const result=await transaction(db,async c=>{
   await c.query('SELECT id FROM app_users WHERE id=$1 FOR NO KEY UPDATE',[req.account.id]);
   await c.query("DELETE FROM app_contact_attempts WHERE created_at<now()-interval '1 hour'");
   const count=Number((await c.query('SELECT COUNT(*) AS count FROM app_contact_attempts WHERE user_id=$1',[req.account.id])).rows[0].count);
   if(count>=20)return false;
   await c.query('INSERT INTO app_contact_attempts(user_id) VALUES($1)',[req.account.id]);
   const target=(await c.query('SELECT id FROM app_users WHERE email=$1',[email])).rows[0];
   if(target&&target.id!==req.account.id){
    const inserted=await c.query(`INSERT INTO app_contacts(low_id,high_id,requester_id) VALUES($1,$2,$3) ON CONFLICT(low_id,high_id) DO NOTHING RETURNING id`,[Math.min(target.id,req.account.id),Math.max(target.id,req.account.id),req.account.id]);
    if(inserted.rows.length)await notify(c,target.id,'contact',`${firstName(req.account.name)} möchte sich mit dir vernetzen.`);
   }return true;
  });
  if(!result)return fail(res,429,'Zu viele Kontaktanfragen. Bitte später erneut versuchen.');
  res.json({message:'Falls das Konto vorhanden ist, liegt dort jetzt deine Anfrage. Der Kontakt erscheint nach der Annahme.'});
 }));
 r.post('/contacts/:contactId/accept',wrap(async(req,res)=>{
  await respondTransaction(db,res,async(c,res)=>{
   const row=(await c.query(`UPDATE app_contacts SET status='accepted' WHERE id=$1 AND (low_id=$2 OR high_id=$2) AND requester_id<>$2 AND status='pending' RETURNING requester_id`,[req.params.contactId,req.account.id])).rows[0];
   if(!row)return fail(res,404,'Kontaktanfrage nicht gefunden.');
   await notify(c,row.requester_id,'contact',`${firstName(req.account.name)} hat deine Kontaktanfrage angenommen.`);res.json({ok:true});
  });
 }));
 r.delete('/contacts/:contactId',wrap(async(req,res)=>{
  const result=await db.query('DELETE FROM app_contacts WHERE id=$1 AND (low_id=$2 OR high_id=$2) RETURNING id',[req.params.contactId,req.account.id]);
  if(!result.rows.length)return fail(res,404,'Kontakt nicht gefunden.');res.json({ok:true});
 }));
 r.get('/building-invitations',wrap(async(req,res)=>res.json((await db.query(`SELECT b.id,b.name,b.address,u.name AS owner_name FROM app_building_members m JOIN app_buildings b ON b.id=m.building_id JOIN app_users u ON u.id=b.user_id WHERE m.user_id=$1 AND m.status='pending' ORDER BY b.id`,[req.account.id])).rows.map(x=>({...x,owner_name:firstName(x.owner_name)})))));
 r.post('/buildings/:buildingId/invitation',wrap(async(req,res)=>{
  if(!['accept','decline'].includes(req.body?.action))return fail(res,400,'Bitte annehmen oder ablehnen.');
  await respondTransaction(db,res,async(c,res)=>{
   await c.query('SELECT id FROM app_buildings WHERE id=$1 FOR UPDATE',[req.params.buildingId]);
   const row=(await c.query(`SELECT status FROM app_building_members WHERE building_id=$1 AND user_id=$2`,[req.params.buildingId,req.account.id])).rows[0];
   if(!row||row.status!=='pending')return fail(res,404,'Einladung nicht gefunden.');
   if(req.body.action==='accept')await c.query("UPDATE app_building_members SET status='accepted' WHERE building_id=$1 AND user_id=$2",[req.params.buildingId,req.account.id]);
   else await c.query('DELETE FROM app_building_members WHERE building_id=$1 AND user_id=$2',[req.params.buildingId,req.account.id]);
   res.json({ok:true});
  });
 }));
 r.get('/buildings/:buildingId/members',wrap(async(req,res)=>{
  if(!await accessibleBuilding(db,req.params.buildingId,req.account.id))return fail(res,404,'Gebäude nicht gefunden.');
  const rows=(await db.query(`SELECT u.id,u.name,'owner' AS status FROM app_users u JOIN app_buildings b ON b.user_id=u.id WHERE b.id=$1 UNION ALL SELECT u.id,u.name,m.status FROM app_users u JOIN app_building_members m ON m.user_id=u.id WHERE m.building_id=$1 ORDER BY id`,[req.params.buildingId])).rows;
  res.json(rows.map(x=>({...x,name:firstName(x.name)})));
 }));
 r.post('/buildings/:buildingId/members',wrap(async(req,res)=>{
  const target=String(req.body?.user_id||'');if(!idOK(target))return fail(res,400,'Bitte einen Kontakt auswählen.');
  await respondTransaction(db,res,async(c,res)=>{
   const b=await accessibleBuilding(c,req.params.buildingId,req.account.id,true);
   if(!b||b.user_id!==req.account.id)return fail(res,404,'Gebäude nicht gefunden oder keine Eigentümerrechte.');
   if(Number(target)===req.account.id)return fail(res,400,'Du bist bereits Eigentümer.');
   const contact=(await c.query("SELECT id FROM app_contacts WHERE low_id=$1 AND high_id=$2 AND status='accepted'",[Math.min(target,req.account.id),Math.max(target,req.account.id)])).rows[0];
   if(!contact)return fail(res,400,'Bitte zuerst die Kontaktanfrage bestätigen lassen.');
   if(Number((await c.query('SELECT COUNT(*) AS count FROM app_building_members WHERE building_id=$1',[b.id])).rows[0].count)>=50)return fail(res,400,'Maximal 50 Mitglieder pro Gebäude.');
   const added=await c.query('INSERT INTO app_building_members(building_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',[b.id,target]);
   if(added.rows.length)await notify(c,target,'invitation',`${firstName(req.account.name)} lädt dich zu „${b.name}“ ein.`,b.id);
   res.json({ok:true});
  });
 }));
 r.delete('/buildings/:buildingId/members/:memberId',wrap(async(req,res)=>{
  await respondTransaction(db,res,async(c,res)=>{
   const b=await accessibleBuilding(c,req.params.buildingId,req.account.id,true);
   if(!b||(b.user_id!==req.account.id&&Number(req.params.memberId)!==req.account.id))return fail(res,404,'Gebäude nicht gefunden.');
   await c.query('DELETE FROM app_building_members WHERE building_id=$1 AND user_id=$2',[b.id,req.params.memberId]);
   await c.query('DELETE FROM app_notifications WHERE building_id=$1 AND user_id=$2',[b.id,req.params.memberId]);res.json({ok:true});
  });
 }));
 r.patch('/buildings/:buildingId',wrap(async(req,res)=>{
  const name=String(req.body?.name||'').trim(),address=String(req.body?.address||'').trim();
  if(!name||name.length>200||address.length>500)return fail(res,400,'Bitte Gebäudenamen und gültige Adresse eingeben.');
  await respondTransaction(db,res,async(c,res)=>{const b=await accessibleBuilding(c,req.params.buildingId,req.account.id,true);if(!b)return fail(res,404,'Gebäude nicht gefunden.');
   await c.query('UPDATE app_buildings SET name=$1,address=$2 WHERE id=$3',[name,address,b.id]);res.json({ok:true});});
 }));
 r.get('/buildings/:buildingId/messages',wrap(async(req,res)=>{
  if(!await accessibleBuilding(db,req.params.buildingId,req.account.id))return fail(res,404,'Gebäude nicht gefunden.');
  if(req.query.ids!==undefined){
   const ids=String(req.query.ids).split(',');if(!ids.length||ids.length>500||ids.some(id=>!idOK(id)))return fail(res,400,'Ungültige Nachrichtenauswahl.');
   const rows=(await db.query('SELECT m.id,m.user_id,m.text,m.created_at,(m.deleted_at IS NOT NULL) AS deleted,u.name FROM app_messages m JOIN app_users u ON u.id=m.user_id WHERE m.building_id=$1 AND m.id=ANY($2::int[]) ORDER BY m.id',[req.params.buildingId,ids.map(Number)])).rows;
   return res.json(rows.map(x=>({...x,name:firstName(x.name)})));
  }
  const before=req.query.before||2147483647;if(!idOK(before))return fail(res,400,'Ungültige Nachrichten-Kennung.');
  const rows=(await db.query(`SELECT m.id,m.user_id,m.text,m.created_at,(m.deleted_at IS NOT NULL) AS deleted,u.name FROM app_messages m JOIN app_users u ON u.id=m.user_id WHERE m.building_id=$1 AND m.id<$2 ORDER BY m.id DESC LIMIT 50`,[req.params.buildingId,before])).rows;
  res.json(rows.reverse().map(x=>({...x,name:firstName(x.name)})));
 }));
 r.post('/buildings/:buildingId/messages',wrap(async(req,res)=>{
  const text=typeof req.body?.text==='string'?req.body.text.trim():'';const key=req.get('X-Request-ID')||'';
  if(!text||text.length>2000||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))return fail(res,400,'Nachricht: 1–2000 Zeichen und gültige Anfrage-Kennung erforderlich.');
  await respondTransaction(db,res,async(c,res)=>{
   const b=await accessibleBuilding(c,req.params.buildingId,req.account.id,true);if(!b)return fail(res,404,'Gebäude nicht gefunden.');
   const existing=(await c.query('SELECT id,text,deleted_at FROM app_messages WHERE building_id=$1 AND user_id=$2 AND request_key=$3',[b.id,req.account.id,key])).rows[0];
   if(existing){if(existing.deleted_at)return fail(res,409,'Diese Nachricht wurde gelöscht.');if(existing.text!==text)return fail(res,409,'Die Kennung gehört zu einer anderen Nachricht.');return res.json({ok:true});}
   const count=Number((await c.query("SELECT COUNT(*) AS count FROM app_messages WHERE user_id=$1 AND building_id=$2 AND created_at>now()-interval '1 minute'",[req.account.id,b.id])).rows[0].count);
   if(count>=20)return fail(res,429,'Bitte kurz warten, bevor du weitere Nachrichten sendest.');
   const inserted=(await c.query('INSERT INTO app_messages(building_id,user_id,text,request_key) VALUES($1,$2,$3,$4) RETURNING id',[b.id,req.account.id,text,key])).rows[0];
   await notifyBuilding(c,b.id,req.account.id,'chat',`${firstName(req.account.name)}: ${text.slice(0,120)}`,inserted.id);res.status(201).json({ok:true});
  });
 }));
 r.delete('/buildings/:buildingId/messages/:messageId',wrap(async(req,res)=>{
  if(!idOK(req.params.messageId))return fail(res,400,'Ungültige Nachrichten-Kennung.');
  await respondTransaction(db,res,async(c,res)=>{
   const b=await accessibleBuilding(c,req.params.buildingId,req.account.id,true);if(!b)return fail(res,404,'Gebäude nicht gefunden.');
   const changed=await c.query("UPDATE app_messages SET text='Nachricht gelöscht',deleted_at=COALESCE(deleted_at,now()) WHERE id=$1 AND building_id=$2 AND user_id=$3 RETURNING id",[req.params.messageId,b.id,req.account.id]);
   if(!changed.rows.length)return fail(res,404,'Eigene Nachricht nicht gefunden.');
   await c.query("UPDATE app_notifications SET title='Eine Nachricht wurde gelöscht.' WHERE message_id=$1 AND kind='chat'",[req.params.messageId]);res.json({ok:true});
  });
 }));
 r.get('/notifications',wrap(async(req,res)=>{
  const rows=(await db.query(`SELECT n.id,n.kind,n.title,n.building_id,n.created_at,n.read_at FROM app_notifications n WHERE n.user_id=$1 AND (n.building_id IS NULL OR EXISTS(SELECT 1 FROM app_buildings b WHERE b.id=n.building_id AND (b.user_id=$1 OR EXISTS(SELECT 1 FROM app_building_members m WHERE m.building_id=b.id AND m.user_id=$1)))) ORDER BY n.id DESC LIMIT 200`,[req.account.id])).rows;
  res.json(rows);
 }));
 r.post('/notifications/:notificationId/read',wrap(async(req,res)=>{
  await db.query('UPDATE app_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2',[req.params.notificationId,req.account.id]);res.json({ok:true});
 }));
 return r;
}
module.exports={initCollaboration,collaborationRouter,accessibleBuilding,accessSQL,notifyBuilding};
