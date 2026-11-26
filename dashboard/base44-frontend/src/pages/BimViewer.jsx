import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import IFCModelFrame from '@/components/bim/IFCModelFrame';
import BimAssetModel from '@/components/bim/BimAssetModel';
import BuildingSectionSelect from '@/components/rooms/BuildingSectionSelect';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { useBuildingScope } from '@/hooks/useBuildingScope';
import { useBuildingModels } from '@/hooks/useBuildingModels';

const EXAMPLE = { id: 'example', name: 'Beispielgebäude', example: true };

export default function BimViewer() {
  const scope = useBuildingScope();
  const selection = useBuildingSelection('bim');
  const [params, setParams] = useSearchParams();
  const { models, loading, error, refresh } = useBuildingModels(scope.readable('bim'));
  const demo = scope.value === 'all' && !selection.building ? [EXAMPLE] : [];
  const choices = [...models, ...demo];
  const requested = params.get('model');
  const model = choices.find(item => String(item.id) === requested) || (!requested && selection.building ? models[0] : null);

  function chooseModel(id) {
    const next = choices.find(item => String(item.id) === id);
    if (!next) return;
    if (next.buildingID && String(next.buildingID) !== String(scope.building?.id)) {
      scope.chooseBuilding(next.buildingID, { search: new URLSearchParams({ model: id }) });
    } else {
      setParams(current => {
        const search = new URLSearchParams(current);
        search.set('model', id);
        search.delete('asset');
        return search;
      }, { replace: true });
    }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="font-heading text-3xl font-medium tracking-tight text-foreground sm:text-4xl">BIM-Viewer</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{scope.label} · Gebäudemodell und Geschossschnitte</p>
      </div>
      <Button variant="outline" size="sm" asChild><Link to="/gebaeude">Modelle verwalten<ArrowUpRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
    </div>
    <BuildingSectionSelect selection={selection} />
    <section className="glass-card surface overflow-hidden" aria-label="Modellarbeitsfläche">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <label htmlFor="ifc-model" className="text-xs font-semibold text-muted-foreground">Modell</label>
          <select id="ifc-model" className="min-h-11 min-w-0 max-w-full flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm sm:max-w-sm"
            value={model?.id ?? ''} onChange={event => chooseModel(event.target.value)} disabled={!choices.length}>
            {!model && <option value="">{loading ? 'Modelle werden geladen …' : 'Modell auswählen …'}</option>}
            {choices.map(item => <option key={item.id} value={item.id}>{item.buildingName ? item.buildingName + ' · ' : ''}{item.name}</option>)}
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} aria-label="Modellliste aktualisieren"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></Button>
      </div>
      {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error.message}</p>}
      {model ? model.buildingID && scope.can(model.buildingID, 'maintenance')
        ? <BimAssetModel key={[model.id, params.get('asset'), params.get('linkAsset')].join('/')} model={model}
          focusAsset={params.get('asset')} linkAsset={params.get('linkAsset')} />
        : <IFCModelFrame key={model.id} document={model} presentation="bim" />
        : <p role="status" className="p-6 text-sm text-muted-foreground">{loading ? 'Modellliste wird geladen …'
          : selection.building && !models.length && !error ? 'Für dieses Gebäude ist kein Modell hinterlegt.'
            : requested ? 'Dieses Modell ist in der aktuellen Gebäudeauswahl nicht verfügbar.' : 'Wähle ein Gebäude oder ein Modell aus.'}</p>}
    </section>
  </div>;
}
