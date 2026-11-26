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
test('missing counter intervals stay unknown, measured zero stays zero; multiple power meters do not invent a base load',async()=>{
 const now=new Date('2026-11-18T12:00:00Z');
 const entities=[{entity_id:'empty',name:'Ohne Verlauf',metric:'energy'},{entity_id:'zero',name:'Nullverbrauch',metric:'energy'},{entity_id:'p1',name:'Hauptzähler',metric:'power'},{entity_id:'p2',name:'Unterzähler',metric:'power'}];
 const samples=[{entity_id:'empty',value:10,measured_at:'2026-11-18T08:00:00Z'},{entity_id:'zero',value:10,measured_at:'2026-11-18T08:00:00Z'},{entity_id:'zero',value:10,measured_at:'2026-11-18T10:00:00Z'},...['p1','p2'].flatMap(entity_id=>Array.from({length:6},(_,i)=>({entity_id,value:entity_id==='p1'?300:100,measured_at:`2026-11-18T01:${String(i*5).padStart(2,'0')}:00Z`})) )];
 const fake={query:async sql=>({rows:sql.includes('FROM app_ha_links')?[{id:1}]:sql.includes('FROM app_ha_entities')?entities:samples})};
 const r=await energyOverview(fake,{id:1},now);
 assert.equal(r.meters.find(m=>m.entity_id==='empty').today_kwh,null);
 assert.equal(r.meters.find(m=>m.entity_id==='empty').last7_kwh,null);
 assert.equal(r.meters.find(m=>m.entity_id==='zero').today_kwh,0);
 assert.equal(r.base_load_w,null);
});

test('building pass overview preserves Nala history, deduplicates retries and compares like units',async()=>{
 const create=(data)=>request('/twin/EnergyReading/create','POST',{data},owner.token);
 const legacy={building_id:String(building.id),meter_code:'WW-17',medium:'warmwasser',unit:'l',value:1200,
  period_start:'2026-10-01T00:00:00+02:00',period_end:'2026-10-31T23:59:00+01:00',source:'real'};
 const original=await create(legacy);assert.equal(original.status,200,JSON.stringify(original.data));
 const duplicate=await create({...legacy,unit:'m³',value:1.2,period_start:'2026-09-30T22:00:00Z',reading_date:'2026-11-01',cost_eur:0});
 assert.equal(duplicate.data.id,original.data.id);assert.equal(duplicate.data.duplicate,true);
 assert.equal((await create({...legacy,value:1400})).status,409);
 const current={...legacy,unit:'m³',value:1.8,unit_id:'1-og',unit_name:'1. OG',meter_reading:18,reading_date:'2026-11-24',
  period_start:'2026-11-01',period_end:'2026-11-23',cost_eur:12.5,capture_method:'manual'};
 assert.equal((await create(current)).status,200);
 assert.equal((await create({...current,unit:'kWh',value:42,meter_reading:null,cost_eur:null})).status,200);
 assert.equal((await create({...current,medium:'kaltwasser',reading_date:'2026-02-30'})).status,400);
 const path=`/energy-consumption?building=${building.id}&months=1&end=2026-11`;
 const overview=await request(path,'GET',undefined,owner.token);
 assert.equal(overview.status,200,JSON.stringify(overview.data));
 assert.deepEqual(overview.data.media,['strom','waerme','warmwasser','kaltwasser']);
 const warm=overview.data.summaries.find(row=>row.medium==='warmwasser');
 assert.deepEqual(warm.series.map(({unit,current,previous})=>[unit,current,previous]),[['m³',1.8,1.2],['kWh',42,null]]);
 assert.equal(warm.cost_eur,12.5);assert.equal(overview.data.reading_count,2);
 assert.deepEqual(overview.data.units,[{id:'1-og',name:'1. OG'}]);
 const detail=await request(path+'&unit=1-og&medium=warmwasser','GET',undefined,owner.token);
 assert.equal(detail.data.summaries.length,1);
 assert.equal(detail.data.readings.find(r=>r.unit==='m³').meter_reading,18);
 assert.equal(detail.data.summaries[0].series[0].previous,null);
 assert.equal((await request(path,'GET',undefined,stranger.token)).status,404);
 assert.equal((await request('/energy-consumption','GET',undefined,stranger.token)).data.reading_count,0);
});

test('consumption groups preserve separate water meters and keep exact medium filters', async () => {
 const created = await request('/buildings', 'POST', { name: 'Verbrauchsgruppen' }, owner.token);
 assert.equal(created.status, 201);
 const buildingID = String(created.data.id);
 for (const [medium, unit, value] of [
  ['kaltwasser', 'm³', 0], ['warmwasser', 'm³', 1.8], ['warmwasser', 'kWh', 42],
  ['strom', 'kWh', 320], ['pv_erzeugung', 'kWh', 75],
 ]) {
  const reading = await request('/twin/EnergyReading/create', 'POST', { data: {
   building_id: buildingID, meter_code: medium, medium, unit, value, reading_date: '2026-10-29', source: 'real',
  } }, owner.token);
  assert.equal(reading.status, 200, JSON.stringify(reading.data));
 }
 const path = `/energy-consumption?building=${buildingID}&months=1&end=2026-10`;
 const water = await request(path + '&group=wasser', 'GET', undefined, owner.token);
 assert.equal(water.status, 200);
 assert.deepEqual(water.data.summaries.map(item => [item.medium, item.series[0].current]),
  [['wasser', null], ['kaltwasser', 0], ['warmwasser', 1.8]]);
 assert.deepEqual(water.data.summaries[2].series.map(item => item.unit), ['m³', 'kWh']);
 assert.equal(water.data.reading_count, 3);
 assert.ok(water.data.readings.every(item => ['kaltwasser', 'warmwasser'].includes(item.medium)));
 const cold = await request(path + '&group=wasser&medium=kaltwasser', 'GET', undefined, owner.token);
 assert.equal(cold.data.reading_count, 1);
 assert.equal(cold.data.readings[0].medium, 'kaltwasser');
 assert.equal(cold.data.summaries.length, 3);
 const exact = await request(path + '&medium=warmwasser', 'GET', undefined, owner.token);
 assert.deepEqual(exact.data.summaries.map(item => item.medium), ['warmwasser']);
 const electricity = await request(path + '&group=strom', 'GET', undefined, owner.token);
 assert.equal(electricity.data.reading_count, 2);
 assert.equal(electricity.data.summaries.find(item => item.medium === 'pv_erzeugung').series[0].current, 75);
 assert.equal((await request(path + '&group=wasser&medium=strom', 'GET', undefined, owner.token)).status, 400);
 assert.equal((await request(path + '&group=__proto__', 'GET', undefined, owner.token)).status, 400);
 assert.equal((await request(path + '&group=wasser', 'GET', undefined, stranger.token)).status, 404);
});

test('imports the published Sites building pass months, metrics and unit values exactly once',async()=>{
 const importDemo=()=>request('/twin-functions/seedPassportEnergy','POST',{},owner.token);
 const imported=await importDemo();assert.equal(imported.status,200,JSON.stringify(imported.data));
 assert.equal(imported.data.readings_created,18);assert.equal(imported.data.reference_month,'2027-07');
 const repeated=await importDemo();assert.deepEqual(repeated.data,{building_id:imported.data.building_id,reference_month:'2027-07',readings_created:0});
 const path=`/energy-consumption?building=${imported.data.building_id}`;
 const data=(await request(path,'GET',undefined,owner.token)).data;
 assert.equal(data.source,'demo');assert.equal(data.reading_count,18);assert.equal(data.end,'2027-07');
 assert.equal(data.reference.version,6);assert.equal(data.reference.metrics.find(row=>row.label==='Wärmepumpen-COP').value,3.72);
 assert.deepEqual(data.units,[{id:'demo-unit',name:'Wohnung 2.04'}]);
 for(const medium of ['warmwasser','kaltwasser']){
  const empty=(await request(path+'&medium='+medium,'GET',undefined,owner.token)).data;
  assert.equal(empty.reading_count,0);
  assert.equal(empty.summaries[0].series[0].unit,'m³');
  assert.equal(empty.summaries[0].series[0].current,null);
  assert.equal(empty.summaries[0].cost_eur,null);
 }
 const power=(await request(path+'&medium=strom','GET',undefined,owner.token)).data;
 const unit=(await request(path+'&medium=strom&unit='+encodeURIComponent(data.units[0].id),'GET',undefined,owner.token)).data;
 assert.equal(power.reading_count,13);assert.equal(unit.reading_count,1);
 assert.equal(unit.summaries[0].series[0].current,84);
 const series=power.summaries[0].series[0];
 assert.equal(series.points.length,12);
 assert.deepEqual(series.points[0],{month:'2026-08', value:33200});
 assert.deepEqual(series.points.at(-1),{month:'2027-07',value:42800});
 const july=(await request(path+'&months=1&medium=strom','GET',undefined,owner.token)).data.summaries[0].series[0];
 assert.deepEqual([july.current,july.previous],[42800,42100]);
 const water=(await request(path+'&medium=wasser&unit=demo-unit','GET',undefined,owner.token)).data;
 assert.equal(water.readings[0].value,0.118);assert.equal(water.readings[0].unit,'m³');
 assert.equal(water.readings[0].reading_date,undefined);assert.equal(water.readings[0].meter_reading,null);
});
