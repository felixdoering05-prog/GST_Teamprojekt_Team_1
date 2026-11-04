const express=require('express');
const {accessibleBuilding}=require('./collaboration');
const {modelIndex}=require('./model-state');
const {homeAssistantService}=require('./home-assistant');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const idOK=value=>/^[1-9]\d{0,9}$/.test(String(value))&&Number(value)<=2147483647;
function ifcRooms(content){
 const text=Buffer.from(content).toString('utf8'),valid=new Set(modelIndex(content).entities.filter(x=>x.type==='rooms').map(x=>x.id)),rooms=[];
 const header=/#(\d+)\s*=\s*IFCSPACE\s*\(/gi;let match;
 while((match=header.exec(text))&&rooms.length<3000){
  const id=Number(match[1]);if(!valid.has(id)||rooms.some(x=>x.id===id))continue;
  let depth=1,quoted=false,field='',fields=[];
  for(let i=header.lastIndex;i<text.length&&i<header.lastIndex+100000;i++){
   const char=text[i];if(char==="'"){field+=char;if(quoted&&text[i+1]==="'"){field+=text[++i];continue;}quoted=!quoted;continue;}
   if(!quoted){if(char==='(')depth++;if(char===')'&&--depth===0){fields.push(field);break;}if(char===','&&depth===1){fields.push(field);field='';continue;}}
   field+=char;
  }
  const decode=value=>{const s=(value||'').trim();return /^'(?:''|[^'])*'$/.test(s)?s.slice(1,-1).replace(/''/g,"'").replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g,(_,hex)=>hex.match(/.{4}/g)?.map(x=>String.fromCharCode(parseInt(x,16))).join('')||'').slice(0,100):'';};
  const name=[decode(fields[2]),decode(fields[7])].filter(Boolean).join(' · ').slice(0,100)||'Raum '+id;rooms.push({id,name});
 }
 return rooms;
}
async function validateRoom(db,building,body){
 const room=typeof body.room==='string'?body.room.trim():'';if(room.length>100)fail('Raumname zu lang.');
 if(body.document_id==null&&body.space_id==null)return {room,document_id:null,space_id:null};
 if(!Number.isInteger(body.document_id)||!Number.isInteger(body.space_id)||!idOK(body.document_id)||!idOK(body.space_id))fail('Bitte einen vollständigen IFC-Raum auswählen.');
 const doc=(await db.query("SELECT content FROM app_documents WHERE id=$1 AND building_id=$2 AND mime_type='application/x-step'",[body.document_id,building])).rows[0];
 if(!doc)fail('IFC-Modell gehört nicht zu diesem Gebäude.',404);const selected=ifcRooms(doc.content).find(x=>x.id===body.space_id);if(!selected)fail('IFC-Raum nicht gefunden.');return {room:selected.name,document_id:body.document_id,space_id:body.space_id};
}
function equipmentRouter(db,requireAccount,options={}){
 const r=express.Router(),ha=homeAssistantService(options);
 r.use(['/buildings/:equipmentBuilding/lamps','/documents/:equipmentDoc/model-rooms','/integrations/home-assistant/lights/:equipmentKey/location','/buildings/:equipmentBuilding/devices/:equipmentDevice/location'],requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 r.get('/documents/:equipmentDoc/model-rooms',wrap(async(req,res)=>{
  if(!idOK(req.params.equipmentDoc))fail('Ungültiges Modell.');
  const doc=(await db.query("SELECT id,building_id,content FROM app_documents WHERE id=$1 AND mime_type='application/x-step'",[req.params.equipmentDoc])).rows[0];
  if(!doc||!await accessibleBuilding(db,doc.building_id,req.account.id))fail('Modell nicht gefunden.',404);res.json({rooms:ifcRooms(doc.content),limit:3000});
 }));
 r.get('/buildings/:equipmentBuilding/lamps',wrap(async(req,res)=>{
  if(!idOK(req.params.equipmentBuilding)||!await accessibleBuilding(db,req.params.equipmentBuilding,req.account.id))fail('Gebäude nicht gefunden.',404);
  const config=ha.configuration(req.account.id);if(!config)return res.json([]);
  const rows=(await db.query('SELECT light_key,building_id,room,document_id,space_id,revision FROM app_lamp_locations WHERE user_id=$1 AND building_id=$2',[req.account.id,req.params.equipmentBuilding])).rows;
  const lamps=await Promise.all(rows.map(async location=>{const light=config.lights.find(x=>x.key===location.light_key);if(!light)return null;try{return {...await ha.state(config,light),location,room:location.room};}catch{return {key:light.key,name:light.name,room:location.room,available:false,is_on:null,supports_rgb:false,rgb:null,brightness:null,location};}}));res.json(lamps.filter(Boolean));
 }));
 r.put('/integrations/home-assistant/lights/:equipmentKey/location',wrap(async(req,res)=>{
  if(!ha.configuration(req.account.id)?.lights.some(x=>x.key===req.params.equipmentKey))fail('Gerät nicht freigegeben.',404);
  const b=req.body||{};if(Object.keys(b).some(x=>!['building_id','room','document_id','space_id','revision'].includes(x))||!Number.isInteger(b.building_id)||!idOK(b.building_id)||!Number.isInteger(b.revision)||b.revision<0)fail('Bitte die Zuordnung prüfen.');
  const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id]);
   const building=await accessibleBuilding(c,b.building_id,req.account.id);if(!building||building.user_id!==req.account.id)fail('Bitte ein eigenes Gebäude auswählen.',403);
   const old=(await c.query('SELECT revision FROM app_lamp_locations WHERE user_id=$1 AND light_key=$2',[req.account.id,req.params.equipmentKey])).rows[0];if((old?.revision||0)!==b.revision)fail('Zuordnung inzwischen geändert. Bitte neu laden.',409);
   const room=await validateRoom(c,b.building_id,b);
   const result=(await c.query(`INSERT INTO app_lamp_locations(user_id,light_key,building_id,room,document_id,space_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,light_key) DO UPDATE SET building_id=EXCLUDED.building_id,room=EXCLUDED.room,document_id=EXCLUDED.document_id,space_id=EXCLUDED.space_id,revision=app_lamp_locations.revision+1 RETURNING building_id,room,document_id,space_id,revision`,[req.account.id,req.params.equipmentKey,b.building_id,room.room,room.document_id,room.space_id])).rows[0];await c.query('COMMIT');res.json(result);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 r.put('/buildings/:equipmentBuilding/devices/:equipmentDevice/location',wrap(async(req,res)=>{
  const b=req.body||{};if(!idOK(req.params.equipmentBuilding)||!idOK(req.params.equipmentDevice)||Object.keys(b).some(x=>!['building_id','room','document_id','space_id','revision'].includes(x))||!Number.isInteger(b.building_id)||!idOK(b.building_id)||!Number.isInteger(b.revision))fail('Bitte die Zuordnung prüfen.');
  const c=await db.connect();try{await c.query('BEGIN');const source=await accessibleBuilding(c,req.params.equipmentBuilding,req.account.id,true),target=await accessibleBuilding(c,b.building_id,req.account.id);
   if(!source||!target)fail('Gebäude nicht gefunden.',404);if(source.id!==target.id&&(source.user_id!==req.account.id||target.user_id!==req.account.id))fail('Gebäudewechsel nur zwischen eigenen Gebäuden.',403);
   const old=(await c.query('SELECT revision FROM app_devices WHERE id=$1 AND building_id=$2 FOR UPDATE',[req.params.equipmentDevice,source.id])).rows[0];if(!old)fail('Gerät nicht gefunden.',404);if(old.revision!==b.revision)fail('Gerät inzwischen geändert. Bitte neu laden.',409);
   if(source.id!==target.id&&Number((await c.query('SELECT COUNT(*) n FROM app_devices WHERE building_id=$1',[target.id])).rows[0].n)>=100)fail('Zielgebäude enthält bereits 100 Geräte.',409);
   const room=await validateRoom(c,target.id,b);const result=(await c.query('UPDATE app_devices SET building_id=$2,room=$3,document_id=$4,space_id=$5,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[req.params.equipmentDevice,target.id,room.room,room.document_id,room.space_id])).rows[0];await c.query('COMMIT');res.json(result);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 r.use((e,req,res,next)=>e.status?res.status(e.status).json({error:e.message}):next(e));return r;
}
module.exports={equipmentRouter,ifcRooms,validateRoom};
