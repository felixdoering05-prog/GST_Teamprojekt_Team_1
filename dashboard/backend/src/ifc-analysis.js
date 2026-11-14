const express=require('express');
const {accessSQL}=require('./collaboration');
// LiDAR room scans are produced by the same ifc-worker and are wired in here with the IFC analysis.
const {initRoomScan,roomScanRouter}=require('./room-scan');
async function initIFCAnalysis(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_ifc_analysis(document_id INTEGER PRIMARY KEY REFERENCES app_documents(id) ON DELETE CASCADE,status TEXT NOT NULL CHECK(status IN ('running','ready','failed')),report JSONB,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await initRoomScan(db);
}
function ifcAnalysisRouter(db,requireAccount){
 const r=express.Router();
 r.use(roomScanRouter(db,requireAccount));
 r.get('/documents/:analysisDocument/analysis',requireAccount,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  try{
   if(!/^[1-9]\d{0,9}$/.test(req.params.analysisDocument)||Number(req.params.analysisDocument)>2147483647)return res.status(400).json({error:'Ungültige Datei.'});
   const doc=(await db.query(`SELECT d.id,d.mime_type FROM app_documents d JOIN app_buildings b ON b.id=d.building_id WHERE d.id=$1 AND ${accessSQL}`,[req.params.analysisDocument,req.account.id])).rows[0];
   if(!doc)return res.status(404).json({error:'Datei nicht gefunden.'});
   if(doc.mime_type!=='application/x-step')return res.status(415).json({error:'Analyse für IFC-Modelle verfügbar.'});
   const result=(await db.query('SELECT status,report,updated_at FROM app_ifc_analysis WHERE document_id=$1',[doc.id])).rows[0];
   res.json(result||{status:'queued',report:null,updated_at:null});
  }catch(e){next(e);}
 });return r;
}
module.exports={initIFCAnalysis,ifcAnalysisRouter};
