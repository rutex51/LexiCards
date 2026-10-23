// Ustawienia 1.45.2: zajęte miejsce (pliki aplikacji w pamięci podręcznej, dane jak w kopii, obrazy i załączniki,
// szacunek przeglądarki) i historia zmian w pigułce od wersji 1.0.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CHANGELOG, CHANGELOG_SHOWN } from '../../js/core/changelog.js';
import { APP_CACHE_PREFIX, appFilesSize, dataSize, measureUsage } from '../../js/core/usage.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/** Pamięć podręczna z nazwanymi zbiorami plików: { nazwa: [rozmiary] }. */
function fakeCaches(content) {
  return {
    keys: async () => Object.keys(content),
    open: async (name) => ({
      keys: async () => content[name].map((size, index) => `${name}/${index}`),
      match: async (request) => {
        const [name2, index] = request.split('/');
        return { blob: async () => ({ size: content[name2][Number(index)] }) };
      }
    })
  };
}
const fakeLibrary = (data, media = { images: 0, files: 0, size: 0 }) => ({ exportAll: async () => data, mediaSummary: () => media });

test('ustawienia 1.45.2: pliki aplikacji – suma zbiorów lexicards-* (stare i nowe wydanie razem), inne pominięte; brak – null', async () => {
  assert.equal(APP_CACHE_PREFIX, 'lexicards-');
  const caches = fakeCaches({ 'lexicards-aaa': [1000, 2000], 'lexicards-bbb': [500], 'obca-pamiec': [99999] });
  assert.equal(await appFilesSize(caches), 3500);
  assert.equal(await appFilesSize(fakeCaches({ 'obca-pamiec': [10] })), null, 'aplikacja nie zapisana do pracy offline');
  assert.equal(await appFilesSize(undefined), null, 'przeglądarka bez pamięci podręcznej');
  // sw.js zapisuje pliki pod tą samą nazwą.
  assert.match(readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'), /const CACHE = `lexicards-\$\{VERSION\}`/);
});

test('ustawienia 1.45.2: dane – bajty tekstu UTF-8 jak plik danych (polskie litery po dwa bajty)', async () => {
  const data = { terms: [{ termPL: 'żółw', termEN: 'turtle' }] };
  assert.equal(await dataSize(fakeLibrary(data)), new TextEncoder().encode(JSON.stringify(data)).length);
  assert.equal(await dataSize(fakeLibrary({ a: 'ą' })), JSON.stringify({ a: 'ą' }).length + 1);
});

test('ustawienia 1.45.2: zajęte miejsce razem z obrazami i załącznikami; szacunek i limit przeglądarki; błąd pamięci podręcznej – bez aplikacji', async () => {
  const library = fakeLibrary({ x: '1234' }, { images: 2, files: 1, size: 5000 });
  const data = JSON.stringify({ x: '1234' }).length;
  const usage = await measureUsage({ library, cacheStorage: fakeCaches({ 'lexicards-a': [3000] }), storage: { estimate: async () => ({ usage: 9000, quota: 1e9 }) } });
  assert.deepEqual(usage, { app: 3000, data, media: { images: 2, files: 1, size: 5000 }, total: 3000 + data + 5000, browser: 9000, quota: 1e9 });
  const broken = await measureUsage({ library, cacheStorage: { keys: async () => { throw new Error('zablokowane'); } }, storage: {} });
  assert.equal(broken.app, null);
  assert.equal(broken.total, data + 5000);
  assert.equal(broken.browser, null);
  const zero = await measureUsage({ library, cacheStorage: undefined, storage: { estimate: async () => ({ usage: 10, quota: 0 }) } });
  assert.equal(zero.quota, null, 'limit 0 – nieznany');
});

test('ustawienia 1.45.2: historia zmian – od bieżącej wersji do 1.0, bez powtórzeń, od najnowszej, każda w jednym zdaniu', () => {
  assert.equal(CHANGELOG[0].version, pkg.version, 'pierwsza pozycja – bieżąca wersja (package.json)');
  assert.equal(CHANGELOG.at(-1).version, '1.0');
  const versions = CHANGELOG.map((entry) => entry.version);
  assert.equal(new Set(versions).size, versions.length);
  const parts = (version) => version.split('.').map(Number);
  const compare = (a, b) => {
    const [x, y] = [parts(a), parts(b)];
    for (let index = 0; index < 3; index += 1) if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) - (y[index] ?? 0);
    return 0;
  };
  for (let index = 1; index < versions.length; index += 1) assert.ok(compare(versions[index - 1], versions[index]) > 0, `${versions[index - 1]} przed ${versions[index]}`);
  // Każda wersja główna od 1.0 do bieżącej.
  for (let minor = 0; minor <= parts(pkg.version)[1]; minor += 1) assert.ok(versions.includes(`1.${minor}`), `wersja 1.${minor}`);
  assert.ok(CHANGELOG.every((entry) => entry.summary.length > 10 && entry.summary.length <= 200 && entry.summary.endsWith('.')));
  assert.equal(CHANGELOG_SHOWN, 5);
});
