import { useState } from 'react';
import { request } from '@/api/base44Client';

export default function ScheduleDocuments({item}) {
  const [error,setError]=useState('');
  const files=item.linked_documents||[];
  if(!files.length)return null;
  async function download(file){
    setError('');
    try {
      const blob=await request(file.path,{raw:true});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download=file.name;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch(err){setError(err.message);}
  }
  return <div><ul className="flex flex-wrap gap-x-3 gap-y-1">{files.map(file=><li key={file.path}><button type="button" className="break-all text-sm text-primary underline" onClick={()=>download(file)}>{file.name}</button></li>)}</ul>{error && <p role="alert">{error}</p>}</div>;
}
