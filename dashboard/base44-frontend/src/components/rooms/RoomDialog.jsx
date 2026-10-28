import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectField, TextAreaField, TextField } from '@/components/Field';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

const EMPTY = { room_code: '', name: '', floor_id: '', usage: 'Büro', area_m2: '', revit_room_id: '', ifc_global_id: '', occupants_max: '', notes: '' };

export default function RoomDialog({ open, onOpenChange, room, floors, building, defaultFloorId, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      room
        ? {
            room_code: room.room_code || '',
            name: room.name || '',
            floor_id: room.floor_id || '',
            usage: room.usage || 'Büro',
            area_m2: room.area_m2 ?? '',
            revit_room_id: room.revit_room_id || '',
            ifc_global_id: room.ifc_global_id || '',
            occupants_max: room.occupants_max ?? '',
            notes: room.notes || '',
          }
        : { ...EMPTY, floor_id: defaultFloorId || (floors[0] ? floors[0].id : '') },
    );
  }, [open, room, defaultFloorId, floors]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const save = async () => {
    if (!form.room_code.trim() || !form.name.trim()) {
      toast({ title: 'Angaben fehlen', description: 'Raum-ID und Raumname sind erforderlich.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        room_code: form.room_code.trim(),
        name: form.name.trim(),
        floor_id: form.floor_id || null,
        building_id: building ? building.id : null,
        usage: form.usage,
        area_m2: form.area_m2 === '' ? null : Number(form.area_m2),
        revit_room_id: form.revit_room_id.trim(),
        ifc_global_id: form.ifc_global_id.trim(),
        occupants_max: form.occupants_max === '' ? null : Number(form.occupants_max),
        notes: form.notes,
      };
      if (room) await base44.entities.Room.update(room.id, payload);
      else await base44.entities.Room.create({ ...payload, sensor_ids: [], source: 'real' });
      toast({ title: room ? 'Raum aktualisiert' : 'Raum angelegt', description: `${payload.room_code} ${payload.name}` });
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
          <DialogTitle>{room ? 'Raum bearbeiten' : 'Raum anlegen'}</DialogTitle>
          <DialogDescription>
            Raum-ID, Name, Nutzung und Fläche werden von allen Ansichten verwendet. Die Revit-Raum-ID ist für die spätere Modellanbindung reserviert.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Raum-ID *" value={form.room_code} onChange={set('room_code')} placeholder="z. B. EG.05" />
          <TextField label="Raumname *" value={form.name} onChange={set('name')} placeholder="z. B. Seminarraum E2" />
          <SelectField
            label="Geschoss"
            value={form.floor_id}
            onChange={set('floor_id')}
            placeholder="Kein Geschoss zugeordnet"
            options={floors.map((f) => ({ value: f.id, label: `${f.name}${f.level !== null && f.level !== undefined ? ` (Ebene ${f.level})` : ''}` }))}
          />
          <TextField label="Nutzung" value={form.usage} onChange={set('usage')} placeholder="z. B. Büro, Labor, Seminarraum" />
          <TextField label="Fläche in m²" type="number" step="0.1" value={form.area_m2} onChange={set('area_m2')} />
          <TextField label="Maximale Personenzahl" type="number" value={form.occupants_max} onChange={set('occupants_max')} />
          <TextField label="Revit-Raum-ID (reserviert)" value={form.revit_room_id} onChange={set('revit_room_id')} placeholder="z. B. R-EG-05" />
          <TextField label="IFC GlobalId (reserviert)" value={form.ifc_global_id} onChange={set('ifc_global_id')} placeholder="optional" />
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
