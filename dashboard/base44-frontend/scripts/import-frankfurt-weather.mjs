import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const SOURCE_URL = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/historical/stundenwerte_TU_01420_19810101_20251231_hist.zip';
const MAX_ZIP = 10 * 1024 * 1024, MAX_PRODUCT = 50 * 1024 * 1024, HOUR = 3600000;
const timestamp = date => Number(date.toISOString().slice(0, 13).replaceAll(/[-T:]/g, ''));

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Read only the one documented product member. Never extract archive paths to disk.
export function readProductZip(archive) {
  if (!Buffer.isBuffer(archive) || archive.length > MAX_ZIP || archive.length < 22) throw Error('Invalid or oversized DWD archive.');
  let end = -1;
  for (let at = archive.length - 22; at >= Math.max(0, archive.length - 65557); at--) {
    if (archive.readUInt32LE(at) === 0x06054b50 && at + 22 + archive.readUInt16LE(at + 20) === archive.length) { end = at; break; }
  }
  if (end < 0 || archive.readUInt16LE(end + 4) || archive.readUInt16LE(end + 6)) throw Error('Unsupported ZIP directory.');
  const count = archive.readUInt16LE(end + 10), directorySize = archive.readUInt32LE(end + 12), directory = archive.readUInt32LE(end + 16);
  if (count > 100 || directory + directorySize > end) throw Error('Invalid ZIP directory bounds.');
  let cursor = directory, result;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) throw Error('Invalid ZIP entry.');
    const flags = archive.readUInt16LE(cursor + 8), method = archive.readUInt16LE(cursor + 10);
    const expectedCRC = archive.readUInt32LE(cursor + 16), packed = archive.readUInt32LE(cursor + 20), unpacked = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28), extraLength = archive.readUInt16LE(cursor + 30), commentLength = archive.readUInt16LE(cursor + 32), local = archive.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > directory + directorySize) throw Error('Invalid ZIP entry bounds.');
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength); cursor = next;
    if (!/^produkt_tu_stunde_\d{8}_\d{8}_01420\.txt$/.test(name)) continue;
    if (result || flags & 1 || ![0, 8].includes(method) || unpacked > MAX_PRODUCT) throw Error('Unsupported DWD product entry.');
    if (local + 30 > directory || archive.readUInt32LE(local) !== 0x04034b50) throw Error('Invalid local ZIP header.');
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    if (start + packed > directory) throw Error('Invalid product bounds.');
    const compressed = archive.subarray(start, start + packed);
    const bytes = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: MAX_PRODUCT });
    if (bytes.length !== unpacked || crc32(bytes) !== expectedCRC) throw Error('DWD ZIP product checksum mismatch.');
    result = { product: name, text: bytes.toString('latin1') };
  }
  if (!result) throw Error('No Frankfurt/Main hourly temperature product found.');
  return result;
}

export function parseDwdProduct(text) {
  const lines = text.trim().split(/\r?\n/), header = lines.shift().split(';').map(value => value.trim());
  const fields = ['STATIONS_ID', 'MESS_DATUM', 'QN_9', 'TT_TU'].map(field => header.indexOf(field));
  if (fields.some(index => index < 0)) throw Error('DWD product fields are missing.');
  const start = Date.UTC(2024, 11, 31, 23), stop = Date.UTC(2025, 11, 31, 23), rows = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split(';').map(value => value.trim()), [station, rawTime, rawQuality, rawTemperature] = fields.map(index => cells[index]);
    if (!/^0*1420$/.test(station || '')) throw Error('Unexpected station in DWD product.');
    if (!/^\d{10}$/.test(rawTime || '')) throw Error('Invalid DWD timestamp.');
    const utc = Date.UTC(Number(rawTime.slice(0, 4)), Number(rawTime.slice(4, 6)) - 1, Number(rawTime.slice(6, 8)), Number(rawTime.slice(8, 10)));
    if (timestamp(new Date(utc)) !== Number(rawTime)) throw Error('Invalid DWD calendar timestamp.');
    if (utc < start || utc >= stop) continue;
    if (rows.has(utc)) throw Error('Duplicate DWD observation.');
    if (!/^-?\d+$/.test(rawQuality || '') || Number(rawQuality) < -999 || Number(rawQuality) > 99) throw Error('Invalid DWD quality level.');
    if (!/^-?\d+(?:\.\d+)?$/.test(rawTemperature || '')) throw Error('Invalid DWD temperature.');
    const value = Number(rawTemperature), temperature = value === -999 ? null : value;
    if (temperature !== null && (temperature < -90 || temperature > 65)) throw Error('DWD temperature outside supported measurement range.');
    rows.set(utc, [temperature, Number(rawQuality)]);
  }
  return Array.from({ length: 8760 }, (_, index) => {
    const utc = start + index * HOUR;
    return [timestamp(new Date(utc)), ...(rows.get(utc) || [null, null])];
  });
}

async function download() {
  const response = await fetch(SOURCE_URL, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`DWD download failed (${response.status}).`);
  if (Number(response.headers.get('content-length')) > MAX_ZIP) throw Error('DWD archive too large.');
  const parts = []; let length = 0;
  for await (const part of response.body) { length += part.length; if (length > MAX_ZIP) throw Error('DWD archive too large.'); parts.push(Buffer.from(part)); }
  return Buffer.concat(parts);
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--archive', '--output', '--retrieved-at'].includes(args[index]) || !args[index + 1]) throw Error('Usage: node scripts/import-frankfurt-weather.mjs [--archive FILE] [--output FILE] [--retrieved-at ISO_DATE]');
    options[args[index].slice(2)] = args[index + 1];
  }
  const archive = options.archive ? await readFile(resolve(options.archive)) : await download();
  const { product, text } = readProductZip(archive), hours = parseDwdProduct(text);
  const data = {
    schema: 1, station: { id: '01420', name: 'Frankfurt/Main', latitude: 50.0259, longitude: 8.5213 },
    year: 2025, timezone: 'UTC',
    source: {
      url: SOURCE_URL, product, sha256: createHash('sha256').update(archive).digest('hex'),
      retrieved_at: options['retrieved-at'] || new Date().toISOString(),
      attribution: 'Deutscher Wetterdienst (DWD), Climate Data Center (CDC), stündliche Stationsmessungen der Lufttemperatur und Luftfeuchte für Deutschland, Version v24.03; Ausschnitt Frankfurt/Main 2025, in JSON umgewandelt.',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
    }, hours,
  };
  if (!Number.isFinite(Date.parse(data.source.retrieved_at))) throw Error('Invalid retrieval timestamp.');
  data.source.retrieved_at = new Date(data.source.retrieved_at).toISOString();
  const output = options.output ? resolve(options.output) : fileURLToPath(new URL('../public/weather/frankfurt-2025.json', import.meta.url));
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(data) + '\n');
  console.log(JSON.stringify({ output, hours: hours.length, missing: hours.filter(row => row[1] === null).length, sha256: data.source.sha256 }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
