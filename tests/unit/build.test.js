// Spójność plików aplikacji: lista do pracy offline, odwołania między plikami, manifest.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { ROOT, generate, listAssets } from '../../tools/build.mjs';

const read = (name) => readFile(path.join(ROOT, name), 'utf8');

test('sw.js i js/version.js są aktualne względem plików aplikacji', async () => {
  const { files } = await generate();
  for (const [name, content] of Object.entries(files)) {
    assert.equal(await read(name), content, `Nieaktualny plik ${name} – uruchom „npm run build”.`);
  }
});

test('lista plików offline zawiera wszystko, do czego odwołuje się strona główna', async () => {
  const assets = new Set(await listAssets());
  const html = await read('index.html');
  const references = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((match) => match[1]);
  assert.ok(references.length >= 5);
  for (const reference of references) {
    assert.ok(assets.has(reference), `index.html odwołuje się do „${reference}”, którego nie ma na liście offline`);
  }
});

test('każdy import między modułami wskazuje plik z listy offline', async () => {
  const assets = new Set(await listAssets());
  const modules = [...assets].filter((name) => name.startsWith('js/') && name.endsWith('.js'));
  let checked = 0;
  for (const module of modules) {
    const source = await read(module);
    for (const match of source.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+'([^']+)'/gm)) {
      const target = path.posix.join(path.posix.dirname(module), match[1]);
      assert.ok(assets.has(target), `${module} importuje „${match[1]}”, którego nie ma na liście offline`);
      checked += 1;
    }
  }
  assert.ok(checked > 30, `sprawdzono zbyt mało importów: ${checked}`);
});

test('manifest wskazuje ikony, które istnieją i są na liście offline', async () => {
  const assets = new Set(await listAssets());
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.ok(assets.has(icon.src), `brak ikony ${icon.src}`);
  }
});

test('adresy w aplikacji są względne (działa w podkatalogu GitHub Pages)', async () => {
  const html = await read('index.html');
  assert.equal(/(?:href|src)="\//.test(html), false, 'index.html zawiera adres zaczynający się od „/”');
  const serviceWorker = await read('sw.js');
  assert.equal(/"\//.test(serviceWorker), false, 'lista offline zawiera adres bezwzględny');
});

test('wyszukiwarki nie indeksują aplikacji: znacznik robots i nagłówek dla hostingu z plikiem _headers', async () => {
  const html = await read('index.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  const headers = await read('_headers');
  assert.match(headers, /^\/\*\n {2}X-Robots-Tag: noindex, nofollow$/m);
  assert.equal((await listAssets()).includes('_headers'), false, 'plik _headers nie trafia do pamięci offline');
});
