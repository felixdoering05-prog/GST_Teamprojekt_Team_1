import ScheduleLabels from '@/components/ScheduleLabels';
import ScheduleDocuments from '@/components/ScheduleDocuments';
import DueTasks from '@/components/DueTasks';
import EntryFiles, { uploadFile } from '@/components/EntryFiles';
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

export default function BuildingSchedules({ tasksOnly = false }){
  const cache=useQueryClient();
  const [search,setSearch]=useState('');
  const [titles,setTitles]=useState([]),[documents,setDocuments]=useState([]),[groupFiles,setGroupFiles]=useState([]);
  const [buildingId,setBuildingId]=useState('');
  const [editing,setEditing]=useState(null);
  const [title,setTitle]=useState('');
  const [details,setDetails]=useState('');
  const [startsAt,setStartsAt]=useState(defaultStart);
  const [endsAt,setEndsAt]=useState('');
  const [kind,setKind]=useState(tasksOnly ? 'task' : 'appointment'),[intervalDays,setIntervalDays]=useState(''),[reminderDays,setReminderDays]=useState(''),[sensorID,setSensorID]=useState('');
  const [rooms,setRooms]=useState([]), [floors,setFloors]=useState([]), [priority,setPriority]=useState('normal');
  const [files,setFiles]=useState([]), [uploadError,setUploadError]=useState('');
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
  const selected = editableBuildings.find(row => String(row.id) === buildingId) || (editableBuildings.length === 1 ? editableBuildings[0] : null);
  const selectedId = String(selected?.id || '');
  const selectedSchedule = scheduleQueries[buildings.indexOf(selected)]?.data;
  const pending = scheduleQueries.some(query => query.isPending);
  const items = scheduleQueries.flatMap((query, index) => (query.data?.items || []).map(item => ({
    ...item, locationNames: [
      ...(query.data?.rooms||[]).filter(room=>(item.room_ids?.length?item.room_ids:[item.room_id]).map(String).includes(String(room.id))).map(room=>room.name),
      ...(query.data?.floors||[]).filter(floor=>(item.floor_ids||[]).map(String).includes(String(floor.id))).map(floor=>floor.name)
    ], buildingName: buildings[index].name, canEdit: query.data.can_edit,
  })));
  const mutation=useMutation({
    mutationFn:({path,method='POST',body})=>request(path,{method,body}),
    onSuccess:async(result, variables)=>{
      await Promise.all([cache.invalidateQueries({queryKey:['due-tasks']}),cache.invalidateQueries({queryKey:['schedule-reminders']})]);
      await cache.invalidateQueries({queryKey:scheduleKey(variables.path.split('/')[2])});
      if (variables.method !== 'DELETE') {
        const path = '/buildings/'+selectedId+'/schedules/'+result.id+'/files';
        for (let index=0; index<files.length; index++) {
          try { await uploadFile(path,files[index]); }
          catch (err) {
            setEditing({...result,building_id:selectedId}); setBuildingId(selectedId);
            setFiles(files.slice(index)); setUploadError('Eintrag gespeichert. '+files[index].name+': '+err.message); return;
          }
        }
        await cache.invalidateQueries({queryKey:['entry-files',path]});
      }
      cancelEdit();
    },
  });
  const error = mutation.error || scheduleQueries.find(query => query.isError)?.error;
  function submit(event){
    event.preventDefault();
    if (!selectedId) return;
    const body={title_ids:titles,document_ids:documents,group_file_refs:groupFiles,title:title.trim(),details:details.trim(),starts_at:new Date(startsAt).toISOString(),ends_at:kind!=='task'&&endsAt?new Date(endsAt).toISOString():null,kind,interval_days:intervalDays?Number(intervalDays):null,reminder_days:reminderDays!==''?Number(reminderDays):null,room_ids:rooms,floor_ids:floors,priority,sensor_id:sensorID||null};
    mutation.mutate({path:`/buildings/${selectedId}/schedules${editing?`/${editing.id}`:''}`,method:editing?'PATCH':'POST',body});
  }
  function edit(item){setTitles((item.title_ids||[]).map(String));setDocuments((item.document_ids||[]).map(String));setGroupFiles(item.group_file_refs||[]);setBuildingId(String(item.building_id));setFormOpen(true);window.scrollTo({top:0,behavior:'smooth'});setEditing(item);setTitle(item.title);setDetails(item.details||'');setStartsAt(localInput(item.starts_at));setEndsAt(localInput(item.ends_at));setKind(item.kind||'appointment');setIntervalDays(item.interval_days?String(item.interval_days):'');setReminderDays(item.reminder_days===null||item.reminder_days===undefined?'':String(item.reminder_days));setRooms((item.room_ids?.length?item.room_ids:[item.room_id].filter(Boolean)).map(String));setFloors((item.floor_ids||[]).map(String));setPriority(item.priority||'normal');setFiles([]);setUploadError('');setSensorID(item.sensor_id?String(item.sensor_id):'');}
  function cancelEdit(){setTitles([]);setDocuments([]);setGroupFiles([]);setPriority('normal');setFiles([]);setUploadError('');setFormOpen(false);setEditing(null);setTitle('');setDetails('');setStartsAt(defaultStart());setEndsAt('');setKind(tasksOnly ? 'task' : 'appointment');setIntervalDays('');setReminderDays('');setRooms([]);setFloors([]);setSensorID('');}
  const term=search.trim().toLocaleLowerCase('de');
  const results=term ? items.filter(item=>[item.title,item.details,item.buildingName,...item.locationNames,...(item.assigned_titles||[]).map(title=>title.name)].filter(Boolean).join(' ').toLocaleLowerCase('de').includes(term)) : items;
  const calendarItems=useMemo(()=>{
    const start=new Date(month.getFullYear(),month.getMonth(),1),end=new Date(month.getFullYear(),month.getMonth()+1,1);
    return results.flatMap(item=>{
      const first = Date.parse(item.starts_at);
      if (!Number.isFinite(first)) return [];
      const duration = item.ends_at && item.kind !== 'task' ? Math.max(0, Date.parse(item.ends_at)-first) : 0;
      const step = (item.interval_days || 0)*86400000;
      const earliest = start.getTime()-duration;
      let time = first + (step ? Math.max(0,Math.ceil((earliest-first)/step))*step : 0);
      const entries = [];
      for (; time < end.getTime(); time+=step) {
        const entry = {...item, original:item, occurrence:new Date(time), occurrenceEnd:new Date(time+duration)};
        if (time < end && (time >= start || time+duration > start)) entries.push({...entry,occurrenceKey:item.id+'-due-'+time});
        if (!step) break;
      }
      return entries;
    });
  },[results,month]);
  const monthDays=useMemo(()=>{const first=new Date(month.getFullYear(),month.getMonth(),1);const offset=(first.getDay()+6)%7;const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();return Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>{const number=index-offset+1;return number<1||number>count?null:new Date(month.getFullYear(),month.getMonth(),number);});},[month]);
  const keyDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function onDay(item,day) {
    const tomorrow = new Date(day.getFullYear(),day.getMonth(),day.getDate()+1);
    return item.occurrence < tomorrow && (item.occurrence >= day || item.occurrenceEnd > day);
  }
  return <div className="space-y-5">
    <PageHeader title={tasksOnly?'Aufgaben':'Kalender'} description={tasksOnly?'Fällige Aufgaben, nach Priorität geordnet.':scope.label}>
      {editableBuildings.length > 0&&!formOpen&&!editing&&<Button onClick={()=>{setBuildingId('');setFormOpen(true);}}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true"/>{tasksOnly?'Aufgabe erstellen':'Eintrag anlegen'}</Button>}
    </PageHeader>
    {!tasksOnly && <section className="surface space-y-3 p-4">
      <label className="grid max-w-lg gap-1 text-sm font-medium">Kalender durchsuchen<Input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Titel, Gebäude, Raum oder Details"/></label>
      {term && <div><p className="text-sm text-muted-foreground" role="status">{results.length} Treffer</p><ul className="mt-2 max-h-56 divide-y overflow-auto">{results.map(item=><li key={item.id}><button type="button" className="w-full px-2 py-2 text-left text-sm hover:bg-muted" onClick={()=>{const date=new Date(item.starts_at);setMonth(new Date(date.getFullYear(),date.getMonth(),1));}}>
        <span className="font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{item.buildingName} · {dateLabel(item.starts_at)}</span>
      </button></li>)}</ul></div>}
    </section>}
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p>}
    {buildings.length > 0 && <>
      {(formOpen||editing)&&<form onSubmit={submit} className="surface grid gap-4 p-5 md:grid-cols-2">
        <div className="flex items-center gap-3 md:col-span-2"><CalendarClock className="h-5 w-5 text-primary"/><div><h2 className="font-heading font-semibold">{editing?'Eintrag bearbeiten':tasksOnly?'Aufgabe erstellen':'Kalendereintrag planen'}</h2>{selected && <p className="text-xs text-muted-foreground">Der Eintrag ist für Mitglieder mit Kalender-Zugriff in {selected.name} sichtbar.</p>}</div></div>
        {editableBuildings.length > 1 && !editing && <label className="grid gap-1 text-xs font-medium">
          Gebäude
          <select required className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedId}
            onChange={event => { setBuildingId(event.target.value);setTitles([]);setDocuments([]);setGroupFiles([]); setRooms([]);setFloors([]); setSensorID(''); }}>
            <option value="">Gebäude auswählen …</option>
            {editableBuildings.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}
          </select>
        </label>}
        {!tasksOnly &&         <label className="grid gap-1 text-xs font-medium">Kalendereintrag<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={kind} onChange={event=>setKind(event.target.value)}><option value="appointment">Termin</option><option value="task">Aufgabe</option><option value="maintenance">Wartung</option></select></label>}
        <label className="grid gap-1 text-xs font-medium md:col-span-2">Titel<Input value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} required placeholder="z. B. Wartung Lüftungsanlage"/></label>
        <label className="grid gap-1 text-xs font-medium">Beginn<Input type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)} required/></label>
        {kind !== 'task' &&         <label className="grid gap-1 text-xs font-medium">Ende (optional)<Input type="datetime-local" value={endsAt} onChange={event=>setEndsAt(event.target.value)} min={startsAt}/></label>}
        <>
          <label className="grid gap-1 text-xs font-medium">Wiederholung<input className="h-10 rounded-md border border-input bg-background px-3" type="number" min="1" max="3650" value={intervalDays} onChange={event=>setIntervalDays(event.target.value)} placeholder="Leer lassen für einmalig"/><span className="font-normal text-muted-foreground">Intervall in Tagen; leer bedeutet einen einmaligen Eintrag.</span></label>
          <label className="grid gap-1 text-xs font-medium">Vorabmeldung in Tagen<Input type="number" min="0" max="365" value={reminderDays} onChange={event=>setReminderDays(event.target.value)} placeholder="Leer lassen: keine Meldung"/><span className="font-normal text-muted-foreground">0 = Meldung am selben Tag, 1–365 = so viele Tage vorher.</span></label>
          {[['Räume',selectedSchedule?.rooms,rooms,setRooms],['Geschosse',selectedSchedule?.floors,floors,setFloors]].map(([label,options,values,setValues])=><fieldset key={label} disabled={!selectedId} className="min-w-0 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">{label}</legend>
            {!selectedId ? <p className="text-xs">Zuerst Gebäude wählen</p> : options?.length ? <div className="max-h-36 space-y-1 overflow-auto">{options.map(option=><label className="flex items-center gap-2 text-sm" key={option.id}><input type="checkbox" checked={values.includes(String(option.id))} onChange={e=>setValues(e.target.checked?[...values,String(option.id)]:values.filter(id=>id!==String(option.id)))}/>{option.name}</label>)}</div> : <p className="text-xs">Keine {label} vorhanden</p>}
          </fieldset>)}
          <label className="grid gap-1 text-xs font-medium">Priorität<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Niedrig</option><option value="normal">Mittel</option><option value="high">Hoch</option></select></label>
          <label className="grid gap-1 text-xs font-medium">Dateien und Bilder (je 10 MB)<input type="file" multiple onChange={e=>setFiles(Array.from(e.target.files))}/>{files.map((file,i)=><span key={i}>{file.name}</span>)}</label>
          {uploadError && <p role="alert">{uploadError}</p>}
          <label className="grid gap-1 text-xs font-medium">Sensor zuordnen<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" disabled={!selectedId} value={sensorID} onChange={event=>setSensorID(event.target.value)}><option value="">Kein Sensor</option>{(selectedSchedule?.sensors||[]).map(sensor=><option key={sensor.id} value={sensor.id}>{sensor.name}</option>)}</select></label>
        </>
        {[
          ['Teamtitel',selectedSchedule?.titles,titles,setTitles,'id'],
          ['Dokumente des Gebäudes',selectedSchedule?.documents,documents,setDocuments,'id'],
          ['Dokumente der Gebäudegruppen',selectedSchedule?.group_files,groupFiles,setGroupFiles,'ref']
        ].map(([label,options,values,setValues,key])=><fieldset key={label} disabled={!selectedId} className="min-w-0 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">{label}</legend>
          {!options?.length ? <p className="text-xs text-muted-foreground">{selectedId?'Keine Auswahl verfügbar':'Zuerst Gebäude auswählen'}</p> :
          <div className="max-h-32 space-y-1 overflow-auto">{options.map(option=>{
            const value=String(option[key]);return <label key={value} className="flex items-center gap-2 break-all text-sm"><input type="checkbox" checked={values.includes(value)} onChange={event=>setValues(event.target.checked?[...values,value]:values.filter(id=>id!==value))}/>{option.group_name ? option.group_name+' · ' : ''}{option.name}</label>;
          })}</div>}
        </fieldset>)}
        <label className="grid gap-1 text-xs font-medium md:col-span-2">Details<textarea className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm" value={details} onChange={event=>setDetails(event.target.value)} maxLength={2000} placeholder="Ort, Vorbereitung oder Abstimmung …"/></label>
        <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={cancelEdit} disabled={mutation.isPending}>Abbrechen</Button><Button type="submit" disabled={mutation.isPending||!title.trim()||!selectedId}><Plus className="h-4 w-4"/>{mutation.isPending?'Speichert …':editing?'Änderungen speichern':'Eintrag anlegen'}</Button></div>
      </form>}
      {tasksOnly ? <DueTasks buildings={buildings}/> : <section className="surface space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading font-semibold">Kalender · {new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(month)}</h2><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setMonth(value=>new Date(value.getFullYear(),value.getMonth()-1,1))} aria-label="Vorheriger Monat">‹</Button><Button size="sm" variant="outline" onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}>Heute</Button><Button size="sm" variant="outline" onClick={()=>setMonth(value=>new Date(value.getFullYear(),value.getMonth()+1,1))} aria-label="Nächster Monat">›</Button></div></div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">{['Mo','Di','Mi','Do','Fr','Sa','So'].map(day=><div key={day} className="bg-muted px-2 py-2 text-center text-xs font-semibold">{day}</div>)}{monthDays.map((day,index)=><div key={index} className={`min-h-24 bg-background p-1.5 ${day?'':'opacity-40'}`}>{day&&<><span className={`text-sm font-semibold ${keyDate(day)===keyDate(new Date())?'rounded-full bg-primary px-2 py-1 text-primary-foreground':'text-muted-foreground'}`}>{day.getDate()}</span><div className="mt-1 space-y-1">{calendarItems.filter(item=>onDay(item,day)).slice(0,2).map(item=><button key={item.occurrenceKey||item.id} type="button" onClick={()=>item.canEdit&&edit(item.original)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] ${item.kind==='maintenance'?'bg-amber-500/15 text-amber-800':'bg-primary/10 text-primary'}`} title={item.title}>{item.isReminder?'Erinnerung · ':item.kind==='maintenance'?'Wartung · ':item.kind==='task'?'Aufgabe · ':'Termin · '}{item.title}</button>)}{calendarItems.filter(item=>onDay(item,day)).length>2&&<span className="text-[10px] text-muted-foreground">+{calendarItems.filter(item=>onDay(item,day)).length-2} weitere</span>}</div></>}</div>)}</div>
        <h3 className="pt-2 text-sm font-semibold">Einträge im Monat</h3>
        {pending&&<p role="status" className="text-sm text-muted-foreground">Zeitplan wird geladen …</p>}
        {calendarItems.length===0&&!pending&&<p className="text-sm text-muted-foreground">Für diesen Monat gibt es keine Kalendereinträge.</p>}
        <ul className="divide-y divide-border">{[...calendarItems].sort((a,b)=>a.occurrence-b.occurrence).map(item=><li key={item.occurrenceKey||item.id} className="flex flex-wrap items-start gap-3 py-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.kind==='maintenance'?'bg-amber-500/15 text-amber-800':'bg-primary/10 text-primary'}`}><CalendarClock className="h-4 w-4"/></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.isReminder?'Erinnerung · ':item.kind==='maintenance'?'Wartung · ':item.kind==='task'?'Aufgabe · ':'Termin · '}{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{buildings.length > 1 && item.buildingName + ' · '}{dateLabel(item.occurrence)}{!item.isReminder && item.occurrenceEnd>item.occurrence ? ` – ${dateLabel(item.occurrenceEnd)}`:''}{item.interval_days?` · alle ${item.interval_days} Tage`:''}{!item.isReminder&&item.reminder_days!==null&&item.reminder_days!==undefined?` · Meldung ${item.reminder_days===0?'am selben Tag':`${item.reminder_days} Tage vorher`}`:''}</p>{(item.locationNames?.length>0||item.sensor_name)&&<p className="mt-1 text-xs text-muted-foreground">{item.locationNames?.join(', ')}{item.locationNames?.length>0&&item.sensor_name?' · ':''}{item.sensor_name&&`Sensor: ${item.sensor_name}`}</p>}<p className="text-xs text-muted-foreground">Priorität · {{low:'Niedrig',normal:'Mittel',high:'Hoch'}[item.priority||'normal']}</p><ScheduleLabels titles={item.assigned_titles}/><ScheduleDocuments item={item}/><EntryFiles path={`/buildings/${item.building_id}/schedules/${item.id}/files`} editable={item.canEdit}/>{item.details&&<p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.details}</p>}</div>
          {item.canEdit&&<div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Eintrag ${item.title} bearbeiten`} onClick={()=>edit(item.original)}><Pencil/></Button><Button size="icon" variant="ghost" aria-label={`Eintrag ${item.title} löschen`} onClick={()=>{if(window.confirm(`„${item.title}“ einschließlich aller Wiederholungen löschen?`))mutation.mutate({path:`/buildings/${item.building_id}/schedules/${item.id}`,method:'DELETE'});}}><Trash2/></Button></div>}
        </li>)}</ul>
      </section>}
    </>}
  </div>;
}

