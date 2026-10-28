import { Thermometer, Wind, Droplets } from 'lucide-react';
import StatusChip from '@/components/StatusChip';
import { formatNumber, metric, worstLevel } from '@/lib/metrics';

const ICONS = { temperature: Thermometer, co2: Wind, humidity: Droplets };

const VALUE_TONE = {
  ok: 'text-foreground',
  warning: 'text-amber-600',
  critical: 'text-red-600',
  unknown: 'text-muted-foreground',
};

export default function RoomStatusCard({ room, floorLabel, readings, onClick }) {
  const levels = Object.values(readings || {}).map((r) => r.level);

  return (
    <button
      type="button"
      onClick={onClick}
      className="surface w-full p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_16px_32px_-20px_rgba(15,23,42,0.3)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="tabular text-[11px] font-medium text-muted-foreground">{room.room_code}</p>
          <h4 className="truncate text-sm font-semibold text-foreground">{room.name}</h4>
        </div>
        <StatusChip level={worstLevel(levels)} size="xs" />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>{floorLabel || '–'}</span>
        <span>{room.usage || '–'}</span>
        <span className="tabular">{room.area_m2 ? `${room.area_m2} m²` : '–'}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {Object.keys(readings || {}).map((key) => {
          const m = metric(key);
          const Icon = ICONS[key];
          const reading = readings[key];
          return (
            <div key={key} className="rounded-xl border border-border bg-slate-50/60 px-2.5 py-2">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {Icon ? <Icon className="h-3 w-3" /> : null}
                {m.short}
              </div>
              <p className={`tabular mt-1 text-sm font-semibold ${VALUE_TONE[reading.level] || VALUE_TONE.ok}`}>
                {formatNumber(key, reading.value)}
                <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{m.unit}</span>
              </p>
            </div>
          );
        })}
      </div>
    </button>
  );
}
