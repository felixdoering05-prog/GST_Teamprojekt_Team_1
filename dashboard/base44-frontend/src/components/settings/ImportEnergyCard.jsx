import { useRef, useState } from 'react';
import { FileDown, Gauge, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { buildCsv, downloadText, parseCsv, parseNumber, readFileAsText } from '@/lib/csv';

const normalize = (key) => String(key || '').toLowerCase().replace(/[\s_\-.]/g, '');

const MEDIUM_ALIASES = {
  strom: 'strom',
  stromverbrauch: 'strom',
  elektrisch: 'strom',
  waerme: 'waerme',
  warme: 'waerme',
  heizung: 'waerme',
  kaltwasser: 'kaltwasser',
  warmwasser: 'warmwasser',
  wasser: 'kaltwasser',
};

const UNIT_BY_MEDIUM = { strom: 'kWh', waerme: 'kWh', kaltwasser: 'm³', warmwasser: 'm³' };

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

export default function ImportEnergyCard({ building, onImported }) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [prepared, setPrepared] = useState(null);
  const [busy, setBusy] = useState(false);

  const prepareRows = (headers, rows) => {
    const get = buildGetter(headers);
    return rows.map((row, index) => {
      const meterCode = get(row, ['meter_code', 'zaehler', 'zähler', 'zaehlernummer', 'meter']);
      const mediumRaw = get(row, ['medium', 'energieart', 'art', 'energietraeger']);
      const medium = MEDIUM_ALIASES[normalize(mediumRaw)] || '';
      const value = parseNumber(get(row, ['value', 'verbrauch', 'wert', 'menge']));
      const unit = get(row, ['unit', 'einheit']) || UNIT_BY_MEDIUM[medium] || '';
      const startRaw = get(row, ['period_start', 'von', 'start', 'beginn']);
      const endRaw = get(row, ['period_end', 'bis', 'ende']);
      const start = startRaw ? new Date(startRaw) : null;
      const end = endRaw ? new Date(endRaw) : null;

      const reasons = [];
      if (!meterCode) reasons.push('Zählerkennung fehlt');
      if (!medium) reasons.push('Energieart unbekannt');
      if (value === null) reasons.push('Verbrauch fehlt oder ist keine Zahl');
      if (!start || Number.isNaN(start.getTime())) reasons.push('Start des Zeitraums fehlt');

      return {
        index: index + 2,
        meter_code: meterCode,
        medium,
        value,
        unit,
        period_start: start && !Number.isNaN(start.getTime()) ? start.toISOString() : null,
        period_end: end && !Number.isNaN(end.getTime()) ? end.toISOString() : start && !Number.isNaN(start.getTime()) ? new Date(start.getTime() + 24 * 3600 * 1000 - 1000).toISOString() : null,
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
          building_id: building ? building.id : null,
          meter_code: row.meter_code,
          medium: row.medium,
          value: row.value,
          unit: row.unit,
          period_start: row.period_start,
          period_end: row.period_end,
          source: 'real',
          note: 'Importierter Ablesewert',
        }));
      for (let i = 0; i < payload.length; i += 200) {
        await base44.entities.EnergyReading.bulkCreate(payload.slice(i, i + 200));
      }
      toast({
        title: 'Import abgeschlossen',
        description: `${valid.length} Verbrauchswerte als echte Daten gespeichert, ${prepared.length - valid.length} Zeile(n) übersprungen.`,
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
      [
        { key: 'meter_code', label: 'meter_code' },
        { key: 'medium', label: 'medium' },
        { key: 'value', label: 'value' },
        { key: 'unit', label: 'unit' },
        { key: 'period_start', label: 'period_start' },
        { key: 'period_end', label: 'period_end' },
      ],
      [
        { meter_code: 'STROM-HAUS', medium: 'strom', value: '482.6', unit: 'kWh', period_start: '2026-10-26T00:00:00', period_end: '2026-10-26T23:59:59' },
      ],
    );
    downloadText('d21-verbrauch-vorlage.csv', csv);
  };

  const validCount = prepared ? prepared.filter((r) => r.valid).length : 0;

  return (
    <section className="surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
          <Gauge className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-heading text-sm font-semibold text-foreground">Verbrauchsdaten importieren (CSV)</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Für die Energieansicht. Erforderliche Spalten: <span className="tabular">meter_code</span>,{' '}
            <span className="tabular">medium</span> (strom, waerme, kaltwasser, warmwasser), <span className="tabular">value</span>,{' '}
            <span className="tabular">period_start</span> und <span className="tabular">period_end</span>.
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3">
          <p className="text-sm text-foreground">
            Vorschau: <span className="tabular font-semibold">{validCount}</span> gültige,{' '}
            <span className="tabular font-semibold text-amber-600">{prepared.length - validCount}</span> fehlerhafte Zeilen
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setPrepared(null); setFileName(''); }}>
              Verwerfen
            </Button>
            <Button size="sm" onClick={importRows} disabled={busy || validCount === 0}>
              {busy ? 'Wird importiert …' : `${validCount} Zeilen importieren`}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
