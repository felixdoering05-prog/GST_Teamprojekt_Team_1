import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function SharedBuildingStructure({ buildingId }) {
  const structure = useQuery({
    queryKey: ['building-structure', buildingId],
    queryFn: () => request(`/buildings/${buildingId}/structure`),
    refetchOnWindowFocus: true,
  });
  const floors = [...(structure.data?.floors ?? [])].sort((a, b) =>
    (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name, 'de'));
  const groups = new Map(floors.map(floor => [floor.id, { ...floor, rooms: [] }]));
  const unassigned = { id: 'unassigned', name: 'Räume ohne Geschoss', rooms: [] };
  for (const room of structure.data?.rooms ?? []) {
    (groups.get(room.floor_id) ?? unassigned).rooms.push(room);
  }
  if (unassigned.rooms.length) groups.set(unassigned.id, unassigned);

  return (
    <section className="surface space-y-4 p-5" aria-labelledby="shared-structure">
      <h2 id="shared-structure" className="flex items-center gap-2 font-heading font-semibold">
        <Layers className="h-4 w-4 text-primary" aria-hidden="true" /> Geschosse & Räume
      </h2>
      {structure.isPending && <p role="status" className="text-sm text-muted-foreground">Gebäudestruktur wird geladen …</p>}
      {structure.error && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-destructive">{structure.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => structure.refetch()}>Erneut versuchen</Button>
        </div>
      )}
      {structure.isSuccess && (groups.size ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...groups.values()].map(group => (
            <div key={group.id} className="min-w-0 rounded-lg border p-3">
              <h3 className="break-words text-sm font-semibold">{group.name}</h3>
              {group.rooms.length ? (
                <ul className="mt-2 space-y-1 break-words text-sm text-muted-foreground">
                  {group.rooms.sort((a, b) => a.room_code.localeCompare(b.room_code, 'de', { numeric: true }))
                    .map(room => <li key={room.id}>{room.room_code} · {room.name}</li>)}
                </ul>
              ) : <p className="mt-2 text-sm text-muted-foreground">Keine Räume hinterlegt.</p>}
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Für dieses Gebäude sind noch keine Geschosse oder Räume hinterlegt.</p>)}
    </section>
  );
}
