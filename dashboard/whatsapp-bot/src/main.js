import { mkdir, open, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { snapshot } from './github.js';
import { cycle, readState, saveState } from './worker.js';

const repository = process.env.GITHUB_REPOSITORY || 'felixdoering05-prog/GST_Teamprojekt_Team_1';
const preview = process.argv.includes('--preview') || process.env.SEND_ENABLED !== 'true';
const setup = process.argv.includes('--connect') || process.argv.includes('--groups');
const group = process.env.WHATSAPP_GROUP_ID || '';
const directory = resolve('runtime', setup ? 'whatsapp' : preview ? 'preview' : 'live');
const stateFile = resolve(directory, 'state.json');
const seconds = Number(process.env.POLL_SECONDS || 300);
if (!Number.isFinite(seconds) || seconds < 300) throw new Error('POLL_SECONDS muss mindestens 300 sein.');
if (!preview && !setup && !/^\d+(?:-\d+)?@g\.us$/.test(group)) throw new Error('Eine konkrete WhatsApp-Gruppen-ID ist erforderlich.');
await mkdir(directory, { recursive: true, mode: 0o700 });
await mkdir('runtime/whatsapp', { recursive: true, mode: 0o700 });
let lock;
try { lock = await open(resolve('runtime', 'bot.lock'), 'wx', 0o600); }
catch { throw new Error('Bot bereits aktiv oder Sperrdatei vorhanden. Nicht zwei Instanzen starten.'); }
let client, stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  try { if (client) await client.destroy(); } finally { await lock.close(); await rm(resolve('runtime', 'bot.lock'), { force: true }); }
}
process.once('SIGINT', () => { stop().finally(() => process.exit()); });
process.once('SIGTERM', () => { stop().finally(() => process.exit()); });
try {
  if (!preview || setup) {
    const { connect } = await import('./whatsapp.js');
    client = await connect(resolve('runtime/whatsapp'), process.env.CHROME_PATH);
    client.on('disconnected', () => { console.error('WhatsApp getrennt; Neustart und ggf. Kopplung erforderlich.'); stop().finally(() => process.exit(1)); });
    if (setup) {
      if (process.argv.includes('--groups')) {
        for (const chat of await client.getChats()) if (chat.isGroup) console.log(`${chat.name}: ${chat.id._serialized}`);
      } else console.log('Verknüpfung hergestellt. Noch keine Nachrichten gesendet.');
      await stop();
    }
  }
  if (!setup) {
    let state = await readState(stateFile);
    const send = preview ? async text => console.log(text) : async text => {
      const chat = await client.getChatById(group);
      if (!chat.isGroup) throw new Error('Das konfigurierte Ziel ist keine Gruppe.');
      await client.sendMessage(group, text, { linkPreview: false });
    };
    console.log(preview ? 'VORSCHAU: keine WhatsApp-Verbindung, keine Nachrichten an Dritte.' : 'Projekt-Bot aktiv: GitHub → konfigurierte Gruppe.');
    while (!stopping) {
      try {
        const current = await snapshot({ repository, token: process.env.GITHUB_TOKEN, allowPrivate: process.env.ALLOW_PRIVATE_REPOSITORY === 'true' });
        state = await cycle({ state, repository, group: preview ? 'preview' : group, current, save: value => saveState(stateFile, value), send, preview });
        console.log('GitHub geprüft; Zustand gesichert.');
      } catch (error) {
        console.error(error.message);
        // Re-read the last durable queue after a failed send; never overwrite it with stale memory.
        state = await readState(stateFile);
      }
      if (process.argv.includes('--once')) break;
      await new Promise(resolveWait => setTimeout(resolveWait, seconds * 1000));
    }
  }
} finally { await stop(); }
