import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/metrics';

const TILE = {
  ok: 'bg-white',
  warning: 'bg-amber-50',
  critical: 'bg-red-50',
  unknown: 'bg-slate-50',
};

const BAR = {
  ok: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  critical: 'border-l-red-500',
  unknown: 'border-l-slate-300',
};

export default function FloorPlan({ rooms, readingsByRoom, selectedRoomId, onSelect }) {
  if (!rooms.length) {
    return (
      <div className="grid place-items-center rounded-xl bg-slate-100 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Für dieses Geschoss sind keine Räume angelegt.</p>
      </div>
    );
  }

  const maxArea = Math.max(...rooms.map((r) => Number(r.area_m2) || 20));

  return (
    <div className="rounded-xl bg-slate-300 p-[3px]">
      <div className="grid grid-cols-2 gap-[3px] sm:grid-cols-4">
        {rooms.map((room) => {
          const entry = readingsByRoom[room.id] || { status: 'unknown', readings: {} };
          const span = (Number(room.area_m2) || 20) / maxArea > 0.62 ? 2 : 1;
          const selected = selectedRoomId === room.id;
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => onSelect(room.id)}
              style={{ gridColumn: `span ${span} / span ${span}` }}
              className={cn(
                'flex min-h-[104px] flex-col justify-between rounded-[3px] border-l-4 p-3 text-left transition-all',
                TILE[entry.status] || TILE.unknown,
                BAR[entry.status] || BAR.unknown,
                selected ? 'ring-2 ring-inset ring-primary' : 'hover:brightness-[0.98]',
              )}
            >
              <div className="min-w-0">
                <p className="tabular text-[10px] font-medium text-slate-500">{room.room_code}</p>
                <p className="truncate text-xs font-semibold text-slate-900">{room.name}</p>
                <p className="truncate text-[10px] text-slate-500">
                  {room.usage || '–'}
                  {room.area_m2 ? ` · ${room.area_m2} m²` : ''}
                </p>
              </div>
              <div className="tabular flex flex-wrap gap-x-2 gap-y-0.5 pt-2 text-[10px] text-slate-600">
                <span>T {formatNumber('temperature', entry.readings.temperature?.value)}</span>
                <span>CO₂ {formatNumber('co2', entry.readings.co2?.value)}</span>
                <span>F {formatNumber('humidity', entry.readings.humidity?.value)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
