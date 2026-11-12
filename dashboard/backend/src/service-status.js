const express=require('express');
const {aiEnabled}=require('./ai-preferences');
const {unlimitedConversations}=require('./conversation-limits');
// No external requests: configuration is not evidence of provider availability.
function serviceStatusRouter(db,requireAccount){
 const router=express.Router();
 router.get('/profile/service-status',requireAccount,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  try{
   const user=req.account.id;
   const [voice,questions,jobs,enabled]=await Promise.all([
    db.query("SELECT count(*) FILTER(WHERE kind='live') live,count(*) FILTER(WHERE kind='stt') stt,count(*) FILTER(WHERE kind='tts') tts FROM app_voice_usage WHERE user_id=$1 AND created_at>now()-interval '24 hours'",[user]),
    db.query("SELECT count(*) n FROM app_ai_requests WHERE user_id=$1 AND created_at>now()-interval '24 hours'",[user]),
    db.query("SELECT count(*) FILTER(WHERE status='queued') queued,count(*) FILTER(WHERE status='running') running,count(*) FILTER(WHERE status='ready') ready,count(*) FILTER(WHERE status='failed' AND updated_at>now()-interval '24 hours') failed FROM app_plan_jobs WHERE user_id=$1",[user]),
    aiEnabled(db,user)
   ]);
   const unlimited=unlimitedConversations(user),v=voice.rows[0],j=jobs.rows[0];
   const quota=(used,limit)=>({used:Number(used),limit:unlimited?null:limit});
   res.json({checked_at:new Date().toISOString(),server:'reachable',account_ai_enabled:enabled,
    configuration:{ai:process.env.GEMINI_ENABLED==='true',voice:process.env.ELEVENLABS_ENABLED==='true',generation:process.env.PLAN_CONVERSION_ENABLED==='true'},
    usage_24h:{questions:quota(questions.rows[0].n,20),live:quota(v.live,10),recognition:quota(v.stt,20),playback:quota(v.tts,20)},
    generation:{queued:Number(j.queued),running:Number(j.running),ready:Number(j.ready),failed_24h:Number(j.failed)},
    notice:'Einrichtung ist kein Erreichbarkeitstest der Anbieter. Anbieter- und Projektlimits sowie gleichzeitige Gespräche können die Nutzung weiterhin begrenzen.'});
  }catch(error){next(error);}
 });return router;
}
module.exports={serviceStatusRouter};
