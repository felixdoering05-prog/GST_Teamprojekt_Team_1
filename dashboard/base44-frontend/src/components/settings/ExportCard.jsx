import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildCsv, downloadText } from '@/lib/csv';
import { METRICS } from '@/lib/metrics';

export default function ExportCard({ building, floors, rooms, sensors, alerts, series, thresholds }) {
  const exportMeasurements = () => {
    const csv = buildCsv(
      [
        { key: 'measured_at', label: 'measured_at' },
        { key: 'sensor_code', label: 'sensor_code' },
        { key: 'room_code', label: 'room_code' },
        { key: 'metric', label: 'metric' },
        { key: 'value', label: 'value' },
        { key: 'unit', label: 'unit' },
        { key: 'source', label: 'source' },
        { key: 'quality', label: 'quality' },
      ],
      series.map((m) => ({
        ...m,
        room_code: (rooms.find((r) => r.id === m.room_id) || {}).room_code || '',
      })),
    );
    downloadText('d21-messwerte-24h.csv', csv);
  };

  const exportRooms = () => {
    const csv = buildCsv(
      [
        { key: 'room_code', label: 'room_code' },
        { key: 'name', label: 'name' },
        { key: 'floor', label: 'geschoss' },
        { key: 'usage', label: 'nutzung' },
        { key: 'area_m2', label: 'flaeche_m2' },
        { key: 'occupants_max', label: 'personen_max' },
        { key: 'sensor_count', label: 'sensoren' },
        { key: 'sensor_codes', label: 'sensor_kennungen' },
        { key: 'revit_room_id', label: 'revit_room_id' },
        { key: 'source', label: 'herkunft' },
      ],
      rooms.map((room) => ({
        ...room,
        floor: (floors.find((f) => f.id === room.floor_id) || {}).name || '',
        sensor_count: sensors.filter((s) => s.room_id === room.id).length,
        sensor_codes: sensors.filter((s) => s.room_id === room.id).map((s) => s.sensor_code).join(' '),
      })),
    );
    downloadText('d21-raeume.csv', csv);
  };

  const exportSensors = () => {
    const csv = buildCsv(
      [
        { key: 'sensor_code', label: 'sensor_code' },
        { key: 'metric', label: 'metric' },
        { key: 'unit', label: 'unit' },
        { key: 'room_code', label: 'room_code' },
        { key: 'status', label: 'status' },
        { key: 'hardware_type', label: 'sensortyp' },
        { key: 'interfaces', label: 'anbindung' },
        { key: 'position_note', label: 'einbauort' },
        { key: 'source', label: 'herkunft' },
      ],
      sensors.map((sensor) => ({
        ...sensor,
        room_code: (rooms.find((r) => r.id === sensor.room_id) || {}).room_code || '',
        interfaces: (sensor.interfaces || []).join(' '),
      })),
    );
    downloadText('d21-sensoren.csv', csv);
  };

  const exportAlerts = () => {
    const csv = buildCsv(
      [
        { key: 'triggered_at', label: 'triggered_at' },
        { key: 'severity', label: 'auspraegung' },
        { key: 'metric', label: 'messgroesse' },
        { key: 'value', label: 'wert' },
        { key: 'threshold', label: 'grenzwert' },
        { key: 'room_label', label: 'raum' },
        { key: 'sensor_code', label: 'sensor' },
        { key: 'status', label: 'status' },
        { key: 'message', label: 'meldung' },
        { key: 'source', label: 'herkunft' },
      ],
      alerts,
    );
    downloadText('d21-meldungen.csv', csv);
  };

  const exportAll = () => {
    const payload = {
      projekt: 'D21 Digital Twin',
      exportiert_am: new Date().toISOString(),
      hinweis: 'Enthält Datensätze mit dem Merkmal Demo und echte Messwerte, jeweils über das Feld „source“ gekennzeichnet.',
      gebaeude: building,
      geschosse: floors,
      raeume: rooms,
      sensoren: sensors,
      grenzwerte: thresholds,
      meldungen: alerts,
      messwerte_letzte_24h: series,
      einheiten: Object.fromEntries(Object.values(METRICS).map((m) => [m.key, m.unit])),
    };
    downloadText('d21-digital-twin-export.json', JSON.stringify(payload, null, 2), 'application/json');
  };

  return (
    <section className="surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Download className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-heading text-sm font-semibold text-foreground">Daten exportieren</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Export für Dokumentation, Zwischenstand oder Auswertung in Tabellenkalkulation und Statistikwerkzeugen.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={exportMeasurements}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Messwerte (24 h, CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportRooms}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Räume (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportSensors}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Sensoren (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportAlerts}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Meldungen (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportAll}>
          <FileJson className="mr-1.5 h-3.5 w-3.5" /> Gesamtexport (JSON)
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Der Messwertexport umfasst die im geladenen Betrachtungszeitraum vorhandenen Werte (letzte 24 Stunden).
      </p>
    </section>
  );
}
