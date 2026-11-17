const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
const {service}=require('../src/twin');
const {evaluateAutomations}=require('../src/automations');
let db,server,url,owner,stranger,building,bad;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),close:()=>pg.close()};
 await initAccounts(db);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port+'/api/v1';
 const register=async n=>(await request('/auth/register','POST',{name:n,email:n.toLowerCase()+'@example.test',password:'SafeTestPassword'+n+'1'})).data;
 owner=await register('Owner');stranger=await register('Stranger');
 building=(await request('/buildings','POST',{name:'Haus'},owner.token)).data;
 bad=await service(db,owner.user.id).entities.Room.create({name:'Bad',room_code:'B',building_id:String(building.id),source:'real'});
 const b='/buildings/'+building.id+'/home-assistant';
 await request(b+'/app-connect','POST',{instance_name:'Zuhause'},owner.token);
 await request(b+'/inventory','PUT',{areas:[{area_id:'bad',name:'Bad'}],devices:[],entities:[{entity_id:'sensor.bad_feuchte',name:'Feuchte',device_class:'humidity',unit:'%',area_id:'bad'}]},owner.token);
 await request(b+'/entities','PUT',{selected:['sensor.bad_feuchte']},owner.token);
 await request(b+'/areas','PUT',{mapping:{bad:bad.id}},owner.token);
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function request(path,method='GET',body,session){
 const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(session?{'X-D21-Session':session}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json()};
}
const base=()=>'/buildings/'+building.id+'/automations';
const sample=v=>request('/buildings/'+building.id+'/home-assistant/samples','POST',{points:[{entity_id:'sensor.bad_feuchte',value:v,measured_at:new Date().toISOString()}]},owner.token);
const notes=async()=>(await db.query("SELECT title FROM app_notifications WHERE kind='automation' ORDER BY id")).rows.map(r=>r.title);
test('a sentence becomes a rule, preview does not save, strangers are kept out',async()=>{
 const p=await request(base()+'/parse','POST',{text:'Wenn die Luftfeuchte im Bad über 60 % steigt'},owner.token);
 assert.equal(p.status,200);assert.equal(p.data.room,'Bad');assert.match(p.data.description,/Luftfeuchte im Raum Bad über 60 %/);
 assert.equal((await request(base(),'GET',undefined,owner.token)).data.rules.length,0);
 assert.equal((await request(base()+'/parse','POST',{text:'Hallo'},owner.token)).status,422);
 assert.equal((await request(base(),'POST',{text:'Feuchte über 60'},stranger.token)).status,404);
 const r=await request(base(),'POST',{text:'Wenn die Luftfeuchte im Bad über 60 % steigt'},owner.token);
 assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.enabled,true);
});
test('fires once per exceedance and re-arms after the value is back to normal',async()=>{
 await sample(55);await evaluateAutomations(db,building.id);assert.deepEqual(await notes(),[]);
 await sample(63.4);await evaluateAutomations(db,building.id);
 assert.deepEqual(await notes(),['Bad: Luftfeuchte 63,4 % (über 60 %)']);
 await sample(65);await evaluateAutomations(db,building.id);assert.equal((await notes()).length,1,'no repeat while still above');
 await sample(50);await evaluateAutomations(db,building.id);
 await sample(70);await evaluateAutomations(db,building.id);assert.equal((await notes()).length,2,'re-armed');
});
test('disable and delete only own rules',async()=>{
 const rule=(await request(base(),'GET',undefined,owner.token)).data.rules[0];
 assert.equal((await request('/automations/'+rule.id,'PATCH',{enabled:false},stranger.token)).status,404);
 assert.equal((await request('/automations/'+rule.id,'PATCH',{enabled:false},owner.token)).status,200);
 await sample(50);await sample(80);await evaluateAutomations(db,building.id);assert.equal((await notes()).length,2,'disabled rule is silent');
 assert.equal((await request('/automations/'+rule.id,'DELETE',undefined,owner.token)).status,200);
});
