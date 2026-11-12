import { Color, MathUtils, Mesh, PlaneGeometry, ShadowMaterial, Spherical, Vector3 } from 'three';

const surfaces = {
  walls: '#cbd0ce',
  slabs: '#c3c7c5',
  roofs: '#9da6a7',
  doors: '#9b9184',
  columns: '#adb6b6',
};

export function bimSurface(category, rgba) {
  const window = category === 'windows';
  const transparent = rgba.w < .99;
  const color = new Color(rgba.x, rgba.y, rgba.z).lerp(new Color('#aab5b8'), .72);
  if (window) color.set(transparent ? '#8ea9b4' : '#627783');
  else if (surfaces[category]) color.set(surfaces[category]);
  return {
    color, opacity: transparent ? Math.min(.8, rgba.w) : 1, transparent,
    depthWrite: !transparent, roughness: window ? .42 : .87, metalness: window ? .1 : 0,
  };
}

export function studioGround(scene, bounds) {
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const width = Math.max(size.x, size.z, 1) * 4;
  const ground = new Mesh(new PlaneGeometry(width, width), new ShadowMaterial({ opacity: .2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, bounds.min.y - .035, center.z);
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

export function mountBimCamera({ camera, controls, setHeight, getHeight, heading, span, motion, render }) {
  const yAxis = new Vector3(0, 1, 0);
  let transition, frame;
  const heightFor = (size, direction, margin) => {
    const right = new Vector3().crossVectors(yAxis, direction).normalize();
    const up = new Vector3().crossVectors(direction, right).normalize();
    const project = axis => Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y + Math.abs(axis.z) * size.z;
    return Math.max(project(right) / (innerWidth / innerHeight), project(up), .1) * margin;
  };

  function apply(target, offset, height, zoom) {
    camera.position.copy(offset).add(target);
    controls.target.copy(target);
    camera.zoom = zoom;
    setHeight(height);
  }

  function update(time) {
    if (!transition) return false;
    const { start, from, to } = transition;
    const t = MathUtils.clamp((time - start) / 400, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const offset = new Vector3().setFromSpherical(new Spherical(
      MathUtils.lerp(from.offset.radius, to.offset.radius, eased),
      MathUtils.lerp(from.offset.phi, to.offset.phi, eased),
      MathUtils.lerp(from.offset.theta, to.offset.theta, eased),
    ));
    const apparentHeight = MathUtils.lerp(from.height / from.zoom, to.height, eased);
    const zoom = MathUtils.lerp(from.zoom, 1, eased);
    apply(from.target.clone().lerp(to.target, eased), offset, apparentHeight * zoom, zoom);
    if (t === 1) transition = null;
    return Boolean(transition);
  }

  return {
    update,
    cancel() { transition = null; },
    resize() {
      if (transition) {
        transition.to.height = heightFor(frame.size, frame.direction, frame.margin);
      } else if (frame) setHeight(heightFor(frame.size, frame.direction, frame.margin));
    },
    fit(bounds, { top = false, cut = false, animate = true, align = true } = {}) {
      const direction = (top ? new Vector3(0, 1, .001) : cut ? new Vector3(.32, 1.05, .8) : new Vector3(.58, .68, 1))
        .applyAxisAngle(yAxis, align ? heading : 0).normalize();
      frame = { direction, size: bounds.getSize(new Vector3()), margin: innerWidth < 640 ? 1.18 : 1.27 };
      const target = bounds.getCenter(new Vector3());
      const offset = direction.clone().multiplyScalar(span * 4);
      const height = heightFor(frame.size, direction, frame.margin);
      if (!animate || motion.matches) {
        transition = null;
        apply(target, offset, height, 1);
      } else {
        const current = new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        const next = new Spherical().setFromVector3(offset);
        next.theta = current.theta + MathUtils.euclideanModulo(next.theta - current.theta + Math.PI, 2 * Math.PI) - Math.PI;
        transition = {
          start: performance.now(),
          from: { target: controls.target.clone(), offset: current, height: getHeight(), zoom: camera.zoom },
          to: { target, offset: next, height },
        };
      }
      render();
    },
  };
}
