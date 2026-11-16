const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{randomUUID,randomBytes,createHash}=require('crypto');
const {initAccounts,accountRouter}=require('../src/accounts'),{service}=require('../src/twin');
let db,server,url,owner,member,outsider,building,otherBuilding,device,ids,plain;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const row=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,name+'@example.test'])).rows[0];row.token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(row.token).digest('hex'),row.id]);return row;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');
 building=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'ESP32') RETURNING *",[owner.id])).rows[0];otherBuilding=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Other') RETURNING *",[owner.id])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.id]);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
 device=(await request(owner,`/buildings/${building.id}/sensor-devices`,{room:'Office'})).data;
 const map=(await db.query('SELECT sensors FROM app_sensor_devices WHERE id=$1',[device.id])).rows[0].sensors;ids=[map.temperature,map.humidity,map.co2];
 const e=service(db,owner.id).entities;
 for(const metric of ['temperature','humidity','co2'])await e.Measurement.create({...point(map[metric]),metric,value:22});
 plain=await e.Sensor.create({building_id:String(building.id),name:'Ordinary demo',sensor_code:'PLAIN',metric:'temperature',source:'demo'});
 await e.Measurement.create({...point(plain.id),value:999});
 await e.EnergyReading.create({building_id:String(building.id),medium:'strom',value:99,unit:'kWh',source:'demo',period_start:'2026-11-01T00:00:00Z',period_end:'2026-11-02T00:00:00Z'});
 // Legacy/corrupted references must not cross account/building boundaries.
 await db.query("INSERT INTO app_twin_records(id,user_id,entity,data) VALUES($1,$2,'Measurement',$3)",[randomUUID(),owner.id,JSON.stringify({...point(map.temperature),building_id:String(otherBuilding.id),value:888})]);
 await db.query("INSERT INTO app_twin_records(id,user_id,entity,data) VALUES($1,$2,'Measurement',$3)",[randomUUID(),outsider.id,JSON.stringify({...point(map.temperature),value:777})]);
 await e.Measurement.create({...point(map.temperature),source:'real',value:666});
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.end()});
async function request(user,path,body,method=body?'POST':'GET'){const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json','Connection':'close',...(user?{'X-D21-Session':user.token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')};}
const endpoint=()=>`/buildings/${building.id}/telemetry/esp32`;
const point=id=>({building_id:String(building.id),sensor_id:id,metric:'temperature',value:20,source:'demo',quality:'ok',measured_at:'2026-11-16T11:00:00Z'});
test('ESP32 snapshots require access and exclude unrelated source, building, account and ordinary demo records',async()=>{
 assert.equal((await request(null,endpoint())).status,401);assert.equal((await request(outsider,endpoint())).status,404);assert.equal((await request(owner,'/buildings/not-an-id/telemetry/esp32')).status,400);
 const r=await request(member,endpoint());assert.equal(r.status,200);assert.match(r.cache,/no-store/);assert.equal(r.data.source,'demo');assert.match(r.data.scope,/simulierte/);
 assert.equal(r.data.sensors.length,3);assert.equal(r.data.measurements.length,3);assert.ok(r.data.sensors.every(s=>ids.includes(s.id)&&s.source==='demo'));assert.ok(r.data.measurements.every(m=>ids.includes(m.sensor_id)&&m.source==='demo'&&m.value===22));assert.deepEqual(r.data.energy,[]);
 for(const secret of [device.token,'token_hash','Ordinary demo'])assert.equal(JSON.stringify(r.data).includes(secret),false);
 assert.equal((await request(owner,`/buildings/${otherBuilding.id}/telemetry/esp32`)).data.sensors.length,0);
 assert.ok((await request(owner,`/buildings/${building.id}/telemetry?source=demo`)).data.sensors.some(s=>s.id===plain.id));
});
test('sensor mapping filter is applied before the measurement bound',async()=>{
 await db.query("INSERT INTO app_twin_records(id,user_id,entity,data) SELECT 'mapped-'||n,$1,'Measurement',$2::jsonb FROM generate_series(1,501) n",[owner.id,JSON.stringify(point(ids[0]))]);
 await db.query("INSERT INTO app_twin_records(id,user_id,entity,data) SELECT 'ordinary-'||n,$1,'Measurement',$2::jsonb FROM generate_series(1,600) n",[owner.id,JSON.stringify(point(plain.id))]);
 const r=await request(owner,endpoint());assert.equal(r.data.measurements.length,500);assert.equal(r.data.truncated,true);assert.ok(r.data.measurements.every(m=>ids.includes(m.sensor_id)));
});
test('revoked device readings vanish; pending member cannot read them',async()=>{
 await request(owner,`/sensor-devices/${device.id}`,undefined,'DELETE');const r=await request(owner,endpoint());assert.equal(r.status,200);assert.deepEqual(r.data.sensors,[]);assert.deepEqual(r.data.measurements,[]);
 await db.query("UPDATE app_building_members SET status='pending' WHERE building_id=$1 AND user_id=$2",[building.id,member.id]);assert.equal((await request(member,endpoint())).status,404);
});
