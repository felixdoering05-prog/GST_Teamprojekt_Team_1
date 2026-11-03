const express=require('express');
const {readFileSync}=require('node:fs');
const {accessibleBuilding}=require('./collaboration');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function wavDuration(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt32LE(4)+8!==bytes.length)fail('Bitte eine gültige WAV-Aufnahme verwenden.');
 let pcm=false,size=null;
 for(let p=12;p+8<=bytes.length;){const kind=bytes.toString('ascii',p,p+4),length=bytes.readUInt32LE(p+4),start=p+8;if(start+length>bytes.length)fail('Ungültige Audio-Blöcke.');
  if(kind==='fmt '){if(pcm||length<16||bytes.readUInt16LE(start)!==1||bytes.readUInt16LE(start+2)!==1||bytes.readUInt32LE(start+4)!==16000||bytes.readUInt32LE(start+8)!==32000||bytes.readUInt16LE(start+12)!==2||bytes.readUInt16LE(start+14)!==16)fail('Benötigt wird PCM-WAV: 16 kHz, mono, 16 Bit.');pcm=true;}
  if(kind==='data'){if(size!==null)fail('Nur ein Audio-Datenblock erlaubt.');size=length;}
  p=start+length+(length%2);
 }
 if(!pcm||size===null||size%2||size<3200||size>960000)fail('Aufnahme muss zwischen 0,1 und 30 Sekunden lang sein.');return size/32000;
}
async function initVoice(db){await db.query(`CREATE TABLE IF NOT EXISTS app_voice_usage(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,building_id INTEGER REFERENCES app_buildings(id) ON DELETE SET NULL,request_key TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'processing',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(user_id,request_key))`);await db.query('CREATE INDEX IF NOT EXISTS app_voice_usage_time ON app_voice_usage(created_at)');}
async function bounded(response,max){
 if(!response.body?.getReader){const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>max)fail('Anbieterantwort zu groß.',502);return bytes;}
 const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max)fail('Anbieterantwort zu groß.',502);chunks.push(Buffer.from(value));}return Buffer.concat(chunks);}finally{await reader.cancel().catch(()=>{});}
}
function voiceRouter(db,requireAccount,options={}){
 const r=express.Router(),base='/buildings/:voiceBuilding/voice';
 const key=options.getKey||(()=>readFileSync(process.env.ELEVENLABS_API_KEY_FILE||'/run/d21-voice/elevenlabs-api-key','utf8').trim());
 const voice=options.voiceID||process.env.ELEVENLABS_VOICE_ID||'';
 const enabled=options.enabled??process.env.ELEVENLABS_ENABLED==='true',fetchProvider=options.fetch||global.fetch;
 const ready=()=>{try{return enabled&&/^[A-Za-z0-9]{10,80}$/.test(voice)&&/^[A-Za-z0-9_-]{20,500}$/.test(key());}catch{return false;}};
 r.use(base,requireAccount,wrap(async(req,res,next)=>{res.set('Cache-Control','private, no-store');if(!/^[1-9]\d*$/.test(req.params.voiceBuilding)||Number(req.params.voiceBuilding)>2147483647)fail('Ungültiges Gebäude.');const b=await accessibleBuilding(db,req.params.voiceBuilding,req.account.id);if(!b)fail('Gebäude nicht gefunden.',404);req.voiceBuilding=b;next();}));
 r.get(base,(req,res)=>res.json({enabled:ready(),provider:'ElevenLabs',max_seconds:30,max_text:1200,per_account_kind_24h:20,project_24h:100,notice:'Aufnahmen oder angezeigte Texte werden nur nach Freigabe an ElevenLabs übertragen. Anbieter kann Daten gemäß seinen Bedingungen speichern. Keine dauerhaft offene Aufnahme.'}));
 async function reserve(req,kind){
  const id=req.get('X-Request-ID')||'';if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))fail('Gültige Anfrage-ID erforderlich.');
  const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM app_ai_budget WHERE id=1 FOR UPDATE');
   if((await c.query('SELECT 1 FROM app_voice_usage WHERE user_id=$1 AND request_key=$2',[req.account.id,id.toLowerCase()])).rows.length)fail('Diese Sprachanfrage wurde bereits angenommen. Bitte nicht automatisch wiederholen.',409);
   const counts=(await c.query("SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE user_id=$1 AND kind=$2) AS own,COUNT(*) FILTER(WHERE status='processing' AND created_at>now()-interval '2 minutes') AS active FROM app_voice_usage WHERE created_at>now()-interval '24 hours'",[req.account.id,kind])).rows[0];
   if(Number(counts.total)>=100||Number(counts.own)>=20)fail('Sprachkontingent für 24 Stunden erreicht.',429);if(Number(counts.active)>=2)fail('Sprachdienst gerade ausgelastet.',503);
   const row=(await c.query('INSERT INTO app_voice_usage(user_id,building_id,request_key,kind) VALUES($1,$2,$3,$4) RETURNING id',[req.account.id,req.voiceBuilding.id,id.toLowerCase(),kind])).rows[0];await c.query('COMMIT');return row.id;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 const consent=req=>{if(req.get('X-D21-Voice-Consent')!=='yes')fail('Bitte die Übertragung an ElevenLabs ausdrücklich freigeben.');if(!ready())fail('ElevenLabs ist noch nicht eingerichtet.',503);};
 async function invoke(req,res,kind,url,body,contentType){
  const id=await reserve(req,kind);try{
   if(!await accessibleBuilding(db,req.voiceBuilding.id,req.account.id))fail('Gebäude nicht gefunden.',404);
   const response=await fetchProvider(url,{method:'POST',headers:{'xi-api-key':key(),...(contentType?{'Content-Type':contentType}:{})},body,signal:AbortSignal.timeout(45000),redirect:'error'});
   if(!response.ok)fail(response.status===429?'ElevenLabs-Kontingent erreicht.':'ElevenLabs-Anfrage fehlgeschlagen.',response.status===429?429:502);
   const bytes=await bounded(response,kind==='stt'?65536:2*1024*1024);
   if(!await accessibleBuilding(db,req.voiceBuilding.id,req.account.id))fail('Gebäudezugang wurde entzogen.',404);
   if(kind==='stt'){let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{fail('Ungültige Spracherkennung.',502);}if(typeof data.text!=='string'||!data.text.trim()||data.text.length>2000)fail('Keine kurze verwertbare Spracherkennung.',502);await db.query("UPDATE app_voice_usage SET status='done' WHERE id=$1",[id]);res.json({text:data.text.trim()});}
   else {if(!bytes.length||!String(response.headers.get('content-type')).startsWith('audio/'))fail('Keine gültige Audioantwort.',502);await db.query("UPDATE app_voice_usage SET status='done' WHERE id=$1",[id]);res.type('audio/mpeg').send(bytes);}
  }catch(e){await db.query("UPDATE app_voice_usage SET status='failed' WHERE id=$1",[id]);if(e.status)throw e;fail('Sprachdienst nicht erreichbar. Es erfolgt keine automatische Wiederholung.',503);}
 }
 r.post(base+'/transcribe',(req,res,next)=>{try{consent(req);next();}catch(e){next(e);}},express.raw({type:'application/octet-stream',limit:'1mb'}),wrap(async(req,res)=>{
  wavDuration(req.body);const body=new FormData();body.append('model_id','scribe_v2');body.append('language_code','de');body.append('tag_audio_events','false');body.append('file',new Blob([req.body],{type:'audio/wav'}),'speech.wav');
  await invoke(req,res,'stt','https://api.elevenlabs.io/v1/speech-to-text',body);
 }));
 r.post(base+'/speak',wrap(async(req,res)=>{consent(req);const text=req.body?.text;if(typeof text!=='string'||!text.trim()||text.length>1200||Object.keys(req.body).some(k=>k!=='text'))fail('Bitte den angezeigten Text bis 1200 Zeichen verwenden.');await invoke(req,res,'tts',`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,JSON.stringify({text,model_id:'eleven_multilingual_v2'}),'application/json');}));
 r.post(base+'/intent',wrap(async(req,res)=>{
  const text=req.body?.text;if(typeof text!=='string'||text.length>300)fail('Bitte einen kurzen einzelnen Schaltbefehl verwenden.');
  const match=/^schalte\s+(?:(?:das|die|den)\s+)?(.+?)\s+(ein|aus)[.!]?$/i.exec(text.trim());if(!match)fail('Unterstützt: „Schalte Deckenlicht ein/aus“. Fragen bitte im KI-Chat vorbereiten.');
  const rows=(await db.query("SELECT id,name,revision FROM app_devices WHERE building_id=$1 AND mode='simulation' AND kind IN ('light','plug')",[req.voiceBuilding.id])).rows.filter(d=>d.name.toLocaleLowerCase('de')===match[1].trim().toLocaleLowerCase('de'));
  if(rows.length!==1)fail('Der Gerätename ist nicht eindeutig. Bitte den exakten Namen einer simulierten Lampe oder Steckdose verwenden.');
  const device=rows[0],on=match[2].toLowerCase()==='ein';res.json({device_id:device.id,revision:device.revision,on,description:`Simulation: ${device.name} ${on?'einschalten':'ausschalten'}. Keine echte Hardware und keine automatische IFC-Verknüpfung.`});
 }));
 r.use((e,req,res,next)=>e.status?res.status(e.status).json({error:e.type==='entity.too.large'?'Aufnahme zu groß.':e.message}):next(e));return r;
}
module.exports={initVoice,voiceRouter,wavDuration};
