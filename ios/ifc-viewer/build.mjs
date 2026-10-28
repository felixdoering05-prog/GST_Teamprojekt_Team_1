import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
const output = new URL('../KI Trifft Gebäude APP/KI Trifft Gebäude APP/IFCAssets/', import.meta.url);
await mkdir(output, { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('./viewer.js', import.meta.url))], bundle: true, format: 'iife', target: 'safari17', minify: true, legalComments: 'eof', outfile: fileURLToPath(new URL('viewer.js', output)) });
for (const name of ['index.html', 'style.css']) await copyFile(new URL(name, import.meta.url), new URL(name, output));
await copyFile(new URL('node_modules/web-ifc/web-ifc.wasm', import.meta.url), new URL('web-ifc.wasm', output));
await copyFile(new URL('node_modules/web-ifc/LICENSE.md', import.meta.url), new URL('web-ifc-LICENSE.txt', output));
await copyFile(new URL('node_modules/three/LICENSE', import.meta.url), new URL('three-LICENSE.txt', output));

for (const name of ['viewer.js', 'web-ifc.wasm']) {
  execFileSync('swift', [fileURLToPath(new URL('./Compress.swift', import.meta.url)), fileURLToPath(new URL(name, output)), fileURLToPath(new URL(name + '.lzfse', output))]);
  await unlink(new URL(name, output));
}
