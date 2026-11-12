import {useEffect,useState} from 'react';
import {request} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
const labels={queued:'Wartet auf Analyse',running:'Entwurf wird erstellt …',ready:'Entwurf prüfen',approved:'In Gebäudemappe übernommen',rejected:'Verworfen',failed:'Nicht abgeschlossen',cancelled:'Abgebrochen',needs_input:'Besserer Plan erforderlich'};
function Preview({path}){
 const [url,setURL]=useState(null);
 useEffect(()=>{let active=true,object;request(path,{raw:true}).then(blob=>{object=URL.createObjectURL(blob);if(active)setURL(object);else URL.revokeObjectURL(object);}).catch(()=>{});return()=>{active=false;if(object)URL.revokeObjectURL(object);};},[path]);
 return url?<img src={url} alt="Vorläufiger IFC-Entwurf zur Prüfung" className="max-h-80 rounded-lg bg-white object-contain"/>:<p>Vorschau wird geladen …</p>;
}
export default function PlanConversionPanel({buildingId,onAdopt}){
 const [state,setState]=useState(null),[docs,setDocs]=useState([]),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const base=`/buildings/${buildingId}/plan-conversion`;
 useEffect(()=>{let active=true;setState(null);setSelected([]);setError('');const load=async()=>{try{const [s,d]=await Promise.all([request(base),request(`/buildings/${buildingId}/documents`)]);if(active){setState(s);setDocs(d.filter(f=>['image/jpeg','image/png','image/webp','application/pdf'].includes(f.mime_type)));}}catch(e){if(active&&e.status!==404)setError(e.message);}};load();const timer=setInterval(load,7000);return()=>{active=false;clearInterval(timer);};},[base,buildingId]);
 async function action(path,body,method='POST'){
  setBusy(true);setError('');try{await request(base+path,{method,body});setState(await request(base));if(path.endsWith('/approve'))onAdopt?.();}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 if(!state)return error?<p role="alert">{error}</p>:null;
 return <section className="space-y-4 rounded-2xl border bg-card p-5">
  <h2 className="text-lg font-semibold">Aus Plänen einen 3D-Entwurf erstellen</h2>
  <p className="text-sm text-muted-foreground">Experimentell: bemaßte Grundrisse als PDF, JPG, PNG oder WebP analysieren. Der Entwurf ersetzt keine Fachplanung. Bestehende Modelle bleiben erhalten.</p>
  {!state.available?<p>Auf diesem Server noch nicht verfügbar.</p>:<>
   <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={state.settings.enabled} disabled={busy||(!state.ai_enabled&&!state.settings.enabled)} onChange={e=>{
    if(e.target.checked&&!window.confirm('Plananalyse für dieses Gebäude aktivieren? Künftig hochgeladene Bilder und PDFs werden automatisch an Google Gemini übertragen. Nur Pläne hochladen, die du dafür freigeben darfst. Vorhandene Dateien werden erst nach eigener Auswahl analysiert.'))return;
    action('',{enabled:e.target.checked,revision:state.settings.revision,policy_version:state.policy_version},'PATCH');
   }}/><span>Automatische Plananalyse für dieses Gebäude aktivieren<span className="mt-1 block text-sm text-muted-foreground">Übertragung an Google Gemini. Neue Bilder/PDFs werden nach dem Upload analysiert. Max. 4 Dateien / 10 MB pro Auftrag; {state.daily_limit===null?'Persönliches Tageslimit für dieses Konto aufgehoben.':`${state.daily_limit??3} Aufträge je Konto in 24 Stunden.`} Projektlimit: 10 Aufträge in 24 Stunden. Deaktivieren bricht offene Entwürfe ab.</span></span></label>
   {!state.ai_enabled&&<p>Bitte zuerst KI unter Profil → KI-Einstellungen aktivieren.</p>}
   {state.settings.enabled&&<div className="space-y-3"><p>Vorhandene Pläne auswählen:</p>{docs.length===0&&<p className="text-muted-foreground">Lade zuerst einen bemaßten Grundriss in die Gebäudemappe.</p>}
    {docs.map(d=><label key={d.id} className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(d.id)} disabled={busy||(!selected.includes(d.id)&&selected.length>=4)} onChange={e=>setSelected(s=>e.target.checked?[...s,d.id]:s.filter(id=>id!==d.id))}/><span>{d.name}</span></label>)}
    <Button disabled={busy||!selected.length||!state.ai_enabled} onClick={()=>action('/jobs',{document_ids:selected,request_key:crypto.randomUUID()})}>Ausgewählte Pläne analysieren</Button>
   </div>}
  </>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {state.jobs.map(job=><article key={job.id} className="space-y-3 rounded-xl border p-4">
   <h3 className="font-medium">{labels[job.status]||job.status}</h3><p className="text-sm text-muted-foreground">{new Date(job.created_at).toLocaleString('de-DE')} · {job.document_ids.length} Quelldatei(en)</p>
   {job.warnings.map((w,i)=><p key={i} className="text-sm">{w}</p>)}
   {job.can_rebuild&&<Button disabled={busy||!state.ai_enabled||!state.settings.enabled} variant="outline" onClick={()=>action(`/jobs/${job.id}/rebuild`,{request_key:crypto.randomUUID()})}>Gespeicherte Erkennung erneut prüfen (ohne Google)</Button>}
   {job.status==='ready'&&<><Preview path={`${base}/jobs/${job.id}/preview`}/><p className="text-sm">Bitte Proportionen und Hinweise prüfen. „Übernehmen“ legt eine zusätzliche IFC-Datei an. Sieben Tage Zeit zur Prüfung.</p><Button disabled={busy||!state.ai_enabled} onClick={()=>action(`/jobs/${job.id}/approve`,{})}>Entwurf in Gebäudemappe übernehmen</Button></>}
   {['queued','running','ready'].includes(job.status)&&<Button className="ml-2" variant="outline" disabled={busy} onClick={()=>action(`/jobs/${job.id}/reject`,{})}>{job.status==='ready'?'Verwerfen':'Abbrechen'}</Button>}
  </article>)}
 </section>;
}
