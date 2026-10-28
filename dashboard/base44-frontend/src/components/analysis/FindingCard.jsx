import { Lightbulb, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import StatusChip from '@/components/StatusChip';
import SourceBadge from '@/components/SourceBadge';
import { metric as metricDef } from '@/lib/metrics';
import { formatValue } from '@/lib/metrics';

const TREND_ICON = { steigend: TrendingUp, fallend: TrendingDown, stabil: Minus, unbekannt: Minus };

export default function FindingCard({ finding, room, floorLabel }) {
  const def = metricDef(finding.metric);
  const TrendIcon = TREND_ICON[finding.trend.direction];

  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular text-[11px] font-medium text-muted-foreground">{room.room_code}</span>
            <span className="text-xs text-muted-foreground">{floorLabel}</span>
            {finding.latest ? <SourceBadge source={finding.latest.source} /> : null}
          </div>
          <h3 className="mt-0.5 font-heading text-base font-semibold text-foreground">
            {room.name} · {def.label}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular text-lg font-semibold text-foreground">{formatValue(finding.metric, finding.latest ? finding.latest.value : null)}</span>
          <StatusChip level={finding.level} size="xs" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TrendIcon className={finding.trend.direction === 'steigend' ? 'h-3.5 w-3.5 text-amber-600' : finding.trend.direction === 'fallend' ? 'h-3.5 w-3.5 text-cyan-700' : 'h-3.5 w-3.5'} />
          {finding.trend.label}
          {finding.trend.direction !== 'unbekannt' ? (
            <span className="tabular">
              ({finding.trend.slope > 0 ? '+' : ''}
              {finding.trend.slope.toFixed(2)} {def.unit}/h)
            </span>
          ) : null}
        </span>
        <span className="tabular">{finding.trend.count} Messwerte im Zeitraum</span>
      </div>

      {finding.causes.length ? (
        <div className="mt-4 rounded-xl border border-border bg-slate-50/70 p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Mögliche Ursachen (regelbasiert)
          </p>
          <ul className="mt-2 space-y-1.5">
            {finding.causes.map((cause) => (
              <li key={cause} className="flex gap-2 text-xs text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                {cause}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Empfehlung: </span>
        {finding.recommendation}
      </p>
    </div>
  );
}
