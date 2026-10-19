// Załączniki notatek i przeniesienie dwustopniowe (wersja 1.8): nazwy i rodzaje plików,
// zapis w bibliotece, plik danych bez bajtów, jeden plik obrazów i załączników (ZIP), przywracanie
// obu plików, zachowanie plików już obecnych na urządzeniu.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BACKUP_FORMAT_VERSION, MEDIA_MANIFEST, createBackup, createMediaArchive, isZipFile, openMediaArchive, restoreBackup,
  restoreMedia, validateBackup
} from '../../js/core/backup.js';
import { buildExportFile, collectExportNotes } from '../../js/core/exporter.js';
import { NOTE_FILE_LIMIT, NOTE_FILE_MAX_BYTES } from '../../js/core/model.js';
import { cleanFileName, fileKind, fileTypeOf, opensInBrowser, renamedFile } from '../../js/core/note-files.js';
import { ZipWriter, createZip, crc32, openZipBlob } from '../../js/core/zip.js';
import { makeBranch, makeLibrary } from './helpers.js';

function png(seed = 0) {
  const bytes = new Uint8Array(40);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 30);
  view.setUint32(20, 20);
  bytes[39] = seed;
  return bytes;
}

const image = (seed, label = null) => ({ bytes: png(seed), type: 'image/png', width: 30, height: 20, name: `obraz-${seed}.png`, label });

/** Załącznik o treści zależnej od `seed` (np. udawany PDF). */
function attachment(name, seed = 1, size = 300, type = '') {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = (index * 7 + seed) % 251;
  return { name, type, bytes };
}

const byteSum = (buffer) => new Uint8Array(buffer).reduce((sum, value) => sum + value, 0);

/** Biblioteka z notatką: tekst, dwa obrazy i dwa załączniki. */
async function libraryWithMedia() {
  const made = await makeLibrary();
  const branch = await makeBranch(made.library);
  await made.library.saveNote(branch.lesson.id, {
    html: '<p>Notatka</p>',
    images: [image(1, 'Schemat'), image(2)],
    files: [attachment('Instrukcja.pdf', 1, 500, 'application/pdf'), attachment('Tabela.xlsx', 2, 900)]
  });
  return { ...made, ...branch };
}

// ---------------------------------------------------------------- nazwy i rodzaje

test('załączniki: nazwa pliku bez niedozwolonych znaków, rozszerzenie zostaje przy zmianie nazwy, typ i rodzaj', () => {
  assert.equal(cleanFileName('  Raport: Q1/Q2 *wersja*.pdf '), 'Raport Q1 Q2 wersja .pdf');
  assert.equal(cleanFileName(''), 'Załącznik');
  assert.equal(cleanFileName('...ukryty'), 'ukryty');
  const long = cleanFileName(`${'x'.repeat(200)}.docx`);
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('.docx'), 'rozszerzenie zostaje po skróceniu');
  assert.equal(renamedFile('Raport.PDF', 'Sprawozdanie'), 'Sprawozdanie.pdf');
  assert.equal(renamedFile('Raport.pdf', 'Sprawozdanie.pdf'), 'Sprawozdanie.pdf');
  assert.equal(renamedFile('bez-rozszerzenia', 'nowa'), 'nowa');

  assert.equal(fileTypeOf('a.pptx', ''), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  assert.equal(fileTypeOf('a.docx', 'application/octet-stream'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(fileTypeOf('a.bin', 'application/x-custom'), 'application/x-custom');
  assert.equal(fileTypeOf('nieznany', ''), 'application/octet-stream');
  assert.deepEqual(['a.pdf', 'a.DOCX', 'a.xlsx', 'a.csv', 'a.pptx', 'a.txt', 'a.jpg', 'a.zip', 'a.xyz'].map((name) => fileKind(name)),
    ['pdf', 'word', 'excel', 'excel', 'powerpoint', 'text', 'image', 'archive', 'other']);
  assert.equal(opensInBrowser('a.pdf'), true);
  assert.equal(opensInBrowser('a.docx'), false);
  assert.equal(opensInBrowser('a.csv'), false, 'CSV lepiej otworzyć w Excelu');
});

// ---------------------------------------------------------------- biblioteka

test('notatka z załącznikami: zapis, zmiana nazwy i kolejności, usunięcie; bajty w osobnym magazynie', async () => {
  const { library, adapter, lesson } = await libraryWithMedia();
  const note = library.getNote(lesson.id);
  assert.deepEqual(note.files.map((file) => [file.name, file.type, file.size]), [
    ['Instrukcja.pdf', 'application/pdf', 500],
    ['Tabela.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 900]
  ]);
  assert.equal(note.files[0].bytes, undefined, 'notatka ma tylko opis pliku');
  assert.equal((await adapter.readStore('noteFiles')).length, 2);
  const one = await library.noteFile(lesson.id, note.files[1].id);
  assert.equal(byteSum(one.bytes), byteSum(attachment('Tabela.xlsx', 2, 900).bytes.buffer));

  // Zmiana nazwy i kolejności, usunięcie pierwszego, dodanie nowego.
  const [first, second] = note.files;
  await library.saveNote(lesson.id, {
    html: note.html, images: note.images.map((meta) => ({ id: meta.id })),
    files: [{ id: second.id, name: 'Wskaźniki: 2026.xlsx' }, attachment('Prezentacja.pptx', 3)]
  });
  const changed = library.getNote(lesson.id).files;
  assert.deepEqual(changed.map((file) => file.name), ['Wskaźniki 2026.xlsx', 'Prezentacja.pptx']);
  assert.equal(changed[0].id, second.id);
  const stored = await adapter.readStore('noteFiles');
  assert.equal(stored.length, 2);
  assert.ok(!stored.some((record) => record.id === first.id), 'usunięty załącznik znika z bazy');

  // Zapis bez listy załączników (np. import z arkusza) ich nie rusza.
  await library.saveNote(lesson.id, { html: '<p>inna treść</p>', images: [] });
  assert.equal(library.getNote(lesson.id).files.length, 2);
  // Notatka z samymi załącznikami zostaje; bez niczego – znika razem z plikami.
  await library.saveNote(lesson.id, { html: '', htmlEN: '', images: [] });
  assert.equal(library.getNote(lesson.id).files.length, 2);
  assert.equal(await library.saveNote(lesson.id, { html: '', images: [], files: [] }), null);
  assert.equal((await adapter.readStore('noteFiles')).length, 0);
});

test('załączniki: limit liczby i rozmiaru, pusty plik – biblioteka bez zmian', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  const many = Array.from({ length: NOTE_FILE_LIMIT + 1 }, (_, index) => attachment(`plik-${index}.pdf`, index, 10));
  await assert.rejects(library.saveNote(lesson.id, { html: '<p>x</p>', files: many }), /najwyżej 30 załączników/);
  const big = { name: 'Duży.pdf', type: 'application/pdf', bytes: new Uint8Array(NOTE_FILE_MAX_BYTES + 1) };
  await assert.rejects(library.saveNote(lesson.id, { html: '<p>x</p>', files: [big] }), /„Duży\.pdf” jest za duży \(limit to 50 MB\)/);
  await assert.rejects(library.saveNote(lesson.id, { html: '<p>x</p>', files: [{ name: 'pusty.txt', bytes: new Uint8Array(0) }] }), /jest pusty/);
  assert.equal(library.getNote(lesson.id), null);
});

test('załączniki: kopia lekcji dostaje własne kopie, usunięcie lekcji i wszystkich danych usuwa pliki', async () => {
  const { library, adapter, lesson, module } = await libraryWithMedia();
  const copy = await library.copyLesson(lesson.id, module.id);
  const original = library.getNote(lesson.id).files;
  const copied = library.getNote(copy.id).files;
  assert.deepEqual(copied.map((file) => file.name), ['Instrukcja.pdf', 'Tabela.xlsx']);
  assert.notEqual(copied[0].id, original[0].id);
  assert.equal(byteSum((await library.noteFile(copy.id, copied[0].id)).bytes), byteSum((await library.noteFile(lesson.id, original[0].id)).bytes));
  assert.equal((await adapter.readStore('noteFiles')).length, 4);

  await library.delete({ kind: 'lesson', id: lesson.id });
  assert.equal((await adapter.readStore('noteFiles')).length, 2);
  await library.deleteAllContent();
  assert.equal((await adapter.readStore('noteFiles')).length, 0);
  assert.equal((await adapter.readStore('noteImages')).length, 0);
});

test('import z arkusza zastępujący notatkę zostawia jej załączniki', async () => {
  const { library, lesson, domain, module } = await libraryWithMedia();
  await library.importRows([], { notes: [{ domain: domain.name, module: module.name, lesson: lesson.name, html: '<p>z arkusza</p>', images: [] }] });
  const note = library.getNote(lesson.id);
  assert.equal(note.html, '<p>z arkusza</p>');
  assert.deepEqual(note.files.map((file) => file.name), ['Instrukcja.pdf', 'Tabela.xlsx']);
});

test('eksport XLSX nie obejmuje załączników: notatka z samymi załącznikami nie trafia do arkusza notatek', async () => {
  const { library, lesson } = await libraryWithMedia();
  const file = await buildExportFile(library, { kind: 'lesson', id: lesson.id }, 'xlsx');
  assert.deepEqual([file.notes, file.images], [1, 2]);
  await library.saveNote(lesson.id, { html: '', images: [] });
  assert.equal(library.getNote(lesson.id).files.length, 2);
  assert.deepEqual(collectExportNotes(library, { kind: 'all' }), []);
  assert.equal((await buildExportFile(library, { kind: 'lesson', id: lesson.id }, 'xlsx')).notes, 0);
});

// ---------------------------------------------------------------- plik danych

test('plik danych: bez bajtów obrazów i załączników, z ich opisami w notatkach i podsumowaniem', async () => {
  const { library, lesson } = await libraryWithMedia();
  const backup = JSON.parse(JSON.stringify(await createBackup(library, '1.8.0')));
  assert.equal(backup.formatVersion, BACKUP_FORMAT_VERSION);
  assert.equal(backup.data.noteImages, undefined);
  assert.equal(backup.data.noteFiles, undefined);
  assert.equal(backup.counts.noteImages, undefined);
  assert.deepEqual(backup.media, { images: 2, files: 2, size: 40 + 40 + 500 + 900 });
  assert.ok(JSON.stringify(backup).length < 5000, 'plik danych jest mały');
  const note = backup.data.notes.find((item) => item.lessonID === lesson.id);
  assert.deepEqual(note.files.map((file) => file.name), ['Instrukcja.pdf', 'Tabela.xlsx']);

  const result = validateBackup(backup);
  assert.deepEqual(result.data.notes[0].images.map((meta) => meta.label), ['Schemat', 'Obraz 1']);
  assert.equal(result.data.notes[0].files.length, 2);
  assert.deepEqual(result.media, { images: 2, files: 2, size: 1480, included: 0 });

  // Opisy złe albo powtórzone są pomijane, nazwy – oczyszczane.
  note.files.push({ id: note.files[0].id, name: 'kopia.pdf' }, { name: 'bez id' }, null);
  note.files[1].name = 'Zła/nazwa.xlsx';
  const cleaned = validateBackup(backup).data.notes[0].files;
  assert.deepEqual(cleaned.map((file) => file.name), ['Instrukcja.pdf', 'Zła nazwa.xlsx']);
});

test('przywrócenie samych danych na tym samym urządzeniu zostawia obrazy i załączniki, na nowym – brakuje ich', async () => {
  const { library, lesson } = await libraryWithMedia();
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  await restoreBackup(library, backup);
  assert.equal((await library.noteImages(lesson.id)).length, 2, 'obrazy zostały');
  const files = library.getNote(lesson.id).files;
  assert.ok(await library.noteFile(lesson.id, files[0].id), 'załącznik został');
  assert.deepEqual(await library.missingMedia(), { images: 0, files: 0, size: 0 });

  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, backup);
  assert.equal(fresh.getNote(lesson.id).html, '<p>Notatka</p>');
  assert.deepEqual(await fresh.missingMedia(), { images: 2, files: 2, size: 1480 });
  assert.deepEqual(await fresh.noteImages(lesson.id), [], 'bez plików – bez obrazów do pokazania');
  const listed = await fresh.noteImages(lesson.id, { withMissing: true });
  assert.deepEqual(listed.map((item) => [item.label, item.missing, item.bytes]), [['Schemat', true, null], ['Obraz 1', true, null]]);
  assert.equal(await fresh.noteFile(lesson.id, files[0].id), null);

  // Zapis notatki z brakującymi obrazami zostawia ich opisy (plik może dojść później).
  await fresh.saveNote(lesson.id, { html: '<p>Zmieniona</p>', images: listed.map((item) => ({ id: item.id, label: item.label })) });
  assert.equal(fresh.getNote(lesson.id).images.length, 2);
});

// ---------------------------------------------------------------- plik obrazów i załączników

test('plik obrazów i załączników: jeden ZIP z obrazami, załącznikami i spisem treści; przywrócenie na nowym urządzeniu', async () => {
  const { library, lesson } = await libraryWithMedia();
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const archive = await createMediaArchive(library, 'test');
  assert.deepEqual({ images: archive.images, files: archive.files, size: archive.size, missing: archive.missing },
    { images: 2, files: 2, size: 1480, missing: 0 });
  assert.equal(await isZipFile(archive.blob), true);
  assert.equal(await isZipFile(new Blob([JSON.stringify(backup)])), false);

  const zip = await openZipBlob(archive.blob);
  const names = [...zip.entries.keys()];
  assert.equal(names.length, 5);
  assert.ok(names.includes(MEDIA_MANIFEST));
  assert.equal(names.filter((name) => name.startsWith('obrazy/') && name.endsWith('.png')).length, 2);
  assert.ok(names.some((name) => /^zalaczniki\/[^/]+\/Instrukcja\.pdf$/.test(name)), 'załącznik pod swoją nazwą');
  const { manifest } = await openMediaArchive(archive.blob);
  assert.equal(manifest.items.length, 4);
  assert.deepEqual(manifest.items.map((item) => item.kind).sort(), ['file', 'file', 'image', 'image']);

  // Nowe urządzenie: najpierw dane, potem obrazy i załączniki.
  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, backup);
  const progress = [];
  const report = await restoreMedia(fresh, archive.blob, { onProgress: (done, total) => progress.push([done, total]) });
  assert.deepEqual(report, { images: 2, files: 2, present: 0, unmatched: 0, damaged: 0, missing: 0 });
  assert.deepEqual(progress.at(-1), [4, 4]);
  assert.deepEqual(await fresh.missingMedia(), { images: 0, files: 0, size: 0 });
  const images = await fresh.noteImages(lesson.id);
  assert.deepEqual(images.map((item) => new Uint8Array(item.bytes)[39]), [1, 2]);
  const files = fresh.getNote(lesson.id).files;
  const restored = await fresh.noteFile(lesson.id, files[1].id);
  assert.equal(crc32(new Uint8Array(restored.bytes)), files[1].crc);

  // Drugi raz – wszystko już jest, nic nie dochodzi.
  const again = await restoreMedia(fresh, archive.blob);
  assert.deepEqual(again, { images: 0, files: 0, present: 4, unmatched: 0, damaged: 0, missing: 0 });
});

test('plik obrazów i załączników przed plikiem danych, pliki do innych notatek i uszkodzone – pomijane', async () => {
  const { library, lesson } = await libraryWithMedia();
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const archive = await createMediaArchive(library, 'test');

  // Pusta biblioteka: żaden plik nie pasuje do notatek – nic nie trafia do bazy.
  const { library: empty, adapter } = await makeLibrary();
  assert.deepEqual(await restoreMedia(empty, archive.blob), { images: 0, files: 0, present: 0, unmatched: 4, damaged: 0, missing: 0 });
  assert.equal((await adapter.readStore('noteFiles')).length, 0);

  // Notatka opisuje inny plik (inna suma kontrolna) – plik z archiwum nie jest jej plikiem.
  const changed = JSON.parse(JSON.stringify(backup));
  const note = changed.data.notes.find((item) => item.lessonID === lesson.id);
  note.files[0].crc = (note.files[0].crc + 1) >>> 0;
  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, changed);
  const report = await restoreMedia(fresh, archive.blob);
  assert.deepEqual(report, { images: 2, files: 1, present: 0, unmatched: 0, damaged: 1, missing: 1 });
  assert.deepEqual(await fresh.missingMedia(), { images: 0, files: 1, size: 500 });
});

test('plik obrazów i załączników: notatki bez plików na urządzeniu nie psują zapisu; obcy ZIP i nie-ZIP – czytelny błąd', async () => {
  const { library } = await libraryWithMedia();
  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, JSON.parse(JSON.stringify(await createBackup(library, 'test'))));
  const empty = await createMediaArchive(fresh, 'test');
  assert.deepEqual({ images: empty.images, files: empty.files, missing: empty.missing }, { images: 0, files: 0, missing: 4 });

  const foreign = new Blob([await createZip([{ name: 'a.txt', data: new TextEncoder().encode('x') }])]);
  await assert.rejects(restoreMedia(fresh, foreign), /To nie jest plik obrazów i załączników LexiCards/);
  await assert.rejects(restoreMedia(fresh, new Blob(['{"format":"lexicards-backup"}'])), /To nie jest plik obrazów i załączników/);
  const newer = new ZipWriter();
  await newer.add({ name: MEDIA_MANIFEST, data: new TextEncoder().encode('{"format":"lexicards-media","formatVersion":9,"items":[]}') });
  await assert.rejects(restoreMedia(fresh, newer.finish()), /nowszej wersji aplikacji/);
});

test('ZIP kawałkami: zapis plik po pliku do Bloba i odczyt bez wczytywania całości (z kompresją i bez)', async () => {
  const writer = new ZipWriter({ date: new Date(2026, 9, 19, 12, 0, 0) });
  const text = new TextEncoder().encode('Zażółć gęślą jaźń. '.repeat(200));
  const binary = attachment('a.bin', 5, 70000).bytes;
  await writer.add({ name: 'tekst/ąę.txt', data: text });
  await writer.add({ name: 'dane.bin', data: binary, stored: true });
  await writer.add({ name: 'pusty', data: new Uint8Array(0) });
  const blob = writer.finish();
  const zip = await openZipBlob(blob);
  assert.deepEqual([...zip.entries.keys()], ['tekst/ąę.txt', 'dane.bin', 'pusty']);
  assert.ok(zip.entries.get('tekst/ąę.txt').compressedSize < text.byteLength, 'tekst skompresowany');
  assert.equal(zip.entries.get('dane.bin').compressedSize, binary.byteLength, 'bez kompresji');
  assert.deepEqual(await zip.read(zip.entries.get('tekst/ąę.txt')), text);
  assert.deepEqual(await zip.read(zip.entries.get('dane.bin')), binary);
  assert.equal((await zip.read(zip.entries.get('pusty'))).byteLength, 0);
  await assert.rejects(openZipBlob(new Blob(['krótki'])), /To nie jest archiwum ZIP/);
});

// ---------------------------------------------------------------- cofnięcie usunięcia (1.9)

test('cofnięcie usunięcia: lekcja wraca z pojęciami, postępami, dziennikami, notatką, obrazami i załącznikami', async () => {
  const { library, adapter, lesson, module } = await libraryWithMedia();
  const term = await library.createTerm({ termPL: 'bilans', termEN: 'balance sheet' }, lesson.id);
  const progress = { id: 'p1', termID: term.id, lessonID: lesson.id, moduleID: lesson.moduleID, domainID: lesson.domainID, direction: 'pl_en', reviewCount: 1 };
  await adapter.commit({
    puts: { progress: [progress], assessments: [{ id: 'a1', termID: term.id, direction: 'pl_en', assessedAt: '2026-10-01T10:00:00.000Z' }],
      reviews: [{ id: 'r1', termID: term.id, direction: 'pl_en' }], quizAnswers: [{ id: 'q1', termID: term.id, isCorrect: true }] },
    deletes: {}, purgeTermIDs: [], clear: []
  });
  library.maps.progress.set(progress.id, progress);
  const before = await adapter.readStore('noteFiles');

  const copy = await library.deleteWithUndo({ kind: 'lesson', id: lesson.id });
  assert.equal(library.getLesson(lesson.id), null);
  assert.equal((await adapter.readStore('noteFiles')).length, 0);
  assert.equal((await adapter.readStore('assessments')).length, 0);

  await library.restoreDeleted(copy);
  assert.equal(library.getLesson(lesson.id).moduleID, module.id);
  assert.equal(library.getTerm(term.id).termPL, 'bilans');
  assert.ok(library.maps.progress.has('p1'));
  for (const store of ['assessments', 'reviews', 'quizAnswers']) assert.equal((await adapter.readStore(store)).length, 1, store);
  assert.equal(library.getNote(lesson.id).files.length, 2);
  assert.equal((await library.noteImages(lesson.id)).length, 2);
  const after = await adapter.readStore('noteFiles');
  assert.deepEqual(after.map((record) => [record.id, record.size]).sort(), before.map((record) => [record.id, record.size]).sort());
  assert.deepEqual(await library.missingMedia(), { images: 0, files: 0, size: 0 });

  // Drugi raz – już przywrócone.
  await assert.rejects(library.restoreDeleted(copy), /już przywrócone/);
});

test('cofnięcie usunięcia: pojęcia wracają do lekcji; nie da się, gdy zniknął element nadrzędny', async () => {
  const { library, lesson, module } = await libraryWithMedia();
  const first = await library.createTerm({ termPL: 'aktywa', termEN: 'assets' }, lesson.id);
  const second = await library.createTerm({ termPL: 'pasywa', termEN: 'liabilities' }, lesson.id);
  const copy = await library.deleteWithUndo({ kind: 'terms', ids: [first.id, second.id] });
  assert.equal(library.listTerms(lesson.id).length, 0);
  await library.restoreDeleted(copy);
  assert.deepEqual(library.listTerms(lesson.id).map((term) => term.termPL), ['aktywa', 'pasywa']);

  const lessonCopy = await library.deleteWithUndo({ kind: 'lesson', id: lesson.id });
  await library.delete({ kind: 'module', id: module.id });
  await assert.rejects(library.restoreDeleted(lessonCopy), /został w międzyczasie usunięty/);
  assert.equal(library.getLesson(lesson.id), null);
});
