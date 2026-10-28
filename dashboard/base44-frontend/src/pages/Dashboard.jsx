import { useState } from 'react';
import { Activity, BellRing, Building2, Database, Droplets, Gauge, Layers, Radio, RefreshCw, Thermometer, Wind } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import SourceBadge from '@/components/SourceBadge';
import EmptyState from '@/components/EmptyState';
import AlertList from '@/components/dashboard/AlertList';
import RoomStatusCard from '@/components/dashboard/RoomStatusCard';
import TrendChart from '@/components/dashboard/TrendChart';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useD21Data from '@/hooks/useD21Data';
import { base44 } from '@/api/base44Client';
import { readingsForRoom, seriesByHour, statusForRoom } from '@/lib/roomMetrics';
import { METRIC_KEYS } from '@/lib/metrics';
import { formatNumber } from '@/lib/metrics';
import { formatDateTime } from '@/lib/dates';

export default function Dashboard() {
  const data = useD21Data();
  const [seeding, setSeeding] = useState(false);
  const { toast } = useToast();

  const { loading, error, building, floors, rooms, sensors, latest, thresholds, alerts, series, counts } = data;

  const floorLabel = (room) => (floors.find((f) => f.id === room.floor_id) || {}).name || '';
  const sensorById = {};
  sensors.forEach((s) => { sensorById[s.id] = s; });

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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={Database}
        title="Daten konnten nicht geladen werden"
        description={error}
        children={<Button onClick={data.reload}>Erneut versuchen</Button>}
      />
    );
  }

  if (!rooms.length) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Gebäudeübersicht, Kennzahlen, Warnmeldungen und Raumzustände." />
        <EmptyState
          icon={Building2}
          title="Noch keine Gebäudedaten vorhanden"
          description="Es sind noch keine Räume und Sensoren angelegt. Sie können den gekennzeichneten Demo-Datensatz erzeugen oder unter „Gebäude & Räume“ mit eigenen Daten beginnen."
          children={
            <>
              <Button onClick={seed} disabled={seeding}>
                {seeding ? 'Wird angelegt …' : 'Demo-Datensatz erzeugen'}
              </Button>
              <Button variant="outline" asChild>
                <Link to="/gebaeude">Gebäude & Räume öffnen</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const meta = [
    { icon: Building2, label: 'Standort', value: building?.site || '–' },
    { icon: Layers, label: 'Geschosse', value: `${floors.length}` },
    { icon: Gauge, label: 'Räume', value: `${rooms.length}` },
    { icon: Activity, label: 'Bruttogrundfläche', value: building?.gross_area_m2 ? `${Number(building.gross_area_m2).toLocaleString('de-DE')} m²` : '–' },
  ];

  return (
    <div className="space-y-6">
      <section className="surface relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-cyan-400 to-emerald-400" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
              Digitaler Zwilling · Gebäude {building?.name || '–'}
            </p>
            <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground sm:text-3xl">D21 Digital Twin</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              KI trifft Gebäude: Sensordaten in Revit, ausgewertet mit künstlicher Intelligenz.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <SourceBadge source={demoShare > 0.5 ? 'demo' : 'real'} labels={{ demo: 'Demo-Messwerte aktiv', real: 'Echte Messwerte' }} />
            <Button variant="outline" size="sm" onClick={data.reload}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Aktualisieren
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Messwerte im Betrachtungszeitraum: {counts.demo.toLocaleString('de-DE')} Demo · {counts.real.toLocaleString('de-DE')} echt
          {series.length ? ` · Stand ${formatDateTime(series[series.length - 1]?.measured_at)}` : ''}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          {meta.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</dt>
                  <dd className="truncate text-sm font-medium text-foreground">{item.value}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Ø Temperatur" value={formatNumber('temperature', avgOf('temperature'))} unit="°C" hint="Sollbereich 19–26 °C" icon={Thermometer} />
        <StatCard label="Ø CO₂" value={formatNumber('co2', avgOf('co2'))} unit="ppm" hint="Grenzwert 1.000 ppm" icon={Wind} />
        <StatCard label="Ø Luftfeuchte" value={formatNumber('humidity', avgOf('humidity'))} unit="%" hint="Sollbereich 30–60 %" icon={Droplets} />
        <StatCard
          label="Räume im Sollbereich"
          value={`${okRooms} / ${rooms.length}`}
          hint={criticalRooms ? `${criticalRooms} Raum/Räume kritisch` : 'Keine kritischen Räume'}
          icon={Gauge}
          tone={criticalRooms ? 'crit' : 'ok'}
        />
        <StatCard label="Offene Meldungen" value={`${openAlerts.length}`} hint="regelbasiert erkannt" icon={BellRing} tone={openAlerts.length ? 'warn' : 'ok'} />
        <StatCard label="Sensoren aktiv" value={`${activeSensors} / ${sensors.length}`} hint={`${METRIC_KEYS.length} Messgrößen je Raum`} icon={Radio} tone="primary" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendChart data={chartData} demoShare={demoShare} />
        </div>
        <AlertList alerts={openAlerts} title="Offene Warnmeldungen" emptyText="Keine offenen Meldungen – alle Werte im Sollbereich." />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Raumzustände</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Letzter Messwert je Raum, bewertet nach den hinterlegten Grenzwerten
            </p>
          </div>
          <SourceBadge source={demoShare > 0.5 ? 'demo' : 'real'} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roomEntries.map((entry) => (
            <RoomStatusCard key={entry.room.id} room={entry.room} floorLabel={floorLabel(entry.room)} readings={entry.readings} />
          ))}
        </div>
      </section>
    </div>
  );
}
