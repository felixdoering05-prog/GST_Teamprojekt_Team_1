import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusChip from '@/components/StatusChip';
import SourceBadge from '@/components/SourceBadge';
import { formatNumber, metric } from '@/lib/metrics';
import { readingsForRoom, statusForRoom } from '@/lib/roomMetrics';
import SensorDialog from '@/components/sensors/SensorDialog';

export default function FloorSection({ floor, rooms, sensors, latest, thresholds, onEditFloor, onDeleteFloor, onAddRoom, onEditRoom, onDeleteRoom }) {
  const [openRoom, setOpenRoom] = useState(null);
  const [sensorState, setSensorState] = useState({ open: false, sensor: null, roomId: '' });
  const floorRooms = rooms.filter((r) => r.floor_id === floor.id).sort((a, b) => String(a.room_code).localeCompare(String(b.room_code), 'de'));
  const floorSensors = sensors.filter((s) => floorRooms.some((r) => r.id === s.room_id));
  const saveSensor = async () => { await window.__d21Reload?.(); };

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="tabular grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
              {floor.level !== null && floor.level !== undefined ? floor.level : '–'}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-base font-semibold text-foreground">{floor.name}</h3><SourceBadge source={floor.source} /></div>
              <p className="mt-0.5 text-xs text-muted-foreground">{floorRooms.length} Räume · {floorSensors.length} Sensoren{floor.area_m2 ? ` · ${floor.area_m2} m²` : ''}{floor.height_m ? ` · Höhe ${floor.height_m} m` : ''}{floor.revit_level_id ? ` · Revit-Ebene ${floor.revit_level_id}` : ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={onAddRoom}><Plus className="mr-1.5 h-3.5 w-3.5" /> Raum</Button>
            <Button size="sm" variant="ghost" onClick={onEditFloor} aria-label="Geschoss bearbeiten"><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={onDeleteFloor} aria-label="Geschoss löschen"><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button>
          </div>
        </div>

        {floorRooms.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">In diesem Geschoss sind noch keine Räume angelegt.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead><tr className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-5 py-2.5 font-medium">Raum-ID</th><th className="px-3 py-2.5 font-medium">Name</th><th className="px-3 py-2.5 font-medium">Nutzung</th><th className="px-3 py-2.5 font-medium">Fläche</th><th className="px-3 py-2.5 font-medium">Aktuelle Werte</th><th className="px-3 py-2.5 font-medium">Sensorzuordnung</th><th className="px-3 py-2.5 font-medium">Revit-Raum-ID</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-5 py-2.5 text-right font-medium">Aktionen</th></tr></thead>
              <tbody className="divide-y divide-border">
                {floorRooms.map((room) => {
                  const roomSensors = sensors.filter((s) => s.room_id === room.id);
                  const readings = readingsForRoom(room, sensors, latest, thresholds);
                  const expanded = openRoom === room.id;
                  return (
                    <tr key={room.id} className="align-top transition-colors hover:bg-slate-50/60">
                      <td className="tabular px-5 py-3 font-medium text-foreground">{room.room_code}</td><td className="px-3 py-3 text-foreground">{room.name}</td><td className="px-3 py-3 text-muted-foreground">{room.usage || '–'}</td><td className="tabular px-3 py-3 text-muted-foreground">{room.area_m2 ? `${room.area_m2} m²` : '–'}</td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-x-3 gap-y-1">{Object.keys(readings).map((key) => <span key={key} className="tabular whitespace-nowrap text-xs text-muted-foreground">{metric(key).short}: <span className="font-medium text-foreground">{formatNumber(key, readings[key].value)}</span></span>)}</div></td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{roomSensors.length ? roomSensors.map((s) => s.sensor_code).join(', ') : 'Keine Sensoren zugeordnet'}</td><td className="tabular px-3 py-3 text-xs text-muted-foreground">{room.revit_room_id || '– reserviert –'}</td><td className="px-3 py-3"><StatusChip level={statusForRoom(room, sensors, latest, thresholds)} size="xs" /></td>
                      <td className="px-5 py-3"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => setOpenRoom(expanded ? null : room.id)} aria-expanded={expanded}>Datenpunkte ({roomSensors.length})</Button><Button size="sm" variant="ghost" onClick={() => setSensorState({ open: true, sensor: null, roomId: room.id })} aria-label={`Datenpunkt in Raum ${room.room_code} anlegen`}><Plus className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => onEditRoom(room)} aria-label="Raum bearbeiten"><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => onDeleteRoom(room)} aria-label="Raum löschen"><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button></div></td>
                      {expanded && <td colSpan={9} className="bg-slate-50/70 px-5 py-4"><div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-semibold text-foreground">Datenpunkte · {room.room_code} {room.name}</h4><Button size="sm" onClick={() => setSensorState({ open: true, sensor: null, roomId: room.id })}><Plus className="mr-1.5 h-3.5 w-3.5" /> Datenpunkt anlegen</Button></div>{roomSensors.length ? <ul className="grid gap-2 sm:grid-cols-2">{roomSensors.map((sensor) => <li key={sensor.id} className="rounded-lg border border-border bg-white p-3"><code className="block break-all text-xs font-semibold text-cyan-800">{sensor.sensor_code}</code><p className="mt-1 text-sm font-medium">{sensor.name || metric(sensor.metric).label}</p><p className="mt-1 text-xs text-muted-foreground">{metric(sensor.metric).label} · {sensor.asset_number || '–'} · {sensor.function_key || '–'} · {sensor.asset_type || sensor.hardware_type || '–'} · {sensor.status || 'aktiv'}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">Für diesen Raum sind noch keine Datenpunkte angelegt.</p>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <SensorDialog open={sensorState.open} onOpenChange={(open) => setSensorState((s) => ({ ...s, open }))} sensor={sensorState.sensor} rooms={rooms.map((room) => ({ ...room, floor_name: floor.name }))} defaultRoomId={sensorState.roomId} onSaved={saveSensor} />
    </>
  );
}
