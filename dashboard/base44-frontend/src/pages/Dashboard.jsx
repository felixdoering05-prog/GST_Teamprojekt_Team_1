import { useState } from 'react';
import { Activity, ArrowUpRight, BellRing, Building2, Database, Droplets, Gauge, Layers, Radio, RefreshCw, Thermometer, Wind } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatCard from '@/components/StatCard';
import SourceBadge from '@/components/SourceBadge';
import EmptyState from '@/components/EmptyState';
import AlertList from '@/components/dashboard/AlertList';
import RoomStatusCard from '@/components/dashboard/RoomStatusCard';
import TrendChart from '@/components/dashboard/TrendChart';
import WidgetBoard from '@/components/dashboard/WidgetBoard';
import { BuildingsWidget, IssueWidget, LinksWidget, MapWidget, ModelWidget, SystemWidget, useWidgetBuildings } from '@/components/dashboard/ProjectWidgets';
import '@/components/dashboard/dashboard-glass.css';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useD21Data from '@/hooks/useD21Data';
import { base44 } from '@/api/base44Client';
import { readingsForRoom, seriesByHour, statusForRoom } from '@/lib/roomMetrics';
import { formatNumber } from '@/lib/metrics';
import { formatDateTime } from '@/lib/dates';

export default function Dashboard() {
  const data = useD21Data();
  const projectBuildings = useWidgetBuildings();
  const [seeding, setSeeding] = useState(false);
  const { toast } = useToast();

  const { loading, error, building, floors, rooms, sensors, latest, thresholds, alerts, series, counts } = data;

  const floorLabel = (room) => (floors.find((f) => f.id === room.floor_id) || {}).name || '';

  const roomEntries = rooms
    .map((room) => ({ room, readings: readingsForRoom(room, sensors, latest, thresholds), status: statusForRoom(room, sensors, latest, thresholds) }))
    .sort((a, b) => String(a.room.room_code).localeCompare(String(b.room.room_code), 'de'));

  const avgOf = (metricKey) => {
    const values = Object.values(latest)
      .filter((m) => m.metric === metricKey)
      .map((m) => Number(m.value))
      .filter((v) => !Number.isNaN(v));
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  const okRooms = roomEntries.filter((r) => r.status === 'ok').length;
  const criticalRooms = roomEntries.filter((r) => r.status === 'critical').length;
  const openAlerts = alerts.filter((a) => a.status === 'offen');
  const activeSensors = sensors.filter((s) => s.status === 'aktiv').length;
  const chartData = seriesByHour(series);
  const demoShare = series.length ? counts.demo / series.length : 0;

  const seed = async () => {
    setSeeding(true);
    try {
      const response = await base44.functions.invoke('seedDemoData', {});
      toast({ title: 'Demo-Datensatz', description: response?.data?.message || 'Demo-Datensatz wurde angelegt.' });
      await data.reload();
    } catch (e) {
      toast({ title: 'Fehler', description: e.message || 'Demo-Datensatz konnte nicht angelegt werden.', variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  const meta = [
    { icon: Building2, label: 'Standort', value: building?.site || '–' },
    { icon: Layers, label: 'Geschosse', value: `${floors.length}` },
    { icon: Gauge, label: 'Räume', value: `${rooms.length}` },
    { icon: Activity, label: 'Bruttogrundfläche', value: building?.gross_area_m2 ? `${Number(building.gross_area_m2).toLocaleString('de-DE')} m²` : '–' },
  ];
  const averageTemperature = avgOf('temperature');
  const dialFill = Number.isFinite(averageTemperature) ? Math.min(1, Math.max(0, averageTemperature / 40)) : 0;
  const dialLength = 2 * Math.PI * 64 * .75;
  const hasReadings = Object.keys(latest).length > 0;

  const widgetRenderers = {
    issues: item => <IssueWidget id={item.id} filter={item.filter} />,
    'issue-status': () => <IssueWidget id="issue-status" />,
    priority: () => <IssueWidget id="priority" />,
    activity: () => <IssueWidget id="activity" />,
    buildings: () => <BuildingsWidget buildings={projectBuildings} />,
    model: item => <ModelWidget buildingID={item.building_id} buildings={projectBuildings} />,
    map: () => <MapWidget />,
    system: () => <SystemWidget />,
    links: () => <LinksWidget />,
    climate: () => (<section className="climate-card" aria-label="Raumklima aus den Projektmesswerten">
          <div className="flex items-start justify-between gap-2"><div><h3>Raumklima</h3><p className="climate-subtitle">{building?.name || 'Ausgewähltes Gebäude'} · Ø je Sensor</p></div><span className="climate-heading-icon"><Thermometer className="h-4 w-4" /></span></div>
          <div className="climate-dial">
            <svg viewBox="0 0 160 160" role="img" aria-label={`Mittlere Lufttemperatur: ${formatNumber('temperature', averageTemperature)} Grad Celsius`}>
              <circle cx="80" cy="80" r="64" fill="none" stroke="#ffffff16" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dialLength} ${2 * Math.PI * 64 - dialLength}`} transform="rotate(135 80 80)" />
              <circle cx="80" cy="80" r="64" fill="none" stroke="#c8e49c" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dialLength * dialFill} ${2 * Math.PI * 64 - dialLength * dialFill}`} transform="rotate(135 80 80)" />
            </svg>
            <div className="dial-value" aria-hidden="true"><span className="dial-label">Lufttemperatur</span><span className="dial-number">{formatNumber('temperature', averageTemperature)}<span className="dial-unit">°C</span></span></div>
            <div className="dial-scale" aria-hidden="true"><span>0 °C</span><span>40 °C</span></div>
          </div>
          <div className="climate-small-metrics">
            <div><p className="metric-label"><Wind className="h-3 w-3" />CO₂</p><p className="metric-value">{formatNumber('co2', avgOf('co2'))}<span className="metric-unit">ppm</span></p></div>
            <div><p className="metric-label"><Droplets className="h-3 w-3" />Luftfeuchte</p><p className="metric-value">{formatNumber('humidity', avgOf('humidity'))}<span className="metric-unit">%</span></p></div>
          </div>
          <div className="climate-footer"><p>Deine Sensoren im Detail.<br />Messwerte und Raumzustände.</p><Link to="/sensorik" aria-label="Sensorik und Raumklima öffnen"><ArrowUpRight className="h-4 w-4" /></Link></div></section>),
    metadata: () => (<section className="glass-card" aria-label="Gebäudeinformationen">
        <dl className="dashboard-meta">
          {meta.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-start gap-2.5">
                <span className="meta-icon">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </section>),
    metrics: () => (<div className="space-y-2"><section aria-label="Gebäudekennzahlen" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Räume im Sollbereich"
          value={`${okRooms} / ${rooms.length}`}
          hint={criticalRooms ? `${criticalRooms} Raum/Räume kritisch` : 'Keine kritischen Räume'}
          icon={Gauge}
          tone={criticalRooms ? 'crit' : 'ok'}
        />
        <StatCard label="Offene Meldungen" value={`${openAlerts.length}`} hint="regelbasiert erkannt" icon={BellRing} tone={openAlerts.length ? 'warn' : 'ok'} />
        <StatCard label="Sensoren aktiv" value={`${activeSensors} / ${sensors.length}`} hint="Zugeordnete Sensoren im Gebäude" icon={Radio} tone="primary" />
      </section>
      <p className="dashboard-source-note">Messwerte im Betrachtungszeitraum: {counts.demo.toLocaleString('de-DE')} Demo · {counts.real.toLocaleString('de-DE')} echt{series.length ? ` · Stand ${formatDateTime(series[series.length - 1]?.measured_at)}` : ''} · <Link to="/heat-map" className="underline underline-offset-2">Frankfurter Wetterdaten & Heat map</Link></p></div>),
    trend: () => <TrendChart data={chartData} demoShare={demoShare} />,
    warnings: () => <AlertList alerts={openAlerts} title="Offene Warnmeldungen" emptyText="Keine offenen Sensorwarnungen." />,
    rooms: () => rooms.length ? (<section>
        <div className="dashboard-section-heading">
          <div>
            <h2>Deine Räume</h2>
            <p>
              Letzter Messwert je Raum, bewertet nach den hinterlegten Grenzwerten
            </p>
          </div>
          <SourceBadge source={demoShare > 0.5 ? 'demo' : 'real'} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roomEntries.map((entry) => (
            <RoomStatusCard key={entry.room.id} room={entry.room} floorLabel={floorLabel(entry.room)} readings={entry.readings} />
          ))}
        </div></section>) : (<EmptyState
          icon={Building2}
          title="Noch keine Gebäudedaten vorhanden"
          description="Es sind noch keine Räume und Sensoren angelegt. Sie können den gekennzeichneten Demo-Datensatz erzeugen oder unter „Gebäude & Räume“ mit eigenen Daten beginnen."
          children={
            <>
              <Button variant="outline" onClick={seed} disabled={seeding}>
                {seeding ? 'Wird angelegt …' : 'Demo-Datensatz erzeugen'}
              </Button>
              <Button variant="outline" asChild>
                <Link to="/gebaeude">Gebäude & Räume öffnen</Link>
              </Button>
            </>
          }/>),
  };

  return (
    <div className="glass-dashboard space-y-5">
      <div className="dashboard-heading">
        <div><h2>Kommandozentrale</h2><p className="mt-2 text-xs text-muted-foreground">{building?.name || 'Gebäude'} · Raumklima, Modell und Meldungen</p></div>
        <div className="dashboard-heading-actions">
          {hasReadings ? <SourceBadge source={demoShare > 0.5 ? 'demo' : 'real'} labels={{ demo: 'Demo-Messwerte', real: 'Projektmesswerte' }} /> : <span className="glass-pill text-xs">Keine Messwerte</span>}
          <Button variant="outline" size="sm" onClick={data.reload} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Wird aktualisiert …' : 'Aktualisieren'}</Button>
        </div>
      </div>
      {error && <EmptyState icon={Database} title="Messdaten konnten nicht geladen werden" description={error}>
        <Button onClick={data.reload}>Erneut versuchen</Button>
      </EmptyState>}
      {!loading && !error && !rooms.length && (<section className="surface flex flex-wrap items-center justify-between gap-3 p-5" aria-labelledby="dashboard-start">
          <div>
            <h2 id="dashboard-start" className="font-heading font-semibold">Erste Schritte</h2>
            <p className="mt-1 text-sm text-muted-foreground">Lege dein Gebäude an, lade Dateien hoch oder nimm eine Einladung an.</p>
          </div>
          <Button asChild><Link to="/gebaeude?start=1">Erste Schritte öffnen</Link></Button>
        </section>)}
      <WidgetBoard buildings={projectBuildings.isError ? [] : projectBuildings.data || []}
        renderWidget={item => widgetRenderers[item.id]?.(item)} />
    </div>
  );
}
