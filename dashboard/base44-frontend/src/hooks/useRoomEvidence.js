import { useQuery } from '@tanstack/react-query';
import { request } from '@/api/base44Client';
import { useBuildingScope } from './useBuildingScope';

export function useRoomEvidence(buildingID) {
  const scope = useBuildingScope();
  const structure = useQuery({
    queryKey: ['building-structure', buildingID],
    queryFn: () => request('/buildings/' + buildingID + '/structure'),
    enabled: !!buildingID && scope.can(buildingID, 'structure'),
    retry: false,
  });
  const temperatures = useQuery({
    queryKey: ['room-temperatures', buildingID],
    queryFn: () => request('/buildings/' + buildingID + '/telemetry/room-temperatures'),
    enabled: !!buildingID && scope.can(buildingID, 'sensors'),
    retry: false,
    refetchInterval: 60000,
  });
  return { structure, temperatures };
}
