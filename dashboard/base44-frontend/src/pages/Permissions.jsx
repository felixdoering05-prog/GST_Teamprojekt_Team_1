import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Building2, GripVertical, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { request } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';

const STORAGE = 'titan-permission-settings-v1';
const PERMISSIONS = [
  { key: 'view', label: 'Gebäude und Daten ansehen' },
  { key: 'edit', label: 'Gebäude, Sensoren und Werte bearbeiten' },
  { key: 'create', label: 'Gebäude, Sensoren und Geräte hinzufügen' },
  { key: 'coordinate', label: 'Koordination und Zeitpläne verwalten' },
  { key: 'manageLevels', label: 'Berechtigungsebenen erstellen und bearbeiten' },
  { key: 'managePeople', label: 'Personen und Gebäudezugriffe verwalten' },
];
const defaults = [
  { id: 'management', name: 'Management', description: 'Umfassende Verwaltung innerhalb zugewiesener Gebäude.', system: true, permissions: ['view', 'edit', 'create', 'coordinate', 'managePeople'] },
  { id: 'employee', name: 'Employee', description: 'Gebäudeverwaltung innerhalb der zugewiesenen Gebäude; keine Ebenenverwaltung.', system: true, permissions: ['view', 'edit', 'create', 'coordinate', 'managePeople'] },
  { id: 'maintenance', name: 'Maintenance', description: 'Koordination und Zeitpläne; keine Änderungen an Gebäuden, Sensoren oder Werten.', system: true, permissions: ['view', 'coordinate'] },
];
const unique = values => [...new Set((values || []).map(String))];

function loadSettings(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${STORAGE}:${userId}`) || 'null');
    if (parsed && Array.isArray(parsed.levels) && Array.isArray(parsed.assignments)) return parsed;
  } catch { /* Start with the standard levels if local data is unreadable. */ }
  return { levels: defaults, assignments: [] };
}

export default function Permissions() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const [settings, setSettings] = useState(() => loadSettings(userId));
  const [buildings, setBuildings] = useState([]);
  const [buildingId, setBuildingId] = useState('');
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [levelId, setLevelId] = useState('management');
  const [editing, setEditing] = useState(null);
  const [dragged, setDragged] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    request('/buildings').then(rows => {
      if (!alive) return;
      setBuildings(rows);
      setBuildingId(current => current || String(rows[0]?.id || ''));
    }).catch(reason => alive && setError(reason.message));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!buildingId) { setMembers([]); return () => { alive = false; }; }
    request(`/buildings/${buildingId}/members`).then(rows => alive && setMembers(rows.filter(row => row.status === 'owner' || row.status === 'accepted')))
      .catch(reason => alive && setError(reason.message));
    return () => { alive = false; };
  }, [buildingId]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE}:${userId}`, JSON.stringify(settings));
  }, [settings, userId]);

  const selectedBuilding = buildings.find(row => String(row.id) === buildingId);
  const assignments = settings.assignments.filter(row => String(row.buildingId) === buildingId);
  const levelById = useMemo(() => new Map(settings.levels.map(level => [level.id, level])), [settings.levels]);
  const currentUserAssignment = assignments.find(row => String(row.userId) === String(userId));
  const currentUserLevel = levelById.get(currentUserAssignment?.levelId);
  const canManage = Boolean(selectedBuilding?.is_owner || currentUserLevel?.permissions.includes('managePeople'));
  const canManageLevels = Boolean(selectedBuilding?.is_owner || currentUserLevel?.permissions.includes('manageLevels'));

  function updateAssignment(targetId, nextLevelId) {
    const target = members.find(row => String(row.id) === String(targetId));
    const targetAssignment = assignments.find(row => String(row.userId) === String(targetId));
    const targetLevel = levelById.get(targetAssignment?.levelId);
    const actorRank = currentUserAssignment ? settings.levels.findIndex(row => row.id === currentUserAssignment.levelId) : -1;
    const targetRank = targetAssignment ? settings.levels.findIndex(row => row.id === targetAssignment.levelId) : -1;
    const nextRank = settings.levels.findIndex(row => row.id === nextLevelId);
    if (!selectedBuilding?.is_owner && (!canManage || !selectedBuilding)) {
      setError('Für diese Aktion fehlen die Verwaltungsrechte.'); return;
    }
    if (!selectedBuilding?.is_owner && (targetRank >= 0 && targetRank <= actorRank || nextRank >= 0 && nextRank <= actorRank)) {
      setError('Gleiche oder höher eingestufte Personen und Ebenen können nicht geändert oder vergeben werden.'); return;
    }
    if (target?.status === 'owner' && !selectedBuilding?.is_owner) {
      setError('Der Gebäudeeigentümer kann nicht umgestuft werden.'); return;
    }
    setError('');
    setSettings(previous => ({
      ...previous,
      assignments: [
        ...previous.assignments.filter(row => !(String(row.buildingId) === buildingId && String(row.userId) === String(targetId))),
        { buildingId, userId: String(targetId), levelId: nextLevelId },
      ],
    }));
    setMessage('Berechtigung für dieses Gebäude gespeichert.');
  }

  function revoke(targetId) {
    const targetAssignment = assignments.find(row => String(row.userId) === String(targetId));
    if (!targetAssignment || String(targetId) === String(userId)) return;
    const actorRank = currentUserAssignment ? settings.levels.findIndex(row => row.id === currentUserAssignment.levelId) : -1;
    const targetRank = settings.levels.findIndex(row => row.id === targetAssignment.levelId);
    if (!selectedBuilding?.is_owner && (!canManage || targetRank <= actorRank)) {
      setError('Du kannst nur Berechtigungen unterhalb deiner eigenen Ebene entziehen.'); return;
    }
    setSettings(previous => ({ ...previous, assignments: previous.assignments.filter(row => !(String(row.buildingId) === buildingId && String(row.userId) === String(targetId))) }));
    setError(''); setMessage('Zugriff auf dieses Gebäude entzogen. Andere Gebäudezuordnungen bleiben bestehen.');
  }

  function saveLevel(event) {
    event.preventDefault();
    if (!canManageLevels) { setError('Nur Gebäudeeigentümer können Berechtigungsebenen erstellen oder ändern.'); return; }
    const name = editing.name.trim();
    if (!name) return;
    const level = { id: editing.id || `custom-${crypto.randomUUID()}`, name, description: editing.description.trim(), system: false, permissions: unique(editing.permissions) };
    setSettings(previous => ({ ...previous, levels: editing.id ? previous.levels.map(row => row.id === level.id ? level : row) : [...previous.levels, level] }));
    setEditing(null); setError(''); setMessage('Berechtigungsebene gespeichert.');
  }

  function moveLevel(from, to) {
    if (to < 0 || to >= settings.levels.length || from === to) return;
    setSettings(previous => {
      const levels = [...previous.levels];
      const [moved] = levels.splice(from, 1);
      levels.splice(to, 0, moved);
      return { ...previous, levels };
    });
  }

  function dropLevel(index) {
    if (dragged === null || dragged === index) return;
    moveLevel(dragged, index);
    setDragged(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Rollen & Berechtigungen" description="Verwalte Ebenen und Gebäudezugriffe für dein Team." />
      <Card className="border-amber-500/30">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          Einstellungen werden derzeit lokal in diesem Browser gespeichert. Sie sind noch keine serverseitig durchgesetzten Zugriffsrechte und werden nicht mit anderen Konten synchronisiert.
        </CardContent>
      </Card>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-green-700">{message}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Berechtigungsebenen</CardTitle><CardDescription>Von oben nach unten sortiert: weiter oben bedeutet höher eingestuft. Ziehe eine Ebene an eine neue Position.</CardDescription></div>
            <Button size="sm" onClick={() => setEditing({ name: '', description: '', permissions: ['view'] })} disabled={!canManageLevels}><Plus className="mr-2 h-4 w-4" />Neue Ebene</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings.levels.map((level, index) => (
              <div key={level.id} draggable={!level.system && canManageLevels} onDragStart={() => setDragged(index)} onDragOver={event => event.preventDefault()} onDrop={() => dropLevel(index)} onDragEnd={() => setDragged(null)}
                className={`rounded-xl border p-4 ${dragged === index ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <GripVertical className={`mt-1 h-5 w-5 shrink-0 ${level.system ? 'text-muted-foreground/40' : 'cursor-grab text-muted-foreground'}`} aria-label={level.system ? 'Standardebene' : 'Zum Sortieren ziehen'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{index + 1}. {level.name}</h3>{level.system && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Standard</span>}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{level.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{level.permissions.map(key => PERMISSIONS.find(item => item.key === key)?.label).filter(Boolean).join(' · ') || 'Keine Funktionen ausgewählt'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label={`${level.name} nach oben`} disabled={index === 0 || !canManageLevels} onClick={() => moveLevel(index, index - 1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`${level.name} nach unten`} disabled={index === settings.levels.length - 1 || !canManageLevels} onClick={() => moveLevel(index, index + 1)}><ArrowDown className="h-4 w-4" /></Button>
                    {!level.system && <Button variant="ghost" size="icon" aria-label={`${level.name} bearbeiten`} disabled={!canManageLevels} onClick={() => setEditing(level)}><Save className="h-4 w-4" /></Button>}
                    {!level.system && <Button variant="ghost" size="icon" aria-label={`${level.name} löschen`} disabled={!canManageLevels || settings.assignments.some(row => row.levelId === level.id)} onClick={() => setSettings(previous => ({ ...previous, levels: previous.levels.filter(row => row.id !== level.id) }))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Zugriff je Gebäude</CardTitle><CardDescription>Eine Zuweisung gilt ausschließlich für das ausgewählte Gebäude. Entzug hier lässt andere Gebäude unberührt.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2"><Label htmlFor="permission-building">Gebäude</Label><select id="permission-building" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={buildingId} onChange={event => setBuildingId(event.target.value)}><option value="">Gebäude auswählen</option>{buildings.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
            {!buildings.length && <p className="text-sm text-muted-foreground">Es sind keine zugänglichen Gebäude vorhanden.</p>}
            {selectedBuilding && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="h-4 w-4" />{selectedBuilding.name} · {selectedBuilding.is_owner ? 'Eigentümerverwaltung' : 'Mitgliedszugriff'}</p>}
            {canManage && selectedBuilding && <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (memberId && levelId) updateAssignment(memberId, levelId); }}>
              <Label htmlFor="permission-member">Person und Ebene zuweisen</Label>
              <select id="permission-member" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">Person auswählen</option>{members.map(person => <option key={person.id} value={person.id}>{person.name}{person.status === 'owner' ? ' · Eigentümer' : ''}</option>)}</select>
              <div className="flex gap-2"><select aria-label="Berechtigungsebene" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={levelId} onChange={event => setLevelId(event.target.value)}>{settings.levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select><Button type="submit" disabled={!memberId}>Zuweisen</Button></div>
            </form>}
            <div className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Personen mit Berechtigungen</h3>
              {members.map(person => {
                const assignment = assignments.find(row => String(row.userId) === String(person.id));
                const assignedLevel = levelById.get(assignment?.levelId);
                return <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3"><div><p className="text-sm font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.status === 'owner' ? 'Eigentümer' : assignedLevel?.name || 'Mitglied ohne zugewiesene Ebene'}</p></div>{assignment && person.status !== 'owner' && <Button variant="outline" size="sm" disabled={!canManage || String(person.id) === String(userId)} onClick={() => revoke(person.id)}>Für dieses Gebäude entziehen</Button>}</div>;
              })}
              {selectedBuilding && !members.length && <p className="text-sm text-muted-foreground">Keine Teammitglieder gefunden.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {editing && <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}>
        <form role="dialog" aria-modal="true" aria-labelledby="level-dialog-title" onSubmit={saveLevel} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-background p-6 shadow-xl">
          <div><h2 id="level-dialog-title" className="text-lg font-semibold">{editing.id ? 'Ebene bearbeiten' : 'Neue Ebene'}</h2><p className="text-sm text-muted-foreground">Lege die Funktionen dieser Ebene fest.</p></div>
          <div className="space-y-2"><Label htmlFor="level-name">Name</Label><Input id="level-name" value={editing.name} maxLength={80} required onChange={event => setEditing({ ...editing, name: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="level-description">Beschreibung</Label><Input id="level-description" value={editing.description} maxLength={240} onChange={event => setEditing({ ...editing, description: event.target.value })} /></div>
          <fieldset className="space-y-2"><legend className="text-sm font-medium">Funktionen</legend>{PERMISSIONS.map(permission => <label key={permission.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.permissions.includes(permission.key)} onChange={event => setEditing({ ...editing, permissions: event.target.checked ? [...editing.permissions, permission.key] : editing.permissions.filter(key => key !== permission.key) })} />{permission.label}</label>)}</fieldset>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Abbrechen</Button><Button type="submit">Speichern</Button></div>
        </form>
      </div>}
    </div>
  );
}
