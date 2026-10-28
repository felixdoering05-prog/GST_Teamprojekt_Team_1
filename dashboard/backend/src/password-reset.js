const express=require('express');
const {randomInt,randomBytes,createHash,createHmac,createCipheriv,createDecipheriv,timingSafeEqual}=require('node:crypto');
const {createResetMailer}=require('./reset-mail');
const GENERIC='Falls ein Konto mit dieser E-Mail existiert, erhältst du einen Code. Prüfe auch den Spam-Ordner. Ein neuer Code kann frühestens nach einer Minute angefordert werden.';
const INVALID='Der Code ist ungültig oder abgelaufen. Bitte einen neuen Code anfordern.';
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const emailOK=email=>email.length<=254&&/^\S+@\S+\.\S+$/.test(email);
const digest=(secret,email,code)=>createHmac('sha256',secret).update(email+'\0'+code).digest('hex');
function encrypt(secret,email,code) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);
 cipher.setAAD(Buffer.from(email));const data=Buffer.concat([cipher.update(code,'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
}
function decrypt(secret,email,value) {
 const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),bytes.subarray(0,12));
 cipher.setAAD(Buffer.from(email));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');
}
async function initPasswordResets(db) {
 await db.query(`CREATE TABLE IF NOT EXISTS app_password_resets (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL, encrypted_code TEXT, expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, requested_at TIMESTAMPTZ NOT NULL,
  request_window TIMESTAMPTZ NOT NULL, request_count INTEGER NOT NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL, sent_at TIMESTAMPTZ)`);
}
function passwordResetRouter(db,{passwordHash,throttle,mailer=createResetMailer(),now=()=>new Date()}={}) {
 const router=express.Router();
 router.get('/auth/password-reset/status',(req,res)=>res.set('Cache-Control','no-store').json({enabled:mailer.enabled}));
 router.use('/auth/password-reset',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!mailer.enabled)return res.status(503).json({error:'Der E-Mail-Versand ist noch nicht eingerichtet. Bitte beim Projektteam melden.'});next();
 });
 router.post('/auth/password-reset/request',throttle,wrap(async(req,res)=>{
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  if(!emailOK(email))return res.status(400).json({error:'Bitte eine gültige E-Mail-Adresse eingeben.'});
  const client=await db.connect();
  try {
   await client.query('BEGIN');const date=now();
   const user=(await client.query('SELECT id FROM app_users WHERE email=$1 FOR UPDATE',[email])).rows[0];
   if(user){
    const old=(await client.query('SELECT * FROM app_password_resets WHERE user_id=$1',[user.id])).rows[0];
    const sameWindow=old&&date-new Date(old.request_window)<3600000;
    if(!old||(date-new Date(old.requested_at)>=60000&&(!sameWindow||old.request_count<3))) {
     const code=String(randomInt(0,100000000)).padStart(8,'0'),expiry=new Date(date.getTime()+15*60000);
     await client.query(`INSERT INTO app_password_resets(user_id,code_hash,encrypted_code,expires_at,requested_at,request_window,request_count,next_attempt_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$5) ON CONFLICT(user_id) DO UPDATE SET
      code_hash=EXCLUDED.code_hash,encrypted_code=EXCLUDED.encrypted_code,expires_at=EXCLUDED.expires_at,attempts=0,
      requested_at=EXCLUDED.requested_at,request_window=EXCLUDED.request_window,request_count=EXCLUDED.request_count,
      delivery_attempts=0,next_attempt_at=EXCLUDED.next_attempt_at,sent_at=NULL`,
      [user.id,digest(mailer.secret,email,code),encrypt(mailer.secret,email,code),expiry,date,sameWindow?old.request_window:date,sameWindow?old.request_count+1:1]);
    }
   }
   await client.query('COMMIT');res.status(202).json({message:GENERIC});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }));
 router.post('/auth/password-reset/confirm',throttle,wrap(async(req,res)=>{
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  const code=typeof req.body?.code==='string'?req.body.code.replace(/\s/g,''):'';
  const password=req.body?.password;
  if(!emailOK(email)||!/^\d{8}$/.test(code))return res.status(400).json({error:INVALID});
  if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>1024)return res.status(400).json({error:'Das neue Passwort muss mindestens 12 Zeichen lang sein.'});
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   const user=(await client.query('SELECT id FROM app_users WHERE email=$1 FOR UPDATE',[email])).rows[0];
   const row=user?(await client.query('SELECT * FROM app_password_resets WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0]:null;
   const valid=row&&new Date(row.expires_at)>now()&&row.attempts<5&&timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(digest(mailer.secret,email,code),'hex'));
   if(!valid){if(row&&row.attempts<5)await client.query('UPDATE app_password_resets SET attempts=attempts+1 WHERE user_id=$1',[user.id]);await client.query('COMMIT');return res.status(400).json({error:INVALID});}
   const hash=await passwordHash(password);
   await client.query('UPDATE app_users SET password_hash=$1 WHERE id=$2',[hash,user.id]);
   await client.query('DELETE FROM app_sessions WHERE user_id=$1',[user.id]);
   await client.query('DELETE FROM app_password_resets WHERE user_id=$1',[user.id]);
   await client.query('COMMIT');res.json({ok:true,message:'Dein Passwort wurde geändert. Bitte auf allen Geräten neu anmelden.'});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }));return router;
}
// Durable outbox in the reset row. Codes are encrypted until SMTP accepts the mail.
// Claims are atomic; a crashed sender can retry the same code after one minute.
async function deliverResetMail(db,mailer=createResetMailer(),date=new Date()) {
 if(!mailer.enabled)return false;
 const candidate=(await db.query(`SELECT r.*,u.email FROM app_password_resets r JOIN app_users u ON u.id=r.user_id
  WHERE r.sent_at IS NULL AND r.encrypted_code IS NOT NULL AND r.delivery_attempts<3 AND r.expires_at>$1 AND r.next_attempt_at<=$1
  ORDER BY r.next_attempt_at LIMIT 1`,[date])).rows[0];
 if(!candidate)return false;
 const claimed=await db.query(`UPDATE app_password_resets SET delivery_attempts=delivery_attempts+1,next_attempt_at=$1
  WHERE user_id=$2 AND code_hash=$3 AND sent_at IS NULL AND delivery_attempts<3 AND next_attempt_at<=$4 RETURNING user_id`,
  [new Date(date.getTime()+60000),candidate.user_id,candidate.code_hash,date]);
 if(!claimed.rows.length)return false;
 try {
  const code=decrypt(mailer.secret,candidate.email,candidate.encrypted_code);
  await mailer.send({email:candidate.email,code});
  await db.query('UPDATE app_password_resets SET sent_at=$1,encrypted_code=NULL WHERE user_id=$2 AND code_hash=$3',[date,candidate.user_id,candidate.code_hash]);
 }catch(error){console.error('Password-reset delivery failed:',error.code||error.name);}
 return true;
}
function startResetMailWorker(db,mailer=createResetMailer()) {
 if(!mailer.enabled)return null;
 let running=false;
 const run=async()=>{if(running)return;running=true;try{await deliverResetMail(db,mailer);await db.query('DELETE FROM app_password_resets WHERE expires_at<now() AND request_window<now()-interval \'1 hour\'');}catch(error){console.error('Password-reset worker failed:',error.code||error.name);}finally{running=false;}};
 const timer=setInterval(run,2000);timer.unref();run();return timer;
}
module.exports={initPasswordResets,passwordResetRouter,deliverResetMail,startResetMailWorker};
