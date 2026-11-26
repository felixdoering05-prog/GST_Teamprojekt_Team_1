import { useBuildingScope, buildingScopeHeaders } from '@/hooks/useBuildingScope';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { request } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { formatDateTime } from '@/lib/dates';
import { issuePath, issuePriority, issueStatus, issueSource, priorityLabel } from '@/lib/buildingIssues';
import { prepareIssuePhoto, uploadIssuePhoto } from '@/lib/issuePhoto';
import { SelectField, TextAreaField, TextField } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { RoomDetailsLink, RoomModelPreview, RoomReading } from '@/components/bim/RoomModelPreview';
import { useRoomEvidence } from '@/hooks/useRoomEvidence';
import { resolveBuildingRoom, roomDisplayName, roomModelFocus } from '@/lib/roomLocation';
import IssuePhotoFields from './IssuePhotoFields';

const limitedId = value => /^[1-9]\d{0,9}$/.test(value || '') && Number(value) <= 2147483647;
const priorityTone = { urgent: 'text-destructive', high: 'text-warning', normal: 'text-primary', low: 'text-muted-foreground' };
const changeName = { status: 'Status', priority: 'Priorität', title: 'Titel', description: 'Beschreibung', room: 'Ort', source: 'Quelle' };
const options = entries => Object.entries(entries).map(([value, label]) => ({ value, label }));

function IssueFields({ issue = {}, includePriority = false, fixedRoom }) {
  return <>
    <TextField label="Titel" aria-label="Titel" name="title" maxLength={120} defaultValue={issue.title || ''} required />
    {fixedRoom
      ? <TextField label="Ort / Raum" aria-label="Ort / Raum" value={fixedRoom} readOnly />
      : <TextField label="Ort / Raum" aria-label="Ort / Raum" name="room" maxLength={100} defaultValue={issue.room || ''} />}
    <SelectField label="Quelle" aria-label="Quelle" name="source" defaultValue={issue.source || (issue.id ? '' : 'operator')}
      options={[...(issue.id ? [{ value: '', label: 'Nicht hinterlegt' }] : []), ...options(issueSource)]} />
    {includePriority && <SelectField label="Priorität" aria-label="Priorität" name="priority" defaultValue="normal" options={options(issuePriority)} />}
    <TextAreaField label="Beschreibung" aria-label="Beschreibung" name="description" maxLength={2000} defaultValue={issue.description || ''} />
  </>;
}

export function CreateIssue({ buildings, close, created, roomContext }) {
  const [requestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(null);
  const [saved, setSaved] = useState(null);
  const fixedRoom = roomContext && [roomContext.floor?.name, roomDisplayName(roomContext.room)].filter(Boolean).join(' · ');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const { building: selected, ...fields } = Object.fromEntries(new FormData(event.currentTarget));
    const building = roomContext ? buildings[0].id : selected;
    if (!building) return;
    if (roomContext && !photo) { setError('Bitte nimm ein Foto auf oder wähle eine Bilddatei.'); return; }
    setBusy(true); setError('');
    let row = saved;
    try {
      const image = photo && (photo.image || await prepareIssuePhoto(photo.file));
      if (image && !photo.image) setPhoto({ ...photo, image });
      if (!row) {
        const location = roomContext ? { room_id: roomContext.room.id } : { reuse_existing: true };
        row = await request('/buildings/' + building + '/issues', {
          method: 'POST', body: { ...fields, ...location, request_key: requestKey },
        });
        if (roomContext) setSaved(row);
      }
      if (image) await uploadIssuePhoto(issuePath(building, row.id), image);
      created(row);
    } catch (failure) {
      setError(row ? `Der Mangel ist gespeichert. Das Foto konnte nicht hochgeladen werden. ${failure.message}` : failure.message);
    }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogTitle>{roomContext ? 'Mangel mit Foto melden' : 'Mangel erfassen'}</DialogTitle>
      <DialogDescription>Das Gebäude legt fest, wer Zugriff auf den Mangel hat.</DialogDescription>
      <form onSubmit={submit} className="space-y-3">
        <fieldset disabled={busy || Boolean(saved)} className="space-y-3">
          {roomContext ? <TextField label="Gebäude" aria-label="Gebäude" value={buildings[0].name} readOnly />
            : <SelectField label="Gebäude" aria-label="Gebäude" name="building" required placeholder="Gebäude auswählen …" defaultValue={buildings.length === 1 ? String(buildings[0].id) : ''}
              options={buildings.map(row => ({ value: String(row.id), label: row.name }))} />}
          <IssueFields includePriority fixedRoom={fixedRoom} />
        </fieldset>
        {roomContext && <IssuePhotoFields file={photo?.file} onChange={file => setPhoto({ file })} disabled={busy} />}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} type="submit">{busy ? 'Wird gespeichert …'
            : saved ? 'Foto erneut hochladen' : roomContext ? 'Mangel mit Foto speichern' : 'Mangel speichern'}</Button>
          {saved && !busy && <Button type="button" variant="outline" onClick={() => created(saved)}>Meldung öffnen</Button>}
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function IssuePhoto({ path, revision }) {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let url;
    request(`${path}/photo`, { raw: true }).then(photo => {
      if (active) { url = URL.createObjectURL(photo); setSource(url); }
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [path, revision]);
  return error ? <p role="alert" className="text-sm text-destructive">{error}</p>
    : source ? <a href={source} target="_blank" rel="noreferrer"><img src={source} alt="Foto zur Meldung"
      className="mt-2 max-h-64 w-auto max-w-full rounded-lg object-contain" /></a>
    : <p role="status" className="text-sm text-muted-foreground">Foto wird geladen …</p>;
}

function AddIssuePhoto({ path, refresh }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setError('');
    try { await uploadIssuePhoto(path, await prepareIssuePhoto(file)); await refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-2">
    <IssuePhotoFields file={file} onChange={setFile} disabled={busy} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy || !file}>{busy ? 'Wird gespeichert …' : 'Foto hinzufügen'}</Button>
  </form>;
}

function History({ entries }) {
  return <section className="space-y-2">
    <h4 className="font-semibold">Bearbeitungsverlauf</h4>
    {!entries.length && <p className="text-sm text-muted-foreground">Kein Verlauf vorhanden.</p>}
    <ol className="divide-y text-sm">
      {entries.map(entry => <li key={entry.revision} className="grid gap-1 py-2">
        <span>{entry.action === 'created' ? 'Meldung erfasst' : entry.action === 'photo' ? 'Foto gespeichert'
          : Object.entries(entry.changes).map(([key, change]) => {
            const label = key === 'status' ? issueStatus[change.to] : key === 'priority' ? priorityLabel(change.to) : null;
            return label ? `${changeName[key]} → ${label}` : `${changeName[key]} geändert`;
          }).join(' · ')}</span>
        <span className="text-xs text-muted-foreground">{entry.actor} · {formatDateTime(entry.occurred_at)}</span>
      </li>)}
    </ol>
  </section>;
}

function IssueDetails({ issue, path, refresh }) {
  const [spatial, setSpatial] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const modelID = issue.location_model ?? issue.document_id;
  const campus = modelID === 'campus-d21';
  const hasLocation = Boolean(issue.point || issue.space_id || issue.element_id || issue.room?.trim());
  const { structure, temperatures } = useRoomEvidence(issue.building_id);
  const locationData = structure.data || temperatures.data;
  const room = issue.room_id ? resolveBuildingRoom(structure.data, { roomID: issue.room_id })
    : resolveBuildingRoom(locationData, { globalId: spatial?.globalId, label: issue.room, building: issue.building_name });
  const floor = locationData?.floors.find(row => row.id === room?.floor_id);
  const reading = temperatures.data?.rooms.find(row => row.id === room?.id)?.reading;
  const focus = useMemo(() => ({
    ...(room ? roomModelFocus(room, floor) : {}),
    id: issue.id, point: issue.point, spaceID: issue.space_id, elementID: issue.element_id,
    ...(!room && !issue.room_id ? { location: issue.room } : {}), building: issue.building_name,
  }), [room, floor, issue.id, issue.point, issue.space_id, issue.element_id, issue.room, issue.room_id, issue.building_name]);
  const roomLabel = room && issue.room_id ? roomDisplayName(room) : spatial?.room || issue.room;

  async function update(fields) {
    setError('');
    setSaving(true);
    try { await request(path, { method: 'PATCH', body: { ...fields, revision: issue.revision } }); return true; }
    catch (failure) { setError(failure.message); }
    finally { await refresh(); setSaving(false); }
  }

  return <>
    <DialogTitle className="break-words pr-8 leading-tight">{issue.title}</DialogTitle>
    <DialogDescription>Meldung #{issue.id} · {issue.building_name}</DialogDescription>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="min-w-0 space-y-4">
        {issue.description && <p className="whitespace-pre-wrap break-words text-sm">{issue.description}</p>}
        <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div><dt className="text-muted-foreground">Gebäude</dt><dd className="break-words">{issue.building_name}</dd></div>
          <div><dt className="text-muted-foreground">Standort</dt><dd className="break-words">{issue.building_address || 'Nicht hinterlegt'}</dd></div>
          <div><dt className="text-muted-foreground">Geschoss</dt><dd>{spatial?.floor || floor?.name || 'Nicht hinterlegt'}</dd></div>
          <div><dt className="text-muted-foreground">Raum</dt><dd className="break-words">{roomLabel || (issue.space_id ? `IFC-Raum #${issue.space_id}` : 'Nicht hinterlegt')}</dd></div>
          <div><dt className="text-muted-foreground">Bauteil</dt><dd className="break-words">{spatial?.element || (issue.element_id ? `IFC-Element #${issue.element_id}` : 'Nicht hinterlegt')}</dd></div>
          <div><dt className="text-muted-foreground">Erfasst</dt><dd>{issue.reporter} · {formatDateTime(issue.created_at)}</dd></div>
          <div><dt className="text-muted-foreground">Quelle</dt><dd>{issueSource[issue.source] || 'Nicht hinterlegt'}</dd></div>
          <div><dt className="text-muted-foreground">Zuletzt geändert</dt><dd>{formatDateTime(issue.updated_at)}</dd></div>
        </dl>
        {room && <div className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Letzter Temperaturmesswert · </span><RoomReading reading={reading} /></p>
          <RoomDetailsLink buildingID={issue.building_id} room={room} />
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Status
            <select className="titan-select" aria-label="Status" disabled={saving || !issue.can_update_status} value={issue.status} onChange={e => update({ status: e.target.value })}>
              {Object.entries(issueStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Priorität
            <select className="titan-select" aria-label="Priorität" disabled={saving || !issue.can_edit || !issue.can_update_status} value={issue.priority || ''} onChange={e => update({ priority: e.target.value })}>
              <option disabled value="">Nicht festgelegt</option>
              {Object.entries(issuePriority).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {issue.can_edit && issue.can_update_status && <Button type="button" variant="outline" size="sm" onClick={() => setEditing(value => !value)}>{editing ? 'Bearbeitung abbrechen' : 'Angaben bearbeiten'}</Button>}
        {editing && <form className="space-y-3" onSubmit={async event => {
          event.preventDefault();
          const fields = Object.fromEntries(new FormData(event.currentTarget));
          if (!fields.source) delete fields.source;
          if (await update(fields)) setEditing(false);
        }}><IssueFields issue={issue} fixedRoom={issue.room_id ? roomLabel : undefined} /><Button type="submit" disabled={saving}>Angaben speichern</Button></form>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {issue.has_photo && <section><h4 className="font-semibold">Foto</h4>
          <IssuePhoto key={issue.revision} path={path} revision={issue.revision} />
        </section>}
        {issue.room_id && issue.can_edit && issue.can_update_status && !issue.has_photo && <AddIssuePhoto path={path} refresh={refresh} />}
        <History entries={issue.history} />
      </div>
      <section className="space-y-3 self-start rounded-xl border bg-card p-3 sm:p-4" aria-label="Gebäudeposition">
        <h4 className="font-semibold">Gebäudeposition</h4>
        {issue.room && (!issue.room_id || !room) && <p className="text-sm">Hinterlegter Ort · {issue.room}</p>}
        {!hasLocation && <p className="text-sm text-muted-foreground">Position nicht hinterlegt.</p>}
        <RoomModelPreview document={modelID ? { id: modelID, name: issue.building_name, campus } : null}
          focus={hasLocation && (!issue.room_id || room) ? focus : undefined} location={spatial} onLocation={setSpatial} />
        {modelID && <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          to={`/bim-viewer?building=${issue.building_id}&model=${modelID}`}>Modellbibliothek öffnen <ArrowUpRight className="h-4 w-4" /></Link>}
      </section>
    </div>
  </>;
}

function IssueDialog({ building, id, close, restoreFocus }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const path = issuePath(building, id);
  const key = ['building-issue', user.id, building, id];
  const query = useQuery({ queryKey: key, queryFn: () => request(path), gcTime: 0, retry: false, refetchInterval: 8000 });
  function refresh() {
    return Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ['building-issues', user.id] }),
      client.invalidateQueries({ queryKey: ['building-issue-pages', user.id] }),
    ]);
  }
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[94dvh] w-[min(96vw,74rem)] max-w-none overflow-y-auto rounded-xl text-left"
      onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
      {query.isError ? <><DialogTitle>Meldung nicht verfügbar</DialogTitle>
        <DialogDescription>{query.error.message}</DialogDescription></>
        : query.isPending ? <><DialogTitle>Meldung wird geladen …</DialogTitle><DialogDescription>Die Angaben werden vom Projektserver geladen.</DialogDescription></>
          : <IssueDetails key={query.data.id} issue={query.data} path={path} refresh={refresh} />}
    </DialogContent>
  </Dialog>;
}

export default function BuildingIssues() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const initialFilter = params.get('status') || '';
  const [filter, setFilter] = useState(Object.hasOwn(issueStatus, initialFilter) || initialFilter === 'active' ? initialFilter : 'all');
  const [limit, setLimit] = useState(25);
  const [adding, setAdding] = useState(false);
  const trigger = useRef(null);
  const heading = useRef(null);
  const scope = useBuildingScope();
  const authorizedBuildings = scope.readable('issues');
  const headers = buildingScopeHeaders(authorizedBuildings);
  const options = scope.building ? scope.readable('issues', { team: true }) : authorizedBuildings;
  const editBuildings = authorizedBuildings.filter(row => scope.can(row.id, 'issues', 'edit'));
  const query = useInfiniteQuery({
    queryKey: ['building-issue-pages', user.id, scope.team?.id, headers['X-D21-Buildings'], filter],
    queryFn: ({ pageParam }) => {
      const filters = new URLSearchParams();
      if (filter !== 'all') filters.set('status', filter);
      if (pageParam) filters.set('before', pageParam);
      return request(`/issues?${filters}`, { headers });
    },
    initialPageParam: null,
    getNextPageParam: page => page.next_before,
    refetchInterval: 8000,
    gcTime: 0,
  });
  const matching = query.data?.pages.flatMap(page => page.issues) || [];
  const id = params.get('issue');
  const building = params.get('building') || params.get('building_id') || (authorizedBuildings.length === 1 ? String(authorizedBuildings[0].id) : null);

  function showIssue(issue, replace) {
    const next = new URLSearchParams(params);
    next.set('building', issue.building_id);
    next.set('issue', issue.id);
    setParams(next, { replace, preventScrollReset: true });
  }

  function close() {
    const next = new URLSearchParams(params);
    next.delete('building'); next.delete('issue');
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return <section className="surface min-w-0 space-y-4 p-4 sm:p-5" aria-labelledby="building-issues">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="building-issues" tabIndex={-1} ref={heading} className="text-xl font-semibold">Mängelregister</h2>
      <div className="flex flex-wrap gap-2">
        {editBuildings.length > 0 && <Button onClick={() => setAdding(true)}>Mangel erfassen</Button>}
        <select className="titan-select w-auto max-w-full" aria-label="Gebäude filtern" value={scope.building?.id ?? ''}
          onChange={event => scope.choose(event.target.value ? 'building:' + event.target.value : 'all')}>
          <option value="">{scope.value.startsWith('group:') ? scope.label : 'Alle Gebäude'}</option>
          {options.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}
        </select>
        <select className="titan-select w-auto" aria-label="Meldungsstatus filtern" value={filter} onChange={event => { setFilter(event.target.value); setLimit(25); }}>
          <option value="all">Alle Status</option><option value="active">Aktive Vorgänge</option>{Object.entries(issueStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </div>
    {query.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{query.error.message}</p>
      <Button size="sm" variant="outline" onClick={() => query.refetch()}>Erneut abrufen</Button></div>
      : query.isPending ? <p role="status" className="text-sm text-muted-foreground">Meldungen werden geladen …</p>
        : matching.length ? <ul className="divide-y">
          {matching.slice(0, limit).map(issue => <li key={issue.id}>
            <button type="button" className="grid w-full gap-2 rounded-lg px-2 py-3 text-left hover:bg-muted focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_auto]"
              onClick={event => { trigger.current = event.currentTarget; showIssue(issue, false); }}>
              <span className="min-w-0"><span className="block break-words font-semibold">{issue.title}</span>
                <span className="block break-words text-sm text-muted-foreground">{[issue.building_name, issue.room, issueSource[issue.source], formatDateTime(issue.created_at)].filter(Boolean).join(' · ')}</span></span>
              <span className="flex flex-wrap items-center gap-x-2 text-sm"><span>{issueStatus[issue.status]}</span>
                <span className={priorityTone[issue.priority] || 'text-muted-foreground'}>{priorityLabel(issue.priority)}</span></span>
            </button>
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">Keine Gebäudemeldungen in dieser Auswahl.</p>}
    {(matching.length > limit || query.hasNextPage) && !query.isError && <Button variant="outline" disabled={query.isFetchingNextPage}
      onClick={async () => {
        if (matching.length <= limit) {
          const result = await query.fetchNextPage();
          if (result.isError) return;
        }
        setLimit(value => value + 25);
      }}>Mehr anzeigen</Button>}
    {authorizedBuildings.some(row => String(row.id) === building) && limitedId(id) && <IssueDialog key={`${building}/${id}`} building={building} id={id} close={close}
      restoreFocus={() => (trigger.current?.isConnected ? trigger.current : heading.current)?.focus()} />}
    {adding && <CreateIssue buildings={editBuildings} close={() => setAdding(false)} created={row => {
      setAdding(false);
      cache.invalidateQueries({ queryKey: ['building-issue-pages', user.id] });
      cache.invalidateQueries({ queryKey: ['building-issues', user.id] });
      showIssue(row, false);
    }} />}
  </section>;
}
