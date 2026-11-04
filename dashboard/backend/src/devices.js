const express=require('express');
const {accessibleBuilding}=require('./collaboration');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const idOK=v=>/^[1-9]\d*$/.test(String(v))&&Number(v)<=2147483647;
const fields='id,building_id,name,room,kind,mode,integration,is_on,revision,document_id,space_id,rgb,brightness,created_at,updated_at';
async function initDevices(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_devices (
 id SERIAL PRIMARY KEY,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),room TEXT NOT NULL DEFAULT '' CHECK(length(room)<=100),
 kind TEXT NOT NULL CHECK(kind IN ('light','plug','temperature','contact')),
 mode TEXT NOT NULL CHECK(mode IN ('simulation','planned')),
 integration TEXT NOT NULL CHECK(integration IN ('none','home-assistant','mqtt','matter')),
 is_on BOOLEAN NOT NULL DEFAULT false,revision INTEGER NOT NULL DEFAULT 0,
 request_key TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(building_id,request_key),CHECK((mode='simulation' AND integration='none') OR mode='planned'))`);
 await db.query('ALTER TABLE app_devices ADD COLUMN IF NOT EXISTS document_id INTEGER REFERENCES app_documents(id) ON DELETE SET NULL');
 await db.query('ALTER TABLE app_devices ADD COLUMN IF NOT EXISTS space_id INTEGER');
 await db.query("ALTER TABLE app_devices ADD COLUMN IF NOT EXISTS rgb JSONB NOT NULL DEFAULT '[255,211,92]'");
 await db.query('ALTER TABLE app_devices ADD COLUMN IF NOT EXISTS brightness INTEGER NOT NULL DEFAULT 255');
 await db.query('CREATE INDEX IF NOT EXISTS app_devices_building_idx ON app_devices(building_id)');
}
function devicesRouter(db,requireAccount){
 const r=express.Router();const base='/buildings/:deviceBuilding/devices';
 r.use(base,requireAccount,(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  if(!idOK(req.params.deviceBuilding))return res.status(400).json({error:'Ungültiges Gebäude.'});next();
 });
 r.get(base,wrap(async(req,res)=>{
  if(!await accessibleBuilding(db,req.params.deviceBuilding,req.account.id))return res.status(404).json({error:'Gebäude nicht gefunden.'});
  res.json((await db.query(`SELECT ${fields} FROM app_devices WHERE building_id=$1 ORDER BY room,name,id`,[req.params.deviceBuilding])).rows);
 }));
 async function write(req,res,create){
  const c=await db.connect();try{
   await c.query('BEGIN');
   if(!await accessibleBuilding(c,req.params.deviceBuilding,req.account.id,true)){await c.query('ROLLBACK');return res.status(404).json({error:'Gebäude nicht gefunden.'});}
   const b=req.body||{};let result;
   if(create){
    const name=typeof b.name==='string'?b.name.trim():'',room=typeof b.room==='string'?b.room.trim():'';
    if(Object.keys(b).some(k=>!['name','room','kind','mode','integration','request_key'].includes(k))||!name||name.length>100||room.length>100||!['light','plug','temperature','contact'].includes(b.kind)||!['simulation','planned'].includes(b.mode)||!['none','home-assistant','mqtt','matter'].includes(b.integration)||b.mode==='simulation'&&b.integration!=='none'||typeof b.request_key!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.request_key))throw Object.assign(Error('Bitte Name, Gerätetyp und Betriebsart prüfen.'),{status:400});
    const existing=(await c.query(`SELECT ${fields} FROM app_devices WHERE building_id=$1 AND request_key=$2`,[req.params.deviceBuilding,b.request_key])).rows[0];
    if(existing){if(existing.name!==name||existing.room!==room||existing.kind!==b.kind||existing.mode!==b.mode||existing.integration!==b.integration)throw Object.assign(Error('Diese Anlage wurde bereits mit anderen Angaben gespeichert.'),{status:409});result=existing;}
    else{
     const count=Number((await c.query('SELECT COUNT(*) AS n FROM app_devices WHERE building_id=$1',[req.params.deviceBuilding])).rows[0].n);
     if(count>=100)throw Object.assign(Error('Maximal 100 Geräte pro Gebäude.'),{status:409});
     result=(await c.query(`INSERT INTO app_devices(building_id,name,room,kind,mode,integration,request_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${fields}`,[req.params.deviceBuilding,name,room,b.kind,b.mode,b.integration,b.request_key])).rows[0];
    }
   }else{
    if(!idOK(req.params.deviceID)||Object.keys(b).some(k=>!['is_on','revision','rgb','brightness'].includes(k))||typeof b.is_on!=='boolean'||!Number.isInteger(b.revision)||b.revision<0)throw Object.assign(Error('Ungültiger Schaltauftrag.'),{status:400});
    if(b.rgb!==undefined&&(!Array.isArray(b.rgb)||b.rgb.length!==3||b.rgb.some(x=>!Number.isInteger(x)||x<0||x>255))||b.brightness!==undefined&&(!Number.isInteger(b.brightness)||b.brightness<1||b.brightness>255))throw Object.assign(Error('Ungültige Lichtfarbe.'),{status:400});
    const old=(await c.query('SELECT mode,kind,revision FROM app_devices WHERE id=$1 AND building_id=$2 FOR UPDATE',[req.params.deviceID,req.params.deviceBuilding])).rows[0];
    if(!old)throw Object.assign(Error('Gerät nicht gefunden.'),{status:404});
    if(old.mode!=='simulation'||!['light','plug'].includes(old.kind))throw Object.assign(Error('Nur simulierte Lampen und Steckdosen lassen sich schalten. Echte Geräte sind noch nicht verbunden.'),{status:409});
    if(old.revision!==b.revision)throw Object.assign(Error('Das Gerät wurde inzwischen geändert. Bitte neu laden.'),{status:409});
    result=(await c.query(`UPDATE app_devices SET is_on=$3,rgb=COALESCE($4::jsonb,rgb),brightness=COALESCE($5,brightness),revision=revision+1,updated_at=now() WHERE id=$1 AND building_id=$2 RETURNING ${fields}`,[req.params.deviceID,req.params.deviceBuilding,b.is_on,b.rgb?JSON.stringify(b.rgb):null,b.brightness??null])).rows[0];
   }
   await c.query('COMMIT');res.status(create?201:200).json(result);
  }catch(e){await c.query('ROLLBACK');if(e.status)return res.status(e.status).json({error:e.message});throw e;}finally{c.release();}
 }
 r.post(base,wrap((req,res)=>write(req,res,true)));
 r.patch(base+'/:deviceID',wrap((req,res)=>write(req,res,false)));
 return r;
}
module.exports={initDevices,devicesRouter};
