import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import BuildingDialog, { lifecyclePhases } from './BuildingDialog';

export default function BuildingProfile({ building, onSaved }) {
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: ['building-profile', building.id],
    queryFn: async () => {
      const result = await base44.entities.Building.filter({ id: String(building.id) }, { limit: 1 });
      return result.items[0] || null;
    },
    retry: false,
  });
  if (query.isPending) return <p role="status" className="surface p-5">Gebäudestammdaten werden geladen …</p>;
  if (query.isError) return <p role="alert" className="surface p-5 text-destructive">{query.error.message}</p>;
  const data = query.data ?? building;
  const m2 = value => value == null ? null : Number(value).toLocaleString('de-DE') + ' m²';
  const fields = [
    ['Projektbezeichnung', data.name], ['Gebäude-ID', data.code || data.id], ['Standort', data.address],
    ['Gebäudetyp', data.usage_type], ['Baujahr', data.year_built], ['Nutzfläche', m2(data.usable_area_m2)],
    ['Bruttogrundfläche', m2(data.gross_area_m2)], ['Geschosse', data.floors_count],
    ['Kunde / Eigentümer', data.owner_name], ['Ansprechpartner', data.contact_name], ['Kontakt', data.contact_email],
  ];
  const present = fields.filter(([,value]) => value !== '' && value != null).length;
  return <section className="surface space-y-5 p-5" aria-label="Gebäudestammdaten">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-heading text-lg font-semibold">Gebäudestammdaten</h3><p className="text-sm text-muted-foreground">Datenqualität {Math.round(present / fields.length * 100)} % · {present} von {fields.length} Angaben</p></div>
      {building.is_owner && <Button variant="outline" onClick={() => setEditing(true)}>Stammdaten bearbeiten</Button>}
    </div>
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words">{value === '' || value == null ? 'Nicht eingetragen' : value}</dd></div>)}
    </dl>
    {data.description && <p className="whitespace-pre-wrap">{data.description}</p>}
    <div><h4 className="font-semibold">Lebenszyklus</h4><p>{lifecyclePhases.find(phase => phase.value === data.lifecycle_phase)?.label || 'Nicht eingetragen'}</p></div>
    {editing && <BuildingDialog open onOpenChange={setEditing} building={data} onSaved={() => Promise.all([query.refetch(), onSaved()])} />}
  </section>;
}
