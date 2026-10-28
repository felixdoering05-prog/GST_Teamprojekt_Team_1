import { useState } from 'react';
import { Boxes, Info, Layers, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import StatusChip from '@/components/StatusChip';
import SourceBadge from '@/components/SourceBadge';
import FloorPlan from '@/components/bim/FloorPlan';
import RoomDetailPanel from '@/components/bim/RoomDetailPanel';
import { Button } from '@/components/ui/button';
import useD21Data from '@/hooks/useD21Data';
import { readingsForRoom, roomSeries, statusForRoom } from '@/lib/roomMetrics';
import { METRIC_KEYS } from '@/lib/metrics';

const LEGEND = [
  { level: 'ok', label: 'Im Sollbereich' },
  { level: 'warning', label: 'Warnung' },
  { level: 'critical', label: 'Kritisch' },
  { level: 'unknown', label: 'Keine Daten' },
];

export default function BimViewer() {
  const data = useD21Data();
  const [floorId, setFloorId] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const floors = [...data.floors].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  const activeFloor = floors.find((f) => f.id === floorId) || floors[0] || null;
  const activeFloorId = activeFloor ? activeFloor.id : null;
  const floorRooms = data.rooms
    .filter((r) => r.floor_id === activeFloorId)
    .sort((a, b) => String(a.room_code).localeCompare(String(b.room_code), 'de'));

  const readingsByRoom = {};
  data.rooms.forEach((room) => {
    readingsByRoom[room.id] = { readings: readingsForRoom(room, data.sensors, data.latest, data.thresholds), status: statusForRoom(room, data.sensors, data.latest, data.thresholds) };
  });

  const selectedRoom = data.rooms.find((r) => r.id === selectedRoomId) || floorRooms[0] || null;
  const pointsByMetric = {};
  if (selectedRoom) {
    METRIC_KEYS.forEach((key) => {
      pointsByMetric[key] = roomSeries(selectedRoom, data.sensors, data.series, key);
    });
  }

  if (data.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
      </div>
    );
  }

  if (!data.rooms.length) {
    return (
      <div>
        <PageHeader title="BIM-Viewer" description="Interaktive schematische Gebäudeansicht als Platzhalter für das spätere Revit-/IFC-Modell." />
        <EmptyState
          icon={Boxes}
          title="Keine Räume für die Darstellung vorhanden"
          description="Die schematische Ansicht baut auf den angelegten Geschossen und Räumen auf. Legen Sie zuerst Räume unter „Gebäude & Räume“ an."
        />
      </div>
    );
  }

  const withRevit = data.rooms.filter((r) => r.revit_room_id).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="BIM-Viewer"
        description="Schematischer Grundriss aus den angelegten Räumen. Die Flächen sind Platzhalter – Raumpolygone und Bauteile werden später aus dem Revit-/IFC-Modell übernommen."
      >
        <Button variant="outline" size="sm" onClick={data.reload}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Aktualisieren
        </Button>
      </PageHeader>

      <div className="surface flex flex-wrap items-start gap-4 p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
          <Info className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-sm font-semibold text-foreground">Vorbereitung der Modellanbindung</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Für {withRevit} von {data.rooms.length} Räumen ist bereits eine Revit-Raum-ID hinterlegt.
            {data.building?.bim_model_ref ? ` Modellverweis: ${data.building.bim_model_ref}.` : ' Ein Modellverweis ist noch nicht eingetragen.'}{' '}
            Diese Ansicht zeigt bewusst keine erfundenen Bauteile – sie stellt die Datenbasis dar, die später an das Modell gebunden wird.
          </p>
        </div>
        <SourceBadge source={data.counts.demo > data.counts.real ? 'demo' : 'real'} labels={{ demo: 'Demo-Messwerte', real: 'Echte Messwerte' }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          {floors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              onClick={() => setFloorId(floor.id)}
              className={
                floor.id === activeFloorId
                  ? 'rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                  : 'rounded-full bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200'
              }
            >
              {floor.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {LEGEND.map((item) => (
            <StatusChip key={item.level} level={item.level} label={item.label} size="xs" />
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="surface p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading text-sm font-semibold text-foreground">
                Grundriss {activeFloor ? activeFloor.name : ''} · {floorRooms.length} Räume
              </h3>
              <p className="text-[11px] text-muted-foreground">Flächengrößen schematisch nach Raumfläche · Klick öffnet die Raumdetails</p>
            </div>
            <FloorPlan
              rooms={floorRooms}
              readingsByRoom={readingsByRoom}
              selectedRoomId={selectedRoom ? selectedRoom.id : null}
              onSelect={setSelectedRoomId}
            />
          </div>
        </div>

        <div>
          <RoomDetailPanel
            room={selectedRoom}
            floorLabel={selectedRoom ? (floors.find((f) => f.id === selectedRoom.floor_id) || {}).name : ''}
            readings={selectedRoom ? readingsByRoom[selectedRoom.id].readings : {}}
            sensors={data.sensors}
            pointsByMetric={pointsByMetric}
            thresholds={data.thresholds}
          />
        </div>
      </div>
    </div>
  );
}
