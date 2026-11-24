const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
const {addMonths,status}=require('../src/maintenance');
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
