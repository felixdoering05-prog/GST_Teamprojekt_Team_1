import { useRef, useState } from 'react';
import { FileDown, Gauge, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { buildCsv, downloadText, parseCsv, parseNumber, readFileAsText } from '@/lib/csv';
import { ENERGY_MEDIA, energyKey } from '@/lib/energy';

const normalize = (key) => String(key || '').toLowerCase().replace(/[\s_\-.]/g, '');

const MEDIUM_ALIASES = {
  strom: 'strom',
  stromverbrauch: 'strom',
  elektrisch: 'strom',
  electricity: 'strom',
  waerme: 'waerme',
  warme: 'waerme',
  heizung: 'waerme',
  heat: 'waerme',
  wärme: 'waerme',
  kaltwasser: 'kaltwasser',
  warmwasser: 'warmwasser',
  wasser: 'wasser',
  wassergesamt: 'wasser',
  coldwater: 'kaltwasser',
  hotwater: 'warmwasser',
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
      const medium = MEDIUM_ALIASES[normalize(mediumRaw)] || (Object.hasOwn(ENERGY_MEDIA, mediumRaw) ? mediumRaw : '');
      const value = parseNumber(get(row, ['value', 'verbrauch', 'wert', 'menge']));
      const unit = get(row, ['unit', 'einheit']) || ENERGY_MEDIA[medium]?.[1] || '';
      const startRaw = get(row, ['period_start', 'von', 'start', 'beginn']);
      const endRaw = get(row, ['period_end', 'bis', 'ende']);
      const start = startRaw ? new Date(startRaw) : null;
      const end = endRaw ? new Date(endRaw) : null;
      const dateRaw = get(row, ['reading_date', 'ablesedatum']);
      const unitName = get(row, ['unit_name', 'nutzungseinheit']);
      const readingRaw = get(row, ['meter_reading', 'zaehlerstand', 'zählerstand']);
      const costRaw = get(row, ['cost_eur', 'kosten']);
      const meterReading = parseNumber(readingRaw);
      const cost = parseNumber(costRaw);

      const reasons = [];
      if (!meterCode) reasons.push('Zählerkennung fehlt');
      if (!medium) reasons.push('Energieart unbekannt');
      if (value === null) reasons.push('Verbrauch fehlt oder ist keine Zahl');
      if ((startRaw && !Number.isFinite(start?.getTime())) || (!startRaw && !dateRaw)) reasons.push('Verbrauchsbeginn oder Ablesedatum fehlt');
      if (dateRaw && !Number.isFinite(Date.parse(dateRaw))) reasons.push('Ablesedatum ungültig');
      if (endRaw && (!start || !Number.isFinite(end?.getTime()) || end < start)) reasons.push('Verbrauchsende ungültig');
      if (readingRaw && meterReading === null) reasons.push('Zählerstand ungültig');
      if (costRaw && cost === null) reasons.push('Kosten ungültig');

      return {
        index: index + 2,
        meter_code: meterCode,
        medium,
        value,
        unit,
        unit_id: get(row, ['unit_id']) || (unitName ? energyKey(unitName) : null),
        unit_name: unitName || null,
        meter_name: get(row, ['meter_name', 'zählername', 'zaehlername']) || null,
        meter_reading: meterReading,
        reading_date: dateRaw || null,
        cost_eur: cost,
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
      const payload = valid.map(({ index: _index, valid: _valid, reason: _reason, ...row }) => ({
        ...row, building_id: building ? building.id : null, source: 'real', capture_method: 'csv',
      }));
      let duplicates = 0;
      for (let i = 0; i < payload.length; i += 200) {
        const result = await base44.entities.EnergyReading.bulkCreate(payload.slice(i, i + 200));
        duplicates += result.filter((row) => row.duplicate).length;
      }
      toast({
        title: 'Import abgeschlossen',
        description: `${valid.length - duplicates} neu, ${duplicates} bereits vorhanden, ${prepared.length - valid.length} fehlerhaft.`,
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
        { key: 'reading_date', label: 'reading_date' },
        { key: 'unit_name', label: 'unit_name' },
        { key: 'meter_reading', label: 'meter_reading' },
        { key: 'cost_eur', label: 'cost_eur' },
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
            <span className="tabular">medium</span>, <span className="tabular">value</span> und ein Verbrauchsbeginn oder Ablesedatum.
            Zählerstand, Kosten und Nutzungseinheit können ergänzt werden.
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
