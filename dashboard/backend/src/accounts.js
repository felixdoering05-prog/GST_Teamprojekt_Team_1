const {initSensorDevices,sensorDevicesRouter}=require('./sensor-devices');
const {initRuView,ruviewRouter}=require('./ruview');
const {initSensorPlacement,sensorPlacementRouter}=require('./sensor-placement');
const {initIFCAnalysis,ifcAnalysisRouter}=require('./ifc-analysis');
const {serviceStatusRouter}=require('./service-status');
const {buildingDeletionRouter}=require('./building-deletion');
const {PasswordWorkGate}=require('./password-work');
const {accountDeletionRouter}=require('./account-deletion');
const {initPlanConversion}=require('./plan-conversion/queue');
const {planConversionRouter}=require('./plan-conversion/router');
const {placementRouter}=require('./placement-check');
const {initBuildingWeather,buildingWeatherRouter}=require('./building-weather');
const {initUIPreferences,uiPreferencesRouter}=require('./ui-preferences');
const {assistantDevicesRouter}=require('./assistant-devices');
const {initMapViews,mapViewRouter}=require('./map-view');
const {equipmentRouter}=require('./equipment');
const {initIssues,issuesRouter}=require('./issues');
const {initMaintenance,maintenanceRouter}=require('./maintenance');
const {initTechnicalAssets,technicalAssetsRouter}=require('./technical-assets');
const {initAutomations,automationsRouter}=require('./automations');
const {energyRouter}=require('./energy');
const {initHomeAssistant,homeAssistantRouter}=require('./home-assistant');
const {initAdmin,adminRouter}=require('./admin');
const {campusRouter}=require('./campus');
const {initDevices,devicesRouter}=require('./devices');
const {initTelemetry,telemetryRouter}=require('./telemetry');
const {initHAImport,haImportRouter,bridgeRouter}=require('./ha-import');
const {initVoice,voiceRouter}=require('./voice');
const {initAIPreferences,aiPreferencesRouter}=require('./ai-preferences');
const {initLiveVoice,liveVoiceRouter}=require('./live-voice');
const {initModelState,modelStateRouter}=require('./model-state');
const {initAssistant,assistantRouter}=require('./assistant');
const {initCollaboration,collaborationRouter,accessSQL}=require('./collaboration');
const {initTeamPermissions,scopedAccessMiddleware}=require('./team-permissions');
const {teamAccessRouter,initBuildingSchedules,scheduleRouter}=require('./team-access');
const {initTeams,ensureDefaultTeam,teamScopeMiddleware,teamsRouter}=require('./teams');
const express = require('express');
const {initPasswordResets,passwordResetRouter}=require('./password-reset');
const {initTwin,twinRouter}=require('./twin');
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
 await db.query('ALTER TABLE app_buildings ADD COLUMN IF NOT EXISTS creation_key TEXT');
 await db.query('CREATE UNIQUE INDEX IF NOT EXISTS app_buildings_creation_key_idx ON app_buildings(user_id,creation_key) WHERE creation_key IS NOT NULL');
 await initTeams(db);
 await initPasswordResets(db);
 await initTwin(db);
 await initDocuments(db);await initIFCAnalysis(db);await initModelState(db);
 await initProfile(db);
 await initCollaboration(db);
 await initTeamPermissions(db);
 await initBuildingSchedules(db);
 await initAssistant(db);
 await initAdmin(db);
 await initDevices(db);
 await initHomeAssistant(db);
 await initMapViews(db);
 await initIssues(db);
 await initTechnicalAssets(db);
 await initMaintenance(db);
 await initAutomations(db);
 await initBuildingWeather(db);
 await initTelemetry(db);await initSensorDevices(db);await initSensorPlacement(db);await initHAImport(db);
 await initVoice(db);
 await initAIPreferences(db);
 await initUIPreferences(db);await initRuView(db);
 await initLiveVoice(db);
 await initPlanConversion(db);
 await db.query('DELETE FROM app_sessions WHERE expires_at <= $1', [new Date()]);
}
function accountRouter(db,options={}) {
 const router = express.Router();
 const attempts = new Map();
 const passwordWork=new PasswordWorkGate(4);
 const boundedHash=(...args)=>passwordWork.run(()=>passwordHash(...args));
 const boundedVerify=(...args)=>passwordWork.run(()=>verifyPassword(...args));
 // Bound password work and attempts. Socket address is used rather than trusting client-supplied IP headers.
 const throttle = (req,res,next) => {
  const now = Date.now();
  for(const [key,value] of attempts) if(value.until <= now) attempts.delete(key);
  const key = req.socket.remoteAddress || 'unknown';
  const state = attempts.get(key) || {count:0,until:now+15*60*1000};
  if(state.count >= 40) return res.status(429).json({error:'Zu viele Anmeldeversuche. Bitte später erneut versuchen.'});
  state.count++;attempts.set(key,state);next();
 };
 const publicUser = u => ({id:u.id,name:u.name,email:u.email});
 const applyTeamScope=teamScopeMiddleware(db);
 const session = async (user,connection=db) => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now()+SESSION_DAYS*86400000);
  await connection.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hashToken(token),user.id,expiresAt]);
  return {token,expires_at:expiresAt.toISOString(),user:publicUser(user)};
 };
 // Middleware wrapper explicitly continues only after successful authentication.
 const requireAccount=(req,res,next)=>{if(req.account)return next();return Promise.resolve(authenticateAccount(req,res)).then(ok=>{if(ok)next()}).catch(next);};
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
  const hash=await boundedHash(password);
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
  const matches=await boundedVerify(password,user?.password_hash||dummy);
  if(!user||!matches)return res.status(401).json({error:'E-Mail oder Passwort ist falsch.'});
  const client=await db.connect();
  try {
   await client.query('BEGIN');
   const current=(await client.query('SELECT password_hash FROM app_users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
   if(!current||current.password_hash!==user.password_hash){await client.query('ROLLBACK');return res.status(401).json({error:'E-Mail oder Passwort ist falsch.'});}
   const result=await session(user,client);await client.query('COMMIT');res.json(result);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }));
 router.use(passwordResetRouter(db,{passwordHash:boundedHash,throttle,...options}));
 router.use(accountDeletionRouter(db,requireAccount,verifyPassword));
 router.get('/auth/me',requireAccount,(req,res)=>res.json(publicUser(req.account)));
 router.post('/auth/logout',requireAccount,wrap(async(req,res)=>{await db.query('DELETE FROM app_sessions WHERE token_hash=$1',[req.sessionHash]);res.json({ok:true})}));
 router.get('/buildings',requireAccount,applyTeamScope,wrap(async(req,res)=>{
  const params=[req.account.id],teamFilter=req.teamScope?' AND b.team_id=$2':'';if(req.teamScope)params.push(req.teamScope.id);
  res.json((await db.query(`SELECT b.id,b.name,b.address,b.created_at,b.user_id AS owner_id,b.team_id,(b.user_id=$1) AS is_owner,(SELECT d.id FROM app_documents d WHERE d.building_id=b.id AND d.mime_type='application/x-step' ORDER BY d.id DESC LIMIT 1) AS model_document_id FROM app_buildings b WHERE (b.user_id=$1 OR EXISTS(SELECT 1 FROM app_building_members m WHERE m.building_id=b.id AND m.user_id=$1 AND m.status='accepted'))${teamFilter} ORDER BY b.id`,params)).rows);
 }));
 router.post('/buildings',requireAccount,applyTeamScope,wrap(async(req,res)=>{
  const [owned,membership]=await Promise.all([
   db.query('SELECT 1 FROM app_buildings WHERE user_id=$1 LIMIT 1',[req.account.id]),
   db.query("SELECT 1 FROM app_building_members WHERE user_id=$1 AND status='accepted' LIMIT 1",[req.account.id]),
  ]);
  if(membership.rows.length&&!owned.rows.length)return res.status(403).json({error:'Mitgliedskonten können nur Gebäude anlegen, auf die sie selbst Eigentümerrechte haben.'});
  if(req.teamScope&&!req.teamScope.is_owner)return res.status(403).json({error:'In diesem Team kann nur die Teamleitung Gebäude anlegen.'});
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  const address=typeof req.body?.address==='string'?req.body.address.trim():'';
  if(!name||name.length>200||address.length>500)return res.status(400).json({error:'Gebäudename erforderlich (max. 200 Zeichen); Adresse max. 500 Zeichen.'});
  const key=req.get('X-Request-ID')||null;
  const team=req.teamScope?.is_owner?{id:req.teamScope.id}:await ensureDefaultTeam(db,req.account.id);
  if(key&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))return res.status(400).json({error:'Ungültige Anfrage-Kennung.'});
  if(!key)return res.status(201).json((await db.query('INSERT INTO app_buildings(user_id,name,address,team_id) VALUES($1,$2,$3,$4) RETURNING id,name,address,team_id,created_at',[req.account.id,name,address,team.id])).rows[0]);
  const client=await db.connect();
  try {
   await client.query('BEGIN');await client.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[req.account.id]);
   const existing=(await client.query('SELECT id,name,address,created_at FROM app_buildings WHERE user_id=$1 AND creation_key=$2',[req.account.id,key])).rows[0];
   if(existing){await client.query('COMMIT');return res.json(existing);}
   const created=(await client.query('INSERT INTO app_buildings(user_id,name,address,creation_key,team_id) VALUES($1,$2,$3,$4,$5) RETURNING id,name,address,team_id,created_at',[req.account.id,name,address,key,team.id])).rows[0];
   await client.query('COMMIT');res.status(201).json(created);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }));
 // Every building-scoped API below is authenticated and checked against the member's role.
 // Device ingestion is authenticated by its per-device token in sensorDevicesRouter.
 router.use((req,res,next)=>{
  const tokenAuthenticated=req.path==='/sensor-input'||req.path==='/ruview-input'||req.path==='/ha-client'||req.path==='/ha-bridge'||req.path.startsWith('/ha-bridge/');
  return tokenAuthenticated?next():requireAccount(req,res,()=>applyTeamScope(req,res,next));
 });
 router.use(teamsRouter(db,requireAccount));
 router.use(scopedAccessMiddleware(db));
 router.use(buildingDeletionRouter(db,requireAccount));
 router.use(teamAccessRouter(db,requireAccount));
 router.use(scheduleRouter(db,requireAccount));
 router.use(ifcAnalysisRouter(db,requireAccount));
 router.use(serviceStatusRouter(db,requireAccount));
 router.use(sensorDevicesRouter(db,requireAccount));
 router.use(ruviewRouter(db,requireAccount));
 router.use(sensorPlacementRouter(db,requireAccount));
 router.use(bridgeRouter(db));
 router.use(haImportRouter(db,requireAccount));
 router.use('/admin',adminRouter(db,requireAccount,options.admin));
 router.use('/campus',campusRouter(db,requireAccount,options.campus));
 router.use(devicesRouter(db,requireAccount));
 router.use(telemetryRouter(db,requireAccount));
 router.use(mapViewRouter(db,requireAccount,options.mapView));
 router.use(planConversionRouter(db,requireAccount,options.planConversion));
 router.use(placementRouter(db,requireAccount));
 router.use(buildingWeatherRouter(db,requireAccount,options.weather));
 router.use(uiPreferencesRouter(db,requireAccount));
 router.use(issuesRouter(db,requireAccount,options.campus));
 router.use(maintenanceRouter(db,requireAccount));
 router.use(technicalAssetsRouter(db,options.campus));
 router.use(automationsRouter(db,requireAccount));
 router.use(energyRouter(db,requireAccount));
 router.use(equipmentRouter(db,requireAccount,options.homeAssistant));
 router.use(homeAssistantRouter(db,requireAccount,options.homeAssistant));
 router.use(liveVoiceRouter(db,requireAccount,{...options.liveVoice,homeAssistant:options.homeAssistant}));
 router.use(voiceRouter(db,requireAccount,options.voice));
 router.use(aiPreferencesRouter(db,requireAccount));
 router.use(assistantDevicesRouter(db,requireAccount,options.homeAssistant||{}));
 router.use(collaborationRouter(db,requireAccount));
 router.use(modelStateRouter(db,requireAccount,options.homeAssistant));
 router.use(assistantRouter(db,requireAccount,{...options.assistant,homeAssistant:options.homeAssistant}));
 router.use(twinRouter(db,requireAccount));
 router.use(profileRouter(db,requireAccount));
 router.use(documentRouter(db,requireAccount));
 router.use((err,req,res,next)=>{console.error('Account API error:',err.code||err.name);res.status(500).json({error:'Serverfehler. Bitte später erneut versuchen.'})});
 return router;
}
module.exports={initAccounts,accountRouter,passwordHash,verifyPassword};

