import { useBuildingScope, buildingScopeHeaders } from '@/hooks/useBuildingScope';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BatteryCharging, CalendarDays, ChevronDown, Droplet, Droplets, Flame, Gauge, LayoutGrid, Plus, ReceiptText, Settings2, SlidersHorizontal, Sun, Zap } from 'lucide-react';
import { base44, request } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { SelectField, TextField } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import EnergyChart from '@/components/energy/EnergyChart';
import EnergyDashboard from '@/components/energy/EnergyDashboard';
import { EnergyLiveOverview, EnergyStorage, EnergyUsage } from '@/components/energy/EnergyLiveViews';
import EnergyBilling from '@/components/energy/EnergyBilling';
import EnergySourceSettings from '@/components/energy/EnergySourceSettings';
import ReadingDialog from '@/components/energy/ReadingDialog';
import '@/components/energy/energy-monitor.css';
import { ENERGY_MEDIA, formatAmount, formatCost, formatEnergyDate, formatEnergyMonth, formatPeriod, readingSource } from '@/lib/energy';

const ALL = { value: '', label: 'Alle' };
const PAGE_SIZE = 50;
const PERIODS = [
  { value: '1', label: '1 Monat' }, { value: '3', label: '3 Monate' },
  { value: '12', label: '12 Monate' }, { value: 'all', label: 'Gesamte Historie' },
];
const ICONS = { strom: Zap, waerme: Flame, wasser: Droplets, warmwasser: Droplet, kaltwasser: Droplet };
const MEDIA_GROUPS = {
  strom: ['strom', 'netzbezug', 'pv_erzeugung', 'eigenverbrauch', 'einspeisung'],
  wasser: ['wasser', 'kaltwasser', 'warmwasser'],
};
const NAVIGATION = [
  { medium: 'strom', label: 'Strom', icon: Zap },
  { medium: 'wasser', label: 'Wasser', icon: Droplets },
  { medium: 'alle', label: 'Alle', name: 'Alle Verbrauchsarten', icon: LayoutGrid },
];
const SECTIONS = [
  { key: 'uebersicht', title: 'Übersicht', icon: LayoutGrid },
  { key: 'verlauf', title: 'Erzeugung', water: 'Verbrauch', icon: Sun, waterIcon: Gauge },
  { key: 'speicher', title: 'Speicher', icon: BatteryCharging, waterIcon: Droplets },
  { key: 'abrechnung', title: 'Abrechnung', icon: ReceiptText },
];
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
      {showChart && <EnergyChart series={[series]} compact />}
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
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
      {electricity && <div><h4 className="font-heading text-sm font-semibold">Monatlicher Stromverbrauch</h4><EnergyChart series={[electricity]} /></div>}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Betriebliche Hinweise aus dem Demo-Bestand</summary>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">{reference.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
      </details>
    </section>
  );
}

export default function Energy() {
  const { medium: pathMedium = 'strom' } = useParams();
  const medium = pathMedium === 'alle' ? '' : pathMedium;
  const family = Object.keys(MEDIA_GROUPS).find((key) => MEDIA_GROUPS[key].includes(medium)) || '';
  const groupedHistory = Boolean(family) && family === medium;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const cache = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const { toast } = useToast();
  const selection = useBuildingScope();
  const buildings = selection.readable('energy');
  const headers = buildingScopeHeaders(buildings);
  const building = buildings.length === 1 ? String(buildings[0].id) : '';
  const unit = building ? params.get('unit') || '' : '';
  const months = params.get('months') || '12';
  const source = params.get('source') || '';
  const end = params.get('end') || '';
  const offset = Number(params.get('offset')) || 0;
  const validMedium = !medium || Object.hasOwn(ENERGY_MEDIA, medium);
  const section = family ? SECTIONS.find((item) => item.key === params.get('ansicht'))?.key || 'uebersicht' : 'uebersicht';
  const queryParams = new URLSearchParams({
    building, unit, months, source, medium: groupedHistory ? '' : medium, offset: String(offset),
    ...(family ? { group: family } : {}), ...(end ? { end } : {}), ...(section === 'abrechnung' ? { billing: '1' } : {}),
  });

  const energy = useQuery({
    queryKey: ['energy-consumption', selection.team?.id, headers['X-D21-Buildings'], queryParams.toString()],
    queryFn: () => request('/energy-consumption?' + queryParams, { headers }),
    enabled: validMedium,
    retry: false,
  });
  const canImport = selection.team?.is_owner && selection.value === 'all';
  const data = energy.data;
  const liveEnabled = Boolean(family && building && !unit && data?.source === 'real');
  const liveQuery = useQuery({
    queryKey: ['energy-live', selection.team?.id, building, family],
    queryFn: () => request('/buildings/' + building + '/energy/live?medium=' + family, { headers }),
    enabled: liveEnabled,
    refetchInterval: 60000,
    retry: false,
  });
  const live = liveEnabled ? liveQuery.data : undefined;

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
    return { pathname: '/energie/' + (key || 'alle'), search: next.toString() };
  };
  const importHistory = async () => {
    setImporting(true);
    try {
      const { data: result } = await base44.functions.invoke('seedPassportEnergy', {});
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['teams'] }),
        cache.invalidateQueries({ queryKey: ['building-navigation', String(selection.team?.id)] }),
        cache.invalidateQueries({ queryKey: ['energy-consumption'] }),
      ]);
      update({ building: result.building_id, unit: '', source: 'demo', months: '12', end: result.reference_month });
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
    next.delete('ansicht');
    if (row.unit_id) next.set('unit', row.unit_id);
    else next.delete('unit');
    if (months !== 'all') next.set('end', (row.period_end || row.period_start || row.reading_date).slice(0, 7));
    navigate({ pathname: '/energie/' + (medium ? row.medium : 'alle'), search: next.toString() });
    void cache.invalidateQueries({ queryKey: ['energy-consumption'] });
  };

  const buildingName = (id) => data?.buildings.find((row) => row.id === id)?.name || 'Ohne Gebäudezuordnung';
  const editableBuildings = data?.buildings.filter((row) => row.can_edit) || [];
  const canConfigure = Boolean(family && building && editableBuildings.some((row) => row.id === building));
  const canReadDocuments = selection.readable('documents').some((row) => String(row.id) === building);
  const configure = canConfigure && <button type="button" className="font-medium text-primary underline" onClick={() => setShowSources(true)}>Messquellen öffnen</button>;
  const visibleMedia = [...new Set(['strom', 'wasser', ...(data?.media || Object.keys(ENERGY_MEDIA).slice(0, 4)), ...(validMedium && medium ? [medium] : [])])];
  const group = selection.value.startsWith('group:');
  const options = selection.building ? selection.readable('energy', { team: true }) : buildings;
  const buildingOptions = [
    { ...ALL, label: group ? selection.label : 'Alle Gebäude' },
    ...options.map(row => ({ value: String(row.id), label: row.name })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Energie" description={selection.label}>
        {canImport && <Button variant="outline" size="sm" disabled={importing} onClick={importHistory}>{importing ? 'Import läuft …' : 'Gebäudepass-Demo übernehmen'}</Button>}
        {editableBuildings.length > 0 && <Button size="sm" onClick={() => setDialog(true)}><Plus aria-hidden /> Ablesung erfassen</Button>}
      </PageHeader>

      <div className="energy-controls">
        <nav className="energy-navigation" aria-label="Energieübersicht">
          {NAVIGATION.map(({ medium: key, label, name, icon: Icon }) => (
            <Link key={key} to={urlFor(key)} data-medium={key} aria-label={name} aria-current={key === (family || 'alle') ? 'page' : undefined}>
              <Icon size={17} aria-hidden />{label}
            </Link>
          ))}
        </nav>
        <div className="energy-control-actions">
          <div className="energy-select">
            <CalendarDays size={16} aria-hidden />
            <select aria-label="Zeitraum" value={months} onChange={(e) => update({ months: e.target.value })}>
              {PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden />
          </div>
          <Button variant="outline" className="h-10 rounded-xl" aria-expanded={showFilters} aria-controls="energy-filters" onClick={() => setShowFilters((value) => !value)}>
            <SlidersHorizontal aria-hidden /> Filter
          </Button>
        </div>
      </div>
      {family && (
        <div className="energy-controls">
          <nav className="energy-section-nav" aria-label="Bereiche im Energie-Reiter">
            {SECTIONS.map(({ key, title, water, icon, waterIcon }) => {
              const Icon = family === 'wasser' && waterIcon ? waterIcon : icon;
              return <button key={key} type="button" aria-pressed={section === key}
                onClick={() => update({ ansicht: key === 'uebersicht' ? '' : key })}><Icon size={16} aria-hidden />{family === 'wasser' && water ? water : title}</button>;
            })}
          </nav>
          {canConfigure && <Button variant="outline" className="rounded-xl" onClick={() => setShowSources(true)}><Settings2 /> Messquellen und Tarife</Button>}
        </div>
      )}
      <div className={showFilters ? 'surface grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5' : 'hidden'} id="energy-filters" aria-label="Verbrauchsfilter">
        <SelectField label="Gebäude" aria-label="Gebäude" value={selection.building ? building : ''} options={buildingOptions}
          onChange={event => selection.choose(event.target.value ? 'building:' + event.target.value : 'all')} />
        <SelectField label="Nutzungseinheit" aria-label="Nutzungseinheit" value={unit} options={[{ ...ALL, label: 'Alle Nutzungseinheiten' }, ...(data?.units || []).map((row) => ({ value: row.id, label: row.name }))]} onChange={(e) => update({ unit: e.target.value })} />
        <SelectField label="Verbrauchsart" aria-label="Verbrauchsart" value={medium} options={[{ ...ALL, label: 'Alle Verbrauchsarten' }, ...visibleMedia.map(mediumOption)]} onChange={(e) => navigate(urlFor(e.target.value))} />
        <TextField label="Endmonat" aria-label="Endmonat" type="month" disabled={months === 'all'} value={end || data?.end || ''} onChange={(e) => update({ end: e.target.value })} />
        <SelectField label="Datenbestand" aria-label="Datenbestand" value={source} options={[{ value: '', label: 'Automatisch' }, { value: 'real', label: 'Echte Daten' }, { value: 'demo', label: 'Demo-Daten' }]} onChange={(e) => update({ source: e.target.value, unit: '' })} />
      </div>

      {!validMedium && <p className="surface p-5">Diese Verbrauchsart ist unbekannt.</p>}
      {energy.isLoading && <p role="status" className="surface p-5 text-sm text-muted-foreground">Verbrauchsdaten werden geladen …</p>}
      {energy.isError && <div className="surface flex flex-wrap items-center justify-between gap-2 p-5" role="alert"><p>{energy.error.message}</p><Button size="sm" variant="outline" onClick={() => energy.refetch()}>Erneut laden</Button></div>}
      {liveEnabled && liveQuery.isError && (
        <div className="surface flex items-center justify-between gap-3 p-4 text-sm" role="alert">
          <p>Live-Messwerte konnten nicht geladen werden.</p>
          <Button size="sm" variant="outline" onClick={() => liveQuery.refetch()}>Live-Daten erneut laden</Button>
        </div>
      )}
      {family && section !== 'uebersicht' && (!building || unit) && (
        <p className="surface p-4 text-sm text-muted-foreground">Wähle für Live-Messwerte und Speicher ein einzelnes Gebäude und alle Nutzungseinheiten.</p>
      )}
      {data && (
        <>
          {section === 'verlauf' && <EnergyUsage key={family} family={family} data={data} live={live} configure={configure} />}
          {section === 'speicher' && <EnergyStorage key={building + family} family={family} live={live} configure={configure} />}
          {section === 'abrechnung' && <EnergyBilling data={data} family={family} live={live} building={building} headers={headers}
            teamId={selection.team?.id} canReadDocuments={canReadDocuments} />}
          {section === 'uebersicht' && (medium ? (
            data.summaries.some((item) => item.medium === medium) &&
            <EnergyDashboard data={data} medium={medium} family={family} urlFor={urlFor} buildingName={buildingName}>
              <EnergyLiveOverview key={building + family} family={family} live={live} />
            </EnergyDashboard>
          ) : (
            <>
              <p className="px-1 text-sm text-muted-foreground">
                {data.ranges.current ? formatPeriod(data.ranges.current.from, data.ranges.current.to) : 'Gesamte Historie'}
                {data.ranges.previous && ' · Vorzeitraum ' + formatPeriod(data.ranges.previous.from, data.ranges.previous.to)}
                {data.source === 'demo' && ' · Demo-Daten'}
              </p>
              <section aria-label="Verbrauchsarten" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {data.summaries.map((summary) => <ConsumptionCard key={summary.medium} summary={summary} to={urlFor(summary.medium)} showChart={!data.reference || summary.medium !== 'strom'} />)}
              </section>
              {data.reference && <SitesReference reference={data.reference} electricity={data.summaries.find((summary) => summary.medium === 'strom')?.series[0]} />}
            </>
          ))}
          {section === 'uebersicht' && <ReadingHistory data={data} offset={offset} onOffset={(value) => update({ offset: value ? String(value) : '' })}
            buildingName={buildingName} detail={Boolean(medium) && !groupedHistory} />}
        </>
      )}
      {dialog && <ReadingDialog buildings={editableBuildings} selectedBuilding={building} selectedMedium={medium} onClose={() => setDialog(false)} onSaved={showSavedReading} />}
      {showSources && canConfigure && <EnergySourceSettings key={building + family} building={building} family={family} headers={headers}
        teamId={selection.team?.id} onClose={() => setShowSources(false)} />}
    </div>
  );
}
