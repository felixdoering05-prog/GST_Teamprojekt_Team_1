const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite');
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
 room=await service(db,owner.user.id).entities.Room.create({name:'Küche',room_code:'K-1',building_id:String(building.id),source:'real'});
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function request(path,method='GET',body,session){
 const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(session?{'X-D21-Session':session}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:r.status,data,headers:r.headers};
}
const base=()=>'/buildings/'+building.id+'/home-assistant';
const inventory={areas:[{area_id:'kueche',name:'Küche'}],devices:[{device_id:'d1',name:'Thermometer',manufacturer:'Shelly',model:'H&T',area_id:'kueche'}],
 entities:[{entity_id:'sensor.kueche_temperatur',name:'Küche Temperatur',device_class:'temperature',unit:'°C',device_id:'d1',area_id:'kueche'},{entity_id:'sensor.kueche_co2',name:'Küche CO₂',device_class:'carbon_dioxide',unit:'ppm',device_id:'d1',area_id:'kueche'}]};

test('login client page tells Home Assistant to redirect only into the app',async()=>{
 const r=await request('/ha-client');
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);
 assert.match(r.data,/<link rel="redirect_uri" href="kitrifftgebaeude:\/\/ha-auth">/);
});

test('only the owner connects the app path; members and strangers cannot upload',async()=>{
 assert.equal((await request(base()+'/app-connect','POST',{})).status,401);
 assert.equal((await request(base()+'/app-connect','POST',{},stranger.token)).status,404);
 assert.equal((await request(base()+'/app-connect','POST',{},member.token)).status,403);
 assert.equal((await request(base()+'/app-connect','POST',{token:'x'},owner.token)).status,400,'no HA token is ever accepted');
 assert.equal((await request(base()+'/inventory','PUT',inventory,owner.token)).status,409,'not connected yet');
 const r=await request(base()+'/app-connect','POST',{instance_name:'Zuhause',ha_version:'2026.11.2'},owner.token);
 assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.link.mode,'app');assert.equal(r.data.link.status,'active');
 const row=(await db.query('SELECT token_hash,pairing_hash FROM app_ha_links WHERE building_id=$1',[building.id])).rows[0];
 assert.equal(row.token_hash,null);assert.equal(row.pairing_hash,null);
 assert.equal((await request(base()+'/app-connect','POST',{instance_name:'Zuhause'},owner.token)).status,200,'reconnecting is idempotent');
 assert.equal((await request(base()+'/inventory','PUT',inventory,member.token)).status,403);
 assert.equal((await request(base()+'/samples','POST',{points:[]},member.token)).status,403);
 assert.equal((await request(base()+'/pairing','POST',{},owner.token)).status,409,'bridge pairing blocked while app link active');
});

test('inventory and samples reuse the strict validation',async()=>{
 assert.equal((await request(base()+'/inventory','PUT',{...inventory,entities:[{entity_id:'person.felix',name:'Felix',device_class:'temperature',unit:'°C'}]},owner.token)).status,400);
 const inv=await request(base()+'/inventory','PUT',inventory,owner.token);
 assert.equal(inv.status,200,JSON.stringify(inv.data));assert.equal(inv.data.entities.length,2);assert.equal(inv.data.devices[0].manufacturer,'Shelly');
 await request(base()+'/entities','PUT',{selected:['sensor.kueche_temperatur']},owner.token);
 await request(base()+'/areas','PUT',{mapping:{kueche:room.id}},owner.token);
 const t=Date.now();
 const points=[{entity_id:'sensor.kueche_temperatur',value:21.5,measured_at:new Date(t-3600000).toISOString()},{entity_id:'sensor.kueche_temperatur',value:21.9,measured_at:new Date(t).toISOString()},{entity_id:'sensor.kueche_co2',value:900,measured_at:new Date(t).toISOString()}];
 const s=await request(base()+'/samples','POST',{points},owner.token);
 assert.equal(s.status,201,JSON.stringify(s.data));assert.equal(s.data.stored,2);assert.equal(s.data.ignored,1,'unselected sensor ignored');
 assert.equal((await request(base()+'/samples','POST',{points},owner.token)).data.stored,0,'re-sync is idempotent');
 assert.equal((await request(base()+'/samples','POST',{points:[{...points[0],measured_at:'gestern'}]},owner.token)).status,400);
 assert.equal((await request(base()+'/samples','POST',{points:Array.from({length:2001},()=>points[0])},owner.token)).status,400);
 const view=(await request(base(),'GET',undefined,member.token)).data;
 assert.equal(view.link.mode,'app');assert.equal(view.entities.find(e=>e.entity_id==='sensor.kueche_temperatur').latest.value,21.9);
 const rt=(await request('/buildings/'+building.id+'/telemetry/room-temperatures','GET',undefined,member.token)).data;
 assert.equal(rt.rooms.find(x=>x.id===room.id).reading.value,21.9);
});

test('hourly sync limit and disconnect',async()=>{
 await db.query("INSERT INTO app_user_limits(user_id,overrides) VALUES($1,'{\"ha_sync_hour\":2}')",[owner.user.id]);
 const point=[{entity_id:'sensor.kueche_temperatur',value:22,measured_at:new Date().toISOString()}];
 assert.equal((await request(base()+'/samples','POST',{points:point},owner.token)).status,429,'two successful syncs already used the limit of 2');
 await db.query("UPDATE app_user_limits SET overrides='{}' WHERE user_id=$1",[owner.user.id]);
 assert.equal((await request(base(),'DELETE',undefined,owner.token)).data.deleted,true);
 assert.equal(Number((await db.query('SELECT COUNT(*) n FROM app_ha_samples')).rows[0].n),0);
 assert.equal((await request(base()+'/samples','POST',{points:point},owner.token)).status,409);
});
