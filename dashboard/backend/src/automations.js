const express=require('express');
const {accessibleBuilding}=require('./collaboration');
const notify=(db,user,kind,title,building)=>db.query('INSERT INTO app_notifications(user_id,kind,title,building_id) VALUES($1,$2,$3,$4)',[user,kind,title.slice(0,200),building]);
const {haRoomClimate}=require('./ha-import');
// Automationen in normaler Sprache: „Wenn die Luftfeuchte im Bad über 60 % steigt, sag mir Bescheid.“
// Regeln gehören einer Person und einem Gebäude. Sie melden sich einmal beim Überschreiten und erst
// wieder, nachdem der Wert zurück im Normalbereich war (keine Dauerbenachrichtigung).
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const idOK=v=>/^[1-9]\d{0,9}$/.test(String(v))&&Number(v)<=2147483647;
const METRICS={temperature:{label:'Temperatur',unit:'°C',min:-30,max:60},humidity:{label:'Luftfeuchte',unit:'%',min:0,max:100},co2:{label:'CO₂',unit:'ppm',min:300,max:5000}};
const MAX_RULES=30,FRESH_MS=2*3600000;
const norm=s=>String(s||'').toLocaleLowerCase('de').normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss');

/** Deterministischer Parser für einfache deutsche Sätze. Gibt {metric,op,threshold,room_id} oder {error}. */
function parseRule(text,rooms=[]){
 const t=norm(text);if(!t.trim())return {error:'Bitte beschreibe die Regel, z. B. „Wenn die Luftfeuchte im Bad über 60 % steigt“.'};
 let metric=null;
 if(/co2|co₂|kohlendioxid|luftqualitat|ppm|lueften|luften/.test(t))metric='co2';
 else if(/feucht|humid|schimmel/.test(t))metric='humidity';
 else if(/temp|grad|°c|warm|kalt|heiss|kuhl|hitze|frost/.test(t))metric='temperature';
 if(!metric)return {error:'Ich erkenne nur Temperatur, Luftfeuchte oder CO₂.'};
 const plain=t.replace(/co2|co₂/g,'co '),num=plain.match(/(-?\d+(?:[.,]\d+)?)/),at=num?num.index:t.length;
 const near=re=>{let best=Infinity;for(const m of plain.matchAll(re))best=Math.min(best,Math.abs(m.index-at));return best;};
 const up=near(/(uber|ueber|mehr als|groesser|grosser|hoher|hoeher|oberhalb|steigt|zu warm|zu heiss|zu feucht|zu hoch|schimmel|>)/g),down=near(/(unter|weniger als|kleiner|niedriger|unterhalb|fallt|faellt|sinkt|zu kalt|zu trocken|zu niedrig|frost|<)/g);
 let op=up===Infinity&&down===Infinity?null:up<=down?'above':'below';
 let threshold=num?Number(num[1].replace(',','.')):null;
 if(threshold===null){threshold=metric==='humidity'?(op==='below'?30:65):metric==='co2'?1200:(op==='below'?16:26);}
 if(!op)op='above';
 const m=METRICS[metric];if(!Number.isFinite(threshold)||threshold<m.min||threshold>m.max)return {error:`${m.label}-Grenze muss zwischen ${m.min} und ${m.max} ${m.unit} liegen.`};
 // Raum: längster Raumname, der im Satz vorkommt.
 let room=null;
 for(const r of rooms){const n=norm(r.name).trim();if(n.length>=2&&t.includes(n)&&(!room||n.length>norm(room.name).length))room=r;}
 return {metric,op,threshold,room_id:room?.id||null,room:room?.name||null};
}
const describe=r=>`${METRICS[r.metric].label}${r.room?' im Raum '+r.room:' in irgendeinem Raum'} ${r.op==='above'?'über':'unter'} ${String(r.threshold).replace('.',',')} ${METRICS[r.metric].unit}`;

async function initAutomations(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_automations(id SERIAL PRIMARY KEY,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,text TEXT NOT NULL,metric TEXT NOT NULL,op TEXT NOT NULL,threshold DOUBLE PRECISION NOT NULL,room_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,triggered BOOLEAN NOT NULL DEFAULT false,last_fired_at TIMESTAMPTZ,last_value DOUBLE PRECISION,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query('CREATE INDEX IF NOT EXISTS app_automations_building ON app_automations(building_id) WHERE enabled');
}
async function rooms(db,building){
 return (await db.query(`SELECT id,COALESCE(data->>'name',data->>'room_code','Raum') AS name FROM app_twin_records WHERE user_id=$1 AND entity='Room' AND data->>'building_id'=$2 AND data->>'source' IS DISTINCT FROM 'demo' ORDER BY id LIMIT 500`,[building.user_id,String(building.id)])).rows;
}
/** Neueste echte Messwerte je Raum und Messgröße (Home Assistant und ESP32/Twin-Sensoren). */
async function currentValues(db,building){
 const out=[];
 for(const r of await haRoomClimate(db,building.id))for(const v of r.values)out.push({room_id:r.room_id,room:r.room,metric:v.metric,value:v.value,measured_at:v.measured_at});
 const sensors=(await db.query(`SELECT id,data->>'metric' AS metric,data->>'room_id' AS room_id FROM app_twin_records WHERE user_id=$1 AND entity='Sensor' AND data->>'building_id'=$2 AND data->>'source'='real' AND COALESCE(data->>'room_id','')<>'' LIMIT 100`,[building.user_id,String(building.id)])).rows;
 for(const s of sensors){
  if(!METRICS[s.metric])continue;
  const m=(await db.query("SELECT data FROM app_twin_records WHERE user_id=$1 AND entity='Measurement' AND data->>'sensor_id'=$2 ORDER BY created_at DESC,id DESC LIMIT 1",[building.user_id,s.id])).rows[0]?.data;
  if(m&&typeof m.value==='number'&&Date.parse(m.measured_at))out.push({room_id:s.room_id,room:null,metric:s.metric,value:m.value,measured_at:new Date(m.measured_at).toISOString()});
 }
 return out;
}
/** Regeln eines Gebäudes prüfen; Fehler hier dürfen das Speichern von Messwerten nie stören. */
async function evaluateAutomations(db,buildingID,now=Date.now()){
 try{
  const rules=(await db.query('SELECT * FROM app_automations WHERE building_id=$1 AND enabled',[buildingID])).rows;if(!rules.length)return 0;
  const building=(await db.query('SELECT id,user_id,name FROM app_buildings WHERE id=$1',[buildingID])).rows[0];if(!building)return 0;
  const values=(await currentValues(db,building)).filter(v=>now-Date.parse(v.measured_at)<=FRESH_MS);
  const names=new Map((await rooms(db,building)).map(r=>[r.id,r.name]));
  let fired=0;
  for(const rule of rules){
   const relevant=values.filter(v=>v.metric===rule.metric&&(!rule.room_id||v.room_id===rule.room_id));if(!relevant.length)continue;
   const hit=relevant.find(v=>rule.op==='above'?v.value>rule.threshold:v.value<rule.threshold);
   if(hit&&!rule.triggered){
    // Nur noch Mitglieder benachrichtigen, die das Gebäude weiterhin sehen dürfen.
    if(await accessibleBuilding(db,buildingID,rule.user_id)){
     const m=METRICS[rule.metric],room=names.get(hit.room_id)||hit.room||'Raum';
     await notify(db,rule.user_id,'automation',`${room}: ${m.label} ${hit.value.toLocaleString('de-DE',{maximumFractionDigits:1})} ${m.unit} (${rule.op==='above'?'über':'unter'} ${String(rule.threshold).replace('.',',')} ${m.unit})`,buildingID);fired++;
    }
    await db.query('UPDATE app_automations SET triggered=true,last_fired_at=now(),last_value=$2 WHERE id=$1',[rule.id,hit.value]);
   }else if(!hit&&rule.triggered){await db.query('UPDATE app_automations SET triggered=false,last_value=$2 WHERE id=$1',[rule.id,relevant[0].value]);}
  }
  return fired;
 }catch(e){if(process.env.AUTOMATION_DEBUG)console.error(e);return 0;}
}
const view=(r,names)=>({id:r.id,text:r.text,metric:r.metric,op:r.op,threshold:r.threshold,room_id:r.room_id,room:r.room_id?names.get(r.room_id)||'Raum':null,enabled:r.enabled,triggered:r.triggered,last_fired_at:r.last_fired_at,description:describe({...r,room:r.room_id?names.get(r.room_id)||'Raum':null})});
function automationsRouter(db,requireAccount){
 const r=express.Router(),base='/buildings/:autoBuilding/automations';
 r.use(base,requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');if(!idOK(req.params.autoBuilding))return res.status(400).json({error:'Ungültiges Gebäude.'});next();});
 r.use('/automations',requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 const building=async(req)=>{const b=await accessibleBuilding(db,req.params.autoBuilding,req.account.id);if(!b)fail('Gebäude nicht gefunden.',404);return b;};
 r.get(base,wrap(async(req,res)=>{const b=await building(req);const names=new Map((await rooms(db,b)).map(x=>[x.id,x.name]));
  const rows=(await db.query('SELECT * FROM app_automations WHERE building_id=$1 AND user_id=$2 ORDER BY id',[b.id,req.account.id])).rows;
  res.json({rules:rows.map(x=>view(x,names)),limit:MAX_RULES,examples:['Wenn die Luftfeuchte im Bad über 60 % steigt','Wenn es im Wohnzimmer unter 18 Grad hat','Wenn CO₂ im Büro über 1200 ppm liegt']});}));
 // Vorschau: Satz verstehen, ohne zu speichern.
 r.post(base+'/parse',wrap(async(req,res)=>{const b=await building(req);const text=typeof req.body?.text==='string'?req.body.text.trim():'';if(!text||text.length>300)fail('Bitte einen Satz mit 1 bis 300 Zeichen.');
  const p=parseRule(text,await rooms(db,b));if(p.error)fail(p.error,422);res.json({...p,description:describe(p)});}));
 r.post(base,wrap(async(req,res)=>{
  const b=await building(req);const text=typeof req.body?.text==='string'?req.body.text.trim():'';
  if(Object.keys(req.body||{}).some(k=>k!=='text')||!text||text.length>300)fail('Bitte einen Satz mit 1 bis 300 Zeichen.');
  const list=await rooms(db,b);const p=parseRule(text,list);if(p.error)fail(p.error,422);
  if(Number((await db.query('SELECT COUNT(*) n FROM app_automations WHERE user_id=$1',[req.account.id])).rows[0].n)>=MAX_RULES)fail('Höchstens 30 Regeln pro Konto.',429);
  const row=(await db.query('INSERT INTO app_automations(building_id,user_id,text,metric,op,threshold,room_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[b.id,req.account.id,text,p.metric,p.op,p.threshold,p.room_id])).rows[0];
  await evaluateAutomations(db,b.id);
  const fresh=(await db.query('SELECT * FROM app_automations WHERE id=$1',[row.id])).rows[0];
  res.status(201).json(view(fresh,new Map(list.map(x=>[x.id,x.name]))));
 }));
 const own=async(req)=>{if(!idOK(req.params.rule))fail('Ungültige Regel.');const row=(await db.query('SELECT * FROM app_automations WHERE id=$1 AND user_id=$2',[req.params.rule,req.account.id])).rows[0];if(!row)fail('Regel nicht gefunden.',404);return row;};
 r.patch('/automations/:rule',wrap(async(req,res)=>{const row=await own(req);if(Object.keys(req.body||{}).some(k=>k!=='enabled')||typeof req.body.enabled!=='boolean')fail('Nur ein- oder ausschalten.');
  await db.query('UPDATE app_automations SET enabled=$2,triggered=false WHERE id=$1',[row.id,req.body.enabled]);res.json({ok:true,enabled:req.body.enabled});}));
 r.delete('/automations/:rule',wrap(async(req,res)=>{const row=await own(req);await db.query('DELETE FROM app_automations WHERE id=$1',[row.id]);res.json({ok:true});}));
 r.use((e,req,res,next)=>e.status?res.status(e.status).json({error:e.message}):next(e));
 return r;
}
module.exports={initAutomations,automationsRouter,evaluateAutomations,parseRule,describe};
