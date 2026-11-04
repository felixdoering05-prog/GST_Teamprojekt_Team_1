const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{randomBytes,randomUUID,createHash}=require('crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
let db,server,url,owner,other,config,calls=[],on=false,mode='ok';
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,name+'@example.test'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(u.token).digest('hex'),u.id]);return u;}
 owner=await user('Owner');other=await user('Other');config={base_url:'https://ha.example.test',account_id:owner.id,lights:[{key:'desk',entity_id:'light.desk',name:'Desk',room:'Private room'}]};
 const mock=async(url,options)=>{calls.push({url,options});if(mode==='auth')return new Response('{}',{status:401});if(url.includes('/services/')){if(mode==='timeout')throw Error('private-token and internal details');if(mode!=='stale')on=url.endsWith('/turn_on');return new Response('[]');}return new Response(JSON.stringify({entity_id:'light.desk',state:mode==='offline'?'unavailable':on?'on':'off',attributes:{secret:'not returned'}}));};
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db,{homeAssistant:{getConfig:()=>config,getToken:()=> 'private-token-with-enough-characters',fetch:mock}}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1/integrations/home-assistant/lights`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function req(user,path='',body,key=randomUUID()){const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Request-ID':key,...(user?{'X-D21-Session':user.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
test('private allowlist hides device names and makes no HA calls for other accounts',async()=>{
 assert.equal((await req(null)).status,401);assert.deepEqual((await req(other)).data,{configured:false,lights:[]});assert.equal((await req(other,'/desk/command',{on:true})).status,404);assert.equal(calls.length,0);
 const data=await req(owner);assert.equal(data.status,200);assert.equal(data.data.lights[0].is_on,false);assert.equal(JSON.stringify(data).includes('private-token'),false);assert.equal(JSON.stringify(data).includes('entity_id'),false);assert.equal(JSON.stringify(data).includes('not returned'),false);assert.equal(calls.at(-1).options.redirect,'error');assert.equal(calls.at(-1).url,'https://ha.example.test/api/states/light.desk');
});
test('only exact configured lamp and boolean action; no arbitrary URLs, entities or services',async()=>{
 const n=calls.length;for(const b of [{on:'true'},{on:true,entity_id:'light.other'},{on:true,url:'http://127.0.0.1'},{on:true,service:'unlock'}])assert.equal((await req(owner,'/desk/command',b)).status,400);
 assert.equal((await req(owner,'/unknown/command',{on:true})).status,404);assert.equal((await req(owner,'/desk/command',{on:true},'bad')).status,400);assert.equal(calls.length,n);
});
test('switch uses fixed light service once and verifies actual state; duplicate UUID cannot replay',async()=>{
 const key=randomUUID(),a=await req(owner,'/desk/command',{on:true},key);assert.equal(a.status,200);assert.equal(a.data.confirmed,true);assert.equal(a.data.light.is_on,true);
 const writes=calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].url,'https://ha.example.test/api/services/light/turn_on');assert.deepEqual(JSON.parse(writes[0].options.body),{entity_id:'light.desk'});
 assert.equal((await req(owner,'/desk/command',{on:true},key)).status,409);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 assert.equal((await req(owner,'/desk/command',{on:true})).status,200);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('unavailable is null, never off, and cannot be switched',async()=>{
 mode='offline';const n=calls.filter(c=>c.options.method==='POST').length;const a=await req(owner);assert.equal(a.data.lights[0].available,false);assert.equal(a.data.lights[0].is_on,null);assert.equal((await req(owner,'/desk/command',{on:false})).status,409);assert.equal(calls.filter(c=>c.options.method==='POST').length,n);mode='ok';
});
test('timeouts are not retried and provider/auth errors expose no secrets',async()=>{
 mode='timeout';const key=randomUUID(),n=calls.filter(c=>c.options.method==='POST').length,a=await req(owner,'/desk/command',{on:false},key);assert.equal(a.status,503);assert.equal(JSON.stringify(a).includes('private-token'),false);assert.equal(calls.filter(c=>c.options.method==='POST').length,n+1);assert.equal((await req(owner,'/desk/command',{on:false},key)).status,409);
 mode='auth';assert.equal((await req(owner)).data.lights[0].available,false);mode='ok';
});
test('acknowledged but unchanged lamp is unconfirmed, not a fabricated success',async()=>{
 mode='stale';const n=calls.filter(c=>c.options.method==='POST').length,a=await req(owner,'/desk/command',{on:false});assert.equal(a.status,202);assert.equal(a.data.confirmed,false);assert.equal(a.data.light.is_on,true);assert.equal(calls.filter(c=>c.options.method==='POST').length,n+1);mode='ok';
});
test('unsafe configuration, concurrency and durable rate limits prevent provider writes',async()=>{
 const old=config.base_url;config.base_url='http://127.0.0.1';assert.equal((await req(owner)).status,503);config.base_url=old;
 await db.query("INSERT INTO app_ha_commands(user_id,light_key,request_key,desired_on) VALUES($1,'desk',$2,false)",[owner.id,randomUUID()]);assert.equal((await req(owner,'/desk/command',{on:false})).status,409);
 await db.query("UPDATE app_ha_commands SET status='confirmed' WHERE user_id=$1",[owner.id]);for(let i=0;i<20;i++)await db.query("INSERT INTO app_ha_commands(user_id,light_key,request_key,desired_on,status) VALUES($1,'desk',$2,false,'confirmed')",[owner.id,randomUUID()]);const n=calls.length;assert.equal((await req(owner,'/desk/command',{on:false})).status,429);assert.equal(calls.length,n);
});
