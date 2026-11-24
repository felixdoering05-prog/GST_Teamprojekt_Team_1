import { useBuildingScope } from '@/hooks/useBuildingScope';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { SelectField, TextAreaField, TextField } from '@/components/Field';
import PageHeader from '@/components/PageHeader';
import { request } from '@/api/base44Client';
import { formatDateShort, formatDateTime } from '@/lib/dates';

const ASSET_STATUS = { in_betrieb: 'In Betrieb', wartung: 'Wartung', stoerung: 'Störung' };
const WORK_STATUS = { planned: 'Geplant', in_progress: 'In Bearbeitung', completed: 'Erledigt' };
const DUE_STATUS = { ohne_termin: 'Ohne Termin', ueberfaellig: 'Überfällig', bald: 'Bald fällig', ok: 'Terminiert' };
const PRIORITY = { low: 'Niedrig', normal: 'Mittel', high: 'Hoch' };
const CATEGORIES = { heizung: 'Heizung', lueftung: 'Lüftung', wasser: 'Wasser', elektro: 'Elektro', dach: 'Dach', fenster: 'Fenster', brandschutz: 'Brandschutz', aufzug: 'Aufzug', garten: 'Garten', sonstiges: 'Sonstiges' };
const options = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const field = (name, label, defaults) => ({ name, label, 'aria-label': label, defaultValue: defaults[name] ?? '' });
const date = (value) => value?.slice(0, 10) || '';
const displayDate = (value) => formatDateShort(date(value));
const assetURL = (building, id) => '/betrieb/technische-anlagen?building=' + building + (id ? '&asset=' + id : '');
const workURL = (building, id) => '/betrieb/wartungen?building=' + building + (id ? '&asset=' + id : '');

function RecordDialog({ title, description, submit, close, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try { await submit(fields); close(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {children}
        {error && <p role="alert" className="text-destructive sm:col-span-2">{error}</p>}
        <DialogFooter className="sm:col-span-2"><Button disabled={busy} type="submit">Speichern</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function AssetEditor({ row, building, refresh, close }) {
  const current = { status: 'in_betrieb', ...row, planned_maintenance: date(row.planned_maintenance) };
  async function submit(form) {
    await request('/buildings/' + building + '/assets' + (row.id ? '/' + row.id : ''), {
      method: row.id ? 'PATCH' : 'POST',
      body: { ...form, data_quality: form.data_quality === '' ? null : Number(form.data_quality), planned_maintenance: form.planned_maintenance || null, ...(row.id ? { revision: row.revision } : {}) },
    });
    await refresh();
  }
  return <RecordDialog title={row.id ? 'Anlage bearbeiten' : 'Technische Anlage anlegen'} description="Stammdaten der Anlage im ausgewählten Gebäude." submit={submit} close={close}>
    <TextField {...field('name', 'Anlagenname', current)} required maxLength={120} />
    <TextField {...field('system', 'System', current)} required maxLength={100} />
    <TextField {...field('location', 'Standort', current)} required maxLength={120} />
    <SelectField {...field('status', 'Anlagenstatus', current)} options={options(ASSET_STATUS)} />
    <TextField {...field('planned_maintenance', 'Vorgesehene Wartung', current)} type="date" />
    <TextField {...field('data_quality', 'Datenqualität in %', current)} type="number" min="0" max="100" />
    <TextAreaField {...field('notes', 'Notizen', current)} maxLength={2000} className="sm:col-span-2" />
  </RecordDialog>;
}

function MaintenanceEditor({ row, assets, building, refresh, close }) {
  const current = { category: 'sonstiges', priority: 'normal', ...row };
  async function submit(form) {
    const body = { ...form };
    for (const key of ['asset_id', 'interval_months']) body[key] = form[key] ? Number(form[key]) : null;
    for (const key of ['next_due', 'last_done', 'warranty_until']) body[key] = form[key] || null;
    if (!row.id && !body.next_due) delete body.next_due;
    await request(row.id ? '/maintenance/' + row.id : '/buildings/' + building + '/maintenance', {
      method: row.id ? 'PATCH' : 'POST', body: { ...body, ...(row.id ? { revision: row.revision } : {}) },
    });
    await refresh();
  }
  return <RecordDialog title={row.id ? 'Wartung bearbeiten' : 'Wartung erstellen'} description="Planung und Zuordnung zum ausgewählten Gebäude." submit={submit} close={close}>
    <TextField {...field('title', 'Aufgabe', current)} required maxLength={120} className="sm:col-span-2" />
    <SelectField {...field('asset_id', 'Anlage', current)} options={[{ value: '', label: 'Ohne Anlage' }, ...assets.map(asset => ({ value: String(asset.id), label: asset.name }))]} />
    <TextField {...field('next_due', 'Fällig am', current)} type="date" />
    <SelectField {...field('priority', 'Priorität', current)} options={options(PRIORITY)} />
    <SelectField {...field('category', 'Kategorie', current)} options={options(CATEGORIES)} />
    <TextField {...field('last_done', 'Zuletzt erledigt', current)} type="date" />
    <TextField {...field('interval_months', 'Intervall in Monaten', current)} type="number" min="1" max="240" />
    <TextField {...field('warranty_until', 'Garantie bis', current)} type="date" />
    <TextAreaField {...field('notes', 'Notizen', current)} maxLength={2000} className="sm:col-span-2" />
  </RecordDialog>;
}

function MaintenanceHistory({ building, item }) {
  const history = useQuery({ queryKey: ['maintenance-history', building, item.id], queryFn: () => request('/buildings/' + building + '/maintenance/' + item.id + '/history') });
  if (history.isPending) return <p role="status">Historie wird geladen …</p>;
  if (history.isError) return <p role="alert">{history.error.message}</p>;
  return <section className="space-y-2 text-sm">
    <h4 className="font-semibold">Wartungshistorie</h4>
    {history.data.length ? <ul className="space-y-1">{history.data.map(row =>
      <li key={row.revision}>{row.action === 'started' ? 'Gestartet' : 'Erledigt'} · {row.performed_on ? displayDate(row.performed_on) : formatDateTime(row.created_at)}{row.actor && ' · ' + row.actor}</li>
    )}</ul> : <p className="text-muted-foreground">{item.last_done ? 'Letzte Erledigung ' + displayDate(item.last_done) : 'Noch keine Einträge.'}</p>}
  </section>;
}

function OperationsContent({ building, mode, selectedAsset, initialTask }) {
  const client = useQueryClient();
  const [editor, setEditor] = useState(null);
  const [openedTask, setOpenedTask] = useState(initialTask ? Number(initialTask) : null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const assetsQuery = useQuery({ queryKey: ['technical-assets', building], queryFn: () => request('/buildings/' + building + '/assets'), retry: false });
  const workQuery = useQuery({ queryKey: ['maintenance', building], queryFn: () => request('/buildings/' + building + '/maintenance'), retry: false });
  const assets = assetsQuery.data?.items || [];
  const tasks = workQuery.data?.items || [];
  const asset = assets.find(row => String(row.id) === selectedAsset);
  const isAssets = mode === 'assets';
  const canEdit = isAssets ? assetsQuery.data?.can_edit : workQuery.data?.can_edit;
  const refresh = () => Promise.all([['technical-assets', building], ['maintenance', building], ['maintenance-history', building]]
    .map(queryKey => client.invalidateQueries({ queryKey })));
  async function change(item, operation) {
    setError('');
    setAction(operation);
    try {
      await request('/maintenance/' + item.id + '/' + operation, { method: 'POST', body: { revision: item.revision } });
      await refresh();
    } catch (failure) { setError(failure.message); }
    finally { setAction(''); }
  }
  if (assetsQuery.isPending || workQuery.isPending) return <p role="status">Betriebsdaten werden geladen …</p>;
  if (assetsQuery.isError || workQuery.isError) return <p role="alert" className="text-destructive">{assetsQuery.error?.message || workQuery.error?.message}</p>;

  const term = search.trim().toLocaleLowerCase('de');
  const matches = (values) => !term || values.join(' ').toLocaleLowerCase('de').includes(term);
  const assetRows = assets.filter(row => (!status || status === row.status) && matches([row.name, row.system, row.location]));
  const taskRows = tasks.filter(row => (!asset || row.asset_id === asset.id) && (!status || status === row.work_status) &&
    matches([row.title, assets.find(item => item.id === row.asset_id)?.name]));
  const linked = asset ? tasks.filter(row => row.asset_id === asset.id) : [];
  return <div className="space-y-5">
    {isAssets && asset ? <section className="surface space-y-4 p-5">
      <Link className="text-primary underline" to={assetURL(building)}>Alle Anlagen</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-xl font-semibold">{asset.name}</h3>
        {canEdit && <Button variant="outline" onClick={() => setEditor(asset)}>Anlage bearbeiten</Button>}
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[['System', asset.system], ['Standort', asset.location], ['Status', ASSET_STATUS[asset.status]], ['Nächste Wartung', displayDate(asset.next_maintenance)], ['Datenqualität', asset.data_quality == null ? '–' : asset.data_quality + ' %']]
          .map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {asset.notes && <p className="whitespace-pre-wrap">{asset.notes}</p>}
      <h4 className="font-semibold">Zugehörige Wartungen</h4>
      {linked.length ? <ul className="divide-y">{linked.map(row => <li key={row.id} className="py-2">
        <Link className="font-medium text-primary underline" to={workURL(building, asset.id) + '&task=' + row.id}>{row.title}</Link>
        <p className="text-sm text-muted-foreground">{displayDate(row.next_due)} · {WORK_STATUS[row.work_status]}</p>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">Noch keine Wartungen zugeordnet.</p>}
      <Button variant="outline" asChild><Link to={workURL(building, asset.id)}>Wartungen der Anlage öffnen</Link></Button>
    </section> : <section className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="Suche" aria-label={isAssets ? 'Anlagen suchen' : 'Wartungen suchen'} value={search} onChange={event => setSearch(event.target.value)} />
        <SelectField label="Status" aria-label="Status filtern" value={status} options={[{ value: '', label: 'Alle Status' }, ...options(isAssets ? ASSET_STATUS : WORK_STATUS)]} onChange={event => setStatus(event.target.value)} />
        {canEdit && <Button className="sm:ml-auto" onClick={() => setEditor(isAssets ? {} : { asset_id: asset?.id })}>{isAssets ? 'Anlage anlegen' : 'Wartung erstellen'}</Button>}
      </div>
      {!isAssets && asset && <p>Wartungen für <Link className="font-medium text-primary underline" to={assetURL(building, asset.id)}>{asset.name}</Link> · <Link className="text-primary underline" to={workURL(building)}>Alle Wartungen</Link></p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {isAssets ? (
        assetRows.length ? <ul className="divide-y">{assetRows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><Link className="font-semibold text-primary underline" to={assetURL(building, row.id)}>{row.name}</Link><p className="text-sm text-muted-foreground">{row.system} · {row.location}</p></div>
          <p className="text-sm">{ASSET_STATUS[row.status]} · Nächste Wartung {displayDate(row.next_maintenance)}</p>
        </li>)}</ul> : <p>Keine Anlagen in dieser Auswahl.</p>
      ) : (
        taskRows.length ? <ul className="divide-y">{taskRows.map(row => <li key={row.id} className="space-y-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><button className="font-semibold text-primary underline" type="button" onClick={() => setOpenedTask(openedTask === row.id ? null : row.id)}>{row.title}</button>
            <p className="text-sm text-muted-foreground">{assets.find(item => item.id === row.asset_id)?.name || 'Ohne Anlage'} · Fällig {displayDate(row.next_due)} · {PRIORITY[row.priority]}</p></div>
            <span className="text-sm font-medium">{WORK_STATUS[row.work_status]}{row.work_status !== 'completed' && ' · ' + DUE_STATUS[row.status]}</span>
          </div>
          {openedTask === row.id && <div className="space-y-3 rounded-lg border p-3">
            {row.notes && <p className="text-sm whitespace-pre-wrap">{row.notes}</p>}
            <MaintenanceHistory building={building} item={row} />
            {canEdit && <div className="flex flex-wrap gap-2">
              {row.can_edit && <Button size="sm" variant="outline" onClick={() => setEditor(row)}>Wartung bearbeiten</Button>}
              {row.work_status === 'planned' && <Button size="sm" variant="outline" disabled={!!action} onClick={() => change(row, 'start')}>Starten</Button>}
              {row.work_status !== 'completed' && <Button size="sm" disabled={!!action} onClick={() => change(row, 'done')}>Erledigen</Button>}
            </div>}
          </div>}
        </li>)}</ul> : <p>Keine Wartungen in dieser Auswahl.</p>
      )}
    </section>}
    {editor && (isAssets ?
      <AssetEditor row={editor} building={building} refresh={refresh} close={() => setEditor(null)} /> :
      <MaintenanceEditor row={editor} building={building} assets={assets} refresh={refresh} close={() => setEditor(null)} />)}
  </div>;
}

export default function Operations({ mode }) {
  const scope = useBuildingScope();
  const [params] = useSearchParams();
  const buildings = scope.readable('maintenance');
  return <div className="space-y-5">
    <PageHeader title={mode === 'assets' ? 'Technische Anlagen' : 'Wartungen'} />
    {buildings.map(building => {
      const detail = params.get('building') === String(building.id);
      const asset = detail ? params.get('asset') : null;
      const task = detail ? params.get('task') : null;
      return <section key={building.id} className="space-y-3">
        {buildings.length > 1 && <h2 className="font-semibold">{building.name}</h2>}
        <OperationsContent key={[building.id, mode, asset, task].join('/')} building={building.id} mode={mode} selectedAsset={asset} initialTask={task} />
      </section>;
    })}
  </div>;
}
