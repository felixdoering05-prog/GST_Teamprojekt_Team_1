const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{randomBytes,createHash}=require('crypto');
const {initAccounts,accountRouter}=require('../src/accounts'),{service}=require('../src/twin');
const {normalize,matchSpace}=require('../src/sensor-placement');
// Wohnungs-IFC mit vier Räumen; „Bad“ kommt zweimal vor (mehrdeutig).
const bytes=Buffer.from("ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;"+
 "#1464=IFCSPACE('1BUX0TXmbBVvh9kVlMbxKR',$,'HP-02',$,$,$,$,'Zimmer II',$,.INTERNAL.,$);"+
 "#1500=IFCSPACE('0xJTxmotLAXekNhP8q7Df8',$,'HP-03',$,$,$,$,'Schlafzimmer',$,.INTERNAL.,$);"+
 "#1600=IFCSPACE('2aaaaaaaaaaaaaaaaaaaaa',$,'HP-04',$,$,$,$,'Bad',$,.INTERNAL.,$);"+
 "#1700=IFCSPACE('3bbbbbbbbbbbbbbbbbbbbb',$,'OG-04',$,$,$,$,'Bad',$,.INTERNAL.,$);ENDSEC;END-ISO-10303-21;");
let db,server,url,owner,member,outsider,building,doc,api;
const ids={};
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,name+'@example.test'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(u.token).digest('hex'),u.id]);return u;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');
 building=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Zuhause') RETURNING id",[owner.id])).rows[0].id;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building,member.id]);
 doc=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Grundriss.ifc','application/x-step',$2,$3) RETURNING id",[building,bytes.length,bytes])).rows[0].id;
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
 api=service(db,owner.id).entities;const B=String(building);
 const room=async name=>(await api.Room.create({name,room_code:'R-'+name.slice(0,8),building_id:B,source:'real'})).id;
 const sensor=async(code,data)=>(await api.Sensor.create({sensor_code:code,name:code,metric:'temperature',unit:'°C',status:'aktiv',source:'real',...data})).id;
 ids.auto=await sensor('AUTO',{building_id:B,room_id:await room('Schlafzimmer')});
 ids.noRoom=await sensor('NOROOM',{building_id:B});
 ids.noBuilding=await sensor('NOBUILDING',{});
 ids.unknown=await sensor('UNKNOWN',{building_id:B,room_id:await room('Wintergarten')});
 ids.ambiguous=await sensor('AMBIG',{building_id:B,room_id:await room('Bad')});
 ids.demo=await sensor('DEMO',{building_id:B,source:'demo'});
 ids.inactive=await sensor('OFF',{building_id:B,status:'inaktiv'});
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.end()});
async function req(user,path,method='GET',body){const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json','Connection':'close',...(user?{'X-D21-Session':user.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
const sync=user=>req(user,`/documents/${doc}/sensor-placement/sync`,'POST',{});

test('room names are compared without case, spaces or umlaut differences',()=>{
 assert.equal(normalize(' Schlaf-Zimmer '),'schlafzimmer');assert.equal(normalize('Küche'),normalize('Kuche'));assert.equal(normalize('Straße'),'strasse');
 const spaces=[{id:1,keys:new Set(['hp02','zimmerii'])},{id:2,keys:new Set(['bad'])},{id:3,keys:new Set(['bad'])}];
 assert.equal(matchSpace(spaces,{name:'Zimmer II'}).id,1);assert.equal(matchSpace(spaces,{name:'x',room_code:'HP-02'}).id,1);
 assert.equal(matchSpace(spaces,{name:'Bad'}),null);assert.equal(matchSpace(spaces,{name:''}),null);
});

test('sync links unique matches automatically and asks for the rest; access is scoped',async()=>{
 assert.equal((await sync(null)).status,401);assert.equal((await sync(outsider)).status,404);
 const m=await sync(member);assert.equal(m.status,200);
 assert.deepEqual(m.data.linked.map(x=>[x.id,x.space_id]),[[ids.auto,1500]]);
 const reasons=Object.fromEntries(m.data.open.map(x=>[x.id,x.reason]));
 assert.deepEqual(reasons,{[ids.noRoom]:'no-room',[ids.unknown]:'room-not-in-model',[ids.ambiguous]:'room-not-in-model'});
 assert.equal(m.data.spaces.length,4);
 const room=(await api.Room.filter({building_id:String(building),name:'Schlafzimmer'})).items[0];assert.equal(room.ifc_global_id,'0xJTxmotLAXekNhP8q7Df8');
 // Der Eigentümer sieht zusätzlich seinen Sensor ohne Gebäude.
 const o=await sync(owner);assert.deepEqual(o.data.linked,[]);
 assert.equal(o.data.open.find(x=>x.id===ids.noBuilding)?.reason,'no-building');
 assert.ok(!o.data.open.some(x=>[ids.demo,ids.inactive,ids.auto].includes(x.id)));
});

test('answers place sensors in IFC rooms, skips stay skipped and the overlay shows the values',async()=>{
 const put=(user,sensor,body)=>req(user,`/documents/${doc}/sensor-placement/${sensor}`,'PUT',body);
 assert.equal((await put(owner,ids.noRoom,{space_id:9999})).status,404);
 assert.equal((await put(owner,ids.noRoom,{space_id:1464,skip:true})).status,400);
 assert.equal((await put(outsider,ids.noRoom,{space_id:1464})).status,404);
 assert.equal((await put(member,ids.noBuilding,{space_id:1464})).status,404);
 const a=await put(member,ids.noRoom,{space_id:1464});assert.equal(a.status,200);assert.equal(a.data.space_id,1464);
 const created=(await api.Room.filter({id:a.data.room_id})).items[0];assert.deepEqual([created.name,created.room_code],['Zimmer II','HP-02']);
 const b=await put(owner,ids.noBuilding,{space_id:1464});assert.equal(b.status,200);assert.equal(b.data.room_id,a.data.room_id);
 assert.equal((await api.Sensor.filter({id:ids.noBuilding})).items[0].building_id,String(building));
 // Vorhandener Raum ohne IFC-Bezug wird mit dem gewählten Raum verknüpft statt dupliziert.
 const c=await put(owner,ids.ambiguous,{space_id:1600});assert.equal(c.status,200);
 assert.equal((await api.Room.filter({id:c.data.room_id})).items[0].name,'Bad');
 assert.deepEqual((await put(owner,ids.unknown,{skip:true})).data,{skipped:true});
 assert.deepEqual((await sync(owner)).data.open,[]);
 await api.Measurement.create({sensor_id:ids.noBuilding,metric:'temperature',value:20.5,unit:'°C',measured_at:new Date().toISOString(),source:'real',quality:'ok'});
 const overlay=await req(member,`/documents/${doc}/sensor-overlay`);
 assert.deepEqual(overlay.data.rooms.find(x=>x.space_id===1464)?.values.map(v=>v.value),[20.5]);
});
