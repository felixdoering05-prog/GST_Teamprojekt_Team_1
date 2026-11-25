import { useCallback, useEffect, useState } from 'react';
import { Activity, DoorOpen, Plus, Users, Wifi, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ConfirmDialog from '@/components/ConfirmDialog';
import { request } from '@/api/base44Client';
import { useAppearance } from '@/lib/Appearance';

const REFRESH_MS = 10000;
const timeLabel = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
// Bewegungsenergie der Firmware ist unskaliert; grobe Stufen reichen für die Anzeige.
const motionLabel = value => value < 0.05 ? 'ruhig' : value < 0.5 ? 'leicht' : value < 2 ? 'mittel' : 'stark';

const OWN_NAME = '__eigener_name__';
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

function NodeCard({ node, rooms, buildingID, onRenamed }) {
  const [editing, setEditing] = useState(false);
  // Auswahl: ein Raum des Gebäudes (id), OWN_NAME für Freitext oder '' für „kein Raum“.
  const [choice, setChoice] = useState(node.room_id || (node.room ? OWN_NAME : ''));
  const [room, setRoom] = useState(node.room_id ? '' : node.room || '');
  const [error, setError] = useState('');
  const present = node.presence && !node.stale;
  const freeText = !rooms.length || choice === OWN_NAME;

  function startEditing() {
    setChoice(node.room_id || (node.room ? OWN_NAME : rooms[0]?.id || ''));
    setRoom(node.room_id ? '' : node.room || '');
    setEditing(true);
  }

  async function saveRoom(event) {
    event.preventDefault();
    const body = freeText ? { room: room.trim() || null } : { room_id: choice || null };
    try {
      await request(`/buildings/${buildingID}/ruview/${node.bridge_id}/nodes/${node.node_id}`, { method: 'PUT', body });
      setEditing(false); setError(''); onRenamed();
    } catch (failure) { setError(failure.message); }
  }

  return <article className="surface space-y-3 p-4" aria-label={`Knoten ${node.node_id}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">ESP32 · Knoten {node.node_id}</p>
        {editing
          ? <form className="mt-1 space-y-2" onSubmit={saveRoom}>
              {rooms.length > 0 && <select autoFocus className={selectClass} value={choice} onChange={event => setChoice(event.target.value)} aria-label="Raum des Gebäudes">
                {rooms.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                <option value={OWN_NAME}>Eigener Name …</option>
                <option value="">Kein Raum</option>
              </select>}
              {freeText && <Input autoFocus={!rooms.length} value={room} maxLength={80} onChange={event => setRoom(event.target.value)} placeholder="z. B. Wohnzimmer" aria-label="Raumname" />}
              <div className="flex gap-2">
                <Button size="sm" type="submit">Speichern</Button>
                <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Abbrechen</Button>
              </div>
            </form>
          : <button type="button" className="text-left text-base font-semibold hover:underline" onClick={startEditing}>
              {node.room || 'Raum festlegen'}
            </button>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${node.stale ? 'bg-slate-100 text-slate-500' : present ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
        {node.stale ? 'veraltet' : present ? 'anwesend' : 'niemand erkannt'}
      </span>
    </div>
    <dl className="grid grid-cols-3 gap-2 text-sm">
      <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Activity className="h-3 w-3" />Bewegung</dt><dd className="font-medium">{node.stale ? '–' : motionLabel(node.motion)}</dd></div>
      <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />Personen</dt><dd className="font-medium">{present ? `≈ ${node.persons}` : '–'}</dd></div>
      <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Wind className="h-3 w-3" />Atmung</dt><dd className="font-medium">{present && node.breathing_bpm ? `≈ ${Math.round(node.breathing_bpm)} /min` : '–'}</dd></div>
    </dl>
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <Wifi className="h-3 w-3" />{node.rssi ?? '–'} dBm · {node.pps ?? '–'} Messungen/s · Stand {timeLabel(node.updated_at)}
    </p>
  </article>;
}

// Grobe Übersicht: Wer ist ungefähr in welchem Raum? Nur Knoten mit zugeordnetem Raum zählen.
function RoomOverview({ occupancy }) {
  if (!occupancy?.length) return null;
  return <div className="flex flex-wrap gap-2" aria-label="Personen je Raum">
    {occupancy.map(room => <div key={room.room_id || room.room}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${room.stale ? 'border-border text-muted-foreground' : room.presence ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-border'}`}>
      <DoorOpen className="h-4 w-4" />
      <span className="font-medium">{room.room}</span>
      <span>{room.stale ? 'veraltet' : room.presence ? `≈ ${room.persons} ${room.persons === 1 ? 'Person' : 'Personen'}` : 'leer'}</span>
      {room.nodes > 1 && <span className="text-xs text-muted-foreground">· {room.nodes} Knoten</span>}
    </div>)}
  </div>;
}

function BuildingPresence({ building }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const [newBridge, setNewBridge] = useState(null);
  const [revoke, setRevoke] = useState(null);

  const load = useCallback(async () => {
    try { setState(await request(`/buildings/${building.id}/ruview`)); setError(''); }
    catch (failure) { setError(failure.message); }
  }, [building.id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function createBridge(event) {
    event.preventDefault();
    try {
      setNewBridge(await request(`/buildings/${building.id}/ruview-bridges`, { method: 'POST', body: { label: label.trim() || 'Heim-Brücke' } }));
      setLabel(''); load();
    } catch (failure) { setError(failure.message); }
  }

  async function revokeBridge() {
    try { await request(`/buildings/${building.id}/ruview-bridges/${revoke.id}`, { method: 'DELETE' }); setRevoke(null); load(); }
    catch (failure) { setError(failure.message); }
  }

  if (!state) return error ? <p role="alert" className="text-sm text-destructive">{building.name}: {error}</p> : null;
  if (!state.enabled) return <p className="text-sm text-muted-foreground">{building.name}: Der Eigentümer hat WLAN-Präsenz nicht eingeschaltet.</p>;

  return <div className="space-y-3">
    <h3 className="font-semibold">{building.name}</h3>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <RoomOverview occupancy={state.occupancy} />
    {state.nodes.length
      ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.nodes.map(node => <NodeCard key={`${node.bridge_id}-${node.node_id}`} node={node} rooms={state.rooms || []} buildingID={building.id} onRenamed={load} />)}
        </div>
      : <p className="text-sm text-muted-foreground">Noch keine Werte. Sobald die Brücke läuft, erscheinen die ESP32-Knoten hier.</p>}

    {newBridge && <div className="surface space-y-2 border-amber-300 p-4 text-sm" role="status">
      <p className="font-medium">Brücke „{newBridge.label}“ angelegt. Der Schlüssel wird nur jetzt angezeigt:</p>
      <code className="block break-all rounded bg-slate-100 p-2 text-xs">{newBridge.token}</code>
      <p>Auf dem Rechner im Heimnetz speichern und die Brücke starten:</p>
      <code className="block whitespace-pre-wrap rounded bg-slate-100 p-2 text-xs">{`umask 077 && pbpaste > ~/.nala-ruview-bridge\nnode sensorik/ruview-bridge/ruview-bridge.js --token-file ~/.nala-ruview-bridge`}</code>
      <Button size="sm" variant="outline" onClick={() => setNewBridge(null)}>Schlüssel gesichert</Button>
    </div>}

    <div className="flex flex-wrap items-center gap-2 text-sm">
      {state.bridges.map(bridge => <span key={bridge.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
        {bridge.label} · {bridge.last_at ? `zuletzt ${timeLabel(bridge.last_at)}` : 'noch keine Meldung'}
        <button type="button" className="text-destructive hover:underline" onClick={() => setRevoke(bridge)}>sperren</button>
      </span>)}
      {state.bridges.length < 3 && <form className="flex gap-2" onSubmit={createBridge}>
        <Input className="h-8 w-48" value={label} maxLength={60} onChange={event => setLabel(event.target.value)} placeholder="Name, z. B. Mac" aria-label="Name der Brücke" />
        <Button size="sm" type="submit"><Plus className="mr-1 h-4 w-4" />Brücke anlegen</Button>
      </form>}
    </div>
    <ConfirmDialog open={Boolean(revoke)} onOpenChange={open => !open && setRevoke(null)}
      title="Brücke sperren?" description="Der Schlüssel wird ungültig. Alle gespeicherten Präsenzwerte dieser Brücke werden gelöscht."
      confirmLabel="Sperren" onConfirm={revokeBridge} />
  </div>;
}

// Wird nur angezeigt, wenn WLAN-Präsenz in den Einstellungen eingeschaltet ist.
export default function RuViewPanel({ buildings }) {
  const { value } = useAppearance();
  if (!value.ruview_enabled || !buildings.length) return null;
  return <section className="space-y-4" aria-labelledby="ruview-panel-title">
    <div>
      <h2 className="text-lg font-semibold" id="ruview-panel-title">WLAN-Präsenz · experimentell</h2>
      <p className="text-sm text-muted-foreground">Schätzung aus ESP32-WLAN-Signalen (RuView). Aktualisiert alle 10 Sekunden; älter als 60 Sekunden gilt als veraltet.</p>
    </div>
    {buildings.map(building => <BuildingPresence key={building.id} building={building} />)}
  </section>;
}
