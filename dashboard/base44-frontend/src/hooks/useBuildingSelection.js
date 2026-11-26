import { useBuildingScope } from './useBuildingScope.js';

export function useBuildingSelection(module) {
  const scope = useBuildingScope();
  const available = scope.readable(module);
  const buildings = scope.building ? scope.readable(module, { team: true }) : available;
  return {
    buildings,
    building: available.length === 1 ? available[0] : null,
    choose: scope.chooseBuilding,
  };
}
