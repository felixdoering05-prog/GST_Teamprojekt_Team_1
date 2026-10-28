import { useRef, useState } from 'react';
import { FileDown, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { buildCsv, downloadText, parseCsv, parseNumber, readFileAsText } from '@/lib/csv';
import { METRICS } from '@/lib/metrics';

const normalize = (key) => String(key || '').toLowerCase().replace(/[\s_\-.]/g, '');

const METRIC_ALIASES = {
  temperature: 'temperature',
  temperatur: 'temperature',
  temp: 'temperature',
  co2: 'co2',
  luftfeuchte: 'humidity',
  luftfeuchtigkeit: 'humidity',
  feuchte: 'humidity',
  humidity: 'humidity',
};

function buildGetter(headers) {
  const map = {};
  headers.forEach((h) => {
    map[normalize(h)] = h;
  });
  return (row, names) => {
    for (const name of names) {
      const key = map[normalize(name)];
      if (key && row[key] !== undefined && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  };
}

export default function ImportMeasurementsCard({ sensors, rooms, onImported }) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [prepared, setPrepared] = useState(null);
  const [busy, setBusy] = useState(false);

  const roomById = {};
  rooms.forEach((r) => { roomById[r.id] = r; });

  const prepareRows = (headers, rows) => {
    const get = buildGetter(headers);
    return rows.map((row, index) => {
      const sensorCode = get(row, ['sensor_code', 'sensor', 'sensorcode', 'kennung']);
      const roomCode = get(row, ['room_code', 'raum', 'raumid', 'room']);
      const metricRaw = get(row, ['metric', 'messgroesse', 'messgrosse', 'art']);
      const metric = METRIC_ALIASES[normalize(metricRaw)] || '';
      const value = parseNumber(get(row, ['value', 'wert', 'messwert']));
      const rawTime = get(row, ['measured_at', 'timestamp', 'zeitpunkt', 'zeit', 'datum']);
      const date = rawTime ? new Date(rawTime) : null;
      const measuredAt = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;

      let sensor = null;
      if (sensorCode) sensor = sensors.find((s) => s.sensor_code.toLowerCase() === sensorCode.toLowerCase()) || null;
      if (!sensor && roomCode && metric) {
        const room = rooms.find((r) => String(r.room_code).toLowerCase() === roomCode.toLowerCase());
        if (room) sensor = sensors.find((s) => s.room_id === room.id && s.metric === metric) || null;
      }

      const reasons = [];
      if (!sensor) reasons.push('Kein Sensor gefunden');
      if (value === null) reasons.push('Wert fehlt oder ist keine Zahl');
      if (!measuredAt) reasons.push('Zeitstempel fehlt oder ist ungültig');

      return {
        index: index + 2,
        sensor,
        roomLabel: sensor ? (roomById[sensor.room_id] ? roomById[sensor.room_id].room_code : '–') : roomCode || '–',
        metric: sensor ? sensor.metric : metric,
        value,
        measured_at: measuredAt,
        valid: reasons.length === 0,
        reason: reasons.join(', '),
      };
    });
  };

  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await readFileAsText(file);
      const { headers, rows } = parseCsv(text);
      if (!headers.length || !rows.length) {
        toast({ title: 'Datei ohne Inhalt', description: 'Es konnten keine Datenzeilen gelesen werden.', variant: 'destructive' });
        setPrepared(null);
        return;
      }
      setPrepared(prepareRows(headers, rows));
    } catch (e) {
      toast({ title: 'Datei konnte nicht gelesen werden', description: e.message, variant: 'destructive' });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const importRows = async () => {
    const valid = prepared.filter((r) => r.valid);
    if (!valid.length) {
      toast({ title: 'Kein importierbarer Datensatz', description: 'Alle Zeilen enthalten Fehler.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const payload = valid.map((row) => ({
        sensor_id: row.sensor.id,
        sensor_code: row.sensor.sensor_code,
        room_id: row.sensor.room_id || null,
        building_id: row.sensor.building_id || null,
        metric: row.metric,
        value: row.value,
        unit: row.sensor.unit || (METRICS[row.metric] ? METRICS[row.metric].unit : ''),
        measured_at: row.measured_at,
        source: 'real',
        quality: 'ok',
      }));
      for (let i = 0; i < payload.length; i += 200) {
        await base44.entities.Measurement.bulkCreate(payload.slice(i, i + 200));
      }
      toast({
        title: 'Import abgeschlossen',
        description: `${payload.length} Messwerte als echte Daten gespeichert, ${prepared.length - valid.length} Zeile(n) übersprungen.`,
      });
      setPrepared(null);
      setFileName('');
      await onImported();
    } catch (e) {
      toast({ title: 'Import fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const csv = buildCsv(
      [{ key: 'sensor_code', label: 'sensor_code' }, { key: 'metric', label: 'metric' }, { key: 'value', label: 'value' }, { key: 'measured_at', label: 'measured_at' }],
      [
        { sensor_code: 'EG.02-CO2', metric: 'co2', value: '1120', measured_at: '2026-10-27T08:30:00' },
        { sensor_code: 'EG.02-T', metric: 'temperature', value: '23.4', measured_at: '2026-10-27T08:30:00' },
      ],
    );
    downloadText('d21-messwerte-vorlage.csv', csv);
  };

  const validCount = prepared ? prepared.filter((r) => r.valid).length : 0;
  const invalidCount = prepared ? prepared.length - validCount : 0;

  return (
    <section className="surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <FileUp className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-heading text-sm font-semibold text-foreground">Messwerte importieren (CSV)</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Importierte Werte werden als <span className="font-medium text-foreground">echte Daten</span> gespeichert und sind damit klar von
            den Demo-Werten getrennt. Erforderliche Spalten: <span className="tabular">sensor_code</span>,{' '}
            <span className="tabular">value</span>, <span className="tabular">measured_at</span>. Alternativ werden{' '}
            <span className="tabular">room_code</span> und <span className="tabular">metric</span> akzeptiert. Trennzeichen Semikolon oder Komma.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <FileDown className="mr-1.5 h-3.5 w-3.5" /> Vorlage herunterladen
        </Button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5" /> CSV-Datei wählen
          <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
        </label>
        {fileName ? <span className="self-center text-xs text-muted-foreground">{fileName}</span> : null}
      </div>

      {prepared ? (
        <div className="mt-4 rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm text-foreground">
              Vorschau: <span className="tabular font-semibold">{validCount}</span> gültige,{' '}
              <span className="tabular font-semibold text-amber-600">{invalidCount}</span> fehlerhafte Zeilen
            </p>
            <Button size="sm" onClick={importRows} disabled={busy || validCount === 0}>
              {busy ? 'Wird importiert …' : `${validCount} Zeilen importieren`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 text-left uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Zeile</th>
                  <th className="px-3 py-2 font-medium">Sensor</th>
                  <th className="px-3 py-2 font-medium">Raum</th>
                  <th className="px-3 py-2 font-medium">Messgröße</th>
                  <th className="px-3 py-2 font-medium">Wert</th>
                  <th className="px-3 py-2 font-medium">Zeitstempel</th>
                  <th className="px-4 py-2 font-medium">Hinweis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {prepared.slice(0, 6).map((row) => (
                  <tr key={row.index} className={row.valid ? '' : 'bg-amber-50/50'}>
                    <td className="tabular px-4 py-2">{row.index}</td>
                    <td className="tabular px-3 py-2">{row.sensor ? row.sensor.sensor_code : '–'}</td>
                    <td className="px-3 py-2">{row.roomLabel}</td>
                    <td className="px-3 py-2">{row.metric ? METRICS[row.metric]?.label || row.metric : '–'}</td>
                    <td className="tabular px-3 py-2">{row.value === null ? '–' : row.value}</td>
                    <td className="px-3 py-2">{row.measured_at ? row.measured_at.replace('T', ' ').slice(0, 16) : '–'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.valid ? 'ok' : row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {prepared.length > 6 ? (
            <p className="px-4 py-2 text-[11px] text-muted-foreground">… und {prepared.length - 6} weitere Zeilen</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Hinweis: Beim Import wird nicht auf Duplikate geprüft – dieselbe Datei sollte nicht mehrfach importiert werden.
      </p>
    </section>
  );
}
