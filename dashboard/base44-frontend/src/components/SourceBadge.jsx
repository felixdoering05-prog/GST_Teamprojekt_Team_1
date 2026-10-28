import { cn } from '@/lib/utils';

export default function SourceBadge({ source = 'demo', className, labels = { demo: 'Demo', real: 'Echt' } }) {
  const isDemo = source !== 'real';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap',
        isDemo ? 'bg-violet-50 text-violet-700 ring-violet-600/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isDemo ? 'bg-violet-500' : 'bg-emerald-500')} />
      {isDemo ? labels.demo : labels.real}
    </span>
  );
}
