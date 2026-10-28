import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, RefreshCw, SunMedium, Waves } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import SourceBadge from '@/components/SourceBadge';
import EnergyChart from '@/components/energy/EnergyChart';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { formatDateShort } from '@/lib/dates';

const MEDIUM_LABEL = {
  strom: 'Strom',
  waerme: 'Wärme',
  kaltwasser: 'Kaltwasser',
  warmwasser: 'Warmwasser',
};

export default function Energy() {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [medium, setMedium] = useState('');

  const load = async () => {
    setLoading(true);
    const rows = await base44.entities.EnergyReading.list('-period_start', 500);
    setReadings(rows || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const mediums = useMemo(() => [...new Set(readings.map((r) => r.medium))], [readings]);

  useEffect(() => {
    if (mediums.length && !mediums.includes(medium)) setMedium(mediums[0]);
  }, [mediums, medium]);

  const activeReadings = useMemo(
    () => readings.filter((r) => r.medium === medium).sort((a, b) => new Date(a.period_start) - new Date(b.period_start)),
    [readings, medium],
  );

  const unit = activeReadings.length ? activeReadings[0].unit : '';
  const chartData = activeReadings.map((r) => ({ label: formatDateShort(r.period_start), value: r.value, meter: r.meter_code }));
  const total = activeReadings.reduce((sum, r) => sum + Number(r.value || 0), 0);
  const last7 = activeReadings.slice(-7).reduce((sum, r) => sum + Number(r.value || 0), 0);
  const last30 = activeReadings.filter((r) => new Date(r.period_start) >= new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const avg30 = last30.length ? last30.reduce((sum, r) => sum + Number(r.value || 0), 0) / last30.length : 0;
  const meters = [...new Set(activeReadings.map((r) => r.meter_code))];
  const demoShare = activeReadings.length ? activeReadings.filter((r) => r.source !== 'real').length / activeReadings.length : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Energie"
        description="Vorbereitete Ansicht für Energieverbrauch und Auswertungen. Verbrauchsdaten werden über die Zählerstruktur erfasst und können als CSV importiert werden."
      >
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Aktualisieren
        </Button>
      </PageHeader>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
        </div>
      ) : readings.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Noch keine Verbrauchsdaten hinterlegt"
          description="Die Ansicht ist für echte Verbrauchsdaten vorbereitet. Importieren Sie Ablesewerte als CSV (Zähler, Energieart, Zeitraum, Wert) – die Auswertung erscheint anschließend automatisch."
          children={
            <Button asChild>
              <Link to="/daten">Zum Datenimport</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {mediums.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMedium(key)}
                className={
                  key === medium
                    ? 'rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                    : 'rounded-full bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200'
                }
              >
                {MEDIUM_LABEL[key] || key}
              </button>
            ))}
            <SourceBadge source={demoShare > 0.5 ? 'demo' : 'real'} labels={{ demo: 'Demo-Verbrauchsdaten', real: 'Echte Verbrauchsdaten' }} />
          </div>

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Zähler" value={`${meters.length}`} hint={meters.join(', ') || '–'} icon={Waves} tone="primary" />
            <StatCard label="Verbrauch 7 Tage" value={last7.toLocaleString('de-DE', { maximumFractionDigits: 1 })} unit={unit} hint="Summe über alle Zähler der Energieart" icon={SunMedium} />
            <StatCard label="Ø pro Ablesezeitraum" value={avg30.toLocaleString('de-DE', { maximumFractionDigits: 1 })} unit={unit} hint="Mittel der letzten 30 Tage" icon={Zap} />
            <StatCard label="Gesamt im Zeitraum" value={total.toLocaleString('de-DE', { maximumFractionDigits: 0 })} unit={unit} hint={`${activeReadings.length} Ablesewerte`} icon={Zap} />
          </section>

          <section className="surface overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">Verbrauchsverlauf {MEDIUM_LABEL[medium] || medium}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Tageswerte je Zähler · Balken entspricht einem Ablesezeitraum</p>
            </div>
            <div className="px-2 py-4 sm:px-4">
              <EnergyChart data={chartData} unit={unit} />
            </div>
          </section>

          <section className="surface overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">Letzte Ablesewerte</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Zeitraum</th>
                    <th className="px-3 py-2.5 font-medium">Zähler</th>
                    <th className="px-3 py-2.5 font-medium">Energieart</th>
                    <th className="px-3 py-2.5 font-medium">Verbrauch</th>
                    <th className="px-5 py-2.5 font-medium">Herkunft</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...activeReadings].reverse().slice(0, 14).map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 text-muted-foreground">{formatDateShort(r.period_start)}</td>
                      <td className="tabular px-3 py-3 font-medium text-foreground">{r.meter_code}</td>
                      <td className="px-3 py-3 text-muted-foreground">{MEDIUM_LABEL[r.medium] || r.medium}</td>
                      <td className="tabular px-3 py-3 text-foreground">
                        {Number(r.value).toLocaleString('de-DE', { maximumFractionDigits: 1 })} {r.unit}
                      </td>
                      <td className="px-5 py-3">
                        <SourceBadge source={r.source} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="surface p-5">
        <h3 className="font-heading text-sm font-semibold text-foreground">Vorbereitung für echte Verbrauchsdaten</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Die Datenstruktur für Zähler, Energieart, Ablesezeitraum und Verbrauch ist angelegt. Sobald echte Zählerdaten vorliegen – als CSV-Export oder über
          eine Schnittstelle – werden sie hier ohne weitere Anpassungen ausgewertet. Es werden keine Verbrauchswerte geschätzt oder erfunden.
        </p>
      </div>
    </div>
  );
}
