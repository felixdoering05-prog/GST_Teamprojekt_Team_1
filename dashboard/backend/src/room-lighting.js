const {homeAssistantService}=require('./home-assistant');
const {haLamps}=require('./ha-import');
const {splitArgs}=require('./georeference');
const ifcText=v=>v.replace(/''/g,"'").replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/gi,(_,h)=>String.fromCharCode(...h.match(/.{4}/g).map(x=>parseInt(x,16)))).replace(/\\X4\\((?:[0-9A-F]{8})+)\\X0\\/gi,(_,h)=>h.match(/.{8}/g).map(x=>{const n=parseInt(x,16);return n<=0x10ffff?String.fromCodePoint(n):'';}).join('')).replace(/\\S\\(.)/g,(_,c)=>String.fromCharCode(c.charCodeAt(0)+128));
const key=v=>String(v||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('de');
// An explicit GlobalId is authoritative. Names/numbers must identify exactly one space.
function spaceFinder(content){
 const text=Buffer.from(content||[]).toString('utf8'),byGid=new Map(),byName=new Map();
 const add=(map,k,id)=>{if(k)map.set(k,map.has(k)&&map.get(k)!==id?null:id);};
 const records=/#(\d+)\s*=\s*IFCSPACE\s*\(/gi;let m;
 while((m=records.exec(text))){
  const start=records.lastIndex;let end=start,depth=1,quoted=false;
  for(;end<text.length&&end-start<65536;end++){
   const c=text[end];if(c==="'"){if(quoted&&text[end+1]==="'"){end++;continue;}quoted=!quoted;}
   if(!quoted){if(c==='(')depth++;if(c===')'&&--depth===0)break;}
  }
  records.lastIndex=end+1;if(depth!==0)continue;
  const id=Number(m[1]),args=splitArgs(text.slice(start,end));
  const value=i=>/^'(?:''|[^'])*'$/.test(args[i]||'')?ifcText(args[i].slice(1,-1)):'';
  add(byGid,value(0),id);
  const name=value(2),long=value(7);
  for(const alias of [name,long,[name,long].filter(Boolean).join(' · ')])add(byName,key(alias),id);
 }
 return lamp=>lamp.room_gid?(byGid.get(lamp.room_gid)||null):(byName.get(key(lamp.room))||null);
}
async function roomDeviceLights(db,user,document,options={}){
 const doc=(await db.query('SELECT building_id,content FROM app_documents WHERE id=$1',[document])).rows[0];
 const find=spaceFinder(doc?.content);
 const simulated=(await db.query("SELECT space_id,document_id,room,is_on,rgb,brightness FROM app_devices WHERE mode='simulation' AND kind IN ('light','plug') AND (document_id=$1 OR (document_id IS NULL AND building_id=$2))",[document,doc?.building_id??null])).rows;
 const values=simulated.map(x=>({...x,space_id:(Number(x.document_id)===Number(document)?x.space_id:null)??find(x),available:true})).filter(x=>Number.isInteger(x.space_id)&&x.space_id>0);
 const ha=homeAssistantService(options),config=ha.configuration(user);
 if(config){
  const bindings=(await db.query('SELECT space_id,document_id,light_key,room FROM app_lamp_locations WHERE user_id=$1 AND (document_id=$2 OR (document_id IS NULL AND building_id=$3))',[user,document,doc?.building_id??null])).rows;
  for(const binding of bindings)binding.space_id=(Number(binding.document_id)===Number(document)?binding.space_id:null)??find(binding);
  await Promise.all(bindings.filter(b=>Number.isInteger(b.space_id)&&b.space_id>0).map(async binding=>{const light=config.lights.find(x=>x.key===binding.light_key);if(!light)return;try{values.push({...await ha.state(config,light),space_id:binding.space_id});}catch{values.push({space_id:binding.space_id,available:false,is_on:null});}}));
 }
 // Aus Home Assistant importierte Lampen: zuletzt vom iPhone gemeldeter Zustand, Raum über die Raumzuordnung.
 if(doc){
  const lamps=(await haLamps(db,doc.building_id)).filter(l=>l.room_id&&l.state);
  if(lamps.length){for(const l of lamps){const space=find(l),age=Date.now()-Date.parse(l.state.updated_at),fresh=Number.isFinite(age)&&age>=-60000&&age<180000,available=fresh&&l.state.available===true;if(space)values.push({space_id:space,available,is_on:available?l.state.is_on===true:null,rgb:Array.isArray(l.state.rgb)?l.state.rgb:null,brightness:l.state.brightness??null});}}
 }
 const groups=new Map();for(const value of values){if(!Number.isInteger(value.space_id)||value.space_id<=0)continue;if(!groups.has(value.space_id))groups.set(value.space_id,[]);groups.get(value.space_id).push(value);}
 return [...groups].map(([space_id,lamps])=>{const on=lamps.filter(x=>x.available&&x.is_on),colors=on.map(x=>x.rgb||[255,231,211]);return {space_id,available:lamps.every(x=>x.available),on:on.length>0,rgb:colors.length?[0,1,2].map(i=>Math.round(colors.reduce((sum,x)=>sum+x[i],0)/colors.length)):[255,231,211],brightness:on.length?Math.max(...on.map(x=>x.brightness??255)):0};});
}
module.exports={roomDeviceLights,spaceFinder};
