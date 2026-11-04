const {homeAssistantService}=require('./home-assistant');
async function roomDeviceLights(db,user,document,options={}){
 const values=(await db.query("SELECT space_id,is_on,rgb,brightness FROM app_devices WHERE document_id=$1 AND space_id IS NOT NULL AND mode='simulation' AND kind IN ('light','plug')",[document])).rows.map(x=>({...x,available:true}));
 const ha=homeAssistantService(options),config=ha.configuration(user);
 if(config){
  const bindings=(await db.query('SELECT space_id,light_key FROM app_lamp_locations WHERE user_id=$1 AND document_id=$2 AND space_id IS NOT NULL',[user,document])).rows;
  for(const binding of bindings){const light=config.lights.find(x=>x.key===binding.light_key);if(!light)continue;try{values.push({...await ha.state(config,light),space_id:binding.space_id});}catch{values.push({space_id:binding.space_id,available:false,is_on:null});}}
 }
 const groups=new Map();for(const value of values){if(!groups.has(value.space_id))groups.set(value.space_id,[]);groups.get(value.space_id).push(value);}
 return [...groups].map(([space_id,lamps])=>{const on=lamps.filter(x=>x.available&&x.is_on),colors=on.map(x=>x.rgb||[255,231,211]);return {space_id,available:lamps.every(x=>x.available),on:on.length>0,rgb:colors.length?[0,1,2].map(i=>Math.round(colors.reduce((sum,x)=>sum+x[i],0)/colors.length)):[255,231,211],brightness:on.length?Math.max(...on.map(x=>x.brightness??255)):0};});
}
module.exports={roomDeviceLights};
