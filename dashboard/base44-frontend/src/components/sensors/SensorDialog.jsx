import { useEffect, useMemo, useState } from 'react';
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
  asset_number: '01',
  function_key: 'HVAC',
  asset_type: 'SENSOR',
};

const sanitizeCodePart = (value, fallback) => {
  const raw = String(value ?? '');
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized ? normalized.slice(0, 12) : fallback;
};

const buildSensorCode = ({ buildingId, roomCode, floorName, assetNumber, functionKey, assetType }) => {
  const building = sanitizeCodePart(buildingId || 'GEB', 'GEB');
  const floor = sanitizeCodePart(floorName || 'OHNEGESCHOSS', 'OHNEGESCHOSS');
  const room = sanitizeCodePart(roomCode || 'OHNERAUM', 'OHNERAUM');
  const asset = sanitizeCodePart(assetNumber, '01');
  const fn = sanitizeCodePart(functionKey, 'FUNKTION');
  const type = sanitizeCodePart(assetType, 'TYP');
  return `${building}-${floor}-${room}-${asset}-${fn}-${type}`;
};

export default function SensorDialog({ open, onOpenChange, sensor, rooms = [], onSaved, defaultRoomId = '' }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === form.room_id) || null,
    [rooms, form.room_id],
  );

  const previewCode = useMemo(
    () => buildSensorCode({
      buildingId: selectedRoom?.building_id || rooms[0]?.building_id || 'GEB',
      roomCode: selectedRoom?.room_code,
      floorName: selectedRoom?.floor_name || 'OHNEGESCHOSS',
      assetNumber: form.asset_number,
      functionKey: form.function_key,
      assetType: form.asset_type,
    }),
    [selectedRoom, rooms, form.asset_number, form.function_key, form.asset_type],
  );

  useEffect(() => {
    if (!open) return;
    const roomId = sensor ? sensor.room_id || '' : defaultRoomId || (rooms[0] ? rooms[0].id : '');

    setForm(
      sensor
        ? {
            ...EMPTY,
            ...sensor,
            room_id: roomId,
            asset_number: sensor.asset_number || '01',
            function_key: sensor.function_key || 'HVAC',
            asset_type: sensor.asset_type || 'SENSOR',
          }
        : { ...EMPTY, room_id: roomId },
    );
  }, [open, sensor, rooms, defaultRoomId]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const toggleInterface = (value) => {
    setForm((f) => ({
      ...f,
      interfaces: f.interfaces.includes(value) ? f.interfaces.filter((i) => i !== value) : [...f.interfaces, value],
    }));
  };

  const save = async () => {
    if (!form.asset_number.trim() || !form.function_key.trim() || !form.asset_type.trim()) {
      toast({
        title: 'Angaben fehlen',
        description: 'Anlagennummer, Funktion und Anlagentyp sind erforderlich.',
        variant: 'destructive',
      });
      return;
    }

    setBusy(true);
    try {
      const payload = {
        sensor_code: previewCode,
        name: form.name.trim() || previewCode,
        metric: form.metric,
        unit: METRICS[form.metric] ? METRICS[form.metric].unit : '',
        room_id: form.room_id || null,
        building_id: selectedRoom?.building_id || rooms[0]?.building_id || null,
        asset_number: form.asset_number.trim(),
        function_key: form.function_key.trim(),
        asset_type: form.asset_type.trim(),
        status: form.status,
        hardware_type: form.hardware_type.trim() || form.asset_type.trim(),
        position_note: form.position_note.trim(),
        installed_date: form.installed_date.trim(),
        last_calibration: form.last_calibration.trim(),
        interfaces: form.interfaces,
        source: form.source,
      };

      if (sensor) await base44.entities.Sensor.update(sensor.id, payload);
      else await base44.entities.Sensor.create(payload);

      toast({
        title: sensor ? 'Datenpunkt aktualisiert' : 'Datenpunkt angelegt',
        description: payload.sensor_code,
      });

      onOpenChange(false);
      await onSaved?.();
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
          <DialogTitle>{sensor ? 'Datenpunkt bearbeiten' : 'Datenpunkt anlegen'}</DialogTitle>
          <DialogDescription>
            Der Zeichenschlüssel bildet Gebäude, Geschoss, Raum, Anlagennummer, Funktion und Typ ab. Ohne Raumzuordnung wird OHNERAUM verwendet.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-cyan-800">Vorschau Zeichenschlüssel</p>
          <code className="mt-1 block break-all text-sm font-semibold text-slate-900">{previewCode}</code>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Anlagennummer *" value={form.asset_number} onChange={set('asset_number')} placeholder="z. B. 01" />
          <TextField label="Funktion *" value={form.function_key} onChange={set('function_key')} placeholder="z. B. HVAC" />
          <TextField label="Anlagentyp *" value={form.asset_type} onChange={set('asset_type')} placeholder="z. B. VENT" />
          <TextField label="Bezeichnung" value={form.name} onChange={set('name')} placeholder="z. B. Ablufttemperatur" />
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
            placeholder="Keinem Raum zugeordnet"
            options={rooms.map((room) => ({ value: room.id, label: `${room.room_code} ${room.name}` }))}
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
