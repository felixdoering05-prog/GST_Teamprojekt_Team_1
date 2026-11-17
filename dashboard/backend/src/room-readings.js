// Combine sources per room instead of letting the last ESP32 hide a CO2 sensor.
const METRICS=['temperature','humidity','co2'];
function mergeRoomReadings(rows,now=Date.now()){
 const groups=new Map();
 for(const row of rows){
  if(!Number.isInteger(row.space_id)||row.space_id<=0)continue;
  if(!groups.has(row.space_id))groups.set(row.space_id,{...row,values:[],readings:[]});
  const group=groups.get(row.space_id);
  for(const value of row.values||[]){
   if(!METRICS.includes(value.metric)||!Number.isFinite(value.value))continue;
   const measured_at=value.measured_at||row.updated_at||null;
   const stale=!Number.isFinite(Date.parse(measured_at))||now-Date.parse(measured_at)>180000;
   const entry={...value,measured_at,source:value.source||row.source,stale,device_id:row.device_id||null,sensor_id:value.sensor_id||null};
   const duplicate=entry.sensor_id?group.readings.findIndex(v=>v.sensor_id===entry.sensor_id&&v.metric===entry.metric&&v.source===entry.source):-1;
   if(duplicate<0)group.readings.push(entry);
   else if((Date.parse(entry.measured_at)||0)>=(Date.parse(group.readings[duplicate].measured_at)||0))group.readings[duplicate]={...group.readings[duplicate],...entry};
  }
 }
 for(const group of groups.values()){
  group.values=METRICS.flatMap(metric=>{
   const values=group.readings.filter(v=>v.metric===metric).sort((a,b)=>(b.source==='real')-(a.source==='real')||(Date.parse(b.measured_at)||0)-(Date.parse(a.measured_at)||0));
   return values.length?[values[0]]:[];
  });
  group.updated_at=group.values.map(v=>v.measured_at).filter(Boolean).sort().at(-1)||null;
  group.stale=group.values.some(v=>v.stale);
  group.source=group.values.every(v=>v.source==='real')?'real':group.values.some(v=>v.source==='real')?'mixed':'demo';
 }
 return [...groups.values()].filter(g=>g.values.length);
}
module.exports={mergeRoomReadings};
