const express=require('express');
const {createHash}=require('node:crypto');
const {accessibleBuilding}=require('./collaboration');
const {deviceControlEnabled}=require('./ai-preferences');
const {homeAssistantService,executeLampCommand}=require('./home-assistant');
const {haLamps}=require('./ha-import');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
async function deviceContext(db,user,building,options={}){
 if(!await deviceControlEnabled(db,user)||!await accessibleBuilding(db,building,user))return [];
 const ha=homeAssistantService(options),config=ha.configuration(user);if(!config)return [];
 const rows=(await db.query('SELECT light_key,room FROM app_lamp_locations WHERE user_id=$1 AND building_id=$2 ORDER BY light_key',[user,building])).rows;
 return rows.flatMap(row=>{const l=config.lights.find(x=>x.key===row.light_key);return l?[{key:l.key,name:l.name,room:row.room}]:[];});
}
function validateActions(actions,lamps){
 if(!Array.isArray(actions)||!actions.length||actions.length>5)fail('Bitte ein bis fünf Lampen auswählen.');
 const seen=new Set();for(const a of actions){if(!a||Object.keys(a).some(k=>!['key','on','rgb','brightness'].includes(k))||!lamps.some(l=>l.key===a.key)||seen.has(a.key)||typeof a.on!=='boolean'||a.rgb!==undefined&&(!a.on||!Array.isArray(a.rgb)||a.rgb.length!==3||a.rgb.some(v=>!Number.isInteger(v)||v<0||v>255))||a.brightness!==undefined&&(!a.on||!Number.isInteger(a.brightness)||a.brightness<1||a.brightness>255))fail('Ungültiger Lampenauftrag. Keine Änderung ausgeführt.');seen.add(a.key);}return actions;
}
async function executeDeviceActions(db,user,building,actions,requestID,options={}){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestID||''))fail('Gültige Auftragskennung erforderlich.');
 const lamps=await deviceContext(db,user,building,options);if(!lamps.length)fail('Keine freigegebenen Lampen in diesem Gebäude.',403);validateActions(actions,lamps);
 const results=[];for(const a of actions){
  if(!await deviceControlEnabled(db,user)||!await accessibleBuilding(db,building,user))fail('Freigabe wurde beendet.',403);
  const current=await deviceContext(db,user,building,options);validateActions([a],current);
  const h=createHash('sha256').update(requestID+':'+a.key).digest('hex'),id=h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);
  const {key,...body}=a;try{const result=await executeLampCommand(db,user,key,body,id,options);results.push({key,name:lamps.find(l=>l.key===key).name,confirmed:result.confirmed,message:result.message});}catch(e){results.push({key,name:lamps.find(l=>l.key===key).name,confirmed:false,message:'Nicht bestätigt. Bitte den aktuellen Lampenzustand prüfen.'});break;}
 }
 return {results,answer:results.map(r=>r.name+': '+(r.confirmed?'Zustand durch Home Assistant bestätigt.':r.message)).join('\n')};
}
// Aus Home Assistant importierte Lampen: nur für den Besitzer mit App-Verbindung und freigegebener Gerätesteuerung.
// Der Server schaltet sie nicht selbst; das iPhone führt die geprüften Aufträge im Heimnetz aus.
async function haChatLamps(db,user,building){
 if(!building||building.user_id!==user||!await deviceControlEnabled(db,user))return [];
 return (await haLamps(db,building.id)).filter(l=>l.owner===user&&l.app_mode).slice(0,20).map(l=>({key:l.entity_id,name:l.name,room:l.room||'',color:l.supports_color,caps:l.caps}));
}
function validHAActions(actions,list){
 const out=[],seen=new Set();
 for(const a of actions){
  const l=list.find(x=>x.key===a?.key);if(!l||seen.has(l.key)||typeof a.on!=='boolean')return [];seen.add(l.key);
  const action={entity_id:l.key,name:l.name,on:a.on};
  if(a.on&&a.brightness!==undefined){if(!Number.isInteger(a.brightness)||a.brightness<1||a.brightness>255||l.caps?.brightness===false)return [];action.brightness=a.brightness;}
  if(a.on&&a.rgb!==undefined){if(!l.color||!Array.isArray(a.rgb)||a.rgb.length!==3||a.rgb.some(v=>!Number.isInteger(v)||v<0||v>255))return [];action.rgb=a.rgb;}
  out.push(action);
 }
 return out.slice(0,5);
}
function assistantDevicesRouter(db,requireAccount,options={}){
 const r=express.Router();r.post('/buildings/:id/assistant/device-actions',requireAccount,async(req,res,next)=>{try{res.set('Cache-Control','private, no-store');if(Object.keys(req.body||{}).some(k=>k!=='actions'))fail('Ungültiger Auftrag.');res.json(await executeDeviceActions(db,req.account.id,req.params.id,req.body?.actions,req.get('X-Request-ID'),options));}catch(e){e.status?res.status(e.status).json({error:e.message}):next(e);}});return r;
}
module.exports={haChatLamps,validHAActions,deviceContext,validateActions,executeDeviceActions,assistantDevicesRouter};
