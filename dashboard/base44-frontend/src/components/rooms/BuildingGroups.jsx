import EntryFiles from '@/components/EntryFiles';
import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, MapPin, Plus, Save, Settings2, Trash2, X } from 'lucide-react';
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

export default function BuildingGroups({ buildings = [], groupID, onOpenBuilding, createOpen = false, onCloseCreate }) {
  const cache = useQueryClient();
  const [name, setName] = useState('');
  const [newBuildings, setNewBuildings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [manageGroupId, setManageGroupId] = useState(null);
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
  const dirty = group => {
    const draft = drafts[group.id];
    if (!draft) return false;
    const before = group.buildings.map(item => String(item.id)).sort().join(',');
    const after = [...draft.building_ids].sort().join(',');
    return draft.name.trim() !== group.name || before !== after;
  };
  const buildingById = new Map(buildings.map(building => [String(building.id), building]));
  const groupsWithBuildings = (groups.data || []).filter(group => !groupID || String(group.id) === groupID).map(group => ({
    ...group,
    visibleBuildings: group.buildings.map(building => buildingById.get(String(building.id))).filter(Boolean),
  }));
  const groupedIds = new Set(groupsWithBuildings.flatMap(group => group.buildings.map(building => String(building.id))));
  const ungrouped = buildings.filter(building => !groupedIds.has(String(building.id))).slice().reverse();

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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-primary" /><div><h2 className="font-heading text-lg font-semibold">{group.name}</h2><p className="text-sm text-muted-foreground">Gebäudegruppe · {group.visibleBuildings.length} {group.visibleBuildings.length === 1 ? 'Gebäude' : 'Gebäude'}</p></div></div>
        {active?.can_manage_groups && <Button type="button" size="sm" variant={manageGroupId === group.id ? 'secondary' : 'outline'} aria-expanded={manageGroupId === group.id} onClick={() => setManageGroupId(current => current === group.id ? null : group.id)}>
          {manageGroupId === group.id ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}{manageGroupId === group.id ? 'Verwaltung schließen' : 'Gruppe verwalten'}
        </Button>}
      </div>
      {!group.partial && <EntryFiles path={`/teams/${active.id}/groups/${group.id}/files`} editable={canEditGroup(group)} />}
      {group.visibleBuildings.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{group.visibleBuildings.map(building => <BuildingCard key={`${group.id}-${building.id}`} building={building} onOpen={onOpenBuilding} />)}</div> : <p className="text-sm text-muted-foreground">In dieser Gruppe sind keine sichtbaren Gebäude.</p>}
      {manageGroupId === group.id && active?.can_manage_groups && (() => {
        const draft = drafts[group.id] || { name: group.name, building_ids: group.buildings.map(item => String(item.id)) };
        const allowed = canEditGroup(group);
        return <div className="space-y-3 rounded-xl border border-border p-4" aria-label={`Gebäudegruppe ${group.name} verwalten`}>
          <label className="grid max-w-sm gap-1 text-xs font-medium">Gruppenname<Input value={draft.name} disabled={!allowed} maxLength={80} onChange={event => setDrafts(current => ({ ...current, [group.id]: { ...draft, name: event.target.value } }))} /></label>
          <div className="grid gap-2 sm:grid-cols-2">{manageable.map(building => <label key={building.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.building_ids.includes(String(building.id))} disabled={!allowed} onChange={event => setDrafts(current => ({ ...current, [group.id]: { ...draft, building_ids: event.target.checked ? [...draft.building_ids, String(building.id)] : draft.building_ids.filter(id => id !== String(building.id)) } }))} />{building.name}</label>)}</div>
          {!allowed && <p className="text-sm text-muted-foreground">Du kannst diese Gruppe nur verwalten, wenn du alle zugehörigen Gebäude bearbeiten darfst.</p>}
          <div className="flex flex-wrap gap-2">{allowed && dirty(group) && <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: `/teams/${active.id}/groups/${group.id}`, method: 'PATCH', body: { name: draft.name.trim(), building_ids: draft.building_ids.map(Number) } })}><Save className="h-4 w-4" />Speichern</Button>}{allowed && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { if (window.confirm(`Gruppe „${group.name}“ unwiderruflich löschen?`)) mutation.mutate({ path: `/teams/${active.id}/groups/${group.id}`, method: 'DELETE' }, { onSuccess: () => setManageGroupId(null) }); }}><Trash2 className="h-4 w-4" />Gruppe löschen</Button>}</div>
        </div>;
      })()}
    </section>)}

    <section className="surface space-y-4 p-5">
      <div className="flex items-center gap-3 border-b border-border pb-3"><Building2 className="h-5 w-5 text-muted-foreground" /><div><h2 className="font-heading text-lg font-semibold">Nicht zugeordnet</h2><p className="text-sm text-muted-foreground">Gebäude ohne Gebäudegruppe</p></div></div>
      {ungrouped.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{ungrouped.map(building => <BuildingCard key={building.id} building={building} onOpen={onOpenBuilding} />)}</div> : <p className="text-sm text-muted-foreground">Alle Gebäude sind einer Gruppe zugeordnet.</p>}
    </section>

  </div>;
}
