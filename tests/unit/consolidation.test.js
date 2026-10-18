// Ręczne utrwalenie lekcji i modułów: status, rzadkie powtórki, zdejmowanie statusu, postęp na listach,
// szare ikony dziedzin po aktualizacji.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBackup, restoreBackup, validateBackup } from '../../js/core/backup.js';
import { Library } from '../../js/core/library.js';
import { DIRECTIONS, SETTINGS_ID, defaultSettings, newID } from '../../js/core/model.js';
import { BOTH, dueCount, isTermDue, lessonMastery, moduleMastery } from '../../js/core/stats.js';
import { MemoryAdapter } from '../../js/core/storage.js';
import { buildQueue, cardDueTime } from '../../js/core/study.js';
import { addTerm, makeBranch, makeLibrary } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

/** Postęp pojęcia w kierunku PL → EN zapisany wprost w bazie. */
async function setProgress(library, adapter, term, { status = 'mastered', reviewedAt, due }) {
  const progress = {
    id: newID(), termID: term.id, lessonID: term.lessonID, moduleID: term.moduleID, domainID: term.domainID,
    direction: DIRECTIONS.PL_EN, reviewCount: 1, lastStatus: status, lastReviewedAt: new Date(reviewedAt).toISOString(),
    schedule: { state: 'review', step: null, stability: 3, difficulty: 5, due: new Date(due).toISOString(), lastReview: new Date(reviewedAt).toISOString(), reps: 1, lapses: 0 }
  };
  await adapter.commit({ puts: { progress: [progress] }, deletes: {}, purgeTermIDs: [], clear: [] });
  await library.load();
}

/** Data oznaczenia „utrwalona” ustawiona na konkretną chwilę (testy terminów). */
async function consolidateAt(library, adapter, lesson, time) {
  const record = { ...library.getLesson(lesson.id), consolidatedAt: new Date(time).toISOString() };
  await adapter.commit({ puts: { lessons: [record] }, deletes: {}, purgeTermIDs: [], clear: [] });
  await library.load();
}

test('utrwalenie lekcji i modułu: moduł jest utrwalony, gdy wszystkie lekcje są; data oznaczenia zostaje', async () => {
  const { library } = await makeLibrary();
  const { lesson, module } = await makeBranch(library);
  const second = await library.createLesson({ name: 'Druga' }, { existing: module.id });
  await addTerm(library, lesson, 'bilans', 'balance sheet');
  await addTerm(library, second, 'aktywa', 'assets');

  assert.equal(library.isLessonConsolidated(lesson.id), false);
  const marked = await library.setLessonConsolidated(lesson.id, true);
  assert.ok(marked);
  assert.equal(library.isLessonConsolidated(lesson.id), true);
  assert.equal(library.isModuleConsolidated(module.id), false, 'druga lekcja nie jest utrwalona');
  assert.equal(await library.setLessonConsolidated(lesson.id, true), marked, 'ponowne oznaczenie nie zmienia daty');

  assert.equal(await library.setModuleConsolidated(module.id, true), 2);
  assert.equal(library.isModuleConsolidated(module.id), true);
  assert.equal(library.getLesson(lesson.id).consolidatedAt, marked);

  await library.setLessonConsolidated(second.id, false);
  assert.equal(library.isModuleConsolidated(module.id), false);
  await library.setModuleConsolidated(module.id, false);
  assert.equal(library.isLessonConsolidated(lesson.id), false);

  const empty = await library.createModule({ name: 'Pusty' }, { existing: module.domainID });
  await assert.rejects(library.setModuleConsolidated(empty.id, true), /nie ma lekcji/);
  assert.equal(library.isModuleConsolidated(empty.id), false);
});

test('termin powtórki w lekcji utrwalonej: najwcześniej po okresie z Ustawień, późniejszy FSRS zostaje, pomyłka – zwykły FSRS', async () => {
  const { library, adapter } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  const [fresh, known, later, forgotten, relearned] = await Promise.all(
    ['a', 'b', 'c', 'd', 'e'].map((name) => addTerm(library, lesson, name, `${name}-en`))
  );
  const since = Date.UTC(2026, 9, 1);
  await setProgress(library, adapter, known, { reviewedAt: since - 5 * DAY, due: since + 2 * DAY });
  await setProgress(library, adapter, later, { reviewedAt: since - 5 * DAY, due: since + 100 * DAY });
  await setProgress(library, adapter, forgotten, { status: 'toLearn', reviewedAt: since + 3 * DAY, due: since + 4 * DAY });
  await setProgress(library, adapter, relearned, { reviewedAt: since + 10 * DAY, due: since + 12 * DAY });

  const due = (term) => cardDueTime(library, term, DIRECTIONS.PL_EN);
  assert.equal(due(fresh), null, 'bez utrwalenia nowa fiszka nie ma terminu');
  assert.equal(due(known), since + 2 * DAY);

  await consolidateAt(library, adapter, lesson, since);
  assert.equal(due(fresh), since + 30 * DAY, 'nowa fiszka – miesiąc od oznaczenia');
  assert.equal(due(known), since + 30 * DAY, 'FSRS za 2 dni → miesiąc od oznaczenia');
  assert.equal(due(later), since + 100 * DAY, 'późniejszy termin FSRS zostaje');
  assert.equal(due(forgotten), since + 4 * DAY, 'niezapamiętana po oznaczeniu – zwykły FSRS');
  assert.equal(due(relearned), since + 40 * DAY, 'opanowana po oznaczeniu – miesiąc od ostatniej powtórki');

  await library.updateSettings({ consolidatedReviewDays: 90 });
  assert.equal(due(known), since + 90 * DAY);

  // Zakresy nauki i liczby do powtórki.
  const config = { domainID: null, moduleID: null, lessonIDs: [], direction: DIRECTIONS.PL_EN, scope: 'new', count: 0, shuffle: false };
  assert.deepEqual(buildQueue(library, config, Math.random, since + DAY), [], 'nowe pojęcia lekcji utrwalonej nie są „Nowe”');
  const repeat = (now) => buildQueue(library, { ...config, scope: 'repeat' }, Math.random, now).map((card) => library.getTerm(card.termID).termPL);
  assert.deepEqual(repeat(since + 5 * DAY), ['d']);
  assert.deepEqual(repeat(since + 91 * DAY).sort(), ['a', 'b', 'd']);
  assert.equal(isTermDue(library, known.id, DIRECTIONS.PL_EN, since + 5 * DAY), false);
  assert.equal(dueCount(library, library.listTerms(lesson.id), BOTH, since + 101 * DAY), 5);
});

test('nowe pojęcie albo nowa lekcja zdejmują utrwalenie; edycja i usunięcie nie; komunikat dla interfejsu', async () => {
  const { library } = await makeLibrary();
  const { lesson, module } = await makeBranch(library);
  const other = await library.createLesson({ name: 'Druga' }, { existing: module.id });
  const first = await addTerm(library, lesson, 'bilans', 'balance sheet');
  const outside = await addTerm(library, other, 'aktywa', 'assets');
  const notices = [];
  library.onNotice((items) => notices.push(...items));

  await library.setModuleConsolidated(module.id, true);
  await library.updateTerm(first.id, { termPL: 'bilans', termEN: 'balance sheet', descriptionPL: 'zmieniony opis' });
  assert.equal(library.isLessonConsolidated(lesson.id), true, 'edycja pojęcia nie zdejmuje');

  await addTerm(library, lesson, 'pasywa', 'liabilities');
  assert.equal(library.isLessonConsolidated(lesson.id), false);
  assert.equal(library.isModuleConsolidated(module.id), false, 'moduł też przestaje być utrwalony');
  assert.deepEqual(notices.map((notice) => [notice.level, notice.name, notice.reason]), [['lesson', lesson.name, 'term']]);

  await library.setLessonConsolidated(lesson.id, true);
  await library.moveTerms([outside.id], lesson.id);
  assert.equal(library.isLessonConsolidated(lesson.id), false, 'przeniesione pojęcie to nowe pojęcie w lekcji');
  await library.setLessonConsolidated(other.id, true);
  await library.delete({ kind: 'terms', ids: [first.id] });
  await library.setLessonConsolidated(lesson.id, true);
  await library.copyTerms([library.listTerms(lesson.id)[0].id], other.id);
  assert.equal(library.isLessonConsolidated(other.id), false, 'kopia pojęcia też');

  await library.setModuleConsolidated(module.id, true);
  notices.length = 0;
  const added = await library.createLesson({ name: 'Trzecia' }, { existing: module.id });
  assert.equal(library.isModuleConsolidated(module.id), false);
  assert.equal(library.isLessonConsolidated(added.id), false);
  assert.deepEqual(notices.map((notice) => [notice.level, notice.name, notice.reason]), [['module', module.name, 'lesson']]);

  // Kopia lekcji nie jest utrwalona; przeniesienie lekcji utrwalonej do modułu utrwalonego go nie psuje.
  await library.setModuleConsolidated(module.id, true);
  const copy = await library.copyLesson(lesson.id, module.id);
  assert.equal(library.isLessonConsolidated(copy.id), false);
  await library.delete({ kind: 'lesson', id: copy.id });
  const target = await library.createModule({ name: 'Cel' }, { existing: module.domainID });
  const inTarget = await library.createLesson({ name: 'W celu' }, { existing: target.id });
  await addTerm(library, inTarget, 'x', 'y');
  await library.setModuleConsolidated(target.id, true);
  notices.length = 0;
  await library.moveLesson(added.id, target.id);
  assert.equal(library.isModuleConsolidated(target.id), true, 'lekcja utrwalona nie psuje modułu');
  assert.deepEqual(notices, []);
  await library.setLessonConsolidated(added.id, false);
  await library.moveLesson(added.id, module.id);
  assert.equal(library.isModuleConsolidated(target.id), true);
  assert.equal(library.isModuleConsolidated(module.id), false, 'powrót do modułu utrwalonego też zdejmuje');
  notices.length = 0;
  await library.moveLesson(added.id, target.id);
  assert.equal(library.isModuleConsolidated(target.id), false, 'nieutrwalona lekcja – moduł traci status');
  assert.deepEqual(notices.map((notice) => [notice.level, notice.name, notice.reason]), [['module', target.name, 'lesson']]);
});

test('import: nowe pojęcia zdejmują utrwalenie (plan to zapowiada), aktualizacja istniejących nie', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library, { domain: 'BE', module: 'Finance', lesson: 'Ratios' });
  await addTerm(library, lesson, 'bilans', 'balance sheet');
  await library.setLessonConsolidated(lesson.id, true);

  const update = [{ domain: 'BE', module: 'Finance', lesson: 'Ratios', term: { termPL: 'bilans', termEN: 'balance sheet', descriptionPL: 'opis' } }];
  assert.deepEqual(library.planImport(update, { duplicates: 'update' }).unconsolidated, []);
  await library.importRows(update, { duplicates: 'update' });
  assert.equal(library.isLessonConsolidated(lesson.id), true);

  const rows = [
    { domain: 'BE', module: 'Finance', lesson: 'Ratios', term: { termPL: 'aktywa', termEN: 'assets' } },
    { domain: 'BE', module: 'Finance', lesson: 'Ratios', term: { termPL: 'pasywa', termEN: 'liabilities' } }
  ];
  assert.deepEqual(library.planImport(rows).unconsolidated, ['BE › Finance › Ratios']);
  assert.equal(library.isLessonConsolidated(lesson.id), true, 'plan niczego nie zmienia');
  const report = await library.importRows(rows);
  assert.deepEqual(report.unconsolidated, ['BE › Finance › Ratios']);
  assert.equal(library.isLessonConsolidated(lesson.id), false);

  // Nowa lekcja z pliku w module utrwalonym.
  await library.setModuleConsolidated(lesson.moduleID, true);
  const plan = library.planImport([{ domain: 'BE', module: 'Finance', lesson: 'Nowa', term: { termPL: 'x', termEN: 'y' } }]);
  assert.deepEqual(plan.unconsolidated, ['BE › Finance']);
});

test('postęp na listach: procent opanowanych pojęć lekcji i modułu; lekcja utrwalona liczy się w całości', async () => {
  const { library, adapter } = await makeLibrary();
  const { lesson, module } = await makeBranch(library);
  const other = await library.createLesson({ name: 'Druga' }, { existing: module.id });
  const empty = await library.createLesson({ name: 'Pusta' }, { existing: module.id });
  const terms = [];
  for (const name of ['a', 'b', 'c', 'd']) terms.push(await addTerm(library, lesson, name, `${name}-en`));
  for (const name of ['e', 'f']) await addTerm(library, other, name, `${name}-en`);
  const now = Date.now();
  for (const term of terms.slice(0, 3)) await setProgress(library, adapter, term, { reviewedAt: now - DAY, due: now + DAY });
  await setProgress(library, adapter, terms[3], { status: 'partiallyMastered', reviewedAt: now - DAY, due: now + DAY });

  assert.deepEqual(lessonMastery(library, lesson.id, DIRECTIONS.PL_EN), { total: 4, mastered: 3, percent: 75, consolidated: false });
  assert.deepEqual(lessonMastery(library, empty.id, DIRECTIONS.PL_EN), { total: 0, mastered: 0, percent: null, consolidated: false });
  assert.equal(lessonMastery(library, lesson.id, DIRECTIONS.EN_PL).percent, 0, 'kierunek EN → PL nie był ćwiczony');
  assert.deepEqual(moduleMastery(library, module.id, DIRECTIONS.PL_EN), { total: 6, mastered: 3, percent: 50, consolidated: false });
  await library.setLessonConsolidated(other.id, true);
  assert.equal(moduleMastery(library, module.id, DIRECTIONS.PL_EN).percent, 83);
  assert.equal(lessonMastery(library, other.id, DIRECTIONS.PL_EN).consolidated, true);
});

test('wersja 1.2: istniejące dziedziny dostają szare tło ikon jeden raz; nowe są szare; utrwalenie jest w kopii', async () => {
  const adapter = new MemoryAdapter();
  const oldSettings = { ...defaultSettings() };
  delete oldSettings.domainColorsGray;
  const domain = { id: newID(), name: 'Law', nameKey: 'law', details: null, icon: '🎓', color: 'blue', sortOrder: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
  await adapter.commit({ puts: { settings: [{ ...oldSettings, id: SETTINGS_ID }], domains: [domain] }, deletes: {}, purgeTermIDs: [], clear: [] });
  const library = new Library(adapter);
  await library.load();
  assert.equal(library.getDomain(domain.id).color, 'gray');
  assert.equal(library.getSettings().domainColorsGray, true);

  // Kolor wybrany później zostaje.
  await library.updateDomain(domain.id, { name: 'Law', color: 'orange' });
  await library.load();
  assert.equal(library.getDomain(domain.id).color, 'orange');

  const created = await library.createDomain({ name: 'Nowa' });
  assert.equal(created.color, 'gray');

  // Baza bez zapisanych ustawień (nikt ich nie zmieniał): dziedziny też przechodzą na szare.
  const bare = new MemoryAdapter();
  await bare.commit({ puts: { domains: [{ ...domain, color: 'teal' }] }, deletes: {}, purgeTermIDs: [], clear: [] });
  const fromBare = new Library(bare);
  await fromBare.load();
  assert.equal(fromBare.getDomain(domain.id).color, 'gray');
  await fromBare.updateDomain(domain.id, { name: 'Law', color: 'pink' });
  await fromBare.load();
  assert.equal(fromBare.getDomain(domain.id).color, 'pink', 'wybór po aktualizacji zostaje');

  // Nowa aplikacja: pierwsze otwarcie niczego nie zapisuje, a kolor wybrany przy tworzeniu zostaje po ponownym otwarciu.
  const empty = new MemoryAdapter();
  const newcomer = new Library(empty);
  await newcomer.load();
  assert.equal(await empty.count('settings'), 0);
  const orange = await newcomer.createDomain({ name: 'Pomarańczowa', color: 'orange' });
  const grayOne = await newcomer.createDomain({ name: 'Szara' });
  const reopened = new Library(empty);
  await reopened.load();
  assert.deepEqual([reopened.getDomain(orange.id).color, reopened.getDomain(grayOne.id).color], ['orange', 'gray']);

  // Kopia zapasowa z wersji 1.1 (bez znacznika): po przywróceniu dziedziny są szare; kopia z 1.2 zachowuje kolor.
  const current = JSON.parse(JSON.stringify(await createBackup(fromBare)));
  const old = structuredClone(current);
  delete old.data.settings[0].domainColorsGray;
  await restoreBackup(fromBare, old);
  assert.equal(fromBare.getDomain(domain.id).color, 'gray');
  await restoreBackup(fromBare, current);
  assert.equal(fromBare.getDomain(domain.id).color, 'pink');

  const { library: fresh } = await makeLibrary();
  const { lesson } = await makeBranch(fresh);
  await addTerm(fresh, lesson, 'a', 'b');
  await fresh.setLessonConsolidated(lesson.id, true);
  const backup = JSON.parse(JSON.stringify(await createBackup(fresh)));
  assert.ok(validateBackup(backup).data.lessons[0].consolidatedAt);
  backup.data.lessons[0].consolidatedAt = 'wczoraj';
  assert.equal(validateBackup(backup).data.lessons[0].consolidatedAt, null, 'niepoprawna data – lekcja nieoznaczona');
});
