const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
let db,server,url,owner,member,outsider,building,other,mode='ok',calls=[];
const privateContent='PRIVATE-PDF-CONTENT-NEVER-SEND';
const mockKey='test-key-not-a-real-gemini-key';
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.test','unused'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);await db.query("INSERT INTO app_ai_preferences(user_id,enabled,policy_version,revision) VALUES($1,true,1,1)",[u.id]);return u;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');
 building=(await db.query('INSERT INTO app_buildings(user_id,name,address) VALUES($1,$2,$3) RETURNING id',[owner.id,'D21 Test','Testcampus'])).rows[0];
 other=(await db.query('INSERT INTO app_buildings(user_id,name) VALUES($1,$2) RETURNING id',[outsider.id,'Secret foreign building'])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.id]);
 await db.query('INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,$2,$3,$4,$5)',[building.id,'Plan.pdf','application/pdf',privateContent.length,Buffer.from(privateContent)]);
 const mockFetch=async(url,options)=>{
  calls.push({url,options});
  if(mode==='quota')return {ok:false,status:429};
  if(mode==='secret-error')throw new Error('Never expose '+mockKey);
  if(mode==='revoke')await db.query('DELETE FROM app_building_members WHERE building_id=$1 AND user_id=$2',[building.id,member.id]);
  return {ok:true,json:async()=>({candidates:[{finishReason:mode==='truncated'?'MAX_TOKENS':'STOP',content:{parts:[{thought:true,text:'INTERNAL-THOUGHT'},{text:mode==='command'?JSON.stringify({action:'color',target:'walls',color:'#2563eb',summary:'Wände blau einfärben'}):mode==='command-invalid'?JSON.stringify({action:'delete',target:'walls',color:null,summary:'Löschen'}):mode==='command-unsupported'?JSON.stringify({action:'unsupported',target:'none',color:null,summary:'Noch nicht unterstützt'}):'Es ist eine PDF-Datei hinterlegt. Raumdaten fehlen.'}]}}]})};
 };
 const app=express();app.use(express.json({limit:'16kb'}));app.use('/api/v1',accountRouter(db,{assistant:{enabled:true,getKey:()=>{if(mode==='missing-key')throw new Error('No file');return mockKey;},fetch:mockFetch}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function request(user,path,body,key){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'X-D21-Session':user.token}:{}),...(key?{'X-Request-ID':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
const path=()=>`/buildings/${building.id}/assistant`;
async function question(user=owner,overrides={},key=randomUUID()){
 const info=await request(user,path());
 return request(user,path(),{question:'Welche Unterlagen gibt es?',consent:'yes',context_hash:info.body.context_hash,...overrides},key);
}
test('status is authenticated and building-scoped without calling Google',async()=>{
 assert.equal((await request(null,path())).status,401);
 assert.equal((await request(outsider,path())).status,404);
 const info=await request(owner,path());assert.equal(info.body.enabled,true);assert.equal(info.body.context.files.count,1);assert.equal(calls.length,0);
 assert.equal(JSON.stringify(info.body).includes(privateContent),false);assert.equal(JSON.stringify(info.body).includes(mockKey),false);
});
test('consent, valid request ID, bounded question and reviewed snapshot required',async()=>{
 for(const overrides of [{consent:'no'},{question:''},{question:'x'.repeat(2001)}])assert.equal((await question(owner,overrides)).status,400);
 assert.equal((await question(owner,{},'invalid')).status,400);
 assert.equal((await question(owner,{context_hash:'stale'})).status,409);
 assert.equal(calls.length,0);
});
test('member can ask; payload includes only reviewed metadata, answer hides thoughts and key',async()=>{
 const result=await question(member,{context:{name:'Injected foreign data'}});assert.equal(result.status,200);
 assert.equal(result.body.answer.includes('INTERNAL-THOUGHT'),false);assert.equal(result.body.answer.includes(mockKey),false);
 const sent=calls.at(-1);assert.ok(sent.url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:'));
 const payload=sent.options.body;
 assert.ok(payload.includes('Plan.pdf'));assert.ok(payload.includes('Testcampus'));
 for(const secret of [privateContent,'Secret foreign building','Injected foreign data',mockKey,'@example.test'])assert.equal(payload.includes(secret),false);
 assert.equal(sent.options.redirect,'error');assert.equal(sent.options.headers['x-goog-api-key'],mockKey);
});
test('same UUID replays cached answer, changing question conflicts and consumes no extra call',async()=>{
 const key=randomUUID(),before=calls.length;
 assert.equal((await question(owner,{},key)).status,200);
 const replay=await question(owner,{},key);assert.equal(replay.body.cached,true);assert.equal(calls.length,before+1);
 assert.equal((await question(owner,{question:'Different question'},key)).status,409);assert.equal(calls.length,before+1);
});
test('provider quota, partial answers and errors are safe; failure is not silently retried',async()=>{
 mode='quota';const key=randomUUID();assert.equal((await question(owner,{},key)).status,429);const before=calls.length;assert.equal((await question(owner,{},key)).status,429);assert.equal(calls.length,before);
 mode='truncated';assert.equal((await question()).status,502);
 await db.query("UPDATE app_ai_requests SET created_at=now()-interval '2 hours'");
 mode='secret-error';const failed=await question();assert.equal(failed.status,503);assert.equal(JSON.stringify(failed).includes(mockKey),false);mode='ok';
 // Move prior requests outside the per-minute window; keep daily accounting intact.
 await db.query("UPDATE app_ai_requests SET created_at=now()-interval '2 hours'");
});
test('revocation during generation prevents returning or caching the answer',async()=>{
 mode='revoke';const result=await question(member);assert.equal(result.status,404);mode='ok';
 assert.equal((await question(member)).status,404);
});
test('missing configuration and two busy slots fail safely without provider calls',async()=>{
 mode='missing-key';const before=calls.length;
 assert.equal((await request(owner,path())).body.enabled,false);assert.equal((await question()).status,503);assert.equal((await request(owner,'/buildings')).status,200);mode='ok';
 for(let i=0;i<2;i++)await db.query("INSERT INTO app_ai_requests(user_id,building_id,request_key,question_hash,status) VALUES($1,$2,$3,'busy','processing')",[outsider.id,other.id,randomUUID()]);
 assert.equal((await question()).status,503);assert.equal(calls.length,before);
 await db.query("UPDATE app_ai_requests SET status='failed',error_code=503 WHERE status='processing'");
});
test('deleting a test building keeps quota accounting and prevents replay through another building',async()=>{
 const temp=(await db.query('INSERT INTO app_buildings(user_id,name) VALUES($1,$2) RETURNING id',[owner.id,'Disposable fixture'])).rows[0];
 const nonce=randomUUID();await db.query("INSERT INTO app_ai_requests(user_id,building_id,request_key,question_hash,status) VALUES($1,$2,$3,'fixture','failed')",[owner.id,temp.id,nonce]);
 await db.query('DELETE FROM app_buildings WHERE id=$1',[temp.id]);
 assert.equal((await db.query('SELECT building_id FROM app_ai_requests WHERE request_key=$1',[nonce])).rows[0].building_id,null);
});
test('IFC mode sends command text only, validates structured proposals and replays them',async()=>{
 await db.query("UPDATE app_ai_requests SET created_at=now()-interval '2 hours'");mode='command';
 const info=await request(owner,path()+'?mode=ifc-command');
 assert.equal(info.body.context.mode,'ifc-command');assert.equal(JSON.stringify(info.body.context).includes('Testcampus'),false);
 const nonce=randomUUID(),body={mode:'ifc-command',question:'Färbe alle Wände blau',consent:'yes',context_hash:info.body.context_hash};
 const first=await request(owner,path(),body,nonce);assert.equal(first.status,200);assert.equal(first.body.command.action,'color');
 const sent=JSON.parse(calls.at(-1).options.body);assert.equal(sent.generationConfig.responseMimeType,'application/json');
 for(const text of ['Plan.pdf','Testcampus','D21 Test',privateContent])assert.equal(calls.at(-1).options.body.includes(text),false);
 const count=calls.length;const replay=await request(owner,path(),body,nonce);assert.equal(replay.body.cached,true);assert.deepEqual(replay.body.command,first.body.command);assert.equal(calls.length,count);
 mode='command-invalid';assert.equal((await request(owner,path(),body,randomUUID())).status,502);
 mode='command-unsupported';const unsupported=await request(owner,path(),body,randomUUID());assert.equal(unsupported.body.command.action,'unsupported');
 mode='ok';await db.query("UPDATE app_ai_requests SET created_at=now()-interval '2 hours'");
});
test('persistent account quota blocks new calls without affecting other users',async()=>{
 await db.query("UPDATE app_ai_requests SET created_at=now()-interval '2 hours'");
 const count=Number((await db.query('SELECT COUNT(*) AS count FROM app_ai_requests WHERE user_id=$1',[owner.id])).rows[0].count);
 for(let i=count;i<20;i++)await db.query("INSERT INTO app_ai_requests(user_id,building_id,request_key,question_hash,status,error_code,created_at) VALUES($1,$2,$3,'quota','failed',503,now()-interval '2 hours')",[owner.id,building.id,randomUUID()]);
 const before=calls.length;assert.equal((await question()).status,429);assert.equal(calls.length,before);
 await initAccounts(db);assert.equal((await question()).status,429);
});
test('text assistant uses numeric IFC analysis without explicit model selection',async()=>{
 const doc=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'CountTest.ifc','application/x-step',1,$2) RETURNING id",[building.id,Buffer.from('x')])).rows[0];
 try {
  await db.query("INSERT INTO app_ifc_analysis(document_id,status,report) VALUES($1,'ready',$2)",[doc.id,JSON.stringify({counts:{IfcSpace:241,IfcBuildingStorey:5},rooms:[{name:'NOT FOR PROVIDER'}]})]);
  const response=await fetch(url+`/buildings/${building.id}/assistant`,{headers:{'X-D21-Session':owner.token}});
  const info=await response.json();assert.equal(response.status,200);assert.ok(info.context.ifc_models.some(m=>m.ifc_space_count===241&&m.ifc_storey_count===5));assert.equal(JSON.stringify(info.context).includes('NOT FOR PROVIDER'),false);
 }finally{await db.query('DELETE FROM app_documents WHERE id=$1',[doc.id]);}
});
