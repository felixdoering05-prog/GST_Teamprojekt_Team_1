const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
let db,server,url,alice,bob,building,floor;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(s,a)=>pg.query(s,a),connect:async()=>({query:(s,a)=>pg.query(s,a),release(){}}),end:()=>pg.close()};
 await initAccounts(db);const app=express();app.use((req,res,next)=>req.path.startsWith('/api/v1/twin/')?next():express.json({limit:'16kb'})(req,res,next));app.use('/api/v1',accountRouter(db));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
 alice=(await call('/auth/register',{name:'Alice',email:'twin-a@example.test',password:'Test-password-123'})).body;
 bob=(await call('/auth/register',{name:'Bob',email:'twin-b@example.test',password:'Test-password-456'})).body;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function call(path,body,token){const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'X-D21-Session':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
const action=(entity,op,body={},token=alice.token)=>call(`/twin/${entity}/${op}`,body,token);
test('existing iPhone buildings and login are shared; foreign accounts remain isolated',async()=>{
 assert.equal((await call('/twin/Building/list',{})).status,401);
 building=(await call('/buildings',{name:'iPhone Haus',address:'Darmstadt'},alice.token)).body;
 assert.equal((await action('Building','list')).body[0].id,String(building.id));
 assert.deepEqual((await action('Building','list',{},bob.token)).body,[]);
 const r=await action('Building','update',{id:String(building.id),data:{code:'D21',name:'Gemeinsam'}});assert.equal(r.status,200);assert.equal(r.body.code,'D21');
 assert.equal((await call('/buildings',undefined,alice.token)).body[0].name,'Gemeinsam');
 assert.equal((await action('Building','update',{id:String(building.id),data:{name:'fremd'}},bob.token)).status,404);
});
test('schema, foreign references and hierarchy are checked on the server',async()=>{
 assert.equal((await action('Floor','create',{data:{name:'EG',level:'bad'}})).status,400);
 assert.equal((await action('Room','create',{data:{name:'Raum',room_code:'R1',building_id:String(building.id)}},bob.token)).status,404);
 floor=(await action('Floor','create',{data:{name:'EG',level:0,building_id:String(building.id),source:'real'}})).body;
 const other=(await action('Building','create',{data:{name:'Anderes'}})).body;
 assert.equal((await action('Room','create',{data:{name:'Raum',room_code:'R1',building_id:other.id,floor_id:floor.id}})).status,400);
 assert.equal((await action('Floor','create',{data:{name:'EG',user_id:1}})).status,400);
 assert.equal((await action('Unknown','list')).status,404);
});
test('imports persist with sorting/pagination; bulk failures roll back',async()=>{
 const room=(await action('Room','create',{data:{name:'Seminar',room_code:'R1',building_id:String(building.id),floor_id:floor.id,source:'real'}})).body;
 const sensor=(await action('Sensor','create',{data:{sensor_code:'S1',metric:'temperature',building_id:String(building.id),room_id:room.id,source:'real'}})).body;
 const rows=[21,22,29].map((value,i)=>({value,metric:'temperature',measured_at:new Date(Date.now()-i*1000).toISOString(),source:'real',sensor_id:sensor.id,building_id:String(building.id),room_id:room.id}));
 assert.equal((await action('Measurement','bulkCreate',{data:rows})).status,200);
 let page=(await action('Measurement','filter',{filter:{value:{$gte:22}},options:{sort:'-value',limit:1}})).body;assert.equal(page.items[0].value,29);assert.equal(page.has_more,true);
 page=(await action('Measurement','filter',{filter:{value:{$gte:22}},options:{sort:'-value',limit:1,cursor:page.next_cursor}})).body;assert.equal(page.items[0].value,22);assert.equal(page.has_more,false);
 assert.equal((await action('Measurement','count',{},bob.token)).body,0);
 const invalid=await action('Measurement','bulkCreate',{data:[rows[0],{value:'bad'}]});assert.equal(invalid.status,400);assert.equal((await action('Measurement','count')).body,3);
 assert.equal((await action('Measurement','filter',{filter:{source:{$wat:'real'}}})).status,400);
 assert.equal((await action('Measurement','bulkCreate',{data:Array(201).fill({})})).status,400);
 assert.equal((await action('Floor','delete',{id:floor.id})).status,409);
 await initAccounts(db);assert.equal((await action('Measurement','count')).body,3);
});
test('uploads use the existing iPhone document table and enforce ownership',async()=>{
 const r=await fetch(`${url}/buildings/${building.id}/documents`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-D21-Session':alice.token,'X-File-Name':'plan.pdf'},body:Buffer.from('%PDF-1.7\nshared test')});assert.equal(r.status,201);
 const doc=await r.json();assert.equal((await call(`/buildings/${building.id}/documents`,undefined,alice.token)).body[0].id,doc.id);assert.equal((await call(`/documents/${doc.id}`,undefined,bob.token)).status,404);
});
test('demo and rule functions are account-scoped and idempotent',async()=>{
 const seeded=await call('/twin-functions/seedDemoData',{},bob.token);assert.equal(seeded.status,200,JSON.stringify(seeded.body));assert.equal(seeded.body.created,true);assert.equal(seeded.body.counts.rooms,12);
 assert.equal((await call('/twin-functions/seedDemoData',{},bob.token)).body.created,false);
 assert.equal((await action('Room','count')).body,1);
 const check=await call('/twin-functions/runThresholdCheck',{sinceHours:4},bob.token);assert.equal(check.status,200);assert.equal(check.body.created,0);
 assert.equal((await call('/twin-functions/notAllowed',{},bob.token)).status,404);
});
