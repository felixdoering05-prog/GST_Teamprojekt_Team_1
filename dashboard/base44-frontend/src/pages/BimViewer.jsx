import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
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
        return files.filter(file => file.mime_type === 'application/x-step').map(file => ({
          ...file, buildingName: building.name, buildingID: building.id, canEditTerrain: building.is_owner === true,
          latitude: building.latitude, longitude: building.longitude, model_heading_degrees: building.model_heading_degrees ?? 0,
          map_provider_consent: building.map_provider_consent === true,
        }));
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
  const loadingCampus = selected === 'campus-d21' && campus.loading && !campus.available && !campus.message;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="font-heading text-3xl font-medium tracking-tight text-foreground sm:text-4xl">BIM-Viewer</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Gebäudemodell drehen oder ein einzelnes Geschoss im Schnitt öffnen.</p>
      </div>
      <Button variant="outline" size="sm" className="rounded-full border-white/60 bg-white/30 px-4" asChild><Link to="/gebaeude">Modelle verwalten<ArrowUpRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
    </div>
    <section className="glass-card surface overflow-hidden" aria-label="Modellarbeitsfläche">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/50 bg-white/15 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <label htmlFor="ifc-model" className="text-xs font-semibold text-muted-foreground">Modell</label>
          <select id="ifc-model" className="min-h-11 min-w-0 max-w-full flex-1 rounded-xl border border-border bg-background/80 px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm" value={selected} onChange={event => setSelected(event.target.value)}>
            <option value="campus-d21">D21 · Hochschule Darmstadt</option>
            <option value="example">Beispielgebäude</option>
            {models.map(item => <option key={item.id} value={item.id}>{item.buildingName} · {item.name}</option>)}
            {!model && selected !== 'example' && <option value={selected}>{loading ? 'Modell wird geladen …' : 'Modell momentan nicht verfügbar'}</option>}
          </select>
        </div>
        <Button variant="ghost" size="sm" className="rounded-full px-3 text-muted-foreground hover:bg-white/40" onClick={() => setRevision(n => n + 1)} disabled={loading} aria-label="Modellliste aktualisieren"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span className="ml-2 hidden sm:inline">Aktualisieren</span></Button>
      </div>
      {error && <p role="alert" className="border-b border-border bg-red-50 px-4 py-3 text-xs text-destructive">{error}</p>}
      {selected === 'campus-d21' && !campus.loading && campus.message && <p role="status" className="border-b border-border px-4 py-3 text-xs text-muted-foreground">{campus.message} Die Campuskarte bleibt verfügbar.</p>}
      {loadingCampus ? <p role="status" className="grid h-[clamp(420px,62dvh,750px)] place-items-center p-6 text-sm text-muted-foreground">D21-Modell wird vorbereitet …</p>
        : model ? <IFCModelFrame key={`${model.id}-${Boolean(model.mapOnly)}`} document={model} presentation="bim" />
        : <p role="status" className="p-6 text-sm text-muted-foreground">{loading ? 'Modellliste wird geladen …' : 'Bitte die Modellliste erneut laden oder ein anderes Modell auswählen.'}</p>}
    </section>
  </div>;
}
