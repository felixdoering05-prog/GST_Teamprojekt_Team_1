import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const groupsKey = id => ['building-groups', String(id)];
const accessKey = id => ['building-team-access', String(id)];

export default function GroupAccessPanel() {
  const cache = useQueryClient();
  const [groupID, setGroupID] = useState('');
  const [userID, setUserID] = useState('');
  const [roleID, setRoleID] = useState('');
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => request('/teams') });
  const selected = teams.data?.find(team => String(team.id) === localStorage.getItem('d21-selected-team')) || teams.data?.[0];
  const groups = useQuery({
    queryKey: groupsKey(selected?.id),
    queryFn: () => request('/teams/' + selected.id + '/groups'),
    enabled: !!selected?.id,
  });
  const group = groups.data?.find(item => String(item.id) === groupID) || groups.data?.[0];
  const contacts = useQuery({
    queryKey: ['contacts'],
    queryFn: () => request('/contacts'),
    enabled: selected?.can_manage_groups === true,
  });
  const permissions = useQueries({
    queries: (group?.buildings || []).map(building => ({
      queryKey: accessKey(building.id),
      queryFn: () => request('/buildings/' + building.id + '/team-access'),
      enabled: selected?.can_manage_groups === true,
    })),
  });
  const sourceBuilding = group?.buildings?.[0];
  const sourceAccess = permissions[0]?.data;
  const roles = (sourceAccess?.roles || []).filter(role =>
    sourceAccess?.is_owner || Number(role.sort_order) > Number(sourceAccess?.actor_role?.sort_order ?? -1)
  );
  const assignment = useMutation({
    mutationFn: () => request('/teams/' + selected.id + '/groups/' + group.id + '/assign', {
      method: 'POST',
      body: { user_id: Number(userID), role_building_id: Number(sourceBuilding.id), role_id: Number(roleID) },
    }),
    onSuccess: async () => {
      setUserID('');
      setRoleID('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: groupsKey(selected.id) }),
        cache.invalidateQueries({ queryKey: ['team-members', selected.id] }),
        cache.invalidateQueries({ queryKey: ['building-team-access'] }),
        cache.invalidateQueries({ queryKey: ['teams'] }),
      ]);
    },
  });

  useEffect(() => { setRoleID(''); }, [group?.id]);

  const allowed = !!group
    && permissions.length === group.buildings.length
    && permissions.every(query => query.data?.can_manage_members === true);
  const acceptedContacts = (contacts.data || []).filter(contact => contact.status === 'accepted');

  if (!selected?.can_manage_groups || !groups.data?.length) return null;

  return (
    <section className="surface space-y-4 rounded-2xl border border-border p-5 shadow-sm">
      <div>
        <h2 className="font-heading font-semibold">Rechte für eine Gebäudegruppe vergeben</h2>
        <p className="text-xs text-muted-foreground">
          Wähle eine Rolle einmal aus. Dieselben Funktionsrechte werden auf alle Gebäude der Gruppe übertragen.
          Falls nötig, wird die entsprechende Rolle in den einzelnen Gebäuden angelegt.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-semibold">
          Gebäudegruppe
          <select className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={group?.id || ''}
            onChange={event => { setGroupID(event.target.value); setRoleID(''); }}>
            <option value="">Gruppe auswählen</option>
            {groups.data.map(item => <option key={item.id} value={item.id}>{item.name} · {item.buildings.length} Gebäude</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold">
          Teammitglied
          <select className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={userID} onChange={event => setUserID(event.target.value)}>
            <option value="">Person auswählen</option>
            {acceptedContacts.map(contact => <option key={contact.id} value={contact.user_id}>{contact.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold">
          Rolle
          <select className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={roleID}
            onChange={event => setRoleID(event.target.value)} disabled={!sourceAccess}>
            <option value="">Rolle auswählen</option>
            {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
      </div>
      {group && <p className="text-xs text-muted-foreground">
        {group.buildings.length} Gebäude: {group.buildings.map(building => building.name).join(', ')}
      </p>}
      {assignment.error && <p role="alert" className="text-sm text-destructive">{assignment.error.message}</p>}
      {assignment.isSuccess && <p role="status" className="text-sm text-emerald-700">Die Rolle wurde auf alle Gebäude der Gruppe übertragen.</p>}
      <div className="flex justify-end">
        <Button type="button" onClick={() => assignment.mutate()} disabled={!userID || !roleID || !allowed || assignment.isPending}>
          <Users className="h-4 w-4" /> {assignment.isPending ? 'Wird übertragen …' : 'Rolle auf alle Gebäude anwenden'}
        </Button>
      </div>
      {!allowed && group && <p className="text-xs text-muted-foreground">
        Für die Gruppenvergabe benötigst du in jedem Gebäude der Gruppe die Mitgliederverwaltung.
      </p>}
    </section>
  );
}
