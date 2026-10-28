import { Link } from 'react-router-dom';
import { Building2, Pencil, Radio, Layers, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SourceBadge from '@/components/SourceBadge';

const BIM_LABEL = {
  nicht_verknuepft: 'Nicht verknüpft',
  vorbereitet: 'Vorbereitet',
  verknuepft: 'Verknüpft',
};

export default function BuildingPanel({ building, floors, rooms, sensors, onEdit }) {
  if (!building) {
    return (
      <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-heading text-base font-semibold text-foreground">Noch kein Gebäude angelegt</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Legen Sie zuerst das Gebäude an – Geschosse und Räume werden daran gehängt.
            </p>
          </div>
        </div>
        <Button onClick={onEdit}>Gebäude anlegen</Button>
      </div>
    );
  }

  const facts = [
    { icon: Layers, label: 'Geschosse', value: `${floors.length}` },
    { icon: Ruler, label: 'Räume', value: `${rooms.length}` },
    { icon: Radio, label: 'Sensoren', value: `${sensors.length}` },
  ];

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-base font-semibold text-foreground">Gebäude {building.name}</h3>
              <SourceBadge source={building.source} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {building.site || 'Standort nicht hinterlegt'}
              {building.address ? ` · ${building.address}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {building.usage_type || 'Nutzung nicht hinterlegt'}
              {building.year_built ? ` · Baujahr ${building.year_built}` : ''}
              {building.gross_area_m2 ? ` · ${Number(building.gross_area_m2).toLocaleString('de-DE')} m²` : ''}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Bearbeiten
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-border bg-slate-50/60 px-5 py-4 sm:grid-cols-4">
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            <div key={fact.label} className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-slate-500" />
              <span className="text-xs text-muted-foreground">{fact.label}</span>
              <span className="tabular text-sm font-semibold text-foreground">{fact.value}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">BIM-Status</span>
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 ring-1 ring-inset ring-cyan-600/20">
            {BIM_LABEL[building.bim_status] || 'Vorbereitet'}
          </span>
        </div>
      </div>

      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          Raumbezug für das Modell:{' '}
          <span className="tabular">{rooms.filter((r) => r.revit_room_id).length}</span> von {rooms.length} Räumen besitzen eine Revit-Raum-ID.{' '}
          <Link to="/bim-viewer" className="font-medium text-primary underline-offset-2 hover:underline">
            Zur schematischen Gebäudeansicht
          </Link>
        </p>
      </div>
    </div>
  );
}
