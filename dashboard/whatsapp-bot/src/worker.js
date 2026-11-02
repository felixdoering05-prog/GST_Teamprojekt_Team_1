import { changes } from './github.js';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';

export async function readState(path) {
  try {
    const state = JSON.parse(await readFile(path, 'utf8'));
    if (state.version !== 1 || !Array.isArray(state.queue) || !state.repository || !state.snapshot) throw new Error('Ungültiger Zustand.');
    return state;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveState(path, state) {
  const temporary = path + '.tmp';
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, path);
}
export async function cycle({ state, repository, group, current, save, send, preview = true }) {
  if (state && (state.repository !== repository || state.group !== group)) throw new Error('Repository oder Zielgruppe geändert: eigenen Laufzeitordner verwenden.');
  if (!state) {
    const initial = { version: 1, repository, group, snapshot: current, queue: [] };
    await save(initial); return initial; // Baseline, no historical notifications.
  }
  const messages = [...changes(state.snapshot.issues, current.issues, 'issue', repository), ...changes(state.snapshot.pulls, current.pulls, 'pull', repository)];
  let next = { ...state, snapshot: current, queue: [...state.queue, ...messages.map(text => ({ id: randomUUID(), text }))] };
  if (next.queue.length > 200) throw new Error('Nachrichtenwarteschlange voll. Bitte prüfen; Zustand bleibt erhalten.');
  await save(next); // Persist before the first external send.
  if (preview) {
    for (const item of next.queue) await send('[VORSCHAU] ' + item.text);
    next = { ...next, queue: [] }; await save(next); return next;
  }
  // Limit traffic per cycle; the remaining items stay durable for the next cycle.
  for (let count = 0; next.queue.length && count < 10; count++) {
    await send(next.queue[0].text);
    next = { ...next, queue: next.queue.slice(1) }; await save(next);
  }
  return next;
}
