import { useEffect, useRef, useState } from 'react';
import { request } from '@/api/base44Client';

export default function IFCModelFrame({ document, heatmap, onHeatStatus }) {
  const frame = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [mapFallback, setMapFallback] = useState(false);
  useEffect(() => {
    if (!heatmap) return;
    const send = () => frame.current?.contentWindow?.postMessage({ type: 'd21-heat-state', scenario: heatmap }, window.location.origin);
    function receive(event) {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'd21-heat-ready') send();
    }
    window.addEventListener('message', receive); send();
    return () => window.removeEventListener('message', receive);
  }, [heatmap]);
  useEffect(() => {
    if (document.example || document.mapOnly) { setLoading(false); setError(''); return; }
    let active = true, ready = false, buffer;
    setLoading(true); setError('');
    function send() {
      if (!active || !ready || !buffer || !frame.current?.contentWindow) return;
      frame.current.contentWindow.postMessage({ type: 'd21-ifc-model', buffer, placement: { latitude: document.latitude, longitude: document.longitude, model_heading_degrees: document.model_heading_degrees ?? 0, map_provider_consent: document.map_provider_consent === true } }, window.location.origin, [buffer]);
      buffer = undefined; setLoading(false);
    }
    async function receive(event) {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === 'd21-heat-status') { onHeatStatus?.(event.data); return; }
      if (event.data?.type === 'd21-ifc-ready') { ready = true; send(); return; }
      if (event.data?.type !== 'd21-scene-request' || typeof event.data.id !== 'string' || event.data.id.length > 100) return;
      if (document.campus) return;
      const {id,operation,revision} = event.data;
      const target = event.source;
      try {
        const result = await request(`/documents/${document.id}/model-state`, operation ? {method:'POST',body:{operation,revision}} : {});
        if(active) target.postMessage({type:'d21-scene-reply',id,result}, window.location.origin);
      } catch(e) { if(active) target.postMessage({type:'d21-scene-reply',id,error:e.message}, window.location.origin); }
    }
    window.addEventListener('message', receive);
    request(document.campus ? '/campus/d21/model' : `/documents/${document.id}`, { raw: true }).then(async blob => {
      if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Bitte ein IFC-Modell bis 20 MB auswählen.');
      const bytes = await blob.arrayBuffer();
      if (active) { buffer = bytes; send(); }
    }).catch(e => { if (active) { setError(e.message); setLoading(false); if (document.campus) setMapFallback(true); } });
    return () => { active = false; buffer = undefined; window.removeEventListener('message', receive); };
  }, [document.id, document.example, document.campus, document.mapOnly, attempt, onHeatStatus]);
  const mapOnly = document.mapOnly || mapFallback;
  const source = (document.example ? '?example=true' : document.campus ? `?campus=d21${mapOnly ? '&map-only=true' : ''}` : '') + (heatmap ? '&heat=true' : '');
  return <div>
    {loading && <p role="status" className="px-4 py-3 text-xs text-muted-foreground">{document.campus ? 'Originales D21-Modell wird geschützt geladen …' : 'Modell wird aus deiner Gebäudemappe geladen …'}</p>}
    {error && <div role="alert" className="p-5 text-sm text-destructive"><p>{error}</p><button className="mt-2 underline" onClick={() => { setMapFallback(false); setAttempt(n => n + 1); }}>Erneut versuchen</button></div>}
    <iframe onLoad={() => { if (!document.example && !mapOnly) frame.current?.contentWindow?.postMessage({ type: 'd21-ifc-request' }, window.location.origin); }} ref={frame} key={`${document.id}-${attempt}-${Boolean(mapOnly)}`} src={`/ifc-viewer/index.html${source}`} title={heatmap ? 'Heat map: D21 und h_da-Campus' : mapOnly ? 'h_da-Campuskarte' : `3D-Modell: ${document.name}`} className={`block ${heatmap ? 'h-[560px] min-h-[420px] max-sm:h-[470px]' : 'h-[calc(100dvh-240px)] min-h-[480px]'} w-full border-0 ${error && !document.campus ? 'hidden' : ''}`} />
  </div>;
}
