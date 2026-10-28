import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SourceBadge from '@/components/SourceBadge';
import { formatNumber, metric } from '@/lib/metrics';
import { formatTime, relativeTime } from '@/lib/dates';

const STATUS_STYLE = {
  aktiv: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  inaktiv: 'bg-slate-100 text-slate-600 ring-slate-400/20',
  defekt: 'bg-red-50 text-red-700 ring-red-600/20',
};

export default function SensorTable({ sensors, rooms, latest, onEdit, onDelete, emptyText = 'Keine Sensoren vorhanden.' }) {
  if (!sensors.length) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  const roomLabel = (id) => {
    const room = rooms.find((r) => r.id === id);
    return room ? `${room.room_code} ${room.name}` : '– nicht zugeordnet –';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">Kennung</th>
            <th className="px-3 py-2.5 font-medium">Messgröße</th>
            <th className="px-3 py-2.5 font-medium">Raum</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Letzter Wert</th>
            <th className="px-3 py-2.5 font-medium">Zeitpunkt</th>
            <th className="px-3 py-2.5 font-medium">Herkunft</th>
            <th className="px-3 py-2.5 font-medium">Einbauort</th>
            <th className="px-5 py-2.5 text-right font-medium">Aktionen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sensors.map((sensor) => {
            const reading = latest[sensor.id];
            return (
              <tr key={sensor.id} className="transition-colors hover:bg-slate-50/60">
                <td className="tabular px-5 py-3 font-medium text-foreground">{sensor.sensor_code}</td>
                <td className="px-3 py-3 text-muted-foreground">{metric(sensor.metric).label}</td>
                <td className="px-3 py-3 text-muted-foreground">{roomLabel(sensor.room_id)}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_STYLE[sensor.status] || STATUS_STYLE.inaktiv}`}>
                    {sensor.status}
                  </span>
                </td>
                <td className="tabular px-3 py-3 font-medium text-foreground">
                  {reading ? `${formatNumber(sensor.metric, reading.value)} ${metric(sensor.metric).unit}` : '–'}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {reading ? `${formatTime(reading.measured_at)} · ${relativeTime(reading.measured_at)}` : 'kein Messwert im Zeitraum'}
                </td>
                <td className="px-3 py-3">
                  <SourceBadge source={reading ? reading.source : sensor.source} />
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{sensor.position_note || '–'}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(sensor)} aria-label="Sensor bearbeiten">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(sensor)} aria-label="Sensor löschen">
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
