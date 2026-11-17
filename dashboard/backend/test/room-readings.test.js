const {test}=require('node:test'),assert=require('node:assert/strict');
const {mergeRoomReadings}=require('../src/room-readings');
const now=Date.parse('2026-11-17T12:00:00Z'),time=new Date(now).toISOString();
test('combines different devices and metrics without crossing rooms',()=>{
 const rows=mergeRoomReadings([
  {space_id:1,device_id:'esp',source:'real',updated_at:time,values:[{metric:'temperature',value:21},{metric:'humidity',value:44}]},
  {space_id:1,device_id:'co2',source:'real',updated_at:time,values:[{metric:'co2',value:700}]},
  {space_id:2,source:'real',updated_at:time,values:[{metric:'temperature',value:18}]}
 ],now);
 assert.deepEqual(rows[0].values.map(v=>v.value),[21,44,700]);assert.equal(rows[0].readings.length,3);assert.equal(rows[1].values[0].value,18);
});
test('prefers actual readings, preserves old individual timestamps and exposes mixed sources',()=>{
 const rows=mergeRoomReadings([
  {space_id:1,source:'real',updated_at:'2026-11-17T10:00:00Z',values:[{metric:'temperature',value:19}]},
  {space_id:1,source:'simulation',updated_at:time,values:[{metric:'temperature',value:25},{metric:'humidity',value:50}]},
  {space_id:1,source:'real',updated_at:time,values:[{metric:'co2',value:800}]}
 ],now);
 assert.equal(rows[0].values[0].value,19);assert.equal(rows[0].values[0].stale,true);assert.equal(rows[0].stale,true);assert.equal(rows[0].source,'mixed');
});
test('invalid IDs and readings never enter room summaries',()=>{
 assert.deepEqual(mergeRoomReadings([{space_id:0,values:[{metric:'co2',value:500}]},{space_id:2,values:[{metric:'pressure',value:900},{metric:'temperature',value:Infinity}]}],now),[]);
});
