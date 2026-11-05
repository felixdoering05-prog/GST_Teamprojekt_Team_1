import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseDwdProduct, readProductZip, crc32 } from './import-frankfurt-weather.mjs';

const header = 'STATIONS_ID;MESS_DATUM;QN_9;TT_TU;RF_TU;eor\n';
test('DWD importer preserves UTC observations and quality levels; absent and -999 remain null', () => {
  const rows = parseDwdProduct(header + '1420;2024123123;10;-2.3;90;eor\n01420;2025010100;3;-999;80;eor\n1420;2025123122;10;4.5;60;eor');
  assert.equal(rows.length, 8760); assert.deepEqual(rows[0], [2024123123, -2.3, 10]);
  assert.deepEqual(rows[1], [2025010100, null, 3]); assert.deepEqual(rows[2], [2025010101, null, null]);
  assert.deepEqual(rows.at(-1), [2025123122, 4.5, 10]);
});
test('DWD importer rejects foreign stations, duplicate observations, invalid dates and values', () => {
  for (const line of ['9999;2025010100;10;1;80;eor', '1420;2025023000;10;1;80;eor', '1420;2025010124;10;1;80;eor', '1420;2025010100;x;1;80;eor', '1420;2025010100;10;NaN;80;eor']) assert.throws(() => parseDwdProduct(header + line));
  const row = '1420;2025010100;10;1;80;eor\n'; assert.throws(() => parseDwdProduct(header + row + row), /Duplicate/);
  assert.throws(() => parseDwdProduct('STATIONS_ID;MESS_DATUM;TT_TU\n'), /fields/);
});
test('DWD archive reader rejects invalid or oversized ZIP data without extracting paths', () => {
  assert.throws(() => readProductZip(Buffer.alloc(0)));
  assert.throws(() => readProductZip(Buffer.alloc(10 * 1024 * 1024 + 1)));
  assert.throws(() => readProductZip(Buffer.alloc(40)), /directory/);
});
test('DWD archive reader reads deflated product bytes and rejects a changed CRC32', () => {
  const name = Buffer.from('produkt_tu_stunde_20250101_20251231_01420.txt'), content = Buffer.from(header + '1420;2025010100;3;-999;80;eor\n');
  const packed = deflateRawSync(content), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc32(content), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc32(content), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28);
  const directory = local.length + name.length + packed.length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(directory, 16);
  const zip = Buffer.concat([local, name, packed, central, name, end]);
  assert.equal(readProductZip(zip).text, content.toString());
  zip.writeUInt32LE(0, directory + 16); assert.throws(() => readProductZip(zip), /checksum/);
});
