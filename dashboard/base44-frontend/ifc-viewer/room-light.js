// Shared by the web viewer and the bundled iPhone viewer.
export function applyDeviceLights(lights, rooms) {
  for (const item of Array.isArray(lights) ? lights : []) {
    if (!Number.isInteger(item?.space_id) || item.space_id <= 0) continue;
    const rgb = Array.isArray(item.rgb) && item.rgb.length === 3 && item.rgb.every(Number.isFinite) ? item.rgb : [255, 231, 211];
    const color = '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    rooms.get(item.space_id)?.(item.on === true, color, true, item.available === true, item.brightness ?? 255);
  }
}

export function roomLightSetter(toggle, meshes) {
  return (on, color = '#ffd35c', linked = false, available = true, brightness = 255) => {
    const level = Number.isFinite(brightness) ? Math.max(0, Math.min(255, brightness)) / 255 : 1;
    toggle.setAttribute('aria-checked', String(on === true));
    toggle.textContent = !meshes.length ? 'Ohne Raumgeometrie' : linked
      ? (!available ? (on ? 'Licht an · teilweise erreichbar' : 'Lichtstatus nicht verfügbar') : on ? 'Licht an · Geräte' : 'Licht aus · Geräte')
      : on ? 'Licht an · Simulation' : 'Licht aus · Simulation';
    toggle.dataset.linked = String(linked);
    toggle.disabled = linked || !meshes.length;
    for (const mesh of meshes) {
      mesh.visible = on === true && level > 0;
      mesh.material.color.set(color);
      mesh.material.opacity = level > 0 ? .06 + .28 * Math.sqrt(level) : 0;
    }
  };
}
