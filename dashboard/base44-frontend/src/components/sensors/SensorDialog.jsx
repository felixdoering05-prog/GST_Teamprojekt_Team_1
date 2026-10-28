import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/Field';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { METRICS } from '@/lib/metrics';

const INTERFACES = [
  { value: 'csv', label: 'CSV-Datei' },
  { value: 'api', label: 'Schnittstelle (API)' },
  { value: 'bacnet', label: 'BACnet / Gebäudeautomation' },
  { value: 'modbus', label: 'Modbus' },
];

const EMPTY = {
  sensor_code: '',
  name: '',
  metric: 'temperature',
  room_id: '',
  status: 'aktiv',
  hardware_type: '',
  position_note: '',
  installed_date: '',
  last_calibration: '',
  interfaces: ['api'],
  source: 'real',
};

export default function SensorDialog({ open, onOpenChange, sensor, rooms, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      sensor
        ? {
            sensor_code: sensor.sensor_code || '',
            name: sensor.name || '',
            metric: sensor.metric || 'temperature',
            room_id: sensor.room_id || '',
            status: sensor.status || 'aktiv',
            hardware_type: sensor.hardware_type || '',
            position_note: sensor.position_note || '',
            installed_date: sensor.installed_date || '',
            last_calibration: sensor.last_calibration || '',
            interfaces: sensor.interfaces || [],
            source: sensor.source || 'real',
          }
        : { ...EMPTY, room_id: rooms[0] ? rooms[0].id : '' },
    );
  }, [open, sensor, rooms]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const toggleInterface = (value) => {
    setForm((f) => ({
      ...f,
      interfaces: f.interfaces.includes(value) ? f.interfaces.filter((i) => i !== value) : [...f.interfaces, value],
    }));
  };

  const save = async () => {
    if (!form.sensor_code.trim()) {
      toast({ title: 'Angaben fehlen', description: 'Die Sensorkennung ist erforderlich.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        sensor_code: form.sensor_code.trim(),
        name: form.name.trim(),
        metric: form.metric,
        unit: METRICS[form.metric] ? METRICS[form.metric].unit : '',
        room_id: form.room_id || null,
        status: form.status,
        hardware_type: form.hardware_type.trim(),
        position_note: form.position_note.trim(),
        installed_date: form.installed_date.trim(),
        last_calibration: form.last_calibration.trim(),
        interfaces: form.interfaces,
        source: form.source,
      };
      if (sensor) await base44.entities.Sensor.update(sensor.id, payload);
      else await base44.entities.Sensor.create(payload);
      toast({ title: sensor ? 'Sensor aktualisiert' : 'Sensor angelegt', description: payload.sensor_code });
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
          <DialogTitle>{sensor ? 'Sensor bearbeiten' : 'Sensor anlegen'}</DialogTitle>
          <DialogDescription>
            Jeder Sensor misst genau eine Messgröße und ist einem Raum zugeordnet. Die Kennung wird beim Import von Messwerten verwendet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Sensorkennung *" value={form.sensor_code} onChange={set('sensor_code')} placeholder="z. B. EG.05-CO2" />
          <TextField label="Bezeichnung" value={form.name} onChange={set('name')} placeholder="z. B. CO₂ EG.05" />
          <SelectField
            label="Messgröße"
            value={form.metric}
            onChange={set('metric')}
            options={Object.values(METRICS).map((m) => ({ value: m.key, label: `${m.label} (${m.unit})` }))}
          />
          <SelectField
            label="Raum"
            value={form.room_id}
            onChange={set('room_id')}
            placeholder="Kein Raum zugeordnet"
            options={rooms.map((r) => ({ value: r.id, label: `${r.room_code} ${r.name}` }))}
          />
          <SelectField
            label="Status"
            value={form.status}
            onChange={set('status')}
            options={[
              { value: 'aktiv', label: 'aktiv' },
              { value: 'inaktiv', label: 'inaktiv' },
              { value: 'defekt', label: 'defekt' },
            ]}
          />
          <SelectField
            label="Datenherkunft"
            value={form.source}
            onChange={set('source')}
            options={[
              { value: 'demo', label: 'Demo-Datensatz (simuliert)' },
              { value: 'real', label: 'Echte Datenquelle' },
            ]}
          />
          <TextField label="Sensortyp / Gerät" value={form.hardware_type} onChange={set('hardware_type')} placeholder="optional" />
          <TextField label="Einbauort" value={form.position_note} onChange={set('position_note')} placeholder="z. B. Innenwand, 1,5 m" />
          <TextField label="Inbetriebnahme" type="date" value={form.installed_date} onChange={set('installed_date')} />
          <TextField label="Letzte Kalibrierung" type="date" value={form.last_calibration} onChange={set('last_calibration')} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Vorgesehene Datenanbindung</p>
          <div className="flex flex-wrap gap-2">
            {INTERFACES.map((item) => {
              const active = form.interfaces.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleInterface(item.value)}
                  className={
                    active
                      ? 'rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 ring-1 ring-inset ring-cyan-600/30'
                      : 'rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-300/50'
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
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
