import { useEffect, useRef, useState } from 'react';
import { request } from '@/api/base44Client';
import { ifcViewerUrl } from '@/lib/ifcViewerUrl';
import ModelTerrainPanel from './ModelTerrainPanel';

export default function IFCModelFrame({ document, heatmap, onHeatStatus, presentation, roomHeat, onRoomHeatMessage }) {
  const frame = useRef(null);
  const [error, setError] = useState('');
  const [viewerError, setViewerError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [mapFallback, setMapFallback] = useState(false);
  const [site, setSite] = useState(null);
  const terrainReady = useRef(false);
  const pendingTerrain = useRef(null);
  const roomHeatMode = Boolean(onRoomHeatMessage);
  const canEditTerrain = presentation === 'bim' && document.canEditTerrain;
  function openTerrain(view) {
    if (!terrainReady.current || !frame.current?.contentWindow) {
      pendingTerrain.current = view;
      return;
    }
    frame.current.contentWindow.postMessage({ type: 'd21-bim-terrain', view }, window.location.origin);
    pendingTerrain.current = null;
  }
  useEffect(() => {
    if (!onRoomHeatMessage) return;
    function receive(event) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (['d21-room-heat-floors', 'd21-room-heat-plan', 'd21-room-heat-selected', 'd21-room-heat-error'].includes(event.data?.type)) {
        onRoomHeatMessage(event.data);
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onRoomHeatMessage]);
  useEffect(() => {
    if (roomHeat) frame.current?.contentWindow?.postMessage({ type: 'd21-room-heat-state', ...roomHeat }, window.location.origin);
  }, [roomHeat]);
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
    let active = true, ready = false, buffer, mapRevision;
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
      if (canEditTerrain && event.data?.type === 'd21-bim-location') {
        terrainReady.current = true;
        setSite(event.data.site);
        if (pendingTerrain.current) openTerrain(pendingTerrain.current);
        return;
      }
      if (event.data?.type !== 'd21-scene-request' || typeof event.data.id !== 'string' || event.data.id.length > 100) return;
      if (document.campus || roomHeatMode) return;
      const {id,operation,revision} = event.data;
      const target = event.source;
      try {
        const query = !operation && mapRevision !== undefined ? `?map_revision=${mapRevision}` : '';
        const result = await request(`/documents/${document.id}/model-state${query}`, operation ? {method:'POST',body:{operation,revision}} : {});
        if (Number.isInteger(result.map_view?.revision)) mapRevision = Math.max(mapRevision ?? 0, result.map_view.revision);
        if(active) target.postMessage({type:'d21-scene-reply',id,result}, window.location.origin);
      } catch(e) { if(active) target.postMessage({type:'d21-scene-reply',id,error:e.message}, window.location.origin); }
    }
    window.addEventListener('message', receive);
    request(document.campus ? '/campus/d21/model' : `/documents/${document.id}`, { raw: true }).then(async blob => {
      if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Bitte ein IFC-Modell bis 20 MB auswählen.');
      const bytes = await blob.arrayBuffer();
      if (active) { buffer = bytes; send(); }
    }).catch(e => {
      if (!active) return;
      setError(e.message); setLoading(false);
      if (document.campus && !roomHeatMode) setMapFallback(true);
      if (roomHeatMode) onRoomHeatMessage({ type: 'd21-room-heat-error', message: e.message });
    });
    return () => { active = false; buffer = undefined; terrainReady.current = false; window.removeEventListener('message', receive); };
  }, [document.id, document.example, document.campus, document.mapOnly, attempt, roomHeatMode, onRoomHeatMessage, canEditTerrain, onHeatStatus, document.latitude, document.longitude, document.model_heading_degrees, document.map_provider_consent]);
  const mapOnly = document.mapOnly || mapFallback;
  const source = ifcViewerUrl({ example: document.example, campus: document.campus, mapOnly, heat: Boolean(heatmap), roomHeat: roomHeatMode, presentation });
  function onFrameLoad(event) {
    const loadedFrame = event.currentTarget;
    if (!loadedFrame.contentDocument?.getElementById('scene')) {
      const message = 'Der 3D-Viewer konnte nicht geladen werden. Bitte versuche es erneut.';
      setViewerError(message);
      setLoading(false);
      if (roomHeatMode) onRoomHeatMessage({ type: 'd21-room-heat-error', message });
      return;
    }
    setViewerError('');
    if (!document.example && !mapOnly) {
      loadedFrame.contentWindow?.postMessage({ type: 'd21-ifc-request' }, window.location.origin);
    }
  }
  function retry() {
    setViewerError('');
    setMapFallback(false);
    setAttempt(current => current + 1);
  }
  const message = viewerError || error;
  const hideFrame = viewerError || (error && (!document.campus || roomHeatMode));
  return <div>
    {canEditTerrain && <ModelTerrainPanel documentID={document.id} site={site} onTerrain={openTerrain} />}
    {loading && <p role="status" className="px-4 py-3 text-xs text-muted-foreground">{document.campus ? 'Originales D21-Modell wird geschützt geladen …' : 'Modell wird aus deiner Gebäudemappe geladen …'}</p>}
    {message && <div role="alert" className="p-5 text-sm text-destructive"><p>{message}</p>{!roomHeatMode && <button className="mt-2 underline" onClick={retry}>Erneut versuchen</button>}</div>}
    <iframe onLoad={onFrameLoad} ref={frame} key={`${document.id}-${attempt}-${Boolean(mapOnly)}`} src={source} title={roomHeatMode ? `3D-Geschossschnitt · ${document.name}` : heatmap ? 'Heat map: D21 und h_da-Campus' : mapOnly ? 'h_da-Campuskarte' : `3D-Modell: ${document.name}`} className={`block ${roomHeatMode ? 'h-[360px] sm:h-[460px]' : presentation === 'dashboard' ? 'h-[450px]' : presentation === 'bim' ? 'h-[clamp(420px,62dvh,750px)] sm:h-[clamp(490px,66dvh,860px)]' : heatmap ? 'h-[560px] min-h-[420px] max-sm:h-[470px]' : 'h-[calc(100dvh-240px)] min-h-[480px]'} w-full border-0 ${hideFrame ? 'hidden' : ''}`} />
  </div>;
}
