// Generuje sw.js (lista plików do pracy offline) i js/version.js (numer wersji).
//
//   npm run build            – zapisuje oba pliki
//   npm run build -- --check – sprawdza, czy są aktualne (kod wyjścia 1, gdy nie)
//
// Identyfikator wydania to skrót treści wszystkich plików aplikacji, więc zmienia się
// po każdej zmianie – dzięki temu przeglądarka wie, że ma pobrać nowy komplet.

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ASSET_ROOTS = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons', 'sounds'];
const GENERATED = new Set(['js/version.js', 'sw.js']);

async function walk(relative) {
  const absolute = path.join(ROOT, relative);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOTDIR') return [relative];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(child));
    else files.push(child);
  }
  return files;
}

export async function listAssets() {
  const files = [];
  for (const root of ASSET_ROOTS) files.push(...await walk(root));
  if (!files.includes('js/version.js')) files.push('js/version.js');
  return files.sort();
}

/** Zwraca treść plików generowanych: { 'js/version.js': tekst, 'sw.js': tekst }. */
export async function generate() {
  const assets = await listAssets();
  const hash = createHash('sha256');
  for (const file of assets) {
    if (GENERATED.has(file)) continue;
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(ROOT, file)));
    hash.update('\0');
  }
  const template = await readFile(path.join(ROOT, 'tools/sw.template.js'), 'utf8');
  hash.update(template);
  const buildID = hash.digest('hex').slice(0, 8);

  const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const versionFile = [
    '// PLIK GENEROWANY przez `npm run build` – nie edytuj go ręcznie.',
    `export const APP_VERSION = '${version}';`,
    `export const BUILD_ID = '${buildID}';`,
    ''
  ].join('\n');

  const serviceWorker = '// PLIK GENEROWANY przez `npm run build` z tools/sw.template.js – nie edytuj go ręcznie.\n' + template
    .replace('__BUILD_ID__', buildID)
    .replace('__ASSETS__', JSON.stringify(assets, null, 2));

  return { files: { 'js/version.js': versionFile, 'sw.js': serviceWorker }, buildID, assets };
}

async function main() {
  const check = process.argv.includes('--check');
  const { files, buildID, assets } = await generate();
  let stale = false;
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(ROOT, name);
    const existing = await readFile(target, 'utf8').catch(() => null);
    if (existing === content) continue;
    if (check) {
      console.error(`Nieaktualny plik: ${name}. Uruchom „npm run build”.`);
      stale = true;
    } else {
      await writeFile(target, content);
      console.log(`zapisano ${name}`);
    }
  }
  if (stale) process.exit(1);
  console.log(`wydanie ${buildID}, plików do pracy offline: ${assets.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
