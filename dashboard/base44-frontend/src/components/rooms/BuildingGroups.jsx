import GroupMedia from './GroupMedia';
import PageHeader from '@/components/PageHeader';
import { Tabs,TabsList,TabsTrigger,TabsContent } from '@/components/ui/tabs';
import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, FileBox, Images, Layers, LayoutDashboard, MapPin, Plus, Trash2, X } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function BuildingCard({ building, onOpen }) {
  return <button key={building.id} type="button" onClick={() => onOpen(building)}
    className="surface group flex w-full flex-col items-start gap-5 overflow-hidden p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transform-none motion-reduce:transition-none"
    aria-label={`Gebäude ${building.name} öffnen`}>
    <span className="mb-1 flex h-28 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent text-primary"><Building2 className="h-14 w-14 stroke-[1.2]" aria-hidden="true" /></span>
    <span className="flex min-w-0 items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><Building2 className="h-5 w-5" aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block break-words font-heading text-lg font-semibold text-foreground">{building.name}</span>
        {building.address && <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{building.address}</span>}
        <span className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{building.model_document_id && <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">3D-Modell</span>}{!building.is_owner && <span className="rounded-full bg-muted px-2 py-1">Mit dir geteilt</span>}</span>
      </span>
    </span>
    <span className="flex w-full items-center justify-between border-t border-border pt-4 text-xs font-medium text-primary">Gebäude öffnen</span>
  </button>;
}

export default function BuildingGroups({ buildings = [], groupID, section, onOpenGroup, onBack, onCreateBuilding, onOpenBuilding, createOpen = false, onCloseCreate }) {
  const cache = useQueryClient();
  const [name, setName] = useState('');
  const [newBuildings, setNewBuildings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [adding,setAdding]=useState(false),[candidate,setCandidate]=useState('');
  const [error, setError] = useState('');
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => request('/teams') });
  const active = (teams.data || []).find(team => String(team.id) === localStorage.getItem('d21-selected-team')) || (teams.data || []).find(team => team.is_owner) || teams.data?.[0];
  const groups = useQuery({ queryKey: ['building-groups', active?.id], queryFn: () => request(`/teams/${active.id}/groups`), enabled: !!active?.id });
  const access = useQueries({ queries: (active?.buildings || []).map(building => ({ queryKey: ['building-team-access', String(building.id)], queryFn: () => request(`/buildings/${building.id}/team-access`), enabled: !!active?.can_manage_groups })) });

  useEffect(() => {
    if (groups.data) setDrafts(Object.fromEntries(groups.data.map(group => [group.id, { name: group.name, building_ids: group.buildings.map(building => String(building.id)) }])));
  }, [groups.data]);
  const mutation = useMutation({
    mutationFn: ({ path, method = 'POST', body }) => request(path, { method, body }),
    onSuccess: async () => {
      setError('');
      await cache.invalidateQueries({ queryKey: ['building-groups'] });
      await cache.invalidateQueries({ queryKey: ['teams'] });
    },
  });
  useEffect(() => setError(mutation.error?.message || ''), [mutation.error]);

  const manageable = (active?.buildings || []).filter((building, index) => building.is_owner || access[index]?.data?.can_manage_members);
  const canEditGroup = group => group.buildings.every(building => {
    const index = active.buildings.findIndex(item => String(item.id) === String(building.id));
    return index >= 0 && (active.buildings[index]?.is_owner || access[index]?.data?.can_manage_members);
  });
  const buildingById = new Map(buildings.map(building => [String(building.id), building]));
  const groupsWithBuildings = (groups.data || []).filter(group => !groupID || String(group.id) === groupID).map(group => ({
    ...group,
    visibleBuildings: group.buildings.map(building => buildingById.get(String(building.id))).filter(Boolean),
  }));
  const groupedIds = new Set(groupsWithBuildings.flatMap(group => group.buildings.map(building => String(building.id))));
  const ungrouped = buildings.filter(building => !groupedIds.has(String(building.id))).slice().reverse();

  if(groupID){
    const group=groupsWithBuildings[0];
    if(!group)return <section className="surface space-y-3 p-5"><Button variant="ghost" onClick={onBack}>Zur Gebäudeliste</Button><p role="status">{groups.isPending?'Gebäudegruppe wird geladen …':groups.error?.message||'Diese Gebäudegruppe ist nicht verfügbar.'}</p></section>;
    const editable=!group.partial && (group.buildings.length ? canEditGroup(group) : active.is_owner);
    const path=`/teams/${active.id}/groups/${group.id}`;
    const candidates=manageable.filter(building=>!group.buildings.some(row=>String(row.id)===String(building.id)));
    const tabs=[['overview','Übersicht',LayoutDashboard],['gallery','Galerie',Images],['models','Pläne & 3D',FileBox],['buildings','Gebäude',Building2]];
    const current=tabs.some(([id])=>id===section)?section:'overview';
    const groupName=drafts[group.id]?.name??group.name;
    return <div className="space-y-5">
      <PageHeader title={group.name} description="Gebäudegruppe">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4"/>Zur Gebäudeliste</Button>
        {editable && active.is_owner && <Button onClick={onCreateBuilding}><Plus className="h-4 w-4"/>Gebäude anlegen</Button>}
        {editable && <Button variant="outline" aria-expanded={adding} onClick={()=>{setAdding(!adding);setCandidate('');}}><Plus className="h-4 w-4"/>Gebäude in diese Gruppe hinzufügen</Button>}
      </PageHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {adding && editable && <form className="surface flex flex-wrap items-end gap-3 p-4" onSubmit={event=>{
        event.preventDefault();if(candidate)mutation.mutate({path:path+'/buildings/'+candidate,method:'PUT'},{onSuccess:()=>{setAdding(false);setCandidate('');onOpenGroup(group.id,'buildings');}});
      }}>
        {candidates.length ? <><label className="grid gap-1 text-sm">Vorhandenes Gebäude<select className="titan-select" required value={candidate} onChange={event=>setCandidate(event.target.value)}><option value="">Gebäude auswählen …</option>{candidates.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><Button type="submit" disabled={!candidate||mutation.isPending}>Hinzufügen</Button></> : <p>Es sind keine weiteren verwaltbaren Gebäude verfügbar.</p>}
        <Button type="button" variant="ghost" onClick={()=>setAdding(false)}>Schließen</Button>
      </form>}
      <Tabs value={current} onValueChange={tab=>onOpenGroup(group.id,tab)} className="space-y-5">
        <div className="overflow-x-auto pb-1"><TabsList aria-label="Bereiche der Gebäudegruppe" className="h-auto w-max gap-1 rounded-full p-1.5">{tabs.map(([id,label,Icon])=><TabsTrigger key={id} value={id} className="rounded-full px-4 py-2.5"><Icon className="mr-2 h-4 w-4"/>{label}</TabsTrigger>)}</TabsList></div>
        <TabsContent value="overview" className="space-y-4">
          <section className="surface flex items-center gap-4 p-6"><Layers className="h-12 w-12 text-primary"/><div><h2 className="font-heading text-xl font-semibold">{group.name}</h2><p className="text-sm text-muted-foreground">{active.name} · {group.visibleBuildings.length} sichtbare Gebäude</p></div></section>
          <div className="grid gap-3 sm:grid-cols-3">{tabs.slice(1).map(([id,label,Icon])=><button key={id} onClick={()=>onOpenGroup(group.id,id)} className="surface flex items-center gap-3 p-5 text-left hover:border-primary"><Icon className="h-5 w-5 text-primary"/>{label}</button>)}</div>
          {editable && <details className="surface p-4"><summary className="cursor-pointer font-semibold">Gruppe verwalten</summary><form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();mutation.mutate({path,method:'PATCH',body:{name:groupName.trim()}});}}>
            <label className="grid gap-1 text-sm">Gruppenname<Input value={groupName} maxLength={80} required onChange={event=>setDrafts({...drafts,[group.id]:{name:event.target.value}})}/></label><Button disabled={!groupName.trim()||groupName.trim()===group.name||mutation.isPending}>Speichern</Button>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>{if(window.confirm('Gruppe „'+group.name+'“ samt Gruppendateien löschen? Die Gebäude bleiben erhalten.'))mutation.mutate({path,method:'DELETE'},{onSuccess:onBack});}}><Trash2 className="h-4 w-4"/>Gruppe löschen</Button>
          </form></details>}
        </TabsContent>
        {['gallery','models'].map(tab=><TabsContent key={tab} value={tab}>{group.partial || (!group.buildings.length && !active.is_owner) ? <p>Für Gruppendateien ist Zugriff auf die gesamte Gruppe erforderlich.</p> : <GroupMedia path={path+'/files'} section={tab} editable={editable}/>}</TabsContent>)}
        <TabsContent value="buildings"><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{group.visibleBuildings.map(building=><div key={building.id} className="space-y-1"><BuildingCard building={building} onOpen={onOpenBuilding}/>{editable && <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={()=>{if(window.confirm('„'+building.name+'“ aus dieser Gruppe entfernen? Das Gebäude bleibt erhalten.'))mutation.mutate({path:path+'/buildings/'+building.id,method:'DELETE'});}}>Aus Gruppe entfernen</Button>}</div>)}</div>
          {!group.visibleBuildings.length && <p className="surface p-5">In dieser Gruppe sind keine sichtbaren Gebäude.</p>}
        </TabsContent>
      </Tabs>
    </div>;
  }
  return <div className="space-y-5">
    {createOpen && active?.can_manage_groups && <section className="surface space-y-4 p-5" aria-labelledby="new-building-group-title">
      <div className="flex items-start justify-between gap-3"><div><h2 id="new-building-group-title" className="font-heading text-lg font-semibold">Gebäudegruppe erstellen</h2><p className="text-sm text-muted-foreground">Wähle einen Namen und ordne mindestens ein Gebäude zu.</p></div><Button variant="ghost" size="icon" aria-label="Schließen" onClick={onCloseCreate}><X /></Button></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        mutation.mutate({ path: `/teams/${active.id}/groups`, method: 'POST', body: { name: name.trim(), building_ids: newBuildings.map(Number) } }, { onSuccess: () => { setName(''); setNewBuildings([]); onCloseCreate?.(); } });
      }}>
        <label className="grid max-w-sm gap-1 text-xs font-medium">Name der Gebäudegruppe<Input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="z. B. Campus Nord" required /></label>
        <div className="grid gap-2 sm:grid-cols-2">{manageable.map(building => <label key={building.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newBuildings.includes(String(building.id))} onChange={event => setNewBuildings(current => event.target.checked ? [...current, String(building.id)] : current.filter(id => id !== String(building.id)))} />{building.name}</label>)}</div>
        <Button type="submit" disabled={!name.trim() || !newBuildings.length || mutation.isPending}><Plus className="h-4 w-4" />{mutation.isPending ? 'Wird erstellt …' : 'Gruppe erstellen'}</Button>
      </form>
    </section>}

    {error && !createOpen && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {groups.isPending && <p role="status" className="text-sm text-muted-foreground">Gebäudegruppen werden geladen …</p>}
    {groupsWithBuildings.map(group => <section key={group.id} className="surface space-y-4 p-5">
      <button type="button" onClick={()=>onOpenGroup(group.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border p-4 text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-primary">
        <Layers className="h-6 w-6 text-primary"/><span className="min-w-0 flex-1"><strong className="block break-words">{group.name}</strong><span className="text-sm text-muted-foreground">Gebäudegruppe · {group.visibleBuildings.length} Gebäude</span></span><span className="text-sm font-medium text-primary">Gruppe öffnen</span>
      </button>
      {!!group.visibleBuildings.length && <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{group.visibleBuildings.map(building=><BuildingCard key={building.id} building={building} onOpen={onOpenBuilding}/>)}</div>}
    </section>)}

    <section className="surface space-y-4 p-5">
      <div className="flex items-center gap-3 border-b border-border pb-3"><Building2 className="h-5 w-5 text-muted-foreground" /><div><h2 className="font-heading text-lg font-semibold">Nicht zugeordnet</h2><p className="text-sm text-muted-foreground">Gebäude ohne Gebäudegruppe</p></div></div>
      {ungrouped.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{ungrouped.map(building => <BuildingCard key={building.id} building={building} onOpen={onOpenBuilding} />)}</div> : <p className="text-sm text-muted-foreground">Alle Gebäude sind einer Gruppe zugeordnet.</p>}
    </section>

  </div>;
}
