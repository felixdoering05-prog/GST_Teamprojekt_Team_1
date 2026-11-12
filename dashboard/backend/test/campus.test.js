const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash}=require('node:crypto');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {initAccounts,accountRouter}=require('../src/accounts');
const {MAX_MODEL}=require('../src/campus');
let db,server,url,directory,owner,member,pending,other,building;
const config={};
const sample=Buffer.from("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n");
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};
 await initAccounts(db);
 async function user(name){const row=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.invalid','test-only'])).rows[0];row.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(row.token).digest('hex'),row.id,new Date(Date.now()+86400000)]);return row;}
 owner=await user('Owner');member=await user('Member');pending=await user('Pending');other=await user('Other');
 building=(await db.query("INSERT INTO app_buildings(user_id,name,address) VALUES($1,'D21','Testadresse') RETURNING id",[owner.id])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted'),($1,$3,'pending')",[building.id,member.id,pending.id]);
 directory=await mkdtemp(path.join(tmpdir(),'d21-campus-'));config.file=path.join(directory,'model.ifc');config.buildingID=building.id;await writeFile(config.file,sample);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db,{campus:config}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1/campus`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end();await rm(directory,{recursive:true,force:true});});
const get=(who,route='/d21')=>fetch(url+route,{headers:who?{'X-D21-Session':who.token}:{}});
test('anonymous, unrelated and pending accounts cannot discover or download the private IFC',async()=>{
 for(const route of ['/d21','/d21/model']){
  assert.equal((await get(null,route)).status,401);
  for(const who of [other,pending]){const r=await get(who,route);assert.equal(r.status,404);assert.equal((await r.text()).includes(directory),false);}
 }
});
test('owner and accepted members read exact bytes without database upload or path disclosure',async()=>{
 for(const who of [owner,member]){
  const metadata=await get(who);assert.equal(metadata.status,200);assert.equal(metadata.headers.get('cache-control'),'private, no-store');const body=await metadata.json();assert.equal(body.size,sample.length);assert.equal(body.read_only,true);assert.equal(body.building_id,String(building.id));assert.equal(JSON.stringify(body).includes(directory),false);
  const r=await get(who,'/d21/model?file=../../etc/passwd');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-type'),/application\/x-step/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),sample);
 }
 assert.equal(Number((await db.query('SELECT count(*) FROM app_documents')).rows[0].count),0);
});
test('revoked building membership takes effect on the next download',async()=>{
 await db.query('DELETE FROM app_building_members WHERE building_id=$1 AND user_id=$2',[building.id,member.id]);assert.equal((await get(member,'/d21/model')).status,404);
});
test('missing or unknown building configuration, invalid IFC and oversized files fail without exposing the server path',async()=>{
 config.buildingID='';assert.equal((await get(owner)).status,503);
 config.buildingID='999999';assert.equal((await get(owner)).status,503);
 config.buildingID=building.id;
 const original=config.file;config.file='relative.ifc';assert.equal((await get(owner)).status,503);config.file=path.join(directory,'missing.ifc');assert.equal((await get(owner)).status,503);config.file=original;
 await writeFile(config.file,'not IFC');assert.equal((await get(owner)).status,415);
 await writeFile(config.file,Buffer.alloc(MAX_MODEL+1));assert.equal((await get(owner,'/d21/model')).status,413);await writeFile(config.file,sample);
 assert.equal((await get(owner)).status,200);
});
