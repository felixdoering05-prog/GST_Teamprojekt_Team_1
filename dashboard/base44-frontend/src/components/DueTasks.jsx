import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import EntryFiles from '@/components/EntryFiles';

const priority = {high: [0,'Hoch'], normal: [1,'Mittel'], low: [2,'Niedrig']};
export default function DueTasks({ buildings }) {
  const cache = useQueryClient();
  const queries = useQueries({queries: buildings.map(b => ({
    queryKey:['due-tasks',String(b.id)], queryFn:()=>request('/buildings/'+b.id+'/schedules/due-tasks'),
    refetchInterval:15000
  }))});
  const complete = useMutation({
    mutationFn:task=>request('/buildings/'+task.building_id+'/schedules/'+task.id+'/complete',{method:'POST',body:{due_at:task.due_at}}),
    onSettled:()=>cache.invalidateQueries({queryKey:['due-tasks']})
  });
  const tasks = queries.flatMap((q,i)=>(q.data||[]).map(t=>({...t,building:buildings[i].name})))
    .sort((a,b)=>priority[a.priority][0]-priority[b.priority][0] || Date.parse(a.due_at)-Date.parse(b.due_at) || a.id-b.id);
  const error = complete.error || queries.find(q=>q.error)?.error;
  return <section className="surface divide-y px-5" aria-label="Fällige Aufgaben">
    {error && <p role="alert" className="py-3 text-destructive">{error.message}</p>}
    {queries.some(q=>q.isPending) && <p role="status" className="py-4">Aufgaben werden geladen …</p>}
    {!tasks.length && !error && queries.every(q=>!q.isPending) && <p className="py-5 text-sm">Keine offenen Aufgaben fällig.</p>}
    {tasks.map(task=><article key={task.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1 space-y-2"><p className="text-xs font-semibold text-muted-foreground">{task.building} · Priorität {priority[task.priority][1]}</p>
      <h3 className="break-words font-semibold">{task.title}</h3><p className="text-sm">Fällig seit {new Date(task.due_at).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}</p>
      {task.details && <p className="whitespace-pre-wrap text-sm">{task.details}</p>}
      <EntryFiles path={'/buildings/'+task.building_id+'/schedules/'+task.id+'/files'} editable={false}/></div>
      <Button variant="outline" disabled={complete.isPending} onClick={()=>complete.mutate(task)}>Als erledigt markieren</Button>
    </article>)}
  </section>;
}
