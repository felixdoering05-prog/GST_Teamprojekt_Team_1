const {retiredLegacyBuildings}=require('./legacy-api');
const {usageMiddleware}=require('./admin');
const express = require('express');
const {Pool} = require('pg');
const {startResetMailWorker}=require('./password-reset');
const {initAccounts,accountRouter}=require('./accounts');
const app = express();
const db = new Pool({connectionString:process.env.DATABASE_URL});
app.use((req,res,next)=>req.path.startsWith('/api/v1/twin/')?next():express.json({limit:/^\/api\/v1\/documents\/\d+\/model-(state|command)$/.test(req.path)?'256kb':/^\/api\/v1\/buildings\/\d+\/telemetry\/import$/.test(req.path)?'128kb':'16kb'})(req,res,next));
async function init(){await initAccounts(db);await db.query(`CREATE TABLE IF NOT EXISTS buildings(id SERIAL PRIMARY KEY,name TEXT NOT NULL,address TEXT DEFAULT '',created_at TIMESTAMPTZ DEFAULT now())`)}
app.use(usageMiddleware(db));
app.get('/api/health',async(req,res)=>{try{await db.query('SELECT 1');res.json({status:'ok'})}catch(e){res.status(503).json({status:'database unavailable'})}});
// Retired unauthenticated starter API: preserve legacy rows, expose none.
app.all('/api/buildings',retiredLegacyBuildings);
app.use('/api/v1',accountRouter(db));
const port=3001;init().then(()=>{const cleanup=setInterval(()=>db.query("DELETE FROM app_api_usage_hourly WHERE hour<now()-interval '30 days'").catch(()=>{}),3600000);cleanup.unref();startResetMailWorker(db);return app.listen(port,'0.0.0.0',()=>console.log(`API on ${port}`))}).catch(e=>{console.error(e);process.exit(1)});
