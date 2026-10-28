const express=require('express');
const {fileType}=require('./documents');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
async function initProfile(db){
 await db.query(`CREATE TABLE IF NOT EXISTS app_avatars (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL, content BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}
function profileRouter(db,requireAccount){
 const router=express.Router();
 router.get('/profile/avatar',requireAccount,wrap(async(req,res)=>{
  const avatar=(await db.query('SELECT mime_type,content FROM app_avatars WHERE user_id=$1',[req.account.id])).rows[0];
  if(!avatar)return res.status(404).json({error:'Noch kein Profilbild gespeichert.'});
  res.set({'Content-Type':avatar.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  res.send(Buffer.from(avatar.content));
 }));
 router.put('/profile/avatar',requireAccount,express.raw({type:'application/octet-stream',limit:'2mb'}),wrap(async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Bitte ein Profilbild auswählen.'});
  const mime=[['profile.jpg','image/jpeg'],['profile.png','image/png'],['profile.webp','image/webp']].find(([name])=>fileType(req.body,name));
  if(!mime)return res.status(415).json({error:'Profilbilder müssen JPG, PNG oder WebP sein.'});
  await db.query(`INSERT INTO app_avatars(user_id,mime_type,content) VALUES($1,$2,$3)
   ON CONFLICT(user_id) DO UPDATE SET mime_type=EXCLUDED.mime_type,content=EXCLUDED.content,updated_at=now()`,[req.account.id,mime[1],req.body]);
  res.json({ok:true});
 }));
 router.use((error,req,res,next)=>error.type==='entity.too.large'?res.status(413).json({error:'Das Profilbild darf maximal 2 MB groß sein.'}):next(error));
 return router;
}
module.exports={initProfile,profileRouter};
