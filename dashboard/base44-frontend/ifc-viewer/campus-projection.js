// Local coordinates are physical metres: x east, y up, z south.
export const D21_LOCATION = [8.63648, 49.8640005];
const RADIUS = 6378137;
const radians = degrees => degrees * Math.PI / 180;
const mercator = ([longitude, latitude]) => [RADIUS * radians(longitude), RADIUS * Math.log(Math.tan(Math.PI / 4 + radians(latitude) / 2))];
export function campusPoint(coordinates, origin = D21_LOCATION) {
  const point = mercator(coordinates), anchor = mercator(origin), scale = Math.cos(radians(origin[1]));
  return [(point[0] - anchor[0]) * scale, -(point[1] - anchor[1]) * scale];
}
export function tilePosition(x, y, zoom, origin = D21_LOCATION) {
  const count = 2 ** zoom, earth = 2 * Math.PI * RADIUS, scale = Math.cos(radians(origin[1]));
  const anchor = mercator(origin);
  const size = earth / count * scale;
  return { x: ((x + .5) / count * earth - earth / 2 - anchor[0]) * scale,
    z: (earth / 2 - (y + .5) / count * earth - anchor[1]) * -scale, size };
}
export function coordinateTile([longitude, latitude], zoom) {
  const count = 2 ** zoom;
  return [Math.floor((longitude + 180) / 360 * count), Math.floor((1 - Math.log(Math.tan(radians(latitude)) + 1 / Math.cos(radians(latitude))) / Math.PI) / 2 * count)];
}
export function footprintHeading(coordinates) {
  let longest = 0, heading = 0;
  for (let index = 1; index < coordinates.length; index++) {
    const a = campusPoint(coordinates[index - 1]), b = campusPoint(coordinates[index]);
    const dx = b[0] - a[0], dz = b[1] - a[1], length = dx * dx + dz * dz;
    if (length > longest) { longest = length; heading = Math.atan2(-dz, dx); }
  }
  while (heading > Math.PI / 2) heading -= Math.PI;
  while (heading < -Math.PI / 2) heading += Math.PI;
  return heading;
}
