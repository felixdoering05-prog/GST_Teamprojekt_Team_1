import { useQueries } from '@tanstack/react-query';
import { request } from '@/api/base44Client';
import { useBuildingScope } from '@/hooks/useBuildingScope';
import ScheduleLabels,{matchesTitle} from './ScheduleLabels';
import ScheduleDocuments from './ScheduleDocuments';

function reminderDue(item, now) {
  if (item.reminder_days == null) return null;
  const first = Date.parse(item.starts_at);
  if (!Number.isFinite(first)) return null;
  const day = 86400000, step = (item.interval_days || 0)*day;
  const today = new Date(now);today.setHours(0,0,0,0);
  const end = new Date(today);end.setDate(end.getDate()+1);
  const floor = item.reminder_days===0 ? today.getTime() : now;
  const due = first + (step?Math.max(0,Math.ceil((floor-first)/step))*step:0);
  if (item.reminder_days===0) return due>=today && due<end ? due : null;
  return due>=now && due-item.reminder_days*day<=now ? due : null;
}
export default function ScheduleReminders() {
  const scope=useBuildingScope();
  const buildings=scope.readable('schedule');
  const queries=useQueries({queries:buildings.map(building=>({
    queryKey:['schedule-reminders',String(building.id)],
    queryFn:()=>request(`/buildings/${building.id}/schedules`),
    refetchInterval:30000
  }))});
  const now=Date.now();
  const reminders=queries.flatMap((query,index)=>(query.data?.items||[]).flatMap(item=>{
    const due=reminderDue(item,now);
    return due===null?[]:[{...item,due,building:buildings[index].name}];
  })).sort((a,b)=>Number(matchesTitle(b))-Number(matchesTitle(a))||a.due-b.due);
  const error=queries.find(query=>query.error)?.error;
  return <section className="surface divide-y p-5" aria-label="Kalendererinnerungen">
    {error && <p role="alert" className="pb-3 text-destructive">{error.message}</p>}
    {queries.some(query=>query.isPending) ? <p role="status">Erinnerungen werden geladen …</p> :
      !reminders.length && !error && <p>Keine Kalendererinnerungen vorhanden.</p>}
    {reminders.map(item=><article key={item.id} className="space-y-2 py-3">
      <p className="text-xs text-muted-foreground">{item.building} · {{appointment:'Termin',maintenance:'Wartung',task:'Aufgabe'}[item.kind]}</p>
      <h2 className="font-semibold">{item.title}</h2><p className="text-sm">{new Date(item.due).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}</p>
      <ScheduleLabels titles={item.assigned_titles}/><ScheduleDocuments item={item}/>
      {item.details && <p className="whitespace-pre-wrap text-sm">{item.details}</p>}
    </article>)}
  </section>;
}
