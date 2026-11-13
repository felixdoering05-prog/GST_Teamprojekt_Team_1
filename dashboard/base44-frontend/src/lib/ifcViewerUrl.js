const viewerPath = '/ifc-viewer/index.html';

export function ifcViewerUrl({ example, campus, mapOnly, heat, roomHeat, presentation } = {}) {
  const params = new URLSearchParams();
  if (example) params.set('example', 'true');
  if (campus) {
    params.set('campus', 'd21');
    if (mapOnly) params.set('map-only', 'true');
  }
  if (heat) params.set('heat', 'true');
  if (roomHeat) params.set('room-heat', 'true');
  if (presentation) params.set('presentation', presentation);
  const query = params.toString();
  return query ? `${viewerPath}?${query}` : viewerPath;
}

export function legacyIfcViewerUrl(pathname) {
  let path;
  try { path = decodeURIComponent(pathname); } catch { return null; }
  return path === `${viewerPath}&heat=true`
    ? ifcViewerUrl({ campus: true, mapOnly: true, heat: true })
    : null;
}
