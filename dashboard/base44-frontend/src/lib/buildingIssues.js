import { useQuery } from '@tanstack/react-query';
import { request } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { buildingScopeHeaders, useBuildingScope } from '@/hooks/useBuildingScope';

export const issueStatus = { open: 'Offen', assigned: 'Zugewiesen', in_progress: 'In Arbeit', done: 'Erledigt' };
export const issueSource = { operator: 'Betreiber', tenant: 'Mieter', bim: 'BIM', energy: 'Energie', alarm: 'Alarm' };
export const issuePriority = { urgent: 'Dringend', high: 'Hoch', normal: 'Normal', low: 'Niedrig' };
export const priorityLabel = value => issuePriority[value] || 'Nicht festgelegt';
export const issuePath = (building, id) => `/buildings/${building}/issues/${id}`;
export const issueLink = issue => `/meldungen?building=${issue.building_id}&issue=${issue.id}`;

export function useIssueOverview() {
  const { user } = useAuth();
  const scope = useBuildingScope();
  const headers = buildingScopeHeaders(scope.readable('issues'));
  return useQuery({
    queryKey: ['building-issues', user?.id, scope.team?.id, headers['X-D21-Buildings']],
    queryFn: () => request('/issues', { headers }),
    enabled: !!user,
    refetchInterval: 8000,
    retry: (count, error) => ![401, 403, 404].includes(error.status) && count < 1,
    gcTime: 0,
  });
}
