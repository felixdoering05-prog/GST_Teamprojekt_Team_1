const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {runTool,trend,toolDeclarations}=require('../src/assistant-tools');
let db,server,url,owner,member,outsider,building,other,calls=[],script=[];
const mockKey='test-key-not-a-real-gemini-key';
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query('INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,name+'@example.test','unused'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(u.token).digest('hex'),u.id,new Date(Date.now()+86400000)]);await db.query("INSERT INTO app_ai_preferences(user_id,enabled,policy_version,revision) VALUES($1,true,1,1)",[u.id]);return u;}
 owner=await user('Owner');member=await user('Member');outsider=await user('Outsider');
 building=(await db.query('INSERT INTO app_buildings(user_id,name,address) VALUES($1,$2,$3) RETURNING id',[owner.id,'D21 Tools','Testweg 1'])).rows[0];
 other=(await db.query('INSERT INTO app_buildings(user_id,name) VALUES($1,$2) RETURNING id',[outsider.id,'Fremdgebäude'])).rows[0];
 await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building.id,member.id]);
 const ifc=async(b,rooms,counts)=>{const d=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Modell.ifc','application/x-step',3,$2) RETURNING id",[b,Buffer.from('ISO')])).rows[0];
  await db.query("INSERT INTO app_ifc_analysis(document_id,status,report) VALUES($1,'ready',$2)",[d.id,JSON.stringify({version:2,schema:'IFC4',entity_count:900,counts,rooms,schema_issue_count:0,warnings:[],information_rules:[{name:'IFCSPACE names',passed:true}]})]);return d;};
 const first=await ifc(building.id,[{name:'Büro 1',storey:'EG',area_m2:20.5,area_source:'geometrie',height_m:2.6,volume_m3:53.3},{name:'Flur',storey:'EG',area_m2:12},{name:'Labor',storey:'OG',area_m2:null}],{IfcSpace:3,IfcWall:14,IfcDoor:5,IfcBuildingStorey:2,IfcCartesianPoint:800});
 const foreign=await ifc(other.id,[{name:'GEHEIMRAUM',storey:'EG',area_m2:99}],{IfcSpace:1});
 globalThis.docs={first,foreign};
 const rec=(user,entity,data)=>db.query('INSERT INTO app_twin_records(id,user_id,entity,data) VALUES($1,$2,$3,$4)',[randomUUID(),user,entity,JSON.stringify(data)]);
 const sensor=randomUUID();await db.query('INSERT INTO app_twin_records(id,user_id,entity,data) VALUES($1,$2,$3,$4)',[sensor,owner.id,'Sensor',JSON.stringify({building_id:String(building.id),name:'Fühler Büro',sensor_code:'T1',metric:'temperature',unit:'°C',source:'real',room_id:'R1'})]);
 for(let i=0;i<6;i++)await rec(owner.id,'Measurement',{building_id:String(building.id),sensor_id:sensor,sensor_code:'T1',metric:'temperature',unit:'°C',value:20+i,measured_at:new Date(Date.UTC(2026,10,14,8+i)).toISOString(),source:'real',quality:'ok'});
 await rec(outsider.id,'Measurement',{building_id:String(other.id),sensor_id:'x',metric:'temperature',value:99,measured_at:new Date().toISOString(),source:'real',quality:'ok'});
 await db.query("INSERT INTO app_building_locations(building_id,latitude,longitude) VALUES($1,51.5,7.4)",[building.id]);
 const hourly=Array.from({length:24},(_,i)=>({time:new Date(Date.now()+i*3600000).toISOString(),temperature:i<12?5:28,radiation:i===13?750:100}));
 await db.query("INSERT INTO app_building_weather(building_id,coordinate_key,data) VALUES($1,'51.500,7.400',$2)",[building.id,JSON.stringify({provider:'Open-Meteo',kind:'Wettermodell / Prognose, keine Gebäudemessung',current:{time:new Date().toISOString(),temperature:6},hourly,attribution:'Open-Meteo · CC BY 4.0'})]);
 await db.query("INSERT INTO app_devices(building_id,name,room,kind,mode,integration,is_on,request_key) VALUES($1,'Deckenlicht','Büro 1','light','simulation','none',true,$2)",[building.id,randomUUID()]);
 await db.query("INSERT INTO app_devices(building_id,name,room,kind,mode,integration,request_key) VALUES($1,'FREMDLAMPE','x','light','simulation','none',$2)",[other.id,randomUUID()]);
 const mockFetch=async(u,options)=>{calls.push({url:u,body:JSON.parse(options.body)});const next=script.shift()||{text:'Fertig.'};
  const parts=next.call?[{functionCall:next.call,thoughtSignature:'sig'}]:next.calls?next.calls.map(c=>({functionCall:c})):[{text:next.text}];
  return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{role:'model',parts}}]})};};
 const app=express();app.use(express.json({limit:'16kb'}));app.use('/api/v1',accountRouter(db,{assistant:{enabled:true,getKey:()=>mockKey,fetch:mockFetch}}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function request(user,path,body,key){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-D21-Session':user.token,...(key?{'X-Request-ID':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
async function ask(user,q='Wie groß ist das EG?'){
 await db.query("UPDATE app_ai_requests SET created_at=now()-interval '2 hours'");
 const info=await request(user,`/buildings/${building.id}/assistant`);
 return request(user,`/buildings/${building.id}/assistant`,{question:q,consent:'yes',context_hash:info.body.context_hash,chat:true},randomUUID());
}
test('declarations are read-only and the chat offers them to Gemini',async()=>{
 assert.deepEqual(toolDeclarations.map(t=>t.name),['ifc_rooms','ifc_elements','measurements','weather_heat','devices','ifc_quantities','ifc_clashes','ifc_find_elements','ifc_model_diff']);
 calls=[];script=[{text:'Hallo.'}];const r=await ask(owner,'Hallo');assert.equal(r.status,200);
 assert.ok(calls[0].body.tools[0].functionDeclarations.length===9);assert.match(calls[0].body.systemInstruction.parts[0].text,/Vorschlag:/);
 assert.equal(r.body.answer,'Hallo.');
});
test('tool loop answers room areas for a member and returns the model turn unchanged',async()=>{
 calls=[];script=[{call:{name:'ifc_rooms',args:{storey:'EG'},id:'c1'}},{text:'Das EG hat 32,5 m².'}];
 const r=await ask(member);assert.equal(r.status,200);
 assert.match(r.body.answer,/32,5 m²/);assert.match(r.body.answer,/Abgefragt: IFC-Raumliste\./);
 assert.equal(calls.length,2);const second=calls[1].body.contents;
 assert.equal(second.at(-2).parts[0].thoughtSignature,'sig');
 const result=second.at(-1).parts[0].functionResponse;assert.equal(result.id,'c1');assert.equal(result.name,'ifc_rooms');
 assert.equal(result.response.result.storeys.find(s=>s.storey==='EG').area_m2,32.5);assert.equal(result.response.result.rooms_matching,2);
 const sent=JSON.stringify(calls);for(const secret of ['GEHEIMRAUM','FREMDLAMPE',mockKey,'@example.test'])assert.equal(sent.includes(secret),false);
 const history=await request(member,`/buildings/${building.id}/assistant/history`);assert.match(history.body.at(-1).answer,/Abgefragt/);
});
test('rounds are bounded: final round disables function calling',async()=>{
 calls=[];script=[1,2,3].map(()=>({call:{name:'devices',args:{}}})).concat([{text:'Genug.'}]);
 const r=await ask(owner,'Welche Geräte?');assert.equal(r.status,200);assert.equal(calls.length,4);
 assert.deepEqual(calls[3].body.toolConfig,{functionCallingConfig:{mode:'NONE'}});assert.equal(calls[2].body.toolConfig,undefined);
 calls=[];script=[{calls:[1,2,3,4,5].map(()=>({name:'devices',args:{}}))}];assert.equal((await ask(owner,'Viel?')).status,502);
});
test('model commands stay without tools',async()=>{
 calls=[];script=[{text:JSON.stringify({action:'hide',target:'walls',color:null,summary:'Wände ausblenden'})}];
 const info=await request(owner,`/buildings/${building.id}/assistant?mode=ifc-command`);
 await db.query("UPDATE app_ai_requests SET created_at=now()-interval '2 hours'");
 const r=await request(owner,`/buildings/${building.id}/assistant`,{question:'Blende Wände aus',consent:'yes',context_hash:info.body.context_hash,mode:'ifc-command',chat:true},randomUUID());
 assert.equal(r.status,200);assert.equal(calls[0].body.tools,undefined);
});
test('tools are scoped, bounded and describe limits',async()=>{
 const ctx={user:member.id,building:building.id};
 const rooms=await runTool(db,ctx,'ifc_rooms',{});assert.equal(rooms.rooms[0].area_source,'aus Raumgeometrie berechnet');assert.equal(rooms.rooms[0].height_m,2.6);assert.match(rooms.meaning,/im Hintergrund neu analysiert/);
 const elements=await runTool(db,ctx,'ifc_elements',{});assert.equal(elements.element_counts.IfcWall,14);assert.equal(elements.element_counts.IfcCartesianPoint,undefined);
 const m=await runTool(db,ctx,'measurements',{metric:'temperature'});const t=m.metrics[0];
 assert.equal(t.count,6);assert.equal(t.last.value,25);assert.equal(t.trend.direction,'steigend');assert.equal(t.trend.per_hour,1);assert.equal(t.threshold_breaches.critical,0);assert.equal(t.threshold_breaches.warning,0);
 assert.equal(t.latest_per_sensor[0].sensor,'Fühler Büro');
 const w=await runTool(db,ctx,'weather_heat',{});assert.equal(w.heat_estimate.hours_below_15c,12);assert.equal(w.heat_estimate.heating_degree_hours_base_15c,120);assert.equal(w.heat_estimate.hours_above_26c,12);assert.equal(w.peak_radiation.w_per_m2,750);
 const d=await runTool(db,ctx,'devices',{});assert.deepEqual(d.devices.map(x=>x.name),['Deckenlicht']);assert.equal(d.devices[0].is_on,true);
 assert.match((await runTool(db,{user:outsider.id,building:building.id},'ifc_rooms',{})).error,/Kein Zugriff/);
 assert.match((await runTool(db,ctx,'ifc_rooms',{model_number:3})).error,/Kein IFC-Modell/);
 assert.match((await runTool(db,ctx,'delete_everything',{})).error,/Unbekannt/);
 assert.equal(trend([{value:1,measured_at:'2026-01-01T00:00:00Z'}]),null);
});

test('ifc5d, ifcclash, selector and ifcdiff results are served from background insights',async()=>{
 const ctx={user:member.id,building:building.id};
 assert.match((await runTool(db,ctx,'ifc_quantities',{})).error,/Hintergrundauswertung/);
 assert.match((await runTool(db,ctx,'ifc_model_diff',{})).error,/mindestens zwei/);
 const items=[{id:'a',c:'IfcWall',n:'Außenwand Süd',s:'EG',m:'Beton',x:true,l:true},{id:'b',c:'IfcWallStandardCase',n:'Innenwand',s:'EG',m:'Kalksandstein',x:false,l:false},{id:'c',c:'IfcWindow',n:'Fenster 1',s:'OG',m:null,x:true,l:null}];
 await db.query("INSERT INTO app_ifc_insights(document_id,status,data) VALUES($1,'ready',$2)",[docs.first.id,JSON.stringify({version:1,elements:{items,total:3},quantities:{by_type:{IfcWall:{count:2,NetSideArea_m2:40}},window_to_external_wall_ratio:0.2},clashes:{count:1,items:[{a:{class:'IfcWall',name:'Außenwand Süd'},b:{class:'IfcStair',name:'Treppe'},type:'pierce',depth_m:1.9}]}})]);
 await db.query("INSERT INTO app_ifc_insights(document_id,status,data) VALUES($1,'ready',$2)",[docs.foreign.id,JSON.stringify({elements:{items:[{c:'IfcWall',n:'GEHEIMWAND'}]}})]);
 assert.equal((await runTool(db,ctx,'ifc_quantities',{})).by_type.IfcWall.NetSideArea_m2,40);
 assert.equal((await runTool(db,ctx,'ifc_clashes',{})).items[0].b.name,'Treppe');
 const walls=await runTool(db,ctx,'ifc_find_elements',{ifc_class:'IfcWall'});assert.equal(walls.match_count,2);
 const ext=await runTool(db,ctx,'ifc_find_elements',{is_external:true,material:'beton'});assert.deepEqual(ext.items.map(e=>e.name),['Außenwand Süd']);
 assert.equal((await runTool(db,ctx,'ifc_find_elements',{storey:'OG'})).items[0].class,'IfcWindow');
 assert.equal(JSON.stringify(await runTool(db,ctx,'ifc_find_elements',{})).includes('GEHEIMWAND'),false);
 const second=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Modell-v2.ifc','application/x-step',3,$2) RETURNING id",[building.id,Buffer.from('ISO')])).rows[0];
 assert.match((await runTool(db,ctx,'ifc_model_diff',{})).error,/läuft noch/);
 await db.query("INSERT INTO app_ifc_diffs(old_document_id,new_document_id,status,data) VALUES($1,$2,'ready',$3)",[docs.first.id,second.id,JSON.stringify({common_count:0,added_count:5,deleted_count:3,changed_count:0,added:[],deleted:[],changed:[]})]);
 const diff=await runTool(db,ctx,'ifc_model_diff',{});assert.equal(diff.added_count,5);assert.equal(diff.likely_different_models,true);
 assert.match((await runTool(db,ctx,'ifc_quantities',{})).error,/Hintergrundauswertung/,'newest model (no insights yet) is model 1');
 assert.equal((await runTool(db,ctx,'ifc_quantities',{model_number:2})).by_type.IfcWall.count,2);
});
