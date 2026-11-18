import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Clock,
  GripVertical,
  Pencil,
  Plus,
  Radio,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { request } from '@/api/base44Client';
import GroupAccessPanel from '@/components/teams/GroupAccessPanel';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const permissionGroups = [
  {
    label: 'Gebäude & BIM-Modelle',
    icon: Boxes,
    items: [
      { key: 'overview', label: 'Kommandozentrale', hint: 'Gebäudeübersicht, Kennzahlen und Schnellzugriff' },
      { key: 'buildings', label: 'Gebäudeverwaltung', hint: 'Gebäudestammdaten, Adressen und Bilder' },
      { key: 'structure', label: 'Geschosse & Räume', hint: 'Raumhierarchie, Geschossverwaltung und Raumzuordnung' },
      { key: 'bim', label: 'BIM-Viewer', hint: '3D-Modell, Bauteilprüfung und IFC-Navigation' },
      { key: 'documents', label: 'Dateien & Pläne', hint: 'Pläne, IFC-Dateien und begleitende Dokumente' },
    ],
  },
  {
    label: 'Sensorik & Analysen',
    icon: Radio,
    items: [
      { key: 'sensors', label: 'Sensorik & Telemetrie', hint: 'Messwerte, Grenzwerte und ESP32-Geräte' },
      { key: 'energy', label: 'Energie & Zähler', hint: 'Energieauswertung, Grundlast und Verbrauchsdaten' },
      { key: 'analysis', label: 'KI-Analyse', hint: 'Auffälligkeiten, Ursachen und Trendbewertungen' },
    ],
  },
  {
    label: 'Zusammenarbeit',
    icon: Users,
    items: [
      { key: 'coordination', label: 'Teamchat & Koordination', hint: 'Nachrichten und interne Teamabstimmung' },
      { key: 'issues', label: 'Mängel & Meldungen', hint: 'Erfassen, Bearbeiten und Lösen von Gebäudemängeln' },
      { key: 'assistant', label: 'Gebäude-Assistent', hint: 'Fragen an Nala zu Gebäudedaten und Unterlagen' },
    ],
  },
  {
    label: 'System & Verwaltung',
    icon: Settings,
    items: [
      { key: 'settings', label: 'Einstellungen & Importe', hint: 'Datenimport/-export, Schnittstellen und Konfiguration' },
      { key: 'maintenance', label: 'Wartungspläne', hint: 'Wartungs- und Instandhaltungspläne' },
    ],
  },
];

const allModules = permissionGroups.flatMap((group) => group.items);
const accessLabels = { none: 'Kein Zugriff', read: 'Nur Lesen', edit: 'Lesen & Ändern' };
const blankPermissions = Object.fromEntries(allModules.map((item) => [item.key, 'none']));
const buildingListKey = ['account-buildings'];
const teamKey = (id) => ['building-team-access', String(id)];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function RoleEditor({ initial, busy, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [canManageMembers, setCanManageMembers] = useState(initial?.can_manage_members === true);
  const [permissions, setPermissions] = useState({ ...blankPermissions, ...initial?.permissions });

  const stats = useMemo(() => {
    let editCount = 0;
    let readCount = 0;
    for (const val of Object.values(permissions)) {
      if (val === 'edit') editCount++;
      else if (val === 'read') readCount++;
    }
    return { editCount, readCount, total: allModules.length };
  }, [permissions]);

  return (
    <form
      className="surface rounded-2xl border border-primary/30 p-5 shadow-sm sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ name: name.trim(), can_manage_members: canManageMembers, permissions });
      }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-heading font-semibold text-foreground">
              {initial ? `Rolle bearbeiten: ${initial.name}` : 'Neue gebäudebezogene Rolle erstellen'}
            </h3>
            <p className="text-xs text-muted-foreground">
              Berechtigungen: {stats.editCount} Vollzugriff · {stats.readCount} Nur Lesen ·{' '}
              {stats.total - stats.editCount - stats.readCount} Kein Zugriff
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} disabled={busy} aria-label="Abbrechen">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold">
            Rollenbezeichnung *
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="z. B. Technische Betriebsleitung oder Facility Management"
              required
              className="mt-0.5"
            />
          </label>

          <div className="flex items-center">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted/30">
              <input
                type="checkbox"
                checked={canManageMembers}
                onChange={(e) => setCanManageMembers(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <div className="text-xs">
                <span className="font-semibold text-foreground">Mitgliederverwaltung erlauben</span>
                <p className="mt-0.5 text-muted-foreground">
                  Inhaber dieser Rolle dürfen Personen mit niedrigerem Rang einladen und verwalten.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Funktionsrechte nach Bereichen
          </p>

          <div className="grid gap-5">
            {permissionGroups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.label} className="rounded-xl border border-border/80 bg-background/50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <GroupIcon className="h-4 w-4 text-primary" />
                    <span>{group.label}</span>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <div
                        key={item.key}
                        className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground">{item.label}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{item.hint}</p>
                        </div>
                        <select
                          className="shrink-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          value={permissions[item.key] || 'none'}
                          onChange={(e) =>
                            setPermissions((current) => ({
                              ...current,
                              [item.key]: e.target.value,
                            }))
                          }
                        >
                          {Object.entries(accessLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Speichert …' : initial ? 'Änderungen speichern' : 'Rolle anlegen'}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function TeamAccess() {
  const cache = useQueryClient();
  const [buildingId, setBuildingId] = useState('');
  const [inviteUser, setInviteUser] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [editing, setEditing] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [dragged, setDragged] = useState(null);

  const buildings = useQuery({ queryKey: buildingListKey, queryFn: () => request('/buildings'), refetchOnWindowFocus: true });
  const preferredBuildingId = buildingId || localStorage.getItem('d21-selected-building') || '';
  const selectedId = String(buildings.data?.find(row => String(row.id) === String(preferredBuildingId))?.id || buildings.data?.[0]?.id || '');
  const selected = buildings.data?.find((row) => String(row.id) === selectedId);

  const team = useQuery({
    queryKey: teamKey(selectedId),
    queryFn: () => request(`/buildings/${selectedId}/team-access`),
    enabled: !!selectedId,
    refetchOnWindowFocus: true,
  });

  const contacts = useQuery({
    queryKey: ['contacts'],
    queryFn: () => request('/contacts'),
    enabled: team.data?.can_manage_members === true,
    refetchOnWindowFocus: true,
  });

  const roles = useMemo(() => {
    return [...(team.data?.roles || [])].sort((a, b) => a.sort_order - b.sort_order);
  }, [team.data?.roles]);

  const members = team.data?.members || [];
  const actorRank = team.data?.actor_role?.sort_order ?? -1;
  const isOwner = team.data?.is_owner === true;
  const canManageMembers = team.data?.can_manage_members === true;
  const canManageRoles = team.data?.can_manage_roles === true;

  const assignable = isOwner ? roles : roles.filter((role) => role.sort_order > actorRank);
  const available = (contacts.data || []).filter(
    (contact) => contact.status === 'accepted' && !members.some((member) => String(member.id) === String(contact.user_id)),
  );
  const memberTarget = available.find((contact) => String(contact.user_id) === String(inviteUser));

  const mutation = useMutation({
    mutationFn: ({ path, method = 'POST', body }) => request(path, { method, body }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: teamKey(selectedId) }),
        cache.invalidateQueries({ queryKey: buildingListKey }),
        cache.invalidateQueries(),
      ]);
      setEditing(null);
      setInviteUser('');
      setInviteRole('');
      if (variables.method === 'DELETE' && variables.path.includes('/members/')) {
        setRemoval(null);
      }
    },
  });

  const error = buildings.error || team.error || contacts.error || mutation.error;

  function saveRole(value) {
    const base = `/buildings/${selectedId}/team-access/roles`;
    mutation.mutate({
      path: editing?.id ? `${base}/${editing.id}` : base,
      method: editing?.id ? 'PATCH' : 'POST',
      body: value,
    });
  }

  function reorder(targetId) {
    if (!canManageRoles || dragged === null || String(targetId) === String(dragged)) return;
    const from = roles.findIndex((role) => String(role.id) === String(dragged));
    const to = roles.findIndex((role) => String(role.id) === String(targetId));
    if (from < 0 || to < 0) return;
    const next = [...roles];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setDragged(null);
    mutation.mutate({
      path: `/buildings/${selectedId}/team-access/roles/order`,
      method: 'PATCH',
      body: { role_ids: next.map((role) => role.id) },
    });
  }

  function canEditMember(member) {
    return member.role_key !== 'owner' && (isOwner || Number(member.sort_order) > actorRank);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechte"
        description="Gebäudebezogene Rollen, Teammitglieder und Berechtigungen verwalten."
      >
        {buildings.data?.length > 0 && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <span className="text-muted-foreground">Gebäude:</span>
            <select
              className="max-w-64 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedId}
              onChange={(e) => {
                setBuildingId(e.target.value);
                localStorage.setItem('d21-selected-building', e.target.value);
                window.dispatchEvent(new Event('d21-building-change'));
                setEditing(null);
              }}
            >
              {buildings.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </PageHeader>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive shadow-sm">
          {error.message}
        </p>
      )}

      {buildings.isPending && <p role="status" className="text-sm text-muted-foreground">Gebäude werden geladen …</p>}

      {!buildings.isPending && !buildings.data?.length && (
        <EmptyState
          icon={Users}
          title="Kein Gebäude verfügbar"
          description="Erstelle ein Gebäude oder nimm eine Einladung an, um ein Team und Rollen einzurichten."
        />
      )}

      {selected && team.data && (
        <Tabs defaultValue="members" className="w-full space-y-6">
          <TabsList className="h-11 rounded-xl bg-muted/60 p-1">
            <TabsTrigger value="members" className="gap-2 rounded-lg px-4 text-xs font-semibold sm:text-sm">
              <Users className="h-4 w-4" />
              <span>Teammitglieder</span>
              <Badge variant="secondary" className="ml-1 text-[11px] px-1.5 py-0">
                {members.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-2 rounded-lg px-4 text-xs font-semibold sm:text-sm">
              <ShieldCheck className="h-4 w-4" />
              <span>Rollen & Rangfolge</span>
              <Badge variant="secondary" className="ml-1 text-[11px] px-1.5 py-0">
                {roles.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: MITGLIEDER */}
          <TabsContent value="members" className="space-y-6 focus-visible:outline-none">
            {/* Status overview cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="surface flex items-center gap-3.5 rounded-xl border border-border p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Teamgröße</p>
                  <p className="text-lg font-bold text-foreground">{members.length} Personen</p>
                </div>
              </div>

              <div className="surface flex items-center gap-3.5 rounded-xl border border-border p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Clock className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Offene Einladungen</p>
                  <p className="text-lg font-bold text-foreground">
                    {members.filter((m) => m.status === 'pending').length}
                  </p>
                </div>
              </div>

              <div className="surface flex items-center gap-3.5 rounded-xl border border-border p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600">
                  <Shield className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Deine Rolle</p>
                  <p className="truncate text-sm font-bold text-foreground">
                    {isOwner ? 'Eigentümer (vollständig)' : team.data.actor_role?.name || 'Mitglied'}
                  </p>
                </div>
              </div>
            </div>

            {/* Invite Form Card */}
            {canManageMembers && (
              <div className="surface rounded-2xl border border-border p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <UserPlus className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="font-heading font-semibold text-foreground">Neues Teammitglied einladen</h3>
                    <p className="text-xs text-muted-foreground">
                      Wähle eine Person aus deinen Kontakten und weise ihr eine Rolle für {selected.name} zu.
                    </p>
                  </div>
                </div>

                {available.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Alle bestätigten Kontakte sind bereits Teil dieses Teams oder eingeladen. Weitere Kontakte können im Profil hinzugefügt werden.
                  </p>
                ) : (
                  <form
                    className="grid gap-3 sm:grid-cols-12 sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (memberTarget && inviteRole) {
                        mutation.mutate({
                          path: `/buildings/${selectedId}/team-access/members`,
                          body: { user_id: Number(inviteUser), role_id: Number(inviteRole) },
                        });
                      }
                    }}
                  >
                    <label className="grid gap-1.5 text-xs font-semibold sm:col-span-5">
                      Bestätigter Kontakt *
                      <select
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={inviteUser}
                        onChange={(e) => setInviteUser(e.target.value)}
                        required
                      >
                        <option value="">Person auswählen …</option>
                        {available.map((contact) => (
                          <option key={contact.id} value={contact.user_id}>
                            {contact.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 text-xs font-semibold sm:col-span-4">
                      Rolle zuweisen *
                      <select
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        required
                      >
                        <option value="">Rolle wählen …</option>
                        {assignable.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="sm:col-span-3">
                      <Button
                        type="submit"
                        className="w-full gap-2 shadow-sm"
                        disabled={!memberTarget || !inviteRole || mutation.isPending}
                      >
                        <Plus className="h-4 w-4" />
                        {mutation.isPending ? 'Lädt ein …' : 'Einladen'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Members List */}
            <div className="surface rounded-2xl border border-border shadow-sm">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <h3 className="font-heading font-semibold text-foreground">
                  Mitglieder in {selected.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Eigentümer besitzen uneingeschränkte Rechte. Andere Mitglieder erhalten die Rechte ihrer zugewiesenen Rolle.
                </p>
              </div>

              <div className="divide-y divide-border">
                {members.map((member) => {
                  const editable = canEditMember(member) && canManageMembers;
                  const initials = getInitials(member.name);
                  const isCurrentOwner = member.status === 'owner';
                  const isPending = member.status === 'pending';

                  return (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-muted/20 sm:px-6"
                    >
                      <div className="flex items-center gap-3.5 min-w-[200px]">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {member.name}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            {isCurrentOwner ? (
                              <Badge variant="default" className="text-[10px]">
                                Eigentümer
                              </Badge>
                            ) : isPending ? (
                              <Badge variant="secondary" className="text-[10px] text-amber-700 bg-amber-100">
                                Einladung ausstehend
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                {member.role_name || 'Employee'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {!isCurrentOwner && editable && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground hidden sm:inline">Rolle:</span>
                            <select
                              aria-label={`Rolle für ${member.name}`}
                              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              value={member.role_id || ''}
                              onChange={(e) =>
                                mutation.mutate({
                                  path: `/buildings/${selectedId}/team-access/members/${member.id}/role`,
                                  method: 'PATCH',
                                  body: { role_id: Number(e.target.value) },
                                })
                              }
                              disabled={mutation.isPending}
                            >
                              {assignable.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {!isCurrentOwner && editable && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs text-muted-foreground hover:text-destructive"
                            disabled={mutation.isPending}
                            onClick={() => setRemoval(member)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            {isPending ? 'Einladung zurückziehen' : 'Zugriff entziehen'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: ROLLEN & RANGFOLGE */}
          <TabsContent value="roles" className="space-y-6 focus-visible:outline-none">
            {/* Info Banner */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="leading-relaxed">
                  <span className="font-semibold">Rangfolge & Berechtigungen:</span> Rollen mit einer niedrigeren Rangnummer (Rang 1, 2 …) stehen hierarchisch über nachfolgenden Rollen. Eine Rolle mit Mitgliederverwaltung darf nur Mitglieder verwalten, deren Rolle einen niedrigeren Rang besitzt. Ziehe Rollen per Drag & Drop an die gewünschte Position, um die Reihenfolge anzupassen.
                </div>
              </div>
            </div>

            {/* Role Header Action */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-semibold text-foreground">Definierte Rollen</h3>
                <p className="text-xs text-muted-foreground">
                  Berechtigungen gelten gebäudeweit für zugewiesene Mitglieder.
                </p>
              </div>

              {canManageRoles && !editing && (
                <Button size="sm" onClick={() => setEditing({ new: true })} className="gap-2 shadow-sm">
                  <Plus className="h-4 w-4" />
                  Neue Rolle anlegen
                </Button>
              )}
            </div>

            {/* Role Editor */}
            {editing && (
              <RoleEditor
                key={editing.id || 'new'}
                initial={editing.new ? null : editing}
                busy={mutation.isPending}
                onCancel={() => setEditing(null)}
                onSave={saveRole}
              />
            )}

            {/* Roles List */}
            <div className="space-y-2.5">
              {roles.map((role, index) => {
                const assignedMembers = members.filter((m) => Number(m.role_id) === Number(role.id));
                const isSystem = role.is_system === true;

                return (
                  <div
                    key={role.id}
                    draggable={canManageRoles}
                    onDragStart={() => setDragged(role.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => reorder(role.id)}
                    onDragEnd={() => setDragged(null)}
                    className={`surface flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4 shadow-sm transition hover:border-primary/40 ${
                      dragged === role.id ? 'opacity-40 ring-2 ring-primary' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-[220px]">
                      {canManageRoles ? (
                        <div
                          className="flex cursor-grab items-center gap-1 text-xs text-muted-foreground hover:text-foreground active:cursor-grabbing"
                          title="Ziehen zum Neuanordnen"
                        >
                          <GripVertical className="h-4 w-4" />
                          <span className="font-mono font-bold text-xs">#{index + 1}</span>
                        </div>
                      ) : (
                        <span className="font-mono font-bold text-xs text-muted-foreground">#{index + 1}</span>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">{role.name}</h4>
                          {isSystem ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Standard
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Individuell
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {assignedMembers.length} {assignedMembers.length === 1 ? 'Person' : 'Personen'}
                          </span>
                          <span>·</span>
                          <span>
                            {role.can_manage_members ? (
                              <span className="flex items-center gap-1 text-primary">
                                <UserCheck className="h-3.5 w-3.5" />
                                Mitgliederverwaltung
                              </span>
                            ) : (
                              'Nur Funktionsrechte'
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {canManageRoles && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(role)}
                          className="text-xs gap-1.5"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Bearbeiten
                        </Button>

                        {!isSystem && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-muted-foreground hover:text-destructive"
                            disabled={assignedMembers.length > 0 || mutation.isPending}
                            title={
                              assignedMembers.length > 0
                                ? 'Rolle kann nicht gelöscht werden, solange Mitglieder zugewiesen sind'
                                : 'Rolle löschen'
                            }
                            onClick={() =>
                              mutation.mutate({
                                path: `/buildings/${selectedId}/team-access/roles/${role.id}`,
                                method: 'DELETE',
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <GroupAccessPanel />
      <ConfirmDialog
        open={!!removal}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setRemoval(null);
        }}
        title="Zugriff entziehen?"
        description={`Möchtest du ${removal?.name || 'diesem Mitglied'} den Zugriff auf „${
          selected?.name || 'dieses Gebäude'
        }“ wirklich entziehen? Zugriffe auf andere Gebäude bleiben unberührt.`}
        confirmLabel="Zugriff entziehen"
        busy={mutation.isPending}
        onConfirm={() =>
          removal &&
          mutation.mutate({
            path: `/buildings/${selectedId}/team-access/members/${removal.id}`,
            method: 'DELETE',
          })
        }
      />
    </div>
  );
}
