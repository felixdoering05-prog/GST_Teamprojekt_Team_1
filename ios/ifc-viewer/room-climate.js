import * as THREE from 'three';
import { roomHeatColor } from '../../dashboard/base44-frontend/ifc-viewer/room-heat-colors.js';
import { sanitizeRoomSensors, formatValue, roomTitle } from './sensor-labels.js';

// Raumklima im 3D-Modell: Räume mit Messwert werden halbtransparent nach Temperatur, Luftfeuchte oder CO₂ eingefärbt.
const ramp = stops => value => {
  if (!Number.isFinite(value)) return null;
  if (value <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (value <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (value - a) / (b - a);
    return '#' + [1, 3, 5].map(o => Math.round(parseInt(ca.slice(o, o + 2), 16) * (1 - t) + parseInt(cb.slice(o, o + 2), 16) * t).toString(16).padStart(2, '0')).join('');
  }
  return stops.at(-1)[1];
};
export const CLIMATE = {
  temperature: { label: 'Temperatur', color: v => Number.isFinite(v) ? roomHeatColor(v) : null, legend: ['16 °C', '23 °C', '30 °C'], gradient: ['#477ac5', '#e9d77e', '#cc514e'] },
  humidity: { label: 'Luftfeuchte', color: ramp([[25, '#d9822b'], [40, '#4caf7a'], [60, '#4caf7a'], [75, '#3f7fd1']]), legend: ['trocken', '40–60 %', 'feucht'], gradient: ['#d9822b', '#4caf7a', '#3f7fd1'] },
  co2: { label: 'CO₂', color: ramp([[600, '#4caf7a'], [1000, '#e9c46a'], [1400, '#d1495b']]), legend: ['frisch', '1000 ppm', 'lüften'], gradient: ['#4caf7a', '#e9c46a', '#d1495b'] },
};
/** Colour per room for one metric; rooms without that metric are left out. */
export function climateColors(list, metric) {
  const scale = CLIMATE[metric]; if (!scale) return [];
  const out = [];
  for (const entry of sanitizeRoomSensors(list)) {
    const v = entry.values.find(x => x.metric === metric); if (!v) continue;
    const color = scale.color(v.value); if (color) out.push({ space_id: entry.space_id, color, text: roomTitle(entry.room) + ': ' + formatValue(v), stale: entry.stale });
  }
  return out;
}

/** geometries: Map<space_id, THREE.Mesh[]> (the room volumes used for the light effect). */
export function createRoomClimate(scene, geometries, legend) {
  const group = new THREE.Group(); group.name = 'room-climate'; scene.add(group);
  let metric = null, latest = [];
  const clear = () => { for (const m of [...group.children]) { m.material.dispose(); group.remove(m); } };
  const draw = () => {
    clear();
    const rows = metric ? climateColors(latest, metric) : [];
    for (const row of rows) for (const source of geometries.get(row.space_id) || []) {
      const mesh = new THREE.Mesh(source.geometry, new THREE.MeshBasicMaterial({ color: row.color, transparent: true, opacity: row.stale ? .22 : .42, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      source.updateMatrix(); mesh.matrixAutoUpdate = false; mesh.matrix.copy(source.matrix); mesh.renderOrder = 4; group.add(mesh);
    }
    if (legend) {
      const scale = CLIMATE[metric];
      legend.hidden = !scale;
      if (scale) {
        legend.replaceChildren();
        const title = document.createElement('strong'); title.textContent = scale.label + (rows.length ? '' : ' · keine Messwerte');
        const bar = document.createElement('div'); bar.className = 'bar'; bar.style.background = `linear-gradient(90deg,${scale.gradient.join(',')})`;
        const ticks = document.createElement('div'); ticks.className = 'ticks'; for (const t of scale.legend) { const s = document.createElement('span'); s.textContent = t; ticks.append(s); }
        legend.append(title, bar, ticks);
      }
    }
    return rows.length;
  };
  return {
    group,
    setSensors(list) { latest = Array.isArray(list) ? list : []; return draw(); },
    setMetric(value) { metric = Object.hasOwn(CLIMATE, value) ? value : null; return draw(); },
    dispose() { clear(); scene.remove(group); },
  };
}
