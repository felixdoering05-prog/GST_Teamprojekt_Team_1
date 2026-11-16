const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{randomBytes,randomUUID,createHash}=require('crypto');
const {initAccounts,accountRouter}=require('../src/accounts'),{service}=require('../src/twin');
// Zwei Räume wie in einer Wohnungs-IFC; HP-03 ist der Zielraum des echten ESP32.
const bytes=Buffer.from("ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;#1464=IFCSPACE('1BUX0TXmbBVvh9kVlMbxKR',$,'HP-02',$,$,$,$,'Zimmer II',$,.INTERNAL.,$);#1500=IFCSPACE('0xJTxmotLAXekNhP8q7Df8',$,'HP-03',$,$,$,$,'Zimmer III',$,.INTERNAL.,$);ENDSEC;END-ISO-10303-21;");
let db,server,url,owner,member,outsider,building,foreign,doc,foreignDoc,device;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,name+'@example.test'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(u.token).digest('hex'),u.id]);return u;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');
 building=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Zuhause') RETURNING id",[owner.id])).rows[0].id;
 foreign=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Fremd') RETURNING id",[outsider.id])).rows[0].id;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building,member.id]);
 const addDoc=async b=>(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Wohnung.ifc','application/x-step',$2,$3) RETURNING id",[b,bytes.length,bytes])).rows[0].id;
 doc=await addDoc(building);foreignDoc=await addDoc(foreign);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
 device=(await req(owner,`/buildings/${building}/sensor-devices`,'POST',{room:'Schlafzimmer'})).data;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.end()});
async function req(user,path,method='GET',body,headers={}){const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json','Connection':'close',...(user?{'X-D21-Session':user.token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
const send=(values)=>req(null,'/sensor-input','POST',{request_key:randomUUID(),...values},{'X-D21-Device':device.token});
const allowNextPacket=()=>db.query("UPDATE app_sensor_devices SET last_at=now()-interval '2 minutes' WHERE id=$1",[device.id]);

test('only the owner can switch hardware and place the device in an IFC room of the same building',async()=>{
 const list=await req(member,`/buildings/${building}/sensor-devices`);assert.equal(list.status,200);assert.equal(list.data.length,1);assert.equal(list.data[0].hardware,'simulation');assert.equal(JSON.stringify(list.data).includes(device.token),false);
 assert.equal((await req(outsider,`/buildings/${building}/sensor-devices`)).status,404);
 const body={hardware:'bme280',document_id:doc,space_id:1500,revision:0};
 assert.equal((await req(member,`/sensor-devices/${device.id}`,'PUT',body)).status,404);
 assert.equal((await req(owner,`/sensor-devices/${device.id}`,'PUT',{...body,document_id:foreignDoc})).status,404);
 assert.equal((await req(owner,`/sensor-devices/${device.id}`,'PUT',{...body,space_id:9999})).status,400);
 assert.equal((await req(owner,`/sensor-devices/${device.id}`,'PUT',{...body,revision:5})).status,409);
 assert.equal((await req(owner,`/sensor-devices/${device.id}`,'PUT',{...body,hardware:'quantum'})).status,400);
 const r=await req(owner,`/sensor-devices/${device.id}`,'PUT',body);
 assert.equal(r.status,200);assert.deepEqual({hardware:r.data.hardware,source:r.data.source,room:r.data.room,space_id:r.data.space_id,revision:r.data.revision},{hardware:'bme280',source:'real',room:'HP-03 · Zimmer III',space_id:1500,revision:1});
 assert.equal((await req(owner,`/sensor-devices/${device.id}`,'PUT',{hardware:'simulation',revision:1})).status,400);
 const rooms=(await service(db,owner.id).entities.Room.filter({building_id:String(building),source:'real'})).items;
 assert.equal(rooms.length,1);assert.equal(rooms[0].ifc_global_id,'0xJTxmotLAXekNhP8q7Df8');assert.equal(rooms[0].room_code,'HP-03');
});

test('real device accepts exactly temperature and humidity and stores them as real measurements in the IFC room',async()=>{
 assert.equal((await send({temperature:21.5,humidity:48,co2:400})).status,400);
 assert.equal((await send({temperature:21.5})).status,400);
 const ok=await send({temperature:21.5,humidity:48});assert.equal(ok.status,201);assert.deepEqual(ok.data,{imported:2,source:'real'});
 const m=(await service(db,owner.id).entities.Measurement.filter({building_id:String(building),source:'real'})).items;
 assert.equal(m.length,2);const room=(await service(db,owner.id).entities.Room.filter({building_id:String(building),source:'real'})).items[0];assert.ok(m.every(x=>x.room_id===room.id));
 const heat=await req(member,`/buildings/${building}/telemetry/room-temperatures`);assert.equal(heat.data.rooms.find(x=>x.id===room.id).reading.value,21.5);
 const esp=await req(member,`/buildings/${building}/telemetry/esp32`);assert.equal(esp.data.source,'real');assert.match(esp.data.scope,/echte Messwerte/);assert.equal(esp.data.sensors.length,2);assert.ok(esp.data.measurements.every(p=>p.source==='real'));
});

test('3D overlay returns latest values per IFC space and is access scoped',async()=>{
 await allowNextPacket();assert.equal((await send({temperature:22.25,humidity:51})).status,201);
 assert.equal((await req(outsider,`/documents/${doc}/sensor-overlay`)).status,404);assert.equal((await req(null,`/documents/${doc}/sensor-overlay`)).status,401);
 const r=await req(member,`/documents/${doc}/sensor-overlay`);assert.equal(r.status,200);assert.equal(r.data.rooms.length,1);
 const room=r.data.rooms[0];assert.equal(room.space_id,1500);assert.equal(room.room,'HP-03 · Zimmer III');assert.equal(room.source,'real');assert.equal(room.stale,false);
 assert.deepEqual(room.values.map(v=>[v.metric,v.value,v.unit]),[['temperature',22.25,'°C'],['humidity',51,'%']]);
 assert.equal(JSON.stringify(r.data).includes(device.token),false);
 assert.deepEqual((await req(outsider,`/documents/${foreignDoc}/sensor-overlay`)).data.rooms,[]);
 await req(owner,`/sensor-devices/${device.id}`,'DELETE');assert.deepEqual((await req(member,`/documents/${doc}/sensor-overlay`)).data.rooms,[]);
});
