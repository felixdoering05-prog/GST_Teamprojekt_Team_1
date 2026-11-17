const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {service}=require('../src/twin');
const {haChatLamps,validHAActions}=require('../src/assistant-devices');
const {roomDeviceLights}=require('../src/room-lighting');
let db,server,url,owner,member,building,room;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),close:()=>pg.close()};
 await initAccounts(db);
 const app=express();app.use(express.json({limit:'1mb'}));app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port+'/api/v1';
 const register=async n=>(await request('/auth/register','POST',{name:n,email:n.toLowerCase()+'@example.test',password:'SafeTestPassword'+n+'1'})).data;
 owner=await register('Owner');member=await register('Member');
 building=(await request('/buildings','POST',{name:'Haus'},owner.token)).data;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.user.id]);
 room=await service(db,owner.user.id).entities.Room.create({name:'Wohnzimmer',room_code:'W-1',building_id:String(building.id),source:'real'});
 const b='/buildings/'+building.id+'/home-assistant';
 await request(b+'/app-connect','POST',{instance_name:'Zuhause'},owner.token);
 await request(b+'/inventory','PUT',{areas:[{area_id:'wz',name:'Wohnzimmer'}],devices:[],entities:[{entity_id:'light.decke',name:'Deckenlicht',supports_color:true,area_id:'wz'},{entity_id:'light.flur',name:'Flur',supports_color:false}]},owner.token);
 await request(b+'/entities','PUT',{selected:['light.decke','light.flur']},owner.token);
 await request(b+'/areas','PUT',{mapping:{wz:room.id}},owner.token);
 await request(b+'/samples','POST',{lights:[{entity_id:'light.decke',available:true,is_on:true,brightness:200,rgb:[255,120,40]},{entity_id:'light.flur',available:true,is_on:false}]},owner.token);
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function request(path,method='GET',body,session,headers={}){
 const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...headers,...(session?{'X-D21-Session':session}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json()};
}
const row=async()=>(await db.query('SELECT * FROM app_buildings WHERE id=$1',[building.id])).rows[0];
async function control(on){await db.query('INSERT INTO app_ai_preferences(user_id,enabled,policy_version,device_control_enabled) VALUES($1,true,(SELECT COALESCE(MAX(policy_version),1) FROM app_ai_preferences),$2) ON CONFLICT(user_id) DO UPDATE SET enabled=true,device_control_enabled=$2',[owner.user.id,on]);}

test('Nala sees imported lamps only for the owner with device control enabled',async()=>{
 assert.deepEqual(await haChatLamps(db,owner.user.id,await row()),[],'no device control yet');
 await control(true);
 const {POLICY_VERSION}=require('../src/ai-preferences');await db.query('UPDATE app_ai_preferences SET policy_version=$1',[POLICY_VERSION]);
 const lamps=await haChatLamps(db,owner.user.id,await row());
 assert.deepEqual(lamps.map(l=>[l.key,l.room,l.color]),[['light.decke','Wohnzimmer',true],['light.flur','',false]]);
 assert.deepEqual(await haChatLamps(db,member.user.id,await row()),[],'members never get switch rights');
});

test('HA chat actions are validated against lamp capabilities',async()=>{
 const lamps=await haChatLamps(db,owner.user.id,await row());
 assert.deepEqual(validHAActions([{key:'light.decke',on:true,rgb:[0,0,255],brightness:90}],lamps),[{entity_id:'light.decke',name:'Deckenlicht',on:true,brightness:90,rgb:[0,0,255]}]);
 assert.deepEqual(validHAActions([{key:'light.flur',on:true,rgb:[0,0,255]}],lamps),[],'no colour on a white-only lamp');
 assert.deepEqual(validHAActions([{key:'light.decke',on:true,brightness:300}],lamps),[]);
 assert.deepEqual(validHAActions([{key:'light.fremd',on:true}],lamps),[]);
 assert.deepEqual(validHAActions([{key:'light.flur',on:false}],lamps),[{entity_id:'light.flur',name:'Flur',on:false}]);
});

test('imported lamps light up their IFC room in the 3D model',async()=>{
 const ifc="ISO-10303-21;\nDATA;\n#40= IFCSPACE('2abcdefghijklmnopqrstu',#2,'Wohnzimmer',$,$,#5,#6,'Living',.ELEMENT.,.SPACE.,$);\nENDSEC;\nEND-ISO-10303-21;\n";
 const doc=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'m.ifc','application/x-step',$2,$3) RETURNING id",[building.id,ifc.length,Buffer.from(ifc)])).rows[0].id;
 const lights=await roomDeviceLights(db,owner.user.id,doc,{});
 assert.deepEqual(lights,[{space_id:40,available:true,on:true,rgb:[255,120,40],brightness:200}]);
});

test('chat: Nala returns validated HA actions for the iPhone and never for ambiguous questions',async()=>{
 const {assistantRouter}=require('../src/assistant');
 let reply={answer:'Ich schalte das Deckenlicht blau.',light_actions:[{key:'light.decke',on:true,rgb:[0,0,255]}]};
 const app=express();app.use(express.json());
 app.use(assistantRouter(db,(req,res,next)=>{req.account={id:owner.user.id};next();},{enabled:true,tools:false,getKey:()=>'test-key-long-enough-for-gemini',fetch:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(reply)}]}}]})})}));
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));
 try{
  const u='http://127.0.0.1:'+s.address().port+'/buildings/'+building.id+'/assistant';
  const info=await (await fetch(u)).json();
  const ask=async q=>{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-Request-ID':randomUUID()},body:JSON.stringify({question:q,chat:true,context_hash:info.context_hash})});return {status:r.status,data:await r.json()};};
  const ok=await ask('Mach das Deckenlicht blau');
  assert.equal(ok.status,200,JSON.stringify(ok.data));
  assert.deepEqual(ok.data.ha_actions,[{entity_id:'light.decke',name:'Deckenlicht',on:true,rgb:[0,0,255]}]);
  assert.match(ok.data.answer,/Home Assistant/);
  const vague=await ask('Wie ist das Wetter?');
  assert.equal(vague.data.ha_actions,undefined);
  reply={answer:'Flur bunt',light_actions:[{key:'light.flur',on:true,rgb:[255,0,0]}]};
  const bad=await ask('Mach den Flur rot');
  assert.equal(bad.data.ha_actions,undefined,'white-only lamp gets no colour command');
 }finally{await new Promise(r=>s.close(r));}
});
