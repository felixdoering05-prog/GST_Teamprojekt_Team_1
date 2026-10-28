const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
const {deliverResetMail}=require('../src/password-reset');
const {resetMailConfiguration}=require('../src/reset-mail');
let db,server,url,alice,bob,now=new Date('2026-10-28T12:00:00Z');
const sent=[],mailer={enabled:true,secret:'ab'.repeat(32),send:async message=>{sent.push(message)}};
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,a)=>pg.query(s,a),connect:async()=>({query:(s,a)=>pg.query(s,a),release(){}}),end:()=>pg.close()};
 await initAccounts(db);const app=express();app.use(express.json({limit:'16kb'}));app.use('/api/v1',accountRouter(db,{mailer,now:()=>now}));app.use('/disabled',accountRouter(db,{mailer:{enabled:false}}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}`;
 alice=(await call('/auth/register',{name:'Alice',email:'reset-alice@example.test',password:'Old-password-123'})).data;
 bob=(await call('/auth/register',{name:'Bob',email:'reset-bob@example.test',password:'Other-password-123'})).data;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function call(path,body,token,prefix='/api/v1'){const r=await fetch(url+prefix+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'X-D21-Session':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
const request=email=>call('/auth/password-reset/request',{email});
const confirm=(email,code,password='New-password-456')=>call('/auth/password-reset/confirm',{email,code,password});
test('SMTP configuration defaults to disabled and requires secure complete settings',()=>{
 assert.equal(resetMailConfiguration({}).enabled,false);
 const env={SMTP_ENABLED:'true',SMTP_HOST:'smtp.example.test',SMTP_PORT:'465',SMTP_USER:'u',SMTP_PASSWORD:'p',MAIL_FROM:'d21@example.test',PASSWORD_RESET_SECRET:'ab'.repeat(32)};
 assert.equal(resetMailConfiguration(env).enabled,true);assert.equal(resetMailConfiguration({...env,SMTP_PORT:'25'}).enabled,false);
});
test('disabled mail never pretends a mail was sent',async()=>{
 assert.deepEqual((await call('/auth/password-reset/status',undefined,undefined,'/disabled')).data,{enabled:false});
 assert.equal((await call('/auth/password-reset/request',{email:'reset-alice@example.test'},undefined,'/disabled')).status,503);
});
test('generic requests persist encrypted mail, clear payload after sending and enforce cooldown',async()=>{
 const a=await request('RESET-ALICE@example.test'),b=await request('absent@example.test');assert.equal(a.status,202);assert.deepEqual(a,b);
 const row=(await db.query('SELECT * FROM app_password_resets WHERE user_id=$1',[alice.user.id])).rows[0];assert.equal(row.code_hash.length,64);assert.ok(row.encrypted_code);assert.equal(sent.length,0);
 await deliverResetMail(db,mailer,now);assert.equal(sent.length,1);assert.match(sent[0].code,/^\d{8}$/);assert.notEqual(row.code_hash,sent[0].code);assert.ok(!row.encrypted_code.includes(sent[0].code));
 assert.equal((await db.query('SELECT encrypted_code FROM app_password_resets WHERE user_id=$1',[alice.user.id])).rows[0].encrypted_code,null);
 await request('reset-alice@example.test');await deliverResetMail(db,mailer,now);assert.equal(sent.length,1);
});
test('code is account-bound and single-use; reset revokes sessions and the old password',async()=>{
 const code=sent[0].code;assert.equal((await confirm('reset-bob@example.test',code)).status,400);assert.equal((await confirm('reset-alice@example.test',code,'short')).status,400);
 const login=(await call('/auth/login',{email:'reset-alice@example.test',password:'Old-password-123'})).data;
 assert.equal((await confirm('reset-alice@example.test',code)).status,200);
 assert.equal((await call('/auth/me',undefined,alice.token)).status,401);assert.equal((await call('/auth/me',undefined,login.token)).status,401);assert.equal((await call('/auth/me',undefined,bob.token)).status,200);
 assert.equal((await call('/auth/login',{email:'reset-alice@example.test',password:'Old-password-123'})).status,401);assert.equal((await call('/auth/login',{email:'reset-alice@example.test',password:'New-password-456'})).status,200);assert.equal((await confirm('reset-alice@example.test',code)).status,400);
});
test('five wrong guesses lock the code; expired codes fail',async()=>{
 now=new Date(now.getTime()+61000);await request('reset-bob@example.test');await deliverResetMail(db,mailer,now);
 const code=sent.at(-1).code,wrong=code==='00000000'?'11111111':'00000000';for(let i=0;i<5;i++)assert.equal((await confirm('reset-bob@example.test',wrong)).status,400);assert.equal((await confirm('reset-bob@example.test',code)).status,400);
 now=new Date(now.getTime()+61000);await request('reset-bob@example.test');await deliverResetMail(db,mailer,now);const fresh=sent.at(-1).code;now=new Date(now.getTime()+16*60000);assert.equal((await confirm('reset-bob@example.test',fresh)).status,400);
});
test('three requests per hour; failed mail retries the durable queue',async()=>{
 await request('reset-bob@example.test');let failures=0;const failing={...mailer,send:async()=>{failures++;throw Object.assign(new Error('test failure'),{code:'ETEST'})}};
 await deliverResetMail(db,failing,now);assert.equal(failures,1);assert.equal(await deliverResetMail(db,mailer,now),false);
 now=new Date(now.getTime()+61000);await deliverResetMail(db,mailer,now);const row=(await db.query('SELECT * FROM app_password_resets WHERE user_id=$1',[bob.user.id])).rows[0];assert.equal(row.request_count,3);assert.equal(row.delivery_attempts,2);
 const count=sent.length;await request('reset-bob@example.test');await deliverResetMail(db,mailer,now);assert.equal(sent.length,count);
});
