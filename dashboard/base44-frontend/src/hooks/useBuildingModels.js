import { useQueries, useQuery } from '@tanstack/react-query';
import { request } from '@/api/base44Client';
import { documentKey } from '@/components/rooms/buildingFilesModel';
import { useBuildingScope } from './useBuildingScope';

export function useBuildingModels(buildings) {
  const scope = useBuildingScope();
  const teamID = scope.team?.id;
  const campus = useQuery({
    queryKey: ['campus-model', teamID],
    queryFn: () => request('/campus/d21'),
    enabled: !!buildings.length && !!teamID,
    retry: false,
  });
  const documents = useQueries({
    queries: buildings.map(building => ({
      queryKey: documentKey(building.id),
      queryFn: () => request('/buildings/' + building.id + '/documents'),
      enabled: scope.can(building.id, 'documents'),
    })),
  });
  const models = buildings.flatMap((building, index) => {
    const files = scope.can(building.id, 'documents')
      ? (documents[index].data ?? []).filter(file => file.mime_type === 'application/x-step') : [];
    const info = { buildingID: building.id, buildingName: building.name, canEditTerrain: building.is_owner };
    const campusFile = campus.data && String(campus.data.building_id) === String(building.id)
      ? [{ ...campus.data, ...info, campus: true, canEditTerrain: false }] : [];
    return [...files.map(file => ({ ...file, ...info })), ...campusFile];
  });
  return {
    models,
    loading: campus.isLoading || documents.some(query => query.isLoading),
    error: documents.find(query => query.isError)?.error,
    refresh: () => Promise.all([campus.refetch(), ...documents.filter((_, index) => scope.can(buildings[index].id, 'documents')).map(query => query.refetch())]),
  };
}
