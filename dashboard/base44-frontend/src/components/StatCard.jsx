import { cn } from '@/lib/utils';

const TONE_BG = {
  default: 'bg-slate-100 text-slate-600',
  primary: 'bg-cyan-50 text-cyan-700',
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  crit: 'bg-red-50 text-red-700',
};

export default function StatCard({ label, value, unit, hint, icon: Icon, tone = 'default' }) {
  return (
    <div className="surface dashboard-stat-card flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs font-medium leading-relaxed text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', TONE_BG[tone] || TONE_BG.default)}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="mb-3 mt-4 flex flex-wrap items-baseline gap-1.5">
        <span className="tabular text-2xl font-semibold tracking-tight leading-none text-foreground sm:text-[28px]">{value}</span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
      {hint ? <p className="mt-auto text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
