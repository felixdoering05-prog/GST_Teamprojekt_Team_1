export const documentKey = id => ['building-documents', String(id)];
export const isImage = file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.mime_type);
export const isModel = file => file.mime_type === 'application/x-step';
export function uploadProblem(file, mode = 'all') {
  const extension = file.name.split('.').at(-1).toLowerCase();
  const images = ['jpg', 'jpeg', 'png', 'webp'];
  const allowed = mode === 'photos' ? images : mode === 'maintenance' ? ['pdf', ...images] : ['pdf', ...images, 'dxf', 'dwg', 'ifc'];
  if (!allowed.includes(extension)) return `${file.name}: Dieses Dateiformat wird hier nicht unterstützt.`;
  if (!file.size || file.size > (extension === 'ifc' ? 20 : 25) * 1024 * 1024) return `${file.name}: Bitte eine nicht leere Datei bis ${extension === 'ifc' ? 20 : 25} MB auswählen.`;
  return null;
}
