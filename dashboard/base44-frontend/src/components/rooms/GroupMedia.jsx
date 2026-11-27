import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '@/api/base44Client';
import IFCModelFrame from '@/components/bim/IFCModelFrame';
import { Button } from '@/components/ui/button';

const imageFile = name => /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(name);

function Photo({path,name}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{
    let alive=true, objectURL;
    request(path,{raw:true}).then(blob=>{
      if(alive){objectURL=URL.createObjectURL(blob);setUrl(objectURL);}
    }).catch(()=>{});
    return ()=>{alive=false;if(objectURL)URL.revokeObjectURL(objectURL);};
  },[path]);
  return url ? <img src={url} alt={name} className="h-44 w-full rounded-lg bg-muted object-contain"/> : <div className="grid h-44 place-items-center rounded-lg bg-muted text-xs">Bildvorschau</div>;
}

export default function GroupMedia({path,section,editable}) {
  const cache=useQueryClient();
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[model,setModel]=useState(null);
  const key=['entry-files',path];
  const query=useQuery({queryKey:key,queryFn:()=>request(path)});
  const files=(query.data||[]).filter(file=>(file.category || (imageFile(file.name)?'gallery':'models'))===section);
  async function upload(event) {
    const input=event.currentTarget, chosen=Array.from(input.files);
    setBusy(true);setError('');
    try{
      for(const file of chosen){
        if(!file.size || file.size>10*1024*1024)throw new Error(file.name+' muss zwischen 1 Byte und 10 MB groß sein.');
        if(section==='gallery' && !imageFile(file.name))throw new Error('Bitte ein unterstütztes Bildformat auswählen.');
        const params=new URLSearchParams({name:file.name,category:section});
        await request(path+'?'+params,{method:'POST',body:file,raw:true,headers:{'Content-Type':'application/octet-stream'}});
      }
    }catch(err){setError(err.message);}
    finally{input.value='';await cache.invalidateQueries({queryKey:key});setBusy(false);}
  }
  async function download(file){
    try{const blob=await request(path+'/'+file.id,{raw:true});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(err){setError(err.message);}
  }
  return <section className="surface space-y-4 p-5">
    <h2 className="font-heading text-lg font-semibold">{section==='gallery'?'Bilder der Gebäudegruppe':'Pläne und Modelle der Gebäudegruppe'}</h2>
    {editable && <label className="grid gap-2 text-sm font-medium">{section==='gallery'?'Bilder hinzufügen':'Dateien hinzufügen'} · je 10 MB
      <input type="file" multiple disabled={busy} accept={section==='gallery'?'.png,.jpg,.jpeg,.gif,.webp,.avif,.bmp':undefined} onChange={upload}/></label>}
    {(error||query.error) && <p role="alert">{error||query.error.message}</p>}
    {query.isPending ? <p role="status">Dateien werden geladen …</p> : !files.length && <p className="text-sm text-muted-foreground">{section==='gallery'?'Noch keine Bilder vorhanden.':'Noch keine Pläne oder Modelle vorhanden.'}</p>}
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{files.map(file=><li key={file.id} className="space-y-2 rounded-xl border p-3">
      {imageFile(file.name) && <Photo path={path+'/'+file.id} name={file.name}/>}
      <p className="break-words text-sm font-semibold">{file.name}</p><Button size="sm" variant="outline" onClick={()=>download(file)}>Herunterladen</Button>
      {/\.ifc$/i.test(file.name) && <Button size="sm" variant="ghost" onClick={()=>setModel(file)}>In 3D öffnen</Button>}
    </li>)}</ul>
    {model && <div className="space-y-2"><Button variant="outline" onClick={()=>setModel(null)}>3D-Ansicht schließen</Button><IFCModelFrame key={model.id} document={model} modelPath={path+'/'+model.id} readOnly presentation="bim"/></div>}
  </section>;
}
