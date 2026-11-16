const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {accountLimits,reached,CATALOG}=require('../src/account-limits');
let db,server,url,admin,user,other;const allow=new Set();
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function create(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.invalid','hash'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);return u;}
 admin=await create('Admin');user=await create('Member');other=await create('Other');allow.add(admin.id);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db,{admin:{adminIDs:allow,readSnapshot:async()=>'{}'}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function call(who,method,path,body){const r=await fetch(url+path,{method,headers:{'X-D21-Session':who.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}

test('defaults apply when nothing is configured',async()=>{
 const lim=await accountLimits(db,user.id);assert.equal(lim.unlimited,false);
 for(const item of CATALOG)assert.equal(lim.values[item.key],item.default);
 assert.equal(reached(lim,'plan_day',2),false);assert.equal(reached(lim,'plan_day',3),true);assert.equal(lim.projectExempt('plan'),false);
});
test('only admins can read or change limits, including their own',async()=>{
 assert.equal((await call(user,'GET',`/admin/users/${user.id}/limits`)).status,403);
 assert.equal((await call(user,'PUT',`/admin/users/${user.id}/limits`,{unlimited:true})).status,403);
 assert.equal((await accountLimits(db,user.id)).unlimited,false);
});
test('admin sets a person to unlimited and every account limit and project budget is lifted',async()=>{
 const r=await call(admin,'PUT',`/admin/users/${user.id}/limits`,{unlimited:true,limits:{},revision:0});assert.equal(r.status,200);
 assert.equal(r.body.unlimited,true);assert.ok(r.body.limits.every(x=>x.effective===null));
 const lim=await accountLimits(db,user.id);assert.equal(reached(lim,'storage_mb',1e9),false);assert.equal(lim.projectExempt('plan'),true);assert.equal(lim.projectExempt(),true);
 assert.equal((await accountLimits(db,other.id)).unlimited,false);
 const list=await call(admin,'GET','/admin/users?limit=10');assert.equal(list.body.users.find(u=>u.id===user.id).limits_unlimited,true);
});
test('individual overrides, null means unlimited for one limit only; revision protects concurrent edits',async()=>{
 const current=(await call(admin,'GET',`/admin/users/${other.id}/limits`)).body;assert.equal(current.revision,0);
 const r=await call(admin,'PUT',`/admin/users/${other.id}/limits`,{unlimited:false,limits:{plan_day:10,storage_mb:null},revision:0});assert.equal(r.status,200);
 const lim=await accountLimits(db,other.id);assert.equal(lim.values.plan_day,10);assert.equal(lim.values.storage_mb,null);assert.equal(lim.values.scan_day,20);assert.equal(lim.projectExempt('plan'),false);
 assert.equal(r.body.limits.find(x=>x.key==='plan_day').overridden,true);assert.equal(r.body.limits.find(x=>x.key==='scan_day').overridden,false);
 assert.equal((await call(admin,'PUT',`/admin/users/${other.id}/limits`,{unlimited:false,limits:{},revision:0})).status,409);
 assert.equal((await call(admin,'PUT',`/admin/users/${other.id}/limits`,{unlimited:false,limits:{},revision:1})).status,200);
 assert.equal((await accountLimits(db,other.id)).values.plan_day,3);
});
test('invalid input and unknown accounts are rejected',async()=>{
 for(const body of [{},{unlimited:'yes'},{unlimited:false,limits:{unknown:1}},{unlimited:false,limits:{plan_day:-1}},{unlimited:false,limits:{plan_day:1.5}},{unlimited:false,limits:{plan_day:2000000}},{unlimited:false,extra:1},{unlimited:false,limits:[]}])
  assert.equal((await call(admin,'PUT',`/admin/users/${user.id}/limits`,body)).status,400,JSON.stringify(body));
 assert.equal((await call(admin,'PUT','/admin/users/99999/limits',{unlimited:true})).status,404);
 assert.equal((await call(admin,'GET','/admin/users/abc/limits')).status,400);
});
test('environment exemptions keep working',async()=>{
 const fresh=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES('Env','env@example.invalid','x') RETURNING id")).rows[0].id;
 process.env.AI_CONVERSATION_UNLIMITED_USER_IDS=String(fresh);process.env.PLAN_DAILY_QUOTA_EXEMPT_USER_IDS=String(fresh);
 try{const lim=await accountLimits(db,fresh);assert.equal(lim.values.assistant_day,null);assert.equal(lim.values.live_day,null);assert.equal(lim.values.plan_day,null);assert.equal(lim.values.plan_open,3);assert.equal(lim.projectExempt('conversation'),true);assert.equal(lim.projectExempt('plan'),false);}
 finally{delete process.env.AI_CONVERSATION_UNLIMITED_USER_IDS;delete process.env.PLAN_DAILY_QUOTA_EXEMPT_USER_IDS;}
});
test('routes enforce the configured value (contact requests)',async()=>{
 const rev=(await call(admin,'GET',`/admin/users/${other.id}/limits`)).body.revision;
 assert.equal((await call(admin,'PUT',`/admin/users/${other.id}/limits`,{unlimited:false,limits:{contact_hour:1},revision:rev})).status,200);
 assert.equal((await call(other,'POST','/contacts',{email:'nobody1@example.invalid'})).status<300,true);
 assert.equal((await call(other,'POST','/contacts',{email:'nobody2@example.invalid'})).status,429);
 assert.equal((await call(admin,'PUT',`/admin/users/${other.id}/limits`,{unlimited:true,limits:{contact_hour:1}})).status,200);
 assert.equal((await call(other,'POST','/contacts',{email:'nobody3@example.invalid'})).status<300,true);
});
test('limits disappear with the account',async()=>{
 await db.query('DELETE FROM app_users WHERE id=$1',[user.id]);assert.equal((await db.query('SELECT 1 FROM app_user_limits WHERE user_id=$1',[user.id])).rows.length,0);
});
