const express=require('express');
const {accessibleBuilding,notifyBuilding}=require('./collaboration');
const {buildingAccess,can}=require('./team-permissions');
// Wartung und Lebenszyklus je Gebäude: wiederkehrende Prüfungen (Heizung, Rauchmelder, Dach …),
// letzte Erledigung, nächste Fälligkeit und Garantie. Mitglieder dürfen anlegen und als erledigt
// markieren; ändern und löschen dürfen Besitzer und wer den Eintrag angelegt hat.
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const idOK=v=>/^[1-9]\d{0,9}$/.test(String(v))&&Number(v)<=2147483647;
const CATEGORIES=['heizung','lueftung','wasser','elektro','dach','fenster','brandschutz','aufzug','garten','sonstiges'];
const MAX_ITEMS=200;
const TEMPLATES=[
 {title:'Heizungswartung',category:'heizung',interval_months:12,notes:'Brenner, Abgaswerte und Sicherheitseinrichtungen durch den Fachbetrieb prüfen lassen.'},
 {title:'Rauchmelder prüfen',category:'brandschutz',interval_months:12,notes:'Funktionstest und Batterie; in vielen Bundesländern jährlich vorgeschrieben.'},
 {title:'Dachrinnen reinigen',category:'dach',interval_months:12,notes:'Laub und Schmutz entfernen, Fallrohre prüfen.'},
 {title:'Schornsteinfeger',category:'heizung',interval_months:12,notes:'Feuerstättenschau und Messung nach Bescheid.'},
 {title:'Lüftungsfilter wechseln',category:'lueftung',interval_months:6,notes:'Filter der Lüftungsanlage tauschen.'},
 {title:'Fensterdichtungen pflegen',category:'fenster',interval_months:24,notes:'Dichtungen reinigen und pflegen, Beschläge ölen.'},
 {title:'E-Check Elektroanlage',category:'elektro',interval_months:48,notes:'Prüfung der elektrischen Anlage durch eine Elektrofachkraft.'},
 {title:'Trinkwasser / Enthärter prüfen',category:'wasser',interval_months:12,notes:'Filter spülen, Enthärter und Druckminderer kontrollieren.'},
];
const day=v=>v instanceof Date?v.toISOString().slice(0,10):v?String(v).slice(0,10):null;
const dateOK=v=>v===null||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&v>='1900-01-01'&&v<='2200-12-31');
function addMonths(date,months){const d=new Date(date+'T00:00:00Z');const target=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(d.getUTCDate(),last));return target.toISOString().slice(0,10);}
const today=()=>new Date().toISOString().slice(0,10);
function status(item,now=today()){
 if(!item.next_due)return 'ohne_termin';
 if(item.next_due<now)return 'ueberfaellig';
 return item.next_due<=addMonths(now,1)?'bald':'ok';
}
const view=(r,user,owner)=>{const item={id:r.id,building_id:r.building_id,title:r.title,category:r.category,interval_months:r.interval_months,last_done:day(r.last_done),next_due:day(r.next_due),warranty_until:day(r.warranty_until),notes:r.notes,revision:r.revision,created_at:r.created_at,updated_at:r.updated_at};return {...item,status:status(item),can_edit:r.created_by===user||owner};};
async function initMaintenance(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_maintenance(id SERIAL PRIMARY KEY,building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'sonstiges',interval_months INTEGER,last_done DATE,next_due DATE,warranty_until DATE,notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL,revision INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query('CREATE INDEX IF NOT EXISTS app_maintenance_building ON app_maintenance(building_id,next_due)');
}
function parse(body,partial=false){
 const allowed=['title','category','interval_months','last_done','next_due','warranty_until','notes','revision'];
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))fail('Ungültiger Wartungseintrag.');
 const out={};
 if(body.title!==undefined||!partial){const t=typeof body.title==='string'?body.title.replace(/[\x00-\x1f\x7f]/g,' ').trim():'';if(!t||t.length>120)fail('Titel mit 1 bis 120 Zeichen angeben.');out.title=t;}
 if(body.category!==undefined){if(!CATEGORIES.includes(body.category))fail('Unbekannte Kategorie.');out.category=body.category;}
 if(body.interval_months!==undefined){if(body.interval_months!==null&&!(Number.isInteger(body.interval_months)&&body.interval_months>=1&&body.interval_months<=240))fail('Intervall 1 bis 240 Monate oder leer.');out.interval_months=body.interval_months;}
 for(const k of ['last_done','next_due','warranty_until'])if(body[k]!==undefined){if(!dateOK(body[k]))fail('Datum im Format JJJJ-MM-TT angeben.');out[k]=body[k];}
 if(body.notes!==undefined){if(typeof body.notes!=='string'||body.notes.length>2000)fail('Notiz höchstens 2000 Zeichen.');out.notes=body.notes.trim();}
 return out;
}
async function maintenanceList(db,building){
 return (await db.query('SELECT * FROM app_maintenance WHERE building_id=$1 ORDER BY next_due NULLS LAST,title,id LIMIT $2',[building,MAX_ITEMS])).rows;
}
function maintenanceRouter(db,requireAccount){
 const r=express.Router(),base='/buildings/:maintBuilding/maintenance';
 r.use(base,requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');if(!idOK(req.params.maintBuilding))return res.status(400).json({error:'Ungültiges Gebäude.'});next();});
 r.use('/maintenance',requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 const building=async(id,user)=>{const b=await accessibleBuilding(db,id,user);if(!b)fail('Gebäude nicht gefunden.',404);return b;};
 const item=async(req)=>{
  if(!idOK(req.params.maintItem))fail('Ungültiger Eintrag.');
  const row=(await db.query('SELECT * FROM app_maintenance WHERE id=$1',[req.params.maintItem])).rows[0];if(!row)fail('Eintrag nicht gefunden.',404);
  const b=await accessibleBuilding(db,row.building_id,req.account.id);if(!b)fail('Eintrag nicht gefunden.',404);
  const access=await buildingAccess(db,b.id,req.account.id);if(!can(access,'maintenance','edit'))fail('Du darfst Wartungspläne in diesem Gebäude nicht ändern.',403);
  return {row,b};
 };
 r.get('/maintenance/templates',(req,res)=>res.json({templates:TEMPLATES,categories:CATEGORIES}));
 r.get(base,wrap(async(req,res)=>{const b=await building(req.params.maintBuilding,req.account.id);const owner=b.user_id===req.account.id;
  const items=(await maintenanceList(db,b.id)).map(x=>view(x,req.account.id,owner));
  res.json({items,summary:{overdue:items.filter(i=>i.status==='ueberfaellig').length,soon:items.filter(i=>i.status==='bald').length,total:items.length},limit:MAX_ITEMS});}));
 r.post(base,wrap(async(req,res)=>{
  const b=await building(req.params.maintBuilding,req.account.id);const v=parse(req.body);
  if(Number((await db.query('SELECT COUNT(*) n FROM app_maintenance WHERE building_id=$1',[b.id])).rows[0].n)>=MAX_ITEMS)fail('Höchstens 200 Wartungseinträge pro Gebäude.',429);
  if(v.next_due===undefined&&v.interval_months&&v.last_done)v.next_due=addMonths(v.last_done,v.interval_months);
  const row=(await db.query(`INSERT INTO app_maintenance(building_id,title,category,interval_months,last_done,next_due,warranty_until,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
   [b.id,v.title,v.category||'sonstiges',v.interval_months??null,v.last_done??null,v.next_due??null,v.warranty_until??null,v.notes||'',req.account.id])).rows[0];
  res.status(201).json(view(row,req.account.id,b.user_id===req.account.id));
 }));
 r.patch('/maintenance/:maintItem',wrap(async(req,res)=>{
  const {row,b}=await item(req);if(row.created_by!==req.account.id&&b.user_id!==req.account.id)fail('Nur Besitzer oder Ersteller können den Eintrag ändern.',403);
  const v=parse(req.body,true);if(!Number.isInteger(req.body.revision)||req.body.revision!==row.revision)fail('Der Eintrag wurde inzwischen geändert. Bitte neu laden.',409);
  const keys=Object.keys(v);if(!keys.length)fail('Keine Änderung.');
  const sets=keys.map((k,i)=>`${k}=$${i+2}`).join(',');
  const updated=(await db.query(`UPDATE app_maintenance SET ${sets},revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *`,[row.id,...keys.map(k=>v[k])])).rows[0];
  res.json(view(updated,req.account.id,b.user_id===req.account.id));
 }));
 // Erledigt: letzte Erledigung = Datum (Standard heute), nächste Fälligkeit = + Intervall.
 r.post('/maintenance/:maintItem/done',wrap(async(req,res)=>{
  const {row,b}=await item(req);const body=req.body||{};
  if(Object.keys(body).some(k=>!['date','revision'].includes(k))||!Number.isInteger(body.revision))fail('Bitte Datum und aktuelle Revision senden.');
  if(body.revision!==row.revision)fail('Der Eintrag wurde inzwischen geändert. Bitte neu laden.',409);
  const date=body.date??today();if(!dateOK(date)||date>addMonths(today(),1))fail('Ungültiges Erledigungsdatum.');
  const next=row.interval_months?addMonths(date,row.interval_months):null;
  const updated=(await db.query('UPDATE app_maintenance SET last_done=$2,next_due=$3,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[row.id,date,next])).rows[0];
  await notifyBuilding(db,b.id,req.account.id,'maintenance_done','Wartung erledigt: '+row.title).catch(()=>{});
  res.json(view(updated,req.account.id,b.user_id===req.account.id));
 }));
 r.delete('/maintenance/:maintItem',wrap(async(req,res)=>{
  const {row,b}=await item(req);if(row.created_by!==req.account.id&&b.user_id!==req.account.id)fail('Nur Besitzer oder Ersteller können den Eintrag löschen.',403);
  await db.query('DELETE FROM app_maintenance WHERE id=$1',[row.id]);res.json({ok:true});
 }));
 r.use((e,req,res,next)=>e.status?res.status(e.status).json({error:e.message}):next(e));
 return r;
}
module.exports={initMaintenance,maintenanceRouter,maintenanceList,addMonths,status,TEMPLATES,CATEGORIES};

