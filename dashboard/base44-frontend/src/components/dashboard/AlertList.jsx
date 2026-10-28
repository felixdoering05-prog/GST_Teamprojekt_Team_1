import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/dates';
import SourceBadge from '@/components/SourceBadge';

const SEVERITY = {
  critical: { icon: ShieldAlert, wrap: 'bg-red-50 text-red-600', chip: 'bg-red-100 text-red-700', label: 'Kritisch' },
  warning: { icon: AlertTriangle, wrap: 'bg-amber-50 text-amber-600', chip: 'bg-amber-100 text-amber-700', label: 'Warnung' },
  info: { icon: Info, wrap: 'bg-slate-100 text-slate-600', chip: 'bg-slate-100 text-slate-600', label: 'Hinweis' },
};

export function AlertRow({ alert, actions, showSource = true }) {
  const s = SEVERITY[alert.severity] || SEVERITY.info;
  const Icon = s.icon;
  const resolved = alert.status === 'erledigt';

  return (
    <li className={cn('flex gap-3 px-4 py-3.5 sm:px-5', resolved && 'opacity-70')}>
      <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg', resolved ? 'bg-emerald-50 text-emerald-600' : s.wrap)}>
        {resolved ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', s.chip)}>{s.label}</span>
          <span className="text-[11px] text-muted-foreground">{alert.status}</span>
          {showSource ? <SourceBadge source={alert.source} /> : null}
        </div>
        <p className="mt-1 text-sm font-medium leading-snug text-foreground">{alert.message || alert.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {alert.room_label || alert.sensor_code || '–'}
          {alert.triggered_at ? ` · ${relativeTime(alert.triggered_at)}` : ''}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 items-start gap-1">{actions}</div> : null}
    </li>
  );
}

export default function AlertList({ alerts = [], title = 'Warnmeldungen', emptyText = 'Keine offenen Meldungen.', actions }) {
  return (
    <div className="surface flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="tabular rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} actions={actions ? actions(alert) : null} />
          ))}
        </ul>
      )}
    </div>
  );
}
