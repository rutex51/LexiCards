// Magazyn danych 1.30.2: umowa adaptera (pamięć, jeden plik), migawka do pliku, nieudany zapis
// i biblioteka na magazynie w jednym pliku (dane zostają po ponownym otwarciu).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Library } from '../../js/core/library.js';
import { ADAPTER_METHODS, MemoryAdapter, SnapshotAdapter, assertAdapter, decodeSnapshot, encodeSnapshot } from '../../js/core/storage.js';
import { makeBranch } from './helpers.js';
import { runStorageContract } from './storage-contract.js';

/** „Plik” w pamięci: zapis przez JSON – jak prawdziwy plik tekstowy. */
function fileSink() {
  const sink = {
    text: null,
    writes: 0,
    failNext: null,
    async read() { return sink.text ? JSON.parse(sink.text) : null; },
    async write(snapshot) {
      if (sink.failNext) {
        const error = sink.failNext;
        sink.failNext = null;
        throw error;
      }
      sink.text = JSON.stringify(snapshot);
      sink.writes += 1;
    }
  };
  return sink;
}

test('magazyn 1.30.2: umowa adaptera – pamięć i jeden plik', async () => {
  assert.ok(await runStorageContract(() => new MemoryAdapter()) >= 6);
  assert.ok(await runStorageContract(() => new SnapshotAdapter(fileSink())) >= 6);
  assert.deepEqual(ADAPTER_METHODS.slice(0, 3), ['open', 'loadAll', 'commit']);
  assert.throws(() => assertAdapter({ open() {} }), /bez metod: loadAll/);
  assert.throws(() => new Library({}), /Magazyn danych bez metod/);
  assert.equal(new MemoryAdapter().capabilities.persistent, false);
  assert.deepEqual(new SnapshotAdapter(fileSink()).capabilities, { persistent: true, sharedTabs: false, requestPersistence: false });
});

test('magazyn 1.30.2: migawka – bajty jako base64, nieznany plik i nowsza wersja – błąd', () => {
  const snapshot = encodeSnapshot({ noteImages: [{ id: 'a', bytes: new Uint8Array([0, 1, 254, 255]).buffer, view: new Uint8Array([7]) }] }, '2026-10-21T10:00:00.000Z');
  assert.equal(snapshot.format, 'lexicards-store');
  assert.equal(snapshot.savedAt, '2026-10-21T10:00:00.000Z');
  assert.deepEqual(snapshot.stores.noteImages[0].bytes, { $bytes: 'AAH+/w==' });
  assert.deepEqual(snapshot.stores.domains, [], 'każdy magazyn w pliku');
  const decoded = decodeSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.ok(decoded.noteImages[0].bytes instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(decoded.noteImages[0].bytes)], [0, 1, 254, 255]);
  assert.deepEqual([...new Uint8Array(decoded.noteImages[0].view)], [7]);
  assert.throws(() => decodeSnapshot({ format: 'inny', stores: {} }), /To nie jest plik danych LexiCards/);
  assert.throws(() => decodeSnapshot({ ...snapshot, version: 99 }), /nowszej wersji aplikacji/);
  assert.throws(() => decodeSnapshot({ ...snapshot, stores: { noteImages: [{ id: 'a', bytes: { $bytes: '%%%' } }] } }), /uszkodzony/);
});

test('magazyn 1.30.2: nieudany zapis pliku – dane w pamięci wracają do stanu z pliku, następny zapis działa', async () => {
  const sink = fileSink();
  const adapter = new SnapshotAdapter(sink);
  await adapter.open();
  await adapter.commit({ puts: { domains: [{ id: 'd1', name: 'Pierwsza' }] } });
  sink.failNext = new Error('Brak miejsca');
  await assert.rejects(adapter.commit({ puts: { domains: [{ id: 'd2', name: 'Druga' }] } }), /Brak miejsca/);
  assert.deepEqual((await adapter.loadAll()).domains.map((record) => record.id), ['d1'], 'zmiana nie została');
  await adapter.commit({ puts: { domains: [{ id: 'd3', name: 'Trzecia' }] } });
  assert.deepEqual((await adapter.loadAll()).domains.map((record) => record.id).sort(), ['d1', 'd3']);
  assert.equal(sink.writes, 2);
  // Kolejność zapisów zachowana także bez czekania na każdy.
  await Promise.all([1, 2, 3].map((n) => adapter.commit({ puts: { modules: [{ id: `m${n}`, n }] } })));
  assert.deepEqual(JSON.parse(sink.text).stores.modules.map((record) => record.id), ['m1', 'm2', 'm3']);
});

test('magazyn 1.30.2: biblioteka na magazynie w jednym pliku – lekcja, pojęcie i obraz notatki po ponownym otwarciu', async () => {
  const sink = fileSink();
  const first = new SnapshotAdapter(sink);
  await first.open();
  const library = new Library(first);
  await library.load();
  const { lesson } = await makeBranch(library);
  await library.createTerm({ termPL: 'płynność', termEN: 'liquidity' }, lesson.id);
  const png = new Uint8Array(40);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(png.buffer).setUint32(16, 30);
  new DataView(png.buffer).setUint32(20, 20);
  await library.saveNote(lesson.id, { html: '<p>Notatka</p>', images: [{ bytes: png, type: 'image/png', width: 30, height: 20, name: 'a.png', label: 'Wykres' }] });

  const again = new SnapshotAdapter(sink);
  await again.open();
  const reopened = new Library(again);
  await reopened.load();
  assert.equal(reopened.getLesson(lesson.id).name, 'Financial Ratios');
  assert.deepEqual([...reopened.maps.terms.values()].map((term) => term.termPL), ['płynność']);
  const [image] = await reopened.noteImages(lesson.id);
  assert.equal(image.label, 'Wykres');
  assert.deepEqual([...new Uint8Array(image.bytes)].slice(0, 4), [0x89, 0x50, 0x4e, 0x47]);
});
