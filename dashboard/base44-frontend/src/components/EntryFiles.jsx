import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '@/api/base44Client';

export async function uploadFile(path, file) {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Dateien müssen zwischen 1 Byte und 10 MB groß sein.');
  // The upload response is JSON, while raw mode also supports binary downloads.
  return request(path + '?name=' + encodeURIComponent(file.name), {method:'POST', raw:true, body:file, headers:{'Content-Type':'application/octet-stream'}});
}

export default function EntryFiles({path, editable}) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = ['entry-files',path];
  const files = useQuery({queryKey:key,queryFn:()=>request(path),enabled:open});
  async function add(event) {
    const input = event.target;
    const chosen = Array.from(input.files);
    setBusy(true); setError('');
    try { for (const file of chosen) await uploadFile(path,file); }
    catch (err) { setError(err.message); }
    finally { input.value=''; await cache.invalidateQueries({queryKey:key}); setBusy(false); }
  }
  async function download(file) {
    try {
      const blob=await request(path+'/'+file.id,{raw:true});
      const url=URL.createObjectURL(blob), link=document.createElement('a');
      link.href=url; link.download=file.name; link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch(err) { setError(err.message); }
  }
  return <details className="rounded-lg border border-border px-3 py-2 text-sm" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-medium">Dateien und Bilder</summary>
    {open && <div className="mt-3 space-y-2">
      {files.isPending ? <p>Dateien werden geladen …</p> : files.data?.length ? <ul>{files.data.map(file=><li key={file.id}><button type="button" className="break-all text-left text-primary underline" onClick={()=>download(file)}>{file.name}</button></li>)}</ul> : !files.error && <p>Keine Anhänge vorhanden.</p>}
      {editable && <label className="grid gap-1">Anhänge hinzufügen (je 10 MB)<input type="file" multiple disabled={busy} onChange={add}/></label>}
      {(error||files.error) && <p role="alert">{error||files.error.message}</p>}
    </div>}
  </details>;
}
