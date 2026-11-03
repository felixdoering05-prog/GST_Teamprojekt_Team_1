const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
let db,server,url,owner,member,outsider,building,document,foreign,calls=[];
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.test','unused'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);return u;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');
 building=(await db.query('INSERT INTO app_buildings(user_id,name) VALUES($1,$2) RETURNING id',[owner.id,'Shared building'])).rows[0];
 const other=(await db.query('INSERT INTO app_buildings(user_id,name) VALUES($1,$2) RETURNING id',[outsider.id,'Foreign'])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.id]);
 for(const b of [building,other]){const doc=(await db.query('INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,$2,$3,$4,$5) RETURNING id',[b.id,'Model.ifc','application/x-step',80,Buffer.from("#1=IFCWALL('A', 'text #99=IFCSPACE(', $);\n#2=IFCSPACE($);\n/* #98=IFCWALL($); */\n#3=IFCDOOR($);")])).rows[0];if(b===building)document=doc;else foreign=doc;}
 const mockFetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body,headers:options.headers});return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:body.messages[0].content.includes('JSON-Objekt')?JSON.stringify({action:'color',target:'walls',color:'#0000ff',summary:'Wände blau färben'}):'Eine Wand ist als IFC-Eintrag hinterlegt.'}}]})};};
 const app=express();app.use(express.json({limit:'256kb'}));app.use('/api/v1',accountRouter(db,{assistant:{provider:'hda',model:'openai-gpt-oss-120b',enabled:true,getKey:()=> 'test-key-with-enough-characters',fetch:mockFetch}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function request(user,path,body,key){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'X-D21-Session':user.token}:{}),...(key?{'X-Request-ID':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
const state=()=>`/documents/${document.id}/model-state`;
const assistant=()=>`/buildings/${building.id}/assistant`;
test('HDA chat requires explicit HDA consent and preserves account scoping and replay',async()=>{
 const info=await request(owner,assistant());assert.equal(info.body.provider,'hda');assert.equal(info.body.provider_name,'h_da Open WebUI');
 const body={question:'Welche Angaben gibt es?',chat:true,consent:'yes',context_hash:info.body.context_hash};const key=randomUUID();
 assert.equal((await request(owner,assistant(),body,key)).status,400);assert.equal(calls.length,0);
 assert.equal((await request(owner,assistant(),{...body,consent_provider:'gemini'},key)).status,400);assert.equal(calls.length,0);
 const accepted={...body,consent_provider:'hda'};
 assert.equal((await request(outsider,assistant(),accepted,key)).status,404);
 assert.equal((await request(owner,assistant(),accepted,key)).status,200);assert.equal((await request(owner,assistant(),accepted,key)).body.cached,true);assert.equal(calls.length,1);
 assert.equal((await request(owner,assistant()+'/history')).body.length,1);assert.deepEqual((await request(member,assistant()+'/history')).body,[]);
 assert.equal((await request(owner,assistant(),{...accepted,question:'Was soll ich als Nächstes tun?'},randomUUID())).status,200);
 assert.equal(calls.at(-1).url,'https://open-webui.lc.users.h-da.cloud/api/chat/completions');assert.ok(calls.at(-1).body.messages.some(x=>x.role==='assistant'));
});
test('HDA structured commands stay proposals and include no building metadata',async()=>{
 const info=await request(owner,assistant()+'?mode=ifc-command');
 const body={mode:'ifc-command',question:'Färbe alle Wände blau',document_id:document.id,chat:true,consent:'yes',consent_provider:'hda',context_hash:info.body.context_hash};
 const result=await request(owner,assistant(),body,randomUUID());assert.equal(result.status,200);assert.equal(result.body.command.action,'color');
 assert.equal(JSON.stringify(calls.at(-1).body).includes('Shared building'),false);
 assert.equal((await request(owner,state())).body.revision,0);
});
