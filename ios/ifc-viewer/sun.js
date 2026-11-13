// Approximate solar position (NOAA simplified), accurate to about a degree – enough for realistic shadows.
export function sunPosition(date, latitude, longitude) {
  const rad = Math.PI / 180, day = date.getTime() / 86400000 + 2440587.5 - 2451545;
  const meanLongitude = (280.46 + 0.9856474 * day) % 360, meanAnomaly = ((357.528 + 0.9856003 * day) % 360) * rad;
  const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * rad;
  const obliquity = (23.439 - 0.0000004 * day) * rad;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
  const siderealTime = ((280.16 + 360.9856235 * day) % 360) * rad + longitude * rad;
  const hourAngle = siderealTime - rightAscension, lat = latitude * rad;
  const altitude = Math.asin(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle));
  // Azimuth measured clockwise from north.
  const azimuth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) + Math.PI;
  return { azimuth, altitude };
}
/// Uses the current sun if it is reasonably high, otherwise today 13:00 (pleasant daylight shadows).
export function displaySun(latitude, longitude, now = new Date()) {
  const current = sunPosition(now, latitude, longitude);
  if (current.altitude > 0.17) return { ...current, live: true };
  const noon = new Date(now); noon.setHours(13, 0, 0, 0);
  return { ...sunPosition(noon, latitude, longitude), live: false };
}
