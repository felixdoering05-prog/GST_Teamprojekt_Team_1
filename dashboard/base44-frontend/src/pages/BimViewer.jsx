import { useEffect, useState } from 'react';
import { request } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import IFCModelFrame from '@/components/bim/IFCModelFrame';
import SchematicViewer from '@/components/bim/SchematicViewer';

export default function BimViewer() {
  const [models, setModels] = useState([]);
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('model') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [schematic, setSchematic] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    (async () => {
      const buildings = await request('/buildings');
      const results = await Promise.allSettled(buildings.map(async building => {
        const files = await request(`/buildings/${building.id}/documents`);
        return files.filter(file => file.mime_type === 'application/x-step').map(file => ({ ...file, buildingName: building.name }));
      }));
      if (!active) return;
      const rows = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      setModels(rows); setSelected(current => rows.some(row => String(row.id) === current) ? current : '');
      const failed = results.filter(result => result.status === 'rejected').length;
      if (failed) setError(`${failed} Gebäudemappe(n) konnten nicht geladen werden. Bitte erneut aktualisieren.`);
    })().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const document = models.find(model => String(model.id) === selected);
  return <div className="space-y-5">
    <PageHeader title="BIM-Viewer" description="Deine IFC-Modelle vom Projektserver – dieselben Dateien und Gebäude wie in der iPhone-App.">
      <Button variant="outline" onClick={() => setRevision(n => n + 1)} disabled={loading}>Aktualisieren</Button>
    </PageHeader>
    <div className="flex flex-wrap gap-2"><Button variant={schematic ? 'outline' : 'default'} onClick={() => setSchematic(false)}>IFC-Modell in 3D</Button><Button variant={schematic ? 'default' : 'outline'} onClick={() => setSchematic(true)}>Schematischer Grundriss</Button></div>
    {schematic ? <SchematicViewer /> : <section className="surface space-y-4 p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">Melde dich mit demselben persönlichen Konto wie auf dem iPhone an. Lade IFC-Dateien dort oder unter „Gebäude & Räume“ in die Gebäudemappe hoch und klicke hier auf Aktualisieren.</p>
      {loading && <p role="status">Modellliste wird geladen …</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!loading && !models.length && !error && <p>Noch keine IFC-Modelle in deinen Gebäudemappen. Unterstützt werden IFC2x3 und IFC4 bis 20 MB.</p>}
      {!!models.length && <><label htmlFor="ifc-model" className="block font-medium">Modell auswählen</label><select id="ifc-model" className="w-full rounded-lg border bg-background p-3" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Bitte Modell wählen</option>{models.map(model => <option key={model.id} value={model.id}>{model.buildingName} · {model.name}</option>)}</select></>}
      {document && <IFCModelFrame key={document.id} document={document} />}
    </section>}
  </div>;
}
