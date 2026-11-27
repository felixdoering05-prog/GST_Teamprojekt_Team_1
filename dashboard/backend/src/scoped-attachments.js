const express = require('express');

const stores = {
  group: ['app_group_files', 'app_building_groups'],
  schedule: ['app_schedule_files', 'app_building_schedules'],
};

async function initAttachments(db, kind) {
  const [table, parent] = stores[kind];
  await db.query(`CREATE TABLE IF NOT EXISTS ${table} (
    id SERIAL PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES ${parent}(id) ON DELETE CASCADE,
    name TEXT NOT NULL, bytes BYTEA NOT NULL)`);
  if(kind==='group') await db.query('ALTER TABLE app_group_files ADD COLUMN IF NOT EXISTS category TEXT');
}

function attachmentRoutes(router, db, requireAccount, kind, path, authorize) {
  const [table] = stores[kind];
  const check = async (req, res, next) => {
    try {
      if (/^[1-9]\d{0,8}$/.test(req.params.parentID) &&
          await authorize(req, res, req.method !== 'GET')) return next();
      if (!res.headersSent) res.status(404).json({error:'Dateibereich nicht verfügbar.'});
    } catch (error) { next(error); }
  };
  const guard = [requireAccount, check];
  router.get(path, ...guard, async (req,res,next) => {
    try {
      res.set('Cache-Control','private, no-store').json((await db.query(`SELECT id,name${kind==='group'?',category':''} FROM ${table} WHERE parent_id=$1 ORDER BY id`,[req.params.parentID])).rows);
    } catch(error) { next(error); }
  });
  router.post(path, ...guard, express.raw({type:'application/octet-stream',limit:'10mb'}), async(req,res,next)=>{
    try {
      const name=req.query.name;
      if(typeof name!=='string'||!name.trim()||name.length>255||!Buffer.isBuffer(req.body)||!req.body.length)
        return res.status(400).json({error:'Bitte eine Datei bis 10 MB auswählen.'});
      const category=kind==='group'?req.query.category:null;
      if(category && !['gallery','models'].includes(category))return res.status(400).json({error:'Ungültiger Dateibereich.'});
      const result=category ? await db.query('INSERT INTO app_group_files(parent_id,name,bytes,category) VALUES($1,$2,$3,$4) RETURNING id,name,category',[req.params.parentID,name,req.body,category]) : await db.query(`INSERT INTO ${table}(parent_id,name,bytes) VALUES($1,$2,$3) RETURNING id,name`,[req.params.parentID,name,req.body]);
      res.status(201).json(result.rows[0]);
    } catch(error) { next(error); }
  });
  router.get(path+'/:fileID', ...guard, async(req,res,next)=>{
    try {
      const row=(await db.query(`SELECT bytes FROM ${table} WHERE parent_id=$1 AND id=$2`,[req.params.parentID,req.params.fileID])).rows[0];
      if(!row)return res.sendStatus(404);
      res.set({'Content-Type':'application/octet-stream','Content-Disposition':'attachment','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(Buffer.from(row.bytes));
    } catch(error) { next(error); }
  });
}
module.exports={initAttachments,attachmentRoutes};
