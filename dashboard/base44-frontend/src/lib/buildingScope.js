const buildingParameters = ['building', 'building_id', 'room', 'focusRoom', 'floor', 'model', 'issue', 'alert', 'asset', 'linkAsset', 'task', 'unit', 'offset', 'all', 'start'];

export function findBuilding(buildings, id) {
  return buildings.find(building => String(building.id) === String(id));
}

export function resolveBuildingScope(team, groups, selection) {
  const all = team?.buildings ?? [];
  const building = selection.startsWith('building:') ? findBuilding(all, selection.slice(9)) : null;
  const group = groups.find(item => selection === 'group:' + item.id);
  return {
    value: building || group ? selection : 'all',
    label: building?.name ?? group?.name ?? 'Alle Gebäude',
    building,
    buildings: building ? [building] : group ? all.filter(item => findBuilding(group.buildings, item.id)) : all,
  };
}

export function canUseBuilding(access, module, action = 'read') {
  const level = access?.permissions?.[module];
  return access?.is_owner === true || level === 'edit' || (action === 'read' && level === 'read');
}

export function linkedBuildingTeam(teams, currentTeam, id) {
  if (!id) return null;
  if (currentTeam && findBuilding(currentTeam.buildings, id)) return currentTeam;
  return teams.find(team => findBuilding(team.buildings, id));
}

export function clearBuildingParameters(search) {
  const next = new URLSearchParams(search);
  for (const key of buildingParameters) next.delete(key);
  return next;
}

export function legacyIssuesLocation({ search, hash }) {
  const params = new URLSearchParams(search);
  params.set('ansicht', 'maengel');
  return { pathname: '/meldungen', search: '?' + params, hash };
}
