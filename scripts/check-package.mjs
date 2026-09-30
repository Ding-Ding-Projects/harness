import { extractFile, listPackage } from '@electron/asar';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const manifest = JSON.parse(await readFile('build-manifest.json', 'utf8'));
const archivePath = path.resolve(manifest.resources);
const executablePath = path.resolve(manifest.executable);
const receipt = JSON.parse(await readFile('dist/build-receipt.json', 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const executable = await readFile(executablePath);
if (executable.subarray(0, 2).toString('ascii') !== 'MZ') throw new Error('Packaged executable is not a Windows PE image.');
for (const [file, expected] of Object.entries({
  'dist/main.cjs': receipt.mainSha256,
  'dist/preload.cjs': receipt.preloadSha256,
  'dist/renderer/index.html': receipt.htmlSha256,
  ...receipt.files,
})) {
  if (digest(extractFile(archivePath, path.normalize(file))) !== expected) throw new Error(`Packaged build mismatch: ${file}`);
}
const entries = listPackage(archivePath).map(value => value.replaceAll('\\', '/'));
for (const entry of entries) {
  if (/(^|\/)(\.env(?:\..*)?|\.git|state\.json|credentials\.json)(\/|$)/i.test(entry)) {
    throw new Error('Unexpected private development data in package.');
  }
}
if (!entries.some(entry => /\/dist\/renderer\/assets\/.+\.js$/.test(entry))) throw new Error('Packaged renderer JavaScript is missing.');
if (!entries.some(entry => /\/assets\/icon\.ico$/.test(entry))) throw new Error('Packaged icon is missing.');
const archive = await readFile(archivePath);
const result = { version: 1, checkedAt: new Date().toISOString(), sourceCommit: receipt.sourceCommit,
  dirty: receipt.dirty, executable: manifest.executable, executableSha256: digest(executable),
  archive: manifest.resources, archiveSha256: digest(archive), archiveBytes: archive.length,
  archiveEntries: entries.length, entrypointsMatch: true };
await writeFile('out/package-receipt.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
