const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto');
const {initDevices,devicesRouter}=require('../src/devices');
const {initCollaboration}=require('../src/collaboration');
let db,server,url;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};
 await pg.exec('CREATE TABLE app_users(id SERIAL PRIMARY KEY,name TEXT,email TEXT);CREATE TABLE app_buildings(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES app_users(id),name TEXT);INSERT INTO app_users(name) VALUES(\'Owner\'),(\'Member\'),(\'Outsider\');INSERT INTO app_buildings(user_id,name) VALUES(1,\'D21\'),(3,\'Other\')');
 await initCollaboration(db);await initDevices(db);await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES(1,2,'accepted')");
 const app=express();app.use(express.json());app.use(devicesRouter(db,(req,res,next)=>{const id=Number(req.get('X-Test-User'));if(![1,2,3].includes(id))return res.sendStatus(401);req.account={id};next();}));app.use((e,req,res,next)=>res.status(500).json({error:e.message}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/buildings/1/devices`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.end()});
async function call(user,body,method='POST',suffix=''){const r=await fetch(url+suffix,{method:body?method:'GET',headers:{'Content-Type':'application/json','X-Test-User':String(user)},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.status===401?null:await r.json()};}
const device=(extra={})=>({name:'Deckenlicht',room:'Raum 1',kind:'light',mode:'simulation',integration:'none',request_key:randomUUID(),...extra});
test('devices require login and accepted membership',async()=>{
 assert.equal((await call(0)).status,401);assert.equal((await call(3)).status,404);assert.equal((await call(3,device())).status,404);assert.equal((await call(2)).status,200);
});
test('creation is shared and retries are idempotent',async()=>{
 const body=device(),a=await call(1,body),b=await call(2,body);assert.equal(a.status,201);assert.equal(a.data.id,b.data.id);
 assert.equal((await call(1,{...body,name:'Changed'})).status,409);assert.equal((await call(2)).data.filter(d=>d.id===a.data.id).length,1);
 assert.equal((await call(1,device({integration:'mqtt'}))).status,400);assert.equal((await call(1,device({token:'secret'}))).status,400);
});
test('only simulations can be switched, with revision protection and building isolation',async()=>{
 const a=(await call(1,device())).data;let r=await call(2,{is_on:true,revision:0},'PATCH','/'+a.id);assert.equal(r.status,200);assert.equal(r.data.is_on,true);
 assert.equal((await call(1,{is_on:false,revision:0},'PATCH','/'+a.id)).status,409);
 assert.equal((await call(3,{is_on:false,revision:1},'PATCH','/'+a.id)).status,404);
 const planned=(await call(1,device({mode:'planned',integration:'home-assistant'}))).data;
 assert.equal((await call(1,{is_on:true,revision:0},'PATCH','/'+planned.id)).status,409);
 const sensor=(await call(1,device({kind:'temperature'}))).data;assert.equal((await call(1,{is_on:true,revision:0},'PATCH','/'+sensor.id)).status,409);
});
test('revoked membership immediately blocks reads and writes',async()=>{
 await db.query("UPDATE app_building_members SET status='pending' WHERE building_id=1 AND user_id=2");assert.equal((await call(2)).status,404);assert.equal((await call(2,device())).status,404);
});
test('foreign device IDs and invalid fields cannot be used for writes',async()=>{
 const own=(await call(1,device())).data;
 await db.query('UPDATE app_devices SET building_id=2 WHERE id=$1',[own.id]);
 assert.equal((await call(1,{is_on:true,revision:0},'PATCH','/'+own.id)).status,404);
 assert.equal((await call(1,device({name:' '}))).status,400);
 assert.equal((await call(1,device({room:'x'.repeat(101)}))).status,400);
 assert.equal((await call(1,device({kind:'arbitrary'}))).status,400);
 assert.equal((await call(1,device({mode:'live'}))).status,400);
});
test('building capacity is bounded while existing create retries still work',async()=>{
 const body=device(),old=(await call(1,body)).data;
 await db.query("INSERT INTO app_devices(building_id,name,kind,mode,integration,request_key) SELECT 1,'Test '||n,'light','simulation','none','capacity-'||n FROM generate_series(1,100-(SELECT COUNT(*)::int FROM app_devices WHERE building_id=1)) n");
 assert.equal((await call(1,device())).status,409);assert.equal((await call(1,body)).data.id,old.id);
});
