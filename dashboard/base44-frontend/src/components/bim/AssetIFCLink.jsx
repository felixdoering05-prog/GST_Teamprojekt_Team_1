import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useBuildingModels } from '@/hooks/useBuildingModels';
import { useBuildingScope } from '@/hooks/useBuildingScope';
import { request } from '@/api/base44Client';
import { assetModelURL } from '@/lib/operations';

export default function AssetIFCLink({ asset, building, canEdit, refresh }) {
  const scope = useBuildingScope();
  const allowed = scope.can(building.id, 'bim');
  const { models, loading, error } = useBuildingModels(allowed ? [building] : []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  if (!allowed) return null;

  const reference = asset.ifc_reference;
  const linked = models.find(model => String(model.id) === reference?.model_id);
  const available = linked || models[0];
  async function unlink() {
    setFailure('');
    setBusy(true);
    try {
      await request(`/buildings/${building.id}/assets/${asset.id}/ifc-reference`, { method: 'PUT', body: { revision: asset.revision, reference: null } });
      await refresh();
      setConfirm(false);
    } catch (problem) {
      setFailure(problem.message);
      setConfirm(false);
    } finally { setBusy(false); }
  }

  return <section className="space-y-2" aria-label="IFC-Verknüpfung">
    <h4 className="font-semibold">IFC-Verknüpfung</h4>
    {loading ? <p role="status" className="text-sm text-muted-foreground">Gebäudemodelle werden geladen …</p>
      : error && !available ? <p role="alert" className="text-sm text-destructive">{error.message}</p>
        : reference && !linked ? <p role="status" className="text-sm text-muted-foreground">Das verknüpfte Modell für „{reference.label}“ ist nicht mehr verfügbar.</p>
          : reference ? <p className="break-words text-sm">{reference.label} · {linked.name}</p>
            : <p className="text-sm text-muted-foreground">{available ? 'Noch kein IFC-Objekt zugeordnet.' : 'Für dieses Gebäude ist kein IFC-Modell hinterlegt.'}</p>}
    <div className="flex flex-wrap gap-2">
      {linked && <Button size="sm" asChild><Link to={assetModelURL(building.id, linked.id, asset.id)}>Im Modell zeigen</Link></Button>}
      {canEdit && available && <Button size="sm" variant="outline" asChild>
        <Link to={assetModelURL(building.id, available.id, asset.id, true)}>{reference ? 'IFC-Verknüpfung ändern' : 'Mit IFC-Objekt verknüpfen'}</Link>
      </Button>}
      {canEdit && reference && <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>Verknüpfung lösen</Button>}
    </div>
    {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="IFC-Verknüpfung lösen?"
      description={`Die Zuordnung von „${asset.name}“ zu „${reference?.label}“ wird entfernt.`} onConfirm={unlink} busy={busy} />
  </section>;
}
