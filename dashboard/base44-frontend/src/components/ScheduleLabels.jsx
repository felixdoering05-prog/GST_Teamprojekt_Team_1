export default function ScheduleLabels({titles=[]}) {
  if (!titles.length) return null;
  return <ul className="flex flex-wrap gap-1.5" aria-label="Zugeordnete Titel">{titles.map(title=>
    <li key={title.id} className={`rounded-full border px-2 py-0.5 text-xs ${title.matching?'border-primary bg-primary/15 font-semibold text-primary':'border-border text-muted-foreground'}`}>
      {title.name}{title.matching && ' · Dein Titel'}
    </li>)}</ul>;
}
export const matchesTitle = item => (item.assigned_titles || []).some(title=>title.matching);
