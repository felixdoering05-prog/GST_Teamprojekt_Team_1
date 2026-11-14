import * as THREE from 'three';

// Defect markers ("Mängel") in model coordinates. They live inside the model root, so they follow any
// centring or map placement of the model. Rendered on top of the geometry so defects inside rooms
// stay findable from outside.
export const STATUS_COLORS = { open: '#e5484d', in_progress: '#f59e0b', done: '#30a46c' };

/** Accepts only well-formed markers from the native side (ids, finite coordinates, known status). */
export function sanitizeIssues(list) {
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const item of list.slice(0, 300)) {
    const p = item?.point;
    if (!Number.isInteger(item?.id) || item.id <= 0 || !p || ![p.x, p.y, p.z].every(Number.isFinite)) continue;
    result.push({ id: item.id, status: STATUS_COLORS[item.status] ? item.status : 'open', point: { x: p.x, y: p.y, z: p.z } });
  }
  return result;
}

function texture(color) {
  const size = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.beginPath(); g.arc(size / 2, size / 2, size * .42, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  g.lineWidth = size * .07; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.font = `bold ${size * .52}px -apple-system, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', size / 2, size / 2 + size * .03);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createIssueMarkers(root) {
  const group = new THREE.Group(); group.name = 'issues'; root.add(group);
  const materials = {};
  const material = status => materials[status] ??= new THREE.SpriteMaterial({ map: texture(STATUS_COLORS[status]), depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true });
  return {
    group,
    set(list) {
      for (const child of [...group.children]) group.remove(child);
      for (const issue of sanitizeIssues(list)) {
        const sprite = new THREE.Sprite(material(issue.status));
        sprite.position.set(issue.point.x, issue.point.y, issue.point.z);
        sprite.scale.set(.055, .055, 1); sprite.renderOrder = 10; sprite.userData.issueID = issue.id;
        group.add(sprite);
      }
      return group.children.length;
    },
    /** Issue id under the ray, if any. */
    hit(ray) { return ray.intersectObjects(group.children, false)[0]?.object.userData.issueID; },
    position(id) { const s = group.children.find(x => x.userData.issueID === id); return s ? s.getWorldPosition(new THREE.Vector3()) : undefined; },
  };
}
