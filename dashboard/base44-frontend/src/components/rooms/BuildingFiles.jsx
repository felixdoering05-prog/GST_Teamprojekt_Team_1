import {useEffect,useState} from 'react';
import {request} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
export default function BuildingFiles({building}) {
 const [files,setFiles]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>request(`/buildings/${building.id}/documents`).then(setFiles);
 useEffect(()=>{setFiles([]);setError('');let cancelled=false;request(`/buildings/${building.id}/documents`).then(rows=>{if(!cancelled)setFiles(rows)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[building.id]);
 async function upload(e){const file=e.target.files?.[0];if(!file)return;setError('');if(file.size>25*1024*1024){setError('Maximal 25 MB pro Datei.');e.target.value='';return}setBusy(true);try{await request(`/buildings/${building.id}/documents`,{method:'POST',body:file,raw:true,headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)}});await load()}catch(e){setError(e.message)}finally{setBusy(false);e.target.value=''}}
 async function download(file){setError('');try{const blob=await request(`/documents/${file.id}`,{raw:true});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){setError(e.message)}}
 return <section className="surface space-y-3 p-5"><h2 className="font-semibold">Bilder & Pläne · {building.name}</h2><p className="text-sm text-muted-foreground">Vom Gerät auswählen und im Projektkonto speichern. Auch in der iPhone-App verfügbar. PDF, JPG, PNG, WebP und DWG; maximal 25 MB pro Datei und 250 MB pro Konto.</p>
 <label className="block text-sm font-medium" htmlFor="building-file">{busy?'Wird hochgeladen …':'Datei hochladen'}</label><input id="building-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.dwg" disabled={busy} onChange={upload}/>
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 {!files.length&&<p className="text-sm text-muted-foreground">Noch keine Dateien für dieses Gebäude.</p>}
 <ul>{files.map(f=><li key={f.id} className="flex items-center justify-between gap-3 border-t py-2"><span className="break-all text-sm">{f.name} · {Math.ceil(f.size/1024)} KB</span><Button size="sm" variant="outline" onClick={()=>download(f)}>Herunterladen</Button></li>)}</ul>
 </section>;
}
