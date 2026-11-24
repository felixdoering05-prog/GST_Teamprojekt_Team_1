import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { request } from '@/api/base44Client';

export function rememberBuilding(id) {
  localStorage.setItem('d21-selected-building', String(id));
  window.dispatchEvent(new Event('d21-building-change'));
}

export function useBuildingSelection() {
  const [team, setTeam] = useState(() => localStorage.getItem('d21-selected-team'));
  const [params, setParams] = useSearchParams();
  const query = useQuery({ queryKey: ['account-buildings', team], queryFn: () => request('/buildings') });
  useEffect(() => {
    const update = () => setTeam(localStorage.getItem('d21-selected-team'));
    window.addEventListener('d21-team-change', update);
    return () => window.removeEventListener('d21-team-change', update);
  }, []);
  const buildings = query.data ?? [];
  const requested = params.get('building');
  const building = [requested, localStorage.getItem('d21-selected-building')].map(id =>
    buildings.find(row => String(row.id) === id)).find(Boolean) ?? buildings[0];
  function choose(id) {
    rememberBuilding(id);
    setParams({ building: String(id) });
  }
  return { building, buildings, query, choose, params, team };
}
