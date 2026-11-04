const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {modelIndex}=require('../src/model-state');
let db,server,url,owner,member,outsider,building,document,foreign,calls=[];
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.test','unused'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);await db.query("INSERT INTO app_ai_preferences(user_id,enabled,policy_version,revision) VALUES($1,true,1,1)",[u.id]);return u;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');
 building=(await db.query('INSERT INTO app_buildings(user_id,name) VALUES($1,$2) RETURNING id',[owner.id,'Shared building'])).rows[0];
 const other=(await db.query('INSERT INTO app_buildings(user_id,name) VALUES($1,$2) RETURNING id',[outsider.id,'Foreign'])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.id]);
 for(const b of [building,other]){const doc=(await db.query('INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,$2,$3,$4,$5) RETURNING id',[b.id,'Model.ifc','application/x-step',80,Buffer.from("#1=IFCWALL('A', 'text #99=IFCSPACE(', $);\n#2=IFCSPACE($);\n/* #98=IFCWALL($); */\n#3=IFCDOOR($);")])).rows[0];if(b===building)document=doc;else foreign=doc;}
 const mockFetch=async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:body.generationConfig.responseMimeType?JSON.stringify({action:'color',target:'walls',color:'#0000ff',summary:'Wände blau färben'}):'Eine Wand und ein Raum sind als IFC-Einträge hinterlegt.'}]}}]})};};
 const app=express();app.use(express.json({limit:'256kb'}));app.use('/api/v1',accountRouter(db,{assistant:{enabled:true,getKey:()=> 'test-key-with-enough-characters',fetch:mockFetch}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function request(user,path,body,key){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'X-D21-Session':user.token}:{}),...(key?{'X-Request-ID':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
const state=()=>`/documents/${document.id}/model-state`;
const assistant=()=>`/buildings/${building.id}/assistant`;
test('STEP indexing ignores entity-looking text and comments',()=>{assert.deepEqual(modelIndex(Buffer.from("#1=IFCWALL('it''s #99=IFCSPACE(');/* #8=IFCSPACE(); */#2=IFCSPACE($);")).counts,{walls:1,rooms:1});});
test('state and server index enforce authentication and building membership',async()=>{
 assert.equal((await request(null,state())).status,401);assert.equal((await request(outsider,state())).status,404);
 assert.equal((await request(owner,`/documents/${foreign.id}/model-index`)).status,404);
 assert.deepEqual((await request(member,state())).body,{revision:0,state:{hidden:[],colors:{},lights:[]}});
 assert.deepEqual((await request(owner,`/documents/${document.id}/model-index`)).body.counts,{walls:1,rooms:1,doors:1});
});
test('shared mutations persist, reject stale writes and preserve original IFC bytes',async()=>{
 const original=(await db.query('SELECT content FROM app_documents WHERE id=$1',[document.id])).rows[0].content;
 let r=await request(owner,state(),{revision:0,operation:{action:'color',ids:[1],color:'#12AB34'}});assert.equal(r.status,200);assert.equal(r.body.revision,1);
 assert.equal((await request(member,state())).body.state.colors['1'],'#12ab34');
 r=await request(member,state(),{revision:0,operation:{action:'hide',ids:[3]}});assert.equal(r.status,409);
 r=await request(member,state(),{revision:1,operation:{action:'hide',ids:[3]}});assert.equal(r.status,200);
 r=await request(owner,state(),{revision:2,operation:{action:'light',ids:[2],on:true}});assert.deepEqual(r.body.state.lights,[2]);
 for(const operation of [{action:'delete',ids:[1]},{action:'color',ids:[1],color:'javascript:x'},{action:'hide',ids:[999]},{action:'light',ids:[1],on:true},{action:'hide',ids:[1,1]}])assert.equal((await request(owner,state(),{revision:3,operation})).status,400);
 assert.equal((await request(owner,state())).body.revision,3);
 assert.deepEqual((await db.query('SELECT content FROM app_documents WHERE id=$1',[document.id])).rows[0].content,original);
});
test('command preview is read-only and confirmed command is checked against real server IFC',async()=>{
 const command={action:'color',target:'walls',color:'#0000ff',summary:'Untrusted summary'};
 const endpoint=`/documents/${document.id}/model-command`;
 const preview=await request(member,endpoint,{command,confirm:false});assert.equal(preview.body.count,1);assert.equal(preview.body.description.includes('Untrusted'),false);
 assert.equal((await request(owner,state())).body.revision,3);
 assert.equal((await request(member,endpoint,{command,confirm:true,revision:3})).body.state.colors['1'],'#0000ff');
 assert.equal((await request(member,endpoint,{command,confirm:true,revision:3})).status,409);
 assert.equal((await request(owner,endpoint,{command:{...command,target:'selected'},confirm:false})).status,400);
 const reset={action:'reset',target:'all',color:null,summary:'Reset'};
 const r=await request(owner,endpoint,{command:reset,confirm:true,revision:4});assert.deepEqual(r.body.state,{hidden:[],colors:{},lights:[2]});
});
test('private persistent chatbot has replay-safe turns, bounded history and model counts',async()=>{
 const info=await request(owner,assistant()+`?document_id=${document.id}`);
 assert.equal(info.body.context.model.counts.walls,1);
 const body={question:'Welche Bauteile gibt es?',chat:true,document_id:document.id,consent:'yes',context_hash:info.body.context_hash},key=randomUUID();
 assert.equal((await request(owner,assistant(),body,key)).status,200);assert.equal((await request(owner,assistant(),body,key)).body.cached,true);
 let history=await request(owner,assistant()+'/history');assert.equal(history.body.length,1);assert.equal(history.body[0].question,body.question);
 assert.deepEqual((await request(member,assistant()+'/history')).body,[]);assert.equal((await request(outsider,assistant()+'/history')).status,404);
 assert.equal((await request(owner,assistant(),{...body,question:'Und wie viele Räume?'},randomUUID())).status,200);
 assert.ok(JSON.stringify(calls.at(-1).contents).includes('Welche Bauteile gibt es?'));
 assert.equal((await request(owner,assistant(),{...body,document_id:foreign.id},randomUUID())).status,400);
 const commandInfo=await request(owner,assistant()+'?mode=ifc-command');
 assert.equal((await request(owner,assistant(),{...body,mode:'ifc-command',question:'Färbe alle Wände blau',context_hash:commandInfo.body.context_hash},randomUUID())).status,200);
 history=await request(owner,assistant()+'/history');assert.equal(history.body.length,3);assert.equal(history.body[2].command.action,'color');
 // A proposal never changes the model until the explicit confirmation endpoint.
 assert.equal((await request(owner,state())).body.revision,5);
 assert.equal(JSON.stringify(calls.at(-1)).includes('Shared building'),false);
});
test('revoked membership loses model and conversation access',async()=>{
 await db.query('DELETE FROM app_building_members WHERE building_id=$1 AND user_id=$2',[building.id,member.id]);
 assert.equal((await request(member,state())).status,404);assert.equal((await request(member,assistant()+'/history')).status,404);
 assert.equal((await request(member,state(),{revision:5,operation:{action:'hide',ids:[1]}})).status,404);
});
