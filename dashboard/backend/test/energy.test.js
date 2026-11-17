const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
const {dailyFromCounter,energyOverview}=require('../src/energy');
let db,server,url,owner,stranger,building;
before(async()=>{
 const pg=new PGlite();await pg.waitReady;
 db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}}),close:()=>pg.close()};
 await initAccounts(db);
 const app=express();app.use(express.json({limit:'2mb'}));app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port+'/api/v1';
 const register=async n=>(await request('/auth/register','POST',{name:n,email:n.toLowerCase()+'@example.test',password:'SafeTestPassword'+n+'1'})).data;
 owner=await register('Owner');stranger=await register('Stranger');
 building=(await request('/buildings','POST',{name:'Haus'},owner.token)).data;
 const b='/buildings/'+building.id+'/home-assistant';
 await request(b+'/app-connect','POST',{instance_name:'Zuhause'},owner.token);
 await request(b+'/inventory','PUT',{areas:[],devices:[],entities:[{entity_id:'sensor.zaehler',name:'Hauszähler',device_class:'energy',unit:'kWh'},{entity_id:'sensor.leistung',name:'Hausleistung',device_class:'power',unit:'W'}]},owner.token);
 await request(b+'/entities','PUT',{selected:['sensor.zaehler','sensor.leistung']},owner.token);
});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
async function request(path,method='GET',body,session){
 const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(session?{'X-D21-Session':session}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json()};
}
test('counter deltas ignore resets and jumps',()=>{
 const d=dailyFromCounter([{value:100,measured_at:'2026-11-16T08:00:00Z'},{value:103,measured_at:'2026-11-16T12:00:00Z'},{value:0.5,measured_at:'2026-11-16T13:00:00Z'},{value:2,measured_at:'2026-11-16T20:00:00Z'},{value:9000,measured_at:'2026-11-16T21:00:00Z'}]);
 assert.deepEqual([...d],[['2026-11-16',4.5]]);
});
test('overview: daily kWh, current watts, night base load and hints',async()=>{
 const now=new Date(),points=[];let counter=1000;
 for(let day=9;day>=0;day--)for(const h of [0,6,12,18,23]){
  const t=new Date(now.getTime()-day*86400000);t.setUTCHours(h,0,0,0);if(t>now)continue;
  counter+=day===1?3:1.5;points.push({entity_id:'sensor.zaehler',value:counter,measured_at:t.toISOString()});
 }
 for(let day=6;day>=1;day--)for(const h of [1,2,3]){const t=new Date(now.getTime()-day*86400000);t.setUTCHours(h,0,0,0);points.push({entity_id:'sensor.leistung',value:240,measured_at:t.toISOString()});}
 points.push({entity_id:'sensor.leistung',value:812,measured_at:new Date(now.getTime()-60000).toISOString()});
 const s=await request('/buildings/'+building.id+'/home-assistant/samples','POST',{points},owner.token);assert.equal(s.status,201,JSON.stringify(s.data));
 const r=await request('/buildings/'+building.id+'/energy-overview','GET',undefined,owner.token);
 assert.equal(r.status,200);
 assert.equal(r.data.daily.length,30);assert.ok(r.data.totals.avg_day_kwh>0);
 assert.equal(r.data.power[0].watts,812);assert.equal(r.data.base_load_w,240);
 assert.ok(r.data.hints.some(h=>/Nachts laufen dauerhaft etwa 240 W/.test(h)),JSON.stringify(r.data.hints));
 assert.equal((await request('/buildings/'+building.id+'/energy-overview','GET',undefined,stranger.token)).status,404);
 const {runTool}=require('../src/assistant-tools');
 const t=await runTool(db,{user:owner.user.id,building:building.id},'energy',{});
 assert.equal(t.base_load_w,240);
});
test('without Home Assistant the overview is empty, not an error',async()=>{
 const other=(await request('/buildings','POST',{name:'Leer'},owner.token)).data;
 const r=await energyOverview(db,{id:other.id});assert.deepEqual(r.meters,[]);assert.equal(r.totals.today_kwh,null);
});
