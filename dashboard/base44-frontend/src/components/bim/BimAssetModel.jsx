import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/Field';
import { formatDateShort } from '@/lib/dates';
import { assetURL, workURL, WORK_STATUS } from '@/lib/operations';
import IFCModelFrame from './IFCModelFrame';

const pickOptions = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'element', label: 'Bauteile' },
  { value: 'room', label: 'Räume' },
];

export default function BimAssetModel({ model, focusAsset, linkAsset }) {
  const building = model.buildingID;
  const client = useQueryClient();
  const navigate = useNavigate();
  const [pickMode, setPickMode] = useState(linkAsset ? 'element' : 'auto');
  const [selected, setSelected] = useState(null);
  const [missing, setMissing] = useState(false);
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const assetsKey = ['technical-assets', building];
  const assets = useQuery({ queryKey: assetsKey, queryFn: () => request(`/buildings/${building}/assets`), retry: false });
  const items = assets.data?.items ?? [];
  const editing = items.find(asset => String(asset.id) === linkAsset);
  const reference = items.find(asset => String(asset.id) === focusAsset)?.ifc_reference;
  const focus = reference?.model_id === String(model.id) ? reference : null;
  const linked = selected ? items.filter(asset => asset.ifc_reference?.model_id === String(model.id) &&
    asset.ifc_reference.global_id === selected.global_id) : [];
  const work = useQuery({ queryKey: ['maintenance', building], queryFn: () => request(`/buildings/${building}/maintenance`),
    enabled: linked.length > 0, retry: false });

  const receive = useCallback(event => {
    if (event.type === 'd21-bim-object-selection') {
      setSelected(event.object ?? null);
      setFailure('');
    } else if (event.type === 'd21-bim-object-focus-result') {
      setMissing(!event.found);
    }
  }, []);

  async function save() {
    if (!selected || !editing || saving) return;
    setFailure('');
    setSaving(true);
    try {
      await request(`/buildings/${building}/assets/${editing.id}/ifc-reference`, {
        method: 'PUT', body: { revision: editing.revision, reference: { ...selected, model_id: String(model.id) } },
      });
      await client.invalidateQueries({ queryKey: assetsKey });
      navigate(assetURL(building, editing.id));
    } catch (error) { setFailure(error.message); }
    finally { setSaving(false); }
  }

  return <>
    <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3 sm:px-5">
      <SelectField label="Objektauswahl" aria-label="Objektauswahl" options={pickOptions} value={pickMode} onChange={event => setPickMode(event.target.value)} />
      {linkAsset && <p className="pb-2 text-sm">{editing ? `Wähle ein IFC-Objekt für „${editing.name}“.` : 'IFC-Objekt zuordnen'}</p>}
      {selected && <a className="pb-2 text-sm text-primary underline lg:hidden" href="#bim-auswahl">Auswahl anzeigen</a>}
    </div>
    {(missing || (focusAsset && assets.isSuccess && !focus)) && <p role="status" className="px-4 py-3 text-sm text-warning">
      Das verknüpfte IFC-Objekt ist in diesem Modell nicht verfügbar.
    </p>}
    <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0"><IFCModelFrame document={model} presentation="bim" objectFocus={focus} objectPickMode={pickMode} onObjectEvent={receive} /></div>
      <aside id="bim-auswahl" aria-label="Anlagen zur Modellauswahl" className="space-y-3 border-t p-4 lg:border-l lg:border-t-0">
        <h3 className="font-semibold">Anlagen zur Auswahl</h3>
        {assets.isError && <p role="alert" className="text-sm text-destructive">{assets.error.message}</p>}
        {linkAsset && !assets.isPending && (!editing || !assets.data?.can_edit) && <p role="alert" className="text-sm text-destructive">Diese Anlage kann hier nicht verknüpft werden.</p>}
        <p className="break-words text-sm" aria-live="polite">{selected ? selected.label : 'Wähle ein Bauteil oder einen Raum im Modell.'}</p>
        {editing && assets.data?.can_edit && <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={!selected || saving}>Verknüpfung speichern</Button>
          <Button size="sm" variant="ghost" asChild><Link to={assetURL(building, editing.id)}>Abbrechen</Link></Button>
        </div>}
        {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
        {selected && assets.isSuccess && !linked.length && <p role="status" className="text-sm text-muted-foreground">Keine Anlage mit diesem Objekt verknüpft.</p>}
        {linked.length > 0 && <ul className="divide-y border-t">{linked.map(asset => {
          const tasks = (work.data?.items ?? []).filter(task => task.asset_id === asset.id);
          return <li key={asset.id} className="space-y-2 py-3 text-sm">
            <Link className="break-words font-semibold text-primary underline" to={assetURL(building, asset.id)}>{asset.name}</Link>
            <h4 className="font-medium">Zugehörige Wartungen</h4>
            {work.isPending ? <p role="status">Wartungen werden geladen …</p>
              : work.isError ? <p role="alert" className="text-destructive">{work.error.message}</p>
                : tasks.length ? <ul className="space-y-2">{tasks.map(task => <li key={task.id}>
                  <Link className="break-words text-primary underline" to={workURL(building, asset.id, task.id)}>{task.title}</Link>
                  <p className="text-muted-foreground">{formatDateShort(task.next_due)} · {WORK_STATUS[task.work_status]}</p>
                </li>)}</ul> : <p className="text-muted-foreground">Noch keine Wartungen zugeordnet.</p>}
          </li>;
        })}</ul>}
      </aside>
    </div>
  </>;
}
