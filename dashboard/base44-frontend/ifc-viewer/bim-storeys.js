import { Box3, Plane, Vector3 } from 'three';

export function bimStoreys(storeys, roomBases, campus) {
  const occupied = storeys.filter(floor => roomBases.has(floor.id));
  const levels = campus && occupied.length ? occupied : storeys;
  return levels.map(floor => {
    const bases = roomBases.get(floor.id)?.slice().sort((a, b) => a - b);
    return { ...floor, base: bases?.[Math.floor(bases.length / 2)] ?? floor.base };
  }).sort((a, b) => a.base - b.base || a.id - b.id);
}

export function storeySlice(floors, floor) {
  const next = floors.find(other => other.base > floor.base + .35);
  const available = Math.min(floor.top, next ? next.base - .05 : Infinity) - floor.base;
  const height = available < .55 ? available + .01 : available * .64;
  return { bottom: floor.base - .36, top: floor.base + Math.max(.12, Math.min(1.55, height)) };
}

const crosses = (bounds, slice) => bounds.max.y > slice.bottom && bounds.min.y < slice.top;

export function mountBimStoreys({ root, roomEffects, floors, renderer, fullBounds, boundsByMesh, render, motion }) {
  const floorByID = new Map(floors.map(floor => [floor.id, floor]));
  const upperPlane = new Plane(new Vector3(0, -1, 0));
  const lowerPlane = new Plane(new Vector3(0, 1, 0));
  const offsets = new Map(floors.map((floor, index) => [floor.id, index * Math.min(6, Math.max(2.8, fullBounds.getSize(new Vector3()).y * .27))]));
  const center = new Vector3();
  function floorFor(mesh, bounds) {
    if (floorByID.has(mesh.userData.storey)) return floorByID.get(mesh.userData.storey);
    const y = bounds.getCenter(center).y;
    return floors.findLast(floor => floor.base <= y + .36) || floors[0];
  }
  const entries = [...root.children, ...roomEffects.children].map(mesh => {
    const bounds = boundsByMesh.get(mesh) ?? new Box3().setFromObject(mesh);
    return { mesh, bounds, floor: floorFor(mesh, bounds) };
  });
  let selected = null, exploded = false, rendered = new Map(), target = rendered, transition;

  function setOffsets(values) {
    rendered = values;
    for (const { mesh, floor } of entries) {
      mesh.position.y = mesh.userData.basePosition.y + (rendered.get(floor?.id) || 0);
    }
  }

  function visible(mesh, on) {
    mesh.layers.set(on ? 0 : 1);
    for (const edge of mesh.children) edge.layers.mask = mesh.layers.mask;
  }

  function setView(floor, separate) {
    selected = floor;
    exploded = separate;
    target = !separate ? new Map() : floor
      ? new Map([[floor.id, Math.max(3, fullBounds.max.y - floor.base + 2)]])
      : offsets;
    if ((floor && !separate) || motion.matches) {
      transition = null;
      setOffsets(target);
    } else if (floors.some(item => (rendered.get(item.id) || 0) !== (target.get(item.id) || 0))) {
      transition = { from: rendered, start: performance.now() };
    } else transition = null;
    if (floor && !separate) {
      const slice = storeySlice(floors, floor);
      lowerPlane.constant = -slice.bottom;
      upperPlane.constant = slice.top;
      renderer.clippingPlanes = [lowerPlane, upperPlane];
      for (const { mesh, bounds } of entries) {
        const otherFloor = floorByID.get(mesh.userData.storey);
        const belongsElsewhere = otherFloor && otherFloor !== floor &&
          (otherFloor.base >= floor.base - .12 || bounds.max.y < floor.base + .12);
        visible(mesh, !belongsElsewhere && crosses(bounds, slice));
      }
    } else {
      renderer.clippingPlanes = [];
      for (const { mesh } of entries) visible(mesh, true);
    }
    render();
  }

  return {
    setView,
    update(time) {
      if (!transition) return false;
      const fraction = Math.min(1, Math.max(0, (time - transition.start) / 420));
      const eased = fraction * fraction * (3 - 2 * fraction);
      setOffsets(new Map(floors.map(floor => {
        const from = transition.from.get(floor.id) || 0;
        return [floor.id, from + ((target.get(floor.id) || 0) - from) * eased];
      })));
      if (fraction === 1) {
        transition = null;
        renderer.shadowMap.needsUpdate = true;
      }
      return Boolean(transition);
    },
    bounds() {
      if (!selected && !exploded) return fullBounds;
      const result = new Box3();
      const slice = selected && !exploded && storeySlice(floors, selected);
      for (const { mesh, bounds, floor } of entries) {
        if (mesh.parent !== root || !mesh.layers.isEnabled(0)) continue;
        const box = bounds.clone();
        if (slice) {
          box.min.y = Math.max(box.min.y, slice.bottom);
          box.max.y = Math.min(box.max.y, slice.top);
        } else box.translate(new Vector3(0, target.get(floor?.id) || 0, 0));
        result.union(box);
      }
      return result.isEmpty() ? fullBounds : result;
    },
    canPick(hit) {
      return hit.object.layers.isEnabled(0) && renderer.clippingPlanes.every(plane => plane.distanceToPoint(hit.point) >= 0);
    },
    elevationOffset(id) { return rendered.get(id) || 0; },
  };
}
