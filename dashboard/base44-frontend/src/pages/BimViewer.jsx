import { useEffect, useState } from 'react';
import { Boxes, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import IFCModelFrame from '@/components/bim/IFCModelFrame';

const EXAMPLE = { id: 'example', name: 'Beispielcampus', example: true };
const CAMPUS = { id: 'campus-d21', name: 'H_DA_D21_Final.ifc', campus: true };

export default function BimViewer() {
  const [models, setModels] = useState([]);
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('model') || 'campus-d21');
  const [campus, setCampus] = useState({ loading: true, available: false, message: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    setCampus(current => ({ ...current, loading: true }));
    request('/campus/d21').then(metadata => {
      if (active) setCampus({loading:false,available:true,message:'',metadata});
    }).catch(error => {
      if (active) setCampus({loading:false,available:false,message:error.message});
    });
    (async () => {
      const buildings = await request('/buildings');
      const results = await Promise.allSettled(buildings.map(async building => {
        const files = await request(`/buildings/${building.id}/documents`);
        return files.filter(file => file.mime_type === 'application/x-step').map(file => ({ ...file, buildingName: building.name, buildingID: building.id }));
      }));
      if (!active) return;
      const rows = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const failed = results.filter(result => result.status === 'rejected').length;
      const failedBuildings = new Set(results.flatMap((result, index) => result.status === 'rejected' ? [buildings[index].id] : []));
      setModels(previous => [...rows, ...previous.filter(item => failedBuildings.has(item.buildingID))]);
      setSelected(current => ['example','campus-d21'].includes(current) || failed || rows.some(row => String(row.id) === current) ? current : 'campus-d21');
      if (failed) setError(`${failed} Gebäudemappe(n) konnten nicht geladen werden. Bitte erneut aktualisieren.`);
    })().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const model = selected === 'campus-d21' ? {...CAMPUS,mapOnly:!campus.available} : selected === 'example' ? EXAMPLE : models.find(item => String(item.id) === selected);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm leading-relaxed text-muted-foreground">Gebäude erkunden, Geschosse freilegen und Bauteile auswählen.</p>
      <Button variant="outline" size="sm" asChild><Link to="/gebaeude">Eigene IFC-Modelle</Link></Button>
    </div>
    <section className="surface overflow-hidden" aria-label="Modellarbeitsfläche">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <span className="hidden h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary sm:grid"><Boxes className="h-4 w-4" /></span>
          <label htmlFor="ifc-model" className="sr-only">Modell auswählen</label>
          <select id="ifc-model" className="min-h-10 min-w-[160px] max-w-full flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-0 sm:max-w-sm" value={selected} onChange={event => setSelected(event.target.value)}>
            <option value="campus-d21">D21 · h_da-Campus</option>
            <option value="example">Beispielcampus · Stilvorschau</option>
            {models.map(item => <option key={item.id} value={item.id}>{item.buildingName} · {item.name}</option>)}
            {!model && selected !== 'example' && <option value={selected}>{loading ? 'Modell wird geladen …' : 'Modell momentan nicht verfügbar'}</option>}
          </select>
          {selected === 'example' && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-800">Beispiel · kein D21-Modell</span>}
          {selected === 'campus-d21' && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">{campus.available ? 'D21-Originalmodell' : 'Campuskarte'}</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRevision(n => n + 1)} disabled={loading} aria-label="Modellliste aktualisieren"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Aktualisieren</span></Button>
      </div>
      {error && <p role="alert" className="border-b border-border bg-red-50 px-4 py-3 text-xs text-destructive">{error}</p>}
      {selected === 'campus-d21' && !campus.loading && campus.message && <p role="status" className="border-b border-border px-4 py-3 text-xs text-muted-foreground">{campus.message} Die Campuskarte bleibt verfügbar.</p>}
      {model ? <IFCModelFrame key={`${model.id}-${Boolean(model.mapOnly)}`} document={model} /> : <p role="status" className="p-6 text-sm text-muted-foreground">{loading ? 'Modellliste wird geladen …' : 'Bitte die Modellliste erneut laden oder ein anderes Modell auswählen.'}</p>}
    </section>
    <p className="text-xs leading-relaxed text-muted-foreground">
      {selected === 'campus-d21' ? 'Campusstandorte nach h_da, Kartengrundlage OpenStreetMap. Das originale D21-IFC wird geschützt vom Projektserver geladen. Ansichtsänderungen bleiben lokal; die Lage ist eine Campuszuordnung und keine vermessungstechnische Einpassung.' : selected === 'example' ? 'Die Stilvorschau zeigt ein frei gestaltetes Beispielgebäude mit einer erfundenen Umgebung. Für das D21-Gebäude die Campusansicht auswählen.' : 'Geschosse und Geometrie stammen aus der ausgewählten IFC-Datei. Geschossansicht und Perspektive bleiben lokal; bestätigte Bauteiländerungen werden wie bisher mit dem Projektserver abgeglichen.'}
    </p>
  </div>;
}
