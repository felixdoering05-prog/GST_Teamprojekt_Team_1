import { useCallback, useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import DemoDataCard from '@/components/settings/DemoDataCard';
import ImportMeasurementsCard from '@/components/settings/ImportMeasurementsCard';
import ImportEnergyCard from '@/components/settings/ImportEnergyCard';
import ExportCard from '@/components/settings/ExportCard';
import ThresholdEditor from '@/components/settings/ThresholdEditor';
import PreparationCards from '@/components/settings/PreparationCards';
import BuildingDialog from '@/components/rooms/BuildingDialog';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import useD21Data from '@/hooks/useD21Data';

export default function DataSettings() {
  const data = useD21Data();
  const { toast } = useToast();
  const [counts, setCounts] = useState(null);
  const [thresholdRecords, setThresholdRecords] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);

  const loadMeta = useCallback(async () => {
    const [buildings, floors, rooms, sensors, measurements, demoMeasurements, realMeasurements, alerts, energy, thresholdRows] = await Promise.all([
      base44.entities.Building.count(),
      base44.entities.Floor.count(),
      base44.entities.Room.count(),
      base44.entities.Sensor.count(),
      base44.entities.Measurement.count(),
      base44.entities.Measurement.count({ source: 'demo' }),
      base44.entities.Measurement.count({ source: 'real' }),
      base44.entities.Alert.count(),
      base44.entities.EnergyReading.count(),
      base44.entities.ThresholdConfig.list('metric', 20),
    ]);
    setCounts({ buildings, floors, rooms, sensors, measurements, demoMeasurements, realMeasurements, alerts, energy });
    setThresholdRecords(thresholdRows || []);
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const refreshAll = async () => {
    await Promise.all([data.reload(), loadMeta()]);
  };

  const seed = async () => {
    setBusy(true);
    try {
      const response = await base44.functions.invoke('seedDemoData', {});
      toast({ title: 'Demo-Datensatz', description: response?.data?.message || 'Demo-Datensatz wurde angelegt.' });
      await refreshAll();
    } catch (e) {
      toast({ title: 'Anlegen fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const removeDemo = async () => {
    setBusy(true);
    try {
      await base44.entities.Alert.deleteMany({ source: 'demo' });
      await base44.entities.Measurement.deleteMany({ source: 'demo' });
      await base44.entities.EnergyReading.deleteMany({ source: 'demo' });
      await base44.entities.Sensor.deleteMany({ source: 'demo' });
      await base44.entities.Room.deleteMany({ source: 'demo' });
      await base44.entities.Floor.deleteMany({ source: 'demo' });
      await base44.entities.Building.deleteMany({ source: 'demo' });
      toast({ title: 'Demo-Daten entfernt', description: 'Alle als Demo gekennzeichneten Datensätze wurden gelöscht.' });
      setConfirmOpen(false);
      await refreshAll();
    } catch (e) {
      toast({ title: 'Entfernen fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (data.loading && !counts) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Daten & Einstellungen"
        description="Datenbestand, Import und Export, Grenzwerte sowie die Vorbereitung für Modell- und Sensoranbindung."
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            <Database className="h-3 w-3" /> gemeinsame Datenbasis
          </span>
        }
      />

      <DemoDataCard counts={counts} onSeed={seed} onRemove={() => setConfirmOpen(true)} onRefresh={refreshAll} busy={busy} />

      <ThresholdEditor thresholds={data.thresholds} records={thresholdRecords} onSaved={refreshAll} />

      <ImportMeasurementsCard sensors={data.sensors} rooms={data.rooms} onImported={refreshAll} />

      <ImportEnergyCard building={data.building} onImported={refreshAll} />

      <ExportCard
        building={data.building}
        floors={data.floors}
        rooms={data.rooms}
        sensors={data.sensors}
        alerts={data.alerts}
        series={data.series}
        thresholds={data.thresholds}
      />

      <PreparationCards building={data.building} rooms={data.rooms} onEditBuilding={() => setBuildingOpen(true)} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Demo-Daten entfernen?"
        description="Alle Datensätze, die als Demo gekennzeichnet sind, werden gelöscht – Gebäude, Geschosse, Räume, Sensoren, Messwerte, Verbrauchswerte und Meldungen. Manuell erfasste und importierte Daten bleiben erhalten."
        confirmLabel="Demo-Daten entfernen"
        onConfirm={removeDemo}
        busy={busy}
      />

      <BuildingDialog open={buildingOpen} onOpenChange={setBuildingOpen} building={data.building} onSaved={refreshAll} />
    </div>
  );
}
