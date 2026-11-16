import {useEffect,useMemo,useRef,useState} from 'react';
import {request} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {snap,moveWall,removeItem,addWall,addOpening,openWall,editBody,project} from './planEditorModel';

// Correction editor for a plan draft: recognised walls, doors, windows and rooms over the plan photo.
// Same server API and behaviour as the iOS editor (PlanEditorView.swift).
const TOOLS=[['move','Ändern'],['wall','Wand'],['door','Tür'],['window','Fenster'],['measure','Strecke']];
const HINT={move:'Wand, Tür oder Fenster anklicken und an die richtige Stelle ziehen – oder löschen. Raumnamen anklicken zum Umbenennen.',wall:'Mit gedrückter Maustaste eine neue Wand ziehen. Sie wird gerade ausgerichtet und rastet an anderen Wänden ein.',door:'Auf eine Wand klicken, um dort eine Tür einzusetzen.',window:'Auf eine Wand klicken, um dort ein Fenster einzusetzen.',measure:'Anfang und Ende einer Strecke anklicken, deren Länge du kennst (z. B. ein Gesamtmaß im Plan).'};

function usePlanImage(path){
 const [url,setURL]=useState(null);
 useEffect(()=>{if(!path)return;let active=true,object;request(path,{raw:true}).then(b=>{object=URL.createObjectURL(b);if(active)setURL(object);else URL.revokeObjectURL(object);}).catch(()=>{});return()=>{active=false;if(object)URL.revokeObjectURL(object);};},[path]);
 return url;
}

export default function PlanEditor({base,jobId,onClose,onSaved}){
 const [levels,setLevels]=useState(null),[index,setIndex]=useState(0),[refs,setRefs]=useState({}),[history,setHistory]=useState([]);
 const [tool,setTool]=useState('move'),[selection,setSelection]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[showPlan,setShowPlan]=useState(true);
 const [draft,setDraft]=useState(null),[measureA,setMeasureA]=useState(null);
 const drag=useRef(null),svg=useRef(null);
 const path=`${base}/jobs/${jobId}`;
 useEffect(()=>{request(`${path}/editor`).then(r=>setLevels(r.levels)).catch(e=>setError(e.message));},[path]);
 const level=levels?.[index];
 const imageURL=usePlanImage(level?.image?`${path}/plan-image/${level.image.name}`:null);
 const view=useMemo(()=>level&&{x:-900,y:-900,w:level.width+1800,h:level.depth+1800},[level?.width,level?.depth])
 if(error&&!levels)return <p role="alert" className="text-destructive">{error}</p>;
 if(!levels)return <p>Grundriss wird geladen …</p>;
 // SVG y runs down; the plan uses mm with y up.
 const Y=y=>level.depth-y;
 const toMM=e=>{const p=svg.current.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(svg.current.getScreenCTM().inverse());return [q.x,level.depth-q.y];};
 const pxPerMM=()=>svg.current?svg.current.getBoundingClientRect().width/view.w:0.05;
 const checkpoint=()=>setHistory(h=>[...h.slice(-39),{levels,refs}]);
 const setLevel=l=>setLevels(ls=>ls.map((x,i)=>i===index?l:x));
 const undo=()=>setHistory(h=>{const last=h.at(-1);if(last){setLevels(last.levels);setRefs(last.refs);setSelection(null);}return h.slice(0,-1);});
 const hit=p=>{const tol=10/pxPerMM();
  const o=level.openings.map(o=>({o,d:Math.hypot(o.at[0]-p[0],o.at[1]-p[1])})).sort((a,b)=>a.d-b.d)[0];if(o&&o.d<o.o.width/2+tol)return o.o.id;
  const w=level.walls.map(w=>({w,d:project(p,w.a,w.b).distance})).filter(x=>x.d<=x.w.thickness/2+tol).sort((a,b)=>a.d-b.d)[0];return w?.w.id??null;};
 function down(e){
  const p=toMM(e);svg.current.setPointerCapture(e.pointerId);
  if(tool==='move'){const id=hit(p);setSelection(id);drag.current={start:p,original:level,moved:false};}
  else if(tool==='wall'){const s=snap(p,null,level.walls);drag.current={start:s};setDraft([s,s]);}
 }
 function move(e){
  const d=drag.current;if(!d)return;const p=toMM(e);
  if(tool==='move'&&selection){
   if(!d.moved&&Math.hypot(p[0]-d.start[0],p[1]-d.start[1])*pxPerMM()<5)return;
   if(!d.moved){checkpoint();d.moved=true;}
   const delta=[p[0]-d.start[0],p[1]-d.start[1]];
   if(d.original.walls.some(w=>w.id===selection))setLevel(moveWall(level,d.original,selection,delta));
   else{const o=d.original.openings.find(x=>x.id===selection),w=o&&d.original.walls.find(x=>x.id===o.wall);if(w){const q=project([o.at[0]+delta[0],o.at[1]+delta[1]],w.a,w.b).point;setLevel({...level,openings:level.openings.map(x=>x.id===selection?{...x,at:q}:x)});}}
  }else if(tool==='wall')setDraft([d.start,snap(p,d.start,level.walls)]);
 }
 function up(e){
  const p=toMM(e);drag.current=null;
  if(tool==='wall'&&draft){const r=addWall(level,draft[0],draft[1]);if(r){checkpoint();setLevel(r.level);setSelection(r.id);}setDraft(null);}
  else if(tool==='door'||tool==='window'){const r=addOpening(level,tool,p);if(r){checkpoint();setLevel(r.level);setSelection(r.id);}else setError('Bitte direkt auf eine ausreichend lange Wand klicken.');}
  else if(tool==='measure'){const q=snap(p,null,level.walls,12/pxPerMM());
   if(!measureA){setMeasureA(q);return;}
   setMeasureA(null);if(Math.hypot(q[0]-measureA[0],q[1]-measureA[1])<100)return;
   const m=Number(String(window.prompt('Wie lang ist diese Strecke in Metern? Zum Beispiel ein Gesamtmaß aus dem Plan.')||'').replace(',','.'));
   if(m>=0.1&&m<=200){checkpoint();setRefs(r=>({...r,[index]:{a:measureA,b:q,mm:m*1000}}));}else if(m)setError('Bitte eine Länge zwischen 0,10 und 200 m eingeben.');}
 }
 function rename(room){
  if(tool!=='move')return;const name=window.prompt('Raum benennen',/^Raum \d+$/.test(room.name)?'':room.name);
  if(!name||!name.trim())return;if(name.length>60||/[\x00-\x1f]/.test(name)){setError('Raumnamen: 1 bis 60 Zeichen.');return;}
  checkpoint();setLevel({...level,rooms:level.rooms.map(r=>r.id===room.id?{...r,name:name.trim()}:r)});
 }
 async function save(){
  setSaving(true);setError('');try{await request(`${path}/edit`,{method:'POST',body:editBody(levels,refs)});onSaved?.();}catch(e){setError(e.message);}finally{setSaving(false);}
 }
 const sel=selection&&(level.walls.find(w=>w.id===selection)||level.openings.find(o=>o.id===selection));
 const img=level.image,ref=refs[index];
 return <section className="space-y-3 rounded-xl border bg-background p-4">
  <div className="flex flex-wrap items-center gap-2">
   <h3 className="mr-auto font-semibold">Grundriss korrigieren</h3>
   {levels.length>1&&levels.map((l,i)=><Button key={i} size="sm" variant={i===index?'default':'outline'} onClick={()=>{setIndex(i);setSelection(null);}}>{l.name}</Button>)}
   <Button size="sm" variant="outline" disabled={!history.length} onClick={undo}>Rückgängig</Button>
   <Button size="sm" variant="outline" onClick={()=>{if(!history.length||window.confirm('Änderungen verwerfen?'))onClose();}}>Schließen</Button>
  </div>
  <p className="text-sm text-muted-foreground">{tool==='measure'&&measureA?'Jetzt das Ende der Strecke anklicken.':HINT[tool]}</p>
  {level.scale.estimated&&!ref&&<p className="text-sm text-amber-700">Maße sind geschätzt. Mit „Strecke“ eine bekannte Länge markieren, dann stimmt die Größe.</p>}
  <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Werkzeuge">{TOOLS.map(([k,l])=><Button key={k} size="sm" variant={tool===k?'default':'outline'} onClick={()=>{setTool(k);setSelection(null);setMeasureA(null);}}>{l}</Button>)}</div>
  <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="h-[min(65vh,640px)] w-full touch-none select-none rounded-lg bg-slate-50" onPointerDown={down} onPointerMove={move} onPointerUp={up} role="img" aria-label="Erkannter Grundriss">
   {showPlan&&img&&imageURL&&<image href={imageURL} x={-img.origin_px[0]*img.mm_per_px} y={Y(img.origin_px[1]*img.mm_per_px)} width={img.size_px[0]*img.mm_per_px} height={img.size_px[1]*img.mm_per_px} opacity="0.45" preserveAspectRatio="none" pointerEvents="none"/>}
   {level.rooms.map(r=><polygon key={r.id} points={r.polygon.map(p=>`${p[0]},${Y(p[1])}`).join(' ')} fill="rgb(13 116 112 / 0.08)"/>)}
   {level.walls.map(w=><line key={w.id} x1={w.a[0]} y1={Y(w.a[1])} x2={w.b[0]} y2={Y(w.b[1])} stroke={selection===w.id?'#f97316':'#2e2e33'} strokeWidth={w.thickness} strokeLinecap="square"/>)}
   {level.openings.map(o=>{const w=level.walls.find(x=>x.id===o.wall);if(!w)return null;const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])||1,u=[(w.b[0]-w.a[0])/l,(w.b[1]-w.a[1])/l];
    return <line key={o.id} x1={o.at[0]-u[0]*o.width/2} y1={Y(o.at[1]-u[1]*o.width/2)} x2={o.at[0]+u[0]*o.width/2} y2={Y(o.at[1]+u[1]*o.width/2)} stroke={selection===o.id?'#f97316':o.kind==='window'?'#2563eb':'#ffffff'} strokeWidth={w.thickness*0.8}/>;})}
   {ref&&<><line x1={ref.a[0]} y1={Y(ref.a[1])} x2={ref.b[0]} y2={Y(ref.b[1])} stroke="#16a34a" strokeWidth={60} strokeDasharray="200 120"/><text x={(ref.a[0]+ref.b[0])/2} y={Y((ref.a[1]+ref.b[1])/2)-120} textAnchor="middle" fontSize="320" fill="#15803d" fontWeight="700">{(ref.mm/1000).toFixed(2).replace('.',',')} m</text></>}
   {measureA&&<circle cx={measureA[0]} cy={Y(measureA[1])} r={120} fill="#16a34a"/>}
   {draft&&<line x1={draft[0][0]} y1={Y(draft[0][1])} x2={draft[1][0]} y2={Y(draft[1][1])} stroke="#f97316" strokeWidth={115} opacity="0.8"/>}
   {level.rooms.map(r=><g key={r.id} transform={`translate(${r.point[0]},${Y(r.point[1])})`} onPointerDown={e=>{if(tool==='move'){e.stopPropagation();}}} onClick={()=>rename(r)} style={{cursor:tool==='move'?'pointer':'default'}}>
    <text textAnchor="middle" fontSize="300" fontWeight="600" fill="#0f172a">{r.name}</text>
    <text y="340" textAnchor="middle" fontSize="240" fill="#475569">{r.area_m2.toFixed(1).replace('.',',')} m²</text></g>)}
  </svg>
  <div className="flex flex-wrap items-center gap-2">
   {sel?<>
    <Button size="sm" variant="outline" onClick={()=>{checkpoint();setLevel(removeItem(level,selection));setSelection(null);}}>Löschen</Button>
    {sel.thickness!==undefined&&<Button size="sm" variant="outline" onClick={()=>{checkpoint();setLevel({...level,walls:level.walls.map(w=>w.id===selection?{...w,thickness:w.thickness>=200?115:300}:w)});}}>{sel.thickness>=200?'Außenwand':'Innenwand'}</Button>}
    {sel.kind==='opening'&&<Button size="sm" variant="outline" onClick={()=>{checkpoint();setLevel(openWall(level,selection));setSelection(null);}}>Wand hier öffnen</Button>}
   </>:img&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPlan} onChange={e=>setShowPlan(e.target.checked)}/>Planfoto zeigen</label>}
   <Button className="ml-auto" disabled={saving} onClick={save}>{saving?'Wird gespeichert …':'Gebäude erstellen'}</Button>
  </div>
  <p className="text-xs text-muted-foreground">Räume werden beim Erstellen aus den Wänden neu berechnet. Es wird keine KI aufgerufen und kein zusätzlicher Auftrag gezählt.</p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
