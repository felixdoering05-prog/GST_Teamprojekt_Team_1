import { useBuildingScope } from '@/hooks/useBuildingScope';
import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { request } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const scheduleKey=id=>['building-schedules',String(id)];
function localInput(value){
  if(!value)return '';
  const date=new Date(value);
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function defaultStart(){
  const date=new Date(Date.now()-new Date().getTimezoneOffset()*60000);
  date.setMinutes(Math.ceil(date.getMinutes()/15)*15,0,0);
  return date.toISOString().slice(0,16);
}
const dateLabel=value=>new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

export default function BuildingSchedules(){
  const cache=useQueryClient();
  const [buildingId,setBuildingId]=useState('');
  const [editing,setEditing]=useState(null);
  const [title,setTitle]=useState('');
  const [details,setDetails]=useState('');
  const [startsAt,setStartsAt]=useState(defaultStart);
  const [endsAt,setEndsAt]=useState('');
  const [kind,setKind]=useState('appointment'),[intervalDays,setIntervalDays]=useState(''),[reminderDays,setReminderDays]=useState(''),[roomID,setRoomID]=useState(''),[sensorID,setSensorID]=useState('');
  const [formOpen,setFormOpen]=useState(false);
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const scope = useBuildingScope();
  const buildings = scope.readable('schedule');
  const scheduleQueries = useQueries({ queries: buildings.map(building => ({
    queryKey: scheduleKey(building.id),
    queryFn: () => request('/buildings/' + building.id + '/schedules'),
    refetchOnWindowFocus: true,
  })) });
  const editableBuildings = buildings.filter((_, index) => scheduleQueries[index].data?.can_edit);
  const selected = editableBuildings.find(row => String(row.id) === buildingId) || editableBuildings[0];
  const selectedId = String(selected?.id || '');
  const selectedSchedule = scheduleQueries[buildings.indexOf(selected)]?.data;
  const pending = scheduleQueries.some(query => query.isPending);
  const items = scheduleQueries.flatMap((query, index) => (query.data?.items || []).map(item => ({
    ...item, buildingName: buildings[index].name, canEdit: query.data.can_edit,
  })));
  const mutation=useMutation({
    mutationFn:({path,method='POST',body})=>request(path,{method,body}),
    onSuccess:async(_result, variables)=>{await cache.invalidateQueries({queryKey:scheduleKey(variables.path.split('/')[2])});setFormOpen(false);setEditing(null);setTitle('');setDetails('');setStartsAt(defaultStart());setEndsAt('');},
  });
  const error = mutation.error || scheduleQueries.find(query => query.isError)?.error;
  function submit(event){
    event.preventDefault();
    const body={title:title.trim(),details:details.trim(),starts_at:new Date(startsAt).toISOString(),ends_at:endsAt?new Date(endsAt).toISOString():null,kind,interval_days:kind==='maintenance'&&intervalDays?Number(intervalDays):null,reminder_days:kind==='maintenance'&&reminderDays!==''?Number(reminderDays):null,room_id:kind==='maintenance'&&roomID?roomID:null,sensor_id:kind==='maintenance'&&sensorID?sensorID:null};
    mutation.mutate({path:`/buildings/${selectedId}/schedules${editing?`/${editing.id}`:''}`,method:editing?'PATCH':'POST',body});
  }
  function edit(item){setBuildingId(String(item.building_id));setFormOpen(true);window.scrollTo({top:0,behavior:'smooth'});setEditing(item);setTitle(item.title);setDetails(item.details||'');setStartsAt(localInput(item.starts_at));setEndsAt(localInput(item.ends_at));setKind(item.kind||'appointment');setIntervalDays(item.interval_days?String(item.interval_days):'');setReminderDays(item.reminder_days===null||item.reminder_days===undefined?'':String(item.reminder_days));setRoomID(item.room_id?String(item.room_id):'');setSensorID(item.sensor_id?String(item.sensor_id):'');}
  function cancelEdit(){setFormOpen(false);setEditing(null);setTitle('');setDetails('');setStartsAt(defaultStart());setEndsAt('');setKind('appointment');setIntervalDays('');setReminderDays('');setRoomID('');setSensorID('');}
  const calendarItems=useMemo(()=>{
    const start=new Date(month.getFullYear(),month.getMonth(),1),end=new Date(month.getFullYear(),month.getMonth()+1,1);
    return items.flatMap(item=>{
      const base=new Date(item.starts_at);if(!Number.isFinite(base.getTime()))return[];
      const reminderDays=item.kind==='maintenance'?(item.reminder_days||0):0,reminder=reminderDays*86400000;
      if(item.kind!=='maintenance'||!item.interval_days){const entries=[];if(base>=start&&base<end)entries.push({...item,original:item,occurrence:base,occurrenceKey:`${item.building_id}-${item.id}-due`});const notice=new Date(base.getTime()-reminder);if(reminder>0&&notice>=start&&notice<end)entries.push({...item,original:item,occurrence:notice,isReminder:true,occurrenceKey:`${item.building_id}-${item.id}-notice`});return entries;}
      const interval=item.interval_days*86400000;let time=base.getTime();if(time<start.getTime()-reminder)time+=Math.ceil((start.getTime()-reminder-time)/interval)*interval;const occurrences=[];for(let count=0;count<400&&time<end.getTime()+reminder;count++,time+=interval){const due=new Date(time),notice=new Date(time-reminder);if(due>=start&&due<end)occurrences.push({...item,original:item,occurrence:due,occurrenceKey:`${item.building_id}-${item.id}-due-${time}`});if(reminder>0&&notice>=start&&notice<end)occurrences.push({...item,original:item,occurrence:notice,isReminder:true,occurrenceKey:`${item.building_id}-${item.id}-notice-${time}`});}return occurrences;
    });
  },[items,month]);
  const monthDays=useMemo(()=>{const first=new Date(month.getFullYear(),month.getMonth(),1);const offset=(first.getDay()+6)%7;const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();return Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>{const number=index-offset+1;return number<1||number>count?null:new Date(month.getFullYear(),month.getMonth(),number);});},[month]);
  const keyDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return <div className="space-y-5">
    <PageHeader title="Kalender" description="Termine und Wartungen für Gebäude planen und koordinieren.">
      {selected&&!formOpen&&!editing&&<Button onClick={()=>setFormOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true"/>Eintrag anlegen</Button>}
    </PageHeader>
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p>}
    {buildings.length > 0 && <>
      {selected&&(formOpen||editing)&&<form onSubmit={submit} className="surface grid gap-4 p-5 md:grid-cols-2">
        <div className="flex items-center gap-3 md:col-span-2"><CalendarClock className="h-5 w-5 text-primary"/><div><h2 className="font-heading font-semibold">{editing?'Eintrag bearbeiten':'Termin oder Wartung planen'}</h2><p className="text-xs text-muted-foreground">Der Eintrag ist nur für Mitglieder mit Kalender-Zugriff in {selected.name} sichtbar.</p></div></div>
        {editableBuildings.length > 1 && !editing && <label className="grid gap-1 text-xs font-medium">
          Gebäude
          <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedId}
            onChange={event => { setBuildingId(event.target.value); setRoomID(''); setSensorID(''); }}>
            {editableBuildings.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}
          </select>
        </label>}
        <label className="grid gap-1 text-xs font-medium">Kalendereintrag<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={kind} onChange={event=>{setKind(event.target.value);if(event.target.value==='appointment'){setIntervalDays('');setReminderDays('');setRoomID('');setSensorID('');}}}><option value="appointment">Termin oder Aufgabe</option><option value="maintenance">Wartung</option></select></label>
        <label className="grid gap-1 text-xs font-medium md:col-span-2">Titel<Input value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} required placeholder="z. B. Wartung Lüftungsanlage"/></label>
        <label className="grid gap-1 text-xs font-medium">Beginn<Input type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)} required/></label>
        <label className="grid gap-1 text-xs font-medium">Ende (optional)<Input type="datetime-local" value={endsAt} onChange={event=>setEndsAt(event.target.value)} min={startsAt}/></label>
        {kind==='maintenance'&&<>
          <label className="grid gap-1 text-xs font-medium">Wiederholung<input className="h-10 rounded-md border border-input bg-background px-3" type="number" min="1" max="3650" value={intervalDays} onChange={event=>setIntervalDays(event.target.value)} placeholder="Leer lassen für einmalig"/><span className="font-normal text-muted-foreground">Intervall in Tagen; leer bedeutet einen einzelnen Wartungstermin.</span></label>
          <label className="grid gap-1 text-xs font-medium">Vorabmeldung in Tagen<Input type="number" min="0" max="365" value={reminderDays} onChange={event=>setReminderDays(event.target.value)} placeholder="Leer lassen: keine Meldung"/><span className="font-normal text-muted-foreground">0 = Meldung am Wartungstag, 1–365 = so viele Tage vorher.</span></label>
          <label className="grid gap-1 text-xs font-medium">Raum zuordnen<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={roomID} onChange={event=>setRoomID(event.target.value)}><option value="">Kein Raum</option>{(selectedSchedule?.rooms||[]).map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium">Sensor zuordnen<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={sensorID} onChange={event=>setSensorID(event.target.value)}><option value="">Kein Sensor</option>{(selectedSchedule?.sensors||[]).map(sensor=><option key={sensor.id} value={sensor.id}>{sensor.name}</option>)}</select></label>
        </>}
        <label className="grid gap-1 text-xs font-medium md:col-span-2">Details<textarea className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm" value={details} onChange={event=>setDetails(event.target.value)} maxLength={2000} placeholder="Ort, Vorbereitung oder Abstimmung …"/></label>
        <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={cancelEdit} disabled={mutation.isPending}>Abbrechen</Button><Button type="submit" disabled={mutation.isPending||!title.trim()}><Plus className="h-4 w-4"/>{mutation.isPending?'Speichert …':editing?'Änderungen speichern':'Eintrag anlegen'}</Button></div>
      </form>}
      <section className="surface space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading font-semibold">Kalender · {new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(month)}</h2><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setMonth(value=>new Date(value.getFullYear(),value.getMonth()-1,1))} aria-label="Vorheriger Monat">‹</Button><Button size="sm" variant="outline" onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}>Heute</Button><Button size="sm" variant="outline" onClick={()=>setMonth(value=>new Date(value.getFullYear(),value.getMonth()+1,1))} aria-label="Nächster Monat">›</Button></div></div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">{['Mo','Di','Mi','Do','Fr','Sa','So'].map(day=><div key={day} className="bg-muted px-2 py-2 text-center text-xs font-semibold">{day}</div>)}{monthDays.map((day,index)=><div key={index} className={`min-h-24 bg-background p-1.5 ${day?'':'opacity-40'}`}>{day&&<><span className={`text-sm font-semibold ${keyDate(day)===keyDate(new Date())?'rounded-full bg-primary px-2 py-1 text-primary-foreground':'text-muted-foreground'}`}>{day.getDate()}</span><div className="mt-1 space-y-1">{calendarItems.filter(item=>keyDate(item.occurrence)===keyDate(day)).slice(0,2).map(item=><button key={item.occurrenceKey||item.id} type="button" onClick={()=>item.canEdit&&edit(item.original)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] ${item.kind==='maintenance'?'bg-amber-500/15 text-amber-800':'bg-primary/10 text-primary'}`} title={item.title}>{item.isReminder?'Erinnerung · ':item.kind==='maintenance'?'Wartung · ':''}{item.title}</button>)}{calendarItems.filter(item=>keyDate(item.occurrence)===keyDate(day)).length>2&&<span className="text-[10px] text-muted-foreground">+{calendarItems.filter(item=>keyDate(item.occurrence)===keyDate(day)).length-2} weitere</span>}</div></>}</div>)}</div>
        <h3 className="pt-2 text-sm font-semibold">Einträge im Monat</h3>
        {pending&&<p role="status" className="text-sm text-muted-foreground">Zeitplan wird geladen …</p>}
        {calendarItems.length===0&&!pending&&<p className="text-sm text-muted-foreground">Für diesen Monat gibt es keine Termine oder Wartungen.</p>}
        <ul className="divide-y divide-border">{[...calendarItems].sort((a,b)=>a.occurrence-b.occurrence).map(item=><li key={item.occurrenceKey||item.id} className="flex flex-wrap items-start gap-3 py-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.kind==='maintenance'?'bg-amber-500/15 text-amber-800':'bg-primary/10 text-primary'}`}><CalendarClock className="h-4 w-4"/></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.isReminder?'Erinnerung · ':item.kind==='maintenance'?'Wartung · ':''}{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{buildings.length > 1 && item.buildingName + ' · '}{dateLabel(item.occurrence)}{item.ends_at?` – ${dateLabel(item.ends_at)}`:''}{item.interval_days?` · alle ${item.interval_days} Tage`:''}{!item.isReminder&&item.reminder_days!==null&&item.reminder_days!==undefined?` · Meldung ${item.reminder_days===0?'am selben Tag':`${item.reminder_days} Tage vorher`}`:''}</p>{(item.room_name||item.sensor_name)&&<p className="mt-1 text-xs text-muted-foreground">{item.room_name&&`Raum: ${item.room_name}`}{item.room_name&&item.sensor_name?' · ':''}{item.sensor_name&&`Sensor: ${item.sensor_name}`}</p>}{item.details&&<p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.details}</p>}</div>
          {item.canEdit&&<div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Eintrag ${item.title} bearbeiten`} onClick={()=>edit(item.original)}><Pencil/></Button><Button size="icon" variant="ghost" aria-label={`Eintrag ${item.title} löschen`} onClick={()=>{if(window.confirm(`„${item.title}“ einschließlich aller Wiederholungen löschen?`))mutation.mutate({path:`/buildings/${item.building_id}/schedules/${item.id}`,method:'DELETE'});}}><Trash2/></Button></div>}
        </li>)}</ul>
      </section>
    </>}
  </div>;
}

