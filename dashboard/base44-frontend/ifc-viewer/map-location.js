const number = '[-+]?\\d+(?:[.,]\\d+)?';
const pair = new RegExp(`^\\s*(${number})\\s*[,;\\s]\\s*(${number})\\s*$`);
const decimal = value => Number(String(value).replace(',', '.'));

export function mapLocation(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function fromPair(value) {
  const match = value?.match(pair);
  return match ? mapLocation(decimal(match[1]), decimal(match[2])) : null;
}

export function locationFromInput(input) {
  const value = input.trim();
  if (!value || value.length > 5000) return null;
  const coordinates = fromPair(value);
  if (coordinates) return coordinates;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const params = url.searchParams;
  if (/^(www\.)?openstreetmap\.org$/.test(url.hostname)) {
    if (params.get('mlat')?.trim() && params.get('mlon')?.trim()) {
      return mapLocation(Number(params.get('mlat')), Number(params.get('mlon')));
    }
    const [, latitude, longitude] = new URLSearchParams(url.hash.slice(1)).get('map')?.split('/') ?? [];
    return mapLocation(Number(latitude), Number(longitude));
  }
  const google = /^(?:(?:www|maps)\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(url.hostname);
  if (!google || (url.hostname.startsWith('maps.') === false && !/^\/maps(?:\/|$)/.test(url.pathname))) return null;
  for (const key of ['query', 'q', 'center', 'viewpoint']) {
    const point = fromPair(params.get(key));
    if (point) return point;
  }
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return null; }
  const pin = path.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const center = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|\/|$)/);
  const match = pin || center;
  return match ? mapLocation(Number(match[1]), Number(match[2])) : null;
}

export function ifcAngle(value) {
  const parts = Array.isArray(value) ? value : value?.value;
  if (!Array.isArray(parts) || parts.length < 3 || parts.length > 4) return null;
  const numbers = parts.map(part => typeof part === 'number' ? part : part?.value);
  if (!numbers.every(Number.isInteger) || Math.abs(numbers[1]) >= 60 || Math.abs(numbers[2]) >= 60 || Math.abs(numbers[3] ?? 0) >= 1e6) return null;
  const [degrees, minutes, seconds, millionths = 0] = numbers.map(Math.abs);
  return (numbers.find(value => value !== 0) < 0 ? -1 : 1) *
    (degrees + minutes / 60 + (seconds + millionths / 1e6) / 3600);
}
