const {test}=require('node:test'),assert=require('node:assert/strict');
const {roomDeviceLights}=require('../src/room-lighting');
test('remote light reads run concurrently, not one full timeout per lamp',async()=>{
 let active=0,max=0;
 const db={query:async sql=>({rows:sql.includes('app_lamp_locations')?[{space_id:1,light_key:'one'},{space_id:2,light_key:'two'}]:[]})};
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
