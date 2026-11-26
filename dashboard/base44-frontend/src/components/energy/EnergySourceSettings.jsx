import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { request } from '@/api/base44Client';
import { SelectField, TextField } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const empty = { value: '', label: 'Keine Zuordnung' };
const numberFields = {
  strom: [
    ['battery_capacity', 'Speicherkapazität (kWh)'], ['battery_reserve', 'Reserve für die Berechnung (%)', 100],
    ['emergency_load', 'Notlast für die Berechnung (W)'],
    ['standard_rate', 'Strompreis (€/kWh)'], ['export_rate', 'Einspeisevergütung (€/kWh)'], ['reduced_rate', 'Reduzierter Strompreis (€/kWh)'],
  ],
  wasser: [['tank_capacity', 'Tankkapazität (m³)'], ['water_rate', 'Wasserpreis (€/m³)']],
};
const powerOptions = (sensors) => sensors.filter((item) => item.metric === 'power');
const sensorOption = (item) => ({ value: item.entity_id, label: item.name + ' · ' + item.unit });
const timeFields = [['reduced_from', 'Reduzierter Tarif ab'], ['reduced_to', 'Reduzierter Tarif bis']];

function SourceForm({ data, family, onSave, saving, error }) {
  const [draft, setDraft] = useState(data.settings);
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const selectMeter = (key, id) => {
    const next = { ...draft.meters };
    if (id) next[key] = id;
    else delete next[key];
    set('meters', next);
  };
  const updateModule = (id, values) => set('modules', draft.modules.map((item) => item.entity_id === id ? { ...item, ...values } : item));
  const available = powerOptions(data.sensors).filter((item) => !draft.modules.some((module) => module.entity_id === item.entity_id));
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSave(draft, data.revision); }}>
      {!data.sensors.length && (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Wähle die Sensoren für dieses Gebäude in den <Link className="font-medium underline" to="/daten">Daten-Einstellungen</Link> aus.
        </p>
      )}
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Messquellen für {family === 'strom' ? 'Strom' : 'Wasser'}</legend>
        {Object.entries(data.roles).filter(([, item]) => item.family === family).map(([key, item]) => {
          const selected = draft.meters[key] || '';
          const options = data.sensors.filter((sensor) => sensor.metric === item.metric).map(sensorOption);
          if (selected && !options.some((option) => option.value === selected)) options.push({ value: selected, label: selected + ' · nicht verfügbar' });
          return <SelectField key={key} label={item.label} aria-label={item.label} value={selected}
            options={[empty, ...options]} onChange={(event) => selectMeter(key, event.target.value)} />;
        })}
      </fieldset>
      {family === 'strom' && (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-semibold">PV-Module und Strings</legend>
            {draft.modules.map((module, index) => {
              const sensor = data.sensors.find((item) => item.entity_id === module.entity_id);
              const current = sensor ? sensorOption(sensor) : { value: module.entity_id, label: module.entity_id + ' · nicht verfügbar' };
              return (
                <div key={module.entity_id} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <SelectField className="col-span-2 sm:col-span-1" label={'Modul ' + (index + 1)} aria-label={'Leistungssensor Modul ' + (index + 1)}
                    value={module.entity_id} options={[current, ...available.map(sensorOption)]}
                    onChange={(event) => updateModule(module.entity_id, { entity_id: event.target.value })} />
                  <TextField label="String" aria-label={'String Modul ' + (index + 1)} value={module.group} required maxLength={48}
                    onChange={(event) => updateModule(module.entity_id, { group: event.target.value })} />
                  <Button type="button" variant="outline" size="icon" aria-label={'Modul ' + (index + 1) + ' entfernen'}
                    onClick={() => set('modules', draft.modules.filter((item) => item.entity_id !== module.entity_id))}><X /></Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" disabled={!available.length || draft.modules.length >= 64}
              onClick={() => set('modules', [...draft.modules, { entity_id: available[0].entity_id, group: 'String 1' }])}><Plus /> Modul hinzufügen</Button>
          </fieldset>
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.invert_grid)} onChange={(event) => set('invert_grid', event.target.checked)} /> Vorzeichen für Netzleistung umkehren</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.invert_battery)} onChange={(event) => set('invert_battery', event.target.checked)} /> Vorzeichen für Speicherleistung umkehren</label>
            <p className="text-xs text-muted-foreground">Positive Leistung steht für Netzbezug oder Laden, negative für Einspeisung oder Entladen.</p>
          </div>
        </>
      )}
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Speicher und Tarife</legend>
        {numberFields[family].map(([key, label, max]) => (
          <TextField key={key} label={label} aria-label={label} type="number" min={0} max={max} step="any" value={draft[key] ?? ''}
            onChange={(event) => set(key, event.target.value === '' ? null : event.target.valueAsNumber)} />
        ))}
        {family === 'strom' && timeFields.map(([key, label]) => (
          <TextField key={key} label={label} aria-label={label} type="time" value={draft[key] || ''} onChange={(event) => set(key, event.target.value)} />
        ))}
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Messquellen und Tarife speichern'}</Button>
    </form>
  );
}

export default function EnergySourceSettings({ building, family, headers, teamId, onClose }) {
  const path = '/buildings/' + building + '/energy/settings';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['energy-settings', teamId, building], queryFn: () => request(path, { headers }), staleTime: 0 });
  async function save(settings, revision) {
    setSaving(true);
    setError('');
    try {
      await request(path, { method: 'PUT', body: { settings, revision }, headers });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['energy-settings', teamId, building] }),
        cache.invalidateQueries({ queryKey: ['energy-live', teamId, building] }),
      ]);
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Messquellen und Tarife</DialogTitle>
          <DialogDescription>Ordne ausgewählte Home-Assistant-Sensoren zu und hinterlege Kapazitäten und Arbeitspreise für dieses Gebäude.</DialogDescription>
        </DialogHeader>
        {query.isPending && <p role="status">Messquellen werden geladen …</p>}
        {query.isError && <p role="alert">{query.error.message}</p>}
        {query.data && <SourceForm key={query.data.revision} data={query.data} family={family} onSave={save} saving={saving} error={error} />}
      </DialogContent>
    </Dialog>
  );
}
