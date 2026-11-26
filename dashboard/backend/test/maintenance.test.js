const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
const {addMonths,status}=require('../src/maintenance');
const {randomUUID}=require('node:crypto');
let db,server,url,owner,member,stranger,building;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),close:()=>pg.close()};
 await initAccounts(db);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port+'/api/v1';
 const register=async n=>(await request('/auth/register','POST',{name:n,email:n.toLowerCase()+'@example.test',password:'SafeTestPassword'+n+'1'})).data;
 owner=await register('Owner');member=await register('Member');stranger=await register('Stranger');
 building=(await request('/buildings','POST',{name:'Haus'},owner.token)).data;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.user.id]);
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function request(path,method='GET',body,session){
 const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(session?{'X-D21-Session':session}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json()};
}
const base=()=>'/buildings/'+building.id+'/maintenance';
test('month arithmetic clamps to month end',()=>{
 assert.equal(addMonths('2026-01-31',1),'2026-02-28');assert.equal(addMonths('2026-11-17',12),'2027-11-17');assert.equal(addMonths('2024-02-29',12),'2025-02-28');
 assert.equal(status({next_due:null}),'ohne_termin');assert.equal(status({next_due:'2000-01-01'}),'ueberfaellig');assert.equal(status({next_due:'2999-01-01'}),'ok');
});
test('create, list, done with next due date, permissions and validation',async()=>{
 assert.equal((await request(base(),'POST',{title:''},owner.token)).status,400);
 assert.equal((await request(base(),'POST',{title:'X',category:'rakete'},owner.token)).status,400);
 assert.equal((await request(base(),'POST',{title:'X',next_due:'17.11.2026'},owner.token)).status,400);
 assert.equal((await request(base(),'POST',{title:'X'},stranger.token)).status,404);
 const heating=await request(base(),'POST',{title:'Heizungswartung',category:'heizung',interval_months:12,last_done:'2025-10-01'},owner.token);
 assert.equal(heating.status,201,JSON.stringify(heating.data));assert.equal(heating.data.next_due,'2026-10-01');assert.equal(heating.data.status,'ueberfaellig');
 const smoke=(await request(base(),'POST',{title:'Rauchmelder',category:'brandschutz',interval_months:12},member.token)).data;
 const list=(await request(base(),'GET',undefined,member.token)).data;
 assert.equal(list.items.length,2);assert.equal(list.summary.overdue,1);
 assert.equal(list.items.find(i=>i.id===heating.data.id).can_edit,false,'member cannot edit owner entry');
 assert.equal(list.items.find(i=>i.id===smoke.id).can_edit,true);
 assert.equal((await request('/maintenance/'+heating.data.id,'PATCH',{notes:'x',revision:0},member.token)).status,403);
 assert.equal((await request('/maintenance/'+heating.data.id+'/done','POST',{revision:5},member.token)).status,409);
 const done=await request('/maintenance/'+heating.data.id+'/done','POST',{date:'2026-11-17',revision:0},member.token);
 assert.equal(done.status,200);assert.equal(done.data.last_done,'2026-11-17');assert.equal(done.data.next_due,'2027-11-17');assert.equal(done.data.status,'ok');
 const notes=(await db.query("SELECT user_id FROM app_notifications WHERE kind='maintenance_done'")).rows.map(r=>r.user_id);
 assert.deepEqual(notes,[owner.user.id],'others are informed');
 const edit=await request('/maintenance/'+heating.data.id,'PATCH',{warranty_until:'2030-05-01',revision:1},owner.token);
 assert.equal(edit.status,200);assert.equal(edit.data.warranty_until,'2030-05-01');
 assert.equal((await request('/maintenance/'+smoke.id,'DELETE',undefined,stranger.token)).status,404);
 assert.equal((await request('/maintenance/'+smoke.id,'DELETE',undefined,owner.token)).status,200);
 assert.equal((await request('/maintenance/templates','GET',undefined,member.token)).data.templates.length>5,true);
});
test('Nala reads the maintenance plan as a tool',async()=>{
 const {runTool}=require('../src/assistant-tools');
 const result=await runTool(db,{user:member.user.id,building:building.id},'maintenance',{});
 assert.equal(result.count,1);assert.equal(result.items[0].title,'Heizungswartung');assert.equal(result.items[0].next_due,'2027-11-17');
 assert.equal((await runTool(db,{user:stranger.user.id,building:building.id},'maintenance',{})).error,'Kein Zugriff auf dieses Gebäude.');
});

test('technical assets retain their own building, linked schedule, and maintenance history',async()=>{
 const assetPath='/buildings/'+building.id+'/assets';
 const fields={name:'Lüftungsgerät',system:'Lüftung',location:'Technikzentrale',status:'in_betrieb',data_quality:0};
 const asset=await request(assetPath,'POST',fields,owner.token);
 assert.equal(asset.status,201,JSON.stringify(asset.data));
 assert.equal((await request(assetPath,'GET',undefined,stranger.token)).status,404);
 const outside=(await request('/buildings','POST',{name:'Anderes Gebäude'},owner.token)).data;
 assert.equal((await request('/buildings/'+outside.id+'/maintenance','POST',{title:'Wartung',asset_id:asset.data.id},owner.token)).status,400);
 const saved=await request(assetPath+'/'+asset.data.id,'PATCH',{...fields,status:'wartung',revision:0},owner.token);
 assert.equal(saved.data.status,'wartung');
 assert.equal((await request(assetPath+'/'+asset.data.id,'PATCH',{...fields,revision:0},owner.token)).status,409);
 const task=(await request(base(),'POST',{title:'Filterwechsel',asset_id:asset.data.id,next_due:'2026-12-10',priority:'high'},owner.token)).data;
 assert.equal(task.asset_id,asset.data.id);
 const catalog=(await request(assetPath,'GET',undefined,owner.token)).data;
 assert.equal(catalog.items[0].next_maintenance,'2026-12-10');
 assert.equal(catalog.items[0].data_quality,0);
 const path='/maintenance/'+task.id;
 const start=await request(path+'/start','POST',{revision:0},owner.token);
 assert.equal(start.data.work_status,'in_progress');
 const complete=await request(path+'/done','POST',{date:'2026-11-24',revision:1},owner.token);
 assert.equal(complete.data.work_status,'completed');
 assert.equal((await request(path+'/done','POST',{revision:1},owner.token)).status,409);
 const history=(await request(base()+'/'+task.id+'/history','GET',undefined,owner.token)).data;
 assert.deepEqual(history.map(x=>x.action),['completed','started']);
 assert.equal(history[0].performed_on,'2026-11-24');
 assert.equal((await request('/buildings/'+outside.id+'/maintenance/'+task.id+'/history','GET',undefined,owner.token)).status,404);
});

test('maintenance and building register share one document, including upload retries', async () => {
 const other = (await request('/buildings','POST',{name:'Gebäude B'},owner.token)).data;
 const task = (await request(base(),'POST',{title:'Wartung mit Prüfprotokoll'},owner.token)).data;
 const taskB = (await request(`/buildings/${other.id}/maintenance`,'POST',{title:'Andere Wartung'},owner.token)).data;
 const bytes = Buffer.from('%PDF-1.4\n%%EOF');
 const uploadID = randomUUID();
 const upload = (buildingID, taskID, token) => fetch(`${url}/buildings/${buildingID}/maintenance/${taskID}/documents`, {
  method:'POST', headers:{'X-D21-Session':token,'Content-Type':'application/octet-stream',
   'X-File-Name':encodeURIComponent('Prüfprotokoll.pdf'),'X-Upload-ID':uploadID}, body:bytes,
 });
 assert.equal((await upload(other.id,task.id,owner.token)).status,404);
 assert.equal((await upload(building.id,task.id,stranger.token)).status,404);
 const uploaded = await upload(building.id,task.id,member.token);
 assert.equal(uploaded.status,201);
 const document = await uploaded.json();
 assert.equal(document.maintenance_id,task.id);
 assert.equal(document.category,'wartung');
 const retried = await upload(building.id,task.id,member.token);
 assert.equal(retried.status,200);
 assert.deepEqual(await retried.json(),document);
 assert.equal((await upload(building.id,taskB.id,member.token)).status,404);
 const list = async id => (await request(`/buildings/${id}/documents`,'GET',undefined,owner.token)).data;
 assert.deepEqual(await list(building.id),[document]);
 assert.deepEqual(await list(other.id),[]);
 const opened = await fetch(`${url}/documents/${document.id}`,{headers:{'X-D21-Session':owner.token}});
 assert.deepEqual(Buffer.from(await opened.arrayBuffer()),bytes);
 await db.query(`UPDATE app_building_roles SET permissions=permissions||'{"documents":"read"}'::jsonb
  WHERE building_id=$1 AND role_key='employee'`,[building.id]);
 assert.equal((await upload(building.id,task.id,member.token)).status,403);
 await db.query(`UPDATE app_building_roles SET permissions=permissions||'{"documents":"edit","maintenance":"read"}'::jsonb
  WHERE building_id=$1 AND role_key='employee'`,[building.id]);
 assert.equal((await upload(building.id,task.id,member.token)).status,403);
 assert.equal((await request(`/maintenance/${task.id}`,'DELETE',undefined,owner.token)).status,200);
 assert.deepEqual(await list(building.id),[{...document,maintenance_id:null}]);
});

test('IFC links need a valid object in the asset building and keep their document identity', async () => {
 const other = (await request('/buildings','POST',{name:'Anderes IFC-Gebäude'},owner.token)).data;
 const path = `/buildings/${building.id}/assets`;
 const asset = (await request(path,'POST',{name:'Raumlüftung',system:'Lüftung',location:'EG',status:'in_betrieb'},owner.token)).data;
 const global_id = '2YvctVUKr0kugbFTf53O9L';
 const bytes = Buffer.from(`#16=IFCSPACE('${global_id}',$,'Raum 101');`);
 const addDoc = async id => (await db.query(`INSERT INTO app_documents(building_id,name,mime_type,size,content)
  VALUES($1,'Prüfmodell.ifc','application/x-step',$2,$3) RETURNING id`,[id,bytes.length,bytes])).rows[0].id;
 const model = await addDoc(building.id);
 const foreign = await addDoc(other.id);
 const reference = {model_id:String(model),element_id:16,global_id,label:'Raum 101'};
 const link = (value, token=owner.token, revision=0) => request(`${path}/${asset.id}/ifc-reference`,'PUT',{revision,reference:value},token);
 assert.equal((await link({...reference,model_id:String(foreign)})).status,404);
 assert.equal((await link({...reference,element_id:30})).status,400);
 assert.equal((await link(reference,stranger.token)).status,404);
 assert.equal((await link(reference,member.token)).status,403);
 const saved = await link(reference);
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.deepEqual(saved.data.ifc_reference,reference);
 assert.equal((await link(null)).status,409);
 await db.query('DELETE FROM app_documents WHERE id=$1',[model]);
 const assets = (await request(path,'GET',undefined,owner.token)).data.items;
 assert.deepEqual(assets.find(row => row.id === asset.id).ifc_reference,reference);
 assert.equal((await link(null,owner.token,1)).data.ifc_reference,null);
});

test('asset trends distinguish uncovered periods, recorded zero, and current overdue stock', async () => {
 const home = (await request('/buildings','POST',{name:'Anlagentrends'},owner.token)).data;
 const path = `/buildings/${home.id}`;
 const fields = {name:'Anlage A',system:'Lüftung',location:'EG',status:'in_betrieb',data_quality:40};
 const asset = (await request(`${path}/assets`,'POST',fields,owner.token)).data;
 const update = (revision, status, data_quality) => request(`${path}/assets/${asset.id}`,'PATCH',{...fields,revision,status,data_quality},owner.token);
 assert.equal((await update(0,'stoerung',50)).status,200);
 assert.equal((await update(1,'stoerung',80)).status,200);
 assert.equal((await update(2,'in_betrieb',80)).status,200);
 assert.equal((await update(3,'in_betrieb',80)).status,200);
 const observations = (await db.query('SELECT revision,entered_fault FROM app_technical_asset_observations WHERE asset_id=$1 ORDER BY revision',[asset.id])).rows;
 assert.deepEqual(observations.map(row=>[row.revision,row.entered_fault]),[[0,false],[1,true],[2,false],[3,false]]);
 await db.query(`UPDATE app_technical_asset_observations SET observed_at=TIMESTAMPTZ '2020-01-05 12:00Z'+revision*interval '10 days' WHERE asset_id=$1`,[asset.id]);
 await request(`${path}/maintenance`,'POST',{title:'Alt',next_due:'2020-01-15',asset_id:asset.id},owner.token);
 const completed = (await request(`${path}/maintenance`,'POST',{title:'Erledigt',next_due:'2020-01-10',asset_id:asset.id},owner.token)).data;
 await request(`/maintenance/${completed.id}/done`,'POST',{revision:0,date:'2020-01-11'},owner.token);
 const endpoint = `${path}/analysis/asset-trends`;
 const report = async (from,to) => (await request(`${endpoint}?from=${from}&to=${to}&asset_id=${asset.id}`,'GET',undefined,owner.token)).data.context;
 const known = await report('2020-01-10','2020-01-30');
 assert.deepEqual(known.assets,[{id:asset.id,name:'Anlage A'}]);
 assert.equal(known.faults.current.count,1);
 assert.equal(known.faults.current.complete,true);
 assert.equal(known.faults.previous.complete,false);
 assert.equal(known.quality.average_percent,80);
 assert.equal(known.quality.change_percentage_points,40);
 assert.equal(known.overdue.count,1);
 assert.equal(known.overdue.historical_available,false);
 const none = await report('2019-12-01','2019-12-31');
 assert.equal(none.faults.current.count,null);
 assert.equal(none.quality.average_percent,null);
 assert.equal(none.overdue.count,known.overdue.count);
 const zero = await report('2020-02-01','2020-02-10');
 assert.equal(zero.faults.current.count,0);
 assert.equal(zero.faults.current.complete,true);
 assert.equal((await request(`${endpoint}?from=2020-02-01&to=2020-02-10`,'GET',undefined,stranger.token)).status,404);
 assert.equal((await request(`${endpoint}?from=2020-02-01&to=2020-02-10&asset_id=999`,'GET',undefined,owner.token)).status,404);
});
