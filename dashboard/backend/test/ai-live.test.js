const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),express=require('express'),{PGlite}=require('@electric-sql/pglite');
const {randomBytes,randomUUID,createHash}=require('crypto'),{initAccounts,accountRouter}=require('../src/accounts');
let db,server,url,owner,member,outsider,building,calls=[],mode='ok';
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,name+'@example.test'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(u.token).digest('hex'),u.id]);return u;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');building=(await db.query("INSERT INTO app_buildings(user_id,name,address) VALUES($1,'D21','PRIVATE ADDRESS') RETURNING id",[owner.id])).rows[0].id;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building,member.id]);
 const mock=async(url,options)=>{calls.push({url,options});if(mode==='revoke')await db.query('UPDATE app_ai_preferences SET enabled=false,revision=revision+1 WHERE user_id=$1',[owner.id]);if(mode==='membership')await db.query('DELETE FROM app_building_members WHERE building_id=$1 AND user_id=$2',[building,member.id]);if(mode==='quota')return new Response('{}',{status:429});if(mode==='secret')throw Error('DO NOT EXPOSE secret-key');if(mode==='badurl')return new Response(JSON.stringify({signed_url:'wss://evil.example/v1/convai/conversation?x=1234567890123456789012345'}));if(String(url).includes('get-signed-url'))return new Response(JSON.stringify({signed_url:'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_test12345678&conversation_signature=sig-only-in-response'}));return new Response(JSON.stringify({token:'ephemeral-token-only-in-response-12345'}));};
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db,{liveVoice:{enabled:true,agentID:'agent_test12345678',getKey:()=> 'secret-key',fetch:mock}}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function req(user,path,method='GET',body,key=randomUUID()){const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json','X-Request-ID':key,...(user?{'X-D21-Session':user.token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const base=()=>`/buildings/${building}/voice/live`;
async function toggle(user,enabled){const old=await req(user,'/profile/ai');return req(user,'/profile/ai','PATCH',{enabled,revision:old.data.revision,policy_version:1});}
async function clear(){await db.query('DELETE FROM app_voice_usage');mode='ok';}
test('AI opt-in is account-scoped; legacy consent cannot bypass it',async()=>{
 assert.equal((await req(null,'/profile/ai')).status,401);const off=await req(owner,'/profile/ai');assert.equal(off.data.enabled,false);assert.equal(off.data.revision,0);assert.equal((await req(owner,base(),'POST',{})).status,403);
 const info=await req(owner,`/buildings/${building}/assistant`);assert.equal(info.data.account_enabled,false);assert.equal((await req(owner,`/buildings/${building}/assistant`,'POST',{consent:'yes',question:'Test',context_hash:info.data.context_hash})).status,403);assert.equal(calls.length,0);
});
test('settings reject foreign user IDs, stale policies and revisions',async()=>{
 assert.equal((await req(owner,'/profile/ai','PATCH',{enabled:true,revision:0,policy_version:0})).status,400);assert.equal((await req(owner,'/profile/ai','PATCH',{enabled:true,revision:0,policy_version:1,user_id:member.id})).status,400);assert.equal((await toggle(owner,true)).status,200);assert.equal((await req(member,'/profile/ai')).data.enabled,false);assert.equal((await req(owner,'/profile/ai','PATCH',{enabled:false,revision:0})).status,409);assert.equal((await req(owner,'/profile/ai')).data.enabled,true);
});
test('live token needs membership, empty body and unique UUID; no secret/context leakage',async()=>{
 assert.equal((await req(outsider,base(),'POST',{})).status,404);assert.equal((await req(owner,base(),'POST',{agent_id:'other'})).status,400);assert.equal((await req(owner,base(),'POST',{},'bad')).status,400);assert.equal(calls.length,0);
 const key=randomUUID(),start=await req(owner,base(),'POST',{},key);assert.equal(start.status,200);assert.equal(start.data.max_seconds,120);assert.equal((await req(owner,base(),'POST',{},key)).status,409);assert.equal(calls.at(-1).url,'https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent_test12345678');assert.equal(calls.at(-1).options.redirect,'error');assert.equal(JSON.stringify(start.data).includes('secret-key'),false);assert.equal(JSON.stringify(start.data).includes('PRIVATE ADDRESS'),false);
 assert.equal((await req(member,base()+'/'+key)).status,404);assert.equal((await req(owner,base()+'/'+key)).data.active,true);assert.equal((await req(owner,base()+'/'+key,'DELETE')).status,200);assert.equal((await req(owner,base()+'/'+key)).data.active,false);
});
test('one live conversation per account; account revocation and expiry end the lease',async()=>{
 await clear();const key=randomUUID();assert.equal((await req(owner,base(),'POST',{},key)).status,200);assert.equal((await req(owner,base(),'POST',{})).status,409);await toggle(owner,false);assert.equal((await req(owner,base()+'/'+key)).data.active,false);await toggle(owner,true);assert.equal((await req(owner,base()+'/'+key)).data.active,false);
 await clear();const second=randomUUID();assert.equal((await req(owner,base(),'POST',{},second)).status,200);await db.query("UPDATE app_live_voice_sessions SET expires_at=now()-interval '1 second' WHERE session_key=$1",[second]);assert.equal((await req(owner,base()+'/'+second)).data.active,false);
});
test('revoked permission or membership during provider response never releases a token',async()=>{
 await clear();mode='revoke';const a=await req(owner,base(),'POST',{});assert.equal(a.status,403);assert.equal(JSON.stringify(a).includes('ephemeral-token'),false);await toggle(owner,true);await clear();await toggle(member,true);mode='membership';assert.equal((await req(member,base(),'POST',{})).status,403);mode='ok';await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building,member.id]);
});
test('provider errors remain safe and persistent quotas prevent calls',async()=>{
 await clear();mode='quota';assert.equal((await req(owner,base(),'POST',{})).status,429);mode='secret';const result=await req(owner,base(),'POST',{});assert.equal(result.status,503);assert.equal(JSON.stringify(result).includes('secret-key'),false);await clear();for(let i=0;i<10;i++)await db.query("INSERT INTO app_voice_usage(user_id,building_id,request_key,kind,status) VALUES($1,$2,$3,'live','ended')",[owner.id,building,randomUUID()]);const n=calls.length;assert.equal((await req(owner,base(),'POST',{})).status,429);assert.equal(calls.length,n);
});
test('websocket transport returns only a validated signed ElevenLabs URL under the same lease rules',async()=>{
 await clear();await toggle(owner,true).catch(()=>{});
 assert.equal((await req(owner,base()+'?transport=webrtc2','POST',{})).status,400);
 const key=randomUUID(),start=await req(owner,base()+'?transport=websocket','POST',{},key);assert.equal(start.status,200,JSON.stringify(start.data));
 assert.equal(calls.at(-1).url,'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_test12345678');assert.equal(calls.at(-1).options.redirect,'error');
 assert.equal(start.data.transport,'websocket');assert.ok(start.data.signed_url.startsWith('wss://api.elevenlabs.io/v1/convai/conversation?'));assert.equal(start.data.token,undefined);assert.equal(start.data.max_seconds,120);
 assert.equal(JSON.stringify(start.data).includes('secret-key'),false);assert.equal(JSON.stringify(start.data).includes('PRIVATE ADDRESS'),false);
 assert.equal((await req(owner,base()+'?transport=websocket','POST',{})).status,409);assert.equal((await req(owner,base()+'/'+key,'DELETE')).status,200);
 await clear();mode='badurl';const bad=await req(owner,base()+'?transport=websocket','POST',{});assert.equal(bad.status,502);assert.equal(JSON.stringify(bad).includes('evil.example'),false);mode='ok';
 const {signedURL}=require('../src/live-voice');assert.equal(signedURL('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=0123456789'),true);assert.equal(signedURL('https://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=0123456789'),false);assert.equal(signedURL('wss://user:pw@api.elevenlabs.io/v1/convai/conversation?agent_id=a&sig=01234567890'),false);
});

test('server exception bypasses daily live quota only for selected account and preserves concurrency',async()=>{
 await clear();process.env.AI_CONVERSATION_UNLIMITED_USER_IDS=String(owner.id);
 try {
  for(let i=0;i<100;i++)await db.query("INSERT INTO app_voice_usage(user_id,building_id,request_key,kind,status) VALUES($1,$2,$3,'live','ended')",[owner.id,building,randomUUID()]);
  assert.equal((await req(owner,base(),'POST',{})).status,200);
  assert.equal((await req(owner,base(),'POST',{})).status,409);
  assert.equal((await req(member,base(),'POST',{})).status,429);
 }finally{delete process.env.AI_CONVERSATION_UNLIMITED_USER_IDS;await clear();}
});

test('live voice gets IFC count without transmitting room names',async()=>{
 await clear();
 const doc=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Synthetic.ifc','application/x-step',1,$2) RETURNING id",[building,Buffer.from('x')])).rows[0];
 await db.query("INSERT INTO app_ifc_analysis(document_id,status,report) VALUES($1,'ready',$2)",[doc.id,JSON.stringify({counts:{IfcSpace:241},rooms:[{name:'PRIVATE ROOM NAME'}]})]);
 const reply=await req(owner,base(),'POST',{});assert.equal(reply.status,200);
 const context=JSON.parse(reply.data.dynamic_variables.building_context);
 assert.deepEqual(context.ifc_models,[{model_number:1,ifc_space_count:241}]);assert.equal(JSON.stringify(context).includes('PRIVATE ROOM NAME'),false);
 assert.equal((await req(outsider,base(),'POST',{})).status,404);
 await db.query('DELETE FROM app_documents WHERE id=$1',[doc.id]);await clear();
});
