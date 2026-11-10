// Surface gains remain illustrative. DWD mode replaces only the ambient air temperature.
export const HEAT_STOPS = [
  { value: -10, color: '#2450d8' }, { value: 0, color: '#168de2' },
  { value: 10, color: '#15c7c9' }, { value: 20, color: '#68cc68' },
  { value: 30, color: '#f4d34d' }, { value: 40, color: '#f58a36' },
  { value: 50, color: '#dc3549' },
];
export const HEAT_GRADIENT = `linear-gradient(90deg, ${HEAT_STOPS.map(stop => stop.color).join(', ')})`;

// Room temperatures here are presentation-only scenario values. They are never sensor readings.
export const ROOM_TEMPERATURE_SCENARIOS = [
  { id: 'winter', label: 'Wintermorgen', baseTemperature: 19.5, outsideTemperature: 2, solarGain: .7, description: 'Kühler Außenbereich, geringe solare Gewinne' },
  { id: 'comfort', label: 'Behaglicher Tag', baseTemperature: 21.5, outsideTemperature: 13, solarGain: 1.5, description: 'Milde Außenbedingungen, moderate solare Gewinne' },
  { id: 'summer', label: 'Sommertag', baseTemperature: 24, outsideTemperature: 31, solarGain: 2.5, description: 'Warmer Außenbereich, stärkere solare Gewinne' },
];
export const SEASONS = [
  { id: 'spring', label: 'Frühling', day: 105, symbol: '01', description: 'Milde Übergänge' },
  { id: 'summer', label: 'Sommer', day: 196, symbol: '02', description: 'Warme Oberflächen' },
  { id: 'autumn', label: 'Herbst', day: 288, symbol: '03', description: 'Abkühlende Flächen' },
  { id: 'winter', label: 'Winter', day: 14, symbol: '04', description: 'Kühle Umgebung' },
];
export function normalizeScenario(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const finite = (number, fallback, min, max) => typeof number === 'number' && Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  const scenario = { mode: value.mode === 'measured' || value.mode === 'simulated-rooms' ? value.mode : 'simulation', day: Math.round(finite(value.day, 196, 0, 364)), hour: finite(value.hour, 14, 0, 23), campus: value.campus !== false };
  if (value.source === 'dwd') {
    scenario.source = 'dwd';
    scenario.airTemperature = typeof value.airTemperature === 'number' && Number.isFinite(value.airTemperature) && value.airTemperature >= -90 && value.airTemperature <= 65 ? value.airTemperature : null;
  }
  return scenario;
}
function stableRoomFactor(globalId, salt) {
  let hash = 2166136261;
  for (const character of `${globalId}:${salt}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function simulatedRoomTemperature(globalId, floorIndex = 0, floorCount = 1, presetId = 'comfort') {
  if (typeof globalId !== 'string' || !globalId.trim()) return null;
  const preset = ROOM_TEMPERATURE_SCENARIOS.find(item => item.id === presetId) || ROOM_TEMPERATURE_SCENARIOS[1];
  const count = Number.isFinite(floorCount) && floorCount > 0 ? floorCount : 1;
  const index = Number.isFinite(floorIndex) && floorIndex >= 0 ? floorIndex : 0;
  const floorEffect = count > 1 ? (index / (count - 1) - .5) * .9 : 0;
  const roomOffset = (stableRoomFactor(globalId, 'offset') - .5) * 4.4;
  const solarEffect = stableRoomFactor(globalId, 'solar') * preset.solarGain;
  const outdoorEffect = Math.min(.75, Math.max(-.65, (preset.outsideTemperature - 12) * .035));
  return Math.round((preset.baseTemperature + floorEffect + roomOffset + solarEffect + outdoorEffect) * 10) / 10;
}

export function seasonForDay(day) {
  if (day >= 79 && day < 171) return SEASONS[0];
  if (day >= 171 && day < 265) return SEASONS[1];
  if (day >= 265 && day < 355) return SEASONS[2];
  return SEASONS[3];
}
export function scenarioConditions(value) {
  const { day, hour, source, airTemperature } = normalizeScenario(value);
  const warmth = (1 + Math.cos(2 * Math.PI * (day - 205) / 365)) / 2;
  const air = source === 'dwd' ? airTemperature : 11 + 13 * (2 * warmth - 1) + 4 * Math.cos(2 * Math.PI * (hour - 15) / 24);
  const daylight = 8 + 8 * warmth;
  const sun = Math.max(0, Math.sin(Math.PI * (hour - (12 - daylight / 2)) / daylight));
  const azimuth = (hour - 12) * Math.PI / 12;
  // Stylised sun direction, not an astronomical position for the campus.
  const direction = [Math.sin(azimuth), .35 + .6 * warmth, Math.cos(azimuth)];
  const length = Math.hypot(...direction);
  return { air, available: air !== null, sun, direction: direction.map(component => component / length), gain: sun * (8 + 9 * warmth) };
}
export function surfaceTemperature(value, position = [0, 0, 0], normal = [0, 1, 0], ground = false) {
  const { air, gain, direction, available } = scenarioConditions(value);
  if (!available) return null;
  const length = Math.hypot(...normal) || 1;
  const exposure = Math.max(0, normal.reduce((sum, component, index) => sum + component / length * direction[index], 0));
  const pattern = .5 + .5 * Math.sin(position[0] * .055) * Math.cos(position[2] * .045);
  const surface = ground ? .28 + .55 * pattern : .35 + .65 * exposure;
  return air + gain * surface - (ground ? 2.5 * (1 - pattern) : 1.2 * (1 - exposure));
}
export function heatColor(temperature) {
  if (!Number.isFinite(temperature)) return '#94a3b8';
  const value = Math.min(50, Math.max(-10, temperature));
  const index = Math.min(HEAT_STOPS.length - 2, Math.floor((value + 10) / 10));
  const a = HEAT_STOPS[index], b = HEAT_STOPS[index + 1], mix = (value - a.value) / (b.value - a.value);
  const rgb = color => color.match(/[a-f0-9]{2}/gi).map(channel => parseInt(channel, 16));
  return '#' + rgb(a.color).map((channel, axis) => Math.round(channel + (rgb(b.color)[axis] - channel) * mix).toString(16).padStart(2, '0')).join('');
}
export function scenarioDate(day) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2025, 0, normalizeScenario({ day }).day + 1)));
}
