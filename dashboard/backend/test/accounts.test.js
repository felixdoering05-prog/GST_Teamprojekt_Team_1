const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {createHash}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
let db,server,url;
before(async()=>{
 const postgres=new PGlite();await postgres.waitReady;
 db={query:(sql,params)=>postgres.query(sql,params),end:()=>postgres.close()};
 db.connect=async()=>({query:db.query,release(){}});
 await initAccounts(db);
 const app=express();app.use(express.json({limit:'16kb'}));app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function request(path,body,token){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{'X-D21-Session':token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
let alice,bob;
test('registration validates password and stores hash, not password or raw session',async()=>{
 assert.equal((await request('/auth/register',{name:'Alice',email:'a@example.test',password:'short'})).status,400);
 const result=await request('/auth/register',{name:' Alice ',email:'ALICE@example.test',password:'Test-Passphrase-123'});
 assert.equal(result.status,201);alice=result.body;assert.equal(alice.user.email,'alice@example.test');assert.equal(alice.user.name,'Alice');
 const stored=(await db.query('SELECT * FROM app_users')).rows[0];assert.notEqual(stored.password_hash,'Test-Passphrase-123');assert.equal(stored.password_hash.split(':')[1].length,128);
 const sessions=(await db.query('SELECT * FROM app_sessions')).rows;assert.notEqual(sessions[0].token_hash,alice.token);assert.equal(sessions[0].token_hash,createHash('sha256').update(alice.token).digest('hex'));
});
test('duplicate email, wrong password and unknown account rejected',async()=>{
 assert.equal((await request('/auth/register',{name:'Duplicate',email:'alice@example.test',password:'Test-Passphrase-123'})).status,409);
 assert.equal((await request('/auth/login',{email:'alice@example.test',password:'wrong'})).status,401);
 assert.equal((await request('/auth/login',{email:'absent@example.test',password:'wrong'})).status,401);
});
test('login and account restore succeed',async()=>{
 const r=await request('/auth/login',{email:'ALICE@example.test',password:'Test-Passphrase-123'});assert.equal(r.status,200);
 assert.equal((await request('/auth/me',null,r.body.token)).body.id,alice.user.id);
});
test('building routes require a valid session',async()=>{
 assert.equal((await request('/buildings')).status,401);
 assert.equal((await request('/buildings',null,'a'.repeat(64))).status,401);
});
test('buildings persist and are isolated between accounts',async()=>{
 bob=(await request('/auth/register',{name:'Bob',email:'bob@example.test',password:'Test-Passphrase-456'})).body;
 assert.equal((await request('/buildings',{name:'  Haus A  ',address:' Adresse '},alice.token)).status,201);
 const a=await request('/buildings',null,alice.token);assert.equal(a.body.length,1);assert.equal(a.body[0].name,'Haus A');
 assert.deepEqual((await request('/buildings',null,bob.token)).body,[]);
 assert.equal((await request('/buildings',{name:' '},bob.token)).status,400);
 await initAccounts(db);assert.equal((await request('/buildings',null,alice.token)).body.length,1);
});
test('expired sessions and logout revoke access',async()=>{
 await db.query('UPDATE app_sessions SET expires_at=$1 WHERE token_hash=$2',[new Date(0),createHash('sha256').update(bob.token).digest('hex')]);
 assert.equal((await request('/auth/me',null,bob.token)).status,401);
 assert.equal((await request('/auth/logout',{},alice.token)).status,200);
 assert.equal((await request('/buildings',null,alice.token)).status,401);
});
test('request throttling bounds repeated authentication work',async()=>{
 let blocked=false;
 for(let i=0;i<45;i++){const r=await request('/auth/login',{email:'none@example.test',password:'wrong'});if(r.status===429){blocked=true;break}}
 assert.equal(blocked,true);
});

test('building deletion requires owner session and confirmation; only target data cascades',async()=>{
 for(const user of [alice,bob])await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3) ON CONFLICT(token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at',[createHash('sha256').update(user.token).digest('hex'),user.user.id,new Date(Date.now()+86400000)]);
 const created=await request('/buildings',{name:'Delete fixture'},alice.token);
 const id=created.body.id;
 const retained=await request('/buildings',{name:'Keep fixture'},alice.token);
 await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'fixture.pdf','application/pdf',4,$2)",[id,Buffer.from('test')]);
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[id,bob.user.id]);
 await db.query("INSERT INTO app_notifications(user_id,kind,title,building_id) VALUES($1,'file','fixture',$2)",[bob.user.id,id]);
 await db.query("INSERT INTO app_ai_requests(user_id,building_id,request_key,question_hash,status,answer) VALUES($1,$2,'delete-fixture','hash','done','cached private answer')",[alice.user.id,id]);
 const remove=async(token,body={confirmation:'DELETE'})=>fetch(url+'/buildings/'+id,{method:'DELETE',headers:{'Content-Type':'application/json',...(token?{'X-D21-Session':token}:{})},body:JSON.stringify(body)});
 assert.equal((await remove(null)).status,401);
 assert.equal((await remove(bob.token)).status,404);
 assert.equal((await remove(alice.token,{})).status,400);
 assert.equal((await remove(alice.token,{confirmation:'DELETE',user_id:bob.user.id})).status,400);
 assert.equal((await remove(alice.token)).status,200);
 assert.equal((await db.query('SELECT id FROM app_documents WHERE building_id=$1',[id])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM app_building_members WHERE building_id=$1',[id])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM app_notifications WHERE building_id=$1',[id])).rows.length,0);
 assert.equal((await db.query('SELECT id FROM app_buildings WHERE id=$1',[retained.body.id])).rows.length,1);
 const usage=(await db.query("SELECT answer,building_id FROM app_ai_requests WHERE request_key='delete-fixture'")).rows[0];assert.equal(usage.answer,null);assert.equal(usage.building_id,null);
 assert.equal((await remove(alice.token)).status,404);
});
