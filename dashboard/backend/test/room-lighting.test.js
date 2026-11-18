const {test}=require('node:test'),assert=require('node:assert/strict');
const {roomDeviceLights,spaceFinder}=require('../src/room-lighting');
test('rooms resolve by GlobalId, long name, number and escaped IFC names without ambiguous guesses',()=>{
 const a='0000000000000000000001',b='0000000000000000000002';
 const find=spaceFinder(Buffer.from(`#10=IFCSPACE('${a}',$,'01',$,$,$,$,'Büro, O''Brien',.ELEMENT.);\n#11=IFCSPACE('${b}',$,'02',$,$,$,$,'Flur',.ELEMENT.);\n#12=IFCSPACE('0000000000000000000003',$,'03',$,$,$,$,'Flur',.ELEMENT.);\n#13=IFCSPACE('0000000000000000000004',$,'04',$,$,$,$,'B\\X2\\00FC\\X0\\ro',.ELEMENT.);`));
 assert.equal(find({room:' 01 '}),10);assert.equal(find({room:"Büro, O'Brien"}),10);
 assert.equal(find({room:"01 · Büro, O'Brien"}),10);assert.equal(find({room:'Büro'}),13);
 assert.equal(find({room:'Flur'}),null);assert.equal(find({room_gid:b,room:'Flur'}),11);
 assert.equal(find({room_gid:'unknown',room:'01'}),null);
});
test('unbound simulated lamps follow a unique building room, never a leftover model express ID',async()=>{
 const content=Buffer.from("#20=IFCSPACE('0000000000000000000001',$,'01',$,$,$,$,'Arbeitszimmer',.ELEMENT.);");
 const db={query:async sql=>({rows:sql.includes('FROM app_documents')?[{building_id:1,content}]:sql.includes('FROM app_devices')?[{document_id:null,space_id:999,room:'Arbeitszimmer',is_on:true,rgb:[30,80,200],brightness:90}]:[]})};
 const out=await roomDeviceLights(db,1,3,{getConfig:()=>({})});
 assert.equal(out.length,1);assert.equal(out[0].space_id,20);assert.equal(out[0].brightness,90);
});
test('all selected lamp rooms beyond the old first-fifty cutoff are included',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const {initAccounts}=require('../src/accounts');
 const pg=new PGlite();await pg.waitReady;const db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};
 try {
  await initAccounts(db);await db.query("INSERT INTO app_users(id,name,email,password_hash) VALUES(1,'Owner','owner@example.test','x')");
  const building=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES(1,'Haus') RETURNING id")).rows[0].id;
  const content=Buffer.from(Array.from({length:75},(_,i)=>`#${i+10}=IFCSPACE('${String(i+1).padStart(22,'0')}',$,'${i+1}',$,$,$,$,'Zimmer ${i+1}',.ELEMENT.);`).join('\n'));
  const document=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Haus.ifc','application/x-step',$2,$3) RETURNING id",[building,content.length,content])).rows[0].id;
  await db.query("INSERT INTO app_ha_links(id,building_id,user_id,status,mode) VALUES('lights',$1,1,'active','app')",[building]);
  await db.query("INSERT INTO app_twin_records(id,user_id,entity,data) SELECT 'r'||n,1,'Room',jsonb_build_object('name','Zimmer '||n,'building_id',$1::text,'ifc_global_id',lpad(n::text,22,'0')) FROM generate_series(1,75) n",[String(building)]);
  await db.query("INSERT INTO app_ha_entities(link_id,entity_id,name,metric,source_unit,selected,room_id,light_state) SELECT 'lights','light.room_'||n,'Licht '||n,'light','',true,'r'||n,jsonb_build_object('available',true,'is_on',true,'updated_at',$1::text,'brightness',200,'rgb',jsonb_build_array(30,80,200)) FROM generate_series(1,75) n",[new Date().toISOString()]);
  const out=await roomDeviceLights(db,1,document,{getConfig:()=>({})});
  assert.equal(out.length,75);assert.equal(out.find(r=>r.space_id===84).on,true);assert.equal(out.find(r=>r.space_id===84).brightness,200);
 } finally { await pg.close(); }
});
test('remote light reads run concurrently, not one full timeout per lamp',async()=>{
 let active=0,max=0;
 const db={query:async sql=>({rows:sql.includes('app_lamp_locations')?[{space_id:1,document_id:3,light_key:'one'},{space_id:2,document_id:3,light_key:'two'}]:[]})};
 const out=await roomDeviceLights(db,1,3,{
  getConfig:()=>({account_id:1,base_url:'https://ha.example.test',lights:[{key:'one',entity_id:'light.one',name:'One',room:'A'},{key:'two',entity_id:'light.two',name:'Two',room:'B'}]}),getToken:()=> 'test-token-long-enough',
  fetch:async url=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,10));active--;return new Response(JSON.stringify({entity_id:url.split('/').at(-1),state:'on',attributes:{brightness:100}}));}
 });
 assert.equal(max,2);assert.equal(out.length,2);assert.ok(out.every(r=>r.on));
});
test('old imported snapshots do not keep a room lit as if still live',async()=>{
 const gid='0xJTxmotLAXekNhP8q7Df8';
 const db={query:async sql=>({rows:sql.includes('FROM app_documents')?[{building_id:1,content:Buffer.from(`#20=IFCSPACE('${gid}',$,'Office',$,$,$,$,$);`)}]:sql.includes('FROM app_ha_links')?[{owner:1,mode:'app',status:'active',entity_id:'light.office',name:'Office',room_id:'r1',room_gid:gid,room_name:'Office',light_state:{available:true,is_on:true,updated_at:'2020-01-01T00:00:00Z'}}]:[]})};
 const out=await roomDeviceLights(db,1,3,{getConfig:()=>({account_id:99})});
 assert.equal(out[0].on,false);assert.equal(out[0].available,false);
});
