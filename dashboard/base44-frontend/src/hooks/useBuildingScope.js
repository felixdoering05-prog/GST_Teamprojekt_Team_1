import { createContext, useContext } from 'react';

export const BuildingScopeContext = createContext(null);

export function useBuildingScope() {
  return useContext(BuildingScopeContext);
}

export function buildingScopeHeaders(buildings) {
  return { 'X-D21-Buildings': buildings.map(building => building.id).join(',') || 'none' };
}
