const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
let pg,db,server,url,a,b;
before(async()=>{
 pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};await initAccounts(db);
 async function user(name){const id=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,name+'@example.test'])).rows[0].id;const token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),id]);return {id,token};}
 a=await user('First');b=await user('Second');
 await db.query("INSERT INTO app_voice_usage(user_id,request_key,kind,status) VALUES($1,$2,'live','ended'),($3,$4,'live','ended'),($3,$5,'live','ended')",[a.id,randomUUID(),b.id,randomUUID(),randomUUID()]);
 await db.query("INSERT INTO app_voice_usage(user_id,request_key,kind,status,created_at) VALUES($1,$2,'live','ended',now()-interval '25 hours')",[a.id,randomUUID()]);
 const app=express();app.use('/api/v1',accountRouter(db));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1/profile/service-status`;
});
after(async()=>{await new Promise(r=>server.close(r));await pg.close();});
const request=token=>fetch(url,{headers:token?{'X-D21-Session':token}:{}});
test('service status requires account authentication',async()=>{assert.equal((await request()).status,401);});
test('reports only current account and last 24 hours without private configuration',async()=>{
 const response=await request(a.token),data=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(data.usage_24h.live.used,1);assert.equal(data.usage_24h.live.limit,10);assert.equal(data.account_ai_enabled,false);assert.deepEqual(data.generation,{queued:0,running:0,ready:0,failed_24h:0});assert.equal(JSON.stringify(data).includes('@example.test'),false);assert.equal(JSON.stringify(data).includes('api_key'),false);assert.equal((await (await request(b.token)).json()).usage_24h.live.used,2);
});
test('account exception is reflected without exposing allowlist',async()=>{
 process.env.AI_CONVERSATION_UNLIMITED_USER_IDS=String(a.id);
 try{const own=await (await request(a.token)).json(),other=await (await request(b.token)).json();assert.equal(own.usage_24h.live.limit,null);assert.equal(own.usage_24h.questions.limit,null);assert.equal(other.usage_24h.live.limit,10);}finally{delete process.env.AI_CONVERSATION_UNLIMITED_USER_IDS;}
});
