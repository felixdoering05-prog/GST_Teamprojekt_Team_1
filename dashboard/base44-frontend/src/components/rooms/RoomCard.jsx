import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Building2, Camera, Layers } from 'lucide-react';
import { request } from '@/api/base44Client';
import { CreateIssue } from '@/components/BuildingIssues';
import { RoomModelPreview, RoomReading } from '@/components/bim/RoomModelPreview';
import { Button } from '@/components/ui/button';
import { useBuildingModels } from '@/hooks/useBuildingModels';
import { useBuildingScope } from '@/hooks/useBuildingScope';
import { issueLink } from '@/lib/buildingIssues';
import { metric } from '@/lib/metrics';
import { roomModelFocus } from '@/lib/roomLocation';

export default function RoomCard({ card }) {
  const { building, room, floor } = card;
  const scope = useBuildingScope();
  const navigate = useNavigate();
  const [reporting, setReporting] = useState(false);
  const [modelLocation, setModelLocation] = useState(null);
  const canMeasure = scope.can(building.id, 'sensors');
  const canModel = scope.can(building.id, 'bim');
  const canReport = scope.can(building.id, 'issues', 'edit');
  const latest = useQuery({
    queryKey: ['room-card-reading', scope.team.id, building.id, room.id],
    queryFn: () => request(`/buildings/${building.id}/telemetry/rooms/${room.id}/latest`),
    enabled: canMeasure,
    refetchInterval: 60000,
    retry: false,
    gcTime: 0,
  });
  const { models, loading, error } = useBuildingModels(canModel ? [building] : []);
  const model = models[0];
  const focus = useMemo(() => roomModelFocus(room, floor), [room, floor]);
  const reading = canMeasure ? latest.data?.reading : null;

  return <article className="mx-auto w-full max-w-xl space-y-4" aria-labelledby="room-card-title">
    <header className="surface space-y-4 p-5 sm:p-6">
      <div className="min-w-0">
        {room.room_code && room.room_code !== room.name && <p className="break-words text-sm font-semibold text-primary">Raum {room.room_code}</p>}
        <h2 id="room-card-title" className="break-words font-heading text-3xl font-semibold leading-tight">{room.name || room.room_code}</h2>
      </div>
      <dl className="grid gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="flex items-center gap-2 text-xs text-muted-foreground"><Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Geschoss</dt>
          <dd className="break-words pl-[1.375rem] text-sm font-medium">{floor?.name || 'Geschoss nicht hinterlegt'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Gebäude</dt>
          <dd className="break-words pl-[1.375rem] text-sm font-medium">{building.name}</dd>
        </div>
      </dl>
    </header>

    {canMeasure && <section className="surface space-y-2 p-5" aria-labelledby="room-reading-title">
      <h3 id="room-reading-title" className="flex items-center gap-2 font-heading font-semibold">
        <Activity className="h-4 w-4 text-primary" aria-hidden="true" /> Letzter Raummesswert
      </h3>
      {reading && !latest.isError && <p className="text-xs font-medium text-muted-foreground">{metric(reading.metric).label}</p>}
      <p className="text-sm" role="status">
        {latest.isPending ? 'Messwert wird geladen …' : latest.isError ? 'Der Messwert konnte nicht geladen werden.'
          : <RoomReading reading={reading} />}
      </p>
    </section>}

    {canReport && <Button className="min-h-12 w-full whitespace-normal text-base" onClick={() => setReporting(true)}>
      <Camera className="h-5 w-5 shrink-0" aria-hidden="true" /> Mangel mit Foto melden
    </Button>}
    {canModel && <section className="surface space-y-2 p-4" aria-label="Gebäudemodell">
      {loading ? <p role="status" className="text-sm text-muted-foreground">Modell wird gesucht …</p>
        : error && !model ? <p role="status" className="text-sm text-muted-foreground">Das Gebäudemodell konnte nicht geladen werden.</p>
          : <RoomModelPreview key={model?.id} document={model} focus={focus}
              buttonLabel="Im Modell anzeigen" location={modelLocation} onLocation={setModelLocation} />}
    </section>}
    <Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
      to={`/gebaeude?building=${building.id}&section=rooms`}>Zur Raumübersicht</Link>

    {reporting && canReport && <CreateIssue buildings={[building]} roomContext={{ room, floor }} close={() => setReporting(false)}
      created={issue => { setReporting(false); navigate(issueLink(issue)); }} />}
  </article>;
}
