import { Boxes, Cable, Lock, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SourceBadge from '@/components/SourceBadge';

const BIM_LABEL = {
  nicht_verknuepft: 'Nicht verknüpft',
  vorbereitet: 'Vorbereitet',
  verknuepft: 'Verknüpft',
};

export default function PreparationCards({ building, rooms, onEditBuilding }) {
  const withRevit = rooms.filter((r) => r.revit_room_id).length;

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="surface p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
            <Boxes className="h-5 w-5" />
          </span>
          <h3 className="font-heading text-sm font-semibold text-foreground">Revit-/IFC-Vorbereitung</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Jeder Raum besitzt reservierte Felder für die Revit-Raum-ID und den IFC-GlobalId, jedes Geschoss eines für die Revit-Ebene. Sobald das
          Modell vorliegt, werden diese Felder befüllt und die Ansichten greifen auf die realen Raumbezüge zu.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium text-foreground">{BIM_LABEL[building?.bim_status] || 'Vorbereitet'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Modellverweis</dt>
            <dd className="truncate font-medium text-foreground">{building?.bim_model_ref || '– nicht eingetragen –'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Räume mit Raum-ID</dt>
            <dd className="tabular font-medium text-foreground">
              {withRevit} / {rooms.length}
            </dd>
          </div>
        </dl>
        <Button variant="outline" size="sm" className="mt-4" onClick={onEditBuilding}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Gebäudedaten bearbeiten
        </Button>
      </section>

      <section className="surface p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Cable className="h-5 w-5" />
          </span>
          <h3 className="font-heading text-sm font-semibold text-foreground">Echte Sensordaten anbinden</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Zwei Wege sind vorbereitet. Aktuell ist keine Live-Schnittstelle aktiv – es werden bewusst keine Live-Werte simuliert.
        </p>
        <ul className="mt-4 space-y-3">
          <li className="rounded-xl border border-border p-3">
            <p className="text-xs font-medium text-foreground">1 · CSV-Import (sofort nutzbar)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Messwerte mit Sensorkennung, Wert und Zeitstempel importieren. Die Werte werden als echte Daten gekennzeichnet.
              Für Verlaufsdaten empfiehlt sich ein stündliches Raster.
            </p>
          </li>
          <li className="rounded-xl border border-border p-3">
            <p className="text-xs font-medium text-foreground">2 · Schnittstelle (API)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Die Datenstruktur (Sensor, Messgröße, Wert, Zeitstempel, Kennzeichnung Demo/Echt) ist für eine automatische Übernahme
              ausgelegt. Die Anbindung wird ergänzt, sobald eine Datenquelle vorliegt.
            </p>
          </li>
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Aktive Datenherkunft</span>
          <SourceBadge source="demo" labels={{ demo: 'Demo (mitgeliefert)', real: 'Echt (importiert)' }} />
        </div>
      </section>

      <section className="surface p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <Lock className="h-5 w-5" />
          </span>
          <h3 className="font-heading text-sm font-semibold text-foreground">Zugriff und Sicherheit</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Die Anwendung ist als geschützte Anwendung eingerichtet: Ohne Anmeldung ist kein Zugriff auf Daten oder Funktionen möglich, damit gibt
          es keine offen erreichbaren Schreibzugriffe. Eine eigene Registrierungs- und Rollenverwaltung ist – wie für die erste Ausbaustufe
          vorgesehen – nicht enthalten; der Zugang wird über die App-Verwaltung vergeben.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Die Auswertung erfolgt regelbasiert auf den gespeicherten Messwerten. Es werden keine KI-Ergebnisse erzeugt, die nicht aus diesen Daten
          ableitbar sind.
        </p>
      </section>
    </div>
  );
}
