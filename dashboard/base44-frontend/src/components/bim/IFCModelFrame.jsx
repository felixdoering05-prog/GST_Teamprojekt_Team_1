import { useEffect, useRef, useState } from 'react';
import { request } from '@/api/base44Client';

export default function IFCModelFrame({ document }) {
  const frame = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (document.example) { setLoading(false); setError(''); return; }
    let active = true, ready = false, buffer;
    setLoading(true); setError('');
    function send() {
      if (!active || !ready || !buffer || !frame.current?.contentWindow) return;
      frame.current.contentWindow.postMessage({ type: 'd21-ifc-model', buffer }, window.location.origin, [buffer]);
      buffer = undefined; setLoading(false);
    }
    async function receive(event) {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === 'd21-ifc-ready') { ready = true; send(); return; }
      if (event.data?.type !== 'd21-scene-request' || typeof event.data.id !== 'string' || event.data.id.length > 100) return;
      const {id,operation,revision} = event.data;
      const target = event.source;
      try {
        const result = await request(`/documents/${document.id}/model-state`, operation ? {method:'POST',body:{operation,revision}} : {});
        if(active) target.postMessage({type:'d21-scene-reply',id,result}, window.location.origin);
      } catch(e) { if(active) target.postMessage({type:'d21-scene-reply',id,error:e.message}, window.location.origin); }
    }
    window.addEventListener('message', receive);
    request(`/documents/${document.id}`, { raw: true }).then(async blob => {
      if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Bitte ein IFC-Modell bis 20 MB auswählen.');
      const bytes = await blob.arrayBuffer();
      if (active) { buffer = bytes; send(); }
    }).catch(e => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; buffer = undefined; window.removeEventListener('message', receive); };
  }, [document.id, document.example, attempt]);
  return <div>
    {loading && <p role="status" className="px-4 py-3 text-xs text-muted-foreground">Modell wird aus deiner Gebäudemappe geladen …</p>}
    {error && <div role="alert" className="p-5 text-sm text-destructive"><p>{error}</p><button className="mt-2 underline" onClick={() => setAttempt(n => n + 1)}>Erneut versuchen</button></div>}
    <iframe onLoad={() => { if (!document.example) frame.current?.contentWindow?.postMessage({ type: 'd21-ifc-request' }, window.location.origin); }} ref={frame} key={`${document.id}-${attempt}`} src={`/ifc-viewer/index.html${document.example ? '?example=true' : ''}`} title={`3D-Modell: ${document.name}`} className={`block h-[calc(100dvh-240px)] min-h-[480px] w-full border-0 ${error ? 'hidden' : ''}`} />
  </div>;
}
