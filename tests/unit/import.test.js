// Logika importu i eksportu: nagłówki, wiersze, walidacja, plan, duplikaty, pliki eksportu.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeText, parseCsv, writeCsv } from '../../js/core/csv.js';
import {
  EXPORT_HEADER, buildExportFile, buildTemplateFile, collectExportRows, exportFileName
} from '../../js/core/exporter.js';
import {
  IMPORT_FIELDS, analyzeHeader, buildImportRows, columnLetter, describeColumns, guessField, missingForImport
} from '../../js/core/importer.js';
import { installSampleData } from '../../js/core/samples.js';
import { openTableFile } from '../../js/core/tablefile.js';
import { addLearningData, addTerm, historyCounts, makeBranch, makeLibrary } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = async (name) => new Uint8Array(await readFile(path.join(ROOT, 'tests/fixtures', name)));
const table = (lines) => ({
  rows: lines.map((cells, index) => ({ number: index + 1, cells })),
  columnCount: Math.max(0, ...lines.map((cells) => cells.length))
});
const FROM_FILE = { useFileStructure: true, domain: '', module: '', lesson: '' };

// ---------------------------------------------------------------- nagłówki

test('rozpoznawanie nagłówków po angielsku i po polsku', () => {
  const cases = {
    'Domain': 'domain', 'Dziedzina': 'domain', 'Kategoria': 'domain',
    'Module': 'module', 'Moduł': 'module',
    'Lesson': 'lesson', 'Lekcja': 'lesson', 'Nazwa lekcji': 'lesson', 'Temat': 'lesson',
    'Term PL': 'termPL', 'Term EN': 'termEN', 'term_pl': 'termPL', 'TERM (EN)': 'termEN',
    'Pojęcie PL': 'termPL', 'Pojęcie po polsku': 'termPL', 'Termin angielski': 'termEN', 'Hasło EN': 'termEN',
    'Polski': 'termPL', 'Angielski': 'termEN', 'PL': 'termPL', 'EN': 'termEN',
    'English': 'termEN', 'Polish': 'termPL', 'Język polski': 'termPL', 'Słowo po angielsku': 'termEN',
    'Description PL': 'descriptionPL', 'Description EN': 'descriptionEN',
    'Opis PL': 'descriptionPL', 'Opis po angielsku': 'descriptionEN',
    'Definicja (polski)': 'descriptionPL', 'English definition': 'descriptionEN', 'Znaczenie PL': 'descriptionPL',
    'Example PL': 'examplePL', 'Example EN': 'exampleEN',
    'Przykład PL': 'examplePL', 'Przykład po angielsku': 'exampleEN', 'Zdanie EN': 'exampleEN',
    'Przykład użycia terminu PL': 'examplePL',
    'Tags': 'tags', 'Tagi': 'tags', 'Difficulty': 'difficulty', 'Trudność': 'difficulty', 'Poziom': 'difficulty',
    'Notes': 'notes', 'Notatki': 'notes', 'Uwagi': 'notes'
  };
  for (const [header, expected] of Object.entries(cases)) {
    assert.equal(guessField(header), expected, `nagłówek „${header}”`);
  }
  // Niejednoznaczne albo obce nagłówki zostają do ręcznego przypisania.
  for (const header of ['Term', 'Definicja', 'Example', 'Lp.', 'ID', '', '   ', 'bilans', 'Data dodania']) {
    assert.equal(guessField(header), null, `nagłówek „${header}”`);
  }
});

test('każde pole importu jest rozpoznawane po własnym nagłówku eksportu', () => {
  assert.deepEqual(EXPORT_HEADER.map(guessField), IMPORT_FIELDS.map((field) => field.id));
});

test('analiza pierwszego wiersza: nagłówki, brak nagłówków, powtórzone kolumny', () => {
  const withHeader = analyzeHeader(table([['Lekcja', 'Polski', 'Angielski', 'Lp.', 'Opis PL'], ['L1', 'a', 'b', '1', 'x']]));
  assert.equal(withHeader.hasHeader, true);
  assert.deepEqual(withHeader.mapping, { lesson: 0, termPL: 1, termEN: 2, descriptionPL: 4 });

  // Bez nagłówków: dwie pierwsze kolumny to pojęcie PL i EN.
  const noHeader = analyzeHeader(table([['bilans', 'balance sheet', 'opis'], ['aktywa', 'assets']]));
  assert.deepEqual(noHeader, { hasHeader: false, mapping: { termPL: 0, termEN: 1 } });

  // Nagłówki bez języka („Term”, „Definicja”): to wciąż wiersz nagłówków, tylko do ręcznego przypisania.
  const vague = analyzeHeader(table([['Term', 'Translation', 'Definicja'], ['a', 'b', 'c']]));
  assert.deepEqual(vague, { hasHeader: true, mapping: {} });

  // Dwie kolumny pasujące do tego samego pola: wygrywa pierwsza.
  const repeated = analyzeHeader(table([['PL', 'EN', 'Polski'], ['a', 'b', 'c']]));
  assert.deepEqual(repeated.mapping, { termPL: 0, termEN: 1 });

  assert.deepEqual(analyzeHeader(table([])), { hasHeader: false, mapping: {} });
});

test('opisy kolumn do list wyboru', () => {
  const data = table([['Polski', '', 'Opis'], ['bilans', 'balance sheet', 'x']]);
  assert.deepEqual(describeColumns(data, true).map((column) => column.label), ['A: Polski', 'B (np. balance sheet)', 'C: Opis']);
  assert.deepEqual(describeColumns(data, false).map((column) => column.label), ['A (np. Polski)', 'B', 'C (np. Opis)']);
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(columnLetter), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});

// ---------------------------------------------------------------- wiersze i walidacja

test('wiersze importu: struktura z pliku, pola opcjonalne, numery wierszy', () => {
  const data = table([
    ['Domain', 'Module', 'Lesson', 'Term PL', 'Term EN', 'Description PL', 'Tags', 'Difficulty', 'Notes'],
    ['  Prawo ', 'Spółki', 'Organy', ' zarząd  spółki ', 'management board', '  Opis\nw dwóch wierszach  ', 'prawo; spółki, PRAWO', '3', ''],
    ['Prawo', 'Spółki', 'Organy', 'rada nadzorcza', 'supervisory board', '', '', '', 'notatka']
  ]);
  const { mapping } = analyzeHeader(data);
  const result = buildImportRows({ table: data, hasHeader: true, mapping, destination: FROM_FILE });

  assert.deepEqual(result.counts, { data: 2, valid: 2, rejected: 0, warnings: 0, filledDown: 0, structureOnly: 0 });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.rows[0], {
    number: 2, domain: 'Prawo', module: 'Spółki', lesson: 'Organy',
    term: {
      termPL: 'zarząd spółki', termEN: 'management board',
      descriptionPL: 'Opis\nw dwóch wierszach', notes: '', tags: ['prawo', 'spółki'], difficulty: 3
    }
  });
  assert.deepEqual(result.rows[1].term, {
    termPL: 'rada nadzorcza', termEN: 'supervisory board', descriptionPL: '', notes: 'notatka', tags: [], difficulty: null
  });
});

test('wiersze importu: błędy i ostrzeżenia wskazują numer wiersza', () => {
  const data = table([
    ['Lekcja', 'Polski', 'Angielski', 'Trudność'],
    ['L1', 'dobre', 'good', '2'],
    ['L1', 'bez tłumaczenia', '', ''],
    ['L1', '', 'no polish', ''],
    ['L1', 'zła trudność', 'bad difficulty', 'wysoka'],
    ['L1', 'ułamek', 'fraction', '2,5'],
    ['L1', 'za dużo', 'too much', '6']
  ]);
  const { mapping } = analyzeHeader(data);
  const result = buildImportRows({
    table: data, hasHeader: true, mapping,
    destination: { useFileStructure: true, domain: 'Dziedzina', module: 'Moduł', lesson: '' }
  });
  assert.deepEqual(result.counts, { data: 6, valid: 4, rejected: 2, warnings: 3, filledDown: 0, structureOnly: 0 });
  assert.deepEqual(result.issues, [
    { number: 3, severity: 'error', message: 'brak pojęcia po angielsku' },
    { number: 4, severity: 'error', message: 'brak pojęcia po polsku' },
    { number: 5, severity: 'warning', message: 'trudność „wysoka” nie jest liczbą od 1 do 5 – pominięto ją' },
    { number: 6, severity: 'warning', message: 'trudność „2,5” nie jest liczbą od 1 do 5 – pominięto ją' },
    { number: 7, severity: 'warning', message: 'trudność „6” nie jest liczbą od 1 do 5 – pominięto ją' }
  ]);
  assert.deepEqual(result.rows.map((row) => row.number), [2, 5, 6, 7]);
  assert.equal('difficulty' in result.rows[1].term, false);
  // Poziomy bez kolumny w pliku dostają nazwy wskazane w kreatorze.
  assert.deepEqual([result.rows[0].domain, result.rows[0].module, result.rows[0].lesson], ['Dziedzina', 'Moduł', 'L1']);
});

test('puste komórki struktury przejmują wartość z wiersza powyżej (scalone komórki)', async () => {
  for (const name of ['openpyxl-cases.xlsx', 'libreoffice-cases.xlsx']) {
    const file = await openTableFile(await fixture(name));
    const data = await file.readSheet(0);
    const { hasHeader, mapping } = analyzeHeader(data);
    assert.equal(hasHeader, true);
    assert.deepEqual(mapping, { domain: 0, module: 1, lesson: 2, termPL: 3, termEN: 4, descriptionPL: 5, difficulty: 6 });

    const result = buildImportRows({ table: data, hasHeader, mapping, destination: FROM_FILE });
    assert.deepEqual(result.rows.map((row) => [row.number, row.domain, row.module, row.lesson, row.term.termPL]), [
      [2, 'Metrology', 'CMM', 'Probes', 'sonda'],
      [3, 'Metrology', 'CMM', 'Probes', 'trzpień'],
      [4, 'Metrology', 'CMM', 'Accuracy', 'wzorcowanie'],
      [6, 'Metrology', 'GD&T', 'Form', 'płaskość'],
      [7, 'Metrology', 'GD&T', 'Form', 'prostoliniowość'],
      ...(name.startsWith('libreoffice') ? [[8, 'Metrology', 'GD&T', 'Form', 'okrągłość']] : [])
    ], name);
    assert.equal(result.counts.filledDown, 2, name);
    assert.equal(result.rows[1].term.difficulty, 4, name);
    if (name.startsWith('openpyxl')) {
      // Formuła bez zapamiętanego wyniku: brak tłumaczenia jest zgłaszany jako błąd wiersza 8.
      assert.deepEqual(result.issues, [{ number: 8, severity: 'error', message: 'brak pojęcia po angielsku' }]);
    }
  }
});

test('zmiana poziomu wyżej unieważnia przejętą nazwę poziomu niżej', () => {
  const data = table([
    ['Domain', 'Module', 'Lesson', 'PL', 'EN'],
    ['D1', 'M1', 'L1', 'a', 'a'],
    ['', '', '', 'b', 'b'],
    ['D2', '', '', 'c', 'c'],          // nowa dziedzina, ale brak modułu i lekcji
    ['D2', 'M2', '', 'd', 'd'],        // nowy moduł, brak lekcji
    ['', '', 'L2', 'e', 'e'],
    ['Nagłówek grupy', 'M3', 'L3', '', ''],   // sam wiersz grupy, bez pojęcia
    ['', '', '', 'f', 'f']
  ]);
  const { mapping } = analyzeHeader(data);
  const result = buildImportRows({ table: data, hasHeader: true, mapping, destination: FROM_FILE });
  assert.deepEqual(result.rows.map((row) => [row.number, row.domain, row.module, row.lesson]), [
    [2, 'D1', 'M1', 'L1'],
    [3, 'D1', 'M1', 'L1'],
    [6, 'D2', 'M2', 'L2'],
    [8, 'Nagłówek grupy', 'M3', 'L3']
  ]);
  assert.deepEqual(result.issues, [
    { number: 4, severity: 'error', message: 'brak nazwy modułu, brak nazwy lekcji' },
    { number: 5, severity: 'error', message: 'brak nazwy lekcji' }
  ]);
  assert.deepEqual(result.counts, { data: 6, valid: 4, rejected: 2, warnings: 0, filledDown: 3, structureOnly: 1 });
});

test('import do jednej lekcji ignoruje kolumny struktury z pliku', () => {
  const data = table([['Domain', 'Lesson', 'PL', 'EN'], ['Z pliku', 'Też z pliku', 'a', 'b']]);
  const { mapping } = analyzeHeader(data);
  const result = buildImportRows({
    table: data, hasHeader: true, mapping,
    destination: { useFileStructure: false, domain: 'Moja dziedzina', module: 'Mój moduł', lesson: 'Moja lekcja' }
  });
  assert.deepEqual(result.rows, [
    { number: 2, domain: 'Moja dziedzina', module: 'Mój moduł', lesson: 'Moja lekcja', term: { termPL: 'a', termEN: 'b' } }
  ]);
});

test('plik bez nagłówków: pierwszy wiersz jest danymi', async () => {
  const file = await openTableFile(await fixture('no-header.csv'));
  const data = file.read();
  const { hasHeader, mapping } = analyzeHeader(data);
  assert.equal(hasHeader, false);
  const result = buildImportRows({
    table: data, hasHeader, mapping,
    destination: { useFileStructure: true, domain: 'D', module: 'M', lesson: 'L' }
  });
  assert.deepEqual(result.rows.map((row) => [row.number, row.term.termPL, row.term.termEN]), [
    [1, 'bilans', 'balance sheet'], [2, 'aktywa', 'assets'], [3, 'pasywa', 'liabilities']
  ]);
});

test('braki, które blokują przejście dalej w kreatorze', () => {
  assert.deepEqual(missingForImport({}, null), [
    'Przypisz kolumnę z pojęciem po polsku.', 'Przypisz kolumnę z pojęciem po angielsku.'
  ]);
  assert.deepEqual(missingForImport({ termPL: 0, termEN: 0 }, null), [
    'Pojęcie po polsku i po angielsku nie mogą pochodzić z tej samej kolumny.'
  ]);
  assert.deepEqual(missingForImport({ termPL: 0, termEN: 1, lesson: 2 }, { useFileStructure: true, domain: 'D', module: ' ', lesson: '' }), [
    'Podaj nazwę modułu.'
  ]);
  assert.deepEqual(missingForImport({ termPL: 0, termEN: 1, lesson: 2 }, { useFileStructure: false, domain: 'D', module: 'M', lesson: '' }), [
    'Podaj nazwę lekcji.'
  ]);
  assert.deepEqual(missingForImport({ termPL: 0, termEN: 1 }, { useFileStructure: true, domain: 'D', module: 'M', lesson: 'L' }), []);
});

// ---------------------------------------------------------------- plan i import

test('plan importu zgadza się z wynikiem importu i niczego nie zmienia', async () => {
  const { library, adapter } = await makeLibrary();
  await makeBranch(library, { domain: 'Prawo', module: 'Spółki', lesson: 'Organy' });
  const file = await openTableFile(await fixture('polish-windows-1250.csv'));
  const data = file.read();
  const { hasHeader, mapping } = analyzeHeader(data);
  assert.equal(Object.keys(mapping).length, 12);
  const { rows, issues } = buildImportRows({ table: data, hasHeader, mapping, destination: FROM_FILE });
  assert.deepEqual(issues.map((issue) => [issue.number, issue.severity]), [[4, 'warning']]);

  const before = library.summary();
  const revision = library.revision;
  const plan = library.planImport(rows);
  assert.deepEqual(library.summary(), before);
  assert.equal(library.revision, revision);
  assert.equal(await adapter.count('terms'), 0);

  assert.deepEqual([plan.domains, plan.modules, plan.lessons, plan.added], [0, 1, 2, 4]);
  assert.deepEqual(plan.created, {
    domains: [],
    modules: ['Prawo › Umowy'],
    lessons: ['Prawo › Spółki › Kapitał', 'Prawo › Umowy › Zawarcie']
  });
  assert.deepEqual(plan.statuses, ['added', 'added', 'added', 'added']);
  assert.deepEqual(plan.lessonIDs, []);

  const report = await library.importRows(rows);
  for (const key of ['domains', 'modules', 'lessons', 'added', 'updated', 'unchanged', 'skipped', 'created', 'statuses']) {
    assert.deepEqual(report[key], plan[key], key);
  }
  assert.equal(report.lessonIDs.length, 3);
  assert.deepEqual(library.summary(), { domains: 1, modules: 2, lessons: 3, terms: 4, favorites: 0 });

  const term = library.findTerm('zarząd', 'management board', library.findLesson('Organy', library.findModule('Spółki', library.findDomain('Prawo').id).id).id);
  assert.equal(term.descriptionPL, 'Organ prowadzący sprawy spółki; reprezentuje ją na zewnątrz.');
  assert.equal(term.examplePL, 'Zarząd zatwierdził „plan naprawczy”.');
  assert.deepEqual(term.tags, ['prawo', 'spółki']);
  assert.equal(term.difficulty, 3);
  assert.equal(term.notes, 'źródło: KSH');
});

test('plan z nową dziedziną wymienia wszystko, co powstanie', async () => {
  const { library } = await makeLibrary();
  const rows = [
    { number: 2, domain: 'Nowa', module: 'M1', lesson: 'L1', term: { termPL: 'a', termEN: 'a' } },
    { number: 3, domain: 'nowa', module: 'm1', lesson: 'L2', term: { termPL: 'b', termEN: 'b' } },
    { number: 4, domain: 'NOWA', module: 'M2', lesson: 'L1', term: { termPL: 'c', termEN: 'c' } }
  ];
  const plan = library.planImport(rows);
  assert.deepEqual(plan.created, {
    domains: ['Nowa'],
    modules: ['Nowa › M1', 'Nowa › M2'],
    lessons: ['Nowa › M1 › L1', 'Nowa › M1 › L2', 'Nowa › M2 › L1']
  });
  assert.ok(library.isEmpty());
  // Błędny wiersz w planie jest zgłaszany z numerem wiersza pliku.
  assert.throws(
    () => library.planImport([{ number: 17, domain: 'D', module: 'M', lesson: 'L', term: { termPL: 'x', termEN: '' } }]),
    /Wiersz 17/
  );
});

test('duplikaty: w bibliotece i w pliku, we wszystkich trybach', async () => {
  const setup = async () => {
    const { library, adapter } = await makeLibrary();
    const branch = await makeBranch(library, { domain: 'D', module: 'M', lesson: 'L' });
    await addTerm(library, branch.lesson, 'aktywa', 'assets', { descriptionPL: 'stary opis' });
    return { library, adapter, branch };
  };
  const rows = [
    { number: 2, domain: 'D', module: 'M', lesson: 'L', term: { termPL: 'Aktywa', termEN: 'ASSETS', descriptionPL: 'nowy opis' } },
    { number: 3, domain: 'D', module: 'M', lesson: 'L', term: { termPL: 'bilans', termEN: 'balance sheet' } },
    { number: 4, domain: 'D', module: 'M', lesson: 'L', term: { termPL: 'BILANS', termEN: 'Balance Sheet', descriptionPL: 'powtórka' } },
    { number: 5, domain: 'D', module: 'M', lesson: 'L', term: { termPL: 'aktywa', termEN: 'assets', descriptionPL: 'jeszcze inny' } },
    // To samo pojęcie w innej lekcji nie jest duplikatem.
    { number: 6, domain: 'D', module: 'M', lesson: 'Inna', term: { termPL: 'aktywa', termEN: 'assets' } }
  ];

  const skip = await setup();
  const skipReport = await skip.library.importRows(rows, { duplicates: 'skip' });
  assert.deepEqual(skipReport.statuses, ['skipped', 'added', 'skippedInFile', 'skipped', 'added']);
  assert.deepEqual([skipReport.added, skipReport.updated, skipReport.skipped], [2, 0, 3]);
  assert.deepEqual([skipReport.duplicatesInLibrary, skipReport.duplicatesInFile], [2, 1]);
  assert.equal(skip.library.findTerm('aktywa', 'assets', skip.branch.lesson.id).descriptionPL, 'stary opis');

  const update = await setup();
  const updateReport = await update.library.importRows(rows, { duplicates: 'update' });
  // Drugi wiersz z tym samym pojęciem (wiersz 5) jest już powtórzeniem w pliku.
  assert.deepEqual(updateReport.statuses, ['updated', 'added', 'skippedInFile', 'skippedInFile', 'added']);
  assert.deepEqual([updateReport.added, updateReport.updated, updateReport.skipped], [2, 1, 2]);
  const updatedTerm = update.library.findTerm('aktywa', 'assets', update.branch.lesson.id);
  assert.equal(updatedTerm.descriptionPL, 'nowy opis');
  assert.equal(updatedTerm.termPL, 'Aktywa');
  assert.equal(update.library.summary().terms, 3);

  const add = await setup();
  const addReport = await add.library.importRows(rows, { duplicates: 'add' });
  assert.deepEqual(addReport.statuses, ['addedDuplicate', 'added', 'addedDuplicate', 'addedDuplicate', 'added']);
  assert.equal(add.library.summary().terms, 6);

  // Plan dla każdego trybu przewiduje dokładnie to samo.
  for (const mode of ['skip', 'update', 'add']) {
    const fresh = await setup();
    const plan = fresh.library.planImport(rows, { duplicates: mode });
    const report = await fresh.library.importRows(rows, { duplicates: mode });
    assert.deepEqual(plan.statuses, report.statuses, mode);
  }
});

test('aktualizacja z pliku nie kasuje treści, której plik nie zawiera, i zachowuje postępy', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library, { domain: 'D', module: 'M', lesson: 'L' });
  const original = await addTerm(library, branch.lesson, 'aktywa', 'assets', {
    descriptionPL: 'opis PL', descriptionEN: 'description EN', examplePL: 'przykład',
    tags: ['finanse'], difficulty: 4, notes: 'moje notatki', isFavorite: true
  });
  await addLearningData(library, adapter, original);

  // Plik ma tylko kolumny PL, EN, opis PL (pusty) i przykład EN.
  const rows = [{
    number: 2, domain: 'D', module: 'M', lesson: 'L',
    term: { termPL: 'aktywa', termEN: 'assets', descriptionPL: '', exampleEN: 'new example', tags: [], difficulty: null }
  }];
  const report = await library.importRows(rows, { duplicates: 'update' });
  assert.deepEqual(report.statuses, ['updated']);

  const term = library.getTerm(original.id);
  assert.equal(term.id, original.id);
  assert.equal(term.descriptionPL, 'opis PL', 'pusta komórka nie kasuje opisu');
  assert.equal(term.descriptionEN, 'description EN');
  assert.equal(term.examplePL, 'przykład');
  assert.equal(term.exampleEN, 'new example');
  assert.deepEqual(term.tags, ['finanse']);
  assert.equal(term.difficulty, 4);
  assert.equal(term.notes, 'moje notatki');
  assert.equal(term.isFavorite, true);
  assert.equal(term.createdAt, original.createdAt);
  assert.equal(library.maps.progress.size, 1);
  assert.deepEqual(await historyCounts(adapter), { assessments: 1, reviews: 1, quizAnswers: 1 });

  // Ten sam plik drugi raz: nic się nie zmienia i nic nie jest zapisywane.
  const stamp = library.getTerm(original.id).updatedAt;
  const again = await library.importRows(rows, { duplicates: 'update' });
  assert.deepEqual([again.statuses, again.updated, again.unchanged], [['unchanged'], 0, 1]);
  assert.equal(library.getTerm(original.id).updatedAt, stamp);
});

// ---------------------------------------------------------------- eksport

test('eksport: zakresy i kolejność wierszy', async () => {
  const { library } = await makeLibrary();
  await installSampleData(library);
  const all = collectExportRows(library, { kind: 'all' });
  assert.equal(all.rows.length, 40);
  assert.deepEqual(all.rows[0].slice(0, 5), ['Business English', 'Management', 'Leadership', 'przywództwo', 'leadership']);
  assert.equal(all.rows[0].length, EXPORT_HEADER.length);

  const metrology = library.findDomain('Metrology');
  const domain = collectExportRows(library, { kind: 'domain', id: metrology.id });
  assert.deepEqual([domain.name, domain.rows.length], ['Metrology', 18]);
  assert.ok(domain.rows.every((row) => row[0] === 'Metrology'));

  const finance = library.findModule('Finance', library.findDomain('Business English').id);
  const module = collectExportRows(library, { kind: 'module', id: finance.id });
  assert.deepEqual([module.name, module.rows.length], ['Finance', 8]);

  const lesson = library.findLesson('Investments', finance.id);
  const lessonRows = collectExportRows(library, { kind: 'lesson', id: lesson.id });
  assert.deepEqual(lessonRows.rows.map((row) => row[3]), ['stopa zwrotu', 'dywersyfikacja']);

  const picked = [library.listTerms(lesson.id)[1].id, all.rows.length && library.listTerms(library.listLessons(library.listModules(metrology.id)[0].id)[0].id)[0].id];
  const terms = collectExportRows(library, { kind: 'terms', ids: picked });
  assert.deepEqual(terms.rows.map((row) => row[3]), ['dywersyfikacja', 'współrzędnościowa maszyna pomiarowa']);
  assert.equal(terms.name, 'wybrane pojęcia');

  assert.equal(exportFileName('Żółć & Gęśl: 2026', 'xlsx', new Date(2026, 9, 11)), 'LexiCards-zolc-gesl-2026-2026-10-11.xlsx');
  assert.equal(exportFileName('???', 'csv', new Date(2026, 0, 5)), 'LexiCards-pojecia-2026-01-05.csv');
});

test('eksport i ponowny import odtwarzają bibliotekę (XLSX i CSV)', async () => {
  const { library: source } = await makeLibrary();
  await installSampleData(source);
  const lesson = [...source.maps.lessons.values()][0];
  await source.createTerm({
    termPL: 'test „znaków” <&>', termEN: 'special "characters"; test', descriptionPL: 'Pierwszy wiersz.\nDrugi wiersz.',
    exampleEN: '=not a formula', tags: ['a', 'b c'], difficulty: 5, notes: 'notatka'
  }, lesson.id);
  const expected = collectExportRows(source, { kind: 'all' }).rows;

  for (const format of ['xlsx', 'csv']) {
    const exported = await buildExportFile(source, { kind: 'all' }, format, new Date(2026, 9, 11));
    assert.equal(exported.name, `LexiCards-biblioteka-2026-10-11.${format}`);
    assert.equal(exported.count, 41);

    const file = await openTableFile(exported.bytes);
    assert.equal(file.kind, format);
    const data = format === 'xlsx' ? await file.readSheet(0) : file.read();
    const { hasHeader, mapping } = analyzeHeader(data);
    assert.equal(Object.keys(mapping).length, IMPORT_FIELDS.length, format);
    const { rows, issues } = buildImportRows({ table: data, hasHeader, mapping, destination: FROM_FILE });
    assert.deepEqual(issues, [], format);

    // Do pustej biblioteki: powstaje to samo.
    const { library: target } = await makeLibrary();
    const report = await target.importRows(rows);
    assert.deepEqual([report.domains, report.modules, report.lessons, report.added], [2, 5, 13, 41], format);
    assert.deepEqual(collectExportRows(target, { kind: 'all' }).rows, expected, format);

    // Do biblioteki źródłowej: wszystko jest duplikatem, a aktualizacja niczego nie zmienia.
    assert.equal(source.planImport(rows, { duplicates: 'skip' }).skipped, 41, format);
    const update = source.planImport(rows, { duplicates: 'update' });
    assert.deepEqual([update.updated, update.unchanged, update.added], [0, 41, 0], format);
  }
});

test('eksport pustego zakresu daje plik z samym nagłówkiem; wzór importu jest poprawnym plikiem', async () => {
  const { library } = await makeLibrary();
  const empty = await buildExportFile(library, { kind: 'all' }, 'csv');
  assert.equal(empty.count, 0);
  assert.deepEqual(parseCsv(decodeText(empty.bytes, 'utf-8'), ';').rows.map((row) => row.cells), [[...EXPORT_HEADER]]);

  for (const format of ['xlsx', 'csv']) {
    const template = await buildTemplateFile(format);
    assert.equal(template.name, `LexiCards-wzor-importu.${format}`);
    const file = await openTableFile(template.bytes);
    const data = format === 'xlsx' ? await file.readSheet(0) : file.read();
    const { mapping } = analyzeHeader(data);
    const { rows, issues } = buildImportRows({ table: data, hasHeader: true, mapping, destination: FROM_FILE });
    assert.deepEqual(issues, []);
    assert.deepEqual(rows.map((row) => row.term.termPL), ['bilans', 'aktywa']);
    assert.equal(rows[0].term.difficulty, 2);
  }
});

// ---------------------------------------------------------------- wydajność

test('50 000 pojęć: odczyt CSV, walidacja, plan, import i eksport', async () => {
  const lines = [['Domain', 'Module', 'Lesson', 'Term PL', 'Term EN', 'Description PL', 'Example EN']];
  for (let index = 0; index < 50_000; index += 1) {
    lines.push([
      `Dziedzina ${index % 10}`, `Moduł ${index % 100}`, `Lekcja ${index % 2500}`,
      `pojęcie numer ${index}`, `term number ${index}`,
      `Opis pojęcia ${index}; z separatorem i "cudzysłowem".`, `An example sentence for term ${index}.`
    ]);
  }
  const text = writeCsv(lines);
  const timings = {};
  const measure = async (name, work) => {
    const started = performance.now();
    const result = await work();
    timings[name] = Math.round(performance.now() - started);
    return result;
  };

  const data = await measure('odczyt CSV', () => parseCsv(text, ';'));
  assert.equal(data.rows.length, 50_001);
  const { hasHeader, mapping } = analyzeHeader(data);
  const built = await measure('walidacja', () => buildImportRows({ table: data, hasHeader, mapping, destination: FROM_FILE }));
  assert.equal(built.rows.length, 50_000);

  const { library } = await makeLibrary();
  const plan = await measure('plan', () => library.planImport(built.rows));
  assert.deepEqual([plan.domains, plan.modules, plan.lessons, plan.added], [10, 100, 2500, 50_000]);
  const report = await measure('import', () => library.importRows(built.rows));
  assert.equal(report.added, 50_000);
  assert.equal(library.summary().terms, 50_000);

  const again = await measure('plan duplikatów', () => library.planImport(built.rows, { duplicates: 'update' }));
  assert.equal(again.unchanged, 50_000);

  const exported = await measure('eksport XLSX', () => buildExportFile(library, { kind: 'all' }, 'xlsx'));
  assert.equal(exported.count, 50_000);
  const file = await openTableFile(exported.bytes);
  const sheet = await measure('odczyt XLSX', () => file.readSheet(0));
  assert.equal(sheet.rows.length, 50_001);
  assert.equal(sheet.rows[50_000].cells[3], 'pojęcie numer 49999');

  const total = Object.values(timings).reduce((sum, value) => sum + value, 0);
  console.log(`czasy [ms]: ${JSON.stringify(timings)}, razem ${total}`);
  assert.ok(total < 60_000, `operacje trwały ${total} ms`);
});
