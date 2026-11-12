const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {validateGeometry,prepareGeometry,recipe}=require('../src/plan-conversion/model');
const {analyzePlans}=require('../src/plan-conversion/provider');
const {processNext}=require('../src/plan-conversion/worker');
const Q=require('../src/plan-conversion/queue');
const fixture=()=>({status:'ok',reason:'Synthetic fixture',warnings:[],levels:[{name:'EG',elevation:0,height:2500,height_assumed:true,width:6000,depth:5000,dimension_evidence:[{axis:'x',mm:6000,label:'6 m'},{axis:'y',mm:5000,label:'5 m'}],boundary:[[0,0],[6000,0],[6000,5000],[0,5000]],walls:[{a:[125,125],b:[5875,125],thickness:250},{a:[5875,125],b:[5875,4875],thickness:250},{a:[5875,4875],b:[125,4875],thickness:250},{a:[125,4875],b:[125,125],thickness:250}],openings:[],rooms:[{name:'Room',point:[2000,2000]}]}]});
let db,pg,server,url,owner,other,building,docs=[];
before(async()=>{
 pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};await initAccounts(db);
 async function user(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.test','unused'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);return u;}
 owner=await user('PlanOwner');other=await user('PlanOther');building=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Fixture') RETURNING id",[owner.id])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,other.id]);
 for(let i=0;i<5;i++)docs.push((await db.query('INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,$2,$3,$4,$5) RETURNING id',[building.id,`Plan${i}.pdf`,'application/pdf',10,Buffer.from('%PDF-1.4 x')])).rows[0].id);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db,{planConversion:{enabled:true}}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1/buildings/${building.id}/plan-conversion`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await pg?.close();});
async function api(path='',body,user=owner,method=body?'POST':'GET'){const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(user?{'X-D21-Session':user.token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
async function consent(enabled=true){const current=(await api()).body;return api('',{enabled,revision:current.settings.revision,policy_version:1},owner,'PATCH');}
async function clear(){await db.query('DELETE FROM app_plan_jobs');await db.query("DELETE FROM app_notifications WHERE kind='plan_ready'");}
async function enqueue(ids){return api('/jobs',{document_ids:ids,request_key:randomUUID()});}
test('strict geometry rejects missing scale, oversized plans and injected commands',()=>{
 assert.equal(validateGeometry(fixture()).status,'ok');const verbose=fixture();verbose.reason='Erklärung zur Planerkennung. '.repeat(15);verbose.warnings=['Eine längere Erläuterung zur angenommenen Höhe. '.repeat(8)];assert.equal(validateGeometry(verbose).status,'ok');
 for(const mutate of [g=>g.levels[0].dimension_evidence=[],g=>g.levels[0].walls[0].thickness=100000,g=>g.levels[0].boundary[0][0]=Infinity,g=>g.commands=['open /etc/passwd'],g=>g.levels[0].walls[0].a=[-99999,0]]){const g=fixture();mutate(g);assert.throws(()=>validateGeometry(g));}
 const unhosted=fixture();unhosted.levels[0].openings=[{kind:'door',at:[2500,2500],width:900,height:2100,sill:0}];assert.throws(()=>validateGeometry(unhosted));const prepared=prepareGeometry(unhosted);assert.equal(prepared.geometry.levels[0].openings.length,0);assert.match(prepared.warnings[0],/1 erkannte Öffnungen/);
 const g=fixture();g.levels[0].name='EG\\nopen /etc/passwd';const commands=recipe(g,'/tmp/output.png').split('\n');assert.ok(commands.every(c=>!c.startsWith('open ')));assert.throws(()=>validateGeometry({status:'needs_input',reason:'No dimensions',warnings:[],levels:[]}));
});
test('Gemini receives image bytes only at fixed endpoint and bounded JSON is validated',async()=>{
 let sent;const result=await analyzePlans([{mime_type:'image/png',content:Buffer.from('test-image')}],{getKey:()=> 'test-only-key',model:'test-model',fetchProvider:async(u,o)=>{sent={u,o};return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(fixture())}]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:34}}),{headers:{'Content-Type':'application/json'}});}});
 assert.equal(result.usage.prompt_tokens,12);assert.equal(sent.o.redirect,'error');assert.ok(sent.u.startsWith('https://generativelanguage.googleapis.com/'));assert.equal(JSON.parse(sent.o.body).contents[0].parts[0].inlineData.data,Buffer.from('test-image').toString('base64'));
 await assert.rejects(analyzePlans([],{getKey:()=> 'test',fetchProvider:async()=>new Response('{}',{status:429})}),{code:'provider_limit'});
 await assert.rejects(analyzePlans([],{getKey:()=> 'test',fetchProvider:async()=>new Response('x'.repeat(600000))}),{code:'provider_response_invalid'});
});
test('owner-only opt-in requires account AI and never sends historical files automatically',async()=>{
 assert.equal((await api('',null,null)).status,401);assert.equal((await api('',null,other)).status,404);
 assert.equal((await enqueue([docs[0]])).status,403);assert.equal((await consent()).status,403);
 await db.query('INSERT INTO app_ai_preferences(user_id,enabled,policy_version,revision) VALUES($1,true,1,1)',[owner.id]);
 assert.equal((await consent()).status,200);assert.equal((await api()).body.jobs.length,0);
 const result=await enqueue([docs[0],docs[1]]);assert.equal(result.status,202,JSON.stringify(result.body));assert.equal((await api()).body.jobs[0].status,'queued');
 assert.equal((await api('/jobs',{document_ids:[docs[0]],request_key:randomUUID()},other)).status,404);
 assert.equal((await api('/jobs/'+result.body.id+'/approve',{})).status,409);
 await clear();
});
test('debounce batches at most four files without dropping the previous batch',async()=>{
 const run=async(ids,key)=>{await db.query('BEGIN');try{const result=await Q.enqueue(db,{building:building.id,user:owner.id,documentIds:ids,requestKey:key,automatic:true});await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}};
 const first=await run([docs[0]],'upload:1');const second=await run(docs.slice(1,4),'upload:2');assert.equal(first.id,second.id);
 const third=await run([docs[4]],'upload:5');assert.notEqual(first.id,third.id);
 const rows=(await db.query('SELECT document_ids FROM app_plan_jobs ORDER BY created_at')).rows;assert.deepEqual(rows.map(r=>r.document_ids.length),[4,1]);await clear();
});
test('actual upload endpoint starts owner jobs only after opt-in and leaves uploads intact',async()=>{
 const previous=process.env.PLAN_CONVERSION_ENABLED;process.env.PLAN_CONVERSION_ENABLED='true';
 const upload=async(user)=>{const r=await fetch(url.replace('/plan-conversion','/documents'),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':'Automatic.pdf','X-D21-Session':user.token},body:Buffer.from('%PDF-1.4\n% Synthetic plan')});return {status:r.status,body:await r.json()};};
 try{
  const first=await upload(owner);assert.equal(first.status,201);assert.equal(first.body.plan_conversion.status,'queued');
  const member=await upload(other);assert.equal(member.status,201);assert.equal(member.body.plan_conversion,undefined);assert.equal((await api()).body.jobs.length,1);
  await consent(false);const off=await upload(owner);assert.equal(off.status,201);assert.equal(off.body.plan_conversion,undefined);assert.equal((await api()).body.jobs[0].status,'cancelled');
 }finally{if(previous===undefined)delete process.env.PLAN_CONVERSION_ENABLED;else process.env.PLAN_CONVERSION_ENABLED=previous;await clear();await consent();}
});
test('worker requires consent, keeps output separate, approval appends IFC and is idempotent',async()=>{
 const result=await enqueue([docs[0]]);let calls=0;
 const analyze=async()=>{calls++;return {geometry:fixture(),model:'fixture-model',usage:{prompt_tokens:1}};};
 const generate=async()=>({ifc:Buffer.from("ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;#1=IFCWALL($);ENDSEC;END-ISO-10303-21;"),preview:Buffer.from('preview'),warnings:['Test only']});
 const before=Number((await db.query('SELECT count(*) n FROM app_documents')).rows[0].n);
 await processNext(db,{enabled:true,analyze,generate});assert.equal(calls,1);const job=(await api()).body.jobs[0];assert.equal(job.status,'ready');assert.equal(Number((await db.query('SELECT count(*) n FROM app_documents')).rows[0].n),before);
 const notices=(await db.query("SELECT user_id,building_id FROM app_notifications WHERE kind='plan_ready'")).rows;assert.deepEqual(notices,[{user_id:owner.id,building_id:building.id}]);
 await processNext(db,{enabled:true,analyze,generate});assert.equal((await db.query("SELECT count(*) n FROM app_notifications WHERE kind='plan_ready'")).rows[0].n,1);
 const approved=await api('/jobs/'+result.body.id+'/approve',{});assert.equal(approved.status,200,JSON.stringify(approved.body));assert.equal((await api('/jobs/'+result.body.id+'/approve',{})).body.document_id,approved.body.document_id);assert.equal(Number((await db.query('SELECT count(*) n FROM app_documents')).rows[0].n),before+1);await clear();
});
test('revocation during provider call prevents generation and model adoption',async()=>{
 await enqueue([docs[0]]);let generated=false;
 await processNext(db,{enabled:true,analyze:async()=>{await consent(false);return {geometry:fixture(),model:'test'};},generate:async()=>{generated=true;}});
 assert.equal(generated,false);assert.equal((await api()).body.jobs[0].status,'cancelled');assert.equal((await db.query("SELECT count(*) n FROM app_notifications WHERE kind='plan_ready'")).rows[0].n,0);await clear();await consent();
});
test('stored rejected geometry can be rebuilt without a new Google request',async()=>{
 const first=await enqueue([docs[0]]);const geometry=fixture();geometry.levels[0].openings=[{kind:'door',at:[2500,2500],width:900,height:2100,sill:0}];
 await db.query("UPDATE app_plan_jobs SET status='failed',failure_code='invalid_geometry',analysis=$2,provider_model='prior-model' WHERE id=$1",[first.body.id,JSON.stringify(geometry)]);
 const rebuilt=await api('/jobs/'+first.body.id+'/rebuild',{request_key:randomUUID()});assert.equal(rebuilt.status,202);
 let calls=0;await processNext(db,{enabled:true,analyze:async()=>{calls++;},generate:async(g)=>{assert.equal(g.levels[0].openings.length,0);return {ifc:Buffer.from('test-ifc'),preview:Buffer.from('png'),warnings:[]};}});
 assert.equal(calls,0);const job=(await api()).body.jobs.find(j=>j.id===rebuilt.body.id);assert.equal(job.status,'ready');assert.match(job.warnings[0],/weggelassen/);assert.equal(job.usage,null);await clear();
});
test('modified source is rejected and expired running jobs are not resubmitted to Google',async()=>{
 const {body:job}=await enqueue([docs[0]]);await db.query('UPDATE app_documents SET content=$1 WHERE id=$2',[Buffer.from('changed'),docs[0]]);let calls=0;
 await processNext(db,{enabled:true,analyze:async()=>{calls++;}});assert.equal(calls,0);assert.equal((await api()).body.jobs[0].failure_code,'source_changed');
 await db.query("UPDATE app_plan_jobs SET status='running',lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);await processNext(db,{enabled:true,analyze:async()=>{calls++;}});assert.equal(calls,0);assert.equal((await api()).body.jobs[0].failure_code,'worker_interrupted');await clear();
});
test('failed interpretation stops honestly and daily job quota is enforced',async()=>{
 for(let i=0;i<3;i++){await enqueue([docs[1]]);await processNext(db,{enabled:true,analyze:async()=>{throw Object.assign(Error(),{code:'needs_input'});}});}
 assert.equal((await enqueue([docs[1]])).status,429);assert.ok((await api()).body.jobs.every(j=>j.status==='needs_input'));
});

test('daily exemption is server-configured, account-specific and preserves global and pending limits',async()=>{
 const previous=process.env.PLAN_DAILY_QUOTA_EXEMPT_USER_IDS;
 await clear();
 try{
  process.env.PLAN_DAILY_QUOTA_EXEMPT_USER_IDS=String(owner.id);
  assert.equal(Q.dailyLimit(owner.id),null);assert.equal(Q.dailyLimit(other.id),3);
  assert.equal((await api()).body.daily_limit,null);
  for(let i=0;i<10;i++){
   const r=await enqueue([docs[0]]);assert.equal(r.status,202,JSON.stringify(r.body));
   await db.query("UPDATE app_plan_jobs SET status='failed' WHERE id=$1",[r.body.id]);
  }
  assert.equal((await enqueue([docs[0]])).status,429);
  await clear();
  for(let i=0;i<3;i++)assert.equal((await enqueue([docs[0]])).status,202);
  assert.equal((await enqueue([docs[0]])).status,429);
  process.env.PLAN_DAILY_QUOTA_EXEMPT_USER_IDS='0,-1,abc,999999999999';assert.equal(Q.dailyLimit(owner.id),3);
 }finally{if(previous===undefined)delete process.env.PLAN_DAILY_QUOTA_EXEMPT_USER_IDS;else process.env.PLAN_DAILY_QUOTA_EXEMPT_USER_IDS=previous;await clear();}
});
