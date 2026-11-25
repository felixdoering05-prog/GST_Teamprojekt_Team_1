const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseVitals, Aggregator } = require('./ruview-bridge');

function vitals({ node = 1, presence = true, breathing = 14.5, rssi = -63, persons = 1, motion = 0.8, magic = 0xC5110002, size = 32 } = {}) {
  const buf = Buffer.alloc(size);
  buf.writeUInt32LE(magic, 0);
  buf.writeUInt8(node, 4);
  buf.writeUInt8((presence ? 1 : 0) | (motion > 0.01 ? 4 : 0), 5);
  buf.writeUInt16LE(Math.round(breathing * 100), 6);
  buf.writeInt8(rssi, 12);
  buf.writeUInt8(persons, 13);
  buf.writeFloatLE(motion, 16);
  buf.writeFloatLE(3.2, 20);
  return buf;
}
function csiFrame(node = 1) {
  const buf = Buffer.alloc(148);
  buf.writeUInt32LE(0xC5110001, 0);
  buf.writeUInt8(node, 4);
  return buf;
}

test('parses vitals and fused packets, ignores others', () => {
  const v = parseVitals(vitals());
  assert.equal(v.node_id, 1);
  assert.equal(v.presence, true);
  assert.equal(v.breathing_bpm, 14.5);
  assert.equal(v.rssi, -63);
  assert.equal(parseVitals(vitals({ magic: 0xC5110004, size: 48, node: 3 })).node_id, 3);
  assert.equal(parseVitals(csiFrame()), null);
  assert.equal(parseVitals(Buffer.alloc(10)), null);
});

test('aggregates per node: majority presence, median breathing, packet rate', () => {
  const agg = new Aggregator();
  for (let i = 0; i < 10; i++) agg.add(csiFrame(1));
  agg.add(vitals({ breathing: 12 }));
  agg.add(vitals({ breathing: 14 }));
  agg.add(vitals({ breathing: 30, presence: false }));
  agg.add(vitals({ node: 2, presence: false, breathing: 0, persons: 0, motion: 0 }));
  assert.equal(agg.add(Buffer.from('hallo')), false);
  const [one, two] = agg.flush(10);
  assert.deepEqual(one, { node_id: 1, presence: true, motion: 0.8, persons: 1, breathing_bpm: 14, rssi: -63, pps: 1 });
  assert.equal(two.presence, false);
  assert.equal(two.persons, 0);
  assert.equal(two.breathing_bpm, null);
  assert.deepEqual(agg.flush(10), []);
});
