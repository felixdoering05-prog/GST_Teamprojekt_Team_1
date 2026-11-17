const express=require('express');
const {accessibleBuilding}=require('./collaboration');
const {service}=require('./twin');
const {ifcRooms}=require('./equipment');

// Sensoren automatisch den Raum-Popups eines IFC-Modells zuordnen. Eindeutige Namensgleichheit zwischen Raum-Datensatz
// und IfcSpace wird automatisch verknüpft; fehlt das Gebäude, der Raum oder ist der Treffer nicht eindeutig, fragt die
// Weboberfläche nach. Die IFC-Datei bleibt unverändert, verknüpft wird über Room.ifc_global_id.
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(e=>e.status&&!res.headersSent?res.status(e.status).json({error:e.message}):next(e));
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const idOK=value=>/^[1-9]\d{0,9}$/.test(String(value))&&Number(value)<=2147483647;
const GID=/^[0-9A-Za-z_$]{22}$/;
/** Vergleichsform eines Raumnamens: Kleinbuchstaben, nur Buchstaben/Ziffern. */
const normalize=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');

async function initSensorPlacement(db){
 await db.query('CREATE TABLE IF NOT EXISTS app_sensor_placement_skips(document_id INTEGER NOT NULL REFERENCES app_documents(id) ON DELETE CASCADE,sensor_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(document_id,sensor_id))');
}

/** IfcSpaces des Modells mit GlobalId und Vergleichsnamen. */
function modelSpaces(content){
 const gids=new Map(),text=Buffer.from(content).toString('latin1');
 for(const m of text.matchAll(/#(\d+)\s*=\s*IFCSPACE\s*\(\s*'([0-9A-Za-z_$]{22})'/gi))if(!gids.has(Number(m[1])))gids.set(Number(m[1]),m[2]);
 return ifcRooms(content).filter(room=>gids.has(room.id)).map(room=>{
  const parts=room.name.split(' · ').filter(Boolean);
  return {id:room.id,name:room.name,gid:gids.get(room.id),keys:new Set([room.name,...parts].map(normalize).filter(Boolean))};
 });
}

/** Eindeutiger IfcSpace für einen Raum-Datensatz anhand von Name oder Raumnummer, sonst null. */
function matchSpace(spaces,room){
 const keys=[room?.name,room?.room_code,...String(room?.name||'').split(' · ')].map(normalize).filter(Boolean);
 if(!keys.length)return null;
 const found=spaces.filter(space=>keys.some(key=>space.keys.has(key)));
 return found.length===1?found[0]:null;
}

async function loadContext(c,documentID,account,lock){
 if(!idOK(documentID))fail('Ungültiges Modell.');
 const doc=(await c.query("SELECT id,building_id,content FROM app_documents WHERE id=$1 AND mime_type='application/x-step'",[documentID])).rows[0];
 const building=doc&&await accessibleBuilding(c,doc.building_id,account,lock);
 if(!building)fail('Modell nicht gefunden.',404);
 return {doc,building,spaces:modelSpaces(doc.content),api:service(c,building.user_id).entities};
}

/** Sensoren, die in diesem Modell noch keinen Raum haben (eigenes Gebäude, oder ohne Gebäude beim Eigentümer). */
async function pendingSensors(c,{doc,building,spaces,api},account){
 const rows=(await c.query(`SELECT id,data FROM app_twin_records WHERE user_id=$1 AND entity='Sensor' AND coalesce(data->>'status','aktiv')='aktiv' AND coalesce(data->>'source','')<>'demo'
  AND (data->>'building_id'=$2 OR ($3 AND coalesce(data->>'building_id','')='')) ORDER BY created_at,id LIMIT 300`,[building.user_id,String(building.id),building.user_id===account])).rows;
 const skipped=new Set((await c.query('SELECT sensor_id FROM app_sensor_placement_skips WHERE document_id=$1',[doc.id])).rows.map(r=>r.sensor_id));
 const roomIDs=[...new Set(rows.map(r=>r.data.room_id).filter(Boolean))];
 const rooms=new Map(roomIDs.length?(await c.query("SELECT id,data FROM app_twin_records WHERE user_id=$1 AND entity='Room' AND id=ANY($2)",[building.user_id,roomIDs])).rows.map(r=>[r.id,{...r.data,id:r.id}]):[]);
 const result=[];
 for(const row of rows){
  if(skipped.has(row.id))continue;
  const room=row.data.room_id?rooms.get(row.data.room_id):null;
  if(room?.source==='demo')continue;
  if(room&&GID.test(room.ifc_global_id||''))continue; // bereits einem IFC-Raum zugeordnet (dieses oder ein anderes Modell)
  result.push({sensor:{...row.data,id:row.id},room});
 }
 return result;
}

/** Raum mit dieser GlobalId (nicht Demo) oder null. */
async function roomForGid(api,building,gid){
 return (await api.Room.filter({building_id:String(building.id),ifc_global_id:gid},{limit:5})).items.find(r=>r.source!=='demo')||null;
}

/** Ordnet einen Sensor einem IfcSpace zu: verknüpft seinen bisherigen Raum oder hängt ihn an den IFC-Raum. */
async function place(ctx,sensor,room,space){
 const {api,building,doc}=ctx;
 const existing=await roomForGid(api,building,space.gid);
 let target=existing;
 if(!target&&room&&!GID.test(room.ifc_global_id||''))target=await api.Room.update(room.id,{ifc_global_id:space.gid,building_id:String(building.id)});
 const parts=space.name.split(' · ').filter(Boolean); // „Nummer · Langname“ aus dem IFC
 if(!target)target=await api.Room.create({name:(parts.length>1?parts.slice(1).join(' · '):space.name).slice(0,100),room_code:(parts[0]||`IFC-${space.id}`).slice(0,60),building_id:String(building.id),ifc_global_id:space.gid,source:'real',notes:`Aus IFC-Dokument ${doc.id}, IfcSpace #${space.id}`});
 const patch={room_id:target.id};if(sensor.building_id!==String(building.id))patch.building_id=String(building.id);
 if(sensor.room_id!==target.id||patch.building_id)await api.Sensor.update(sensor.id,patch);
 return target;
}

const reasonOf=(entry,ctx)=>!entry.sensor.building_id?'no-building':!entry.room?'no-room':'room-not-in-model';
const publicSensor=({sensor,room})=>({id:sensor.id,name:sensor.name||sensor.sensor_code,sensor_code:sensor.sensor_code,metric:sensor.metric,room:room?.name||null,building_id:sensor.building_id||null});

function sensorPlacementRouter(db,requireAccount){
 const r=express.Router();
 // Beim Öffnen eines Modells: eindeutige Treffer automatisch verknüpfen, offene Fragen zurückgeben.
 r.post('/documents/:placementDoc/sensor-placement/sync',requireAccount,wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(Object.keys(req.body||{}).length)fail('Keine Angaben erwartet.');
  const c=await db.connect();try{await c.query('BEGIN');
   const ctx=await loadContext(c,req.params.placementDoc,req.account.id,true);
   const linked=[],open=[];
   for(const entry of await pendingSensors(c,ctx,req.account.id)){
    const space=entry.sensor.building_id&&entry.room?matchSpace(ctx.spaces,entry.room):null;
    if(space){await place(ctx,entry.sensor,entry.room,space);linked.push({...publicSensor(entry),space_id:space.id,space:space.name});continue;}
    const suggestion=matchSpace(ctx.spaces,entry.room)||null;
    open.push({...publicSensor(entry),reason:reasonOf(entry,ctx),suggested_space_id:suggestion?.id??null});
    if(open.length>=50)break;
   }
   await c.query('COMMIT');
   res.json({document_id:ctx.doc.id,building_id:ctx.building.id,linked,open,spaces:ctx.spaces.map(({id,name})=>({id,name}))});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 // Antwort auf die Nachfrage: Sensor einem IfcSpace dieses Modells zuordnen oder für dieses Modell überspringen.
 r.put('/documents/:placementDoc/sensor-placement/:placementSensor',requireAccount,wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const b=req.body||{},skip=b.skip===true;
  if(Object.keys(b).some(k=>!['space_id','skip'].includes(k))||(skip?Object.hasOwn(b,'space_id'):!Number.isInteger(b.space_id)||!idOK(b.space_id))||typeof req.params.placementSensor!=='string'||req.params.placementSensor.length>100)fail('Bitte einen Raum im Modell auswählen.');
  const c=await db.connect();try{await c.query('BEGIN');
   const ctx=await loadContext(c,req.params.placementDoc,req.account.id,true);
   const entry=(await pendingSensors(c,ctx,req.account.id)).find(x=>x.sensor.id===req.params.placementSensor);
   if(!entry)fail('Sensor nicht gefunden oder bereits zugeordnet.',404);
   if(skip){await c.query('INSERT INTO app_sensor_placement_skips(document_id,sensor_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[ctx.doc.id,entry.sensor.id]);await c.query('COMMIT');return res.json({skipped:true});}
   const space=ctx.spaces.find(s=>s.id===b.space_id);if(!space)fail('Raum nicht im Modell gefunden.',404);
   const room=await place(ctx,entry.sensor,entry.room,space);
   await c.query('COMMIT');res.json({sensor_id:entry.sensor.id,room_id:room.id,space_id:space.id,space:space.name});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 return r;
}

module.exports={initSensorPlacement,sensorPlacementRouter,normalize,matchSpace,modelSpaces};
