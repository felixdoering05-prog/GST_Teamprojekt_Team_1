const express=require('express');
const {accessibleBuilding}=require('./collaboration');
const {getPassportEnergy}=require('./passport-energy');
// Energie-Übersicht aus Home Assistant: Tagesverbrauch aus kWh-Zählern (nur positive Zuwächse, Zählerrücksetzungen
// werden übersprungen), aktuelle Leistung und nächtliche Grundlast aus W-Sensoren, dazu einfache Hinweise.
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const DAYS=30;
const round=(v,d=2)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const berlinDay=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
const berlinHour=t=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hour12:false}).format(t))%24;

/** Tageswerte aus einer Zählerreihe (aufsteigend sortiert). */
function dailyFromCounter(points){
 const days=new Map();
 for(let i=1;i<points.length;i++){
  const delta=points[i].value-points[i-1].value;
  if(!Number.isFinite(delta)||delta<0||delta>500)continue; // Rücksetzung oder Sprung (z. B. Zählertausch) nicht als Verbrauch werten
  const day=berlinDay(new Date(points[i].measured_at));days.set(day,(days.get(day)||0)+delta);
 }
 return days;
}
async function energyOverview(db,building,now=new Date()){
 const link=(await db.query('SELECT id FROM app_ha_links WHERE building_id=$1',[building.id])).rows[0];
 const empty={meters:[],power:[],daily:[],totals:{today_kwh:null,yesterday_kwh:null,last7_kwh:null,avg_day_kwh:null},base_load_w:null,hints:[],source:'home_assistant'};
 if(!link)return empty;
 const entities=(await db.query("SELECT e.entity_id,e.name,e.metric,COALESCE(r.data->>'name','') AS room FROM app_ha_entities e LEFT JOIN app_twin_records r ON r.id=e.room_id AND r.entity='Room' WHERE e.link_id=$1 AND e.selected AND e.metric IN ('energy','power') ORDER BY e.name LIMIT 40",[link.id])).rows;
 if(!entities.length)return empty;
 const since=new Date(now.getTime()-(DAYS+1)*86400000);
 const samples=(await db.query('SELECT entity_id,value,measured_at FROM app_ha_samples WHERE link_id=$1 AND entity_id = ANY($2::text[]) AND measured_at>=$3 ORDER BY entity_id,measured_at LIMIT 200000',[link.id,entities.map(e=>e.entity_id),since])).rows.map(r=>({...r,value:Number(r.value),measured_at:new Date(r.measured_at).toISOString()}));
 const by=new Map();for(const s of samples){if(!by.has(s.entity_id))by.set(s.entity_id,[]);by.get(s.entity_id).push(s);}
 const today=berlinDay(now),yesterday=berlinDay(new Date(now.getTime()-86400000)),last7=new Set(Array.from({length:7},(_,i)=>berlinDay(new Date(now.getTime()-i*86400000))));
 const total=new Map(),meters=[],power=[];
 for(const e of entities.filter(x=>x.metric==='energy')){
  const days=dailyFromCounter(by.get(e.entity_id)||[]);
  for(const [d,v] of days)total.set(d,(total.get(d)||0)+v);
  const week=[...days].filter(([d])=>last7.has(d));
  meters.push({entity_id:e.entity_id,name:e.name,room:e.room||null,today_kwh:days.has(today)?round(days.get(today)):null,last7_kwh:week.length?round(week.reduce((a,[,v])=>a+v,0)):null});
 }
 const night=[];
 for(const e of entities.filter(x=>x.metric==='power')){
  const list=by.get(e.entity_id)||[],last=list.at(-1);
  if(last)power.push({entity_id:e.entity_id,name:e.name,room:e.room||null,watts:round(last.value,0),measured_at:last.measured_at,stale:now-Date.parse(last.measured_at)>3600000});
  for(const p of list){const h=berlinHour(new Date(p.measured_at));if(h>=1&&h<5&&now-Date.parse(p.measured_at)<7*86400000)night.push(p.value);}
 }
 const daily=Array.from({length:DAYS},(_,i)=>berlinDay(new Date(now.getTime()-(DAYS-1-i)*86400000))).map(day=>({day,kwh:total.has(day)?round(total.get(day)):null}));
 const full=daily.filter(d=>d.kwh!==null&&d.day!==today);
 const avg=full.length?full.reduce((a,d)=>a+d.kwh,0)/full.length:null;
 // Ohne Zählerhierarchie lässt sich bei mehreren Leistungssensoren keine Gebäude-Grundlast bestimmen.
 let base=null;if(entities.filter(e=>e.metric==='power').length===1&&night.length>=6){const sorted=[...night].sort((a,b)=>a-b);base=round(sorted[Math.floor(sorted.length*0.1)],0);}
 const weekTotal=[...total].filter(([d])=>last7.has(d));
 const totals={today_kwh:total.has(today)?round(total.get(today)):null,yesterday_kwh:total.has(yesterday)?round(total.get(yesterday)):null,last7_kwh:weekTotal.length?round(weekTotal.reduce((a,[,v])=>a+v,0)):null,avg_day_kwh:round(avg)};
 const hints=[];
 if(avg&&totals.yesterday_kwh!==null&&full.length>=5){const diff=(totals.yesterday_kwh-avg)/avg;if(diff>0.3)hints.push(`Gestern ${Math.round(diff*100)} % mehr Strom als im Schnitt der letzten Tage.`);else if(diff<-0.3)hints.push(`Gestern ${Math.round(-diff*100)} % weniger Strom als im Schnitt – gut!`);}
 if(base!==null&&base>=150)hints.push(`Nachts laufen dauerhaft etwa ${base} W. Prüfe Geräte im Standby, Umwälzpumpe oder Kühlgeräte.`);
 const top=meters.filter(m=>m.last7_kwh>0).sort((a,b)=>b.last7_kwh-a.last7_kwh)[0];
 if(top&&meters.length>1&&totals.last7_kwh)hints.push(`${top.name} hatte in den letzten 7 Tagen den größten Anteil (${Math.round(top.last7_kwh/totals.last7_kwh*100)} %).`);
 return {meters,power,daily,totals,base_load_w:base,hints,source:'home_assistant',meaning:'Aus Home-Assistant-Zählern (kWh) und Leistungssensoren (W). Tageswerte = Summe positiver Zählerzuwächse (Europe/Berlin); Lücken in der Übertragung können Tage zu niedrig erscheinen lassen. Mehrere Zähler werden addiert und können sich überschneiden (Haupt- und Unterzähler). Grundlast nur bei genau einem ausgewählten Leistungssensor. Keine Abrechnung, keine Kostenberechnung.'};
}
function energyRouter(db,requireAccount){
 const r=express.Router();
 r.get('/energy-consumption',requireAccount,wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  return getPassportEnergy(db,req,res);
 }));
 r.get('/buildings/:energyBuilding/energy-overview',requireAccount,wrap(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!/^[1-9]\d{0,9}$/.test(req.params.energyBuilding))return res.status(400).json({error:'Ungültiges Gebäude.'});
  const b=await accessibleBuilding(db,req.params.energyBuilding,req.account.id);if(!b)return res.status(404).json({error:'Gebäude nicht gefunden.'});
  res.json(await energyOverview(db,b));
 }));
 return r;
}
module.exports={energyOverview,energyRouter,dailyFromCounter};
