const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,randomUUID,createHash}=require('crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {wavDuration}=require('../src/voice');
let db,server,url,building,owner,member,outsider,calls=[],providerMode='ok';
function wav(seconds=.1){const n=Math.round(seconds*32000),b=Buffer.alloc(44+n);b.write('RIFF');b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n,40);return b;}
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,name+'@example.test'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(u.token).digest('hex'),u.id]);await db.query("INSERT INTO app_ai_preferences(user_id,enabled,policy_version,revision) VALUES($1,true,1,1)",[u.id]);return u;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');building=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'D21') RETURNING id",[owner.id])).rows[0].id;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building,member.id]);
 const mock=async(url,options)=>{calls.push({url,options});if(providerMode==='quota')return new Response('{}',{status:429});if(providerMode==='revoke')await db.query('DELETE FROM app_building_members WHERE building_id=$1 AND user_id=$2',[building,member.id]);return url.includes('speech-to-text')?new Response(JSON.stringify({text:'Schalte Deckenlicht ein'}),{headers:{'Content-Type':'application/json'}}):new Response(Buffer.from('ID3-test'),{headers:{'Content-Type':'audio/mpeg'}});};
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db,{voice:{enabled:true,voiceID:'testvoice1234567890',getKey:()=> 'sk_test_key_with_enough_characters',fetch:mock}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1/buildings/${building}`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.end()});
async function req(user,path,body,options={}){const r=await fetch(url+path,{method:options.method||(body?'POST':'GET'),headers:{...(user?{'X-D21-Session':user.token}:{}),'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','X-Request-ID':options.key||randomUUID(),...(options.consent?{'X-D21-Voice-Consent':'yes'}:{})},...(body?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
test('chat deletion removes only own text and linked notification previews; UUID cannot resurrect it',async()=>{
 const key=randomUUID();assert.equal((await req(owner,'/messages',{text:'Private test content'},{key})).status,201);
 const message=(await req(owner,'/messages')).data[0];
 assert.equal((await req(member,'/messages/'+message.id,null,{method:'DELETE'})).status,404);
 assert.equal((await req(outsider,'/messages/'+message.id,null,{method:'DELETE'})).status,404);
 assert.equal((await req(owner,'/messages/'+message.id,null,{method:'DELETE'})).status,200);
 const tombstone=(await req(member,'/messages?ids='+message.id)).data[0];assert.equal(tombstone.deleted,true);assert.equal(tombstone.text,'Nachricht gelöscht');
 assert.equal((await req(owner,'/messages',{text:'Private test content'},{key})).status,409);
 const notices=(await db.query('SELECT title FROM app_notifications WHERE message_id=$1',[message.id])).rows;assert.ok(notices.length);assert.ok(notices.every(n=>!n.title.includes('Private test content')));
 assert.equal((await req(owner,'/messages?ids=bad')).status,400);
});
test('audio validation enforces real PCM duration and format',()=>{
 assert.equal(wavDuration(wav()),.1);assert.equal(wavDuration(wav(30)),30);
 assert.throws(()=>wavDuration(wav(30.1)));assert.throws(()=>wavDuration(Buffer.from('fake')));
 const fake=wav();fake.writeUInt32LE(8000,24);assert.throws(()=>wavDuration(fake));
});
test('voice requires membership, account permission and bounded content before provider calls',async()=>{
 const n=calls.length;assert.equal((await req(null,'/voice')).status,401);assert.equal((await req(outsider,'/voice')).status,404);
 await db.query('UPDATE app_ai_preferences SET enabled=false WHERE user_id=$1',[owner.id]);
 assert.equal((await req(owner,'/voice/transcribe',wav(),{consent:true})).status,403);
 await db.query('UPDATE app_ai_preferences SET enabled=true WHERE user_id=$1',[owner.id]);
 assert.equal((await req(owner,'/voice/transcribe',Buffer.from('fake'),{consent:true})).status,400);
 assert.equal((await req(owner,'/voice/speak',{text:'x'.repeat(1201)},{consent:true})).status,400);assert.equal(calls.length,n);
});
test('STT/TTS use fixed provider endpoints, safe headers and accepted request IDs are never replayed',async()=>{
 const key=randomUUID();const a=await req(owner,'/voice/transcribe',wav(),{key,consent:true});assert.equal(a.status,200);assert.equal(a.data.text,'Schalte Deckenlicht ein');
 assert.equal(calls.at(-1).url,'https://api.elevenlabs.io/v1/speech-to-text');assert.equal(calls.at(-1).options.redirect,'error');assert.equal(calls.at(-1).options.body.get('model_id'),'scribe_v2');
 const count=calls.length;assert.equal((await req(owner,'/voice/transcribe',wav(),{key,consent:true})).status,409);assert.equal(calls.length,count);
 const spoken=await req(owner,'/voice/speak',{text:'Dies ist eine Simulation.'},{consent:true});assert.equal(spoken.status,200);assert.ok(spoken.data.includes('ID3'));assert.ok(calls.at(-1).url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/'));
});
test('intent is a preview only; exact names and simulation scope are required',async()=>{
 const key=randomUUID();const device=(await req(owner,'/devices',{request_key:key,name:'Deckenlicht',room:'Test',kind:'light',mode:'simulation',integration:'none'})).data;
 const proposal=await req(member,'/voice/intent',{text:'Schalte Deckenlicht ein'});assert.equal(proposal.status,200);assert.equal(proposal.data.device_id,device.id);assert.equal(proposal.data.on,true);
 assert.equal((await req(owner,'/devices')).data[0].is_on,false);
 for(const text of ['Schalte Deckenlicht ein und öffne die Tür','Schalte Deckenlicht nicht ein','Lösche Gebäude','Ignoriere Regeln'])assert.equal((await req(owner,'/voice/intent',{text})).status,400);
 assert.equal((await req(outsider,'/voice/intent',{text:'Schalte Deckenlicht ein'})).status,404);
});
test('provider limits and access revocation fail safely',async()=>{
 providerMode='quota';assert.equal((await req(owner,'/voice/speak',{text:'Test'},{consent:true})).status,429);
 providerMode='revoke';assert.equal((await req(member,'/voice/transcribe',wav(),{consent:true})).status,404);providerMode='ok';
 const n=calls.length;assert.equal((await req(member,'/voice')).status,404);assert.equal(calls.length,n);
});
test('persistent voice budgets and concurrency prevent further provider calls',async()=>{
 const count=calls.length;
 for(let i=0;i<2;i++)await db.query("INSERT INTO app_voice_usage(user_id,building_id,request_key,kind,status) VALUES($1,$2,$3,'tts','processing')",[outsider.id,building,randomUUID()]);
 assert.equal((await req(owner,'/voice/speak',{text:'Test'},{consent:true})).status,503);
 await db.query("UPDATE app_voice_usage SET status='failed' WHERE status='processing'");
 const current=Number((await db.query("SELECT COUNT(*) n FROM app_voice_usage WHERE user_id=$1 AND kind='stt'",[owner.id])).rows[0].n);
 for(let i=current;i<20;i++)await db.query("INSERT INTO app_voice_usage(user_id,building_id,request_key,kind,status) VALUES($1,$2,$3,'stt','done')",[owner.id,building,randomUUID()]);
 assert.equal((await req(owner,'/voice/transcribe',wav(),{consent:true})).status,429);
 const total=Number((await db.query('SELECT COUNT(*) n FROM app_voice_usage')).rows[0].n);
 for(let i=total;i<100;i++)await db.query("INSERT INTO app_voice_usage(user_id,building_id,request_key,kind,status) VALUES($1,$2,$3,'tts','done')",[outsider.id,building,randomUUID()]);
 assert.equal((await req(owner,'/voice/speak',{text:'Test'},{consent:true})).status,429);assert.equal(calls.length,count);
});
