const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto');
const {initIssues,issuesRouter}=require('../src/issues');
const {initCollaboration}=require('../src/collaboration');
let db,server,base;
const JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46,0x49,0x46,0,1]);
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};
 await pg.exec("CREATE TABLE app_users(id SERIAL PRIMARY KEY,name TEXT,email TEXT);CREATE TABLE app_buildings(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,name TEXT);INSERT INTO app_users(name) VALUES('Owner Person'),('Member Person'),('Outsider');INSERT INTO app_buildings(user_id,name) VALUES(1,'D21'),(3,'Other')");
 await pg.exec("CREATE TABLE app_documents(id SERIAL PRIMARY KEY,building_id INTEGER REFERENCES app_buildings(id) ON DELETE CASCADE,mime_type TEXT);INSERT INTO app_documents(building_id,mime_type) VALUES(1,'application/x-step'),(2,'application/x-step'),(1,'application/pdf')");
 await initCollaboration(db);await initIssues(db);await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES(1,2,'accepted')");
 const app=express();app.use(express.json({limit:'16kb'}));
 app.use(issuesRouter(db,(req,res,next)=>{const id=Number(req.get('X-Test-User'));if(![1,2,3].includes(id))return res.sendStatus(401);req.account={id};next();}));
 app.use((e,req,res,next)=>res.status(500).json({error:e.message}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/buildings/1/issues`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.end()});
async function call(user,{method='GET',suffix='',body,raw,type}={}){
 const headers={'X-Test-User':String(user)};let payload;
 if(raw){headers['Content-Type']=type||'image/jpeg';payload=raw;}else if(body){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
 const r=await fetch(base+suffix,{method,headers,body:payload});
 const ct=r.headers.get('content-type')||'';return {status:r.status,type:ct,data:r.status===401?null:ct.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};
}
const issue=(extra={})=>({title:'Riss in der Wand',description:'Neben der Tür',room:'Raum 1.12',request_key:randomUUID(),...extra});
test('only accepted members can list and report; outsiders see nothing',async()=>{
 assert.equal((await call(0)).status,401);assert.equal((await call(3)).status,404);
 assert.equal((await call(3,{method:'POST',body:issue()})).status,404);
 const r=await call(2,{method:'POST',body:issue()});assert.equal(r.status,201);assert.equal(r.data.status,'open');assert.equal(r.data.reporter,'Member');assert.equal(r.data.is_mine,true);
 const list=await call(1);assert.equal(list.status,200);assert.ok(list.data.some(x=>x.id===r.data.id&&x.can_edit&&!x.is_mine));
 const n=(await db.query("SELECT COUNT(*) n FROM app_notifications WHERE user_id=1 AND kind='issue'")).rows[0].n;assert.equal(Number(n),1);
});
test('retries with the same request key are idempotent',async()=>{
 const body=issue(),a=await call(2,{method:'POST',body}),b=await call(2,{method:'POST',body});
 assert.equal(a.status,201);assert.equal(b.status,200);assert.equal(a.data.id,b.data.id);
 assert.equal((await call(2,{method:'POST',body:{...body,title:'Anders'}})).status,409);
});
test('positions require an IFC model of the same building',async()=>{
 const ok=await call(1,{method:'POST',body:issue({document_id:1,space_id:42,point:{x:1.5,y:1.2,z:-3}})});
 assert.equal(ok.status,201);assert.deepEqual(ok.data.point,{x:1.5,y:1.2,z:-3});assert.equal(ok.data.space_id,42);
 assert.equal((await call(1,{method:'POST',body:issue({document_id:2})})).status,404,'foreign model');
 assert.equal((await call(1,{method:'POST',body:issue({document_id:3})})).status,404,'not an IFC');
 assert.equal((await call(1,{method:'POST',body:issue({point:{x:1,y:2,z:3}})})).status,400,'point without model');
 assert.equal((await call(1,{method:'POST',body:issue({document_id:1,point:{x:1,y:'2',z:3}})})).status,400);
 assert.equal((await call(1,{method:'POST',body:issue({document_id:1,point:{x:1,y:2,z:3,w:4}})})).status,400);
});
test('input is validated',async()=>{
 assert.equal((await call(1,{method:'POST',body:issue({title:'  '})})).status,400);
 assert.equal((await call(1,{method:'POST',body:issue({title:'x'.repeat(121)})})).status,400);
 assert.equal((await call(1,{method:'POST',body:issue({request_key:'nope'})})).status,400);
 assert.equal((await call(1,{method:'POST',body:issue({user_id:2})})).status,400,'unknown fields');
});
test('status changes are open to members with revision protection; text edits only for reporter or owner',async()=>{
 const own=(await call(1,{method:'POST',body:issue()})).data;
 let r=await call(2,{method:'PATCH',suffix:'/'+own.id,body:{status:'in_progress',revision:0}});assert.equal(r.status,200);assert.equal(r.data.status,'in_progress');
 assert.equal((await call(2,{method:'PATCH',suffix:'/'+own.id,body:{status:'done',revision:0}})).status,409);
 assert.equal((await call(2,{method:'PATCH',suffix:'/'+own.id,body:{title:'Neu',revision:1}})).status,403);
 assert.equal((await call(2,{method:'PATCH',suffix:'/'+own.id,body:{status:'kaputt',revision:1}})).status,400);
 r=await call(1,{method:'PATCH',suffix:'/'+own.id,body:{title:'Neu',status:'done',revision:1}});assert.equal(r.status,200);assert.equal(r.data.title,'Neu');
 assert.equal((await call(3,{method:'PATCH',suffix:'/'+own.id,body:{status:'open',revision:2}})).status,404);
});
test('photos: reporter or owner upload JPEG/PNG, members can view, wrong types and sizes are rejected',async()=>{
 const mine=(await call(2,{method:'POST',body:issue()})).data;
 assert.equal((await call(2,{method:'GET',suffix:`/${mine.id}/photo`})).status,404);
 assert.equal((await call(2,{method:'PUT',suffix:`/${mine.id}/photo`,raw:Buffer.from('<svg/>'),type:'image/png'})).status,415);
 assert.equal((await call(2,{method:'PUT',suffix:`/${mine.id}/photo`,raw:Buffer.concat([JPEG,Buffer.alloc(2*1024*1024)])})).status,413);
 const up=await call(2,{method:'PUT',suffix:`/${mine.id}/photo`,raw:JPEG});assert.equal(up.status,200);assert.equal(up.data.has_photo,true);
 const owner=(await call(1,{method:'POST',body:issue()})).data;
 assert.equal((await call(2,{method:'PUT',suffix:`/${owner.id}/photo`,raw:JPEG})).status,403,'member cannot change owner photo');
 const got=await call(1,{suffix:`/${mine.id}/photo`});assert.equal(got.status,200);assert.equal(got.type,'image/jpeg');assert.deepEqual(got.data,JPEG);
 assert.equal((await call(3,{suffix:`/${mine.id}/photo`})).status,404);
});
test('delete: reporter or owner only; issues disappear with the building',async()=>{
 const owner=(await call(1,{method:'POST',body:issue()})).data,member=(await call(2,{method:'POST',body:issue()})).data;
 assert.equal((await call(2,{method:'DELETE',suffix:'/'+owner.id})).status,403);
 assert.equal((await call(1,{method:'DELETE',suffix:'/'+member.id})).status,200);
 assert.equal((await call(2,{method:'DELETE',suffix:'/'+owner.id})).status,403);
 await db.query('DELETE FROM app_buildings WHERE id=1');
 assert.equal(Number((await db.query('SELECT COUNT(*) n FROM app_building_issues')).rows[0].n),0);
});
