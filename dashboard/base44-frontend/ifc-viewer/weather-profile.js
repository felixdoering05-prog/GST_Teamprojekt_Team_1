// DWD observations stay in UTC; the controls address the calendar in Germany.
const HOUR = 3600000;
const empty = Object.freeze({ temperature: null, timestamp: null, quality: null, ambiguous: false });
const localTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});
export function createWeatherProfile(data) {
  const fail = () => { throw new Error('Die Wetterdaten für Frankfurt/Main sind unvollständig oder ungültig.'); };
  if (data?.schema !== 1 || data.year !== 2025 || data.timezone !== 'UTC' || data.station?.id !== '01420' || !Array.isArray(data.hours) || data.hours.length !== 8760) fail();
  let source;
  try { source = new URL(data.source.url); } catch { fail(); }
  if (source.protocol !== 'https:' || source.hostname !== 'opendata.dwd.de' || !source.pathname.includes('/hourly/air_temperature/historical/') || !/^[a-f0-9]{64}$/i.test(data.source.sha256 || '') || !data.source.attribution) fail();
  const start = Date.UTC(2024, 11, 31, 23), index = new Map();
  data.hours.forEach((row, position) => {
    if (!Array.isArray(row) || row.length !== 3) fail();
    const date = new Date(start + position * HOUR);
    const expected = Number(date.toISOString().slice(0, 13).replaceAll(/[-T:]/g, ''));
    const [utc, temperature, quality] = row;
    if (utc !== expected || (temperature !== null && (!Number.isFinite(temperature) || temperature < -90 || temperature > 65)) || (quality !== null && (!Number.isInteger(quality) || quality < -999 || quality > 99))) fail();
    const parts = Object.fromEntries(localTime.formatToParts(date).map(part => [part.type, part.value]));
    const day = (Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - Date.UTC(data.year, 0, 1)) / 86400000;
    const key = day * 24 + Number(parts.hour);
    const record = { temperature, timestamp: date.toISOString(), quality, ambiguous: false };
    // Autumn's repeated local hour uses the earlier observation, never an average.
    if (index.has(key)) index.get(key).ambiguous = true;
    else index.set(key, record);
  });
  return {
    station: data.station, year: data.year, source: data.source,
    lookup(day, hour) {
      if (!Number.isInteger(day) || day < 0 || day > 364 || !Number.isInteger(hour) || hour < 0 || hour > 23) return empty;
      // The nonexistent spring hour and missing observations are never interpolated.
      return index.get(day * 24 + hour) || empty;
    },
  };
}
