const express=require('express');
const {accessibleBuilding}=require('./collaboration');
const {validateCommand}=require('./ifc-command');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const category={IFCWALL:'walls',IFCWALLSTANDARDCASE:'walls',IFCWALLELEMENTEDCASE:'walls',IFCDOOR:'doors',IFCWINDOW:'windows',IFCROOF:'roofs',IFCSLAB:'slabs',IFCSPACE:'rooms'};
// Read only entity headers outside quoted STEP strings/comments. Geometry remains on the client.
function modelIndex(content){
 const clean=Buffer.from(content).toString('utf8').replace(/'(?:''|[^'])*'|\/\*[\s\S]*?\*\//g,' ');
 const entities=[];const counts={};
 for(const m of clean.matchAll(/#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(/g)){
  const id=Number(m[1]);if(!Number.isSafeInteger(id)||id<1)continue;
  const type=category[m[2]]||'other';entities.push({id,type});counts[type]=(counts[type]||0)+1;
 }
 return {entities,counts};
}
async function initModelState(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_model_views(document_id INTEGER PRIMARY KEY REFERENCES app_documents(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0,state JSONB NOT NULL DEFAULT '{"hidden":[],"colors":{},"lights":[]}',updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}
const empty=()=>({hidden:[],colors:{},lights:[]});
function mutate(state,operation,index){
 const next=JSON.parse(JSON.stringify(state));const ids=operation.ids;
 const valid=new Map(index.entities.map(e=>[e.id,e.type]));
 if(!Array.isArray(ids)||ids.length>10000||new Set(ids).size!==ids.length||ids.some(id=>!Number.isInteger(id)||!valid.has(id)))throw Error('Ungültige Bauteilauswahl.');
 const action=operation.action;if(!['hide','show','color','reset-colors','reset','light'].includes(action))throw Error('Ungültige Modellaktion.');
 if(action==='color'&&(typeof operation.color!=='string'||!/^#[0-9a-f]{6}$/i.test(operation.color)))throw Error('Ungültige Farbe.');
 const hidden=new Set(next.hidden),lights=new Set(next.lights);
 for(const id of ids){
  if(action==='hide')hidden.add(id);
  if(action==='show'||action==='reset')hidden.delete(id);
  if(action==='color')next.colors[id]=operation.color.toLowerCase();
  if(action==='reset-colors'||action==='reset')delete next.colors[id];
  if(action==='light'){
   if(valid.get(id)!=='rooms'||typeof operation.on!=='boolean')throw Error('Ungültiger Raumlichtzustand.');
   if(operation.on)lights.add(id);else lights.delete(id);
  }
 }
 next.hidden=[...hidden];next.lights=[...lights];
 if(next.hidden.length>10000||Object.keys(next.colors).length>10000||next.lights.length>10000)throw Error('Maximal 10000 geänderte Bauteile pro Modell.');
 return next;
}
function modelStateRouter(db,requireAccount){
 const r=express.Router();r.use('/documents/:modelID/model-state',requireAccount);r.use('/documents/:modelID/model-command',requireAccount);r.use('/documents/:modelID/model-index',requireAccount);
 r.param('modelID',(req,res,next,id)=>/^[1-9]\d*$/.test(id)&&Number(id)<=2147483647?next():res.status(400).json({error:'Ungültige Modell-ID.'}));
 async function target(connection,req,lock=false,content=false){
  const doc=(await connection.query(`SELECT id,building_id${content?',content':''} FROM app_documents WHERE id=$1 AND mime_type='application/x-step'`,[req.params.modelID])).rows[0];
  if(!doc||!await accessibleBuilding(connection,doc.building_id,req.account.id,lock))return null;
  return doc;
 }
 r.get('/documents/:modelID/model-index',wrap(async(req,res)=>{
  const doc=await target(db,req,false,true);if(!doc)return res.status(404).json({error:'Modell nicht gefunden.'});
  const index=modelIndex(doc.content);res.set('Cache-Control','private, no-store').json({document_id:doc.id,counts:index.counts,limitations:'IFC-Typen aus der Originaldatei; keine Planinterpretation oder geometrische Prüfung.'});
 }));
 r.get('/documents/:modelID/model-state',wrap(async(req,res)=>{
  const doc=await target(db,req);if(!doc)return res.status(404).json({error:'Modell nicht gefunden.'});
  const row=(await db.query('SELECT revision,state FROM app_model_views WHERE document_id=$1',[doc.id])).rows[0];
  res.set('Cache-Control','private, no-store').json(row||{revision:0,state:empty()});
 }));
 async function change(req,res,commandMode){
  const c=await db.connect();try{
   await c.query('BEGIN');const doc=await target(c,req,true,true);
   if(!doc){await c.query('ROLLBACK');return res.status(404).json({error:'Modell nicht gefunden.'});}
   const index=modelIndex(doc.content);let operation=req.body?.operation,description;
   if(commandMode){
    let command;try{command=validateCommand(req.body?.command);}catch{throw Error('Ungültiger Modellbefehl.');}
    if(command.target==='selected')throw Error('Bitte das Bauteil direkt im Modell auswählen.');
    const ids=index.entities.filter(e=>command.target==='all'&&['walls','doors','windows','roofs','slabs'].includes(e.type)||e.type===command.target).map(e=>e.id);
    if(!ids.length)throw Error('Keine passenden Bauteile im IFC gefunden.');
    operation={action:command.action,ids,color:command.color};
    const labels={walls:'Wände',doors:'Türen',windows:'Fenster',roofs:'Dächer',slabs:'Decken/Platten',all:'Bauteile'};
    description=command.action==='reset'?'Alle Bauteile anzeigen und Originalfarben wiederherstellen':`${ids.length} ${labels[command.target]} ${command.action==='hide'?'ausblenden':'mit '+command.color+' einfärben'}`;
    if(req.body.confirm!==true){await c.query('ROLLBACK');return res.json({count:ids.length,description});}
   }
   await c.query('INSERT INTO app_model_views(document_id) VALUES($1) ON CONFLICT DO NOTHING',[doc.id]);
   const old=(await c.query('SELECT revision,state FROM app_model_views WHERE document_id=$1 FOR UPDATE',[doc.id])).rows[0];
   if(!Number.isInteger(req.body?.revision)||old.revision!==req.body.revision){await c.query('ROLLBACK');return res.status(409).json({error:'Das Modell wurde inzwischen geändert. Aktuellen Stand laden und erneut prüfen.'});}
   if(commandMode&&operation.action==='reset')operation.ids=[...new Set([...operation.ids,...old.state.hidden,...Object.keys(old.state.colors).map(Number)])];
   const state=mutate(old.state,operation||{},index);
   const row=(await c.query('UPDATE app_model_views SET state=$2,revision=revision+1,updated_at=now() WHERE document_id=$1 RETURNING revision,state',[doc.id,JSON.stringify(state)])).rows[0];
   await c.query('COMMIT');res.json({...row,...(description?{description}:{})});
  }catch(e){await c.query('ROLLBACK');if(e.code)throw e;res.status(400).json({error:e.message});}finally{c.release();}
 }
 r.post('/documents/:modelID/model-state',wrap((req,res)=>change(req,res,false)));
 r.post('/documents/:modelID/model-command',wrap((req,res)=>change(req,res,true)));
 return r;
}
module.exports={initModelState,modelStateRouter,modelIndex,mutate};
