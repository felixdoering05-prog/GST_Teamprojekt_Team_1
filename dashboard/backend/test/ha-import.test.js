const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
const {service}=require('../src/twin');
let db,server,url,owner,member,pending,stranger,building,other,room,otherRoom;
const users=[];
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),close:()=>pg.close()};
 await initAccounts(db);
 const app=express();app.use(express.json({limit:'1mb'}));app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port+'/api/v1';
 const register=async n=>(await request('/auth/register','POST',{name:n,email:n.toLowerCase()+'@example.test',password:'SafeTestPassword'+n+'1'})).data;
 owner=await register('Owner');member=await register('Member');pending=await register('Pending');stranger=await register('Stranger');
 building=(await request('/buildings','POST',{name:'Haus'},owner.token)).data;
 other=(await request('/buildings','POST',{name:'Fremd'},stranger.token)).data;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted'),($1,$3,'pending')",[building.id,member.user.id,pending.user.id]);
 room=await service(db,owner.user.id).entities.Room.create({name:'Wohnzimmer',room_code:'R-01',building_id:String(building.id),source:'real'});
 otherRoom=await service(db,stranger.user.id).entities.Room.create({name:'Fremdraum',room_code:'X-01',building_id:String(other.id),source:'real'});
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function request(path,method='GET',body,session,bearer){
 const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(session?{'X-D21-Session':session}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json(),headers:r.headers};
}
const base=()=>'/buildings/'+building.id+'/home-assistant';
const now=(offset=0)=>new Date(Date.now()+offset).toISOString();
const inventory={
 areas:[{area_id:'wohnzimmer',name:'Wohnzimmer'},{area_id:'garage',name:'Garage'}],
 devices:[{device_id:'abc123',name:'Klimasensor',manufacturer:'Aqara',model:'TH',area_id:'wohnzimmer'}],
 entities:[
  {entity_id:'sensor.wohnzimmer_temperatur',name:'Temperatur Wohnzimmer',device_class:'temperature',unit:'°F',device_id:'abc123',area_id:'wohnzimmer'},
  {entity_id:'sensor.wohnzimmer_co2',name:'CO₂',device_class:'carbon_dioxide',unit:'ppm',device_id:'abc123',area_id:'wohnzimmer'},
  {entity_id:'sensor.wallbox_leistung',name:'Wallbox',device_class:'power',unit:'kW',area_id:'garage'}
 ]};
let token;
async function lastPushAgo(){await db.query("UPDATE app_ha_links SET last_push_at=now()-interval '2 minutes' WHERE building_id=$1",[building.id]);}

test('only the owner can create a pairing code; members read, others get 404',async()=>{
 assert.equal((await request(base()+'/pairing','POST',{})).status,401);
 assert.equal((await request(base()+'/pairing','POST',{},stranger.token)).status,404);
 assert.equal((await request(base()+'/pairing','POST',{},pending.token)).status,404);
 assert.equal((await request(base()+'/pairing','POST',{},member.token)).status,403);
 assert.equal((await request(base(),'GET',undefined,pending.token)).status,404);
 const r=await request(base()+'/pairing','POST',{},owner.token);
 assert.equal(r.status,201);assert.match(r.data.code,/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
 assert.equal(r.headers.get('cache-control'),'private, no-store');
 const row=(await db.query('SELECT * FROM app_ha_links WHERE building_id=$1',[building.id])).rows[0];
 assert.notEqual(row.pairing_hash,r.data.code.replace('-',''),'code is stored hashed');
 const seen=await request(base(),'GET',undefined,member.token);
 assert.equal(seen.status,200);assert.equal(seen.data.role,'member');assert.equal(seen.data.link.pairing_expires_at,null);
 assert.equal(JSON.stringify(seen.data).includes('pairing_hash'),false);
 // Pairing: wrong code rejected, right one returns a token exactly once.
 assert.equal((await request('/ha-bridge/pair','POST',{code:'AAAA-AAAA'})).status,401);
 assert.equal((await request('/ha-bridge/pair','POST',{code:r.data.code,extra:1})).status,400);
 const paired=await request('/ha-bridge/pair','POST',{code:r.data.code.toLowerCase(),instance_name:'Zuhause\u0000',ha_version:'2026.11.1'});
 assert.equal(paired.status,201,JSON.stringify(paired.data));assert.match(paired.data.token,/^[a-f0-9]{64}$/);token=paired.data.token;
 assert.equal((await request('/ha-bridge/pair','POST',{code:r.data.code})).status,401,'code is single use');
 const stored=(await db.query('SELECT token_hash,instance_name FROM app_ha_links WHERE building_id=$1',[building.id])).rows[0];
 assert.notEqual(stored.token_hash,token);assert.equal(stored.instance_name,'Zuhause');
 assert.equal((await request(base()+'/pairing','POST',{},owner.token)).status,409,'already connected');
});

test('bridge requires a valid token and validates the inventory strictly',async()=>{
 assert.equal((await request('/ha-bridge/inventory','POST',inventory)).status,401);
 assert.equal((await request('/ha-bridge/inventory','POST',inventory,null,'f'.repeat(64))).status,401);
 assert.equal((await request('/ha-bridge/inventory','POST',inventory,owner.token)).status,401,'a session is not a bridge token');
 const bad=async entity=>(await request('/ha-bridge/inventory','POST',{...inventory,entities:[entity]},null,token)).status;
 assert.equal(await bad({entity_id:'person.felix',name:'Felix',device_class:'temperature',unit:'°C'}),400);
 assert.equal(await bad({entity_id:'device_tracker.phone',name:'Handy',device_class:'temperature',unit:'°C'}),400);
 assert.equal(await bad({entity_id:'sensor.gps',name:'GPS',device_class:'location',unit:'°'}),400);
 assert.equal(await bad({entity_id:'sensor.temp',name:'T',device_class:'temperature',unit:'mK'}),400);
 assert.equal(await bad({entity_id:'sensor.temp',name:'T',device_class:'temperature',unit:'°C',secret:'x'}),400);
 assert.equal((await request('/ha-bridge/inventory','POST',{...inventory,entities:Array.from({length:501},(_,i)=>({entity_id:'sensor.t'+i,name:'T',device_class:'temperature',unit:'°C'}))},null,token)).status,400);
 const ok=await request('/ha-bridge/inventory','POST',{...inventory,areas:[...inventory.areas,{area_id:'schlafzimmer',name:'Schlafzimmer'}]},null,token);
 assert.equal(ok.status,200,JSON.stringify(ok.data));assert.deepEqual(ok.data.selected,[]);
 const view=(await request(base(),'GET',undefined,owner.token)).data;
 assert.equal(view.entities.length,3);assert.deepEqual(view.areas.map(a=>a.area_id).sort(),['garage','wohnzimmer'],'unused areas are not stored');
 assert.equal(view.devices[0].manufacturer,'Aqara');
});

test('values only from selected entities; owner-only selection with limit and revision',async()=>{
 await lastPushAgo();
 const r=await request('/ha-bridge/states','POST',{states:[{entity_id:'sensor.wohnzimmer_temperatur',value:71.6,measured_at:now()}]},null,token);
 assert.equal(r.status,201);assert.equal(r.data.stored,0);assert.equal(r.data.ignored,1);
 const view=(await request(base(),'GET',undefined,owner.token)).data;
 assert.equal((await request(base()+'/entities','PUT',{selected:['sensor.wohnzimmer_temperatur']},member.token)).status,403);
 assert.equal((await request(base()+'/entities','PUT',{selected:['sensor.wohnzimmer_temperatur']},stranger.token)).status,404);
 assert.equal((await request(base()+'/entities','PUT',{selected:['sensor.unbekannt']},owner.token)).status,409);
 assert.equal((await request(base()+'/entities','PUT',{selected:['light.x']},owner.token)).status,400);
 assert.equal((await request(base()+'/entities','PUT',{selected:['sensor.wohnzimmer_co2'],revision:view.link.revision-1},owner.token)).status,409);
 await db.query("INSERT INTO app_user_limits(user_id,overrides) VALUES($1,'{\"ha_entities\":2}')",[owner.user.id]);
 assert.equal((await request(base()+'/entities','PUT',{selected:inventory.entities.map(e=>e.entity_id)},owner.token)).status,429);
 const sel=await request(base()+'/entities','PUT',{selected:['sensor.wohnzimmer_temperatur','sensor.wallbox_leistung'],revision:view.link.revision},owner.token);
 assert.equal(sel.status,200,JSON.stringify(sel.data));
 await lastPushAgo();
 const push=await request('/ha-bridge/states','POST',{states:[
  {entity_id:'sensor.wohnzimmer_temperatur',value:71.6,measured_at:now()},
  {entity_id:'sensor.wallbox_leistung',value:3.7,measured_at:now()},
  {entity_id:'sensor.wohnzimmer_co2',value:800,measured_at:now()}]},null,token);
 assert.equal(push.status,201);assert.equal(push.data.stored,2);assert.equal(push.data.ignored,1);
 assert.deepEqual(push.data.selected,['sensor.wallbox_leistung','sensor.wohnzimmer_temperatur']);
 const after=(await request(base(),'GET',undefined,member.token)).data.entities;
 assert.equal(after.find(e=>e.entity_id==='sensor.wohnzimmer_temperatur').latest.value,22,'°F converted to °C');
 assert.equal(after.find(e=>e.entity_id==='sensor.wallbox_leistung').latest.value,3700,'kW converted to W');
 assert.equal((await request('/ha-bridge/states','POST',{states:[{entity_id:'sensor.wohnzimmer_temperatur',value:70,measured_at:now()}]},null,token)).status,429,'one package per minute');
});

test('state payload validation and hourly value limit',async()=>{
 await lastPushAgo();
 const send=states=>request('/ha-bridge/states','POST',{states},null,token);
 assert.equal((await send([])).status,400);
 assert.equal((await send([{entity_id:'sensor.wohnzimmer_temperatur',value:'21',measured_at:now()}])).status,400);
 assert.equal((await send([{entity_id:'sensor.wohnzimmer_temperatur',value:21,measured_at:'2026-11-16 12:00'}])).status,400);
 assert.equal((await send([{entity_id:'sensor.wohnzimmer_temperatur',value:21,measured_at:now(3600000)}])).status,400,'future');
 assert.equal((await send([{entity_id:'sensor.wohnzimmer_temperatur',value:21,measured_at:now(-40*86400000)}])).status,400,'too old');
 assert.equal((await send(Array.from({length:201},()=>({entity_id:'sensor.wohnzimmer_temperatur',value:70,measured_at:now()})))).status,400);
 // Out-of-range values (after conversion) are ignored, not stored.
 const r=await send([{entity_id:'sensor.wohnzimmer_temperatur',value:5000,measured_at:now(-1000)}]);
 assert.equal(r.status,201);assert.equal(r.data.ignored,1);
 await db.query("UPDATE app_user_limits SET overrides='{\"ha_entities\":2,\"ha_values_hour\":4}' WHERE user_id=$1",[owner.user.id]);
 await lastPushAgo();
 assert.equal((await send([{entity_id:'sensor.wohnzimmer_temperatur',value:70,measured_at:now(-2000)},{entity_id:'sensor.wohnzimmer_temperatur',value:70,measured_at:now(-3000)}])).status,429);
 await db.query("UPDATE app_user_limits SET unlimited=true WHERE user_id=$1",[owner.user.id]);
 assert.equal((await send([{entity_id:'sensor.wohnzimmer_temperatur',value:70,measured_at:now(-2000)}])).status,201);
 await db.query("UPDATE app_user_limits SET unlimited=false,overrides='{}' WHERE user_id=$1",[owner.user.id]);
});

test('history import is idempotent and limited per day',async()=>{
 const points=Array.from({length:24},(_,i)=>({entity_id:'sensor.wohnzimmer_temperatur',value:68+i/10,measured_at:new Date(Date.now()-(i+2)*3600000).toISOString()}));
 const r=await request('/ha-bridge/history','POST',{points},null,token);
 assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.stored,24);
 assert.equal((await request('/ha-bridge/history','POST',{points},null,token)).data.stored,0,'duplicates are skipped');
 const h=await request(base()+'/history?entity_id=sensor.wohnzimmer_temperatur&hours=48',undefined,undefined,member.token);
 assert.equal(h.status,200);assert.ok(h.data.points.length>=24);assert.equal(h.data.unit,'°C');
 assert.ok(h.data.points[0].measured_at<h.data.points.at(-1).measured_at);
 assert.equal((await request(base()+'/history?entity_id=sensor.wohnzimmer_temperatur&hours=48',undefined,undefined,stranger.token)).status,404);
 assert.equal((await request(base()+'/history?entity_id=x&hours=48',undefined,undefined,member.token)).status,400);
 await db.query("INSERT INTO app_user_limits(user_id,overrides) VALUES($1,'{\"ha_history_day\":2}') ON CONFLICT(user_id) DO UPDATE SET overrides=EXCLUDED.overrides",[owner.user.id]);
 assert.equal((await request('/ha-bridge/history','POST',{points},null,token)).status,429);
 await db.query("UPDATE app_user_limits SET overrides='{}' WHERE user_id=$1",[owner.user.id]);
});

test('areas map only to rooms of this building and feed the telemetry snapshot',async()=>{
 assert.equal((await request(base()+'/areas','PUT',{mapping:{wohnzimmer:room.id}},member.token)).status,403);
 assert.equal((await request(base()+'/areas','PUT',{mapping:{wohnzimmer:otherRoom.id}},owner.token)).status,400);
 assert.equal((await request(base()+'/areas','PUT',{mapping:{kueche:room.id}},owner.token)).status,409);
 const r=await request(base()+'/areas','PUT',{mapping:{wohnzimmer:room.id,garage:null}},owner.token);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.areas.find(a=>a.area_id==='wohnzimmer').room_id,room.id);
 assert.deepEqual(r.data.rooms.map(x=>x.name),['Wohnzimmer']);
 const t=(await request('/buildings/'+building.id+'/telemetry','GET',undefined,member.token)).data;
 const sensor=t.sensors.find(s=>s.sensor_code==='HA-wohnzimmer_temperatur');
 assert.ok(sensor);assert.equal(sensor.room_id,room.id);assert.equal(sensor.source,'real');
 assert.equal(t.sensors.some(s=>s.metric==='power'),false,'power stays out of the telemetry metrics');
 assert.ok(t.measurements.some(m=>m.sensor_id===sensor.id&&m.value===22));
 assert.equal((await request('/buildings/'+building.id+'/telemetry?source=demo','GET',undefined,owner.token)).data.sensors.length,0);
 const rt=(await request('/buildings/'+building.id+'/telemetry/room-temperatures','GET',undefined,owner.token)).data;
 assert.equal(rt.rooms.find(x=>x.id===room.id).reading.value,22);
});

test('re-sent inventory keeps selection; disconnect removes token and all imported data',async()=>{
 const again=await request('/ha-bridge/inventory','POST',{...inventory,entities:inventory.entities.filter(e=>e.entity_id!=='sensor.wallbox_leistung')},null,token);
 assert.deepEqual(again.data.selected,['sensor.wohnzimmer_temperatur']);
 assert.equal((await request(base(),'DELETE',undefined,member.token)).status,403);
 assert.equal((await request(base(),'DELETE',undefined,owner.token)).data.deleted,true);
 for(const t of ['app_ha_links','app_ha_entities','app_ha_areas','app_ha_devices','app_ha_samples'])assert.equal(Number((await db.query(`SELECT COUNT(*) n FROM ${t}`)).rows[0].n),0,t);
 assert.equal((await request('/ha-bridge/states','POST',{states:[{entity_id:'sensor.wohnzimmer_temperatur',value:70,measured_at:now()}]},null,token)).status,401);
 const view=(await request(base(),'GET',undefined,owner.token)).data;assert.equal(view.link,null);
});

test('connection limit per account and expired pairing codes',async()=>{
 await db.query("INSERT INTO app_user_limits(user_id,overrides) VALUES($1,'{\"ha_links\":1}') ON CONFLICT(user_id) DO UPDATE SET overrides=EXCLUDED.overrides",[owner.user.id]);
 assert.equal((await request(base()+'/pairing','POST',{},owner.token)).status,201,'limit counts other buildings only');
 const second=(await request('/buildings','POST',{name:'Zweites'},owner.token)).data;
 assert.equal((await request('/buildings/'+second.id+'/home-assistant/pairing','POST',{},owner.token)).status,429);
 await db.query("UPDATE app_user_limits SET overrides='{}' WHERE user_id=$1",[owner.user.id]);
 const code=(await request(base()+'/pairing','POST',{},owner.token)).data.code;
 await db.query("UPDATE app_ha_links SET pairing_expires_at=now()-interval '1 second' WHERE building_id=$1",[building.id]);
 assert.equal((await request('/ha-bridge/pair','POST',{code})).status,401);
 const fresh=(await request(base()+'/pairing','POST',{},owner.token)).data.code;
 const p=await request('/ha-bridge/pair','POST',{code:fresh});assert.equal(p.status,201);
 assert.equal((await request('/ha-bridge/link','DELETE',undefined,null,p.data.token)).status,200,'Home Assistant can disconnect itself');
 assert.equal((await db.query('SELECT COUNT(*) n FROM app_ha_links')).rows[0].n,0);
});
