const express=require('express');
function accountDeletionRouter(db,requireAccount,verifyPassword){
 const r=express.Router(),attempts=new Map();let active=0;
 r.delete('/auth/account',requireAccount,async(req,res,next)=>{
  const body=req.body||{};
  if(Object.keys(body).some(k=>!['password','confirmation'].includes(k))||body.confirmation!=='DELETE'||typeof body.password!=='string'||!body.password||Buffer.byteLength(body.password)>1024)return res.status(400).json({error:'Kontolöschung mit Passwort ausdrücklich bestätigen.'});
  const now=Date.now();for(const [id,v]of attempts)if(v.until<=now)attempts.delete(id);
  const state=attempts.get(req.account.id)||{count:0,until:now+15*60*1000};
  if(active>=2||state.count>=5||attempts.size>=10000&&!attempts.has(req.account.id))return res.status(429).json({error:'Bitte die Kontolöschung später erneut versuchen.'});
  state.count++;attempts.set(req.account.id,state);active++;let c;
  try{
   c=await db.connect();await c.query('BEGIN');
   const user=(await c.query('SELECT id,password_hash FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id])).rows[0];
   if(!user||!await verifyPassword(body.password,user.password_hash)){await c.query('ROLLBACK');return res.status(403).json({error:'Passwort ist nicht richtig. Konto wurde nicht gelöscht.'});}
   if(req.aborted||res.destroyed){await c.query('ROLLBACK');return;}
   // Remove message previews also from other recipients before cascading messages.
   await c.query('DELETE FROM app_notifications WHERE message_id IN (SELECT id FROM app_messages WHERE user_id=$1)',[user.id]);
   await c.query('DELETE FROM app_users WHERE id=$1',[user.id]);
   await c.query('COMMIT');res.json({ok:true});
  }catch(e){if(c)await c.query('ROLLBACK');next(e);}finally{c?.release();active--;}
 });return r;
}
module.exports={accountDeletionRouter};
