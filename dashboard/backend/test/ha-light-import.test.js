const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {service}=require('../src/twin');
let db,server,url,owner,member,stranger,building,room;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),close:()=>pg.close()};
 await initAccounts(db);
 const app=express();app.use(express.json({limit:'1mb'}));app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port+'/api/v1';
 const register=async n=>(await request('/auth/register','POST',{name:n,email:n.toLowerCase()+'@example.test',password:'SafeTestPassword'+n+'1'})).data;
 owner=await register('Owner');member=await register('Member');stranger=await register('Stranger');
 building=(await request('/buildings','POST',{name:'Haus'},owner.token)).data;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.user.id]);
 room=await service(db,owner.user.id).entities.Room.create({name:'Wohnzimmer',room_code:'W-1',building_id:String(building.id),source:'real'});
 await request(base()+'/app-connect','POST',{instance_name:'Zuhause'},owner.token);
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function request(path,method='GET',body,session,headers={}){
 const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...headers,...(session?{'X-D21-Session':session}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json()};
}
function base(){return '/buildings/'+building.id+'/home-assistant';}
const command=(entity,body,session,key=randomUUID())=>request(base()+'/lights/'+entity+'/command','POST',body,session,{'X-Request-ID':key});
const inventory={areas:[{area_id:'wohnzimmer',name:'Wohnzimmer'}],devices:[{device_id:'lamp1',name:'KAJPLATS',manufacturer:'IKEA',model:'E27',area_id:'wohnzimmer'}],
 entities:[{entity_id:'light.wohnzimmer_decke',name:'Deckenlicht',supports_color:true,device_id:'lamp1',area_id:'wohnzimmer'},{entity_id:'light.flur',name:'Flur',supports_color:false},
  {entity_id:'sensor.wohnzimmer_temperatur',name:'Temperatur',device_class:'temperature',unit:'°C',area_id:'wohnzimmer'}]};

test('lamps are imported with name, device, area and colour support; other domains stay out',async()=>{
 assert.equal((await request(base()+'/inventory','PUT',{...inventory,entities:[{entity_id:'switch.heizung',name:'Heizung'}]},owner.token)).status,400);
 assert.equal((await request(base()+'/inventory','PUT',{...inventory,entities:[{entity_id:'light.x',name:'X',supports_color:'ja'}]},owner.token)).status,400);
 assert.equal((await request(base()+'/inventory','PUT',{...inventory,entities:[{entity_id:'light.x',name:'X',unit:'W'}]},owner.token)).status,400);
 assert.equal((await request(base()+'/inventory','PUT',{...inventory,entities:Array.from({length:101},(_,i)=>({entity_id:'light.l'+i,name:'L'}))},owner.token)).status,400);
 const r=await request(base()+'/inventory','PUT',inventory,owner.token);
 assert.equal(r.status,200,JSON.stringify(r.data));
 const lamp=r.data.entities.find(e=>e.entity_id==='light.wohnzimmer_decke');
 assert.equal(lamp.metric,'light');assert.equal(lamp.supports_color,true);assert.equal(lamp.area_id,'wohnzimmer');assert.equal(lamp.light,null);
 assert.equal(r.data.devices[0].manufacturer,'IKEA');
 const sel=await request(base()+'/entities','PUT',{selected:['light.wohnzimmer_decke','light.flur','sensor.wohnzimmer_temperatur']},owner.token);
 assert.equal(sel.status,200);
 await request(base()+'/areas','PUT',{mapping:{wohnzimmer:room.id}},owner.token);
});

test('lamp states are stored only for selected lamps and visible to members',async()=>{
 assert.equal((await request(base()+'/samples','POST',{lights:[{entity_id:'light.flur',available:true,is_on:true,brightness:300}]},owner.token)).status,400);
 assert.equal((await request(base()+'/samples','POST',{lights:[{entity_id:'light.flur',available:true,is_on:true}]},member.token)).status,403);
 const r=await request(base()+'/samples','POST',{lights:[{entity_id:'light.wohnzimmer_decke',available:true,is_on:true,brightness:180,rgb:[255,200,120]},{entity_id:'light.flur',available:false,is_on:true},{entity_id:'light.unbekannt',available:true,is_on:false}]},owner.token);
 assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.lights,2);
 const view=(await request(base(),'GET',undefined,member.token)).data.entities;
 const decke=view.find(e=>e.entity_id==='light.wohnzimmer_decke');
 assert.equal(decke.light.is_on,true);assert.equal(decke.light.brightness,180);assert.deepEqual(decke.light.rgb,[255,200,120]);
 assert.equal(view.find(e=>e.entity_id==='light.flur').light.is_on,null,'unavailable lamp has no on/off state');
 const t=(await request('/buildings/'+building.id+'/telemetry','GET',undefined,owner.token)).data;
 assert.equal(t.sensors.some(s=>s.sensor_code.includes('decke')),false,'lamps do not appear as sensors');
});

test('switching: owner only, selected lamps only, colour check, idempotent key and light_minute limit',async()=>{
 assert.equal((await command('light.wohnzimmer_decke',{on:true},member.token)).status,403);
 assert.equal((await command('light.wohnzimmer_decke',{on:true},stranger.token)).status,404);
 assert.equal((await command('light.unbekannt',{on:true},owner.token)).status,404);
 assert.equal((await command('light.flur',{on:true,rgb:[255,0,0]},owner.token)).status,409,'no colour support');
 assert.equal((await command('light.flur',{on:false,brightness:10},owner.token)).status,400);
 assert.equal((await request(base()+'/lights/light.flur/command','POST',{on:true},owner.token)).status,400,'request key required');
 const key=randomUUID();
 assert.equal((await command('light.wohnzimmer_decke',{on:true,rgb:[0,0,255],brightness:200},owner.token,key)).status,201);
 assert.equal((await command('light.wohnzimmer_decke',{on:true},owner.token,key)).status,409,'same request key twice');
 await db.query("INSERT INTO app_user_limits(user_id,overrides) VALUES($1,'{\"light_minute\":2}')",[owner.user.id]);
 assert.equal((await command('light.flur',{on:false},owner.token)).status,201);
 assert.equal((await command('light.flur',{on:true},owner.token)).status,429);
 const rows=(await db.query("SELECT status FROM app_ha_commands WHERE user_id=$1",[owner.user.id])).rows;
 assert.ok(rows.every(r=>r.status==='delegated'));
});
