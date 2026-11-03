const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {usageMiddleware}=require('../src/admin');
let db,server,url,admin,user,allow=new Set(),snapshot=JSON.stringify({version:1,collected_at:new Date().toISOString(),cpu_percent:23,memory:{total:100,used:50},ssh_access:[{user:'vincent',access:'SFTP',keys:[{fingerprint:'SHA256:public-fingerprint',label:'vincent-d21',type:'ED25519'}]}]});
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function create(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.invalid','NEVER-RETURN-PASSWORD-HASH'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);return u;}
 admin=await create('Felix');user=await create('Member');allow.add(admin.id);
 await db.query("INSERT INTO app_ai_requests(user_id,request_key,question_hash,status,model,error_code) VALUES($1,'one','hash','done','mock',NULL),($1,'two','hash','failed','mock',429)",[user.id]);
 const app=express();app.use(express.json());app.use(usageMiddleware(db));app.use('/api/v1',accountRouter(db,{admin:{adminIDs:allow,readSnapshot:async()=>{if(snapshot===null)throw Error('Missing');return snapshot;}}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function get(who,path){const r=await fetch(url+path,{headers:who?{'X-D21-Session':who.token}:{}});return {status:r.status,cache:r.headers.get('Cache-Control'),body:await r.json()};}
test('only explicitly allowed account IDs can see admin data; no default first-user admin',async()=>{
 assert.equal((await get(null,'/admin/overview')).status,401);assert.deepEqual((await get(user,'/admin/me')).body,{admin:false});
 for(const path of ['/admin/overview','/admin/users']){const r=await get(user,path);assert.equal(r.status,403);assert.equal(JSON.stringify(r.body).includes('example.invalid'),false);}
 assert.deepEqual((await get(admin,'/admin/me')).body,{admin:true});
});
test('overview shows real database aggregates and safe snapshots without keys or passwords',async()=>{
 const r=await get(admin,'/admin/overview');assert.equal(r.status,200);assert.equal(r.cache,'private, no-store');assert.equal(Number(r.body.counts.users),2);assert.equal(Number(r.body.ai.requests),2);assert.equal(Number(r.body.ai.limited),1);assert.equal(r.body.ai.limits.project_24h,100);assert.equal(r.body.host.cpu_percent,23);assert.equal(r.body.host_stale,false);
 assert.equal(JSON.stringify(r.body).includes('NEVER-RETURN-PASSWORD-HASH'),false);assert.equal(JSON.stringify(r.body).includes(user.token),false);
});
test('users are paginated and return email metadata, never session tokens or password hashes',async()=>{
 const r=await get(admin,'/admin/users?limit=1&offset=1');assert.equal(r.status,200);assert.equal(r.body.total,2);assert.equal(r.body.users.length,1);assert.equal(r.body.users[0].email,'Member@example.invalid');assert.equal(Number(r.body.users[0].ai_requests),2);
 for(const secret of ['password_hash','token_hash',user.token,'NEVER-RETURN-PASSWORD-HASH'])assert.equal(JSON.stringify(r.body).includes(secret),false);
 for(const query of ['limit=101','offset=-1','limit=abc'])assert.equal((await get(admin,'/admin/users?'+query)).status,400);
});
test('missing or stale host data are explicitly marked rather than invented',async()=>{
 const old=snapshot;snapshot=null;let r=await get(admin,'/admin/overview');assert.equal(r.body.host,null);assert.equal(r.body.host_stale,true);assert.ok(r.body.host_error);
 snapshot=JSON.stringify({version:1,collected_at:'2020-01-01T00:00:00Z'});r=await get(admin,'/admin/overview');assert.equal(r.body.host_stale,true);snapshot=old;
});
test('HTTP usage stores bounded categories only, without paths, IDs, email or content',async()=>{
 await get(user,'/buildings');await new Promise(resolve=>setTimeout(resolve,30));
 const rows=(await db.query('SELECT * FROM app_api_usage_hourly')).rows;assert.ok(rows.some(r=>r.category==='buildings'));
 const data=JSON.stringify(rows);assert.equal(data.includes('example.invalid'),false);assert.equal(data.includes('/admin/'),false);assert.equal(data.includes(user.token),false);
});
test('admin permission is rechecked for every request',async()=>{
 allow.delete(admin.id);assert.equal((await get(admin,'/admin/users')).status,403);allow.add(admin.id);
});
