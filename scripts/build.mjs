import { build as bundle } from 'esbuild';
import { build as vite } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import './generate-icon.mjs';

await mkdir('dist', { recursive: true });
await bundle({ entryPoints: ['src/main/index.ts'], outfile: 'dist/main.cjs', bundle: true,
  platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: false });
await bundle({ entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload.cjs', bundle: true,
  platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: false });
await vite();
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
await writeFile('dist/build-receipt.json', JSON.stringify({ version: 1, sourceCommit, dirty,
  builtAt: new Date().toISOString(), mainSha256: await hash('dist/main.cjs'),
  preloadSha256: await hash('dist/preload.cjs'),
  htmlSha256: await hash('dist/renderer/index.html') }, null, 2));
console.log(`Built Harness from ${sourceCommit}${dirty ? ' (with local changes)' : ''}.`);
