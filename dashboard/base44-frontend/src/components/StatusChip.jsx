import { cn } from '@/lib/utils';
import { LEVELS } from '@/lib/metrics';

const TONES = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warn: 'bg-amber-50 text-amber-700 ring-amber-600/25',
  crit: 'bg-red-50 text-red-700 ring-red-600/20',
  muted: 'bg-slate-100 text-slate-600 ring-slate-400/20',
  info: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
};

const DOTS = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  crit: 'bg-red-500',
  muted: 'bg-slate-400',
  info: 'bg-cyan-500',
};

export default function StatusChip({ level = 'unknown', label, className, size = 'sm', pulse = false }) {
  const l = LEVELS[level] || LEVELS.unknown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        TONES[l.tone],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[l.tone], pulse && 'animate-pulse')} />
      {label || l.label}
    </span>
  );
}
