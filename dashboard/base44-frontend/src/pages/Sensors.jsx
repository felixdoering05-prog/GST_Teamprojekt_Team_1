import { useEffect, useState } from 'react';
import { Cpu, Plus, Radio, RefreshCw, SlidersHorizontal } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import MetricTile from '@/components/sensors/MetricTile';
import RoomSeriesChart from '@/components/sensors/RoomSeriesChart';
import SensorTable from '@/components/sensors/SensorTable';
import SensorDialog from '@/components/sensors/SensorDialog';
import AlertList from '@/components/dashboard/AlertList';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import useD21Data from '@/hooks/useD21Data';
import { METRIC_KEYS, metric as metricDef } from '@/lib/metrics';
import { readingsForRoom, roomSeries } from '@/lib/roomMetrics';

export default function Sensors() {
  const data = useD21Data();
  const { toast } = useToast();
  const [roomFilter, setRoomFilter] = useState('all');
  const [metricKey, setMetricKey] = useState('temperature');
  const [sensorState, setSensorState] = useState({ open: false, sensor: null });
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (roomFilter === 'all' && data.rooms.length) setRoomFilter(data.rooms[0].id);
  }, [data.rooms, roomFilter]);

  const selectedRoom = data.rooms.find((r) => r.id === roomFilter) || null;
  const roomSensors = selectedRoom ? data.sensors.filter((s) => s.room_id === selectedRoom.id) : data.sensors;
  const readings = selectedRoom ? readingsForRoom(selectedRoom, data.sensors, data.latest, data.thresholds) : null;
  const points = selectedRoom ? roomSeries(selectedRoom, data.sensors, data.series, metricKey) : [];
  const roomAlerts = selectedRoom ? data.alerts.filter((a) => a.room_id === selectedRoom.id) : [];

  const activeSensors = data.sensors.filter((s) => s.status === 'aktiv').length;
  const faultySensors = data.sensors.filter((s) => s.status !== 'aktiv').length;
  const openAlerts = data.alerts.filter((a) => a.status === 'offen').length;

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

  const requestDelete = (sensor) => {
    setConfirmState({
      title: `Sensor ${sensor.sensor_code} löschen?`,
      description: 'Der Sensor und seine Zuordnung werden entfernt. Bereits erfasste Messwerte bleiben erhalten.',
      action: async () => base44.entities.Sensor.delete(sensor.id),
      success: `Sensor ${sensor.sensor_code} gelöscht`,
    });
  };

  const runDelete = async () => {
    if (!confirmState) return;
    setBusy(true);
    try {
      await confirmState.action();
      toast({ title: 'Gelöscht', description: confirmState.success });
      setConfirmState(null);
      await data.reload();
    } catch (e) {
      toast({ title: 'Löschen fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (data.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
      </div>
    );
  }

  if (!data.sensors.length) {
    return (
      <div>
        <PageHeader title="Sensorik" description="Temperatur, CO₂ und Luftfeuchtigkeit je Raum." />
        <EmptyState
          icon={Radio}
          title="Noch keine Sensoren angelegt"
          description="Sensoren messen genau eine Messgröße und werden einem Raum zugeordnet. Anschließend können Messwerte per CSV importiert werden."
          children={<Button onClick={() => setSensorState({ open: true, sensor: null })}>Sensor anlegen</Button>}
        />
        <SensorDialog open={sensorState.open} onOpenChange={(open) => setSensorState((s) => ({ ...s, open }))} sensor={sensorState.sensor} rooms={data.rooms} onSaved={data.reload} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sensorik"
        description="Messwerte je Raum für Temperatur, CO₂ und Luftfeuchtigkeit – bewertet nach den hinterlegten Grenzwerten."
      >
        <Button variant="outline" size="sm" onClick={data.reload}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Aktualisieren
        </Button>
        <Button variant="outline" size="sm" onClick={runCheck} disabled={running}>
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> {running ? 'Prüflauf läuft …' : 'Prüflauf starten'}
        </Button>
        <Button size="sm" onClick={() => setSensorState({ open: true, sensor: null })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Sensor anlegen
        </Button>
      </PageHeader>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sensoren aktiv" value={`${activeSensors}`} hint={`von ${data.sensors.length} Sensoren`} icon={Cpu} tone="primary" />
        <StatCard label="Inaktiv / defekt" value={`${faultySensors}`} hint="Sensoren mit Handlungsbedarf" icon={Radio} tone={faultySensors ? 'warn' : 'ok'} />
        <StatCard label="Messwerte (24 h)" value={data.series.length.toLocaleString('de-DE')} hint={`${data.counts.demo.toLocaleString('de-DE')} Demo · ${data.counts.real.toLocaleString('de-DE')} echt`} icon={SlidersHorizontal} />
        <StatCard label="Offene Meldungen" value={`${openAlerts}`} hint="regelbasiert erkannt" icon={SlidersHorizontal} tone={openAlerts ? 'warn' : 'ok'} />
      </section>

      <section className="surface p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Raum"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            options={[{ value: 'all', label: 'Alle Räume' }, ...data.rooms.map((r) => ({ value: r.id, label: `${r.room_code} ${r.name}` }))]}
          />
          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-xs font-medium text-foreground">Messgröße im Verlauf</p>
            <div className="flex flex-wrap gap-2">
              {METRIC_KEYS.map((key) => {
                const active = metricKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMetricKey(key)}
                    className={
                      active
                        ? 'rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                        : 'rounded-full bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200'
                    }
                  >
                    {metricDef(key).label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {selectedRoom ? (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            {METRIC_KEYS.map((key) => (
              <MetricTile key={key} metricKey={key} reading={readings[key]} threshold={data.thresholds[key]} points={roomSeries(selectedRoom, data.sensors, data.series, key)} />
            ))}
          </section>

          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Verlauf {metricDef(metricKey).label} · {selectedRoom.room_code} {selectedRoom.name}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Letzte 24 Stunden, Messwerte in {metricDef(metricKey).unit} · Grenzwerte als gestrichelte Linien
                </p>
              </div>
            </div>
            <div className="px-2 py-4 sm:px-4">
              <RoomSeriesChart points={points} metricKey={metricKey} thresholds={data.thresholds} />
            </div>
          </section>

          {roomAlerts.length ? (
            <AlertList alerts={roomAlerts} title={`Meldungen für ${selectedRoom.room_code}`} />
          ) : null}
        </>
      ) : null}

      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">
            {selectedRoom ? `Sensoren in ${selectedRoom.room_code} ${selectedRoom.name}` : `Alle Sensoren (${data.sensors.length})`}
          </h3>
        </div>
        <SensorTable
          sensors={roomSensors}
          rooms={data.rooms}
          latest={data.latest}
          onEdit={(sensor) => setSensorState({ open: true, sensor })}
          onDelete={requestDelete}
          emptyText="Für diesen Raum sind keine Sensoren angelegt."
        />
      </section>

      <SensorDialog
        open={sensorState.open}
        onOpenChange={(open) => setSensorState((s) => ({ ...s, open }))}
        sensor={sensorState.sensor}
        rooms={data.rooms}
        onSaved={data.reload}
      />
      <ConfirmDialog
        open={Boolean(confirmState)}
        onOpenChange={(open) => !open && setConfirmState(null)}
        title={confirmState ? confirmState.title : ''}
        description={confirmState ? confirmState.description : ''}
        onConfirm={runDelete}
        busy={busy}
      />
    </div>
  );
}
