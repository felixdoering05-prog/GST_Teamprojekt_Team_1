#!/usr/bin/env node
// RuView-Brücke: ESP32-CSI-Knoten im Heimnetz -> Nala (WLAN-Präsenz, experimentell).
//
// Empfängt die UDP-Pakete der RuView-Firmware (Standard: Port 5005), fasst sie je
// Knoten zusammen und meldet alle 10 Sekunden nur die Ergebnisse an Nala:
// anwesend ja/nein, Bewegung, Personenzahl, Atemfrequenz, Signalstärke, Paketrate.
// CSI-Rohdaten verlassen das Heimnetz nicht. Keine Zusatzpakete nötig (Node >= 18).
'use strict';
const dgram = require('node:dgram');
const fs = require('node:fs');
const { parseArgs } = require('node:util');

const CSI_MAGIC = 0xC5110001;
const VITALS_MAGIC = 0xC5110002;
const FUSED_MAGIC = 0xC5110004;

// Ein Vitalpaket (32 Byte) bzw. Fusionspaket (48 Byte, gleiche ersten 32 Byte) lesen.
function parseVitals(buf) {
  if (buf.length < 32) return null;
  const magic = buf.readUInt32LE(0);
  if (magic !== VITALS_MAGIC && magic !== FUSED_MAGIC) return null;
  const flags = buf.readUInt8(5);
  return {
    node_id: buf.readUInt8(4),
    presence: (flags & 0x01) !== 0,
    fall: (flags & 0x02) !== 0,
    breathing_bpm: buf.readUInt16LE(6) / 100,
    rssi: buf.readInt8(12),
    persons: buf.readUInt8(13),
    motion: buf.readFloatLE(16),
    presence_score: buf.readFloatLE(20),
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

// Sammelt Pakete eines Meldeintervalls und erzeugt daraus die Zusammenfassung je Knoten.
class Aggregator {
  constructor() { this.nodes = new Map(); }
  node(id) {
    if (!this.nodes.has(id)) this.nodes.set(id, { vitals: [], csi: 0 });
    return this.nodes.get(id);
  }
  add(buf) {
    if (buf.length < 5) return false;
    const magic = buf.readUInt32LE(0);
    if (magic === CSI_MAGIC) { this.node(buf.readUInt8(4)).csi += 1; return true; }
    const vitals = parseVitals(buf);
    if (!vitals) return false;
    this.node(vitals.node_id).vitals.push(vitals);
    return true;
  }
  // Ergebnis für den Server; setzt den Puffer zurück.
  flush(seconds) {
    const out = [];
    for (const [id, state] of this.nodes) {
      const v = state.vitals;
      if (!v.length) continue; // Ohne Vitalpaket keine belastbare Aussage.
      const presentShare = v.filter(item => item.presence).length / v.length;
      const breathing = median(v.map(item => item.breathing_bpm).filter(bpm => bpm >= 4 && bpm <= 60));
      const motion = v.reduce((sum, item) => sum + Math.max(0, Number.isFinite(item.motion) ? item.motion : 0), 0) / v.length;
      const presence = presentShare >= 0.5;
      out.push({
        node_id: id,
        presence,
        motion: round(Math.min(motion, 1e6), 3),
        persons: presence ? Math.min(16, Math.max(...v.map(item => item.persons))) : 0,
        breathing_bpm: presence && breathing !== null ? round(breathing, 1) : null,
        rssi: Math.max(-127, Math.min(0, v[v.length - 1].rssi)),
        pps: round(Math.min(1000, state.csi / seconds), 1),
      });
    }
    this.nodes.clear();
    return out.sort((a, b) => a.node_id - b.node_id).slice(0, 8);
  }
}

function readToken(path) {
  const stat = fs.statSync(path);
  if (process.platform !== 'win32' && (stat.mode & 0o077)) {
    throw new Error(`Schlüsseldatei ${path} ist für andere lesbar. Bitte: chmod 600 ${path}`);
  }
  const token = fs.readFileSync(path, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Schlüsseldatei enthält keinen gültigen Brückenschlüssel.');
  return token;
}

async function send(server, token, nodes) {
  const response = await fetch(server.replace(/\/$/, '') + '/ruview-input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ruview-Bridge': token },
    body: JSON.stringify({ nodes }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Server ${response.status}: ${text.slice(0, 200)}`);
}

function main() {
  const { values } = parseArgs({
    options: {
      server: { type: 'string', default: 'https://nala-solutions.de/app-api/v1' },
      'token-file': { type: 'string' },
      port: { type: 'string', default: '5005' },
      bind: { type: 'string', default: '0.0.0.0' },
      interval: { type: 'string', default: '10' },
      forward: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(`RuView-Brücke für Nala

  node ruview-bridge.js --token-file ~/.nala-ruview-bridge [--server URL] [--port 5005]
  node ruview-bridge.js --dry-run            nur anzeigen, nichts senden

Optionen:
  --server URL      Nala-API (Standard https://nala-solutions.de/app-api/v1)
  --token-file PFAD Datei mit dem Brückenschlüssel (chmod 600)
  --port N          UDP-Port der ESP32-Knoten (Standard 5005)
  --interval S      Meldeintervall in Sekunden (Standard 10, mindestens 5)
  --forward PORT    Pakete zusätzlich an 127.0.0.1:PORT weiterreichen (z. B. für npx ruview)
  --dry-run         nichts senden, Zusammenfassung nur ausgeben`);
    return;
  }
  const interval = Math.max(5, Number(values.interval) || 10);
  const port = Number(values.port);
  const forward = values.forward ? Number(values.forward) : null;
  const dryRun = values['dry-run'];
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ungültiger Port.');
  if (forward !== null && (!Number.isInteger(forward) || forward < 1 || forward > 65535 || forward === port)) throw new Error('Ungültiger Weiterleitungsport.');
  if (!dryRun && !values['token-file']) throw new Error('--token-file fehlt (oder --dry-run verwenden).');
  if (!dryRun && !/^https:\/\//.test(values.server) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(values.server)) {
    throw new Error('Server muss per HTTPS erreichbar sein (HTTP nur für localhost).');
  }
  const token = dryRun ? null : readToken(values['token-file']);

  const aggregator = new Aggregator();
  const socket = dgram.createSocket('udp4');
  const relay = forward ? dgram.createSocket('udp4') : null;
  const sources = new Set();
  socket.on('message', (msg, info) => {
    if (aggregator.add(msg)) sources.add(info.address);
    if (relay) relay.send(msg, forward, '127.0.0.1');
  });
  socket.on('error', error => { console.error('UDP-Fehler:', error.message); process.exit(1); });
  socket.bind(port, values.bind, () => {
    console.log(`RuView-Brücke hört auf ${values.bind}:${port} · Meldung alle ${interval} s · ${dryRun ? 'Probelauf (sendet nichts)' : values.server}`);
  });

  let sending = false;
  setInterval(async () => {
    const nodes = aggregator.flush(interval);
    const time = new Date().toLocaleTimeString('de-DE');
    if (!nodes.length) { console.log(`${time}  keine Vitalpakete empfangen`); return; }
    const line = nodes.map(n => `Knoten ${n.node_id}: ${n.presence ? 'anwesend' : 'leer'} · Bewegung ${n.motion} · Personen ${n.persons} · Atmung ${n.breathing_bpm ?? '–'} · ${n.rssi} dBm · ${n.pps} Pakete/s`).join(' | ');
    console.log(`${time}  ${line}  (von ${[...sources].join(', ')})`);
    sources.clear();
    if (dryRun || sending) return;
    sending = true;
    try { await send(values.server, token, nodes); }
    catch (error) { console.error(`${time}  Senden fehlgeschlagen: ${error.message}`); }
    finally { sending = false; }
  }, interval * 1000);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
module.exports = { parseVitals, Aggregator };
