const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
const {MAX_FILE}=require('../src/documents');
let db,server,url,alice,bob,building,other,files=[];
before(async()=>{
 const postgres=new PGlite();await postgres.waitReady;
 db={query:(sql,params)=>postgres.query(sql,params),end:()=>postgres.close()};
 db.connect=async()=>({query:db.query,release(){}});
 await initAccounts(db);
 const app=express();app.use(express.json({limit:'16kb'}));app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
 alice=(await request('/auth/register',{name:'Alice',email:'alice@example.test',password:'Test-Passphrase-123'})).body;
 bob=(await request('/auth/register',{name:'Bob',email:'bob@example.test',password:'Test-Passphrase-456'})).body;
 building=(await request('/buildings',{name:'Testgebäude'},alice.token)).body;
 other=(await request('/buildings',{name:'Anderes Gebäude'},bob.token)).body;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function request(path,body,token){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{'X-D21-Session':token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
async function upload(name,data,token=alice.token,id=building.id,key){const r=await fetch(`${url}/buildings/${id}/documents`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(name),...(key?{'X-Upload-ID':key}:{}),...(token?{'X-D21-Session':token}:{})},body:data});return {status:r.status,body:await r.json()};}
test('uploads require account and building ownership',async()=>{
 assert.equal((await upload('plan.pdf',Buffer.from('%PDF-test'),'')).status,401);
 assert.equal((await upload('plan.pdf',Buffer.from('%PDF-test'),bob.token)).status,404);
 assert.equal((await request(`/buildings/${building.id}/documents`,null,bob.token)).status,404);
});
test('PDF, image and DWG bytes are stored and downloaded unchanged',async()=>{
 const samples=[['Plan.pdf',Buffer.from('%PDF-1.4\n% synthetic test\n%%EOF'),'application/pdf'],['Bild.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=','base64'),'image/png'],['Grundriss.dwg',Buffer.from('AC1032\0synthetic-dwg-header-test'),'application/acad']];
 for(const [name,bytes,mime] of samples){
  const result=await upload(name,bytes);assert.equal(result.status,201,JSON.stringify(result.body));files.push(result.body);
  const response=await fetch(url+'/documents/'+result.body.id,{headers:{'X-D21-Session':alice.token}});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  if(mime==='application/acad')assert.ok(response.headers.get('content-disposition').startsWith('attachment'));
 }
 const listed=await request(`/buildings/${building.id}/documents`,null,alice.token);assert.equal(listed.body.length,3);assert.equal(listed.body[0].name,'Grundriss.dwg');assert.equal(listed.body[0].content,undefined);
 await initAccounts(db);assert.equal((await request(`/buildings/${building.id}/documents`,null,alice.token)).body.length,3);
});
test('other accounts cannot read file bytes or discover metadata',async()=>{
 assert.equal((await request('/documents/'+files[0].id,null,bob.token)).status,404);
 assert.equal((await request('/documents/'+files[0].id)).status,401);
 assert.deepEqual((await request(`/buildings/${other.id}/documents`,null,bob.token)).body,[]);
});
test('invalid files, mismatching extensions and empty data rejected',async()=>{
 assert.equal((await upload('fake.png',Buffer.from('not an image'))).status,415);
 assert.equal((await upload('file.exe',Buffer.from('%PDF-1.4'))).status,415);
 assert.equal((await upload('fake.dwg',Buffer.from('%PDF-1.4'))).status,415);
 assert.equal((await upload('empty.pdf',Buffer.alloc(0))).status,400);
 assert.equal((await upload('a'.repeat(201)+'.pdf',Buffer.from('%PDF-1.4'))).status,400);
 assert.equal((await upload('plan.pdf',Buffer.from('%PDF-1.4'),alice.token,'invalid')).status,400);
});
test('file size and per-account quota enforced',async()=>{
 assert.equal((await upload('large.pdf',Buffer.alloc(MAX_FILE+1,65))).status,413);
 await db.query('UPDATE app_documents SET size=$1 WHERE id=$2',[250*1024*1024,files[0].id]);
 assert.equal((await upload('quota.pdf',Buffer.from('%PDF-1.4'))).status,413);
 await db.query('UPDATE app_documents SET size=$1 WHERE id=$2',[files[0].size,files[0].id]);
});
test('filenames sanitized and Unicode names round-trip',async()=>{
 const result=await upload('../Pläne\n.pdf',Buffer.from('%PDF-1.4'));assert.equal(result.status,201);assert.equal(result.body.name,'.._Pläne_.pdf');
 const response=await fetch(url+'/documents/'+result.body.id,{headers:{'X-D21-Session':alice.token}});assert.ok(response.headers.get('content-disposition').includes('%C3%A4'));
});
async function mutateDocument(id,method,body,token=alice.token){
 const response=await fetch(`${url}/documents/${id}`,{method,headers:{'Content-Type':'application/json',...(token?{'X-D21-Session':token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};
}
test('renaming and deleting enforce ownership and preserve bytes/extension',async()=>{
 const created=await upload('rename.pdf',Buffer.from('%PDF-1.4\nrename sample'));
 const id=created.body.id;
 assert.equal((await mutateDocument(id,'PATCH',{name:'fremd.pdf'},bob.token)).status,404);
 assert.equal((await mutateDocument(id,'DELETE',null,bob.token)).status,404);
 assert.equal((await mutateDocument(id,'PATCH',{name:'test.pdf'},'')).status,401);
 for(const name of ['../plan.pdf','Bad\n.pdf','file.png','', 'x'.repeat(201)+'.pdf'])assert.equal((await mutateDocument(id,'PATCH',{name})).status,400);
 const renamed=await mutateDocument(id,'PATCH',{name:'Grundriss geändert.PDF'});assert.equal(renamed.status,200);assert.equal(renamed.body.name,'Grundriss geändert.PDF');
 const bytes=await fetch(`${url}/documents/${id}`,{headers:{'X-D21-Session':alice.token}});assert.equal(await bytes.text(),'%PDF-1.4\nrename sample');
 assert.equal((await mutateDocument(id,'DELETE')).status,200);
 assert.equal((await request(`/documents/${id}`,null,alice.token)).status,404);
 assert.equal((await mutateDocument(id,'DELETE')).status,404);
});
test('retrying an upload returns the same file without consuming quota twice',async()=>{
 const {randomUUID}=require('node:crypto');const key=randomUUID(),bytes=Buffer.from('%PDF-1.4\nretry');
 const first=await upload('retry.pdf',bytes,alice.token,building.id,key);assert.equal(first.status,201);
 await mutateDocument(first.body.id,'PATCH',{name:'Neuer Name.pdf'});
 const retried=await upload('retry.pdf',bytes,alice.token,building.id,key);assert.equal(retried.status,200);assert.equal(retried.body.id,first.body.id);assert.equal(retried.body.name,'Neuer Name.pdf');assert.equal(retried.body.content,undefined);assert.equal(retried.body.upload_key,undefined);
 assert.equal((await upload('retry.pdf',Buffer.from('%PDF-other'),alice.token,building.id,key)).status,409);
 assert.equal((await upload('retry.pdf',bytes,alice.token,building.id,'bad-key')).status,400);
 await db.query('UPDATE app_documents SET size=$1 WHERE id=$2',[250*1024*1024,first.body.id]);
 assert.equal((await upload('retry.pdf',bytes,alice.token,building.id,key)).status,200);
 await db.query('UPDATE app_documents SET size=$1 WHERE id=$2',[bytes.length,first.body.id]);
 await initAccounts(db);assert.equal((await upload('retry.pdf',bytes,alice.token,building.id,key)).body.id,first.body.id);
 const separate=await upload('retry.pdf',bytes,bob.token,other.id,key);assert.equal(separate.status,201);assert.notEqual(separate.body.id,first.body.id);
});
test('resuming a building draft creates one building per account and request ID',async()=>{
 const {randomUUID}=require('node:crypto');const key=randomUUID();
 const create=async(token,id)=>{const r=await fetch(url+'/buildings',{method:'POST',headers:{'Content-Type':'application/json','X-D21-Session':token,'X-Request-ID':id},body:JSON.stringify({name:'Entwurf',address:'Darmstadt'})});return {status:r.status,body:await r.json()};};
 const first=await create(alice.token,key);assert.equal(first.status,201);
 const retry=await create(alice.token,key);assert.equal(retry.status,200);assert.equal(retry.body.id,first.body.id);
 assert.notEqual((await create(bob.token,key)).body.id,first.body.id);
 assert.equal((await create(alice.token,'bad')).status,400);
});
