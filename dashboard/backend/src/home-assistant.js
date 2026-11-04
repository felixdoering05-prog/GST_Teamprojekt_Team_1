const express=require('express');
const {readFileSync}=require('node:fs');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
async function initHomeAssistant(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_lamp_locations(user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,light_key TEXT NOT NULL,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,room TEXT NOT NULL DEFAULT '',document_id INTEGER REFERENCES app_documents(id) ON DELETE SET NULL,space_id INTEGER,revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(user_id,light_key))`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_ha_commands(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,light_key TEXT NOT NULL,request_key TEXT NOT NULL,desired_on BOOLEAN NOT NULL,status TEXT NOT NULL DEFAULT 'processing',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),finished_at TIMESTAMPTZ,UNIQUE(user_id,request_key))`);
 await db.query('CREATE INDEX IF NOT EXISTS app_ha_commands_time ON app_ha_commands(created_at)');
}
function homeAssistantService(options={}){
 const getConfig=options.getConfig||(()=>JSON.parse(readFileSync(process.env.D21_HOMEASSISTANT_CONFIG_FILE||'/run/d21-homeassistant/config.json','utf8')));
 const getToken=options.getToken||(()=>readFileSync(process.env.D21_HOMEASSISTANT_TOKEN_FILE||'/run/d21-homeassistant/access-token','utf8').trim());
 const fetchProvider=options.fetch||global.fetch;
 function configuration(user){
  let config;try{config=getConfig();}catch{return null;}
  if(config.account_id!==user)return null;
  let origin;try{origin=new URL(config.base_url);}catch{fail('Home Assistant ist noch nicht richtig eingerichtet.',503);}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||!Array.isArray(config.lights)||config.lights.length>5)fail('Home Assistant ist noch nicht richtig eingerichtet.',503);
  const keys=new Set();
  for(const light of config.lights){if(!/^[a-z0-9-]{1,50}$/.test(light.key)||keys.has(light.key)||!/^light\.[a-z0-9_]{1,150}$/.test(light.entity_id)||typeof light.name!=='string'||!light.name.trim()||light.name.length>100||typeof light.room!=='string'||light.room.length>100)fail('Home Assistant ist noch nicht richtig eingerichtet.',503);keys.add(light.key);}
  return {...config,origin:origin.origin};
 }
 async function call(config,path,method='GET',body){
  let token;try{token=getToken();}catch{fail('Home-Assistant-Zugang fehlt auf dem Server.',503);}
  if(typeof token!=='string'||token.length<20||token.length>8192||/[\r\n]/.test(token))fail('Home-Assistant-Zugang fehlt auf dem Server.',503);
  try{
   const response=await fetchProvider(config.origin+'/api/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'D21-HomeAssistant-Demo/1.0'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000),redirect:'error'});
   if(!response.ok)fail(response.status===401||response.status===403?'Home-Assistant-Zugang bitte auf dem Server prüfen.':'Home Assistant hat die Anfrage nicht angenommen.',502);
   const reader=response.body.getReader(),parts=[];let length=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536)fail('Home-Assistant-Antwort zu groß.',502);parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   return JSON.parse(Buffer.concat(parts).toString('utf8'));
  }catch(e){if(e.status)throw e;fail('Home Assistant ist nicht erreichbar. Es erfolgt keine automatische Wiederholung.',503);}
 }
 async function state(config,light){
  const value=await call(config,'states/'+encodeURIComponent(light.entity_id));
  if(value.entity_id!==light.entity_id||!['on','off','unknown','unavailable'].includes(value.state))fail('Kein gültiger Lampenstatus von Home Assistant.',502);
  const available=['on','off'].includes(value.state);
  const attributes=value.attributes||{},rgb=attributes.rgb_color;
  return {key:light.key,name:light.name,room:light.room,available,is_on:available?value.state==='on':null,supports_rgb:Array.isArray(attributes.supported_color_modes)&&attributes.supported_color_modes.some(x=>['hs','xy','rgb','rgbw','rgbww'].includes(x)),rgb:Array.isArray(rgb)&&rgb.length===3&&rgb.every(x=>Number.isFinite(x)&&x>=0&&x<=255)?rgb.map(Math.round):null,brightness:Number.isInteger(attributes.brightness)?attributes.brightness:null,checked_at:new Date().toISOString()};
 }
 return {configuration,state,call};
}
function homeAssistantRouter(db,requireAccount,options={}){
 const r=express.Router(),base='/integrations/home-assistant/lights';
 const {configuration,state,call}=homeAssistantService(options);
 r.use(base,requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 r.get(base,wrap(async(req,res)=>{
  const config=configuration(req.account.id);if(!config)return res.json({configured:false,lights:[]});
  const lights=await Promise.all(config.lights.map(async light=>{const location=(await db.query('SELECT building_id,room,document_id,space_id,revision FROM app_lamp_locations WHERE user_id=$1 AND light_key=$2',[req.account.id,light.key])).rows[0]||null;try{return {...await state(config,light),location};}catch{return {key:light.key,name:light.name,room:light.room,available:false,is_on:null,supports_rgb:false,rgb:null,brightness:null,location,checked_at:null};}}));
  res.json({configured:true,lights});
 }));
 r.post(base+'/:light/command',wrap(async(req,res)=>{
  const config=configuration(req.account.id),light=config?.lights.find(x=>x.key===req.params.light);if(!light)fail('Lampe nicht freigegeben.',404);
  const b=req.body||{},key=req.get('X-Request-ID')||'';
  if(Object.keys(b).some(k=>!['on','rgb','brightness'].includes(k))||typeof b.on!=='boolean'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))fail('Bitte einen gültigen einzelnen Lichtauftrag senden.');
  if(b.rgb!==undefined&&(!Array.isArray(b.rgb)||b.rgb.length!==3||b.rgb.some(x=>!Number.isInteger(x)||x<0||x>255))||b.brightness!==undefined&&(!Number.isInteger(b.brightness)||b.brightness<1||b.brightness>255)||!b.on&&(b.rgb!==undefined||b.brightness!==undefined))fail('Bitte gültige Lichtfarbe und Helligkeit verwenden.');
  const c=await db.connect();let id;
  try{
   await c.query('BEGIN');await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id]);
   if((await c.query('SELECT 1 FROM app_ha_commands WHERE user_id=$1 AND request_key=$2',[req.account.id,key.toLowerCase()])).rows.length)fail('Dieser Auftrag wurde bereits angenommen. Status neu laden; nicht automatisch wiederholen.',409);
   const count=(await c.query("SELECT COUNT(*) n,COUNT(*) FILTER(WHERE status='processing' AND created_at>now()-interval '30 seconds') active FROM app_ha_commands WHERE user_id=$1 AND created_at>now()-interval '1 minute'",[req.account.id])).rows[0];
   if(Number(count.n)>=20)fail('Bitte kurz warten: maximal 20 Lichtaufträge pro Minute.',429);if(Number(count.active)>0)fail('Ein Lichtauftrag läuft noch. Bitte zuerst den Status neu laden.',409);
   id=(await c.query('INSERT INTO app_ha_commands(user_id,light_key,request_key,desired_on) VALUES($1,$2,$3,$4) RETURNING id',[req.account.id,light.key,key.toLowerCase(),b.on])).rows[0].id;
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  try{
   const before=await state(config,light);if(!before.available)fail('Die Lampe ist in Home Assistant nicht verfügbar.',409);
   if(b.rgb&&!before.supports_rgb)fail('Diese Lampe unterstützt keine RGB-Farbe.',409);
   const matches=x=>x.available&&x.is_on===b.on&&(!b.rgb||x.rgb&&b.rgb.every((v,i)=>Math.abs(v-x.rgb[i])<=12))&&(b.brightness===undefined||x.brightness!==null&&Math.abs(b.brightness-x.brightness)<=3);
   let current=before;
   if(!matches(before)){
    await call(config,'services/light/'+(b.on?'turn_on':'turn_off'),'POST',{entity_id:light.entity_id,...(b.rgb?{rgb_color:b.rgb}:{}),...(b.brightness!==undefined?{brightness:b.brightness}:{})});
    for(let i=0;i<3;i++){current=await state(config,light);if(matches(current))break;if(i<2)await new Promise(resolve=>setTimeout(resolve,400));}
   }
   const confirmed=matches(current);
   await db.query("UPDATE app_ha_commands SET status=$2,finished_at=now() WHERE id=$1",[id,confirmed?'confirmed':'unconfirmed']);
   res.status(confirmed?200:202).json({confirmed,light:current,message:confirmed?'Lampenstatus von Home Assistant bestätigt.':'Auftrag gesendet; der gewünschte Zustand ist noch nicht bestätigt. Bitte Status neu laden.'});
  }catch(e){await db.query("UPDATE app_ha_commands SET status='uncertain',finished_at=now() WHERE id=$1",[id]);throw e;}
 }));
 r.use((e,req,res,next)=>e.status?res.status(e.status).json({error:e.message}):next(e));return r;
}
module.exports={initHomeAssistant,homeAssistantRouter,homeAssistantService};
