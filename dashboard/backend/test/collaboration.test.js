const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
let db,server,url,alice,bob,eve,building,contact,file;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 const app=express();app.use(express.json({limit:'16kb'}));app.use('/api/v1',accountRouter(db));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
 async function user(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,`${name.split(' ')[0].toLowerCase()}@example.test`,'unused'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);return u;}
 alice=await user('Alice Beispiel');bob=await user('Bob Privat');eve=await user('Eve Unbeteiligt');building=(await request(alice,'/buildings','POST',{name:'D21'})).body;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function request(user,path,method='GET',body,headers={}){
 const bytes=Buffer.isBuffer(body);const r=await fetch(url+path,{method,headers:{...(user?{'X-D21-Session':user.token}:{}),'Content-Type':bytes?'application/octet-stream':'application/json',...headers},...(body?{body:bytes?body:JSON.stringify(body)}:{})});const type=r.headers.get('content-type')||'';return {status:r.status,body:type.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};
}
test('email lookup does not expose name/existence; recipient must accept',async()=>{
 assert.equal((await request(null,'/contacts')).status,401);
 assert.deepEqual(await request(alice,'/contacts','POST',{email:'unknown@example.test'}),await request(alice,'/contacts','POST',{email:'bob@example.test'}));
 assert.deepEqual((await request(alice,'/contacts')).body,[]);
 contact=(await request(bob,'/contacts')).body[0];assert.equal(contact.name,'Alice');
 for(const user of [alice,eve])assert.equal((await request(user,`/contacts/${contact.id}/accept`,'POST')).status,404);
 assert.equal((await request(bob,`/contacts/${contact.id}/accept`,'POST')).status,200);
 assert.equal((await request(alice,'/contacts')).body[0].name,'Bob');
});
test('owner invites confirmed contacts; invitation alone grants no access',async()=>{
 assert.equal((await request(alice,`/buildings/${building.id}/members`,'POST',{user_id:String(eve.id)})).status,400);
 assert.equal((await request(bob,`/buildings/${building.id}/members`,'POST',{user_id:String(eve.id)})).status,404);
 assert.equal((await request(alice,`/buildings/${building.id}/members`,'POST',{user_id:String(bob.id)})).status,200);
 for(const suffix of ['messages','documents'])assert.equal((await request(bob,`/buildings/${building.id}/${suffix}`)).status,404);
 assert.deepEqual((await request(bob,'/buildings')).body,[]);
 assert.equal((await request(bob,'/building-invitations')).body[0].name,'D21');
 assert.equal((await request(bob,`/buildings/${building.id}/invitation`,'POST',{action:'accept'})).status,200);
 assert.equal((await request(bob,'/buildings')).body[0].is_owner,false);
});
test('members share files and editing; uploads consume owner quota',async()=>{
 file=(await request(bob,`/buildings/${building.id}/documents`,'POST',Buffer.from('%PDF-1.4 synthetic'),{'X-File-Name':'Plan.pdf'})).body;assert.ok(file.id);
 assert.equal((await request(alice,`/documents/${file.id}`)).status,200);
 assert.equal((await request(eve,`/documents/${file.id}`)).status,404);
 assert.equal((await request(bob,`/documents/${file.id}`,'PATCH',{name:'Neu.pdf'})).status,200);
 await db.query('UPDATE app_documents SET size=$1 WHERE id=$2',[250*1024*1024,file.id]);
 assert.equal((await request(bob,`/buildings/${building.id}/documents`,'POST',Buffer.from('%PDF-quota'),{'X-File-Name':'Plan.pdf'})).status,413);
 await db.query('UPDATE app_documents SET size=20 WHERE id=$1',[file.id]);
 assert.equal((await request(bob,`/buildings/${building.id}`,'PATCH',{name:'D21 gemeinsam',address:'Campus'})).status,200);
});
test('chat is member-only, idempotent, paginated and notifies others only',async()=>{
 const path=`/buildings/${building.id}/messages`,key=randomUUID();
 assert.equal((await request(bob,path,'POST',{text:'Hallo Team'},{'X-Request-ID':key})).status,201);
 assert.equal((await request(bob,path,'POST',{text:'Hallo Team'},{'X-Request-ID':key})).status,200);
 assert.equal((await request(bob,path,'POST',{text:'Anderer Text'},{'X-Request-ID':key})).status,409);
 assert.equal((await request(eve,path)).status,404);
 const messages=(await request(alice,path)).body;assert.equal(messages.length,1);assert.equal(messages[0].name,'Bob');
 assert.equal((await request(alice,path+'?before='+messages[0].id)).body.length,0);
 assert.equal((await request(bob,'/notifications')).body.filter(x=>x.kind==='chat').length,0);
 const notices=(await request(alice,'/notifications')).body;const chat=notices.find(x=>x.kind==='chat');assert.ok(chat);assert.ok(notices.find(x=>x.kind==='file'));
 await request(eve,`/notifications/${chat.id}/read`,'POST');assert.equal((await request(alice,'/notifications')).body.find(x=>x.id===chat.id).read_at,null);
 await request(alice,`/notifications/${chat.id}/read`,'POST');assert.ok((await request(alice,'/notifications')).body.find(x=>x.id===chat.id).read_at);
});
test('notification failure rolls back message before returning an error',async()=>{
 const original=db.connect;
 db.connect=async()=>{const client=await original();return {release:client.release,query:(sql,params)=>{if(sql.includes('INSERT INTO app_notifications'))throw new Error('Injected notification failure');return client.query(sql,params)}}};
 try { assert.equal((await request(bob,`/buildings/${building.id}/messages`,'POST',{text:'Must roll back'},{'X-Request-ID':randomUUID()})).status,500); }
 finally {db.connect=original;}
 assert.equal((await request(alice,`/buildings/${building.id}/messages`)).body.length,1);
});
test('revocation is enforced and migrations preserve existing files',async()=>{
 assert.equal((await request(eve,`/buildings/${building.id}/members/${bob.id}`,'DELETE')).status,404);
 assert.equal((await request(alice,`/buildings/${building.id}/members/${bob.id}`,'DELETE')).status,200);
 for(const path of [`/documents/${file.id}`,`/buildings/${building.id}/messages`,`/buildings/${building.id}/members`])assert.equal((await request(bob,path)).status,404);
 assert.equal((await request(bob,`/documents/${file.id}`,'DELETE')).status,404);
 assert.equal((await request(bob,`/buildings/${building.id}`,'PATCH',{name:'Verboten'})).status,404);
 await initAccounts(db);assert.equal((await request(alice,`/documents/${file.id}`)).status,200);
});
