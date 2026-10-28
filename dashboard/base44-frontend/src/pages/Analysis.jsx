import { useState } from 'react';
import { BrainCircuit, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import FindingCard from '@/components/analysis/FindingCard';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import useD21Data from '@/hooks/useD21Data';
import { analyseRoom, analysisSummary } from '@/lib/analysis';

export default function Analysis() {
  const data = useD21Data();
  const { toast } = useToast();
  const [severity, setSeverity] = useState('all');
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [running, setRunning] = useState(false);

  const results = data.rooms.map((room) =>
    analyseRoom({
      room,
      roomSensors: data.sensors.filter((s) => s.room_id === room.id),
      series: data.series,
      thresholds: data.thresholds,
    }),
  );

  const summary = analysisSummary(results);
  const floorLabel = (room) => (data.floors.find((f) => f.id === room.floor_id) || {}).name || '';

  const findings = results
    .flatMap((result) => result.findings.map((finding) => ({ ...finding, room: result.room, roomStatus: result.status })))
    .filter((finding) => (onlyIssues ? finding.level !== 'ok' || finding.trend.direction !== 'stabil' : true))
    .filter((finding) => (severity === 'all' ? true : finding.level === severity))
    .sort((a, b) => {
      const order = { critical: 0, warning: 1, ok: 2, unknown: 3 };
      return (order[a.level] ?? 4) - (order[b.level] ?? 4);
    });

  const trendFindings = results
    .flatMap((result) => result.findings.map((finding) => ({ ...finding, room: result.room })))
    .filter((finding) => finding.trend.direction === 'steigend' || finding.trend.direction === 'fallend');

  const runCheck = async () => {
    setRunning(true);
    try {
      const response = await base44.functions.invoke('runThresholdCheck', { sinceHours: 4 });
      const payload = response?.data || {};
      toast({ title: 'Prüflauf abgeschlossen', description: payload.message || 'Prüflauf wurde ausgeführt.' });
      await data.reload();
    } catch (e) {
      toast({ title: 'Prüflauf fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  if (data.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
      </div>
    );
  }

  if (!data.rooms.length || !data.series.length) {
    return (
      <div>
        <PageHeader title="KI-Analyse" description="Auffälligkeiten, Trends und mögliche Ursachen untersuchen." />
        <EmptyState
          icon={BrainCircuit}
          title="Keine Messwerte für die Auswertung"
          description="Für eine Auswertung werden Räume, Sensoren und Messwerte im Betrachtungszeitraum benötigt. Erzeugen Sie den Demo-Datensatz oder importieren Sie Messwerte unter „Daten & Einstellungen“."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="KI-Analyse"
        description="Auffälligkeiten, Trends und mögliche Ursachen aus den hinterlegten Messwerten."
      >
        <Button variant="outline" size="sm" onClick={data.reload}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Neu berechnen
        </Button>
        <Button size="sm" onClick={runCheck} disabled={running}>
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> {running ? 'Prüflauf läuft …' : 'Meldungen erzeugen'}
        </Button>
      </PageHeader>

      <div className="surface flex flex-wrap items-start gap-4 border-l-4 border-l-cyan-500 p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-sm font-semibold text-foreground">Regelbasierte Auswertung – Vorstufe zur KI-Anbindung</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Die Ergebnisse entstehen ausschließlich aus den hinterlegten Grenzwerten und einer Verlaufsanalyse der Messreihen
            (lineare Trendberechnung). Es ist kein KI-Modell im Einsatz, es werden keine Werte geschätzt oder Prognosen erfunden.
            Die Auswertung ist so aufgebaut, dass später ein KI-Modell an derselben Datenbasis ansetzen kann.
          </p>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Kritische Auffälligkeiten" value={`${summary.critical}`} hint="Räume mit kritischem Messwert" icon={ShieldCheck} tone={summary.critical ? 'crit' : 'ok'} />
        <StatCard label="Warnungen" value={`${summary.warning}`} hint="Räume mit Grenzwertüberschreitung" icon={ShieldCheck} tone={summary.warning ? 'warn' : 'ok'} />
        <StatCard label="Trends" value={`${trendFindings.length}`} hint="Messgrößen mit steigendem oder fallendem Verlauf" icon={RefreshCw} />
        <StatCard label="Messwerte im Zeitraum" value={data.series.length.toLocaleString('de-DE')} hint="letzte 24 Stunden (Stundenwerte)" icon={SlidersHorizontal} />
      </section>

      <section className="surface p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Ausprägung"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            options={[
              { value: 'all', label: 'Alle Ausprägungen' },
              { value: 'critical', label: 'Nur kritisch' },
              { value: 'warning', label: 'Nur Warnungen' },
            ]}
          />
          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-xs font-medium text-foreground">Umfang</p>
            <button
              type="button"
              onClick={() => setOnlyIssues((v) => !v)}
              className={
                onlyIssues
                  ? 'rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                  : 'rounded-full bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200'
              }
            >
              {onlyIssues ? 'Nur Auffälligkeiten und Trends' : 'Alle Messgrößen anzeigen'}
            </button>
          </div>
        </div>
      </section>

      {summary.causes.length ? (
        <section className="surface p-5">
          <h3 className="font-heading text-sm font-semibold text-foreground">Häufigste mögliche Ursachen im Gebäude</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {summary.causes.map((cause) => (
              <li key={cause} className="flex gap-2 text-xs text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-500" />
                {cause}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4">
        <h3 className="font-heading text-lg font-semibold text-foreground">Auffälligkeiten ({findings.length})</h3>
        {findings.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            title="Keine Auffälligkeiten gefunden"
            description="Alle Messwerte liegen im Sollbereich und zeigen keine ausgeprägten Trends. Die Bewertung folgt den hinterlegten Grenzwerten."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {findings.map((finding) => (
              <FindingCard
                key={`${finding.room.id}-${finding.metric}`}
                finding={finding}
                room={finding.room}
                floorLabel={floorLabel(finding.room)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
