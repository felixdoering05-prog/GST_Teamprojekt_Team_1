// Name-based room suggestions for Home Assistant areas, devices and sensors ("Wohnzimmer Lampe" -> room "Wohnen").
// Suggestions only: the owner confirms them in the app.
const SYN={wohnzimmer:'wohnen',wohnraum:'wohnen',wohn:'wohnen',wohnen:'wohnen',living:'wohnen',livingroom:'wohnen',lounge:'wohnen',
 schlafzimmer:'schlafen',schlafen:'schlafen',schlaf:'schlafen',bedroom:'schlafen',eltern:'schlafen',elternschlafzimmer:'schlafen',
 kinderzimmer:'kind',kinder:'kind',kind:'kind',kids:'kind',kid:'kind',jugendzimmer:'kind',
 kueche:'kueche',kuche:'kueche',kitchen:'kueche',kochen:'kueche',
 badezimmer:'bad',bad:'bad',bathroom:'bad',duschbad:'bad',dusche:'bad',wannenbad:'bad',
 wc:'wc',gaestewc:'wc',toilette:'wc',toilet:'wc',
 flur:'flur',diele:'flur',gang:'flur',korridor:'flur',hallway:'flur',hall:'flur',eingang:'flur',windfang:'flur',treppenhaus:'flur',
 arbeitszimmer:'buero',buero:'buero',office:'buero',arbeiten:'buero',studio:'buero',
 esszimmer:'essen',essen:'essen',essbereich:'essen',dining:'essen',
 keller:'keller',kellerraum:'keller',basement:'keller',
 garage:'garage',carport:'garage',
 hwr:'technik',hauswirtschaft:'technik',hauswirtschaftsraum:'technik',technik:'technik',technikraum:'technik',heizraum:'technik',heizung:'technik',waschkueche:'technik',
 abstellraum:'abstell',abstell:'abstell',speis:'abstell',speisekammer:'abstell',lager:'abstell',lagerraum:'abstell',
 gaestezimmer:'gast',gaeste:'gast',gast:'gast',guest:'gast',
 balkon:'balkon',terrasse:'terrasse',garten:'garten',dachboden:'dachboden',
 ankleide:'ankleide',buegelzimmer:'technik',sauna:'sauna',fitness:'fitness'};
const FLOOR={eg:'eg',erdgeschoss:'eg',og:'og',obergeschoss:'og','1og':'og',ug:'ug',untergeschoss:'ug',kg:'ug',dg:'dg',dachgeschoss:'dg'};
const STOP=new Set(['lampe','licht','light','leuchte','sensor','temperatur','temperature','luftfeuchte','humidity','co2','thermometer','raum','zimmer','der','die','das','im','in','am','oben','unten','decke','spot','spots','strip','led','fenster','tuer']);
function tokens(s){
 const n=String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
 const words=n?n.split(' '):[];
 const out={words,canon:new Set(),floor:null};
 for(let i=0;i<words.length;i++){const w=words[i],joined=words[i]+(words[i+1]||'');
  if(FLOOR[w]||FLOOR[joined])out.floor=FLOOR[w]||FLOOR[joined];
  if(SYN[joined])out.canon.add(SYN[joined]);if(SYN[w])out.canon.add(SYN[w]);
  if(!SYN[w]&&!STOP.has(w)&&!FLOOR[w]&&!/^\d+$/.test(w)&&w.length>2)for(const [k,v] of Object.entries(SYN))if(w.startsWith(k)&&k.length>=4)out.canon.add(v);}
 out.flat=words.filter(w=>!STOP.has(w)).join(' ');
 return out;
}
function score(a,room){
 const b=tokens(room.name+' '+(room.room_code||''));
 let s=0;
 if(a.flat&&b.flat&&a.flat===b.flat)s=1;
 else if([...a.canon].some(c=>b.canon.has(c)))s=.9;
 else if(a.flat&&b.flat&&(b.flat.includes(a.flat)||a.flat.includes(b.flat))&&Math.min(a.flat.length,b.flat.length)>=4)s=.75;
 if(s&&a.floor&&b.floor&&a.floor!==b.floor)s-=.35;
 if(s&&a.floor&&b.floor===a.floor)s+=.05;
 return s;
}
/** Best matching room id for a name, or null when nothing fits clearly. */
function suggestRoom(name,rooms){
 const a=tokens(name);if(!a.canon.size&&!a.flat)return null;
 const ranked=rooms.map(r=>({id:r.id,s:score(a,r)})).filter(x=>x.s>=.7).sort((x,y)=>y.s-x.s);
 if(!ranked.length)return null;if(ranked[1]&&ranked[1].s>ranked[0].s-.1)return null;
 return ranked[0].id;
}
module.exports={suggestRoom,tokens};
