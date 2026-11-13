import { useEffect, useRef, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { locationFromInput } from '../../../ifc-viewer/map-location.js';

const coordinateText = ({ latitude, longitude }) => `${latitude}, ${longitude}`;

export default function ModelTerrainPanel({ documentID, site, onTerrain }) {
  const endpoint = `/documents/${documentID}/map-view`;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [location, setLocation] = useState('');
  const [heading, setHeading] = useState('0');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const sending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function readLocation() {
    setBusy(true);
    setError('');
    try {
      const { map_view: current } = await request(endpoint);
      if (!mounted.current) return;
      setView(current);
      setLocation(current ? coordinateText(current) : '');
      setHeading(String(current?.heading ?? 0));
      setReady(true);
    } catch (problem) {
      if (mounted.current) setError(problem.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (sending.current || !ready) return;
    const point = locationFromInput(location);
    const rotation = Number(heading);
    if (!point || !heading.trim() || !Number.isFinite(rotation) || rotation < 0 || rotation >= 360) {
      setError(!point ? 'Bitte einen Kartenlink mit Koordinaten oder Breitengrad und Längengrad eingeben. Kurzlinks zuerst im Browser öffnen.' : 'Bitte eine Drehung von 0 bis unter 360 Grad eingeben.');
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    setMessage('Umgebung wird geladen …');
    try {
      let current = view;
      if (!current || current.latitude !== point.latitude || current.longitude !== point.longitude || current.heading !== rotation) {
        const saved = await request(endpoint, { method: 'PUT', body: {
          ...point, heading: rotation, meters_per_unit: current?.meters_per_unit ?? 1, revision: current?.revision ?? 0,
        } });
        current = saved.map_view;
        if (mounted.current) setView(current);
      }
      if (!current.features?.length) {
        const loaded = await request(`${endpoint}/load`, { method: 'POST', body: { revision: current.revision } });
        current = loaded.map_view;
      }
      if (!mounted.current) return;
      setView(current);
      setLocation(coordinateText(current));
      setMessage('Gelände gespeichert.');
      setOpen(false);
      onTerrain(current);
    } catch (problem) {
      if (mounted.current) {
        setMessage('');
        setError(problem.message);
        if (problem.status === 409 && /inzwischen geändert|während des Ladens/.test(problem.message)) setReady(false);
      }
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <div className="border-b border-border px-4 py-3 sm:px-5">
    <Button type="button" size="sm" variant="outline" className="gap-2" aria-expanded={open} onClick={() => {
      setOpen(!open);
      if (!open && !ready && !busy) void readLocation();
    }}><MapPinned className="h-4 w-4" />Gelände einrichten</Button>
    {message && <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p>}
    {open && <form className="mt-3 max-w-2xl space-y-3" onSubmit={submit}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!ready && !busy && <Button type="button" size="sm" variant="outline" onClick={readLocation}>Standort neu laden</Button>}
      <label className="block text-sm font-medium" htmlFor="terrain-location">Kartenlink oder Koordinaten</label>
      <input id="terrain-location" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" value={location}
        onChange={event => setLocation(event.target.value)} placeholder="z. B. 50.1109, 8.6821" maxLength={5000} disabled={busy || !ready} required
        aria-describedby="terrain-location-help" />
      <p id="terrain-location-help" className="text-xs text-muted-foreground">Setze den Kartenpunkt auf das Gebäude. Du kannst einen OpenStreetMap- oder Google-Maps-Link mit Koordinaten einfügen. Für die Umgebung werden die Koordinaten an den Kartendienst gesendet.</p>
      {site && <Button type="button" size="sm" variant="outline" disabled={busy || !ready} onClick={() => setLocation(coordinateText(site))}>IFC-Standort verwenden</Button>}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ausrichtung anpassen</summary>
        <label className="mt-2 flex items-center gap-3">Kartendrehung in Grad
          <input className="min-h-10 w-24 rounded-lg border border-border bg-background px-3" type="number" min="0" max="360" step="any"
            value={heading} onChange={event => setHeading(event.target.value)} disabled={busy || !ready} />
        </label>
      </details>
      <Button type="submit" size="sm" disabled={busy || !ready}>Gelände laden und anzeigen</Button>
    </form>}
  </div>;
}
