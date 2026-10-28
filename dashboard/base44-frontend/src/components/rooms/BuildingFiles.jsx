import {useEffect,useState} from 'react';
import {request,uploadFile} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import ConfirmDialog from '@/components/ConfirmDialog';
export default function BuildingFiles({building}) {
 const [files,setFiles]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState(null),[progress,setProgress]=useState(0),[success,setSuccess]=useState('');
 const [rename,setRename]=useState(null),[newName,setNewName]=useState(''),[remove,setRemove]=useState(null),[preview,setPreview]=useState(null);
 useEffect(()=>{let cancelled=false;request(`/buildings/${building.id}/documents`).then(rows=>{if(!cancelled)setFiles(rows)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[building.id]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url)},[preview]);
 async function upload(item){
  setError('');setSuccess('');setBusy(true);setProgress(0);
  try{const document=await uploadFile(building.id,item.file,item.id,setProgress);setFiles(rows=>[document,...rows.filter(f=>f.id!==document.id)]);setPending(null);setSuccess('Datei auf dem Projektserver gespeichert. Auch in der iPhone-App verfügbar.')}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 function choose(e){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.name.toLowerCase().endsWith('.ifc')&&file.size>20*1024*1024){setError('IFC-Modelle dürfen maximal 20 MB groß sein.');return}
  if(file.size===0||file.size>25*1024*1024){setError('Bitte eine nicht leere Datei bis 25 MB auswählen.');return}
  const item={file,id:crypto.randomUUID()};setPending(item);upload(item);
 }
 async function open(file,download=false){
  setError('');setBusy(true);
  try{
   const blob=await request(`/documents/${file.id}`,{raw:true});const url=URL.createObjectURL(blob);
   if(download||['application/acad','application/x-step'].includes(file.mime_type)){const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
   else setPreview({file,url});
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function saveName(e){
  e.preventDefault();setError('');setBusy(true);
  try{const ext=rename.name.slice(rename.name.lastIndexOf('.'));const updated=await request(`/documents/${rename.id}`,{method:'PATCH',body:{name:newName.trim()+ext}});setFiles(rows=>rows.map(f=>f.id===updated.id?updated:f));setRename(null);setSuccess('Dateiname gespeichert.')}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function deleteFile(){
  setError('');setBusy(true);
  try{await request(`/documents/${remove.id}`,{method:'DELETE'});setFiles(rows=>rows.filter(f=>f.id!==remove.id));setRemove(null);setSuccess('Datei vom Projektserver gelöscht.')}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="surface space-y-4 p-5">
  <h2 className="font-semibold">Bilder & Pläne · {building.name}</h2>
  <p className="text-sm text-muted-foreground">PDF, JPG, PNG, WebP, DWG und IFC · maximal 25 MB pro Datei (IFC: 20 MB) und 250 MB pro Konto. IFC-Modelle werden auf dem Server gespeichert und können in der iPhone-App als 3D-Modell geöffnet werden. Im Browser ist der Download verfügbar.</p>
  <label className="block text-sm font-medium" htmlFor="building-file">Datei hochladen</label>
  <input id="building-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.dwg,.ifc" disabled={busy||!!pending} onChange={choose}/>
  {pending&&<div className="space-y-2 rounded-lg border p-3"><p className="break-all text-sm">{pending.file.name}</p>
   {busy?<><progress className="w-full" value={Math.min(progress,0.99)} max="1" aria-label="Upload-Fortschritt"/><p className="text-sm">{progress>=1?'Warte auf Bestätigung vom Server …':`Wird hochgeladen … ${Math.round(progress*100)} %`}</p></>:<>
    <p className="text-sm">Noch nicht als gespeichert bestätigt. Die Auswahl bleibt bis zum Verlassen dieser Seite erhalten.</p>
    <Button size="sm" onClick={()=>upload(pending)}>Erneut versuchen</Button>{' '}<Button variant="outline" size="sm" onClick={()=>{setPending(null);setError('')}}>Auswahl entfernen</Button>
   </>}
  </div>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {success&&<p role="status" className="text-sm text-green-700">{success}</p>}
  {!files.length&&<p className="text-sm text-muted-foreground">Noch keine Dateien für dieses Gebäude.</p>}
  <ul>{files.map(f=><li key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3">
   <span className="min-w-0 break-all text-sm">{f.name} · {Math.ceil(f.size/1024)} KB</span>
   <div className="flex flex-wrap gap-2">
    {!['application/acad','application/x-step'].includes(f.mime_type)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>open(f)}>Ansehen</Button>}
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>open(f,true)}>Herunterladen</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>{setNewName(f.name.slice(0,f.name.lastIndexOf('.')));setRename(f)}}>Umbenennen</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>setRemove(f)}>Löschen</Button>
   </div>
  </li>)}</ul>
  <Dialog open={!!rename} onOpenChange={open=>{if(!open&&!busy)setRename(null)}}><DialogContent><DialogHeader><DialogTitle>Datei umbenennen</DialogTitle><DialogDescription>Die Dateiendung bleibt erhalten. Der Name gilt auch auf dem iPhone.</DialogDescription></DialogHeader>
   <form onSubmit={saveName} className="space-y-4"><Label htmlFor="document-name">Dateiname</Label><Input id="document-name" value={newName} onChange={e=>setNewName(e.target.value)} required maxLength={190}/>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy||!newName.trim()}>Speichern</Button>
   </form>
  </DialogContent></Dialog>
  <ConfirmDialog open={!!remove} onOpenChange={open=>{if(!open&&!busy)setRemove(null)}} title="Datei wirklich löschen?" description={`„${remove?.name||''}“ wird vom Projektserver und damit auch aus deiner iPhone-Gebäudemappe entfernt. Dieser Schritt lässt sich nicht rückgängig machen.`} onConfirm={deleteFile} busy={busy}/>
  <Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null)}}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{preview?.file.name}</DialogTitle><DialogDescription>Gespeicherte Datei aus deiner Gebäudemappe.</DialogDescription></DialogHeader>
   {preview?.file.mime_type.startsWith('image/')?<img alt={preview.file.name} src={preview.url} className="max-h-[70vh] w-full object-contain"/>:preview&&<iframe title={preview.file.name} src={preview.url} className="h-[70vh] w-full"/>}
  </DialogContent></Dialog>
 </section>;
}
