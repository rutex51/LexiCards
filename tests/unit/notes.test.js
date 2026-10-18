// Notatki lekcji: format treści, obrazy, zapis w bibliotece, kopia zapasowa, arkusze XLSX, import i eksport.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createBackup, validateBackup } from '../../js/core/backup.js';
import { buildExportFile, buildTemplateFile } from '../../js/core/exporter.js';
import { imageInfo } from '../../js/core/images.js';
import { deletionMessage } from '../../js/core/messages.js';
import { NOTE_IMAGE_LIMIT } from '../../js/core/model.js';
import {
  docFromHtml, docFromRichText, htmlFromDoc, nearestNoteColor, normalizeNoteHtml, noteText, portableNoteHtml, richTextFromDoc
} from '../../js/core/note-format.js';
import { analyzeNotesHeader, buildNoteRows, classifyTable } from '../../js/core/note-import.js';
import { openTableFile } from '../../js/core/tablefile.js';
import { createWorkbook, openWorkbook } from '../../js/core/xlsx.js';
import { addTerm, makeBranch, makeLibrary } from './helpers.js';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

/** Najmniejszy poprawny nagłówek PNG o podanych wymiarach (wystarcza do rozpoznania i zapisu). */
function png(width, height, seed = 0) {
  const bytes = new Uint8Array(40);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[39] = seed;
  return bytes;
}

const image = (seed = 0) => ({ bytes: png(30, 20, seed), type: 'image/png', width: 30, height: 20, name: `obraz-${seed}.png` });

async function fixture(name) {
  return openTableFile(new Uint8Array(await readFile(path.join(FIXTURES, name))));
}

// ---------------------------------------------------------------- format treści

test('HTML notatki: zostają tylko bezpieczne znaczniki i formatowanie', () => {
  const html = normalizeNoteHtml(
    '<p onclick="x()">Tekst <b>gruby</b>, <i>kursywa</i>, <u>podkreślenie</u>, <s>skreślenie</s>, H<sub>2</sub>O, x<sup>2</sup></p>'
    + '<script>alert(1)</script><style>p{color:red}</style><img src="x" onerror="alert(1)">'
    + '<a href="javascript:alert(1)">zły</a> <a href="https://example.com/a?b=1&c=2">dobry</a>'
  );
  assert.equal(html,
    '<p>Tekst <strong>gruby</strong>, <em>kursywa</em>, <u>podkreślenie</u>, <s>skreślenie</s>, H<sub>2</sub>O, x<sup>2</sup></p>'
    + '<p>zły <a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">dobry</a></p>');
  assert.equal(normalizeNoteHtml(html), html, 'normalizacja jest idempotentna');
  assert.doesNotMatch(html, /script|onerror|onclick|javascript|<img/);
});

test('HTML z Google Docs, Worda i tabeli z Excela', () => {
  const docs = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700">Pogrubione</span><span style="font-style:italic"> kursywą</span></p>'
    + '<ul><li dir="ltr"><p dir="ltr"><span>punkt</span></p></li></ul></b>';
  assert.equal(normalizeNoteHtml(docs), '<p><strong>Pogrubione</strong> <em>kursywą</em></p><ul><li>punkt</li></ul>');

  const word = "<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·<span style='font:7.0pt'>&nbsp;&nbsp; </span></span><![endif]>pierwszy</p>"
    + "<p class=MsoListParagraphCxSpLast style='mso-list:l0 level2 lfo1'><![if !supportLists]><span>o<span>&nbsp; </span></span><![endif]>drugi poziom</p>"
    + '<p class=MsoNormal>Zwykły akapit<o:p></o:p></p>';
  assert.equal(normalizeNoteHtml(word), '<ul><li>pierwszy<ul><li>drugi poziom</li></ul></li></ul><p>Zwykły akapit</p>');

  const table = '<table><tr><td>bilans</td><td>balance sheet</td></tr><tr><td>aktywa</td><td>assets</td></tr></table>';
  assert.equal(normalizeNoteHtml(table), '<p>bilans – balance sheet</p><p>aktywa – assets</p>');
});

test('kolory: z palety zostają (także z edytora), kolory stron WWW znikają', () => {
  assert.equal(
    normalizeNoteHtml('<p><font color="#d70015">a</font> <span style="color: rgb(36, 138, 61)">b</span> <span style="color:#333">c</span> <span data-color="blue">d</span> <span data-color="evil">e</span></p>'),
    '<p><span data-color="red">a</span> <span data-color="green">b</span> c <span data-color="blue">d</span> e</p>'
  );
  assert.equal(nearestNoteColor('#FF0000'), 'red');
  assert.equal(nearestNoteColor('#ffc000'), 'orange');
  assert.equal(nearestNoteColor('#70ad47'), 'green');
  assert.equal(nearestNoteColor('#4472c4'), 'blue');
  assert.equal(nearestNoteColor('#7030a0'), 'purple');
  assert.equal(nearestNoteColor('#000000'), null);
  assert.equal(nearestNoteColor('#808080'), null);
  assert.match(portableNoteHtml('<p><span data-color="red">x</span></p>'), /style="color:#d70015"/);
});

test('listy zagnieżdżone i nagłówki; zwykły tekst notatki', () => {
  const html = normalizeNoteHtml('<h1>Tytuł</h1><ol><li>jeden<ul><li>a</li><li>b</li></ul></li><li>dwa</li></ol><p>Koniec<br>drugi wiersz</p>');
  assert.equal(html, '<h3>Tytuł</h3><ol><li>jeden<ul><li>a</li><li>b</li></ul></li><li>dwa</li></ol><p>Koniec<br>drugi wiersz</p>');
  assert.equal(noteText(html), 'Tytuł\n\n1. jeden\n    • a\n    • b\n2. dwa\n\nKoniec\ndrugi wiersz');
  assert.equal(normalizeNoteHtml('<p> </p><p><br></p>'), '');
});

test('tekst sformatowany komórki: listy, nagłówki, akapity, **pogrubienie** i *kursywa*', () => {
  const doc = docFromRichText([
    { text: 'Nagłówek', b: true, size: 14 },
    { text: '\nZwykły ', size: 11 },
    { text: 'czerwony', color: '#ff0000', size: 11 },
    { text: '\ndrugi wiersz akapitu\n\n• punkt\n  - podpunkt\n1) numer\n# Też nagłówek\n**gruby** i *kursywa*, ale 5*3*2 bez zmian\no czym mowa\n§ 5 ust. 1', size: 11 }
  ]);
  assert.equal(htmlFromDoc(doc),
    '<h3>Nagłówek</h3><p>Zwykły <span data-color="red">czerwony</span><br>drugi wiersz akapitu</p>'
    + '<ul><li>punkt<ul><li>podpunkt</li></ul></li></ul><ol><li>numer</li></ol><h3>Też nagłówek</h3>'
    + '<p><strong>gruby</strong> i <em>kursywa</em>, ale 5*3*2 bez zmian<br>o czym mowa<br>§ 5 ust. 1</p>');
});

test('dokument → tekst sformatowany komórki → dokument daje to samo', () => {
  const html = '<h3>Bilans</h3><p><strong>Aktywa</strong> i <em>pasywa</em><br>drugi wiersz</p><p>Drugi akapit z <span data-color="blue">kolorem</span></p>'
    + '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul><ol><li>jeden</li><li>dwa</li></ol>';
  const runs = richTextFromDoc(docFromHtml(html));
  assert.ok(runs.some((run) => run.size === 13 && run.b), 'nagłówek jest większy i pogrubiony');
  assert.ok(runs.some((run) => run.color === '#0040dd'));
  const back = htmlFromDoc(docFromRichText(runs.map((run) => ({ ...run, size: run.size ?? 11 }))));
  assert.equal(back, html);
});

// ---------------------------------------------------------------- obrazy

test('rozpoznawanie obrazów po zawartości: format i wymiary', () => {
  assert.deepEqual(imageInfo(png(640, 360)), { type: 'image/png', width: 640, height: 360 });
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x10, 0x00, 0, 0, 0]);
  assert.deepEqual(imageInfo(gif), { type: 'image/gif', width: 32, height: 16 });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x78, 0x00, 0xa0, 0x03]);
  assert.deepEqual(imageInfo(jpeg), { type: 'image/jpeg', width: 160, height: 120 });
  const emf = new Uint8Array(48);
  new DataView(emf.buffer).setUint32(0, 1, true);
  emf.set([0x20, 0x45, 0x4d, 0x46], 40);
  assert.equal(imageInfo(emf).type, 'image/emf');
  assert.equal(imageInfo(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])).type, 'image/heic');
  assert.equal(imageInfo(new TextEncoder().encode('to nie obraz, tylko tekst')).type, null);
});

// ---------------------------------------------------------------- biblioteka

test('notatka lekcji: zapis tekstu i obrazów, odczyt obrazów, zmiana kolejności i usuwanie obrazu', async () => {
  const { library, adapter } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  const note = await library.saveNote(lesson.id, { html: '<p>Notatka <b>ważna</b></p><script>x</script>', images: [image(1), image(2)] });
  assert.equal(note.html, '<p>Notatka <strong>ważna</strong></p>');
  assert.equal(note.images.length, 2);
  assert.equal(library.getNote(lesson.id).images[0].width, 30);
  const loaded = await library.noteImages(lesson.id);
  assert.deepEqual(loaded.map((item) => new Uint8Array(item.bytes)[39]), [1, 2]);

  // Zostaje drugi obraz (przeniesiony na początek), pierwszy znika z bazy, dochodzi trzeci.
  const [first, second] = note.images;
  const changed = await library.saveNote(lesson.id, { html: note.html, images: [{ id: second.id }, image(3)] });
  assert.equal(changed.images[0].id, second.id);
  assert.equal(changed.images.length, 2);
  const stored = await adapter.readStore('noteImages');
  assert.equal(stored.length, 2);
  assert.ok(!stored.some((record) => record.id === first.id));
  assert.equal(library.noteCount(), 1);

  // Notatka bez treści i obrazów znika.
  assert.equal(await library.saveNote(lesson.id, { html: '<p> </p>', images: [] }), null);
  assert.equal(library.getNote(lesson.id), null);
  assert.equal((await adapter.readStore('noteImages')).length, 0);
});

test('notatka: limit obrazów i błędny obraz nie zmieniają biblioteki', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  const many = Array.from({ length: NOTE_IMAGE_LIMIT + 1 }, (_, index) => image(index));
  await assert.rejects(library.saveNote(lesson.id, { html: '<p>x</p>', images: many }), /najwyżej 30 obrazów/);
  await assert.rejects(library.saveNote(lesson.id, { html: '<p>x</p>', images: [{ bytes: new Uint8Array(0), type: 'image/png' }] }), /pusty albo uszkodzony/);
  assert.equal(library.getNote(lesson.id), null);
  await assert.rejects(library.saveNote('brak', { html: '<p>x</p>' }), /Nie znaleziono lekcji/);
});

test('usunięcie lekcji, modułu albo dziedziny usuwa notatki i obrazy; ostrzeżenie o tym mówi', async () => {
  const { library, adapter } = await makeLibrary();
  const { lesson, module, domain } = await makeBranch(library);
  const other = await library.createLesson({ name: 'Druga' }, { existing: module.id });
  await library.saveNote(lesson.id, { html: '<p>a</p>', images: [image(1)] });
  await library.saveNote(other.id, { html: '<p>b</p>', images: [image(2)] });

  const impact = library.deletionImpact({ kind: 'module', id: module.id });
  assert.equal(impact.notes, 2);
  assert.match(deletionMessage({ kind: 'module' }, impact), /2 notatki do lekcji/);
  assert.match(deletionMessage({ kind: 'lesson' }, library.deletionImpact({ kind: 'lesson', id: lesson.id })), /notatka lekcji/);

  await library.delete({ kind: 'lesson', id: lesson.id });
  assert.equal(library.getNote(lesson.id), null);
  assert.equal((await adapter.readStore('noteImages')).length, 1);
  await library.delete({ kind: 'domain', id: domain.id });
  assert.equal(library.noteCount(), 0);
  assert.equal((await adapter.readStore('noteImages')).length, 0);
});

test('kopia lekcji ma kopię notatki z własnymi obrazami; usunięcie wszystkiego czyści notatki', async () => {
  const { library, adapter } = await makeLibrary();
  const { lesson, module } = await makeBranch(library);
  await library.saveNote(lesson.id, { html: '<p>oryginał</p>', images: [image(5)] });
  const copy = await library.copyLesson(lesson.id, module.id);
  const copied = library.getNote(copy.id);
  assert.equal(copied.html, '<p>oryginał</p>');
  assert.notEqual(copied.images[0].id, library.getNote(lesson.id).images[0].id);
  assert.equal(new Uint8Array((await library.noteImages(copy.id))[0].bytes)[39], 5);
  // Zmiana kopii nie rusza oryginału.
  await library.saveNote(copy.id, { html: '<p>kopia</p>', images: [] });
  assert.equal(library.getNote(lesson.id).images.length, 1);

  await library.deleteAllContent();
  assert.equal(library.noteCount(), 0);
  assert.equal((await adapter.readStore('noteImages')).length, 0);
});

test('kopia zapasowa przenosi notatki z obrazami (Base64 w JSON) i odrzuca osierocone obrazy', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  await library.saveNote(lesson.id, { html: '<p>z kopii</p>', images: [image(7)] });
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  assert.equal(backup.formatVersion, 2);
  assert.equal(typeof backup.data.noteImages[0].data, 'string');
  assert.equal(backup.data.noteImages[0].bytes, undefined);

  backup.data.noteImages.push({ id: 'sierota', lessonID: 'x', type: 'image/png', data: backup.data.noteImages[0].data });
  backup.data.notes[0].html += '<script>zły()</script>';
  const result = validateBackup(backup);
  assert.equal(result.counts.notes, 1);
  assert.equal(result.counts.noteImages, 1);
  assert.equal(result.dropped, 1);
  assert.equal(result.data.notes[0].html, '<p>z kopii</p>');

  const { library: restored } = await makeLibrary();
  await restored.replaceAll(result.data);
  const images = await restored.noteImages(lesson.id);
  assert.equal(new Uint8Array(images[0].bytes)[39], 7);

  // Kopia z wersji 1.0 (bez notatek) nadal się przywraca.
  const old = { ...backup, formatVersion: 1, data: { ...backup.data } };
  delete old.data.notes;
  delete old.data.noteImages;
  assert.equal(validateBackup(old).counts.notes, 0);
});

// ---------------------------------------------------------------- arkusze XLSX

test('XLSX: zapis kilku arkuszy z tekstem sformatowanym i obrazami, odczyt z powrotem', async () => {
  const bytes = await createWorkbook({
    sheets: [
      { name: 'Pojęcia', header: ['Term PL', 'Term EN'], rows: [['bilans', 'balance sheet']] },
      {
        name: 'Notatki',
        header: ['Domain', 'Module', 'Lesson', 'Note', 'Image'],
        rows: [['D', 'M', 'L', { runs: [{ text: 'Tytuł', b: true, size: 13 }, { text: '\nczerwony', color: '#d70015' }] }, null], ['D', 'M', 'L', null, null]],
        images: [{ ...image(1), row: 1, column: 4 }, { ...image(2), row: 2, column: 4 }]
      }
    ]
  });
  const book = await openWorkbook(bytes);
  assert.deepEqual(book.sheets.map((sheet) => sheet.name), ['Pojęcia', 'Notatki']);
  const plain = await book.readSheet(1);
  assert.equal(plain.rows[1].cells[3], 'Tytuł\nczerwony');
  assert.equal(plain.images, undefined, 'bez trybu rich nie ma obrazów');
  const rich = await book.readSheet(1, { rich: true });
  assert.deepEqual(rich.rows[1].rich[3].map((run) => [run.text, run.b, run.color, run.size]), [['Tytuł', true, null, 13], ['\nczerwony', false, '#d70015', 11]]);
  assert.deepEqual(rich.images.map((item) => [item.row, item.column, item.type, item.bytes[39]]), [[2, 4, 'image/png', 1], [3, 4, 'image/png', 2]]);
});

test('XLSX z openpyxl i z LibreOffice: formatowanie fragmentów i obrazy zakotwiczone przy komórkach', async () => {
  for (const name of ['openpyxl-notes.xlsx', 'libreoffice-notes.xlsx']) {
    const source = await fixture(name);
    const table = await source.readSheet(1, { rich: true });
    assert.equal(classifyTable(table, source.sheets[1].name), 'notes', name);
    assert.equal(classifyTable(await source.readSheet(0), source.sheets[0].name), 'terms', name);
    const { mapping } = analyzeNotesHeader(table);
    assert.deepEqual(mapping, { domain: 0, module: 1, lesson: 2, text: 3, image: 4 }, name);
    const built = buildNoteRows({ table, mapping });
    assert.equal(built.counts.notes, 2, name);
    assert.deepEqual(built.issues, [], name);
    const [statements, investments] = built.notes;
    assert.equal(statements.lesson, 'Financial Statements');
    assert.equal(statements.html,
      '<h3>Bilans</h3><p>Zestawienie <em>aktywów</em> i <u>pasywów</u>.</p><ul><li>Aktywa = Pasywa</li><li><span data-color="red">zobowiązania</span> i kapitał</li></ul>', name);
    // Drugi obraz jest w wierszu bez nazw – należy do tej samej lekcji.
    assert.deepEqual(statements.images.map((item) => item.type), ['image/png', 'image/jpeg'], name);
    assert.equal(investments.html, '<p>Akcje i <strong>obligacje</strong> to <em>papiery wartościowe</em>.</p><ol><li>akcje</li><li>obligacje</li></ol>', name);
  }
});

test('XLSX z obrazami „w komórce” (Excel 365): łańcuch metadata → richData → plik obrazu', async () => {
  const source = await fixture('excel-cell-images.xlsx');
  const table = await source.readSheet(0, { rich: true });
  assert.deepEqual(table.images.map((item) => [item.row, item.column, item.type, item.inCell]), [[2, 4, 'image/png', true], [3, 4, 'image/jpeg', true]]);
  const built = buildNoteRows({ table, mapping: analyzeNotesHeader(table).mapping });
  assert.equal(built.notes.length, 1);
  assert.equal(built.notes[0].lesson, 'Probes');
  assert.equal(built.notes[0].images.length, 2);
});

// ---------------------------------------------------------------- import notatek

const table = (rows, images = []) => ({
  rows: rows.map((cells, index) => ({ number: index + 1, cells })),
  columnCount: Math.max(...rows.map((cells) => cells.length)),
  images
});

test('rozpoznanie arkusza notatek: nagłówki, nazwa arkusza, arkusz pojęć z kolumną Notes', () => {
  assert.equal(classifyTable(table([['Domain', 'Module', 'Lesson', 'Note', 'Image']])), 'notes');
  assert.equal(classifyTable(table([['Lekcja', 'Treść']])), 'notes');
  assert.equal(classifyTable(table([['Notatka']]), 'Notatki'), 'notes');
  assert.equal(classifyTable(table([['Notatka']]), 'Arkusz1'), 'terms');
  assert.equal(classifyTable(table([['Term PL', 'Term EN', 'Notes'], ['a', 'b', 'c']])), 'terms');
  assert.equal(classifyTable(table([['Lesson', 'Pojęcie', 'Notes']])), 'terms', 'kolumna pojęcia to nie arkusz notatek');
  assert.equal(classifyTable(table([['To nie są dane do importu']]), 'Notatki'), 'terms');
  assert.equal(classifyTable(table([])), 'empty');
});

test('wiersze notatek: grupowanie po lekcji, przejmowanie nazw z góry, obrazy, błędy i ostrzeżenia', () => {
  const emf = new Uint8Array(48);
  const rows = [
    ['Domain', 'Module', 'Lesson', 'Note', 'Image'],
    ['BE', 'Finance', 'Ratios', 'Pierwszy akapit'],
    ['', '', '', 'Drugi akapit'],
    ['', '', 'Statements', 'Inna lekcja'],
    ['', 'Other', '', 'Moduł się zmienił, lekcji brak'],
    ['BE', 'Finance', 'Ratios', 'Powrót do pierwszej lekcji']
  ];
  const images = [
    { row: 1, column: 4, bytes: png(1, 1), type: 'image/png' },
    { row: 3, column: 4, bytes: png(1, 1, 3), type: 'image/png' },
    { row: 4, column: 4, bytes: emf, type: 'image/emf' },
    { row: null, column: null, bytes: png(1, 1), type: 'image/png' }
  ];
  const built = buildNoteRows({ table: table(rows, images), mapping: { domain: 0, module: 1, lesson: 2, text: 3, image: 4 } });
  assert.equal(built.notes.length, 2);
  assert.equal(built.notes[0].lesson, 'Ratios');
  assert.deepEqual(built.notes[0].numbers, [2, 3, 6]);
  assert.equal(built.notes[0].html, '<p>Pierwszy akapit</p><p>Drugi akapit</p><p>Powrót do pierwszej lekcji</p>');
  assert.equal(built.notes[0].images.length, 1, 'obraz z wiersza 3 należy do wiersza 3 (Ratios)');
  assert.equal(built.notes[1].lesson, 'Statements');
  assert.equal(built.counts.rejected, 1);
  const messages = built.issues.map((issue) => `${issue.number}:${issue.severity}:${issue.message}`);
  assert.ok(messages.some((text) => text.startsWith('5:error:brak nazwy lekcji')), messages.join('\n'));
  assert.ok(messages.some((text) => text.startsWith('1:warning:obraz (kolumna E) nad pierwszym wierszem')), messages.join('\n'));
  assert.ok(messages.some((text) => /EMF nie może być wyświetlony/.test(text)), messages.join('\n'));
  assert.ok(messages.some((text) => /bez zakotwiczenia/.test(text)), messages.join('\n'));

  const noLesson = buildNoteRows({ table: table([['Note'], ['x']]), mapping: { text: 0 } });
  assert.match(noLesson.issues[0].message, /nie ma kolumny z nazwą lekcji/);
  const target = buildNoteRows({ table: table([['Note'], ['x'], ['y']]), mapping: { text: 0 }, target: { lessonID: 'L' } });
  assert.deepEqual(target.notes.map((note) => [note.lessonID, note.html]), [['L', '<p>x</p><p>y</p>']]);
});

test('import notatek razem z pojęciami: nowe lekcje, istniejące notatki, nazwy niejednoznaczne i brakujące', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library, { domain: 'BE', module: 'Finance', lesson: 'Ratios' });
  await library.createLesson({ name: 'Ratios' }, { create: { name: 'Other' }, domain: { create: { name: 'X' } } });
  await library.saveNote(lesson.id, { html: '<p>stara</p>', images: [image(1)] });

  const rows = [{ domain: 'BE', module: 'Finance', lesson: 'New lesson', term: { termPL: 'a', termEN: 'b' } }];
  const notes = [
    { domain: 'BE', module: 'Finance', lesson: 'New lesson', html: '<p>do nowej lekcji z pojęć</p>', images: [image(2)] },
    { domain: 'BE', module: 'Finance', lesson: 'Ratios', html: '<p>nowa</p>', images: [] },
    { domain: '', module: '', lesson: 'Ratios', html: '<p>?</p>', images: [] },
    { domain: '', module: '', lesson: 'Brak', html: '<p>?</p>', images: [] },
    { domain: 'BE', module: 'Finance', lesson: 'Only notes', html: '<p>tworzy lekcję</p>', images: [] }
  ];
  const plan = library.planImport(rows, { notes });
  assert.deepEqual(plan.notes.statuses, ['added', 'replaced', 'ambiguousLesson', 'missingLesson', 'added']);
  assert.equal(plan.notes.existing, 1);
  assert.deepEqual(plan.created.lessons, ['BE › Finance › New lesson', 'BE › Finance › Only notes']);
  assert.equal(library.getNote(lesson.id).html, '<p>stara</p>', 'plan niczego nie zmienia');

  assert.deepEqual(library.planImport(rows, { notes, noteMode: 'skip' }).notes.statuses.slice(0, 2), ['added', 'skipped']);
  assert.deepEqual(library.planImport(rows, { notes, noteMode: 'append' }).notes.statuses.slice(0, 2), ['added', 'appended']);

  const report = await library.importRows(rows, { notes, noteMode: 'append' });
  assert.equal(report.notes.added, 2);
  assert.equal(report.notes.appended, 1);
  assert.equal(report.notes.failed, 2);
  const newLesson = library.findLesson('New lesson', lesson.moduleID);
  assert.equal(library.listTerms(newLesson.id).length, 1);
  assert.equal(library.getNote(newLesson.id).images.length, 1);
  const appended = library.getNote(lesson.id);
  assert.equal(appended.html, '<p>stara</p><p>nowa</p>');
  assert.equal(appended.images.length, 1, 'dopisanie zostawia istniejące obrazy');

  // Ten sam plik drugi raz z zastępowaniem: notatki są takie same – bez zmian.
  const again = library.planImport([], { notes: [notes[0], notes[4]] });
  assert.deepEqual(again.notes.statuses, ['unchanged', 'unchanged']);
});

test('eksport do XLSX ma arkusz notatek z formatowaniem i obrazami, który import odtwarza', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  await addTerm(library, lesson, 'bilans', 'balance sheet');
  const html = '<h3>Bilans</h3><p><strong>Aktywa</strong> = <em>pasywa</em></p><ul><li>punkt <span data-color="green">zielony</span></li></ul>';
  await library.saveNote(lesson.id, { html, images: [image(1), image(2)] });

  const exported = await buildExportFile(library, { kind: 'lesson', id: lesson.id }, 'xlsx');
  assert.equal(exported.notes, 1);
  assert.equal(exported.images, 2);
  const source = await openTableFile(exported.bytes);
  assert.deepEqual(source.sheets.map((sheet) => sheet.name), ['Pojęcia', 'Notatki']);
  const notesTable = await source.readSheet(1, { rich: true });
  assert.equal(classifyTable(notesTable, 'Notatki'), 'notes');
  const built = buildNoteRows({ table: notesTable, mapping: analyzeNotesHeader(notesTable).mapping });
  assert.equal(built.notes.length, 1);
  assert.equal(built.notes[0].html, html);
  assert.equal(built.notes[0].images.length, 2);
  // Import do tej samej biblioteki: notatka bez zmian (ten sam tekst i te same obrazy).
  const plan = library.planImport([], { notes: built.notes });
  assert.deepEqual(plan.notes.statuses, ['unchanged']);

  const withoutNotes = await buildExportFile(library, { kind: 'lesson', id: lesson.id }, 'xlsx', new Date(), { notes: false });
  assert.deepEqual((await openTableFile(withoutNotes.bytes)).sheets.map((sheet) => sheet.name), ['Pojęcia']);
  const csv = await buildExportFile(library, { kind: 'lesson', id: lesson.id }, 'csv');
  assert.equal(csv.notes, 0);
});

test('wzór importu: arkusz pojęć i arkusz notatek z formatowaniem i obrazem', async () => {
  const template = await buildTemplateFile('xlsx');
  const source = await openTableFile(template.bytes);
  assert.deepEqual(source.sheets.map((sheet) => sheet.name), ['Pojęcia', 'Notatki']);
  const notes = await source.readSheet(1, { rich: true });
  const built = buildNoteRows({ table: notes, mapping: analyzeNotesHeader(notes).mapping });
  assert.equal(built.notes.length, 1);
  assert.match(built.notes[0].html, /^<h3>Bilans – najważniejsze<\/h3><p><strong>Bilans<\/strong> \(<em>balance sheet<\/em>\)/);
  assert.match(built.notes[0].html, /<span data-color="green">kapitał własny<\/span>/);
  assert.equal(built.notes[0].images[0].type, 'image/png');
  assert.deepEqual(imageInfo(built.notes[0].images[0].bytes), { type: 'image/png', width: 640, height: 360 });
});
