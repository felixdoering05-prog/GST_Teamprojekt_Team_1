import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { modelLights, roomName, METRIC_LABELS, METRIC_UNITS } from './smartHomeModel';

const empty = { spaces: [], lamps: [], devices: [], imported: {}, overlay: { rooms: [], room_names: [] } };
export default function ModelSmartHome({ document: model, frame, onChanged, children }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState('');
  const [data, setData] = useState(empty), [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(''), [notice, setNotice] = useState('');
  const pending = useRef(false), version = useRef(0), alive = useRef(true);
  const root = `/buildings/${model.buildingID}`;
  const post = useCallback(body => frame.current?.contentWindow?.postMessage(body, window.location.origin), [frame]);
  const load = useCallback(async () => {
    if (pending.current) return;
    const ticket = ++version.current;
    setLoading(true);
    const paths = [`/documents/${model.id}/model-rooms`, `${root}/lamps`, `${root}/devices`, `${root}/home-assistant`, `/documents/${model.id}/sensor-overlay`];
    const results = await Promise.allSettled(paths.map(path => request(path)));
    if (!alive.current || ticket !== version.current) return;
    const labels = ['Raumliste', 'Lampen', 'Geräte', 'Home-Assistant-Import', 'Messwerte'];
    setErrors(results.flatMap((r, i) => r.status === 'rejected' ? [`${labels[i]}: ${r.reason.message}`] : []));
    // Failed sources are cleared, never shown as a current/confirmed device status.
    const value = (i, fallback) => results[i].status === 'fulfilled' ? results[i].value : fallback;
    setData({ spaces: value(0, {}).rooms || [], lamps: value(1, []), devices: value(2, []), imported: value(3, {}), overlay: value(4, empty.overlay) });
    setLoading(false);
  }, [model.id, root]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; version.current++; };
  }, []);
  useEffect(() => {
    function receive(event) {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === 'd21-smart-home-ready') post({ type: 'd21-smart-home-connected' });
      if (event.data?.type === 'd21-smart-home-mode') setOpen(event.data.open === true);
      if (event.data?.type === 'd21-room-selected' && Number.isInteger(event.data.space_id) && event.data.space_id > 0) {
        setSelected(String(event.data.space_id)); setOpen(true);
      }
    }
    window.addEventListener('message', receive);
    post({ type: 'd21-smart-home-connected' });
    return () => window.removeEventListener('message', receive);
  }, [frame, post]);
  useEffect(() => { post({ type: 'd21-smart-home-visible', open }); }, [open, post]);
  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(() => { if (!window.document.hidden) load(); }, 15000);
    return () => { clearInterval(timer); version.current++; };
  }, [open, load]);
  const lights = modelLights({ documentID: model.id, ...data, names: data.overlay.room_names });
  const spaceID = Number(selected), space = data.spaces.find(s => s.id === spaceID);
  const reading = data.overlay.rooms.find(r => r.space_id === spaceID);
  const savedName = data.overlay.room_names.find(r => r.space_id === spaceID)?.room;
  const visible = lights.filter(l => l.space === spaceID);
  const unplaced = lights.filter(l => !l.space);
  function choose(value) {
    setSelected(value); setNotice('');
    post({ type: 'd21-room-select', space_id: Number(value) || null });
  }
  async function action(light, body) {
    if (pending.current) return;
    pending.current = true; version.current++; setBusy(light.id); setNotice('Auftrag wird gesendet …');
    try {
      const result = light.control === 'ha'
        ? await request(`/integrations/home-assistant/lights/${encodeURIComponent(light.key)}/command`, { method: 'POST', body, headers: { 'X-Request-ID': crypto.randomUUID() } })
        : await request(`${root}/devices/${light.deviceID}`, { method: 'PATCH', body: { is_on: body.on, revision: light.revision, ...(body.rgb ? { rgb: body.rgb } : {}), ...(body.brightness ? { brightness: body.brightness } : {}) } });
      if (alive.current) setNotice(light.control === 'ha' ? result.message || (result.confirmed ? 'Zustand bestätigt.' : 'Auftrag gesendet; Zustand noch nicht bestätigt.') : 'Simulierter Zustand gespeichert.');
      onChanged?.(); post({ type: 'd21-smart-home-refresh' });
    } catch (e) { if (alive.current) setNotice(`Nicht bestätigt: ${e.message} Bitte Status aktualisieren; der Auftrag wird nicht automatisch wiederholt.`); }
    finally { pending.current = false; if (alive.current) { setBusy(''); load(); } }
  }
  async function assign(light) {
    if (pending.current || !space || !['ha', 'simulation'].includes(light.control)) return;
    pending.current = true; version.current++; setBusy(light.id); setNotice('Zuordnung wird gespeichert …');
    try {
      const path = light.control === 'ha' ? `/integrations/home-assistant/lights/${encodeURIComponent(light.key)}/location` : `${root}/devices/${light.deviceID}/location`;
      await request(path, { method: 'PUT', body: { building_id: model.buildingID, document_id: model.id, space_id: spaceID, revision: light.control === 'ha' ? light.location?.revision || 0 : light.revision } });
      if (alive.current) setNotice('Gerät dem Raum zugeordnet.');
      onChanged?.(); post({ type: 'd21-smart-home-refresh' });
    } catch (e) { if (alive.current) setNotice(e.message); }
    finally { pending.current = false; if (alive.current) { setBusy(''); load(); } }
  }
  async function allOff() {
    // Deliberate single commands: each result remains visible, no hidden retries.
    for (const light of visible.filter(l => l.control && l.available && l.is_on)) {
      await action(light, { on: false });
    }
  }
  return <div>
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2"><p className="text-xs text-muted-foreground">Raum im Modell anklicken oder aus der Liste wählen.</p><Button size="sm" variant={open ? 'secondary' : 'outline'} onClick={() => setOpen(!open)} aria-expanded={open}><SlidersHorizontal className="mr-2 h-4 w-4" />Räume & Geräte</Button></div>
    <div className={`grid min-w-0 ${open ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
      <div className="min-w-0">{children}</div>
      {open && <aside aria-label="Raumsteuerung" className="max-h-[750px] space-y-4 overflow-y-auto border-t bg-background/90 p-4 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Smart Home</h3><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={load} disabled={loading || !!busy} aria-label="Gerätestatus aktualisieren"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button><Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Raumsteuerung schließen"><X className="h-4 w-4" /></Button></div></div>
        <label className="block space-y-1 text-sm"><span>Raum auswählen</span><select className="min-h-11 w-full rounded-lg border bg-background p-2" value={selected} disabled={!!busy} onChange={e => choose(e.target.value)}><option value="">Raum wählen …</option>{data.spaces.map(s => <option key={s.id} value={s.id}>{data.overlay.room_names.find(n => n.space_id === s.id)?.room || s.name}</option>)}</select></label>
        {loading && !data.spaces.length && <p role="status" className="text-sm text-muted-foreground">Räume und Geräte werden geladen …</p>}
        {errors.map(e => <p key={e} role="alert" className="text-xs text-destructive">{e}</p>)}
        {!loading && !errors.length && !data.spaces.length && <p className="text-sm text-muted-foreground">Dieses IFC enthält keine Räume. Geräte können zugeordnet werden, sobald Räume im Modell hinterlegt sind.</p>}
        {notice && <p role="status" className="rounded-xl bg-muted p-3 text-sm">{notice}</p>}
        {space && <>
          <h4 className="text-lg font-semibold">{savedName || roomName(space.name)}</h4>
          <div className="grid grid-cols-3 gap-2">{Object.keys(METRIC_LABELS).map(metric => {
            const value = reading?.values.find(v => v.metric === metric);
            return <div key={metric} className="rounded-xl border p-2"><p className="text-[11px] text-muted-foreground">{METRIC_LABELS[metric]}</p><p className="mt-1 font-semibold tabular-nums">{value ? value.value.toLocaleString('de-DE', { maximumFractionDigits: metric === 'temperature' ? 1 : 0 }) : '—'}<small className="ml-1 font-normal">{METRIC_UNITS[metric]}</small></p>{value && <p className="mt-1 text-[10px] text-muted-foreground">{value.source === 'real' ? 'Messwert' : 'Simulation'}{value.stale ? ' · veraltet' : ''}</p>}</div>;
          })}</div>
          {reading?.readings?.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Einzelmesswerte und Zeitpunkte ({reading.readings.length})</summary><ul className="mt-2 space-y-2">{reading.readings.map((v, i) => <li key={i}>{METRIC_LABELS[v.metric]}: {v.value} {METRIC_UNITS[v.metric]} · {v.source === 'real' ? 'Messwert' : 'Simulation'} · {v.measured_at ? new Date(v.measured_at).toLocaleString('de-DE') : 'Zeit unbekannt'}{v.stale ? ' · veraltet' : ''}</li>)}</ul></details>}
          <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Licht & Steckdosen</h4><Button size="sm" variant="ghost" disabled={!!busy || !visible.some(l => l.control && l.available && l.is_on)} onClick={allOff}>Raumlicht aus</Button></div>
          {!visible.length && <p className="text-xs text-muted-foreground">Noch keine Lampen oder Steckdosen zugeordnet.</p>}
          {visible.map(light => <LightCard key={`${light.id}:${light.revision ?? ''}:${light.brightness}:${light.rgb}`} light={light} busy={!!busy} onAction={body => action(light, body)} />)}
          {unplaced.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Geräte zuordnen ({unplaced.length})</summary><ul className="mt-2 space-y-2">{unplaced.map(light => <li key={light.id} className="rounded-xl border p-3 text-sm"><p>{light.name}</p><p className="text-xs text-muted-foreground">{light.source}</p>{model.canEditTerrain && light.control ? <Button className="mt-2" size="sm" variant="outline" disabled={!!busy} onClick={() => assign(light)}>Diesem Raum zuordnen</Button> : <p className="mt-1 text-xs text-muted-foreground">{light.id.startsWith('import:') ? 'Zuordnung über die Home-Assistant-Verbindung in der iPhone-App.' : 'Zuordnung durch den Gebäudeeigentümer.'}</p>}</li>)}</ul></details>}
        </>}
      </aside>}
    </div>
  </div>;
}

function LightCard({ light, busy, onAction }) {
  const [brightness, setBrightness] = useState(Math.round((light.brightness ?? 255) / 255 * 100));
  const [color, setColor] = useState('#' + (light.rgb || [255, 231, 211]).map(n => Math.round(n).toString(16).padStart(2, '0')).join(''));
  const disabled = busy || !light.available || !light.control;
  const canDim = light.control === 'simulation' || light.brightness != null;
  return <section className="space-y-3 rounded-2xl border p-3" aria-label={`Gerät ${light.name}`}>
    <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><h5 className="break-words text-sm font-semibold">{light.name}</h5><p className="text-[11px] text-muted-foreground">{light.source} · {!light.available ? 'Nicht erreichbar / Stand unbekannt' : light.is_on === null ? 'Zustand unbekannt' : light.is_on ? 'An' : 'Aus'}</p></div><Button size="sm" variant={light.is_on ? 'default' : 'outline'} disabled={disabled || light.is_on === null} onClick={() => onAction({ on: !light.is_on })}>{light.is_on ? 'Ausschalten' : 'Einschalten'}</Button></div>
    {!light.control && <p className="text-xs text-muted-foreground">{light.source === 'Geplant' ? 'Gerät noch nicht verbunden.' : 'Dieser Zugang überträgt Zustände. Schalten zurzeit über die iPhone-App im Heimnetz.'}</p>}
    {light.control && light.kind === 'light' && (canDim || light.supports_rgb) && <div className="space-y-2">{canDim && <label className="block text-xs">Helligkeit · {brightness}%<input className="mt-2 w-full" aria-label={`Helligkeit ${light.name}`} type="range" min="1" max="100" value={brightness} disabled={disabled} onChange={e => setBrightness(Number(e.target.value))} /></label>}{light.supports_rgb && <label className="flex items-center justify-between text-xs">Lichtfarbe<input aria-label={`Lichtfarbe ${light.name}`} type="color" value={color} disabled={disabled} onChange={e => setColor(e.target.value)} /></label>}<Button size="sm" variant="secondary" disabled={disabled} onClick={() => onAction({ on: true, ...(canDim ? { brightness: Math.max(1, Math.round(brightness / 100 * 255)) } : {}), ...(light.supports_rgb ? { rgb: color.slice(1).match(/../g).map(x => parseInt(x, 16)) } : {}) })}>Licht einstellen</Button></div>}
  </section>;
}
