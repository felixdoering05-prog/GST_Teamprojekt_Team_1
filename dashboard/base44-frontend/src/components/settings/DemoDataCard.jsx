import { Database, PlayCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DemoDataCard({ counts, onSeed, onRemove, busy, onRefresh }) {
  const items = [
    { label: 'Gebäude', value: counts?.buildings ?? 0 },
    { label: 'Geschosse', value: counts?.floors ?? 0 },
    { label: 'Räume', value: counts?.rooms ?? 0 },
    { label: 'Sensoren', value: counts?.sensors ?? 0 },
    { label: 'Messwerte (Demo)', value: counts?.demoMeasurements ?? 0 },
    { label: 'Messwerte (echt)', value: counts?.realMeasurements ?? 0 },
    { label: 'Verbrauchswerte', value: counts?.energy ?? 0 },
    { label: 'Meldungen', value: counts?.alerts ?? 0 },
  ];

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-heading text-sm font-semibold text-foreground">Datenbestand und Demo-Datensatz</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Simulierte Werte sind in der gesamten Anwendung mit dem Merkmal „Demo“ gekennzeichnet. Echte Messwerte bleiben davon getrennt
              und werden ausschließlich aus Importen oder einer späteren Schnittstelle erzeugt.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Aktualisieren
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-slate-50/60 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold text-foreground">{item.value.toLocaleString('de-DE')}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onSeed} disabled={busy}>
          <PlayCircle className="mr-1.5 h-4 w-4" /> {busy ? 'Wird ausgeführt …' : 'Demo-Datensatz erzeugen'}
        </Button>
        <Button variant="outline" onClick={onRemove} disabled={busy}>
          <Trash2 className="mr-1.5 h-4 w-4 text-red-600" /> Demo-Daten entfernen
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Der Demo-Datensatz enthält ein Gebäude, 3 Geschosse, 12 Räume, 36 Sensoren, Stundenwerte der letzten 24 Stunden sowie 30 Tage
        Verbrauchsdaten. Beim Entfernen werden ausschließlich als Demo gekennzeichnete Datensätze gelöscht.
      </p>
    </section>
  );
}
