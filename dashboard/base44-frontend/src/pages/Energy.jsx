import { useBuildingScope, buildingScopeHeaders } from '@/hooks/useBuildingScope';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Droplet, Flame, Gauge, Plus, Zap } from 'lucide-react';
import { base44, request } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { SelectField, TextField } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import EnergyChart from '@/components/energy/EnergyChart';
import ReadingDialog from '@/components/energy/ReadingDialog';
import { ENERGY_MEDIA, formatAmount, formatCost, formatEnergyDate, formatEnergyMonth, formatPeriod, readingSource } from '@/lib/energy';

const ALL = { value: '', label: 'Alle' };
const PAGE_SIZE = 50;
const PERIODS = [
  { value: '1', label: '1 Kalendermonat' }, { value: '3', label: '3 Kalendermonate' },
  { value: '12', label: '12 Kalendermonate' }, { value: 'all', label: 'Gesamte Historie' },
];
const ICONS = { strom: Zap, waerme: Flame, warmwasser: Droplet, kaltwasser: Droplet };
const dayRange = (range) => range ? formatPeriod(range.from, range.to) : 'Gesamte Historie';
const mediumOption = (value) => ({ value, label: ENERGY_MEDIA[value][0] });

function Comparison({ series }) {
  if (series.previous == null || series.current == null) return <span>Kein Vergleichswert</span>;
  const delta = series.current - series.previous;
  const sign = delta > 0 ? '+' : '';
  return (
    <span>
      {sign}{formatAmount(delta, series.unit)}
      {series.previous !== 0 && <> ({sign}{formatAmount(delta / series.previous * 100, '%')})</>}
      <span className="block text-muted-foreground">Vorzeitraum {formatAmount(series.previous, series.unit)}</span>
    </span>
  );
}

function ConsumptionCard({ summary, to, showChart }) {
  const Icon = ICONS[summary.medium] || Gauge;
  const series = summary.series[0];
  return (
    <article className="surface flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
        <h3 className="font-heading text-base font-semibold">{summary.label}</h3>
      </div>
      <dl className="mt-4 space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Verbrauch im Zeitraum</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatAmount(series.current, series.unit)}</dd>
        </div>
        {summary.series.slice(1).map((item) => (
          <div key={item.unit}>
            <dt className="text-xs text-muted-foreground">{summary.medium === 'warmwasser' && item.unit === 'kWh' ? 'Energie zur Erwärmung' : item.unit}</dt>
            <dd className="font-semibold tabular-nums">{formatAmount(item.current, item.unit)}</dd>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Kosten</dt><dd>{formatCost(summary.cost_eur)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Zähler</dt><dd>{summary.meter_count}</dd></div>
        </div>
        <div className="text-sm"><dt className="text-xs text-muted-foreground">Vergleich</dt><dd><Comparison series={series} /></dd></div>
      </dl>
      {showChart && <EnergyChart points={series.points} unit={series.unit} compact />}
      <Button className="mt-4 justify-between px-0" variant="link" asChild>
        <Link to={to} aria-label={summary.label + ' im Detail'}>Details <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </Button>
    </article>
  );
}

function ReadingHistory({ data, offset, onOffset, buildingName, detail }) {
  const columns = ['Verbrauchsart', 'Gebäude / Nutzungseinheit', 'Zähler', 'Zählerstand', 'Ablesedatum', 'Verbrauchszeitraum', 'Verbrauch', 'Kosten', 'Datenquelle'];
  return (
    <section className="surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h3 className="font-heading font-semibold">Verbrauchshistorie</h3>
        <p className="text-sm text-muted-foreground">{data.reading_count} Datensätze</p>
      </div>
      {!data.readings.length ? <p className="p-5 text-sm text-muted-foreground">Für diese Filter liegen keine Verbrauchswerte vor.</p> : (
        <>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Verbrauchshistorie">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>{(detail ? columns.slice(1) : columns).map((label) => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.readings.map((row) => (
                  <tr key={row.id}>
                    {!detail && <td className="px-4 py-3 font-medium">{ENERGY_MEDIA[row.medium]?.[0] || row.medium}</td>}
                    <td className="px-4 py-3">{buildingName(row.building_id)}{(row.unit_name || row.unit_id) && <span className="block text-xs text-muted-foreground">{row.unit_name || row.unit_id}</span>}</td>
                    <td className="px-4 py-3">{row.meter_name || row.meter_code || '–'}{row.meter_name && row.meter_code && <span className="block text-xs text-muted-foreground">{row.meter_code}</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatAmount(row.meter_reading, row.unit)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatEnergyDate(row.reading_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatPeriod(row.period_start, row.period_end)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatAmount(row.value, row.unit)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatCost(row.cost_eur)}</td>
                    <td className="px-4 py-3">{readingSource(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.reading_count > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-3">
              <p className="mr-auto text-sm text-muted-foreground">{offset + 1}–{Math.min(offset + PAGE_SIZE, data.reading_count)} von {data.reading_count}</p>
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))}>Zurück</Button>
              <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= data.reading_count} onClick={() => onOffset(offset + PAGE_SIZE)}>Weiter</Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SitesReference({ reference, electricity }) {
  return (
    <section className="surface space-y-4 p-5">
      <div>
        <h3 className="font-heading font-semibold">Kennzahlen aus dem Gebäudepass</h3>
        <p className="text-sm text-muted-foreground">ChatGPT Sites · Demo · {formatEnergyMonth(reference.month)}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {reference.metrics.map((metric) => <div className="rounded-xl bg-muted/60 p-3" key={metric.label}>
          <dt className="text-sm text-muted-foreground">{metric.label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatAmount(metric.value, metric.unit)}</dd>
          <dd className="text-sm text-muted-foreground">{metric.note}</dd>
        </div>)}
      </dl>
      {electricity && <div><h4 className="font-heading text-sm font-semibold">Monatlicher Stromverbrauch</h4><EnergyChart points={electricity.points} unit={electricity.unit} /></div>}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Betriebliche Hinweise aus dem Demo-Bestand</summary>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">{reference.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
      </details>
    </section>
  );
}

function EnergyDetails({ summary, buildingName }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5"><p className="text-sm text-muted-foreground">Kosten im Zeitraum</p><p className="text-xl font-semibold">{formatCost(summary.cost_eur)}</p></div>
        <div className="surface p-5"><p className="text-sm text-muted-foreground">Zähler im Zeitraum</p><p className="text-xl font-semibold">{summary.meter_count}</p></div>
        <div className="surface p-5"><p className="text-sm text-muted-foreground">Letztes Ablesedatum</p><p className="text-xl font-semibold">{formatEnergyDate(summary.latest?.reading_date)}</p></div>
      </div>
      {summary.meters.length > 0 && (
        <section className="surface p-5">
          <h3 className="font-heading font-semibold">Zähler und letzte Ablesungen</h3>
          <ul className="mt-2 divide-y divide-border">
            {summary.meters.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-x-5 gap-y-1 py-2 text-sm"><span><strong>{row.meter_name || row.meter_code}</strong> · {buildingName(row.building_id)}{(row.unit_name || row.unit_id) && ' · ' + (row.unit_name || row.unit_id)}</span><span className="tabular-nums">{formatAmount(row.meter_reading, row.unit)} · {formatEnergyDate(row.reading_date)}</span></li>)}
          </ul>
        </section>
      )}
      {summary.series.map((series) => (
        <section key={series.unit} className="surface min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-heading font-semibold">{summary.medium === 'warmwasser' && series.unit === 'kWh' ? 'Energie zur Warmwasserbereitung' : 'Verbrauchsentwicklung'}<span className="ml-2 text-sm font-normal text-muted-foreground">{series.unit}</span></h3>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatAmount(series.current, series.unit)}</p>
            </div>
            <div className="text-sm"><p className="text-xs text-muted-foreground">Vergleich zum Vorzeitraum</p><Comparison series={series} /></div>
          </div>
          <EnergyChart points={series.points} unit={series.unit} />
        </section>
      ))}
    </>
  );
}

export default function Energy() {
  const { medium = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState(() => localStorage.getItem('d21-selected-team') || '');
  const [dialog, setDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const selection = useBuildingScope();
  const buildings = selection.readable('energy');
  const headers = buildingScopeHeaders(buildings);
  const requestedBuilding = params.get('building');
  const building = buildings.length === 1 ? String(buildings[0].id)
    : buildings.some(row => String(row.id) === requestedBuilding) ? requestedBuilding : '';
  const unit = building === requestedBuilding ? params.get('unit') || '' : '';
  const months = params.get('months') || '12';
  const source = params.get('source') || '';
  const end = params.get('end') || '';
  const offset = Number(params.get('offset')) || 0;
  const validMedium = !medium || Object.hasOwn(ENERGY_MEDIA, medium);
  const queryParams = new URLSearchParams({ building, unit, months, source, medium, offset: String(offset), ...(end ? { end } : {}) });

  const energy = useQuery({
    queryKey: ['energy-consumption', scope, headers['X-D21-Buildings'], queryParams.toString()],
    queryFn: () => request('/energy-consumption?' + queryParams, { headers }),
    enabled: validMedium,
    retry: false,
  });
  const teams = useQuery({ queryKey: ['energy-teams', scope], queryFn: () => request('/teams'), retry: false });
  const canImport = teams.data?.some((team) => team.is_owner && String(team.id) === scope);
  const data = energy.data;

  useEffect(() => {
    const changeTeam = () => {
      const nextScope = localStorage.getItem('d21-selected-team') || '';
      setScope(nextScope);
      setDialog(false);
      if (!scope || scope === nextScope) return;
      setParams((old) => {
        const next = new URLSearchParams(old);
        ['building', 'unit', 'source', 'offset'].forEach((key) => next.delete(key));
        return next;
      }, { replace: true });
    };
    window.addEventListener('d21-team-change', changeTeam);
    return () => window.removeEventListener('d21-team-change', changeTeam);
  }, [scope, setParams]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    next.delete('offset');
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };
  const urlFor = (key) => {
    const next = new URLSearchParams(params);
    next.delete('offset');
    return { pathname: '/energie' + (key ? '/' + key : ''), search: next.toString() };
  };
  const importHistory = async () => {
    setImporting(true);
    try {
      const { data: result } = await base44.functions.invoke('seedPassportEnergy', {});
      update({ building: result.building_id, unit: '', source: 'demo', months: '12', end: result.reference_month });
      await energy.refetch();
      toast({ title: 'Gebäudepass-Demo verfügbar', description: result.readings_created ? 'Monatswerte und Kennzahlen aus ChatGPT Sites wurden übernommen.' : 'Die Historie war bereits vorhanden.' });
    } catch (error) {
      toast({ title: 'Import fehlgeschlagen', description: error.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };
  const showSavedReading = (row) => {
    const next = new URLSearchParams(params);
    next.set('building', row.building_id);
    next.set('source', row.source);
    next.delete('offset');
    if (row.unit_id) next.set('unit', row.unit_id);
    else next.delete('unit');
    if (months !== 'all') next.set('end', (row.period_end || row.period_start || row.reading_date).slice(0, 7));
    navigate({ pathname: medium ? '/energie/' + row.medium : '/energie', search: next.toString() });
    energy.refetch();
  };

  const buildingName = (id) => data?.buildings.find((row) => row.id === id)?.name || 'Ohne Gebäudezuordnung';
  const editableBuildings = data?.buildings.filter((row) => row.can_edit) || [];
  const visibleMedia = [...new Set([...(data?.media || Object.keys(ENERGY_MEDIA).slice(0, 4)), ...(validMedium && medium ? [medium] : [])])];
  const buildingOptions = [...(buildings.length === 1 ? [] : [{ ...ALL, label: 'Alle Gebäude' }]), ...(data?.buildings || []).map((row) => ({ value: row.id, label: row.name }))];

  const title = validMedium && medium ? ENERGY_MEDIA[medium][0] : 'Energie';
  return (
    <div className="space-y-5">
      {medium && <Link to={urlFor('')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Energieübersicht</Link>}
      <PageHeader title={title} description="Verbräuche, Zählerstände und Kosten nach Gebäude und Nutzungseinheit.">
        {canImport && !medium && <Button variant="outline" size="sm" disabled={importing} onClick={importHistory}>{importing ? 'Import läuft …' : 'Gebäudepass-Demo übernehmen'}</Button>}
        {editableBuildings.length > 0 && <Button size="sm" onClick={() => setDialog(true)}><Plus className="mr-2 h-4 w-4" aria-hidden /> Ablesung erfassen</Button>}
      </PageHeader>

      <div className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Verbrauchsfilter">
        <SelectField label="Gebäude" aria-label="Gebäude" value={building} options={buildingOptions} onChange={(e) => update({ building: e.target.value, unit: '' })} />
        <SelectField label="Nutzungseinheit" aria-label="Nutzungseinheit" value={unit} options={[{ ...ALL, label: 'Alle Nutzungseinheiten' }, ...(data?.units || []).map((row) => ({ value: row.id, label: row.name }))]} onChange={(e) => update({ unit: e.target.value })} />
        <SelectField label="Verbrauchsart" aria-label="Verbrauchsart" value={medium} options={[{ ...ALL, label: 'Alle Verbrauchsarten' }, ...visibleMedia.map(mediumOption)]} onChange={(e) => { setDialog(false); navigate(urlFor(e.target.value)); }} />
        <SelectField label="Zeitraum" aria-label="Zeitraum" value={months} options={PERIODS} onChange={(e) => update({ months: e.target.value })} />
        <TextField label="Endmonat" aria-label="Endmonat" type="month" disabled={months === 'all'} value={end || data?.end || ''} onChange={(e) => update({ end: e.target.value })} />
        <SelectField label="Datenbestand" aria-label="Datenbestand" value={source || data?.source || 'real'} options={[{ value: 'real', label: 'Echte Daten' }, { value: 'demo', label: 'Demo-Daten' }]} onChange={(e) => update({ source: e.target.value, unit: '' })} />
      </div>

      {!validMedium && <p className="surface p-5">Diese Verbrauchsart ist unbekannt.</p>}
      {energy.isLoading && <p role="status" className="surface p-5 text-sm text-muted-foreground">Verbrauchsdaten werden geladen …</p>}
      {energy.isError && <div className="surface flex flex-wrap items-center justify-between gap-2 p-5" role="alert"><p>{energy.error.message}</p><Button size="sm" variant="outline" onClick={() => building ? update({ building: '', unit: '' }) : energy.refetch()}>{building ? 'Alle Gebäude anzeigen' : 'Erneut laden'}</Button></div>}
      {data && (
        <>
          <p className="px-1 text-sm text-muted-foreground">{dayRange(data.ranges.current)}{data.ranges.previous && ' · Vorzeitraum ' + dayRange(data.ranges.previous)}</p>
          {medium ? (data.summaries[0] && <EnergyDetails summary={data.summaries[0]} buildingName={buildingName} />) : (
            <>
              <section aria-label="Verbrauchsarten" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {data.summaries.map((summary) => <ConsumptionCard key={summary.medium} summary={summary} to={urlFor(summary.medium)} showChart={!data.reference || summary.medium !== 'strom'} />)}
              </section>
              {data.reference && <SitesReference reference={data.reference} electricity={data.summaries.find((summary) => summary.medium === 'strom')?.series[0]} />}
            </>
          )}
          <ReadingHistory data={data} offset={offset} onOffset={(value) => update({ offset: value ? String(value) : '' })} buildingName={buildingName} detail={Boolean(medium)} />
        </>
      )}
      {dialog && <ReadingDialog buildings={editableBuildings} selectedBuilding={building} selectedMedium={medium} onClose={() => setDialog(false)} onSaved={showSavedReading} />}
    </div>
  );
}
