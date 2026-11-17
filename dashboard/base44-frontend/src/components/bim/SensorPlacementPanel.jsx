import { useCallback, useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const REASONS = {
  'no-building': 'Ohne Gebäude hinterlegt – gehört er in dieses Gebäude?',
  'no-room': 'Ohne Raum hinterlegt.',
  'room-not-in-model': 'Raum nicht eindeutig im Modell gefunden.',
};

/**
 * Neue Sensoren den Raum-Popups zuordnen: eindeutige Raumnamen verknüpft der Server automatisch,
 * hier wird nur nachgefragt, wenn Gebäude oder Raum unklar sind.
 */
export default function SensorPlacementPanel({ documentID, onPlaced }) {
  const [state, setState] = useState({ open: [], spaces: [], linked: [] });
  const [choice, setChoice] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const sync = useCallback(() => request(`/documents/${documentID}/sensor-placement/sync`, { method: 'POST', body: {} })
    .then(data => {
      setState({ open: data.open || [], spaces: data.spaces || [], linked: data.linked || [] });
      setChoice(current => Object.fromEntries((data.open || []).map(s => [s.id, current[s.id] ?? (s.suggested_space_id ? String(s.suggested_space_id) : '')])));
      if (data.linked?.length) onPlaced?.();
    }).catch(() => {}), [documentID, onPlaced]);
  useEffect(() => {
    sync();
    // Neu hinterlegte Sensoren erscheinen ohne Neuladen der Seite.
    const timer = setInterval(() => { if (!window.document.hidden) sync(); }, 60000);
    return () => clearInterval(timer);
  }, [sync]);
  async function answer(sensor, body) {
    setBusy(sensor.id); setError('');
    try {
      await request(`/documents/${documentID}/sensor-placement/${encodeURIComponent(sensor.id)}`, { method: 'PUT', body });
      onPlaced?.();
      await sync();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  const { open, spaces, linked } = state;
  if (!open.length && !linked.length) return null;
  return <section aria-label="Sensoren zuordnen" className="border-b border-white/50 bg-white/20 px-4 py-3 text-sm sm:px-5">
    {linked.length > 0 && <p role="status" className="text-xs text-muted-foreground">
      {linked.length === 1 ? `Sensor „${linked[0].name}“ wurde automatisch dem Raum „${linked[0].space}“ zugeordnet.` : `${linked.length} Sensoren wurden automatisch ihren Räumen zugeordnet.`}
    </p>}
    {open.length > 0 && <>
      <div className="flex items-center gap-2 font-medium text-foreground"><Radio className="h-4 w-4" aria-hidden="true" />Neue Sensoren zuordnen</div>
      <p className="mt-1 text-xs text-muted-foreground">Zu welchem Raum in diesem Modell gehören diese Sensoren? Danach erscheinen ihre Werte im Raum-Popup.</p>
      <ul className="mt-3 space-y-2">
        {open.map(sensor => <li key={sensor.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/60 bg-white/40 px-3 py-2">
          <div className="min-w-[10rem] flex-1">
            <div className="font-medium text-foreground">{sensor.name}{sensor.room ? <span className="font-normal text-muted-foreground"> · bisher „{sensor.room}“</span> : null}</div>
            <div className="text-xs text-muted-foreground">{REASONS[sensor.reason] || ''}</div>
          </div>
          <label className="sr-only" htmlFor={`place-${sensor.id}`}>Raum für {sensor.name}</label>
          <select id={`place-${sensor.id}`} value={choice[sensor.id] || ''} onChange={e => setChoice(c => ({ ...c, [sensor.id]: e.target.value }))}
            className="min-h-9 max-w-full rounded-lg border border-border bg-background/80 px-2 text-sm">
            <option value="">Raum wählen …</option>
            {spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
          <Button size="sm" className="rounded-full" disabled={!choice[sensor.id] || busy === sensor.id}
            onClick={() => answer(sensor, { space_id: Number(choice[sensor.id]) })}>Zuordnen</Button>
          <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={busy === sensor.id}
            onClick={() => answer(sensor, { skip: true })}>Nicht in diesem Modell</Button>
        </li>)}
      </ul>
    </>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </section>;
}
