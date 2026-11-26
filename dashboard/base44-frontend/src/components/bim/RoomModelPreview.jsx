import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useBuildingScope } from '@/hooks/useBuildingScope';
import { useBuildingModels } from '@/hooks/useBuildingModels';
import { formatDateTime } from '@/lib/dates';
import { readingStatus } from '@/lib/roomAlerts';
import { roomDetailLink, roomModelFocus } from '@/lib/roomLocation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import IFCModelFrame from './IFCModelFrame';

const displayValue = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export function RoomReading({ reading }) {
  const status = readingStatus(reading);
  if (status === 'missing') return <span>Kein Messwert hinterlegt</span>;
  const source = reading.provider === 'home-assistant' ? 'Home Assistant'
    : reading.source === 'real' ? 'Sensormessung' : reading.source === 'demo' ? 'Demo-Messwert' : 'Quelle nicht hinterlegt';
  return <span className="break-words">
    <strong>{displayValue.format(reading.value)}{reading.unit ? ' ' + reading.unit : ''}</strong>
    {' · '}{[source, reading.sensor_code].filter(Boolean).join(' · ')}
    {' · '}{status === 'unknown-time' ? 'Zeitpunkt nicht verfügbar' : <time dateTime={reading.measured_at}>{formatDateTime(reading.measured_at)}</time>}
    {status === 'stale' && <span className="font-medium text-warning"> · Veraltet (älter als 24 h)</span>}
  </span>;
}

export function RoomDetailsLink({ buildingID, room }) {
  const scope = useBuildingScope();
  if (!room || !scope.can(buildingID, 'buildings') || !scope.can(buildingID, 'structure')) return null;
  return <Button variant="outline" size="sm" asChild>
    <Link to={roomDetailLink(buildingID, room.id)}>Raumdetails öffnen</Link>
  </Button>;
}

export function RoomModelPreview({ document, focus, onLocation, location, show = false }) {
  const [opened, setOpened] = useState(show);
  const [focusVersion, setFocusVersion] = useState(0);
  return <div className="min-w-0 space-y-3">
    {document ? <>
      <Button variant="outline" size="sm" onClick={() => { setOpened(true); setFocusVersion(value => value + 1); }}>
        <MapPin className="h-4 w-4" /> Im Modell zeigen
      </Button>
      {opened && <IFCModelFrame key={document.id} document={document} presentation="bim"
        issueFocus={focus} focusVersion={focusVersion} onIssueLocation={onLocation} readOnly />}
      {location && !location.roomHighlighted && (focus?.location || location.room || focus?.spaceID) &&
        <p role="status" className="text-sm text-muted-foreground">{location.room
          ? 'Für diesen Raum enthält das Modell keine darstellbare Geometrie.'
          : 'Der hinterlegte Ort lässt sich keinem Raum im Modell eindeutig zuordnen.'}</p>}
    </> : <p className="text-sm text-muted-foreground">Für dieses Gebäude ist kein Modell hinterlegt.</p>}
  </div>;
}

export function RoomFocusDialog({ building, room, floor, document, label, heading, reading, close, children, showModel = true }) {
  const scope = useBuildingScope();
  const { models, loading } = useBuildingModels(scope.can(building.id, 'bim') ? [building] : []);
  const [position, setPosition] = useState(null);
  const focus = useMemo(() => room ? roomModelFocus(room, floor)
    : label ? { label, location: label, building: building.name } : undefined, [room, floor, label, building.name]);
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[94dvh] w-[min(96vw,56rem)] max-w-none overflow-y-auto">
      <DialogTitle>{heading || (room ? [room.room_code, room.name].filter(Boolean).join(' · ') : label || 'Raumposition')}</DialogTitle>
      <DialogDescription>{building.name} · {position?.floor || floor?.name || 'Geschoss nicht hinterlegt'}</DialogDescription>
      {children}
      {heading && room && <p className="text-sm">{[room.room_code, room.name].filter(Boolean).join(' · ')}</p>}
      <p className="text-sm"><RoomReading reading={reading} /></p>
      <RoomDetailsLink buildingID={building.id} room={room} />
      {label && !room && <p className="text-sm text-muted-foreground">Hinterlegter Ort · {label}</p>}
      {loading && !document ? <p role="status">Modell wird gesucht …</p>
        : focus && <RoomModelPreview document={document || models[0]} focus={focus} show={showModel} location={position} onLocation={setPosition} />}
    </DialogContent>
  </Dialog>;
}
