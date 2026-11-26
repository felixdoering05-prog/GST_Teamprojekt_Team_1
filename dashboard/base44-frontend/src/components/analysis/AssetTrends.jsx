import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/Field';

const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const calendar = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const date = time => new Date(time).toISOString().slice(0, 10);
const displayDate = day => calendar.format(new Date(day));
const interval = ({ from, to }) => `${displayDate(from)} – ${displayDate(to)}`;

function AssetsInMetric({ assetIDs, assets, comparable = false }) {
  const included = assets.filter(asset => assetIDs.includes(asset.id));
  const listed = included.length ? included : assets;
  const label = comparable ? 'Vergleichbare Anlagen' : included.length ? 'Anlagen mit Daten' : 'Ausgewählte Anlagen';
  if (!listed.length) return null;
  if (listed.length === 1) return <p className="break-words text-sm text-muted-foreground">{comparable ? 'Vergleichbar' : included.length ? 'Anlage' : 'Ausgewählte Anlage'} · {listed[0].name}</p>;
  return <details className="text-sm text-muted-foreground">
    <summary className="cursor-pointer">{label} ({listed.length}{included.length > 0 && ` von ${assets.length}`})</summary>
    <ul className="mt-1 list-disc space-y-1 pl-5">{listed.map(asset => <li key={asset.id} className="break-words">{asset.name}</li>)}</ul>
  </details>;
}

function Metric({ title, building, period, children, assets, assetIDs }) {
  return <article className="min-w-0 space-y-2 rounded-xl border p-4">
    <h4 className="font-semibold">{title}</h4>
    <p className="break-words text-sm text-muted-foreground">{building} · {period}</p>
    {children}
    <AssetsInMetric assetIDs={assetIDs} assets={assets} />
  </article>;
}

function FaultMetric({ title, building, assets, metric }) {
  return <Metric title={title} building={building} period={interval(metric.period)} assets={assets} assetIDs={metric.asset_ids}>
    <p className="text-lg font-semibold">{metric.count === null ? 'Keine Daten' : `${metric.count} ${metric.count === 1 ? 'erfasste Störung' : 'erfasste Störungen'}`}</p>
    {metric.count !== null && !metric.complete && <p className="text-sm text-muted-foreground">Teilerfassung im ausgewählten Zeitraum.</p>}
  </Metric>;
}

function Results({ report }) {
  const { assets, building, faults, overdue, quality } = report;
  return <>
    <p className="text-sm text-muted-foreground">Zeiträume sind einschließlich beider Tage in UTC. Als Störung zählt jeder erfasste Wechsel in den Anlagenstatus „Störung“.</p>
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Anlagenkennzahlen">
      <FaultMetric title="Störungshäufigkeit" building={building.name} assets={assets} metric={faults.current} />
      <FaultMetric title="Störungshäufigkeit im Vergleichszeitraum" building={building.name} assets={assets} metric={faults.previous} />
      <Metric title="Datenqualität" building={building.name} period={interval(quality.period)} assets={assets} assetIDs={quality.asset_ids}>
        <p className="text-lg font-semibold">{quality.average_percent === null ? 'Keine Daten' : `${number.format(quality.average_percent)} % im Mittel am Zeitraumende`}</p>
        <p className="text-sm text-muted-foreground">{quality.change_percentage_points === null ? 'Für eine Veränderung fehlen vergleichbare Qualitätswerte.'
          : `${signed.format(quality.change_percentage_points)} Prozentpunkte über den Zeitraum, für ${quality.comparable_asset_ids.length} vergleichbare Anlagen.`}</p>
        {quality.comparable_asset_ids.length > 0 && quality.comparable_asset_ids.length < quality.asset_ids.length &&
          <AssetsInMetric assetIDs={quality.comparable_asset_ids} assets={assets} comparable />}
      </Metric>
      <Metric title="Überfällige Wartungen heute" building={building.name} period={`Stand ${displayDate(overdue.as_of)}`} assets={assets} assetIDs={overdue.asset_ids}>
        <p className="text-lg font-semibold">{overdue.count === null ? 'Keine Wartungen erfasst' : `${overdue.count} überfällig`}</p>
        {overdue.count !== null && <p className="text-sm text-muted-foreground">{overdue.dated_open_tasks} offene Wartungen mit Fälligkeit.</p>}
        <p className="text-sm text-muted-foreground">Für die historische Entwicklung fehlen frühere Fälligkeiten und Statusstände.</p>
      </Metric>
    </div>
  </>;
}

function TrendReport({ building }) {
  const today = date(Date.now());
  const [filter, setFilter] = useState(() => ({ from: date(Date.now() - 29 * 86400000), to: today }));
  const [explanation, setExplanation] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const assets = useQuery({ queryKey: ['technical-assets', building.id], queryFn: () => request(`/buildings/${building.id}/assets`), retry: false });
  const report = useQuery({ queryKey: ['asset-trends', building.id, filter], retry: false,
    queryFn: () => request(`/buildings/${building.id}/analysis/asset-trends?${new URLSearchParams(filter)}`) });
  function apply(event) {
    event.preventDefault();
    const next = Object.fromEntries(new FormData(event.currentTarget));
    if (!next.asset_id) delete next.asset_id;
    setFilter(next);
    setExplanation(null);
    setFailure('');
  }
  async function explain() {
    const hash = report.data.context_hash;
    setConfirm(false);
    setFailure('');
    setBusy(true);
    try {
      const answer = await request(`/buildings/${building.id}/assistant`, {
        method: 'POST', headers: { 'X-Request-ID': crypto.randomUUID() },
        body: { mode: 'asset-trends', consent: 'once', period: filter, context_hash: hash },
      });
      setExplanation({ hash, text: answer.answer });
    } catch (error) {
      setFailure(error.message);
      if (error.status === 409) report.refetch();
    } finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]" onSubmit={apply}>
      <SelectField label="Anlage" aria-label="Anlage" name="asset_id" disabled={!assets.isSuccess || busy} options={[
        { value: '', label: 'Alle Anlagen' }, ...(assets.data?.items ?? []).map(asset => ({ value: String(asset.id), label: asset.name })),
      ]} />
      <TextField label="Von" aria-label="Von" name="from" type="date" required max={today} defaultValue={filter.from} disabled={busy} />
      <TextField label="Bis" aria-label="Bis" name="to" type="date" required max={today} defaultValue={filter.to} disabled={busy} />
      <Button type="submit" variant="outline" disabled={busy}>Auswerten</Button>
    </form>
    {assets.isError && <p role="alert" className="text-sm text-destructive">{assets.error.message}</p>}
    {report.isPending && <p role="status" className="text-sm">Anlagenkennzahlen werden berechnet …</p>}
    {report.isError && <p role="alert" className="text-sm text-destructive">{report.error.message}</p>}
    {report.data && (report.data.context.assets.length ? <Results report={report.data.context} />
      : <p className="text-sm text-muted-foreground">Für dieses Gebäude sind keine technischen Anlagen erfasst.</p>)}
    {report.data?.enabled && report.data.context.assets.length > 0 && <Button size="sm" variant="outline" disabled={busy || report.isFetching} onClick={() => setConfirm(true)}>
      <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />{busy ? 'KI-Erläuterung wird erstellt …' : 'Kennzahlen mit KI erläutern'}
    </Button>}
    {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    {explanation && explanation.hash === report.data?.context_hash && <section className="space-y-2 rounded-xl border p-4">
      <h4 className="font-semibold">KI-Erläuterung</h4><p className="whitespace-pre-wrap break-words text-sm">{explanation.text}</p>
    </section>}
    <Dialog open={confirm} onOpenChange={setConfirm}>
      <DialogContent><DialogTitle>Kennzahlen mit KI erläutern</DialogTitle>
        <DialogDescription>Gemini erhält einmalig die berechneten Kennzahlen, Zeiträume und die Anzahl der berücksichtigten Anlagen.</DialogDescription>
        <DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Abbrechen</Button>
          <Button disabled={!report.data?.enabled} onClick={explain}>Erläuterung anfordern</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

export default function AssetTrends({ buildings }) {
  const [selected, setSelected] = useState('');
  const building = buildings.find(item => String(item.id) === selected) ?? buildings[0];
  if (!building) return null;
  return <section className="surface space-y-4 p-4 sm:p-5" aria-label="Trends technischer Anlagen">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h3 className="font-heading text-lg font-semibold">Trends technischer Anlagen</h3>
      {buildings.length > 1 && <SelectField label="Gebäude" aria-label="Gebäude für Anlagentrends" value={String(building.id)}
        options={buildings.map(item => ({ value: String(item.id), label: item.name }))} onChange={event => setSelected(event.target.value)} />}
    </div>
    <TrendReport key={building.id} building={building} />
  </section>;
}
