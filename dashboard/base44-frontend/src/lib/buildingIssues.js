import { useQuery } from '@tanstack/react-query';
import { request } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export const issueStatus = { open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt' };
export const issuePriority = { urgent: 'Dringend', high: 'Hoch', normal: 'Normal', low: 'Niedrig' };
export const priorityLabel = value => issuePriority[value] || 'Nicht festgelegt';
export const issuePath = (building, id) => `/buildings/${building}/issues/${id}`;
export const issueLink = issue => `/meldungen?building=${issue.building_id}&issue=${issue.id}`;

export function useIssueOverview() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['building-issues', user?.id],
    queryFn: () => request('/issues'),
    enabled: !!user,
    refetchInterval: 8000,
    retry: (count, error) => ![401, 403, 404].includes(error.status) && count < 1,
    gcTime: 0,
  });
}
