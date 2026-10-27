const express = require('express');
const {Pool} = require('pg');
const {initAccounts,accountRouter}=require('./accounts');
const app = express();
const db = new Pool({connectionString:process.env.DATABASE_URL});
app.use(express.json({limit: '16kb'}));
async function init(){await initAccounts(db);await db.query(`CREATE TABLE IF NOT EXISTS buildings(id SERIAL PRIMARY KEY,name TEXT NOT NULL,address TEXT DEFAULT '',created_at TIMESTAMPTZ DEFAULT now())`)}
app.get('/api/health',async(req,res)=>{try{await db.query('SELECT 1');res.json({status:'ok'})}catch(e){res.status(503).json({status:'database unavailable'})}});
app.get('/api/buildings',async(req,res)=>{try{res.json((await db.query('SELECT * FROM buildings ORDER BY id')).rows)}catch(e){res.status(500).json({error:'Database error'})}});
app.post('/api/buildings',async(req,res)=>{const name=String(req.body?.name||'').trim();if(!name)return res.status(400).json({error:'Name required'});try{const result=await db.query('INSERT INTO buildings(name,address) VALUES($1,$2) RETURNING *',[name,String(req.body.address||'')]);res.status(201).json(result.rows[0])}catch(e){res.status(500).json({error:'Database error'})}});
app.use('/api/v1',accountRouter(db));
const port=3001;init().then(()=>app.listen(port,'0.0.0.0',()=>console.log(`API on ${port}`))).catch(e=>{console.error(e);process.exit(1)});
