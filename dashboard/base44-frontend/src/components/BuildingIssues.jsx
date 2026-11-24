import { useBuildingScope, buildingScopeHeaders } from '@/hooks/useBuildingScope';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { request } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { formatDateTime } from '@/lib/dates';
import { issuePath, issuePriority, issueStatus, issueSource, priorityLabel } from '@/lib/buildingIssues';
import { SelectField, TextAreaField, TextField } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import IFCModelFrame from '@/components/bim/IFCModelFrame';

const limitedId = value => /^[1-9]\d{0,9}$/.test(value || '') && Number(value) <= 2147483647;
const priorityTone = { urgent: 'text-destructive', high: 'text-warning', normal: 'text-primary', low: 'text-muted-foreground' };
const changeName = { status: 'Status', priority: 'Priorität', title: 'Titel', description: 'Beschreibung', room: 'Ort', source: 'Quelle' };
const options = entries => Object.entries(entries).map(([value, label]) => ({ value, label }));

function IssueFields({ issue = {}, includePriority = false }) {
  return <>
    <TextField label="Titel" aria-label="Titel" name="title" maxLength={120} defaultValue={issue.title || ''} required />
    <TextField label="Ort / Raum" aria-label="Ort / Raum" name="room" maxLength={100} defaultValue={issue.room || ''} />
    <SelectField label="Quelle" aria-label="Quelle" name="source" defaultValue={issue.source || (issue.id ? '' : 'operator')}
      options={[...(issue.id ? [{ value: '', label: 'Nicht hinterlegt' }] : []), ...options(issueSource)]} />
    {includePriority && <SelectField label="Priorität" aria-label="Priorität" name="priority" defaultValue="normal" options={options(issuePriority)} />}
    <TextAreaField label="Beschreibung" aria-label="Beschreibung" name="description" maxLength={2000} defaultValue={issue.description || ''} />
  </>;
}

function CreateIssue({ buildings, activeBuilding, close, created }) {
  const [requestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const { building, ...fields } = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      const row = await request('/buildings/' + building + '/issues', { method: 'POST', body: { ...fields, request_key: requestKey, reuse_existing: true } });
      created(row);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogTitle>Mangel erfassen</DialogTitle><DialogDescription>Der Vorgang erscheint auch unter Meldungen.</DialogDescription>
      <form onSubmit={submit} className="space-y-3">
        <SelectField label="Gebäude" aria-label="Gebäude" name="building" defaultValue={String(activeBuilding.id)}
          options={buildings.map(row => ({ value: String(row.id), label: row.name }))} />
        <IssueFields includePriority />
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button disabled={busy} type="submit">Mangel speichern</Button>
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
  const [previewRequested, setPreviewRequested] = useState(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const modelID = issue.location_model ?? issue.document_id;
  const campus = modelID === 'campus-d21';
  const hasLocation = Boolean(issue.point || issue.space_id || issue.element_id || issue.room?.trim());
  const focus = useMemo(() => ({
    id: issue.id, point: issue.point, spaceID: issue.space_id, elementID: issue.element_id,
    location: issue.room, building: issue.building_name,
  }), [issue.id, issue.point, issue.space_id, issue.element_id, issue.room, issue.building_name]);

  let locationMessage = '';
  if (!hasLocation) locationMessage = 'Position nicht hinterlegt.';
  else if (!modelID) locationMessage = 'Für diese Ortsangabe ist kein IFC-Modell hinterlegt.';
  else if (spatial && !spatial.point) {
    if (spatial.roomHighlighted) locationMessage = 'Der Meldungsraum ist hervorgehoben. Ein genauer Punkt ist nicht verfügbar.';
    else if (spatial.floor) locationMessage = 'Das Geschoss wird angezeigt. Der Meldungsraum lässt sich im Modell nicht eindeutig darstellen.';
    else if (spatial.room) locationMessage = 'Für diesen Raum enthält das Modell keine darstellbare Geometrie.';
    else if (issue.point) locationMessage = 'Der gespeicherte Punkt lässt sich in diesem Modell nicht darstellen.';
    else if (!spatial.element) locationMessage = 'Die Ortsangabe lässt sich keinem Raum oder Geschoss eindeutig zuordnen.';
  }

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
          <div><dt className="text-muted-foreground">Geschoss</dt><dd>{spatial?.floor || 'Nicht hinterlegt'}</dd></div>
          <div><dt className="text-muted-foreground">Raum</dt><dd className="break-words">{spatial?.room || issue.room || (issue.space_id ? `IFC-Raum #${issue.space_id}` : 'Nicht hinterlegt')}</dd></div>
          <div><dt className="text-muted-foreground">Bauteil</dt><dd className="break-words">{spatial?.element || (issue.element_id ? `IFC-Element #${issue.element_id}` : 'Nicht hinterlegt')}</dd></div>
          <div><dt className="text-muted-foreground">Erfasst</dt><dd>{issue.reporter} · {formatDateTime(issue.created_at)}</dd></div>
          <div><dt className="text-muted-foreground">Quelle</dt><dd>{issueSource[issue.source] || 'Nicht hinterlegt'}</dd></div>
          <div><dt className="text-muted-foreground">Zuletzt geändert</dt><dd>{formatDateTime(issue.updated_at)}</dd></div>
        </dl>
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
        }}><IssueFields issue={issue} /><Button type="submit" disabled={saving}>Angaben speichern</Button></form>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {issue.has_photo && <section><h4 className="font-semibold">Foto</h4>
          <IssuePhoto key={issue.revision} path={path} revision={issue.revision} />
        </section>}
        <History entries={issue.history} />
      </div>
      <section className="space-y-3 self-start rounded-xl border bg-card p-3 sm:p-4" aria-label="Gebäudeposition">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">Gebäudeposition</h4>
          {modelID && <Button variant="outline" size="sm" onClick={() => { setPreviewRequested(true); setFocusVersion(value => value + 1); }}>
            <MapPin className="h-4 w-4" /> Im Gebäude anzeigen
          </Button>}
        </div>
        {locationMessage && <p role="status" className="text-sm text-muted-foreground">{locationMessage}</p>}
        {modelID && (hasLocation || previewRequested) && <IFCModelFrame key={modelID}
          document={{ id: modelID, name: issue.building_name, campus }} presentation="bim"
          issueFocus={hasLocation ? focus : undefined} focusVersion={focusVersion} onIssueLocation={setSpatial} readOnly />}
        {modelID && <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          to={`/bim-viewer?model=${modelID}`}>Modellbibliothek öffnen <ArrowUpRight className="h-4 w-4" /></Link>}
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

export default function BuildingIssues({ editable = false }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(25);
  const [adding, setAdding] = useState(false);
  const trigger = useRef(null);
  const heading = useRef(null);
  const scope = useBuildingScope();
  const authorizedBuildings = scope.readable('issues');
  const headers = buildingScopeHeaders(authorizedBuildings);
  const selectedBuilding = authorizedBuildings.length === 1 ? String(authorizedBuildings[0].id) : authorizedBuildings.some(building => String(building.id) === buildingFilter) ? buildingFilter : 'all';
  const activeBuilding = authorizedBuildings.find(row => String(row.id) === selectedBuilding) ||
    authorizedBuildings.find(row => String(row.id) === localStorage.getItem('d21-selected-building')) || authorizedBuildings[0];
  const access = useQuery({ queryKey: ['building-team-access', String(activeBuilding?.id)], enabled: editable && !!activeBuilding,
    queryFn: () => request('/buildings/' + activeBuilding.id + '/team-access'), retry: false });
  const mayCreate = access.data?.is_owner || access.data?.actor_role?.permissions?.issues === 'edit';
  const query = useInfiniteQuery({
    queryKey: ['building-issue-pages', user.id, headers['X-D21-Buildings'], selectedBuilding, filter],
    queryFn: ({ pageParam }) => {
      const filters = new URLSearchParams();
      if (selectedBuilding !== 'all') filters.set('building_id', selectedBuilding);
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
  const building = params.get('building');
  const id = params.get('issue');

  function close() {
    const next = new URLSearchParams(params);
    next.delete('building'); next.delete('issue');
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return <section className="surface min-w-0 space-y-4 p-4 sm:p-5" aria-labelledby="building-issues">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="building-issues" tabIndex={-1} ref={heading} className="text-xl font-semibold">{editable ? 'Mängelregister' : 'Gebäudemeldungen'}</h2>
      <div className="flex flex-wrap gap-2">
        {editable && mayCreate && <Button onClick={() => setAdding(true)}>Mangel erfassen</Button>}
        <select className="titan-select w-auto max-w-full" aria-label="Gebäude filtern" value={selectedBuilding}
          onChange={event => { setBuildingFilter(event.target.value); setLimit(25); }}>
          {authorizedBuildings.length !== 1 && <option value="all">Alle Gebäude</option>}
          {authorizedBuildings.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}
        </select>
        <select className="titan-select w-auto" aria-label="Meldungsstatus filtern" value={filter} onChange={event => { setFilter(event.target.value); setLimit(25); }}>
          <option value="all">Alle Status</option><option value="active">Aktive Vorgänge</option><option value="assigned">Zugewiesen</option><option value="in_progress">In Arbeit</option><option value="done">Erledigt</option>
        </select>
      </div>
    </div>
    {query.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{query.error.message}</p>
      <Button size="sm" variant="outline" onClick={() => query.refetch()}>Erneut abrufen</Button></div>
      : query.isPending ? <p role="status" className="text-sm text-muted-foreground">Meldungen werden geladen …</p>
        : matching.length ? <ul className="divide-y">
          {matching.slice(0, limit).map(issue => <li key={issue.id}>
            <button type="button" className="grid w-full gap-2 rounded-lg px-2 py-3 text-left hover:bg-muted focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_auto]"
              onClick={event => { trigger.current = event.currentTarget; setParams({ building: issue.building_id, issue: issue.id }, { replace: true, preventScrollReset: true }); }}>
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
    {adding && activeBuilding && <CreateIssue buildings={authorizedBuildings} activeBuilding={activeBuilding} close={() => setAdding(false)} created={row => {
      setAdding(false);
      cache.invalidateQueries({ queryKey: ['building-issue-pages', user.id] });
      cache.invalidateQueries({ queryKey: ['building-issues', user.id] });
      setParams({ building: row.building_id, issue: row.id });
    }} />}
  </section>;
}
