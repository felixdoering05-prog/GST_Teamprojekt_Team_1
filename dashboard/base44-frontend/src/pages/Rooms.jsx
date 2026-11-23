import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Layers, Plus, RefreshCw, Users } from 'lucide-react';
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
import { base44, request } from '@/api/base44Client';
import useD21Data from '@/hooks/useD21Data';
import BuildingWorkspace from '@/components/rooms/BuildingWorkspace';
import BuildingSetupDialog from '@/components/rooms/BuildingSetupDialog';
import BuildingStartSteps from '@/components/rooms/BuildingStartSteps';
import BuildingTeam from '@/components/rooms/BuildingTeam';
import SharedBuildingStructure from '@/components/rooms/SharedBuildingStructure';
import DeleteBuildingButton from '@/components/rooms/DeleteBuildingButton';
import { documentKey } from '@/components/rooms/buildingFilesModel';
import BuildingGroups from '@/components/rooms/BuildingGroups';

const buildingsKey = ['account-buildings'];

export default function Rooms() {
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [setupOpen, setSetupOpen] = useState(false);
  const [teamBuildingId, setTeamBuildingId] = useState(null);
  const { toast } = useToast();
  const buildings = useQuery({
    queryKey: buildingsKey,
    queryFn: () => request('/buildings'),
    refetchOnWindowFocus: true,
  });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => request('/teams') });
  const activeTeam = (teams.data || []).find(team => String(team.id) === localStorage.getItem('d21-selected-team')) || (teams.data || []).find(team => team.is_owner) || teams.data?.[0];
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const requestedId = params.get('building');
  const selected = buildings.data?.find(building => String(building.id) === requestedId);
  const start = params.get('start') === '1';
  const requestedSection = params.get('section');
  const section = ['overview', 'gallery', 'models', 'rooms'].includes(requestedSection) ? requestedSection : 'overview';
  const refreshBuildings = () => cache.invalidateQueries({ queryKey: buildingsKey });

  function openBuilding(building, guided = false, nextSection = 'overview') {
    localStorage.setItem('d21-selected-building', building.id);
    setParams({ building: String(building.id), ...(guided ? { start: '1' } : {}), ...(nextSection !== 'overview' ? { section: nextSection } : {}) });
  }

  function created(building, options = {}) {
    cache.setQueryData(buildingsKey, rows => [
      ...(rows ?? []).filter(row => row.id !== building.id), { ...building, ...(rows ?? []).find(row => row.id === building.id), is_owner: true },
    ]);
    setSetupOpen(false);
    openBuilding(building, false, options.section ?? 'overview');
    refreshBuildings();
  }

  function leaveBuilding() {
    if (!selected) return;
    cache.setQueryData(buildingsKey, rows => (rows ?? []).filter(row => row.id !== selected.id));
    if (localStorage.getItem('d21-selected-building') === String(selected.id)) {
      localStorage.removeItem('d21-selected-building');
    }
    setTeamBuildingId(null);
    setParams({}, { replace: true });
    refreshBuildings();
  }

  async function deletedBuilding(building) {
    await cache.cancelQueries({ queryKey: buildingsKey });
    cache.setQueryData(buildingsKey, rows => (rows ?? []).filter(row => row.id !== building.id));
    if (localStorage.getItem('d21-selected-building') === String(building.id)) localStorage.removeItem('d21-selected-building');
    setTeamBuildingId(null);
    setSetupOpen(false);
    setParams({}, { replace: true });
    cache.removeQueries({ queryKey: documentKey(building.id) });
    cache.invalidateQueries();
    toast({ title: 'Gebäude gelöscht', description: `„${building.name}“ wurde entfernt.` });
  }

  return (
    <div className="space-y-5">
      {selected ? (
        <>
          <PageHeader title={selected.name} description={selected.address || (selected.is_owner ? 'Gebäudemappe' : 'Geteiltes Gebäude')}>
            <DeleteBuildingButton key={selected.id} building={selected} onDeleted={deletedBuilding} />
            <Button variant="ghost" size="sm" onClick={() => setParams({})}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Zur Gebäudeliste
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTeamBuildingId(selected.id)}>
              <Users className="mr-1.5 h-4 w-4" aria-hidden="true" /> {selected.is_owner ? 'Gebäude teilen' : 'Gebäudeteam'}
            </Button>
          </PageHeader>
          {buildings.data.length > 1 && (
            <label className="flex flex-wrap items-center gap-3 text-sm">
              Gebäude wechseln
              <select className="max-w-full rounded-md border bg-background px-3 py-2" value={selected.id}
                onChange={event => {
                  const building = buildings.data.find(row => String(row.id) === event.target.value);
                  if (building) openBuilding(building);
                }}>
                {buildings.data.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}
              </select>
            </label>
          )}
          <BuildingWorkspace key={selected.id} building={selected} section={section}
            onSection={nextSection => setParams({ building: String(selected.id), ...(nextSection !== 'overview' ? { section: nextSection } : {}) }, { replace: true })}
            onSetup={() => setSetupOpen(true)} onTeam={() => setTeamBuildingId(selected.id)}
            structure={selected.is_owner
              ? <OwnedBuilding key={selected.id} buildingId={String(selected.id)} onSaved={refreshBuildings} />
              : <SharedBuildingStructure key={selected.id} buildingId={selected.id} />} />
          {teamBuildingId === selected.id && (
            <BuildingTeam key={selected.id} building={selected} onClose={() => setTeamBuildingId(null)} onLeave={leaveBuilding} />
          )}
        </>
      ) : (
        <>
          <PageHeader title="Deine Gebäude" description="Deine Gebäude, Bilder und Modelle. Alles an einem Ort.">
            <Button onClick={() => setSetupOpen(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Gebäude anlegen</Button>
            {activeTeam?.can_manage_groups && <Button variant="outline" onClick={() => setGroupCreateOpen(open => !open)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Gebäudegruppe erstellen</Button>}
          </PageHeader>
          <details className="surface space-y-4 p-5" open={start || undefined}>
            <summary className="cursor-pointer font-heading font-semibold">Erste Schritte</summary>
            <BuildingStartSteps active={1} />
          </details>
          {buildings.isPending && <p role="status" className="text-sm text-muted-foreground">Gebäude werden geladen …</p>}
          {buildings.error && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-destructive">{buildings.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => buildings.refetch()}>Erneut versuchen</Button>
            </div>
          )}
          {requestedId && buildings.isSuccess && <p role="status" className="text-sm text-muted-foreground">Dieses Gebäude ist für dein Konto nicht verfügbar.</p>}
          <BuildingGroups buildings={buildings.data || []} onOpenBuilding={building => openBuilding(building)} createOpen={groupCreateOpen} onCloseCreate={() => setGroupCreateOpen(false)} />
        </>
      )}
      {setupOpen && <BuildingSetupDialog building={selected} onClose={() => setSetupOpen(false)} onCreated={created} />}
    </div>
  );
}

function OwnedBuilding({ buildingId, onSaved }) {
  const data = useD21Data(buildingId);
  const { toast } = useToast();
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

  if (data.error || data.building?.id !== buildingId) {
    return <EmptyState icon={Building2} title="Gebäudedaten konnten nicht geladen werden"
      description={data.error || 'Dieses Gebäude ist für dein Konto nicht verfügbar.'}>
      <Button variant="outline" onClick={data.reload}>Erneut versuchen</Button>
    </EmptyState>;
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

      <BuildingPanel
        building={data.building}
        floors={data.floors}
        rooms={data.rooms}
        sensors={data.sensors}
        onEdit={() => setBuildingOpen(true)}
      />

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
        building={data.building}
        onSaved={() => Promise.all([data.reload(), onSaved()])}
      />
      <FloorDialog
        open={floorState.open}
        onOpenChange={(open) => setFloorState((s) => ({ ...s, open }))}
        floor={floorState.floor}
        building={data.building}
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

