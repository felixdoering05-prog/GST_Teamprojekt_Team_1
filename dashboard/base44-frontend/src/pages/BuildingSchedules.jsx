import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { request } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const buildingsKey=['account-buildings'];
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
  const buildings=useQuery({queryKey:buildingsKey,queryFn:()=>request('/buildings'),refetchOnWindowFocus:true});
  const selectedId=buildingId||localStorage.getItem('d21-selected-building')||String(buildings.data?.[0]?.id||'');
  const selected=buildings.data?.find(item=>String(item.id)===selectedId);
  const schedules=useQuery({queryKey:scheduleKey(selectedId),queryFn:()=>request(`/buildings/${selectedId}/schedules`),enabled:!!selectedId,refetchOnWindowFocus:true});
  const mutation=useMutation({
    mutationFn:({path,method='POST',body})=>request(path,{method,body}),
    onSuccess:async()=>{await cache.invalidateQueries({queryKey:scheduleKey(selectedId)});setEditing(null);setTitle('');setDetails('');setStartsAt(defaultStart());setEndsAt('');},
  });
  const error=buildings.error||schedules.error||mutation.error;
  const items=schedules.data?.items||[];
  function submit(event){
    event.preventDefault();
    const body={title:title.trim(),details:details.trim(),starts_at:new Date(startsAt).toISOString(),ends_at:endsAt?new Date(endsAt).toISOString():null};
    mutation.mutate({path:`/buildings/${selectedId}/schedules${editing?`/${editing.id}`:''}`,method:editing?'PATCH':'POST',body});
  }
  function edit(item){setEditing(item);setTitle(item.title);setDetails(item.details||'');setStartsAt(localInput(item.starts_at));setEndsAt(localInput(item.ends_at));}
  function cancelEdit(){setEditing(null);setTitle('');setDetails('');setStartsAt(defaultStart());setEndsAt('');}
  return <div className="space-y-5">
    <PageHeader title="Zeitplanung" description="Termine und koordinierende Aufgaben gebäudebezogen planen.">
      {buildings.data?.length>0&&<label className="flex items-center gap-2 text-sm">Gebäude<select className="max-w-64 rounded-md border border-input bg-background px-3 py-2" value={selectedId} onChange={event=>{setBuildingId(event.target.value);localStorage.setItem('d21-selected-building',event.target.value);window.dispatchEvent(new Event('d21-building-change'));cancelEdit();}}>{buildings.data.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </PageHeader>
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p>}
    {buildings.isPending&&<p role="status" className="text-sm text-muted-foreground">Gebäude werden geladen …</p>}
    {!buildings.isPending&&!buildings.data?.length&&<section className="surface p-5 text-sm text-muted-foreground">Für die Zeitplanung ist mindestens ein zugängliches Gebäude erforderlich.</section>}
    {selected&&<>
      {schedules.data?.can_edit&&<form onSubmit={submit} className="surface grid gap-4 p-5 md:grid-cols-2">
        <div className="flex items-center gap-3 md:col-span-2"><CalendarClock className="h-5 w-5 text-primary"/><div><h2 className="font-heading font-semibold">{editing?'Eintrag bearbeiten':'Termin oder Aufgabe planen'}</h2><p className="text-xs text-muted-foreground">Der Eintrag ist nur für Mitglieder mit Zeitplan-Zugriff in {selected.name} sichtbar.</p></div></div>
        <label className="grid gap-1 text-xs font-medium md:col-span-2">Titel<Input value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} required placeholder="z. B. Wartung Lüftungsanlage"/></label>
        <label className="grid gap-1 text-xs font-medium">Beginn<Input type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)} required/></label>
        <label className="grid gap-1 text-xs font-medium">Ende (optional)<Input type="datetime-local" value={endsAt} onChange={event=>setEndsAt(event.target.value)} min={startsAt}/></label>
        <label className="grid gap-1 text-xs font-medium md:col-span-2">Details<textarea className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm" value={details} onChange={event=>setDetails(event.target.value)} maxLength={2000} placeholder="Ort, Vorbereitung oder Abstimmung …"/></label>
        <div className="flex justify-end gap-2 md:col-span-2">{editing&&<Button type="button" variant="outline" onClick={cancelEdit} disabled={mutation.isPending}>Abbrechen</Button>}<Button type="submit" disabled={mutation.isPending||!title.trim()}><Plus className="h-4 w-4"/>{mutation.isPending?'Speichert …':editing?'Änderungen speichern':'Eintrag anlegen'}</Button></div>
      </form>}
      <section className="surface space-y-3 p-5"><h2 className="font-heading font-semibold">Geplante Einträge</h2>
        {schedules.isPending&&<p role="status" className="text-sm text-muted-foreground">Zeitplan wird geladen …</p>}
        {items.length===0&&schedules.isSuccess&&<p className="text-sm text-muted-foreground">Für dieses Gebäude gibt es noch keine Einträge.</p>}
        <ul className="divide-y divide-border">{[...items].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).map(item=><li key={item.id} className="flex flex-wrap items-start gap-3 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarClock className="h-4 w-4"/></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.starts_at)}{item.ends_at?` – ${dateLabel(item.ends_at)}`:''}</p>{item.details&&<p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.details}</p>}</div>
          {schedules.data?.can_edit&&<div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Eintrag ${item.title} bearbeiten`} onClick={()=>edit(item)}><Pencil/></Button><Button size="icon" variant="ghost" aria-label={`Eintrag ${item.title} löschen`} onClick={()=>{if(window.confirm(`„${item.title}“ löschen?`))mutation.mutate({path:`/buildings/${selectedId}/schedules/${item.id}`,method:'DELETE'});}}><Trash2/></Button></div>}
        </li>)}</ul>
      </section>
    </>}
  </div>;
}
