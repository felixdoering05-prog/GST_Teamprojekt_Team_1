import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Droplets, Euro, Flame, Gauge, Minus, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import EnergyChart from './EnergyChart';
import { ENERGY_MEDIA, formatAmount, formatCost, formatEnergyDate, formatPeriod } from '@/lib/energy';
import './energy-dashboard.css';

const signedPercent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const titles = { strom: 'Stromverbrauch', wasser: 'Wasserverbrauch' };

function PeriodComparison({ series }) {
  const { current, previous, unit } = series;
  if (previous == null || current == null) return <p className="energy-hero-comparison">Kein Vergleichswert</p>;
  const delta = current - previous;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const change = previous === 0 ? (delta > 0 ? '+' : '') + formatAmount(delta, unit) : signedPercent.format(delta / previous);
  return (
    <div className="energy-hero-comparison">
      <span className="energy-change"><Icon size={15} aria-hidden />{change}</span>
      <span>Vorzeitraum {formatAmount(previous, unit)}</span>
    </div>
  );
}

function ConsumptionHero({ family, summary, highlights, splitWater, range, source }) {
  const Icon = family === 'wasser' ? Droplets : family === 'strom' ? Zap : summary.medium === 'waerme' ? Flame : Gauge;
  return (
    <section className="energy-hero" aria-labelledby="energy-consumption-title">
      <div className="energy-hero-content">
        <div className="energy-hero-heading">
          <span className="energy-hero-icon"><Icon size={21} aria-hidden /></span>
          <h3 id="energy-consumption-title">{titles[summary.medium] || summary.label}</h3>
        </div>
        <dl className="energy-hero-values">
          {highlights.map((item) => {
            const { current, unit } = item.series[0];
            return (
              <div key={item.medium}>
                <dt className={splitWater ? undefined : 'sr-only'}>{splitWater ? item.label : 'Verbrauch im Zeitraum'}</dt>
                <dd className="energy-total" data-empty={current == null}>
                  {current == null ? 'Keine Daten' : <>{formatAmount(current, '')}<span>{' '}{unit}</span></>}
                </dd>
              </div>
            );
          })}
        </dl>
        {splitWater ? <p className="energy-hero-comparison">Kein Gesamtwert im Zeitraum</p> :
          range && <PeriodComparison series={summary.series[0]} />}
        <div className="energy-hero-period">
          <span><CalendarDays size={15} aria-hidden />{range ? formatPeriod(range.from, range.to) : 'Gesamte Historie'}</span>
          {source === 'demo' && <span className="energy-demo">Demo-Daten</span>}
        </div>
      </div>
    </section>
  );
}

function EnergyMetric({ title, icon: Icon, values, hint }) {
  return (
    <section className="surface energy-metric">
      <div className="energy-panel-heading">
        <span className="energy-panel-icon"><Icon size={17} aria-hidden /></span>
        <h3>{title}</h3>
      </div>
      <dl className="energy-metric-values">
        {values.map(({ label, value, empty }) => (
          <div key={label}>
            <dt className={label === title ? 'sr-only' : undefined}>{label}</dt>
            <dd className="energy-metric-value" data-empty={empty}>{value}</dd>
          </div>
        ))}
      </dl>
      {hint && <p className="energy-caption">{hint}</p>}
    </section>
  );
}

function ConsumptionTrend({ series, range, title, showTotal = false }) {
  const { current, previous, unit } = series[0];
  return (
    <section className="surface energy-panel min-w-0">
      <div className="energy-trend-heading">
        <div>
          <h3>{title}</h3>
          <p className="energy-caption">Verbrauch pro Monat · {unit}</p>
        </div>
        {showTotal && (
          <div>
            <p className="font-heading text-lg font-semibold tabular-nums">{formatAmount(current, unit)}</p>
            {previous != null && <p className="energy-caption">Vorzeitraum {formatAmount(previous, unit)}</p>}
          </div>
        )}
        {series.length > 1 && (
          <ul className="energy-legend" aria-label="Verbrauchsarten">
            {series.map((item) => <li key={item.label}><span style={{ background: item.color }} />{item.label}</li>)}
          </ul>
        )}
      </div>
      <EnergyChart series={series} range={range} />
    </section>
  );
}

function RelatedConsumption({ items, title, activeMedium, urlFor }) {
  return (
    <section className="surface energy-panel">
      <h3>{title}</h3>
      <ul className="energy-rows">
        {items.map((item) => (
          <li key={item.medium}>
            <Link to={urlFor(item.medium)} className="energy-related-link" aria-current={item.medium === activeMedium ? 'page' : undefined}>
              <span>{item.label}</span>
              <strong>{formatAmount(item.series[0].current, item.series[0].unit)}</strong>
              <ArrowRight size={14} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MeterReadings({ meters, buildingName, showMedium }) {
  return (
    <section className="surface energy-panel">
      <h3>Zähler und letzte Ablesungen</h3>
      {meters.length ? (
        <ul className="energy-rows">
          {meters.map((row) => (
            <li className="energy-meter-row" key={row.id}>
              <div className="min-w-0">
                <p className="font-medium break-words">{row.meter_name || row.meter_code}</p>
                <p className="energy-caption">{[showMedium && ENERGY_MEDIA[row.medium]?.[0], buildingName(row.building_id), row.unit_name || row.unit_id].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="text-right">
                <p className="tabular-nums">{formatAmount(row.meter_reading, row.unit)}</p>
                {row.reading_date && <p className="energy-caption">{formatEnergyDate(row.reading_date)}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="energy-caption mt-3">Keine Zähler im gewählten Zeitraum.</p>}
    </section>
  );
}

export default function EnergyDashboard({ data, medium, family, buildingName, urlFor, children }) {
  const summary = data.summaries.find((item) => item.medium === medium);
  const parts = data.summaries.filter((item) => item.medium !== medium && item.series[0].current != null);
  const splitWater = medium === 'wasser' && summary.series[0].current == null && parts.length > 0;
  const highlights = splitWater ? parts : [summary];
  const related = family === 'wasser' ? data.summaries : data.summaries.filter((item) =>
    item.medium !== medium && (item.latest || item.series.some((series) => series.previous != null)));
  const meters = (medium === 'wasser' ? data.summaries : highlights).flatMap((item) => item.meters || []);
  const range = data.ranges.current;
  const visibleSeries = highlights.map((item) => ({
    ...item.series[0], label: item.label,
    color: item.medium === 'warmwasser' ? 'var(--energy-chart-warm)' : 'var(--energy-chart)',
  }));
  const extraSummaries = medium === 'wasser' ? data.summaries : [summary];
  const extraSeries = extraSummaries.flatMap((item) => item.series.slice(1)
    .filter((series) => series.current != null || series.previous != null)
    .map((series) => ({
      ...series,
      title: item.medium === 'warmwasser' && series.unit === 'kWh' ? 'Energie zur Warmwasserbereitung' : `Verbrauchsentwicklung · ${series.unit}`,
    })));
  const meterPanel = <MeterReadings meters={meters} buildingName={buildingName} showMedium={medium === 'wasser'} />;
  return (
    <div className="energy-dashboard" data-family={family || undefined}>
      <div className="energy-grid">
        <ConsumptionHero family={family} summary={summary} highlights={highlights} splitWater={splitWater} range={range} source={data.source} />
        <div className="energy-metrics">
          <EnergyMetric title="Erfasste Kosten" icon={Euro} values={highlights.map((item) => ({
            label: splitWater ? item.label : 'Erfasste Kosten', value: formatCost(item.cost_eur), empty: item.cost_eur == null,
          }))} />
          <EnergyMetric title="Zähler im Zeitraum" icon={Gauge} values={highlights.map((item) => ({
            label: splitWater ? item.label : 'Zähler im Zeitraum', value: item.meter_count,
          }))} hint={!splitWater && summary.latest?.reading_date ? `Letzte Ablesung am ${formatEnergyDate(summary.latest.reading_date)}` : null} />
        </div>
      </div>
      {children}
      <div className="energy-grid">
        <ConsumptionTrend title="Verbrauchsverlauf" series={visibleSeries} range={range} />
        {related.length ? <RelatedConsumption title={family === 'wasser' ? 'Wasserarten' : 'Strombilanz'} items={related} activeMedium={medium} urlFor={urlFor} /> : meterPanel}
      </div>
      {extraSeries.map((item) => <ConsumptionTrend key={item.title} title={item.title} series={[item]} range={range} showTotal />)}
      {related.length > 0 && meters.length > 0 && meterPanel}
    </div>
  );
}
