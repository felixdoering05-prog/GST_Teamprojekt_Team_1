const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {validateScan}=require('../src/room-scan');
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,1.25,0,1];
const scan=(extra={})=>({version:1,building_name:'Testhaus',storey:'EG',walls:[{transform:I,size:[4,2.5,0]}],doors:[{transform:I,size:[0.9,2,0]}],windows:[],openings:[],objects:[{transform:I,size:[1,1,1],category:'bed'}],floors:[{corners:[[0,0,0],[4,0,0],[4,0,3]],label:'bedroom',name:'Schlafzimmer'}],...extra});
let pg,db,server,base,owner,member,outsider,building;
before(async()=>{
 pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};await initAccounts(db);
 async function user(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.test','unused'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);return u;}
 owner=await user('ScanOwner');member=await user('ScanMember');outsider=await user('ScanOutsider');
 building=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Scanhaus') RETURNING id",[owner.id])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.id]);
 const app=express();
 // Same body parsing as server.js: small JSON globally, raw scan bytes pass through.
 app.use(express.json({limit:'16kb'}));app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api/v1/buildings/${building.id}/room-scans`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await pg?.close();});
async function api(path='',{user=owner,method,body,raw,key}={}){
 const headers={...(user?{'X-D21-Session':user.token}:{})};
 if(raw!==undefined){headers['Content-Type']='application/octet-stream';if(key)headers['X-Request-ID']=key;}
 else if(body)headers['Content-Type']='application/json';
 const r=await fetch(base+path,{method:method||(raw!==undefined||body?'POST':'GET'),headers,body:raw!==undefined?raw:body?JSON.stringify(body):undefined});
 const type=r.headers.get('content-type')||'';return {status:r.status,body:type.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};
}
const upload=(data=scan(),opts={})=>api('',{raw:Buffer.from(JSON.stringify(data)),key:randomUUID(),...opts});
const finish=async id=>db.query("UPDATE app_room_scan_jobs SET status='ready',payload=NULL,output_ifc=$2,summary=$3 WHERE id=$1",[id,Buffer.from("ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;ENDSEC;END-ISO-10303-21;\n"),JSON.stringify({storey:'EG',rooms:[{name:'Schlafzimmer',type:'Schlafzimmer',area_m2:6}],counts:{rooms:1}})]);
test('validation keeps only the RoomPlan fields and rejects bad geometry',()=>{
 assert.deepEqual(Object.keys(validateScan(scan())).sort(),['building_name','doors','floors','objects','openings','storey','version','walls','windows']);
 for(const bad of [{version:2},{walls:[]},{walls:[{transform:I.slice(1),size:[1,1,1]}]},{walls:[{transform:I,size:[1,1,1e9]}]},{objects:[{transform:I,size:[1,1,1],category:'rm -rf'}]},{floors:[{corners:[[0,0,0]],label:null,name:null}]},{floors:[{corners:[[0,0,0],[1,0,0],[1,0,1]],label:'garage',name:null}]},{command:'x'},{storey:'EG\nX'}])
  assert.throws(()=>validateScan(scan(bad)),{status:400},JSON.stringify(bad));
 assert.throws(()=>validateScan(scan({walls:[{transform:[...I.slice(0,15),NaN],size:[1,1,1]}]})));
});
test('upload needs login and building access; retries are idempotent',async()=>{
 assert.equal((await upload(scan(),{user:null})).status,401);
 assert.equal((await upload(scan(),{user:outsider})).status,404);
 assert.equal((await api('',{raw:Buffer.from('{}')})).status,400);// missing request id
 assert.equal((await upload({...scan(),version:3})).status,400);
 assert.equal((await api('',{raw:Buffer.from('not json'),key:randomUUID()})).status,400);
 const key=randomUUID(),a=await upload(scan(),{key}),b=await upload(scan(),{key});
 assert.equal(a.status,202);assert.equal(a.body.status,'queued');assert.equal(b.body.id,a.body.id);
 const stored=(await db.query('SELECT payload FROM app_room_scan_jobs WHERE id=$1',[a.body.id])).rows[0].payload;assert.equal(stored.floors[0].label,'bedroom');
 // Members can scan for the shared building but only see their own jobs.
 const m=await upload(scan(),{user:member});assert.equal(m.status,202);
 assert.equal((await api('/'+a.body.id,{user:member})).status,404);
 assert.equal((await api('',{user:member})).body.jobs.length,1);
 assert.equal((await api('/'+a.body.id,{user:outsider})).status,404);
 await db.query('DELETE FROM app_room_scan_jobs');
});
test('large scans are accepted as raw bytes up to 4 MB',async()=>{
 const walls=Array.from({length:600},()=>({transform:I.map(v=>v+0.123456789),size:[4.123456789,2.5,0.1]}));
 const big=await upload(scan({walls}));assert.equal(big.status,202);
 assert.equal((await api('',{raw:Buffer.alloc(5*1024*1024,32),key:randomUUID()})).status,413);
 await db.query('DELETE FROM app_room_scan_jobs');
});
test('review: approve adds an IFC document once, reject discards',async()=>{
 const job=(await upload()).body;
 assert.equal((await api('/'+job.id+'/approve',{body:{}})).status,409);
 await finish(job.id);
 const status=(await api('/'+job.id)).body;assert.equal(status.status,'ready');assert.equal(status.summary.rooms[0].name,'Schlafzimmer');assert.equal(status.payload,undefined);
 const draft=await api('/'+job.id+'/ifc');assert.equal(draft.status,200);assert.match(draft.body.toString(),/^ISO-10303-21/);
 assert.equal((await api('/'+job.id+'/approve',{body:{},user:member})).status,404);
 const approved=await api('/'+job.id+'/approve',{body:{}});assert.equal(approved.status,200);
 const again=await api('/'+job.id+'/approve',{body:{}});assert.equal(again.body.document_id,approved.body.document_id);
 const doc=(await db.query('SELECT name,mime_type,building_id FROM app_documents WHERE id=$1',[approved.body.document_id])).rows[0];
 assert.equal(doc.mime_type,'application/x-step');assert.equal(doc.building_id,building.id);assert.match(doc.name,/^Raumscan EG \d{4}-\d{2}-\d{2}\.ifc$/);
 assert.equal((await db.query('SELECT output_ifc FROM app_room_scan_jobs WHERE id=$1',[job.id])).rows[0].output_ifc,null);
 assert.equal((await api('/'+job.id+'/reject',{body:{}})).status,409);
 const other=(await upload()).body;await finish(other.id);
 assert.equal((await api('/'+other.id+'/reject',{body:{}})).status,200);
 assert.equal((await api('/'+other.id)).body.status,'rejected');assert.equal((await api('/'+other.id+'/ifc')).status,404);
 assert.equal((await api('/not-a-uuid')).status,400);
 await db.query('DELETE FROM app_room_scan_jobs');
});
test('open jobs and daily volume are bounded per account',async()=>{
 for(let i=0;i<3;i++)assert.equal((await upload()).status,202);
 assert.equal((await upload()).status,429);
 await db.query("UPDATE app_room_scan_jobs SET status='rejected'");
 await db.query("INSERT INTO app_room_scan_jobs(building_id,user_id,request_key,status) SELECT $1,$2,'old-'||n,'rejected' FROM generate_series(1,17) n",[building.id,owner.id]);
 assert.equal((await upload()).status,429);
 assert.equal((await upload(scan(),{user:member})).status,202);
});
test('deleting the building removes its scan jobs',async()=>{
 const b=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Temp') RETURNING id",[owner.id])).rows[0];
 await db.query("INSERT INTO app_room_scan_jobs(building_id,user_id,request_key,status) VALUES($1,$2,'x','queued')",[b.id,owner.id]);
 await db.query('DELETE FROM app_buildings WHERE id=$1',[b.id]);
 assert.equal((await db.query('SELECT count(*)::int n FROM app_room_scan_jobs WHERE building_id=$1',[b.id])).rows[0].n,0);
});
