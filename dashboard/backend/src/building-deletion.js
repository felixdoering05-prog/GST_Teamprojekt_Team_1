const express=require('express');
function buildingDeletionRouter(db,requireAccount){
 const r=express.Router();
 r.delete('/buildings/:buildingId',requireAccount,async(req,res,next)=>{
  let c;
  try{
   const id=Number(req.params.buildingId);
   if(!/^[1-9]\d{0,9}$/.test(req.params.buildingId)||!Number.isSafeInteger(id)||id>2147483647||req.body?.confirmation!=='DELETE'||Object.keys(req.body||{}).some(k=>k!=='confirmation'))return res.status(400).json({error:'Gebäudelöschung bitte ausdrücklich bestätigen.'});
   c=await db.connect();await c.query('BEGIN');
   await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id]);
   const owned=await c.query('SELECT id FROM app_buildings WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,req.account.id]);
   if(!owned.rows.length){await c.query('ROLLBACK');return res.status(404).json({error:'Gebäude nicht gefunden oder keine Löschberechtigung.'});}
   // Clear content caches; keep non-content usage records so deletion cannot reset quotas.
   await c.query('UPDATE app_ai_requests SET answer=NULL WHERE building_id=$1',[id]);
   await c.query("DELETE FROM app_plan_deleted_usage WHERE created_at<now()-interval '24 hours'");
   await c.query("INSERT INTO app_plan_deleted_usage(job_id,user_id,created_at) SELECT id,user_id,created_at FROM app_plan_jobs WHERE building_id=$1 AND created_at>now()-interval '24 hours' ON CONFLICT(job_id) DO NOTHING",[id]);
   await c.query('DELETE FROM app_buildings WHERE id=$1 AND user_id=$2',[id,req.account.id]);
   await c.query('COMMIT');res.json({ok:true});
  }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c?.release();}
 });
 return r;
}
module.exports={buildingDeletionRouter};
