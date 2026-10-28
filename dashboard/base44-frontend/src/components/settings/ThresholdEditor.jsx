import { useEffect, useState } from 'react';
import { Save, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { METRICS, METRIC_KEYS } from '@/lib/metrics';

const FIELDS = [
  { key: 'warning_min', label: 'Warnung ab' },
  { key: 'warning_max', label: 'Warnung bis' },
  { key: 'critical_min', label: 'Kritisch ab' },
  { key: 'critical_max', label: 'Kritisch bis' },
];

export default function ThresholdEditor({ thresholds, records, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = {};
    METRIC_KEYS.forEach((key) => {
      const t = thresholds[key] || {};
      next[key] = FIELDS.reduce((acc, field) => {
        acc[field.key] = t[field.key] === null || t[field.key] === undefined ? '' : String(t[field.key]);
        return acc;
      }, {});
    });
    setForm(next);
  }, [thresholds]);

  const update = (metricKey, field, value) => {
    setForm((f) => ({ ...f, [metricKey]: { ...f[metricKey], [field]: value } }));
  };

  const save = async () => {
    setBusy(true);
    try {
      for (const metricKey of METRIC_KEYS) {
        const values = form[metricKey] || {};
        const payload = {
          metric: metricKey,
          unit: METRICS[metricKey].unit,
          warning_min: values.warning_min === '' ? null : Number(values.warning_min),
          warning_max: values.warning_max === '' ? null : Number(values.warning_max),
          critical_min: values.critical_min === '' ? null : Number(values.critical_min),
          critical_max: values.critical_max === '' ? null : Number(values.critical_max),
          note: 'Grenzwerte für den regelbasierten Prüflauf',
        };
        const existing = (records || []).find((r) => r.metric === metricKey);
        if (existing) await base44.entities.ThresholdConfig.update(existing.id, payload);
        else await base44.entities.ThresholdConfig.create(payload);
      }
      toast({ title: 'Grenzwerte gespeichert', description: 'Der nächste Prüflauf verwendet die neuen Werte.' });
      await onSaved();
    } catch (e) {
      toast({ title: 'Speichern fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <SlidersHorizontal className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-heading text-sm font-semibold text-foreground">Grenzwerte</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Diese Werte sind die Grundlage für Meldungen und die Bewertung in allen Ansichten. Leere Felder bedeuten: kein Grenzwert in
            dieser Richtung.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {METRIC_KEYS.map((metricKey) => (
          <div key={metricKey} className="rounded-xl border border-border p-4">
            <p className="text-sm font-medium text-foreground">
              {METRICS[metricKey].label} <span className="text-xs font-normal text-muted-foreground">({METRICS[metricKey].unit})</span>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FIELDS.map((field) => (
                <label key={field.key} className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-muted-foreground">{field.label}</span>
                  <input
                    type="number"
                    step="0.1"
                    value={(form[metricKey] || {})[field.key] ?? ''}
                    onChange={(e) => update(metricKey, field.key, e.target.value)}
                    className="tabular h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button className="mt-4" onClick={save} disabled={busy}>
        <Save className="mr-1.5 h-4 w-4" /> {busy ? 'Wird gespeichert …' : 'Grenzwerte speichern'}
      </Button>
    </section>
  );
}
