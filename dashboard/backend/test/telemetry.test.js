const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {service}=require('../src/twin');
let db,server,url,building,foreign,owner,member,outsider,calls=[];
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const row=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,\'unused\') RETURNING id',[name,name+'@example.test'])).rows[0];row.token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(row.token).digest('hex'),row.id]);await db.query("INSERT INTO app_ai_preferences(user_id,enabled,policy_version,revision) VALUES($1,true,1,1)",[row.id]);return row;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');
 building=(await db.query("INSERT INTO app_buildings(user_id,name,address) VALUES($1,'Shared','PRIVATE_ADDRESS') RETURNING *",[owner.id])).rows[0];
 foreign=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'FOREIGN_BUILDING') RETURNING *",[outsider.id])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.id]);
 const mockFetch=async(u,o)=>{calls.push(JSON.parse(o.body));return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'Begrenzter Messwertkontext. Keine Diagnose.'}]}}]})};};
 const app=express();app.use(express.json({limit:'128kb'}));app.use('/api/v1',accountRouter(db,{assistant:{enabled:true,getKey:()=> 'mock-key-not-a-secret-for-tests',fetch:mockFetch}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.end()});
async function request(user,path,body){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'X-D21-Session':user.token}:{}),'X-Request-ID':body?.key||randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const path=()=>`/buildings/${building.id}/telemetry`;
const sensor=(source='real')=>({source,name:'Temperatur',sensor_code:'TEMP-01',metric:'temperature'});
const batch=(extra={})=>({request_key:randomUUID(),source:'real',rows:[{sensor_code:'TEMP-01',value:22.5,measured_at:'2026-11-03T12:00:00Z'}],...extra});
test('telemetry and sensor setup require accepted building access',async()=>{
 assert.equal((await request(null,path())).status,401);assert.equal((await request(outsider,path())).status,404);
 assert.equal((await request(outsider,path()+'/sensors',sensor())).status,404);
 const created=await request(member,path()+'/sensors',sensor());assert.equal(created.status,201);
 assert.equal((await request(owner,path()+'/sensors',sensor())).data.id,created.data.id);
 assert.equal((await request(owner,path()+'/sensors',{...sensor(),metric:'co2'})).status,409);
 assert.equal((await request(owner,path()+'/sensors',{...sensor(),endpoint:'http://private'})).status,400);
});
test('member CSV import uses same owner records as web; retries never duplicate',async()=>{
 const body=batch(),a=await request(member,path()+'/import',body);assert.equal(a.status,201);assert.equal(a.data.imported,1);
 assert.equal((await request(member,path()+'/import',body)).data.cached,true);
 assert.equal((await request(member,path()+'/import',{...body,rows:[{...body.rows[0],value:24}]})).status,409);
 const rows=(await service(db,owner.id).entities.Measurement.filter({building_id:String(building.id)})).items;assert.equal(rows.length,1);assert.equal(rows[0].value,22.5);
 assert.equal((await service(db,member.id).entities.Measurement.count()),0);
});
test('invalid rows, foreign codes, modes and nonfinite values are rejected atomically',async()=>{
 const before=await service(db,owner.id).entities.Measurement.count();
 assert.equal((await request(owner,path()+'/import',batch({rows:[batch().rows[0],{...batch().rows[0],sensor_code:'FOREIGN'}]}))).status,400);
 assert.equal((await request(owner,path()+'/import',batch({rows:[{...batch().rows[0],value:null}]}))).status,400);
 assert.equal((await request(owner,path()+'/import',batch({rows:[{...batch().rows[0],measured_at:'2026-11-03 12:00'}]}))).status,400);
 assert.equal((await request(owner,path()+'/import',batch({rows:[{...batch().rows[0],measured_at:'2026-02-30T12:00:00Z'}]}))).status,400);
 assert.equal((await request(owner,path()+'/import',batch({source:'anything'}))).status,400);
 assert.equal((await request(owner,path()+'/import',batch({rows:Array(201).fill(batch().rows[0])}))).status,400);
 assert.equal(await service(db,owner.id).entities.Measurement.count(),before);
});
test('sources and buildings stay separate; reviewed analysis contains no private text',async()=>{
 await request(owner,path()+'/sensors',sensor('demo'));await request(owner,path()+'/import',batch({source:'demo',rows:[{...batch().rows[0],value:99}]}));
 const other=service(db,outsider.id).entities;await other.Measurement.create({building_id:String(foreign.id),metric:'co2',value:9999,source:'real',measured_at:'2026-11-03T12:00:00Z',note:'FOREIGN_PRIVATE_NOTE'});
 const real=await request(member,path()+'?source=real'),demo=await request(member,path()+'?source=demo');
 assert.equal(real.data.measurements.length,1);assert.equal(real.data.measurements[0].value,22.5);assert.equal(demo.data.measurements[0].value,99);
 const info=await request(member,`/buildings/${building.id}/assistant?mode=measurement-analysis&source=real`);
 assert.equal(info.data.context.metrics[0].count,1);assert.equal(info.data.context.metrics[0].mean,22.5);
 for(const secret of ['PRIVATE_ADDRESS','FOREIGN_PRIVATE_NOTE','TEMP-01','@example.test','9999'])assert.equal(JSON.stringify(info.data.context).includes(secret),false);
 const answer=await request(member,`/buildings/${building.id}/assistant`,{mode:'measurement-analysis',source:'real',consent:'yes',context_hash:info.data.context_hash,question:'Analysiere die Werte.'});assert.equal(answer.status,200);
 const sent=JSON.stringify(calls.at(-1));assert.ok(sent.includes('22.5'));assert.equal(sent.includes('99,'),false);assert.equal(sent.includes('PRIVATE_ADDRESS'),false);assert.ok(sent.includes('kein Modelltraining'));
});
test('missing consent, wrong source/hash and chat mixing cannot send analysis',async()=>{
 const endpoint=`/buildings/${building.id}/assistant`,info=await request(owner,endpoint+'?mode=measurement-analysis&source=demo'),n=calls.length;
 const body={mode:'measurement-analysis',source:'demo',consent:'yes',context_hash:info.data.context_hash,question:'Werte erläutern'};
 assert.equal((await request(owner,endpoint,{...body,consent:'no'})).status,400);
 assert.equal((await request(owner,endpoint,{...body,source:'real'})).status,409);
 assert.equal((await request(owner,endpoint,{...body,chat:true})).status,400);
 assert.equal((await request(owner,endpoint,{...body,context_hash:'stale'})).status,409);
 assert.equal(calls.length,n);
});
test('invalid-quality records stay visible but are excluded from Gemini aggregates',async()=>{
 await service(db,owner.id).entities.Measurement.create({building_id:String(building.id),metric:'temperature',value:1000,source:'real',measured_at:'2026-11-03T13:00:00Z',quality:'verdaechtig',note:'PRIVATE_NOTE'});
 const info=await request(owner,`/buildings/${building.id}/assistant?mode=measurement-analysis&source=real`);assert.equal(info.data.context.metrics[0].count,1);assert.equal(info.data.context.metrics[0].max,22.5);
 await db.query("UPDATE app_building_members SET status='pending' WHERE building_id=$1 AND user_id=$2",[building.id,member.id]);assert.equal((await request(member,path())).status,404);assert.equal((await request(member,path()+'/import',batch())).status,404);
});
test('empty analysis does not call Gemini and changed data invalidates prior consent',async()=>{
 const empty=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Empty') RETURNING id",[owner.id])).rows[0];
 const emptyPath=`/buildings/${empty.id}/assistant`,info=await request(owner,emptyPath+'?mode=measurement-analysis&source=real'),before=calls.length;
 assert.equal((await request(owner,emptyPath,{mode:'measurement-analysis',source:'real',context_hash:info.data.context_hash,consent:'yes',question:'Analyse'})).status,422);assert.equal(calls.length,before);
 const endpoint=`/buildings/${building.id}/assistant`,review=await request(owner,endpoint+'?mode=measurement-analysis&source=real');
 await request(owner,path()+'/import',batch({rows:[{...batch().rows[0],value:24}]}));
 assert.equal((await request(owner,endpoint,{mode:'measurement-analysis',source:'real',context_hash:review.data.context_hash,consent:'yes',question:'Analyse'})).status,409);assert.equal(calls.length,before);
});
