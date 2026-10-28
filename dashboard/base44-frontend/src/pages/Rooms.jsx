import { useMemo, useState } from 'react';
import { Building2, Layers, Plus, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import BuildingPanel from '@/components/rooms/BuildingPanel';
import BuildingDialog from '@/components/rooms/BuildingDialog';
import FloorSection from '@/components/rooms/FloorSection';
import FloorDialog from '@/components/rooms/FloorDialog';
import RoomDialog from '@/components/rooms/RoomDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import useD21Data from '@/hooks/useD21Data';
import BuildingFiles from '@/components/rooms/BuildingFiles';

export default function Rooms() {
  const data = useD21Data();
  const { toast } = useToast();
  const [newBuilding,setNewBuilding]=useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [floorState, setFloorState] = useState({ open: false, floor: null });
  const [roomState, setRoomState] = useState({ open: false, room: null, floorId: null });
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);

  const floors = useMemo(
    () => [...data.floors].sort((a, b) => (a.level ?? 0) - (b.level ?? 0)),
    [data.floors],
  );

  const sensorsOfRoom = (roomId) => data.sensors.filter((s) => s.room_id === roomId);

  const requestDeleteFloor = (floor) => {
    const count = data.rooms.filter((r) => r.floor_id === floor.id).length;
    if (count > 0) {
      toast({
        title: 'Geschoss nicht leer',
        description: `Im Geschoss ${floor.name} sind noch ${count} Räume angelegt. Bitte zuerst die Räume entfernen.`,
        variant: 'destructive',
      });
      return;
    }
    setConfirmState({
      title: `Geschoss ${floor.name} löschen?`,
      description: 'Das Geschoss wird dauerhaft aus der Datenbasis entfernt.',
      action: async () => base44.entities.Floor.delete(floor.id),
      success: `Geschoss ${floor.name} gelöscht`,
    });
  };

  const requestDeleteRoom = (room) => {
    const assigned = sensorsOfRoom(room.id);
    if (assigned.length) {
      toast({
        title: 'Raum hat zugeordnete Sensoren',
        description: `${assigned.length} Sensor(en) sind diesem Raum zugeordnet. Bitte die Zuordnung zuerst in der Sensorik ändern.`,
        variant: 'destructive',
      });
      return;
    }
    setConfirmState({
      title: `Raum ${room.room_code} löschen?`,
      description: `${room.name} wird dauerhaft aus der Datenbasis entfernt.`,
      action: async () => base44.entities.Room.delete(room.id),
      success: `Raum ${room.room_code} gelöscht`,
    });
  };

  const runDelete = async () => {
    if (!confirmState) return;
    setBusy(true);
    try {
      await confirmState.action();
      toast({ title: 'Gelöscht', description: confirmState.success });
      setConfirmState(null);
      await data.reload();
    } catch (e) {
      toast({ title: 'Löschen fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (data.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gebäude & Räume"
        description="Geschosse und Räume anlegen, bearbeiten und verwalten. Die Raum-ID ist der Schlüssel für Sensorzuordnung und spätere Revit-Verknüpfung."
      >
        <Button variant="outline" size="sm" onClick={data.reload}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Aktualisieren
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFloorState({ open: true, floor: null })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Geschoss
        </Button>
        <Button size="sm" onClick={() => setRoomState({ open: true, room: null, floorId: floors[0] ? floors[0].id : null })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Raum
        </Button>
      </PageHeader>

      {data.error && <p role="alert" className="text-destructive">{data.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="building-select">Gebäude auswählen</label>
        <select id="building-select" className="rounded border p-2" value={data.building?.id || ''} onChange={e=>{localStorage.setItem('d21-selected-building',e.target.value);data.reload()}}>
          {data.buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <Button variant="outline" onClick={()=>{setNewBuilding(true);setBuildingOpen(true)}}>Weiteres Gebäude anlegen</Button>
      </div>
      <BuildingPanel
        building={data.building}
        floors={data.floors}
        rooms={data.rooms}
        sensors={data.sensors}
        onEdit={() => {setNewBuilding(false);setBuildingOpen(true)}}
      />

      {data.building && <BuildingFiles key={data.building.id} building={data.building} />}

      {floors.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Noch keine Geschosse angelegt"
          description="Geschosse strukturieren das Gebäude. Legen Sie zuerst ein Geschoss an und danach die zugehörigen Räume."
          children={
            <Button onClick={() => setFloorState({ open: true, floor: null })}>
              <Plus className="mr-1.5 h-4 w-4" /> Geschoss anlegen
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {floors.map((floor) => (
            <FloorSection
              key={floor.id}
              floor={floor}
              rooms={data.rooms}
              sensors={data.sensors}
              latest={data.latest}
              thresholds={data.thresholds}
              onEditFloor={() => setFloorState({ open: true, floor })}
              onDeleteFloor={() => requestDeleteFloor(floor)}
              onAddRoom={() => setRoomState({ open: true, room: null, floorId: floor.id })}
              onEditRoom={(room) => setRoomState({ open: true, room, floorId: room.floor_id })}
              onDeleteRoom={requestDeleteRoom}
            />
          ))}
        </div>
      )}

      {data.rooms.length === 0 && floors.length > 0 ? (
        <EmptyState
          icon={Building2}
          compact
          title="Noch keine Räume angelegt"
          description="Räume sind die Basis für Sensorzuordnung, Grenzwertprüfung und die spätere Raumzuordnung im Modell."
          children={<Button onClick={() => setRoomState({ open: true, room: null, floorId: floors[0].id })}>Raum anlegen</Button>}
        />
      ) : null}

      <BuildingDialog
        open={buildingOpen}
        onOpenChange={setBuildingOpen}
        building={newBuilding ? null : data.building}
        onSaved={data.reload}
      />
      <FloorDialog
        open={floorState.open}
        onOpenChange={(open) => setFloorState((s) => ({ ...s, open }))}
        floor={floorState.floor}
        building={newBuilding ? null : data.building}
        onSaved={data.reload}
      />
      <RoomDialog
        open={roomState.open}
        onOpenChange={(open) => setRoomState((s) => ({ ...s, open }))}
        room={roomState.room}
        floors={floors}
        building={data.building}
        defaultFloorId={roomState.floorId}
        onSaved={data.reload}
      />
      <ConfirmDialog
        open={Boolean(confirmState)}
        onOpenChange={(open) => !open && setConfirmState(null)}
        title={confirmState ? confirmState.title : ''}
        description={confirmState ? confirmState.description : ''}
        onConfirm={runDelete}
        busy={busy}
      />
    </div>
  );
}
