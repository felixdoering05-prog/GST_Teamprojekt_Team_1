import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guards against the 1.0.123 heat-view crash: the viewer removes the retired smart-home switcher
// (#modes, #home) before heat/sync modules mount, so those modules must not read these elements
// without a null check.
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const html = read('./index.html');
const ids = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));

/** IDs inside an element that viewer.js removes at runtime (the element itself included). */
function removedIds() {
  const viewer = read('./viewer.js');
  const roots = [...viewer.matchAll(/querySelector\('#([\w-]+)'\)\?\.remove\(\)/g)].map(m => m[1]);
  const removed = new Set();
  for (const root of roots) {
    const tag = html.match(new RegExp(`<(\\w+)[^>]*\\bid="${root}"`));
    assert.ok(tag, `#${root} exists in index.html`);
    const start = tag.index, close = html.indexOf(`</${tag[1]}>`, start);
    for (const m of html.slice(start, close).matchAll(/\bid="([\w-]+)"/g)) removed.add(m[1]);
  }
  return removed;
}

/** Lookups whose result is used directly (no `?.` and no `|| {}` fallback). */
function unguardedLookups(source) {
  const found = [];
  const pattern = /(\(?)document\.(?:getElementById\('([\w-]+)'\)|querySelector\('#([\w-]+)'\))(\?\.|\s*\|\|)?/g;
  for (const m of source.matchAll(pattern)) if (!m[4]) found.push(m[2] ?? m[3]);
  // getElementById(variable) inside a loop over literal IDs, e.g. for (const id of ['a','b']) …
  for (const loop of source.matchAll(/for\s*\(const (\w+) of \[([^\]]*)\]\)\s*(\{?)[^;]*?getElementById\(\1\)(\?\.|\s*;)?\.?/g)) {
    const tail = source.slice(loop.index, loop.index + loop[0].length + 20);
    const guarded = /const \w+=document\.getElementById\(\w+\);if\(\w+\)/.test(tail) || loop[4] === '?.';
    if (!guarded) for (const id of loop[2].matchAll(/'([\w-]+)'/g)) found.push(id[1]);
  }
  return found;
}

test('modules mounted after the smart-home removal never touch removed elements unguarded', () => {
  const removed = removedIds();
  assert.ok(removed.has('model-mode') && removed.has('home'), 'removal covers the smart-home switcher');
  for (const file of ['./heat.js', './sync.js', './commands.js']) {
    const hits = unguardedLookups(read(file)).filter(id => removed.has(id));
    assert.deepEqual(hits, [], `${file} reads removed elements without a null check`);
  }
});

test('every unguarded element lookup refers to an element that exists in index.html', () => {
  for (const file of ['./viewer.js', './heat.js', './sync.js', './commands.js', './interactions.js']) {
    const missing = unguardedLookups(read(file)).filter(id => !ids.has(id));
    assert.deepEqual(missing, [], `${file} looks up elements missing from index.html`);
  }
});
