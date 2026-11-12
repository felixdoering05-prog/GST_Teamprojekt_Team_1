export const ROOM_HEAT_STOPS = [
  { value: 16, color: '#477ac5' },
  { value: 20, color: '#54b7cb' },
  { value: 23, color: '#e9d77e' },
  { value: 26, color: '#ed9a53' },
  { value: 30, color: '#cc514e' },
];

export const ROOM_NO_DATA = '#d5dbe1';

export function roomHeatColor(value) {
  if (!Number.isFinite(value)) return ROOM_NO_DATA;
  const first = ROOM_HEAT_STOPS[0], last = ROOM_HEAT_STOPS.at(-1);
  if (value <= first.value) return first.color;
  if (value >= last.value) return last.color;
  const index = ROOM_HEAT_STOPS.findIndex(stop => stop.value >= value);
  const lower = ROOM_HEAT_STOPS[index - 1], upper = ROOM_HEAT_STOPS[index];
  const mix = (value - lower.value) / (upper.value - lower.value);
  return '#' + [1, 3, 5].map(offset => {
    const a = parseInt(lower.color.slice(offset, offset + 2), 16);
    const b = parseInt(upper.color.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * mix).toString(16).padStart(2, '0');
  }).join('');
}
