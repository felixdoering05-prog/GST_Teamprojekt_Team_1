import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectField, TextAreaField, TextField } from '@/components/Field';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

const EMPTY = {
  name: '',
  code: '',
  site: '',
  address: '',
  year_built: '',
  gross_area_m2: '',
  floors_count: '',
  usage_type: '',
  description: '',
  bim_model_ref: '',
  bim_status: 'vorbereitet',
};

export default function BuildingDialog({ open, onOpenChange, building, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      building
        ? {
            name: building.name || '',
            code: building.code || '',
            site: building.site || '',
            address: building.address || '',
            year_built: building.year_built ?? '',
            gross_area_m2: building.gross_area_m2 ?? '',
            floors_count: building.floors_count ?? '',
            usage_type: building.usage_type || '',
            description: building.description || '',
            bim_model_ref: building.bim_model_ref || '',
            bim_status: building.bim_status || 'vorbereitet',
          }
        : EMPTY,
    );
  }, [open, building]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Angaben fehlen', description: 'Die Gebäudebezeichnung ist erforderlich.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        site: form.site.trim(),
        address: form.address.trim(),
        year_built: form.year_built === '' ? null : Number(form.year_built),
        gross_area_m2: form.gross_area_m2 === '' ? null : Number(form.gross_area_m2),
        floors_count: form.floors_count === '' ? null : Number(form.floors_count),
        usage_type: form.usage_type.trim(),
        description: form.description,
        bim_model_ref: form.bim_model_ref.trim(),
        bim_status: form.bim_status,
      };
      if (building) await base44.entities.Building.update(building.id, payload);
      else { const created = await base44.entities.Building.create({ ...payload, source: 'real' }); localStorage.setItem('d21-selected-building',created.id); }
      toast({ title: building ? 'Gebäude aktualisiert' : 'Gebäude angelegt', description: payload.name });
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast({ title: 'Speichern fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{building ? 'Gebäude bearbeiten' : 'Gebäude anlegen'}</DialogTitle>
          <DialogDescription>Stammdaten des Gebäudes und Stand der Revit-/IFC-Verknüpfung.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Bezeichnung *" value={form.name} onChange={set('name')} placeholder="z. B. D21" />
          <TextField label="Kurzzeichen" value={form.code} onChange={set('code')} placeholder="z. B. D21" />
          <TextField label="Standort" value={form.site} onChange={set('site')} placeholder="z. B. Hochschule Darmstadt" />
          <TextField label="Adresse" value={form.address} onChange={set('address')} placeholder="optional" />
          <TextField label="Baujahr" type="number" value={form.year_built} onChange={set('year_built')} />
          <TextField label="Bruttogrundfläche in m²" type="number" step="0.1" value={form.gross_area_m2} onChange={set('gross_area_m2')} />
          <TextField label="Anzahl Geschosse" type="number" value={form.floors_count} onChange={set('floors_count')} />
          <TextField label="Hauptnutzung" value={form.usage_type} onChange={set('usage_type')} placeholder="z. B. Hochschulgebäude" />
          <TextField
            label="Verweis Revit-/IFC-Modell"
            className="sm:col-span-2"
            value={form.bim_model_ref}
            onChange={set('bim_model_ref')}
            placeholder="Modellname, Dateiablage oder Freigabestand"
          />
          <SelectField
            label="Stand der Modellverknüpfung"
            value={form.bim_status}
            onChange={set('bim_status')}
            options={[
              { value: 'nicht_verknuepft', label: 'Nicht verknüpft' },
              { value: 'vorbereitet', label: 'Vorbereitet (Raumfelder angelegt)' },
              { value: 'verknuepft', label: 'Verknüpft' },
            ]}
          />
          <TextAreaField label="Beschreibung" className="sm:col-span-2" value={form.description} onChange={set('description')} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
