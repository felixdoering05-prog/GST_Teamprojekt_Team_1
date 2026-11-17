const {homeAssistantService}=require('./home-assistant');
const {haLamps}=require('./ha-import');
const ifcText=v=>v.replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/gi,(_,h)=>String.fromCharCode(...h.match(/.{4}/g).map(x=>parseInt(x,16)))).replace(/\\S\\(.)/g,(_,c)=>String.fromCharCode(c.charCodeAt(0)+128));
// IfcSpace-Nummer je Raum: zuerst über die IFC-GlobalId des Raum-Datensatzes, sonst über den gleichen Raumnamen.
function spaceFinder(content){
 const text=Buffer.from(content||[]).toString('utf8'),byGid=new Map(),byName=new Map();
 for(const m of text.matchAll(/#(\d+)\s*=\s*IFCSPACE\s*\(\s*'([0-9A-Za-z_$]{22})'\s*,[^,]*,\s*(?:'([^']{0,200})'|\$)/gi)){
  const id=Number(m[1]);if(!byGid.has(m[2]))byGid.set(m[2],id);
  if(m[3]){const k=ifcText(m[3]).trim().toLocaleLowerCase('de');if(k&&!byName.has(k))byName.set(k,id);}
 }
 return lamp=>(lamp.room_gid&&byGid.get(lamp.room_gid))||(lamp.room&&byName.get(lamp.room.trim().toLocaleLowerCase('de')))||null;
}
async function roomDeviceLights(db,user,document,options={}){
 const values=(await db.query("SELECT space_id,is_on,rgb,brightness FROM app_devices WHERE document_id=$1 AND space_id IS NOT NULL AND mode='simulation' AND kind IN ('light','plug')",[document])).rows.map(x=>({...x,available:true}));
 const ha=homeAssistantService(options),config=ha.configuration(user);
 if(config){
  const bindings=(await db.query('SELECT space_id,light_key FROM app_lamp_locations WHERE user_id=$1 AND document_id=$2 AND space_id IS NOT NULL',[user,document])).rows;
  await Promise.all(bindings.map(async binding=>{const light=config.lights.find(x=>x.key===binding.light_key);if(!light)return;try{values.push({...await ha.state(config,light),space_id:binding.space_id});}catch{values.push({space_id:binding.space_id,available:false,is_on:null});}}));
 }
 // Aus Home Assistant importierte Lampen: zuletzt vom iPhone gemeldeter Zustand, Raum über die Raumzuordnung.
 const doc=(await db.query('SELECT building_id,content FROM app_documents WHERE id=$1',[document])).rows[0];
 if(doc){
  const lamps=(await haLamps(db,doc.building_id)).filter(l=>l.room_id&&l.state);
  if(lamps.length){const find=spaceFinder(doc.content);for(const l of lamps){const space=find(l),fresh=Number.isFinite(Date.parse(l.state.updated_at))&&Date.now()-Date.parse(l.state.updated_at)<180000,available=fresh&&l.state.available===true;if(space)values.push({space_id:space,available,is_on:available?l.state.is_on===true:null,rgb:Array.isArray(l.state.rgb)?l.state.rgb:null,brightness:l.state.brightness??null});}}
 }
 const groups=new Map();for(const value of values){if(!groups.has(value.space_id))groups.set(value.space_id,[]);groups.get(value.space_id).push(value);}
 return [...groups].map(([space_id,lamps])=>{const on=lamps.filter(x=>x.available&&x.is_on),colors=on.map(x=>x.rgb||[255,231,211]);return {space_id,available:lamps.every(x=>x.available),on:on.length>0,rgb:colors.length?[0,1,2].map(i=>Math.round(colors.reduce((sum,x)=>sum+x[i],0)/colors.length)):[255,231,211],brightness:on.length?Math.max(...on.map(x=>x.brightness??255)):0};});
}
module.exports={roomDeviceLights,spaceFinder};
