// Notatki 1.29: usunięcie odwołań do usuniętego obiektu, obrazy i tabele ukryte w notatce (oczko) –
// zapis, kopia zapasowa, podgląd (treść do pokazania), słuchanie i eksport do arkusza.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBackup, validateBackup } from '../../js/core/backup.js';
import { buildExportFile } from '../../js/core/exporter.js';
import { noteSteps } from '../../js/core/listen.js';
import { removeReferences } from '../../js/core/note-refs.js';
import { cleanNoteTables, visibleNoteContent } from '../../js/core/tables.js';
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
const image = (seed, label = null, extra = {}) => ({ bytes: png(seed), type: 'image/png', width: 30, height: 20, name: `obraz-${seed}.png`, label, ...extra });
const table = (label, extra = {}) => ({ label, rows: [['a', 'b'], ['1', '2']], align: ['left', 'left'], header: true, ...extra });

test('notatki 1.29: usunięcie obiektu usuwa jego odwołania – wielkość liter bez znaczenia, nowa strona nie zostaje na brzegu', () => {
  const html = '<p>Tekst</p><p>[[Schemat]]</p><p>Zobacz [[Schemat]] obok.</p><hr data-page=""><p>[[ schemat ]]</p><p>[[Tabela 1]]</p>';
  assert.equal(removeReferences(html, 'Schemat'), '<p>Tekst</p><p>Zobacz [[Schemat]] obok.</p><hr data-page=""><p>[[Tabela 1]]</p>',
    'tylko linijki z samym odwołaniem; tekst z sygnaturą w zdaniu zostaje');
  assert.equal(removeReferences(html, ['schemat', 'TABELA 1']), '<p>Tekst</p><p>Zobacz [[Schemat]] obok.</p>', 'nowa strona na końcu znika');
  assert.equal(removeReferences('<p>[[A]]</p><hr data-page=""><p>B</p>', 'A'), '<p>B</p>', 'nowa strona na początku znika');
  assert.equal(removeReferences(html, 'Inny'), html, 'bez odwołań – ta sama treść');
  assert.equal(removeReferences('', 'A'), '');
});

test('notatki 1.29: treść do pokazania – ukryte obrazy i tabele pominięte z odwołaniami, sygnatury domyślne się nie przesuwają', () => {
  const content = visibleNoteContent({
    html: '<p>Start</p><p>[[Obraz 1]]</p><p>[[Obraz 2]]</p><p>[[Koszty]]</p><p>[[Tabela 1]]</p>',
    images: [{ id: 'a', label: null, hidden: true }, { id: 'b', label: null }],
    tables: [table('Koszty', { hidden: true }), table(null)]
  });
  assert.equal(content.html, '<p>Start</p><p>[[Obraz 2]]</p><p>[[Tabela 1]]</p>');
  assert.deepEqual(content.images.map((item) => [item.id, item.label]), [['b', 'Obraz 2']], 'drugi obraz zostaje „Obraz 2”');
  assert.deepEqual(content.tables.map((item) => item.label), ['Tabela 1'], 'tabela bez sygnatury – pierwsza wolna');
  const plain = visibleNoteContent({ html: '<p>[[Obraz 1]]</p>', images: [{ id: 'a' }], tables: [] });
  assert.equal(plain.html, '<p>[[Obraz 1]]</p>', 'nic ukrytego – treść bez zmian');
  // Tabela ukryta zostaje w obiektach notatki (zapis, kopia), bez pola – widoczna.
  assert.deepEqual(cleanNoteTables([table('A', { hidden: true }), table('B', { hidden: 'tak' })]).map((item) => item.hidden ?? false), [true, false]);
});

test('notatki 1.29: zapis ukrycia obrazu i tabeli; bez pola – zostaje, false – zdejmuje; kopia zapasowa', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  await library.saveNote(lesson.id, {
    html: '<p>PL</p><p>[[Wykres]]</p>', images: [image(1, 'Wykres', { hidden: true }), image(2, 'Zdjęcie')], tables: [table('Koszty', { hidden: true })]
  });
  let note = library.getNote(lesson.id);
  assert.deepEqual(note.images.map((meta) => [meta.label, meta.hidden ?? false]), [['Wykres', true], ['Zdjęcie', false]]);
  assert.equal(note.tables[0].hidden, true);
  await library.saveNote(lesson.id, { html: '<p>PL</p>', images: [{ id: note.images[0].id }, { id: note.images[1].id, hidden: true }] });
  note = library.getNote(lesson.id);
  assert.deepEqual(note.images.map((meta) => meta.hidden ?? false), [true, true], 'bez pola – zostaje, true – ukrywa');
  await library.saveNote(lesson.id, { html: '<p>PL</p>', images: [{ id: note.images[0].id, hidden: false }, { id: note.images[1].id }] });
  note = library.getNote(lesson.id);
  assert.deepEqual(note.images.map((meta) => meta.hidden ?? false), [false, true]);
  assert.equal('hidden' in note.images[0], false, 'widoczny – bez pola');
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const restored = validateBackup(backup).data.notes.find((item) => item.lessonID === lesson.id);
  assert.deepEqual(restored.images.map((meta) => meta.hidden ?? false), [false, true]);
  assert.equal(restored.tables[0].hidden, true);
});

test('notatki 1.29: słuchanie i eksport do arkusza pomijają ukryte tabele i obrazy', async () => {
  const note = { html: '<p>Koszty:</p><p>[[Koszty]]</p><p>Koniec.</p>', htmlEN: '', tables: [table('Koszty', { hidden: true })] };
  assert.deepEqual(noteSteps(note, 'X', 'pl').map((step) => step.text), ['Notatka do lekcji X.', 'Koszty:', 'Koniec.']);
  const shown = noteSteps({ ...note, tables: [table('Koszty')] }, 'X', 'pl').map((step) => step.text);
  assert.ok(shown.some((text) => text.includes('a, b')), `widoczna tabela czytana: ${shown.join(' | ')}`);

  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  await library.saveNote(lesson.id, {
    html: '<p>PL</p><p>[[Ukryty]]</p><p>[[Koszty]]</p>', images: [image(1, 'Ukryty', { hidden: true }), image(2, 'Widoczny')], tables: [table('Koszty', { hidden: true })]
  });
  const file = await buildExportFile(library, { level: 'lesson', id: lesson.id }, 'xlsx');
  const sheet = await (await openWorkbook(file.bytes)).readSheet(1, { rich: true });
  const rows = sheet.rows.slice(1);
  assert.equal(rows.length, 1, 'jeden wiersz obrazu – widocznego');
  const cells = rows[0].cells.map((cell) => (typeof cell === 'string' ? cell : JSON.stringify(cell)));
  assert.ok(cells.some((cell) => cell.includes('Widoczny')), cells.join(' | '));
  assert.ok(!cells.some((cell) => cell.includes('Ukryty') || cell.includes('Koszty') || cell.includes('a | b')), cells.join(' | '));
});
