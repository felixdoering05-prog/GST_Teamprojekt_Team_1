import { request } from '@/api/base44Client';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 1600;

export async function prepareIssuePhoto(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('Das Foto kann auf diesem Gerät nicht geöffnet werden. Wähle ein JPG- oder PNG-Foto.'); }

    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = quality => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    let photo = await jpeg(0.84);
    if (photo?.size > MAX_BYTES) photo = await jpeg(0.6);
    if (!photo || photo.size > MAX_BYTES) throw new Error('Das Foto konnte nicht verarbeitet werden. Wähle ein kleineres Foto.');
    return photo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function uploadIssuePhoto(path, photo) {
  return request(`${path}/photo`, { method: 'PUT', body: photo, raw: true, headers: { 'Content-Type': photo.type } });
}
