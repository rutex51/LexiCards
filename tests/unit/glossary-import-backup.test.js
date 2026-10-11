import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Library, LibraryError } from '../../js/core/library.js';
import { MemoryAdapter } from '../../js/core/storage.js';
import { BACKUP_FORMAT, backupFileName, createBackup, parseBackupText, restoreBackup, validateBackup } from '../../js/core/backup.js';
import { installSampleData, sampleRows, sampleTermCount } from '../../js/core/samples.js';
import { hasDescription, hasExample, availableElementCount } from '../../js/core/model.js';
import { addLearningData, addTerm, historyCounts, makeBranch, makeLibrary } from './helpers.js';

async function populateGlossary(library) {
  const finance = await makeBranch(library, { domain: 'Business English', module: 'Finance', lesson: 'Ratios' });
  const metrology = await makeBranch(library, { domain: 'Metrology', module: 'CMM', lesson: 'Components' });
  await addTerm(library, finance.lesson, 'Łódź podwodna', 'submarine', { tags: ['transport'] });
  await addTerm(library, finance.lesson, 'aktywa', 'assets', { tags: ['finanse', 'bilans'], isFavorite: true });
  await addTerm(library, finance.lesson, 'marża zysku', 'profit margin', { tags: ['finanse'] });
  await addTerm(library, metrology.lesson, 'sonda skanująca', 'scanning probe', { tags: ['sondy'], isFavorite: true });
  await addTerm(library, metrology.lesson, 'głowica pomiarowa', 'probe head', { tags: ['sondy'] });
  return { finance, metrology };
}

// ---------------------------------------------------------------- glosariusz

test('bez kryteriów zwracane są wszystkie pojęcia alfabetycznie po polsku', async () => {
  const { library } = await makeLibrary();
  await populateGlossary(library);
  const page = library.glossary({}, 0, 50);
  assert.equal(page.total, 5);
  assert.deepEqual(
    page.items.map((term) => term.termPL),
    ['aktywa', 'głowica pomiarowa', 'Łódź podwodna', 'marża zysku', 'sonda skanująca']
  );
});

test('wyszukiwanie działa po polsku i po angielsku, bez znaków diakrytycznych', async () => {
  const { library } = await makeLibrary();
  await populateGlossary(library);
  assert.deepEqual(library.glossary({ searchText: 'lodz' }).items.map((term) => term.termEN), ['submarine']);
  assert.equal(library.glossary({ searchText: 'PROBE' }).total, 2);
  assert.equal(library.glossary({ searchText: 'nie ma takiego' }).total, 0);
});

test('filtry zakresu: dziedzina, moduł, lekcja', async () => {
  const { library } = await makeLibrary();
  const data = await populateGlossary(library);
  assert.equal(library.glossary({ scope: { kind: 'domain', id: data.finance.domain.id } }).total, 3);
  assert.equal(library.glossary({ scope: { kind: 'module', id: data.metrology.module.id } }).total, 2);
  assert.deepEqual(
    library.glossary({ scope: { kind: 'lesson', id: data.metrology.lesson.id }, searchText: 'head' }).items.map((term) => term.termPL),
    ['głowica pomiarowa']
  );
});

test('filtr ulubionych i tagu (tag musi pasować w całości)', async () => {
  const { library } = await makeLibrary();
  await populateGlossary(library);
  assert.equal(library.glossary({ favoritesOnly: true }).total, 2);
  assert.equal(library.glossary({ tag: 'Finanse' }).total, 2);
  assert.equal(library.glossary({ tag: 'fin' }).total, 0);
  assert.deepEqual(library.glossary({ tag: 'sondy', favoritesOnly: true }).items.map((term) => term.termEN), ['scanning probe']);
});

test('sortowanie po angielsku oraz od najnowszych', async () => {
  const { library } = await makeLibrary();
  await populateGlossary(library);
  assert.deepEqual(
    library.glossary({ sort: 'english' }).items.map((term) => term.termEN),
    ['assets', 'probe head', 'profit margin', 'scanning probe', 'submarine']
  );
  assert.equal(library.glossary({ sort: 'oldest' }).items[0].termEN, 'submarine');
});

test('stronicowanie zwraca kolejne porcje bez powtórzeń', async () => {
  const { library } = await makeLibrary();
  await populateGlossary(library);
  const pages = [library.glossary({}, 0, 2), library.glossary({}, 2, 2), library.glossary({}, 4, 2)];
  assert.deepEqual(pages.map((page) => page.items.length), [2, 2, 1]);
  assert.equal(pages[0].total, 5);
  assert.equal(new Set(pages.flatMap((page) => page.items.map((term) => term.id))).size, 5);
});

test('glosariusz odzwierciedla zmiany danych', async () => {
  const { library } = await makeLibrary();
  const data = await populateGlossary(library);
  assert.equal(library.glossary({ searchText: 'bilans' }).total, 0);
  await addTerm(library, data.finance.lesson, 'bilans', 'balance sheet');
  assert.equal(library.glossary({ searchText: 'bilans' }).total, 1);
});

// ---------------------------------------------------------------- dane przykładowe i import wsadowy

test('dane przykładowe: co najmniej 30 pojęć, każde z obiema nazwami', () => {
  const rows = sampleRows();
  assert.ok(sampleTermCount() >= 30);
  assert.deepEqual([...new Set(rows.map((row) => row.domain.name))], ['Business English', 'Metrology']);
  for (const row of rows) {
    assert.ok(row.term.termPL.trim() !== '' && row.term.termEN.trim() !== '');
  }
});

test('wczytanie przykładów tworzy pełną hierarchię, a powtórka niczego nie duplikuje', async () => {
  const { library } = await makeLibrary();

  const first = await installSampleData(library);
  assert.deepEqual(first, { domains: 2, modules: 5, lessons: 13, added: sampleTermCount(), updated: 0, skipped: 0 });
  const summary = library.summary();
  assert.deepEqual(summary, { domains: 2, modules: 5, lessons: 13, terms: sampleTermCount(), favorites: 0 });

  const second = await installSampleData(library);
  assert.deepEqual(second, { domains: 0, modules: 0, lessons: 0, added: 0, updated: 0, skipped: sampleTermCount() });
  assert.deepEqual(library.summary(), summary);
});

test('przykłady zawierają pojęcia bez opisu i bez przykładu', async () => {
  const { library } = await makeLibrary();
  await installSampleData(library);
  const terms = [...library.maps.terms.values()];
  assert.ok(terms.some((term) => !hasDescription(term)));
  assert.ok(terms.some((term) => !hasExample(term)));
  assert.ok(terms.some((term) => availableElementCount(term) === 3));
  const domain = library.findDomain('Metrology');
  assert.equal(domain.icon, '📐');
  assert.equal(domain.color, 'orange');
});

test('import do wskazanej lekcji zachowuje kolejność wierszy', async () => {
  const { library } = await makeLibrary();
  const branch = await makeBranch(library);
  await addTerm(library, branch.lesson, 'istniejące', 'existing');

  const report = await library.importRows([
    { lessonID: branch.lesson.id, term: { termPL: 'pierwsze', termEN: 'first' } },
    { lessonID: branch.lesson.id, term: { termPL: 'drugie', termEN: 'second' } }
  ]);

  assert.deepEqual(report, { domains: 0, modules: 0, lessons: 0, added: 2, updated: 0, skipped: 0 });
  assert.deepEqual(library.listTerms(branch.lesson.id).map((term) => term.termPL), ['istniejące', 'pierwsze', 'drugie']);
});

test('import: tryby duplikatów – pomiń, aktualizuj z zachowaniem historii, dodaj jako nowe', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  const original = await addTerm(library, branch.lesson, 'Aktywa', 'assets', { descriptionPL: 'stary opis' });
  await addLearningData(library, adapter, original);
  const row = { lessonID: branch.lesson.id, term: { termPL: 'aktywa', termEN: 'ASSETS', descriptionPL: 'nowy opis' } };

  const skipped = await library.importRows([row], { duplicates: 'skip' });
  assert.equal(skipped.skipped, 1);
  assert.equal(library.getTerm(original.id).descriptionPL, 'stary opis');

  const updated = await library.importRows([row], { duplicates: 'update' });
  assert.equal(updated.updated, 1);
  assert.equal(library.summary().terms, 1);
  assert.equal(library.getTerm(original.id).descriptionPL, 'nowy opis');
  assert.equal(library.maps.progress.size, 1);
  assert.deepEqual(await historyCounts(adapter), { assessments: 1, reviews: 1, quizAnswers: 1 });

  const added = await library.importRows([row], { duplicates: 'add' });
  assert.equal(added.added, 1);
  assert.equal(library.summary().terms, 2);
});

test('błędny wiersz wycofuje cały import i wskazuje numer wiersza', async () => {
  const { library } = await makeLibrary();
  await assert.rejects(
    library.importRows([
      { domain: 'A', module: 'B', lesson: 'C', term: { termPL: 'dobre', termEN: 'good' } },
      { domain: 'A', module: 'B', lesson: 'C', term: { termPL: 'złe', termEN: ' ' } }
    ]),
    (error) => error instanceof LibraryError && /Wiersz 2/.test(error.message)
  );
  assert.ok(library.isEmpty());
});

test('import 5000 pojęć w jednej operacji', async () => {
  const { library } = await makeLibrary();
  const rows = [];
  for (let index = 0; index < 5000; index += 1) {
    rows.push({
      domain: `Dziedzina ${index % 4}`, module: `Moduł ${index % 20}`, lesson: `Lekcja ${index % 100}`,
      term: { termPL: `pojęcie ${index}`, termEN: `term ${index}` }
    });
  }
  const report = await library.importRows(rows);
  assert.deepEqual([report.domains, report.modules, report.lessons, report.added], [4, 20, 100, 5000]);
  assert.equal(library.glossary({ searchText: 'pojecie 4999' }).total, 1);
  assert.equal(library.glossary({}, 0, 100).items.length, 100);
});

// ---------------------------------------------------------------- kopia zapasowa

test('kopia zapasowa odtwarza materiały, postępy, historię i ustawienia w nowej bazie', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  const term = await addTerm(library, branch.lesson, 'aktywa', 'assets', { tags: ['finanse'], isFavorite: true });
  await addLearningData(library, adapter, term);
  await library.updateSettings({ appearance: 'dark' });

  const backup = await createBackup(library, '0.1.0');
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.counts.terms, 1);
  const text = JSON.stringify(backup);

  const freshAdapter = new MemoryAdapter();
  const fresh = new Library(freshAdapter);
  await fresh.load();
  await fresh.createDomain({ name: 'Do zastąpienia' });

  const result = await restoreBackup(fresh, parseBackupText(text));

  assert.equal(result.dropped, 0);
  assert.deepEqual(fresh.summary(), library.summary());
  assert.equal(fresh.findDomain('Do zastąpienia'), null);
  assert.equal(fresh.lessonPath(branch.lesson.id), 'Business English › Finance › Financial Ratios');
  assert.deepEqual(fresh.getTerm(term.id).tags, ['finanse']);
  assert.equal(fresh.maps.progress.size, 1);
  assert.deepEqual(await historyCounts(freshAdapter), { assessments: 1, reviews: 1, quizAnswers: 1 });
  assert.equal(fresh.getSettings().appearance, 'dark');
});

test('nieprawidłowy plik kopii jest odrzucany i nie zmienia bazy', async () => {
  const { library } = await makeLibrary();
  await makeBranch(library);
  const before = library.summary();
  const backup = await createBackup(library);

  const attempts = [
    parseBackupTextSafe('to nie jest json'),
    { format: 'inny' },
    { ...backup, formatVersion: 99 },
    { ...backup, data: null },
    { ...backup, data: { ...backup.data, modules: [{ id: 'm1', name: 'Sierota', domainID: 'brak' }] } },
    { ...backup, data: { ...backup.data, domains: [{ id: 'd1' }] } },
    { ...backup, data: { ...backup.data, domains: [...backup.data.domains, backup.data.domains[0]] } }
  ];
  for (const attempt of attempts) {
    await assert.rejects(async () => restoreBackup(library, attempt), (error) => error instanceof LibraryError && error.code === 'invalidBackup');
  }
  assert.deepEqual(library.summary(), before);
});

function parseBackupTextSafe(text) {
  try {
    return parseBackupText(text);
  } catch {
    return null;
  }
}

test('przywracanie naprawia klucze i pomija dane nauki nieistniejących pojęć', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  const term = await addTerm(library, branch.lesson, 'Aktywa trwałe', 'Fixed assets');
  await addLearningData(library, adapter, term);
  const backup = JSON.parse(JSON.stringify(await createBackup(library)));

  backup.data.terms[0].keyPL = 'zepsuty';
  backup.data.terms[0].domainID = 'zły';
  backup.data.progress.push({ id: 'p-orphan', termID: 'brak' });
  backup.data.reviews.push({ id: 'r-orphan', termID: 'brak' });

  const result = validateBackup(backup);
  assert.equal(result.dropped, 2);
  assert.equal(result.data.terms[0].keyPL, 'aktywa trwale');
  assert.equal(result.data.terms[0].domainID, branch.domain.id);
  assert.equal(result.data.progress.length, 1);
});

test('nazwa pliku kopii zawiera datę', () => {
  assert.equal(backupFileName(new Date(2026, 9, 11)), 'LexiCards-kopia-2026-10-11.json');
});
