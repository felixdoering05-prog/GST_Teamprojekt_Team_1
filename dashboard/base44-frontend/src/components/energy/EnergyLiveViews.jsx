import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BatteryCharging, Building2, Cable, Droplets, PlugZap, Sun, Waves } from 'lucide-react';
import EnergyChart from './EnergyChart';
import EnergyTimeChart from './EnergyTimeChart';
import { formatAmount, formatEnergyDate } from '@/lib/energy';

const clock = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const stamp = (time) => clock.format(new Date(time));
const fresh = (channel) => channel?.latest && !channel.latest.stale ? channel.latest.value : null;
const latest = (channel) => channel?.latest?.value ?? null;
const today = (channel, now) => now ? channel?.days?.find((point) => point.day === day.format(new Date(now)))?.value ?? null : null;
const trend = (label, channel, daily = false) => ({ label, points: daily ? channel?.days : channel?.points });
const power = (value) => Math.abs(value) >= 1000 ? formatAmount(value / 1000, 'kW') : formatAmount(value, 'W');

export function ModeSwitch({ active, onChange, options, label }) {
  return <div className="energy-mode-switch" role="group" aria-label={label}>
    {options.map(([value, title]) => <button type="button" key={value} aria-pressed={active === value} onClick={() => onChange(value)}>{title}</button>)}
  </div>;
}

export function MonitorFigure({ label, value, hint }) {
  return <div className="energy-figure">
    <dt>{label}</dt>
    <dd>{value}</dd>
    {hint && <dd className="energy-caption">{hint}</dd>}
  </div>;
}

const powerNodes = [
  ['solar', 'PV-Erzeugung', Sun], ['load', 'Gebäude', Building2], ['grid', 'Netz', Cable],
  ['battery_power', 'Speicher', BatteryCharging], ['ev', 'Ladestation', PlugZap],
];
const waterNodes = [['water_flow', 'Durchfluss', Droplets], ['tank', 'Tankinhalt', Waves]];
const powerCounters = [['solar_total', 'PV-Ertrag'], ['load_total', 'Gebäudeverbrauch'], ['import_total', 'Netzbezug'], ['export_total', 'Einspeisung']];

function FlowSummary({ family, live, channels }) {
  const [mode, setMode] = useState('live');
  const water = family === 'wasser';
  const nodes = (water ? waterNodes : powerNodes).filter(([key]) => channels[key]);
  const counters = (water ? [['water_total', 'Wasserverbrauch']] : powerCounters).filter(([key]) => channels[key]);
  return (
    <section className="surface energy-panel">
      <div className="energy-trend-heading">
        <h3>{water ? 'Wasser im Betrieb' : 'Stromflüsse'}</h3>
        <ModeSwitch active={mode} onChange={setMode} options={[['live', 'Live'], ['today', 'Heute']]} label="Anzeige der Messwerte" />
      </div>
      {mode === 'live' ? (
        nodes.length ? <ul className="energy-flow">
          {nodes.map(([key, label, Icon]) => {
            const channel = channels[key];
            const reading = latest(channel);
            const direction = key === 'grid' && reading ? (reading > 0 ? 'Netzbezug' : 'Einspeisung') :
              key === 'battery_power' && reading ? (reading > 0 ? 'Lädt' : 'Entlädt') : null;
            const DirectionIcon = direction && reading < 0 ? ArrowUpRight : ArrowDownRight;
            return <li key={key}>
              <Icon size={19} />
              <p>{label}</p>
              <strong>{water ? formatAmount(reading, channel.unit) : power(reading)}</strong>
              {direction && <span><DirectionIcon size={13} />{direction}</span>}
              {channel.latest && <time dateTime={channel.latest.time}>{channel.latest.stale ? 'Zuletzt ' : ''}{stamp(channel.latest.time)} Uhr</time>}
            </li>;
          })}
        </ul> : <p className="energy-caption mt-3">Für Live-Werte Leistungssensoren oder einen Durchflussmesser zuordnen.</p>
      ) : (
        counters.length ? <dl className="energy-figures mt-4">{counters.map(([key, label]) =>
          <MonitorFigure key={key} label={label} value={formatAmount(today(channels[key], live.now), channels[key].unit)} />)}</dl> :
          <p className="energy-caption mt-3">Für Tageswerte einen Verbrauchs- oder Erzeugungszähler zuordnen.</p>
      )}
    </section>
  );
}

function Activity({ channels }) {
  const values = Object.values(channels).filter((item) => item.latest)
    .sort((a, b) => b.latest.time.localeCompare(a.latest.time)).slice(0, 6);
  return (
    <section className="surface energy-panel">
      <h3>Letzte Messereignisse</h3>
      {!values.length && <p className="energy-caption mt-3">Noch keine neuen Messwerte.</p>}
      <ul className="energy-rows">
        {values.map((item) => (
          <li key={item.label} className="energy-meter-row">
            <div><p className="font-medium">{item.label}</p><time className="energy-caption" dateTime={item.latest.time}>{formatEnergyDate(item.latest.time)} · {stamp(item.latest.time)} Uhr</time></div>
            <span>{formatAmount(item.latest.value, item.unit)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EnergyLiveOverview({ family, live }) {
  if (!live?.sensors.length) return null;
  const { channels } = live;
  if (!Object.keys(channels).length) return (
    <section className="surface energy-panel">
      <h3>Verfügbare Live-Messwerte</h3>
      <dl className="energy-figures mt-3">{live.sensors.slice(0, 8).map((item) =>
        <MonitorFigure key={item.entity_id} label={item.name} value={formatAmount(latest(item), item.unit)}
          hint={item.latest && formatEnergyDate(item.latest.time) + ' · ' + stamp(item.latest.time) + ' Uhr'} />)}</dl>
      <p className="energy-caption mt-3">Ordne Messquellen zu, um Stromflüsse oder Wasserverbrauch daraus auszuwerten.</p>
    </section>
  );
  const water = family === 'wasser';
  const forecast = channels.solar_forecast?.latest;
  const forecastToday = forecast && day.format(new Date(forecast.time)) === day.format(new Date(live.now)) ? forecast.value : null;
  const solarToday = today(channels.solar_total, live.now);
  const hasWeather = Boolean(channels.outdoor_temperature || channels.irradiance);
  return (
    <>
      <FlowSummary family={family} live={live} channels={channels} />
      {!water && (channels.solar_total || forecastToday != null || hasWeather) && (
        <section className="surface energy-panel">
          <h3>Solarertrag und Wetter</h3>
          <dl className="energy-figures mt-3">
            {channels.solar_total && <MonitorFigure label="PV-Ertrag heute" value={formatAmount(solarToday, 'kWh')}
              hint={solarToday != null && forecastToday > 0 ? formatAmount(Math.round(solarToday / forecastToday * 100), '%') + ' der Tagesprognose' : null} />}
            {forecastToday != null && <MonitorFigure label="PV-Prognose heute" value={formatAmount(forecastToday, 'kWh')} hint={'Vom zugeordneten Prognosesensor · ' + stamp(forecast.time) + ' Uhr'} />}
            {channels.outdoor_temperature && <MonitorFigure label="Außentemperatur" value={formatAmount(fresh(channels.outdoor_temperature), '°C')} />}
            {channels.irradiance && <MonitorFigure label="Sonneneinstrahlung" value={formatAmount(fresh(channels.irradiance), 'W/m²')} />}
          </dl>
        </section>
      )}
      <div className="energy-grid">
        <section className="surface energy-panel">
          <h3>{water ? 'Durchfluss heute' : 'Erzeugung und Verbrauch heute'}</h3>
          <p className="energy-caption mt-1">{water ? 'L/min' : 'W'} · Mittelwerte je 30 Minuten</p>
          <EnergyTimeChart unit={water ? 'L/min' : 'W'} series={water ? [trend('Durchfluss', channels.water_flow)] :
            [trend('PV-Erzeugung', channels.solar), trend('Gebäudelast', channels.load)]} />
        </section>
        <Activity channels={channels} />
      </div>
    </>
  );
}

function ModuleDetail({ module, group }) {
  const active = group.map(fresh).filter(Number.isFinite);
  const average = active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : null;
  return (
    <section className="surface energy-panel">
      <h3>{module.name}</h3>
      <p className="energy-caption">{module.group}</p>
      <dl className="energy-figures mt-3">
        <MonitorFigure label="Leistung" value={power(latest(module))} hint={module.latest && (module.latest.stale ? 'Letzter Wert · ' : '') + stamp(module.latest.time) + ' Uhr'} />
        <MonitorFigure label="Spitze heute" value={power(module.peak)} />
        <MonitorFigure label="Ø der Module im String" value={power(average)} />
      </dl>
      <EnergyTimeChart series={[trend(module.name, module)]} unit="W" />
    </section>
  );
}

function ModuleLayout({ modules, configure }) {
  const [mode, setMode] = useState('plan');
  const [selected, setSelected] = useState('');
  const groups = new Map();
  for (const module of modules) {
    if (!groups.has(module.group)) groups.set(module.group, []);
    groups.get(module.group).push(module);
  }
  const active = modules.find((item) => item.entity_id === selected) || modules[0];
  const max = Math.max(1, ...modules.map((item) => fresh(item) ?? 0));
  return (
    <div className="energy-grid">
      <section className="surface energy-panel">
        <div className="energy-trend-heading">
          <h3>PV-Module und Strings</h3>
          {active && <ModeSwitch active={mode} onChange={setMode} options={[['plan', 'Plan'], ['3d', '3D']]} label="Ansicht der PV-Module" />}
        </div>
        {!active && <p className="energy-caption mt-3">Ordne Leistungssensoren ihren PV-Strings zu, um die Module einzeln zu vergleichen. {configure}</p>}
        {[...groups].map(([group, entries]) => {
          const measured = entries.map(fresh).filter(Number.isFinite);
          const total = measured.length ? measured.reduce((sum, value) => sum + value, 0) : null;
          return <div key={group} className="mt-4">
            <h4 className="text-sm font-semibold">{group} <span className="ml-2 font-normal text-muted-foreground">{power(total)} · {measured.length}/{entries.length} aktuell</span></h4>
            <ul className="energy-module-grid" data-view={mode}>
              {entries.map((item) => (
                <li key={item.entity_id}>
                  <button type="button" aria-pressed={item.entity_id === active.entity_id} onClick={() => setSelected(item.entity_id)}
                    style={{ '--module-output': Math.min(1, Math.max(0, (fresh(item) ?? 0) / max)) }}>
                    <span>{item.name}</span><strong>{power(fresh(item))}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </div>;
        })}
      </section>
      {active && <ModuleDetail module={active} group={groups.get(active.group)} />}
    </div>
  );
}

export function EnergyUsage({ family, live, data, configure }) {
  const [mode, setMode] = useState('months');
  const water = family === 'wasser';
  const { channels = {}, modules = [], now } = live || {};
  const counter = water ? channels.water_total : channels.solar_total;
  const instantaneous = water ? channels.water_flow : channels.solar;
  const unit = water ? 'm³' : 'kWh';
  const period = water ? data.summaries.filter((item) => item.series[0].points.length)
    .map((item) => ({ ...item.series[0], label: item.label, color: item.medium === 'warmwasser' ? 'var(--energy-chart-warm)' :
      item.medium === 'kaltwasser' ? '#327d9f' : 'var(--energy-chart)' })) :
    data.summaries.filter((item) => ['pv_erzeugung', 'strom'].includes(item.medium)).map((item) => ({
      ...item.series[0], label: item.medium === 'strom' ? 'Stromverbrauch' : item.label, color: item.medium === 'strom' ? 'var(--energy-chart)' : '#b76a31',
    }));
  const best = counter?.days?.filter((point) => !now || point.day !== day.format(new Date(now)))
    .reduce((highest, point) => highest == null || point.value > highest.value ? point : highest, null);
  return (
    <div className="energy-dashboard" data-family={family}>
      <section className="surface energy-panel">
        <h3>{water ? 'Wasserverbrauch und Spitzen' : 'PV-Erzeugung und Spitzen'}</h3>
        <dl className="energy-figures mt-3">
          <MonitorFigure label={water ? 'Aktueller Durchfluss' : 'Aktuelle PV-Leistung'} value={water ? formatAmount(fresh(instantaneous), 'L/min') : power(fresh(instantaneous))} />
          <MonitorFigure label={water ? 'Verbrauch heute' : 'Ertrag heute'} value={formatAmount(today(counter, now), unit)} />
          <MonitorFigure label={water ? 'Durchflussspitze heute' : 'Leistungsspitze heute'} value={water ? formatAmount(instantaneous?.peak, 'L/min') : power(instantaneous?.peak)} />
          <MonitorFigure label={water ? 'Höchster Tagesverbrauch' : 'Höchster Tagesertrag'} value={formatAmount(best?.value, unit)}
            hint={best && formatEnergyDate(best.day) + ' · letzte 30 abgeschlossene Tage'} />
        </dl>
      </section>
      {!water && <ModuleLayout modules={modules} configure={configure} />}
      <section className="surface energy-panel">
        <div className="energy-trend-heading">
          <h3>{water ? 'Verbrauchsverlauf' : 'Erzeugung und Verbrauch'}</h3>
          <ModeSwitch active={mode} onChange={setMode} options={[['days', 'Tage'], ['months', 'Monate']]} label="Auflösung des Verlaufs" />
        </div>
        {mode === 'days' ? (
          <EnergyTimeChart daily bars unit={unit} series={water ? [trend('Wasserverbrauch', counter, true)] :
            [trend('PV-Erzeugung', counter, true), trend('Stromverbrauch', channels.load_total, true)]} />
        ) : <EnergyChart series={period} range={data.ranges.current} legend />}
      </section>
      {water && (
        <section className="surface energy-panel">
          <h3>Durchfluss heute</h3>
          <EnergyTimeChart series={[trend('Durchfluss', channels.water_flow)]} unit="L/min" />
        </section>
      )}
    </div>
  );
}

export function EnergyStorage({ family, live, configure }) {
  const water = family === 'wasser';
  const { channels = {}, settings = {} } = live || {};
  const [scenarioReserve, setReserve] = useState(null);
  const reserve = scenarioReserve ?? settings.battery_reserve ?? 0;
  const level = water ? channels.tank : channels.battery;
  const capacity = water ? settings.tank_capacity : settings.battery_capacity;
  const fill = fresh(level);
  const volume = water ? fill : capacity > 0 && fill != null ? capacity * fill / 100 : null;
  const percent = water ? (capacity > 0 && fill != null ? Math.min(100, fill / capacity * 100) : null) : fill;
  const powerNow = fresh(channels.battery_power);
  const waiting = capacity > 0 && volume != null && powerNow > 0 ? Math.max(0, capacity - volume) * 1000 / powerNow : null;
  const reserved = capacity > 0 ? capacity * reserve / 100 : null;
  const runtime = volume != null && reserved != null && settings.emergency_load > 0 ? Math.max(0, volume - reserved) * 1000 / settings.emergency_load : null;
  const unit = water ? 'm³' : 'kWh';

  return (
    <div className="energy-dashboard" data-family={family}>
      <div className="energy-grid">
        <section className="surface energy-panel">
          <h3>{water ? 'Wasserspeicher' : 'Batteriespeicher'}</h3>
          <div className="energy-storage-level">
            {percent != null && <div className="energy-storage-gauge" role="meter" aria-label="Füllstand" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <span style={{ height: percent + '%' }} /><strong>{formatAmount(Math.round(percent), '%')}</strong>
            </div>}
            <dl className="energy-figures flex-1">
              <MonitorFigure label={water ? 'Tankinhalt' : 'Gespeicherte Energie'} value={formatAmount(volume, unit)} />
              <MonitorFigure label="Kapazität" value={formatAmount(capacity, unit)} />
              {!water && <MonitorFigure label={powerNow > 0 ? 'Ladeleistung' : powerNow < 0 ? 'Entladeleistung' : 'Speicherleistung'}
                value={power(powerNow == null ? null : Math.abs(powerNow))} />}
              {!water && <MonitorFigure label="Speichertemperatur" value={formatAmount(fresh(channels.battery_temperature), '°C')} />}
              {!water && channels.battery_health && <MonitorFigure label="Batteriezustand" value={formatAmount(fresh(channels.battery_health), '%')} />}
            </dl>
          </div>
          {!level && <p className="energy-caption mt-3">Ordne einen Sensor für den {water ? 'Tankinhalt' : 'Ladezustand'} zu. {configure}</p>}
          {!water && waiting != null && <p className="energy-caption mt-3">Voll in ungefähr {formatAmount(waiting, 'h')} bei aktueller Ladeleistung.</p>}
        </section>
        {!water && (
          <section className="surface energy-panel">
            <h3>Notstromreserve berechnen</h3>
            <label className="mt-3 block text-sm" htmlFor="energy-reserve">Reserve in der Berechnung <strong>{reserve} %</strong></label>
            <input type="range" id="energy-reserve" min={0} max={100} step={1} value={reserve}
              className="mt-2 w-full accent-primary" onChange={(event) => setReserve(event.target.valueAsNumber)} />
            <dl className="energy-figures mt-3">
              <MonitorFigure label="Eingeplante Reserve" value={formatAmount(reserved, 'kWh')} />
              <MonitorFigure label="Laufzeit bis zur Reserve" value={formatAmount(runtime, 'h')}
                hint={settings.emergency_load > 0 ? 'Bei ' + power(settings.emergency_load) + ' Notlast' : 'Notlast für die Berechnung hinterlegen'} />
            </dl>
          </section>
        )}
      </div>
      <div className="energy-grid">
        <section className="surface energy-panel">
          <h3>{water ? 'Tankinhalt heute' : 'Ladezustand heute'}</h3>
          <EnergyTimeChart series={[trend(water ? 'Tankinhalt' : 'Ladezustand', level)]} unit={water ? 'm³' : '%'} reserve={water ? undefined : reserve} />
        </section>
        {!water && <section className="surface energy-panel">
          <h3>Laden und Entladen heute</h3>
          <p className="energy-caption">Laden &gt; 0 W · Entladen &lt; 0 W</p>
          <EnergyTimeChart series={[trend('Speicherleistung', channels.battery_power)]} unit="W" bars />
        </section>}
      </div>
    </div>
  );
}
