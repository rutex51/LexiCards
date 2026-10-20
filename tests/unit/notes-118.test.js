// Notatki 1.18: wcięcie akapitu (Tab), własny kolor tekstu, wielkość tekstu, indeksy z edytora;
// zapis w arkuszu (tabulatory, rozmiar czcionki); podpisy obrazów z numeracją „Rys. N.”
// (kolejność podglądu, zapis, kopia zapasowa, eksport i import arkusza).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBackup, validateBackup } from '../../js/core/backup.js';
import { buildExportFile } from '../../js/core/exporter.js';
import { analyzeNotesHeader, buildNoteRows, guessNoteField } from '../../js/core/note-import.js';
import {
  MAX_INDENT, NOTE_SIZES, docFromHtml, docFromRichText, editorNoteHtml, normalizeNoteHtml, noteText, portableNoteHtml, richTextFromDoc
} from '../../js/core/note-format.js';
import { cleanImageCaption, figureCaption, figureNumbers } from '../../js/core/note-refs.js';
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
const image = (seed, label = null, caption = null) => ({ bytes: png(seed), type: 'image/png', width: 30, height: 20, name: `obraz-${seed}.png`, label, caption });

test('notatka 1.18: wcięcie, własny kolor, wielkość tekstu i indeksy z edytora; HTML dla edytora, zwykły tekst, schowek', () => {
  const editor = '<blockquote style="margin: 0 0 0 40px; border: none; padding: 0px;"><blockquote><p>Wcięty</p></blockquote></blockquote>'
    + '<p><font color="#12ab34">zielony</font> <font size="5">duży</font> <font size="2">mały</font> x<sup>2</sup> H<sub>2</sub>O</p>';
  const saved = normalizeNoteHtml(editor, { editor: true });
  assert.equal(saved, '<p data-indent="2">Wcięty</p><p><span data-color="#12ab34" style="--note-color: #12ab34">zielony</span> '
    + '<span data-size="l">duży</span> <span data-size="s">mały</span> x<sup>2</sup> H<sub>2</sub>O</p>');
  assert.equal(normalizeNoteHtml(saved), saved, 'zapisany HTML się nie zmienia');
  // Poza edytorem (wklejanie) kolory spoza palety i wielkości z <font> znikają; kolory stron WWW – też.
  assert.equal(normalizeNoteHtml('<p><font color="#12ab34" size="6">a</font> <span style="color:#12ab34">b</span></p>'), '<p>a b</p>');
  // „Bez koloru” w kolorowym fragmencie zdejmuje kolor; wielkość „Średnia” (3) w dużym – zwykła.
  assert.equal(normalizeNoteHtml('<p><span data-color="red">a<font color="#010101">b</font></span> <span data-size="xl">c<font size="3">d</font></span></p>', { editor: true }),
    '<p><span data-color="red">a</span>b <span data-size="xl">c</span>d</p>');
  assert.equal(docFromHtml('<blockquote>'.repeat(6) + '<p>x</p>' + '</blockquote>'.repeat(6)).blocks[0].indent, MAX_INDENT, 'najwyżej cztery stopnie');
  assert.equal(normalizeNoteHtml('<h3 data-indent="1">Nagłówek</h3>'), '<h3 data-indent="1">Nagłówek</h3>');
  assert.equal(editorNoteHtml('<p data-indent="2">x</p><h3 data-indent="1">y</h3>'), '<blockquote><blockquote><p>x</p></blockquote></blockquote><blockquote><h3>y</h3></blockquote>');
  assert.equal(normalizeNoteHtml(editorNoteHtml(saved), { editor: true }), saved, 'edytor → zapis bez zmian');
  assert.equal(noteText('<p data-indent="2">Wcięty<br>drugi</p>'), '        Wcięty\n        drugi');
  assert.equal(portableNoteHtml(saved), '<p style="margin-left:4em">Wcięty</p><p><span data-color="#12ab34" style="color:#12ab34">zielony</span> '
    + '<span style="font-size:1.25em">duży</span> <span style="font-size:0.85em">mały</span> x<sup>2</sup> H<sub>2</sub>O</p>');
  assert.equal(normalizeNoteHtml(portableNoteHtml(saved)).includes('data-color="#12ab34"'), true, 'po wklejeniu w notatce kolor zostaje');
  assert.deepEqual(NOTE_SIZES.map((size) => size.label), ['Mała', 'Średnia', 'Duża', 'Bardzo duża']);
});

test('notatka 1.18 w arkuszu: wcięcie tabulatorami, rozmiar czcionki, własny kolor (przy imporcie – najbliższy z palety)', () => {
  const doc = docFromHtml('<p data-indent="1">Akapit</p><p><span data-size="l">Duży</span> zwykły <span data-color="#12ab34">kolor</span></p>');
  const runs = richTextFromDoc(doc);
  assert.equal(runs[0].text, '\tAkapit\n\n');
  assert.deepEqual(runs.find((run) => run.text === 'Duży'), { text: 'Duży', size: 14 });
  assert.equal(runs.find((run) => run.text === 'kolor').color, '#12ab34');
  // Czytnik XLSX podaje rozmiar także zwykłego tekstu (11).
  const back = docFromRichText(runs.map((run) => ({ ...run, size: run.size ?? 11 })));
  assert.equal(back.blocks[0].indent, 1);
  assert.equal(back.blocks[1].runs.find((run) => run.text === 'Duży').size, 'l');
  assert.equal(back.blocks[1].runs.find((run) => run.text.includes('kolor')).color, 'green');
  // Tabulator w środku akapitu (wiersz od tabulatora) zaczyna wcięty akapit.
  const lines = docFromRichText([{ text: 'Pierwszy\n\t\tWcięty\ndalej', size: 11 }]);
  assert.deepEqual(lines.blocks.map((block) => [block.type, block.indent ?? 0]), [['p', 0], ['p', 2]]);
  assert.equal(lines.blocks[1].runs[0].text, 'Wcięty\ndalej');
});

test('podpisy obrazów 1.18: czyszczenie, „Rys. N.” w kolejności podglądu (odwołania i obrazy przed albo po tekście)', () => {
  assert.equal(cleanImageCaption('  Wyniki   sprzedaży  '), 'Wyniki sprzedaży');
  assert.equal(cleanImageCaption('x'.repeat(200)).length, 120);
  assert.equal(figureCaption('Wyniki sprzedaży', 2, true), 'Rys. 2. Wyniki sprzedaży');
  assert.equal(figureCaption('', 3, true), 'Rys. 3.');
  assert.equal(figureCaption('Wyniki', 2, false), 'Wyniki');
  assert.equal(figureCaption(null, 2, false), null);
  const images = [{ label: 'A' }, { label: 'B' }, { label: 'C' }];
  const html = '<p>Tekst</p><p>[[C]]</p><p>Dalej</p><p>[[A]]</p><p>[[C]]</p>';
  assert.deepEqual(figureNumbers(html, images, false), [2, 3, 1], 'C pierwsze w tekście, A drugie, B po tekście');
  assert.deepEqual(figureNumbers(html, images, true), [3, 1, 2], 'B (bez odwołania) przed tekstem');
  assert.deepEqual(figureNumbers('<p>bez odwołań</p>', images, false), [1, 2, 3]);
});

test('podpisy i numeracja 1.18: zapis w notatce, zmiana i usunięcie podpisu, kopia zapasowa, eksport i import arkusza', async () => {
  const { library } = await makeLibrary();
  const { lesson, domain, module } = await makeBranch(library, { domain: 'BE', module: 'Finance', lesson: 'Ratios' });
  await library.saveNote(lesson.id, { html: '<p>PL</p>', images: [image(1, 'Wykres', '  Wyniki   sprzedaży '), image(2)], numberFigures: true });
  let note = library.getNote(lesson.id);
  assert.equal(note.numberFigures, true);
  assert.deepEqual(note.images.map((meta) => meta.caption ?? null), ['Wyniki sprzedaży', null]);
  // Istniejący obraz: bez pola caption podpis zostaje, pusty – usuwa; zapis bez numberFigures zostawia wybór.
  await library.saveNote(lesson.id, { html: '<p>PL</p>', images: [{ id: note.images[0].id }, { id: note.images[1].id, caption: 'Schemat' }] });
  note = library.getNote(lesson.id);
  assert.deepEqual([note.images.map((meta) => meta.caption ?? null), note.numberFigures], [['Wyniki sprzedaży', 'Schemat'], true]);
  await library.saveNote(lesson.id, { html: '<p>PL</p>', images: [{ id: note.images[0].id, caption: '' }, { id: note.images[1].id }], numberFigures: false });
  note = library.getNote(lesson.id);
  assert.deepEqual([note.images.map((meta) => meta.caption ?? null), note.numberFigures], [[null, 'Schemat'], false]);
  await library.saveNote(lesson.id, { html: '<p>PL</p>', images: [{ id: note.images[0].id, caption: 'Wyniki' }, { id: note.images[1].id }], numberFigures: true });

  // Kopia zapasowa.
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const restored = validateBackup(backup).data.notes.find((item) => item.lessonID === lesson.id);
  assert.equal(restored.numberFigures, true);
  assert.deepEqual(restored.images.map((meta) => meta.caption ?? null), ['Wyniki', 'Schemat']);

  // Arkusz: kolumna Image caption; import odtwarza podpisy.
  const file = await buildExportFile(library, { level: 'lesson', id: lesson.id }, 'xlsx');
  const book = await openWorkbook(file.bytes);
  const sheet = await book.readSheet(1, { rich: true });
  assert.deepEqual(sheet.rows.slice(1).map((row) => row.cells[7]), ['Wyniki', 'Schemat']);
  const { mapping } = analyzeNotesHeader(sheet);
  assert.equal(mapping.imageCaption, 7);
  const built = buildNoteRows({ table: sheet, mapping });
  assert.deepEqual(built.notes[0].images.map((item) => [item.label, item.caption]), [['Wykres', 'Wyniki'], ['Obraz 1', 'Schemat']]);
  await library.importRows([], { notes: [{ domain: domain.name, module: module.name, lesson: lesson.name, html: '<p>PL</p>', images: built.notes[0].images.map((item) => ({ ...item, caption: `${item.caption}!` })) }] });
  assert.deepEqual(library.getNote(lesson.id).images.map((meta) => meta.caption), ['Wyniki!', 'Schemat!'], 'zmienione podpisy – notatka zastąpiona');
  assert.deepEqual(['Image caption', 'Podpis obrazu', 'Podpis', 'Image label', 'Sygnatura', 'Opis'].map(guessNoteField), ['imageCaption', 'imageCaption', 'imageCaption', 'imageLabel', 'imageLabel', null]);
});
