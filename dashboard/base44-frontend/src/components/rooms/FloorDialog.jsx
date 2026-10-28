import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextAreaField, TextField } from '@/components/Field';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

const EMPTY = { name: '', level: '', area_m2: '', height_m: '', revit_level_id: '', notes: '' };

export default function FloorDialog({ open, onOpenChange, floor, building, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      floor
        ? {
            name: floor.name || '',
            level: floor.level ?? '',
            area_m2: floor.area_m2 ?? '',
            height_m: floor.height_m ?? '',
            revit_level_id: floor.revit_level_id || '',
            notes: floor.notes || '',
          }
        : EMPTY,
    );
  }, [open, floor]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Angaben fehlen', description: 'Die Bezeichnung des Geschosses ist erforderlich.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        level: form.level === '' ? null : Number(form.level),
        area_m2: form.area_m2 === '' ? null : Number(form.area_m2),
        height_m: form.height_m === '' ? null : Number(form.height_m),
        revit_level_id: form.revit_level_id.trim(),
        notes: form.notes,
        building_id: building ? building.id : null,
      };
      if (floor) await base44.entities.Floor.update(floor.id, payload);
      else await base44.entities.Floor.create({ ...payload, source: 'real' });
      toast({ title: floor ? 'Geschoss aktualisiert' : 'Geschoss angelegt', description: payload.name });
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{floor ? 'Geschoss bearbeiten' : 'Geschoss anlegen'}</DialogTitle>
          <DialogDescription>Geschosse gruppieren die Räume und bilden die Ebenen des späteren IFC-Modells ab.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Bezeichnung *" value={form.name} onChange={set('name')} placeholder="z. B. EG, 1. OG, UG" />
          <TextField label="Geschosswert" type="number" value={form.level} onChange={set('level')} placeholder="0, 1, 2 oder -1" />
          <TextField label="Geschossfläche in m²" type="number" step="0.1" value={form.area_m2} onChange={set('area_m2')} />
          <TextField label="Lichte Höhe in m" type="number" step="0.01" value={form.height_m} onChange={set('height_m')} />
          <TextField label="Revit-Ebene (reserviert)" className="sm:col-span-2" value={form.revit_level_id} onChange={set('revit_level_id')} placeholder="optional" />
          <TextAreaField label="Notizen" className="sm:col-span-2" value={form.notes} onChange={set('notes')} />
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
