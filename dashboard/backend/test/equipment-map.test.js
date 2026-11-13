const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite'),{randomBytes,randomUUID,createHash}=require('crypto');
const {initAccounts,accountRouter}=require('../src/accounts'),{ifcRooms}=require('../src/equipment'),{simplifyOSM}=require('../src/map-view');
let db,server,url,owner,member,other,building,second,foreign,doc,foreignDoc,device,haCalls=[],mapCalls=[],on=false,rgb=[255,0,0],brightness=255;
const bytes=Buffer.from("ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;#20=IFCSPACE('abc',$,'EG 01',$,$,$,$,'Büro',.ELEMENT.,.INTERNAL.,$);#21=IFCWALL('wall',$,'Wall',$,$,$,$,$);ENDSEC;END-ISO-10303-21;");
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),end:()=>pg.close()};await initAccounts(db);
 async function user(name){const u=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES($1,$2,'unused') RETURNING id",[name,name+'@example.test'])).rows[0];u.token=randomBytes(32).toString('hex');await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(u.token).digest('hex'),u.id]);return u;}
 owner=await user('Owner');member=await user('Member');other=await user('Other');
 async function addBuilding(user,name){return (await db.query('INSERT INTO app_buildings(user_id,name) VALUES($1,$2) RETURNING id',[user.id,name])).rows[0].id;}
 building=await addBuilding(owner,'D21');second=await addBuilding(owner,'Second');foreign=await addBuilding(other,'Foreign');await db.query("INSERT INTO app_building_members(building_id,user_id,status) VALUES($1,$2,'accepted')",[building,member.id]);
 async function addDoc(id){return (await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Model.ifc','application/x-step',$2,$3) RETURNING id",[id,bytes.length,bytes])).rows[0].id;}
 doc=await addDoc(building);foreignDoc=await addDoc(foreign);
 const ha=async(url,options)=>{haCalls.push({url,options});if(options.method==='POST'){const b=JSON.parse(options.body);on=url.endsWith('turn_on');if(b.rgb_color)rgb=b.rgb_color;if(b.brightness)brightness=b.brightness;return new Response('[]');}return new Response(JSON.stringify({entity_id:'light.desk',state:on?'on':'off',attributes:{supported_color_modes:['hs'],rgb_color:rgb,brightness}}));};
 const map=async(url,options)=>{mapCalls.push({url,options});return new Response(JSON.stringify({elements:[{type:'way',tags:{highway:'residential'},geometry:[{lat:50,lon:8},{lat:50.001,lon:8.001}]}]}));};
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db,{homeAssistant:{getConfig:()=>({base_url:'https://ha.example.test',account_id:owner.id,lights:[{key:'desk',name:'Desk',room:'Private',entity_id:'light.desk'}]}),getToken:()=> 'private-token-enough-characters',fetch:ha},mapView:{fetch:map}}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
async function req(user,path,method='GET',body){const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json','X-Request-ID':randomUUID(),...(user?{'X-D21-Session':user.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
const location=()=>`/integrations/home-assistant/lights/desk/location`;
test('IFC room index returns only spaces; selected model is access-scoped',async()=>{
 assert.deepEqual(ifcRooms(bytes),[{id:20,name:'EG 01 · Büro'}]);assert.equal((await req(other,`/documents/${doc}/model-rooms`)).status,404);assert.equal((await req(owner,`/documents/${doc}/model-rooms`)).data.rooms[0].id,20);
});
test('lamp assignment validates building ownership, model membership and space IDs with revisions',async()=>{
 const b={building_id:building,room:'Ignored',document_id:doc,space_id:20,revision:0};assert.equal((await req(other,location(),'PUT',b)).status,404);assert.equal((await req(owner,location(),'PUT',{...b,building_id:foreign})).status,403);assert.equal((await req(owner,location(),'PUT',{...b,document_id:foreignDoc})).status,404);assert.equal((await req(owner,location(),'PUT',{...b,space_id:21})).status,400);
 const saved=await req(owner,location(),'PUT',b);assert.equal(saved.status,200);assert.equal(saved.data.room,'EG 01 · Büro');assert.equal((await req(owner,location(),'PUT',b)).status,409);
 assert.equal((await req(owner,`/buildings/${building}/lamps`)).data.length,1);assert.deepEqual((await req(member,`/buildings/${building}/lamps`)).data,[]);
});
test('RGB writes use capability-checked exact payload and room glow is private and authoritative',async()=>{
 const a=await req(owner,'/integrations/home-assistant/lights/desk/command','POST',{on:true,rgb:[25,50,200],brightness:120});assert.equal(a.status,200);assert.equal(a.data.confirmed,true);assert.deepEqual(JSON.parse(haCalls.findLast(x=>x.options.method==='POST').options.body),{entity_id:'light.desk',rgb_color:[25,50,200],brightness:120});
 const view=await req(owner,`/documents/${doc}/model-state`);assert.deepEqual(view.data.device_lights[0].rgb,[25,50,200]);assert.equal(view.data.device_lights[0].on,true);assert.deepEqual((await req(member,`/documents/${doc}/model-state`)).data.device_lights,[]);
 const n=haCalls.length;assert.equal((await req(owner,'/integrations/home-assistant/lights/desk/command','POST',{on:true,rgb:[999,0,0]})).status,400);assert.equal(haCalls.length,n);
});
test('simulations can be assigned afterwards, recolored and moved without crossing another owner',async()=>{
 const created=await req(owner,`/buildings/${building}/devices`,'POST',{name:'Sim',room:'',kind:'light',mode:'simulation',integration:'none',request_key:randomUUID()});device=created.data.id;
 const base=`/buildings/${building}/devices/${device}`;
 assert.equal((await req(owner,base+'/location','PUT',{building_id:building,room:'',document_id:doc,space_id:20,revision:0})).status,200);
 const switched=await req(member,base,'PATCH',{is_on:true,rgb:[0,255,0],revision:1});assert.equal(switched.status,200);
 assert.equal((await req(member,`/documents/${doc}/model-state`)).data.device_lights[0].rgb[1],255);
 assert.equal((await req(owner,base+'/location','PUT',{building_id:foreign,room:'Elsewhere',revision:2})).status,404);
 assert.equal((await req(owner,base+'/location','PUT',{building_id:second,room:'Room 2',revision:2})).status,200);
 assert.equal((await req(owner,`/buildings/${second}/devices`)).data[0].document_id,null);
});
test('map location is explicit and owner-only; no remote query on read/save',async()=>{
 const b={latitude:50,longitude:8,heading:30,meters_per_unit:1,revision:0};const base=`/documents/${doc}/map-view`;
 assert.equal((await req(member,base,'PUT',b)).status,404);assert.equal((await req(owner,base,'PUT',{...b,longitude:181})).status,400);assert.equal((await req(owner,base,'PUT',b)).status,200);assert.equal((await req(owner,base,'PUT',b)).status,409);assert.equal(mapCalls.length,0);
 assert.equal((await req(owner,base+'/load','POST',{revision:1})).status,200);assert.equal(mapCalls.length,1);assert.ok(mapCalls[0].url.startsWith('https://ovp.dresel.systems/api/interpreter?data='));assert.equal(mapCalls[0].options.method,'GET');assert.equal(mapCalls[0].options.redirect,'error');assert.equal((await req(owner,base+'/load','POST',{revision:2})).status,409);
 const rotated=await req(owner,base,'PUT',{...b,heading:90,revision:2});assert.equal(rotated.status,200);assert.equal(rotated.data.map_view.features.length,1);assert.ok(rotated.data.map_view.loaded_at);assert.equal(mapCalls.length,1);
 const view=await req(member,`/documents/${doc}/model-state`);assert.equal(view.data.map_view.heading,90);assert.equal(view.data.map_view.features[0].kind,'road');
 const cached=await req(member,`/documents/${doc}/model-state?map_revision=${view.data.map_view.revision}`);
 assert.equal(Object.hasOwn(cached.data,'map_view'),false);
 const stale=await req(owner,base+'/load','POST',{revision:1});
 assert.equal(stale.status,409);assert.match(stale.data.error,/inzwischen geändert/);assert.equal(mapCalls.length,1);
});
test('OSM simplification bounds geometry, tags and missing heights without executable content',()=>{
 const ring=[{lat:50,lon:8},{lat:50,lon:8.001},{lat:50.001,lon:8.001},{lat:50,lon:8}];const value=simplifyOSM([{type:'way',tags:{building:'yes',name:'<script>bad</script>'},geometry:ring},{type:'way',tags:{highway:'path'},geometry:[{lat:0,lon:0},{lat:0,lon:1}]}],50,8);assert.equal(value.length,1);assert.equal(value[0].height,8);assert.equal(value[0].estimated_height,true);assert.equal(JSON.stringify(value).includes('script'),false);
});
test('persistent map quota blocks additional external queries across documents',async()=>{
 const n=mapCalls.length;for(let i=0;i<10;i++)await db.query("INSERT INTO app_map_requests(user_id,status) VALUES($1,'done')",[owner.id]);
 await db.query('UPDATE app_model_map_views SET last_attempt=NULL WHERE document_id=$1',[doc]);
 const current=(await req(owner,`/documents/${doc}/map-view`)).data.map_view;
 assert.equal((await req(owner,`/documents/${doc}/map-view/load`,'POST',{revision:current.revision})).status,429);assert.equal(mapCalls.length,n);
});
