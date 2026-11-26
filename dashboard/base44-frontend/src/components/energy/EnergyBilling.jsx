import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { formatAmount, formatCost, formatEnergyDate, formatPeriod } from '@/lib/energy';
import { MonitorFigure } from './EnergyLiveViews';
import EnergyChart from './EnergyChart';
import EnergyTimeChart from './EnergyTimeChart';

const number = new Intl.NumberFormat('de-DE', { useGrouping: false, maximumFractionDigits: 6 });
const rateNumber = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const rate = (value, unit) => Number.isFinite(value) ? rateNumber.format(value) + ' €/' + unit : 'Keine Daten';
const amount = (item) => item?.series[0].current ?? null;
const minute = (time) => +time.slice(0, 2) * 60 + +time.slice(3);
const multiply = (quantity, price) => Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : null;
const colors = ['var(--energy-chart)', '#377eab', '#b76a31', '#8868b1', '#6c7887'];

function download(blob, file) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function csvCell(value) {
  if (typeof value === 'number') return number.format(value);
  const text = String(value ?? '');
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) ? "'" + text : text;
  return /[;"\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}

function downloadReport(items, data, family) {
  const rows = [['Datenbestand', 'Monat', 'Verbrauchsart', 'Einheit', 'Menge', 'Erfasste Kosten in EUR']];
  for (const item of items) {
    for (const series of item.series) {
      const quantities = new Map(series.points.map((point) => [point.month, point.value]));
      const costs = new Map(item.billing?.units?.[series.unit]?.map((point) => [point.month, point.value]));
      const months = [...new Set([...quantities.keys(), ...costs.keys()])].sort();
      for (const month of months) {
        const cells = [quantities.get(month), costs.get(month)];
        if (cells.some((value) => value != null)) rows.push([data.source === 'demo' ? 'Demo' : 'Echt', month, item.label, series.unit, ...cells]);
      }
    }
  }
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), family + '-verbrauchsauszug.csv');
}

function Tariff({ settings, water, grid }) {
  const { reduced_from: from, reduced_to: to, reduced_rate: reduced, standard_rate: standard } = settings;
  const split = reduced != null && from && to;
  const points = split ? [...new Set([0, minute(from), minute(to), 1440])].sort((a, b) => a - b) : [0, 1440];
  const windows = points.slice(0, -1).map((start, index) => {
    const discounted = split && (from < to ? start >= minute(from) && start < minute(to) : start >= minute(from) || start < minute(to));
    return { start, end: points[index + 1], discounted };
  });
  return (
    <section className="surface energy-panel">
      <h3>{water ? 'Wassertarif' : 'Tarifzeiten'}</h3>
      {water ? <p className="mt-2 text-sm">{rate(settings.water_rate, 'm³')}</p> : (
        <>
          <dl className="energy-figures mt-3">
            <MonitorFigure label="Standardtarif" value={rate(standard, 'kWh')} />
            {split && <MonitorFigure label="Reduzierter Tarif" value={rate(reduced, 'kWh')} hint={from + '–' + to + ' Uhr'} />}
            {settings.export_rate != null && <MonitorFigure label="Einspeisevergütung" value={rate(settings.export_rate, 'kWh')} />}
          </dl>
          {split && <div className="energy-tariff" aria-hidden="true">
            {windows.map((item) => <span key={item.start} data-reduced={Boolean(item.discounted)} style={{ flex: item.end - item.start }} />)}
          </div>}
          {grid?.points.length > 0 && <>
            <h4 className="mt-4 text-sm font-semibold">Gemessene Netzleistung heute</h4>
            <p className="energy-caption">Bezug &gt; 0 W · Einspeisung &lt; 0 W</p>
            <EnergyTimeChart unit="W" bars series={[{ label: 'Netzleistung', points: grid.points }]} />
          </>}
        </>
      )}
    </section>
  );
}

function Invoices({ building, headers, teamId }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const files = useQuery({
    queryKey: ['energy-invoices', teamId, building],
    queryFn: () => request('/buildings/' + building + '/documents', { headers }),
    retry: false,
  });
  const invoices = (files.data || []).filter((item) => item.category === 'abrechnung');
  async function open(item) {
    setError('');
    setPending(item.id);
    try {
      download(await request('/documents/' + item.id, { raw: true, headers }), item.name);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="surface energy-panel">
      <div className="energy-trend-heading">
        <h3>Rechnungen und Abrechnungen</h3>
        <Link className="text-sm text-primary underline underline-offset-2" to={{ pathname: '/dokumente', search: 'building=' + building }}>Gebäudedokumente</Link>
      </div>
      {(files.isError || error) && <p role="alert" className="mt-3 text-sm text-destructive">{error || files.error.message}</p>}
      {files.isPending && <p className="energy-caption mt-3">Dokumente werden geladen …</p>}
      {files.isSuccess && invoices.length === 0 && <p className="energy-caption mt-3">In den Gebäudedokumenten sind noch keine Dateien als Abrechnung hinterlegt.</p>}
      <ul className="energy-rows">
        {invoices.map((item) => (
          <li key={item.id} className="energy-meter-row">
            <div className="min-w-0">
              <p className="flex items-start gap-2 break-words font-medium"><FileText size={16} className="shrink-0" />{item.name}</p>
              <p className="energy-caption">{formatEnergyDate(item.created_at)}</p>
            </div>
            <Button variant="outline" size="icon" disabled={pending != null} onClick={() => open(item)} aria-label={item.name + ' herunterladen'}><Download /></Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function EnergyBilling({ data, family, live, building, headers, teamId, canReadDocuments }) {
  const water = family === 'wasser';
  const settings = live?.settings || {};
  const summaries = new Map(data.summaries.map((item) => [item.medium, item]));
  const primary = summaries.get(family);
  const imported = summaries.get('netzbezug');
  const exported = summaries.get('einspeisung');
  const self = summaries.get('eigenverbrauch');
  const costs = data.summaries.filter((item) => item.cost_eur != null || item.billing?.previous != null);
  const costSeries = costs.map((item, index) => ({
    unit: '€', label: item.label, points: item.billing?.points || [], color: colors[index % colors.length],
  }));
  const net = amount(imported) != null && amount(exported) != null ? amount(imported) - amount(exported) : null;
  const estimate = water ? multiply(amount(primary), settings.water_rate) :
    settings.reduced_rate == null ? multiply(amount(imported), settings.standard_rate) : null;
  const savings = !water && settings.reduced_rate == null ? multiply(amount(self), settings.standard_rate) : null;
  const credit = water ? null : multiply(amount(exported), settings.export_rate);
  const dateRange = data.ranges.current ? formatPeriod(data.ranges.current.from, data.ranges.current.to) : 'Gesamte Historie';

  return (
    <div className="energy-dashboard" data-family={family}>
      <section className="surface energy-panel">
        <div className="energy-trend-heading">
          <div><h3>Abrechnung im gewählten Zeitraum</h3><p className="energy-caption mt-1">{dateRange}{data.source === 'demo' && ' · Demo-Daten'}</p></div>
          <Button variant="outline" disabled={!data.summaries.some((item) => item.series.some((series) => series.points.length) || item.billing?.points.length)}
            onClick={() => downloadReport(data.summaries, data, family)}><Download /> Verbrauchsauszug (CSV)</Button>
        </div>
        <dl className="energy-figures mt-4">
          {(costs.length ? costs : [primary]).filter(Boolean).map((item) => <MonitorFigure key={item.medium}
            label={'Erfasste Kosten · ' + item.label} value={formatCost(item.cost_eur)}
            hint={item.billing?.previous != null && 'Vorzeitraum ' + formatCost(item.billing.previous)} />)}
          {primary?.billing?.average_rate != null && <MonitorFigure label="Ø erfasster Preis" value={rate(primary.billing.average_rate, primary.series[0].unit)}
            hint="Aus Ablesungen mit Menge und Kosten" />}
          {estimate != null && <MonitorFigure label={water ? 'Geschätzte Mengenkosten' : 'Geschätzte Bezugskosten'} value={formatCost(estimate)} hint="Menge × hinterlegter Arbeitspreis" />}
          {savings != null && <MonitorFigure label="Geschätzte Ersparnis durch Eigenverbrauch" value={formatCost(savings)} hint="Eigenverbrauch × Standardtarif" />}
          {credit != null && <MonitorFigure label="Geschätzte Einspeisevergütung" value={formatCost(credit)} />}
        </dl>
      </section>
      <div className="energy-grid">
        <section className="surface energy-panel">
          <h3>Kostenverlauf pro Monat</h3>
          <EnergyChart series={costSeries} range={data.ranges.current} legend />
        </section>
        {building && data.source !== 'demo' && <Tariff settings={settings} water={water} grid={live?.channels.grid} />}
      </div>
      {!water && <section className="surface energy-panel">
        <h3>Netzbilanz</h3>
        <dl className="energy-figures mt-3">
          <MonitorFigure label="Netzbezug" value={formatAmount(amount(imported), 'kWh')} />
          <MonitorFigure label="Einspeisung" value={formatAmount(amount(exported), 'kWh')} />
          <MonitorFigure label="Bezug abzüglich Einspeisung" value={formatAmount(net, 'kWh')} />
        </dl>
        <EnergyChart series={[imported, exported].filter(Boolean).map((item, index) => ({
          ...item.series[0], label: item.label, color: colors[index],
        }))} range={data.ranges.current} legend />
      </section>}
      {building && canReadDocuments && data.source !== 'demo' && <Invoices building={building} headers={headers} teamId={teamId} />}
    </div>
  );
}
