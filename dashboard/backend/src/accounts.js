const express = require('express');
const {initDocuments,documentRouter}=require('./documents');
const {initProfile,profileRouter}=require('./profile');
const {randomBytes, scrypt, timingSafeEqual, createHash} = require('node:crypto');
const {promisify} = require('node:util');
const derive = promisify(scrypt);
const SESSION_DAYS = 7;
const hashToken = token => createHash('sha256').update(token).digest('hex');
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
 const key = await derive(password, salt, 64, {N:32768,r:8,p:1,maxmem:64*1024*1024});
 return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
 const calculated = await passwordHash(password, stored.split(':')[0]);
 return timingSafeEqual(Buffer.from(calculated), Buffer.from(stored));
}
async function initAccounts(db) {
 await db.query(`CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL)`);
 await db.query(`CREATE TABLE IF NOT EXISTS app_buildings (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await db.query('CREATE INDEX IF NOT EXISTS app_buildings_user_idx ON app_buildings(user_id)');
 await initDocuments(db);
 await initProfile(db);
 await db.query('DELETE FROM app_sessions WHERE expires_at <= $1', [new Date()]);
}
function accountRouter(db) {
 const router = express.Router();
 const attempts = new Map();
 let activePasswords = 0;
 // Bound password work and attempts. Socket address is used rather than trusting client-supplied IP headers.
 const throttle = (req,res,next) => {
  const now = Date.now();
  for(const [key,value] of attempts) if(value.until <= now) attempts.delete(key);
  const key = req.socket.remoteAddress || 'unknown';
  const state = attempts.get(key) || {count:0,until:now+15*60*1000};
  if(state.count >= 40 || activePasswords >= 4) return res.status(429).json({error:'Zu viele Anmeldeversuche. Bitte später erneut versuchen.'});
  state.count++;attempts.set(key,state);activePasswords++;
  res.once('finish',()=>activePasswords--);next();
 };
 const publicUser = u => ({id:u.id,name:u.name,email:u.email});
 const session = async user => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now()+SESSION_DAYS*86400000);
  await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hashToken(token),user.id,expiresAt]);
  return {token,expires_at:expiresAt.toISOString(),user:publicUser(user)};
 };
 // Middleware wrapper explicitly continues only after successful authentication.
 const requireAccount=(req,res,next)=>Promise.resolve(authenticateAccount(req,res)).then(ok=>{if(ok)next()}).catch(next);
 async function authenticateAccount(req,res){
  const token=req.get('X-D21-Session')||'';
  if(!/^[a-f0-9]{64}$/.test(token)){res.status(401).json({error:'Bitte anmelden.'});return false;}
  const user=(await db.query(`SELECT u.id,u.name,u.email FROM app_users u JOIN app_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at > $2`,[hashToken(token),new Date()])).rows[0];
  if(!user){res.status(401).json({error:'Die Sitzung ist abgelaufen. Bitte erneut anmelden.'});return false;}
  req.account=user;req.sessionHash=hashToken(token);return true;
 }
 router.post('/auth/register',throttle,wrap(async(req,res)=>{
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  const password=req.body?.password;
  if(!name||name.length>100||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<12||Buffer.byteLength(password)>1024)
   return res.status(400).json({error:'Name, gültige E-Mail und Passwort mit mindestens 12 Zeichen erforderlich.'});
  const hash=await passwordHash(password);
  try {
   const user=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',[name,email,hash])).rows[0];
   res.status(201).json(await session(user));
  } catch(e){if(e.code==='23505')return res.status(409).json({error:'Ein Konto mit diesen Angaben kann nicht angelegt werden. Bitte anmelden oder andere Angaben verwenden.'});throw e;}
 }));
 router.post('/auth/login',throttle,wrap(async(req,res)=>{
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  const password=req.body?.password;
  if(email.length>254||typeof password!=='string'||Buffer.byteLength(password)>1024)return res.status(400).json({error:'Bitte E-Mail und Passwort eingeben.'});
  const user=(await db.query('SELECT * FROM app_users WHERE email=$1',[email])).rows[0];
  // Always perform the same password work, including for unknown email addresses.
  const dummy='00000000000000000000000000000000:'+ '0'.repeat(128);
  const matches=await verifyPassword(password,user?.password_hash||dummy);
  if(!user||!matches)return res.status(401).json({error:'E-Mail oder Passwort ist falsch.'});
  res.json(await session(user));
 }));
 router.get('/auth/me',requireAccount,(req,res)=>res.json(publicUser(req.account)));
 router.post('/auth/logout',requireAccount,wrap(async(req,res)=>{await db.query('DELETE FROM app_sessions WHERE token_hash=$1',[req.sessionHash]);res.json({ok:true})}));
 router.get('/buildings',requireAccount,wrap(async(req,res)=>res.json((await db.query('SELECT id,name,address,created_at FROM app_buildings WHERE user_id=$1 ORDER BY id',[req.account.id])).rows)));
 router.post('/buildings',requireAccount,wrap(async(req,res)=>{
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  const address=typeof req.body?.address==='string'?req.body.address.trim():'';
  if(!name||name.length>200||address.length>500)return res.status(400).json({error:'Gebäudename erforderlich (max. 200 Zeichen); Adresse max. 500 Zeichen.'});
  res.status(201).json((await db.query('INSERT INTO app_buildings(user_id,name,address) VALUES($1,$2,$3) RETURNING id,name,address,created_at',[req.account.id,name,address])).rows[0]);
 }));
 router.use(profileRouter(db,requireAccount));
 router.use(documentRouter(db,requireAccount));
 router.use((err,req,res,next)=>{console.error('Account API error:',err.code||err.name);res.status(500).json({error:'Serverfehler. Bitte später erneut versuchen.'})});
 return router;
}
module.exports={initAccounts,accountRouter,passwordHash,verifyPassword};
