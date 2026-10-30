import { useEffect, useRef, useState } from 'react';
import { request } from '@/api/base44Client';

export default function IFCModelFrame({ document }) {
  const frame = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, ready = false, buffer;
    setLoading(true); setError('');
    function send() {
      if (!active || !ready || !buffer || !frame.current?.contentWindow) return;
      frame.current.contentWindow.postMessage({ type: 'd21-ifc-model', buffer }, window.location.origin, [buffer]);
      buffer = undefined; setLoading(false);
    }
    function receive(event) {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin || event.data?.type !== 'd21-ifc-ready') return;
      ready = true; send();
    }
    window.addEventListener('message', receive);
    request(`/documents/${document.id}`, { raw: true }).then(async blob => {
      if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Bitte ein IFC-Modell bis 20 MB auswählen.');
      const bytes = await blob.arrayBuffer();
      if (active) { buffer = bytes; send(); }
    }).catch(e => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; buffer = undefined; window.removeEventListener('message', receive); };
  }, [document.id, attempt]);
  return <div className="space-y-3">
    {loading && <p role="status">Modell wird aus deiner Gebäudemappe geladen …</p>}
    {error && <div role="alert"><p>{error}</p><button className="mt-2 underline" onClick={() => setAttempt(n => n + 1)}>Erneut versuchen</button></div>}
    <iframe onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'd21-ifc-request' }, window.location.origin)} ref={frame} key={`${document.id}-${attempt}`} src="/ifc-viewer/index.html" title={`3D-Modell: ${document.name}`} className={`h-[72vh] min-h-[440px] w-full rounded-xl border ${error ? 'hidden' : ''}`} />
    <p className="text-xs text-muted-foreground">Drehen, zoomen, Bauteile einfärben und ausblenden. Unter Smart Home kannst du Licht für exportierte IFC-Räume simulieren. Ansichtsänderungen gelten nur hier; die Originaldatei bleibt erhalten.</p>
  </div>;
}
