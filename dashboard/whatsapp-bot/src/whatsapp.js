import WhatsApp from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { chmod, access } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function connect(directory, chromePath) {
  if (!chromePath) throw new Error('CHROME_PATH muss auf einen separat installierten, aktuellen Chrome/Chromium zeigen.');
  await access(chromePath);
  const client = new WhatsApp.Client({
    authStrategy: new WhatsApp.LocalAuth({ clientId: 'd21-project', dataPath: resolve(directory, 'auth') }),
    webVersionCache: { type: 'local', path: resolve(directory, 'cache') },
    puppeteer: { headless: true, ...(chromePath ? { executablePath: chromePath } : {}) },
    qrMaxRetries: 8,
  });
  client.on('qr', async value => {
    try {
      const file = resolve(directory, 'pairing-qr.png');
      await QRCode.toFile(file, value); await chmod(file, 0o600);
      console.log('Kopplungs-QR lokal gespeichert. In WhatsApp → Verknüpfte Geräte scannen. Nicht veröffentlichen.');
    } catch { console.error('Kopplungs-QR konnte nicht gespeichert werden.'); }
  });
  const ready = new Promise((resolveReady, reject) => {
    client.once('ready', resolveReady);
    client.once('auth_failure', () => reject(new Error('WhatsApp-Anmeldung fehlgeschlagen.')));
    client.once('disconnected', () => reject(new Error('WhatsApp-Verbindung getrennt.')));
  });
  ready.catch(() => {}); // The actual error is awaited below, including early authentication failures.
  try { await client.initialize(); await ready; } catch (e) { await client.destroy(); throw e; }
  await client.setAutoDownloadAudio(false); await client.setAutoDownloadDocuments(false);
  await client.setAutoDownloadPhotos(false); await client.setAutoDownloadVideos(false);
  return client;
}
