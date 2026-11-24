import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { SelectField, TextField } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ENERGY_MEDIA, energyKey } from '@/lib/energy';

export default function ReadingDialog({ buildings, selectedBuilding, selectedMedium, onClose, onSaved }) {
  const { toast } = useToast();
  const [building, setBuilding] = useState(buildings.find((row) => row.id === selectedBuilding)?.id || buildings[0]?.id || '');
  const [medium, setMedium] = useState(selectedMedium || 'strom');
  const [unit, setUnit] = useState(ENERGY_MEDIA[selectedMedium || 'strom'][1]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = (key) => form.get(key)?.trim() || null;
    const numeric = (key) => input(key) === null ? null : Number(input(key));
    const unitName = input('unit_name');
    const payload = {
      building_id: building, unit_name: unitName, unit_id: unitName ? energyKey(unitName) : null,
      medium, unit, meter_code: input('meter_code'), value: numeric('value'), meter_reading: numeric('meter_reading'),
      reading_date: input('reading_date'), period_start: input('period_start'), period_end: input('period_end'), cost_eur: numeric('cost_eur'),
      capture_method: 'manual', source: 'real',
    };
    setSaving(true);
    setError('');
    try {
      const result = await base44.entities.EnergyReading.create(payload);
      toast({ title: result.duplicate ? 'Ablesung bereits vorhanden' : 'Ablesung gespeichert' });
      onSaved(result);
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Ablesung erfassen</DialogTitle><DialogDescription>Verbrauch und Zählerstand je Ablesung.</DialogDescription></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <SelectField label="Gebäude" aria-label="Gebäude" required value={building} options={buildings.map((row) => ({ value: row.id, label: row.name }))} onChange={(e) => setBuilding(e.target.value)} />
          <TextField label="Nutzungseinheit" aria-label="Nutzungseinheit" name="unit_name" />
          <SelectField label="Verbrauchsart" aria-label="Verbrauchsart" value={medium} options={Object.entries(ENERGY_MEDIA).map(([value, [label]]) => ({ value, label }))} onChange={(e) => { setMedium(e.target.value); setUnit(ENERGY_MEDIA[e.target.value][1]); }} />
          <SelectField label="Einheit" aria-label="Einheit" value={unit} options={[...new Set([ENERGY_MEDIA[medium][1], ...(medium === 'warmwasser' || medium === 'gas' ? ['kWh', 'm³'] : [])])].map((value) => ({ value, label: value }))} onChange={(e) => setUnit(e.target.value)} />
          <TextField label="Zählernummer" aria-label="Zählernummer" name="meter_code" required />
          <TextField label="Zählerstand" aria-label="Zählerstand" name="meter_reading" type="number" step="any" />
          <TextField label="Verbrauch" aria-label="Verbrauch" name="value" type="number" step="any" required />
          <TextField label="Kosten in €" aria-label="Kosten in Euro" name="cost_eur" type="number" step="any" />
          <TextField label="Verbrauchszeitraum von" aria-label="Verbrauchszeitraum von" name="period_start" type="date" />
          <TextField label="Verbrauchszeitraum bis" aria-label="Verbrauchszeitraum bis" name="period_end" type="date" />
          <TextField label="Ablesedatum" aria-label="Ablesedatum" name="reading_date" type="date" required />
          {error && <p className="text-sm text-destructive sm:col-span-2" role="alert">{error}</p>}
          <DialogFooter className="sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Ablesung speichern'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
