import { Pencil, Ruler, Layers, Hash } from 'lucide-react';
import MetricTile from '@/components/sensors/MetricTile';
import SourceBadge from '@/components/SourceBadge';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { METRIC_KEYS } from '@/lib/metrics';

export default function RoomDetailPanel({ room, floorLabel, readings, sensors, pointsByMetric, thresholds, onEdit }) {
  if (!room) {
    return (
      <EmptyState
        compact
        icon={Ruler}
        title="Kein Raum ausgewählt"
        description="Wählen Sie im Grundriss einen Raum aus, um Messwerte, Sensorzuordnung und Modellbezug zu sehen."
      />
    );
  }

  const roomSensors = sensors.filter((s) => s.room_id === room.id);
  const facts = [
    { icon: Layers, label: 'Geschoss', value: floorLabel || '–' },
    { icon: Ruler, label: 'Fläche', value: room.area_m2 ? `${room.area_m2} m²` : '–' },
    { icon: Hash, label: 'Revit-Raum-ID', value: room.revit_room_id || '– reserviert –' },
  ];

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tabular text-[11px] font-medium text-muted-foreground">{room.room_code}</p>
            <h3 className="font-heading text-lg font-semibold text-foreground">{room.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{room.usage || 'Nutzung nicht hinterlegt'}</p>
          </div>
          <SourceBadge source={room.source} />
        </div>

        <dl className="mt-4 space-y-2">
          {facts.map((fact) => {
            const Icon = fact.icon;
            return (
              <div key={fact.label} className="flex items-center justify-between gap-3 text-sm">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" /> {fact.label}
                </dt>
                <dd className="tabular truncate font-medium text-foreground">{fact.value}</dd>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">Zuordnung</dt>
            <dd className="truncate text-right text-xs text-foreground">
              {room.occupants_max ? `max. ${room.occupants_max} Personen` : '–'}
            </dd>
          </div>
        </dl>

        {onEdit ? (
          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => onEdit(room)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Raum bearbeiten
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {METRIC_KEYS.map((key) => (
          <MetricTile key={key} compact metricKey={key} reading={readings[key]} threshold={thresholds[key]} points={pointsByMetric[key] || []} />
        ))}
      </div>

      <div className="surface p-5">
        <h4 className="text-sm font-semibold text-foreground">Zugeordnete Sensoren</h4>
        {roomSensors.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Diesem Raum sind noch keine Sensoren zugeordnet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {roomSensors.map((sensor) => (
              <li key={sensor.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="tabular text-xs font-medium text-foreground">{sensor.sensor_code}</span>
                <span className="text-xs text-muted-foreground">{sensor.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
