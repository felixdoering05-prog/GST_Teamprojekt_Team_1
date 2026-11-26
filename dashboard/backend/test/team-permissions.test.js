const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {MODULES,ensureBuildingRoles}=require('../src/team-permissions');

let db,server,url,owner,employee,maintenance,manager,peer,first,second,floorFirst,floorSecond;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(sql,params)=>pg.query(sql,params),connect:async()=>({query:(sql,params)=>pg.query(sql,params),release(){}}),end:()=>pg.close()};
 await initAccounts(db);
 async function user(name){
  const row=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,`${name.toLowerCase()}@example.test`])).rows[0];
  row.token=randomBytes(32).toString('hex');
  await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'1 hour\')',[createHash('sha256').update(row.token).digest('hex'),row.id]);
  return row;
 }
 owner=await user('Owner');employee=await user('Employee');maintenance=await user('Maintenance');manager=await user('Manager');peer=await user('Peer');
 first=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Erstes Gebäude') RETURNING id",[owner.id])).rows[0].id;
 second=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Zweites Gebäude') RETURNING id",[owner.id])).rows[0].id;
 const firstRoles=await ensureBuildingRoles(db,first),secondRoles=await ensureBuildingRoles(db,second);
 const role=(roles,key)=>roles.find(item=>item.role_key===key).id;
 await db.query("INSERT INTO app_building_members(building_id,user_id,status,role_id) VALUES($1,$2,'accepted',$3),($4,$5,'accepted',$6)",[first,employee.id,role(firstRoles,'employee'),second,employee.id,role(secondRoles,'maintenance')]);
 await db.query("INSERT INTO app_building_members(building_id,user_id,status,role_id) VALUES($1,$2,'accepted',$3)",[second,maintenance.id,role(secondRoles,'maintenance')]);
 await db.query("INSERT INTO app_building_members(building_id,user_id,status,role_id) VALUES($1,$2,'accepted',$3),($1,$4,'accepted',$3)",[first,manager.id,role(firstRoles,'management'),peer.id]);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db));server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));url=`http://127.0.0.1:${server.address().port}/api/v1`;
 async function request(user,path,method='GET',body){
  const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(user?{'X-D21-Session':user.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 }
 floorFirst=(await request(owner,'/twin/Floor/create','POST',{data:{building_id:String(first),name:'EG',level:0}})).body;
 floorSecond=(await request(owner,'/twin/Floor/create','POST',{data:{building_id:String(second),name:'UG',level:-1}})).body;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await db.end();});
async function request(user,path,method='GET',body){
 const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(user?{'X-D21-Session':user.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,body:await response.json()};
}

test('team logos are served as unchanged image bytes to members',async()=>{
 const team=(await request(owner,'/teams')).body.find(row=>row.buildings.some(building=>building.id===second));
 const logo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDscAAAAASUVORK5CYII=','base64');
 const path=url+`/teams/${team.id}/logo`;
 const upload=await fetch(path,{method:'PUT',headers:{'Content-Type':'image/png','X-D21-Session':owner.token},body:logo});
 assert.equal(upload.status,200);
 const response=await fetch(path,{headers:{'X-D21-Session':maintenance.token}});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),logo);
 assert.equal((await fetch(path)).status,401);
});

test('team navigation and building selection respect the selected buildings and membership',async()=>{
 const team=(await request(owner,'/teams')).body.find(row=>row.buildings.some(building=>building.id===first));
 assert.ok(team);
 const navigation=await request(maintenance,`/teams/${team.id}/building-navigation`);
 assert.equal(navigation.status,200,JSON.stringify(navigation.body));
 assert.deepEqual(navigation.body.map(row=>row.id),[second]);
 assert.equal(navigation.body[0].permissions.maintenance,'none');

 async function scopedFloors(user, selection){
  const response=await fetch(url+'/twin/Floor/list',{method:'POST',headers:{
   'Content-Type':'application/json','X-D21-Session':user.token,'X-D21-Team':String(team.id),'X-D21-Buildings':selection,
  },body:'{}'});
  assert.equal(response.status,200);
  return (await response.json()).map(row=>row.id).sort();
 }
 assert.deepEqual(await scopedFloors(owner,String(first)),[floorFirst.id]);
 assert.deepEqual(await scopedFloors(owner,`${first},${second}`),[floorFirst.id,floorSecond.id].sort());
 assert.deepEqual(await scopedFloors(maintenance,`${first},${second}`),[floorSecond.id]);
 assert.deepEqual(await scopedFloors(owner,'none'),[]);
});

test('roles and building scopes limit reads and writes independently per building',async()=>{
 const accessFirst=await request(employee,`/buildings/${first}/team-access`);
 const accessSecond=await request(employee,`/buildings/${second}/team-access`);
 assert.equal(accessFirst.body.actor_role.role_key,'employee');
 assert.equal(accessSecond.body.actor_role.role_key,'maintenance');
 assert.equal(accessFirst.body.can_manage_members,false);
 const floors=await request(employee,'/twin/Floor/list','POST',{});
 assert.deepEqual(floors.body.map(row=>row.id).sort(),[floorFirst.id,floorSecond.id].sort());
 assert.equal((await request(employee,`/buildings/${second}/team-access/members`, 'POST',{user_id:maintenance.id,role_id:accessSecond.body.roles.find(role=>role.role_key==='employee').id})).status,403);
 assert.equal((await request(employee,`/twin/Floor/update`,'POST',{id:floorSecond.id,data:{name:'EG'}})).status,403);
 assert.equal((await request(employee,`/twin/Floor/update`,'POST',{id:floorFirst.id,data:{name:'OG'}})).status,200);
 assert.equal((await request(maintenance,`/twin/Floor/update`,'POST',{id:floorSecond.id,data:{name:'EG'}})).status,403);
 assert.equal((await request(maintenance,`/twin/Sensor/create`,'POST',{data:{building_id:String(second),sensor_code:'S-1',metric:'temperature'}})).status,403);
 assert.equal((await request(maintenance,`/buildings/${second}/maintenance`,'POST',{title:'Neue Wartung',interval_months:12})).status,403);
 assert.equal((await request(maintenance,`/buildings/${second}/plan-conversion/jobs`,'POST',{document_ids:[1]})).status,403);
 const plan=await request(owner,`/buildings/${second}/maintenance`,'POST',{title:'Wartungsplan',interval_months:12});
 assert.equal(plan.status,201);
 assert.equal((await request(maintenance,`/buildings/${second}/maintenance`)).status,403);
 assert.equal((await request(maintenance,`/maintenance/${plan.body.id}/done`,'POST',{revision:0})).status,403);
});

test('management can manage lower-ranked members while only the owner edits and orders roles',async()=>{
 const managerAccess=await request(manager,`/buildings/${first}/team-access`);
 const roles=managerAccess.body.roles;
 assert.equal(managerAccess.body.can_manage_members,true);
 assert.equal((await request(manager,`/buildings/${first}/team-access/members/${employee.id}/role`,'PATCH',{role_id:roles.find(role=>role.role_key==='maintenance').id})).status,200);
 assert.equal((await request(manager,`/buildings/${first}/team-access/members/${peer.id}`,'DELETE')).status,403);
 assert.equal((await request(manager,`/buildings/${first}/team-access/roles`,'POST',{name:'Eigene Rolle',can_manage_members:false,permissions:{}})).status,403);
 assert.equal((await request(manager,`/buildings/${first}/team-access/roles/order`,'PATCH',{role_ids:roles.map(role=>role.id)})).status,403);
 const permissions=Object.fromEntries(MODULES.map(module=>[module,'none']));permissions.coordination='edit';
 const created=await request(owner,`/buildings/${first}/team-access/roles`,'POST',{name:'Koordination',permissions,can_manage_members:false});
 assert.equal(created.status,201);
 const edited=await request(owner,`/buildings/${first}/team-access/roles/${created.body.id}`,'PATCH',{name:'Planung',permissions,can_manage_members:false});
 assert.equal(edited.status,200);assert.equal(edited.body.name,'Planung');
 const reordered=[roles.find(role=>role.role_key==='maintenance').id,roles.find(role=>role.role_key==='management').id,roles.find(role=>role.role_key==='employee').id,created.body.id];
 assert.equal((await request(owner,`/buildings/${first}/team-access/roles/order`,'PATCH',{role_ids:reordered})).status,200);
 assert.equal((await request(owner,`/buildings/${first}/team-access/roles/${created.body.id}`,'DELETE')).status,200);
});

test('revoking access in one building leaves the same person’s other building role intact',async()=>{
 const removed=await request(owner,`/buildings/${first}/team-access/members/${employee.id}`,'DELETE');
 assert.equal(removed.status,200);
 const buildings=await request(employee,'/buildings');
 assert.deepEqual(buildings.body.map(row=>Number(row.id)),[Number(second)]);
 assert.equal((await request(employee,`/buildings/${second}/team-access`)).body.actor_role.role_key,'maintenance');
});

test('building groups apply the selected per-building role and replace individual roles',async()=>{
 await db.query('INSERT INTO app_contacts(low_id,high_id,requester_id,status) VALUES($1,$2,$1,\'accepted\')',[Math.min(owner.id,peer.id),Math.max(owner.id,peer.id)]);
 await request(owner,'/teams');
 const team=(await db.query('SELECT id FROM app_teams WHERE owner_id=$1 AND is_default=true',[owner.id])).rows[0];
 const made=await request(owner,`/teams/${team.id}/groups`,'POST',{name:'Campus Nord',building_ids:[first,second]});
 assert.equal(made.status,201,JSON.stringify(made.body));
 const firstRoles=await ensureBuildingRoles(db,first),secondRoles=await ensureBuildingRoles(db,second);
 const assigned=await request(owner,`/teams/${team.id}/groups/${made.body.id}/assign`,'POST',{user_id:peer.id,role_building_id:first,role_id:firstRoles.find(role=>role.role_key==='maintenance').id});
 assert.equal(assigned.status,200,JSON.stringify(assigned.body));
 assert.equal((await db.query('SELECT r.role_key FROM app_building_members m JOIN app_building_roles r ON r.id=m.role_id WHERE m.building_id=$1 AND m.user_id=$2',[first,peer.id])).rows[0].role_key,'maintenance');
 assert.equal((await db.query('SELECT r.name FROM app_building_members m JOIN app_building_roles r ON r.id=m.role_id WHERE m.building_id=$1 AND m.user_id=$2',[second,peer.id])).rows[0].name,'Maintenance');
 assert.equal((await db.query('SELECT status FROM app_building_members WHERE building_id=$1 AND user_id=$2',[second,peer.id])).rows[0].status,'pending');
 const custom=await request(owner,`/buildings/${first}/team-access/roles`,'POST',{name:'Group Inspector',can_manage_members:false,permissions:firstRoles.find(role=>role.role_key==='maintenance').permissions});
 assert.equal(custom.status,201,JSON.stringify(custom.body));
 const copied=await request(owner,`/teams/${team.id}/groups/${made.body.id}/assign`,'POST',{user_id:peer.id,role_building_id:first,role_id:custom.body.id});
 assert.equal(copied.status,200,JSON.stringify(copied.body));
 const copiedRole=(await db.query('SELECT r.name,r.permissions FROM app_building_members m JOIN app_building_roles r ON r.id=m.role_id WHERE m.building_id=$1 AND m.user_id=$2',[second,peer.id])).rows[0];
 assert.equal(copiedRole.name,'Group Inspector');
 assert.deepEqual(copiedRole.permissions,custom.body.permissions);
});


test('native team titles and optional backgrounds remain owner-controlled and do not alter building roles',async()=>{
 const team=(await request(owner,'/teams')).body.find(t=>t.buildings.some(b=>Number(b.id)===Number(first)));
 assert.ok(team);
 const before=(await request(manager,`/buildings/${first}/team-access`)).body.actor_role.role_key;
 const people=await request(owner,`/teams/${team.id}/members`);
 assert.equal(people.status,200);assert.equal(new Set(people.body.map(p=>p.id)).size,people.body.length);
 assert.equal((await request(manager,`/teams/${team.id}`,'PATCH',{background_color:'#123456'})).status,403);
 assert.equal((await request(manager,`/teams/${team.id}/titles`,'POST',{name:'Sensorik'})).status,403);
 const title=await request(owner,`/teams/${team.id}/titles`,'POST',{name:'Native Sensorik'});
 assert.equal(title.status,201);
 assert.equal((await request(owner,`/teams/${team.id}/members/${manager.id}/title`,'PUT',{title_id:title.body.id})).status,200);
 assert.equal((await request(owner,`/teams/${team.id}/members`)).body.find(p=>p.id===manager.id).title,'Native Sensorik');
 const deletedTitle=await request(owner,`/teams/${team.id}/titles/${title.body.id}`,'DELETE');
 assert.equal(deletedTitle.status,200);
 assert.equal((await request(owner,`/teams/${team.id}/titles`)).body.some(item=>item.id===title.body.id),false);
 assert.equal((await request(manager,`/buildings/${first}/team-access`)).body.actor_role.role_key,before);
 const other=await request(owner,'/teams','POST',{name:'Anderes Team'});
 assert.equal((await request(owner,`/teams/${other.body.id}/members/${manager.id}/title`,'PUT',{title_id:title.body.id})).status,400);
 const changed=await request(owner,`/teams/${team.id}`,'PATCH',{background_color:'#123456'});
 assert.equal(changed.status,200);assert.equal(changed.body.background_color,'#123456');
 assert.equal((await request(owner,`/teams/${team.id}`,'PATCH',{background_color:'invalid'})).status,400);
 assert.equal((await request(owner,`/teams/${team.id}`,'PATCH',{background_color:null})).body.background_color,null);
});


