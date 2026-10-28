import { Droplets, Thermometer, TrendingDown, TrendingUp, Wind, Minus } from 'lucide-react';
import StatusChip from '@/components/StatusChip';
import SourceBadge from '@/components/SourceBadge';
import { formatNumber, metric as metricDef } from '@/lib/metrics';
import { trendFor } from '@/lib/analysis';
import { relativeTime } from '@/lib/dates';

const ICONS = { temperature: Thermometer, co2: Wind, humidity: Droplets };

const TREND_ICON = { steigend: TrendingUp, fallend: TrendingDown, stabil: Minus, unbekannt: Minus };

export default function MetricTile({ metricKey, reading, threshold, points = [], compact = false }) {
  const def = metricDef(metricKey);
  const Icon = ICONS[metricKey];
  const trend = trendFor(metricKey, points);
  const TrendIcon = TREND_ICON[trend.direction];

  const limitText = () => {
    if (!threshold) return 'Keine Grenzwerte hinterlegt';
    const parts = [];
    if (threshold.warning_min !== null && threshold.warning_min !== undefined) parts.push(`≥ ${formatNumber(metricKey, threshold.warning_min)}`);
    if (threshold.warning_max !== null && threshold.warning_max !== undefined) parts.push(`≤ ${formatNumber(metricKey, threshold.warning_max)}`);
    return parts.length ? `Sollbereich ${parts.join(' / ')} ${def.unit}` : 'Keine Grenzwerte hinterlegt';
  };

  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-medium uppercase tracking-wide">{def.label}</span>
        </div>
        <StatusChip level={reading.level} size="xs" />
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="tabular text-2xl font-semibold text-foreground">{formatNumber(metricKey, reading.value)}</span>
        <span className="text-sm text-muted-foreground">{def.unit}</span>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">{limitText()}</p>

      {!compact ? (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendIcon className={trend.direction === 'steigend' ? 'h-3.5 w-3.5 text-amber-600' : trend.direction === 'fallend' ? 'h-3.5 w-3.5 text-cyan-700' : 'h-3.5 w-3.5'} />
            {trend.label}
            {trend.direction !== 'unbekannt' ? (
              <span className="tabular">({trend.slope > 0 ? '+' : ''}{trend.slope.toFixed(2)} {def.unit}/h)</span>
            ) : null}
          </p>
          {reading.measurement ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <SourceBadge source={reading.measurement.source} />
              <span>{relativeTime(reading.measurement.measured_at)}</span>
              {reading.sensor ? <span className="tabular">· {reading.sensor.sensor_code}</span> : null}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Kein Sensor zugeordnet oder kein Messwert im Zeitraum.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
