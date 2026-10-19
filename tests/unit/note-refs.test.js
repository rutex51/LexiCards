// Sygnatury obrazów notatki, odwołania [[sygnatura]] i wersja angielska notatki (wersja 1.6):
// pomocnicze funkcje, zapis w bibliotece, kopia zapasowa, arkusz notatek (Note EN, Image label).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBackup, validateBackup } from '../../js/core/backup.js';
import { buildExportFile } from '../../js/core/exporter.js';
import { analyzeNotesHeader, buildNoteRows, classifyTable } from '../../js/core/note-import.js';
import {
  cleanImageLabel, findImageByLabel, labelKey, referenceLabel, referenceToken, referencedLabels, renameReferences, withImageLabels
} from '../../js/core/note-refs.js';
import { openWorkbook } from '../../js/core/xlsx.js';
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

const table = (rows, images = []) => ({
  rows: rows.map((cells, index) => ({ number: index + 1, cells })),
  columnCount: Math.max(...rows.map((cells) => cells.length)),
  images
});

test('sygnatury: czyszczenie, porównanie bez wielkości liter i polskich znaków, odwołanie w osobnej linijce', () => {
  assert.equal(cleanImageLabel('  Wykres  [główny] '), 'Wykres główny');
  assert.equal(cleanImageLabel('x'.repeat(60)).length, 40);
  assert.equal(labelKey('Wykres Główny'), labelKey('wykres glowny'));
  assert.equal(referenceToken(' Obraz  1 '), '[[Obraz 1]]');
  assert.equal(referenceLabel('[[ Schemat bilansu ]]'), 'Schemat bilansu');
  assert.equal(referenceLabel('  [[Obraz 2]]  '), 'Obraz 2');
  assert.equal(referenceLabel('Zobacz [[Obraz 2]] poniżej'), null, 'odwołanie tylko jako cała linijka');
  assert.equal(referenceLabel('[[ ]]'), null);
  assert.equal(referenceLabel('[[a]] [[b]]'), null);
});

test('sygnatury: brakujące i powtórzone dostają kolejną wolną „Obraz N”, istniejące zostają', () => {
  const labeled = withImageLabels([{ label: 'Obraz 2' }, { label: null }, { label: 'obraz 2' }, { label: 'Schemat' }, {}]);
  assert.deepEqual(labeled.map((item) => item.label), ['Obraz 2', 'Obraz 1', 'Obraz 3', 'Schemat', 'Obraz 4']);
  assert.equal(findImageByLabel(labeled, 'SCHEMAT'), 3);
  assert.equal(findImageByLabel(labeled, 'Brak'), -1);
});

test('odwołania w treści: lista sygnatur i zmiana sygnatury w odwołaniach', () => {
  const html = '<p>Tekst</p><p>[[Obraz 1]]</p><p>[[ obraz 1 ]]</p><p>Zobacz [[Obraz 1]]</p><p><strong>[[Schemat]]</strong></p>';
  assert.deepEqual(referencedLabels(html), ['Obraz 1', 'obraz 1', 'Schemat']);
  assert.equal(renameReferences(html, 'Obraz 1', 'Wykres'),
    '<p>Tekst</p><p>[[Wykres]]</p><p>[[Wykres]]</p><p>Zobacz [[Obraz 1]]</p><p><strong>[[Schemat]]</strong></p>');
  assert.equal(renameReferences('<p>Bez odwołań</p>', 'Obraz 1', 'X'), '<p>Bez odwołań</p>');
});

test('notatka: wersja angielska i sygnatury w bibliotece – zapis, zapis bez pól, kopia lekcji, notatka tylko po angielsku', async () => {
  const { library } = await makeLibrary();
  const { lesson, module } = await makeBranch(library);
  const note = await library.saveNote(lesson.id, {
    html: '<p>PL</p><p>[[Schemat]]</p>', htmlEN: '<p>EN</p><script>x</script>', images: [image(1, 'Schemat'), image(2)]
  });
  assert.equal(note.htmlEN, '<p>EN</p>');
  assert.deepEqual(note.images.map((item) => item.label), ['Schemat', 'Obraz 1']);
  // Zapis bez htmlEN i bez sygnatur (np. import bez kolumn) zostawia wersję angielską i sygnatury.
  await library.saveNote(lesson.id, { html: '<p>nowy</p>', images: note.images.map((item) => ({ id: item.id })) });
  assert.equal(library.getNote(lesson.id).htmlEN, '<p>EN</p>');
  assert.deepEqual(library.getNote(lesson.id).images.map((item) => item.label), ['Schemat', 'Obraz 1']);
  // Zmiana sygnatury istniejącego obrazu.
  const kept = library.getNote(lesson.id).images;
  await library.saveNote(lesson.id, { html: '<p>nowy</p>', images: [{ id: kept[1].id, label: 'Wykres' }, { id: kept[0].id }] });
  assert.deepEqual(library.getNote(lesson.id).images.map((item) => item.label), ['Wykres', 'Schemat']);

  const copy = await library.copyLesson(lesson.id, module.id);
  assert.equal(library.getNote(copy.id).htmlEN, '<p>EN</p>');
  assert.deepEqual(library.getNote(copy.id).images.map((item) => item.label), ['Wykres', 'Schemat']);

  // Notatka może mieć samą wersję angielską; bez obu wersji i obrazów – znika.
  const onlyEN = await library.saveNote(lesson.id, { html: '', htmlEN: '<p>only EN</p>', images: [] });
  assert.equal(onlyEN.html, '');
  assert.equal(onlyEN.htmlEN, '<p>only EN</p>');
  assert.equal(await library.saveNote(lesson.id, { html: '', htmlEN: '', images: [] }), null);
});

test('kopia zapasowa: wersja angielska, sygnatury i notatka tylko po angielsku wracają; stara kopia bez nich dostaje „Obraz N”', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  await library.saveNote(lesson.id, { html: '', htmlEN: '<p>EN</p>', images: [image(3, 'Schemat'), image(4)] });
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const result = validateBackup(backup);
  assert.equal(result.data.notes[0].htmlEN, '<p>EN</p>');
  assert.deepEqual(result.data.notes[0].images.map((item) => item.label), ['Schemat', 'Obraz 1']);

  for (const meta of backup.data.notes[0].images) delete meta.label;
  delete backup.data.notes[0].htmlEN;
  backup.data.notes[0].html = '<p>stara</p>';
  const old = validateBackup(backup);
  assert.equal(old.data.notes[0].htmlEN, '');
  assert.deepEqual(old.data.notes[0].images.map((item) => item.label), ['Obraz 1', 'Obraz 2']);
});

test('arkusz notatek: kolumny Note EN i Image label – rozpoznanie, wiersze, sygnatury z wiersza obrazu', () => {
  const header = ['Domain', 'Module', 'Lesson', 'Note', 'Note EN', 'Image', 'Image label'];
  assert.equal(classifyTable(table([header])), 'notes', 'Note EN nie wygląda na kolumnę pojęcia');
  assert.deepEqual(analyzeNotesHeader(table([header])).mapping, { domain: 0, module: 1, lesson: 2, text: 3, textEN: 4, image: 5, imageLabel: 6 });
  assert.deepEqual(analyzeNotesHeader(table([['Lekcja', 'Notatka po angielsku', 'Notatka', 'Obraz', 'Sygnatura']])).mapping,
    { lesson: 0, textEN: 1, text: 2, image: 3, imageLabel: 4 });

  const rows = [
    header,
    ['BE', 'Finance', 'Ratios', 'Tekst\n[[Wykres]]', 'Text', null, 'Wykres'],
    ['', '', '', null, null, null, null],
    ['BE', 'Finance', 'Statements', 'Bez angielskiego', '', null, '']
  ];
  const images = [
    { row: 2, column: 5, bytes: png(1), type: 'image/png' },
    { row: 3, column: 5, bytes: png(2), type: 'image/png' },
    { row: 4, column: 5, bytes: png(3), type: 'image/png' }
  ];
  const built = buildNoteRows({ table: table(rows, images), mapping: analyzeNotesHeader(table(rows)).mapping });
  assert.equal(built.notes.length, 2);
  assert.equal(built.notes[0].html, '<p>Tekst</p><p>[[Wykres]]</p>');
  assert.equal(built.notes[0].htmlEN, '<p>Text</p>');
  assert.deepEqual(built.notes[0].images.map((item) => item.label), ['Wykres', null]);
  assert.equal(built.notes[1].htmlEN, '');

  // Stary arkusz bez Note EN: notatka nie ma pola htmlEN (biblioteka zostawi istniejącą wersję angielską).
  const old = [['Domain', 'Module', 'Lesson', 'Note', 'Image'], ['BE', 'Finance', 'Ratios', 'Tekst']];
  const oldBuilt = buildNoteRows({ table: table(old), mapping: analyzeNotesHeader(table(old)).mapping });
  assert.equal('htmlEN' in oldBuilt.notes[0], false);
});

test('eksport XLSX: Note EN i Image label; import zastępujący bez kolumny Note EN zostawia wersję angielską', async () => {
  const { library } = await makeLibrary();
  const { lesson, domain, module } = await makeBranch(library, { domain: 'BE', module: 'Finance', lesson: 'Ratios' });
  await library.saveNote(lesson.id, { html: '<p>PL</p>', htmlEN: '<p>EN</p>', images: [image(5, 'Wykres'), image(6)] });
  const file = await buildExportFile(library, { level: 'lesson', id: lesson.id }, 'xlsx');
  const book = await openWorkbook(file.bytes);
  const notes = await book.readSheet(1, { rich: true });
  assert.deepEqual(notes.rows[0].cells, ['Domain', 'Module', 'Lesson', 'Note', 'Note EN', 'Image', 'Image label']);
  assert.deepEqual(notes.rows.slice(1).map((row) => [row.cells[3], row.cells[4], row.cells[6]]), [['PL', 'EN', 'Wykres'], ['', '', 'Obraz 1']]);
  assert.deepEqual(notes.images.map((item) => [item.row, item.column]), [[2, 5], [3, 5]]);

  await library.importRows([], { notes: [{ domain: domain.name, module: module.name, lesson: lesson.name, html: '<p>nowy PL</p>', images: [] }] });
  assert.equal(library.getNote(lesson.id).html, '<p>nowy PL</p>');
  assert.equal(library.getNote(lesson.id).htmlEN, '<p>EN</p>', 'arkusz bez Note EN nie usuwa wersji angielskiej');
  await library.importRows([], { notes: [{ domain: domain.name, module: module.name, lesson: lesson.name, html: '<p>nowy PL</p>', htmlEN: '<p>new EN</p>', images: [] }] });
  assert.equal(library.getNote(lesson.id).htmlEN, '<p>new EN</p>');
});
