import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LibraryError } from '../../js/core/library.js';
import { Library } from '../../js/core/library.js';
import { addLearningData, addTerm, historyCounts, makeBranch, makeLibrary } from './helpers.js';

/** Sprawdza, że operacja kończy się błędem biblioteki o podanym kodzie. */
async function rejectsWith(promise, code, level) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof LibraryError, `oczekiwano LibraryError, otrzymano: ${error}`);
    assert.equal(error.code, code);
    if (level) assert.equal(error.level, level);
    return true;
  });
}

// ---------------------------------------------------------------- dziedziny

test('tworzenie dziedziny nadaje nazwę, klucz i kolejną pozycję', async () => {
  const { library } = await makeLibrary();
  const first = await library.createDomain({ name: '  Business   English ', details: ' ', icon: '💼', color: 'blue' });
  const second = await library.createDomain({ name: 'Metrology' });

  assert.equal(first.name, 'Business English');
  assert.equal(first.nameKey, 'business english');
  assert.equal(first.details, null);
  assert.equal(first.icon, '💼');
  assert.equal(first.sortOrder, 0);
  assert.equal(second.sortOrder, 1);
  assert.equal(second.icon, '📁');
  assert.equal(library.summary().domains, 2);
});

test('dziedzina bez nazwy nie zostaje zapisana', async () => {
  const { library, adapter } = await makeLibrary();
  await rejectsWith(library.createDomain({ name: '   ' }), 'emptyName', 'domain');
  assert.equal(library.summary().domains, 0);
  assert.equal(await adapter.count('domains'), 0);
});

test('edycja dziedziny zmienia nazwę, klucz, ikonę i kolor', async () => {
  const { library } = await makeLibrary();
  const domain = await library.createDomain({ name: 'Finanse' });
  await library.updateDomain(domain.id, { name: 'Finance', details: 'Opis', icon: '💶', color: 'green' });

  const reloaded = library.getDomain(domain.id);
  assert.equal(reloaded.name, 'Finance');
  assert.equal(reloaded.nameKey, 'finance');
  assert.equal(reloaded.details, 'Opis');
  assert.equal(reloaded.icon, '💶');
  assert.equal(reloaded.color, 'green');
});

// ---------------------------------------------------------------- moduły

test('moduł powstaje w istniejącej dziedzinie', async () => {
  const { library } = await makeLibrary();
  const domain = await library.createDomain({ name: 'Business English' });
  const management = await library.createModule({ name: 'Management' }, { existing: domain.id });
  const finance = await library.createModule({ name: 'Finance' }, { existing: domain.id });

  assert.equal(management.domainID, domain.id);
  assert.equal(management.sortOrder, 0);
  assert.equal(finance.sortOrder, 1);
  assert.equal(library.counts('domain', domain.id).modules, 2);
});

test('moduł może utworzyć brakującą dziedzinę w tej samej operacji', async () => {
  const { library } = await makeLibrary();
  const module = await library.createModule({ name: 'Probe Systems' }, { create: { name: 'Metrology' } });
  assert.equal(library.getDomain(module.domainID).name, 'Metrology');
  assert.deepEqual([library.summary().domains, library.summary().modules], [1, 1]);
});

test('błąd w nazwie modułu nie zostawia nowo utworzonej dziedziny', async () => {
  const { library, adapter } = await makeLibrary();
  await rejectsWith(library.createModule({ name: '' }, { create: { name: 'Metrology' } }), 'emptyName', 'module');
  assert.equal(library.summary().domains, 0);
  assert.equal(await adapter.count('domains'), 0);
});

test('moduł nie powstaje bez dziedziny ani w nieistniejącej dziedzinie', async () => {
  const { library } = await makeLibrary();
  await rejectsWith(library.createModule({ name: 'Finance' }, { existing: 'brak' }), 'notFound', 'domain');
  await rejectsWith(library.createModule({ name: 'Finance' }, null), 'parentNotSelected', 'domain');
});

// ---------------------------------------------------------------- lekcje

test('lekcja dziedziczy klucze modułu i dziedziny', async () => {
  const { library } = await makeLibrary();
  const branch = await makeBranch(library);
  const second = await library.createLesson({ name: 'Investments' }, { existing: branch.module.id });

  assert.equal(second.moduleID, branch.module.id);
  assert.equal(second.domainID, branch.domain.id);
  assert.equal(second.sortOrder, 1);
  assert.equal(library.counts('module', branch.module.id).lessons, 2);
});

test('lekcja tworzy brakujący moduł i dziedzinę w jednej operacji', async () => {
  const { library } = await makeLibrary();
  const lesson = await library.createLesson(
    { name: 'Form Tolerances' },
    { create: { name: 'Geometrical Tolerancing' }, domain: { create: { name: 'Metrology' } } }
  );
  const module = library.getModule(lesson.moduleID);
  assert.equal(module.name, 'Geometrical Tolerancing');
  assert.equal(library.getDomain(lesson.domainID).name, 'Metrology');
  assert.equal(module.domainID, lesson.domainID);
});

test('lekcja bez nazwy nie tworzy pustego modułu ani dziedziny', async () => {
  const { library, adapter } = await makeLibrary();
  await rejectsWith(
    library.createLesson({ name: ' ' }, { create: { name: 'Finance' }, domain: { create: { name: 'Business English' } } }),
    'emptyName', 'lesson'
  );
  assert.ok(library.isEmpty());
  assert.equal(await adapter.count('modules'), 0);
});

test('nieudany zapis wycofuje zmiany z pamięci', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  adapter.failNextCommit = new Error('brak miejsca');

  await assert.rejects(library.createLesson({ name: 'Nowa' }, { create: { name: 'Nowy moduł' }, domain: { existing: branch.domain.id } }), /brak miejsca/);

  assert.deepEqual([library.summary().modules, library.summary().lessons], [1, 1]);
  // Kolejna operacja działa normalnie.
  await library.createLesson({ name: 'Nowa' }, { existing: branch.module.id });
  assert.equal(library.summary().lessons, 2);
});

test('nieudany zapis powiadamia ekrany, a odrzucona walidacja nie', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  let notifications = 0;
  library.subscribe(() => { notifications += 1; });

  // Błąd walidacji: nic się nie zmieniło, więc nie ma czego odświeżać.
  await assert.rejects(library.createDomain({ name: '   ' }));
  assert.equal(notifications, 0);

  // Błąd zapisu: ekran mógł już pokazać zmianę, więc musi dostać sygnał o jej wycofaniu.
  adapter.failNextCommit = new Error('brak miejsca');
  await assert.rejects(library.createLesson({ name: 'Nowa' }, { existing: branch.module.id }), /brak miejsca/);
  assert.equal(notifications, 1);
  assert.equal(library.summary().lessons, 1);
});

// ---------------------------------------------------------------- przenoszenie i kopiowanie

test('przeniesienie modułu aktualizuje dziedzinę w lekcjach, pojęciach i postępach', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  const term = await addTerm(library, branch.lesson, 'bilans', 'balance sheet');
  const progress = await addLearningData(library, adapter, term);
  const target = await library.createDomain({ name: 'Finance' });

  await library.moveModule(branch.module.id, target.id);

  assert.equal(library.getModule(branch.module.id).domainID, target.id);
  assert.equal(library.getLesson(branch.lesson.id).domainID, target.id);
  assert.equal(library.getTerm(term.id).domainID, target.id);
  assert.equal(library.getTerm(term.id).moduleID, branch.module.id);
  assert.equal(library.maps.progress.get(progress.id).domainID, target.id);
  assert.equal(library.counts('domain', branch.domain.id).terms, 0);
  assert.equal(library.counts('domain', target.id).terms, 1);
});

test('przeniesienie lekcji aktualizuje moduł i dziedzinę w pojęciach i postępach', async () => {
  const { library, adapter } = await makeLibrary();
  const source = await makeBranch(library, { domain: 'Business English', module: 'Finance', lesson: 'Ratios' });
  const target = await makeBranch(library, { domain: 'Metrology', module: 'CMM', lesson: 'Components' });
  const term = await addTerm(library, source.lesson, 'aktywa', 'assets');
  const progress = await addLearningData(library, adapter, term);

  await library.moveLesson(source.lesson.id, target.module.id);

  const lesson = library.getLesson(source.lesson.id);
  assert.equal(lesson.moduleID, target.module.id);
  assert.equal(lesson.domainID, target.domain.id);
  assert.equal(lesson.sortOrder, 1);
  const moved = library.getTerm(term.id);
  assert.deepEqual([moved.lessonID, moved.moduleID, moved.domainID], [source.lesson.id, target.module.id, target.domain.id]);
  const movedProgress = library.maps.progress.get(progress.id);
  assert.deepEqual([movedProgress.moduleID, movedProgress.domainID], [target.module.id, target.domain.id]);
});

test('kopia lekcji zawiera kopie pojęć z nowymi identyfikatorami i bez postępów', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  const term = await addTerm(library, branch.lesson, 'aktywa', 'assets', { tags: ['finanse'], isFavorite: true });
  await addTerm(library, branch.lesson, 'bilans', 'balance sheet');
  await addLearningData(library, adapter, term);

  const copy = await library.copyLesson(branch.lesson.id, branch.module.id);

  assert.notEqual(copy.id, branch.lesson.id);
  assert.equal(copy.name, 'Financial Ratios (kopia)');
  assert.equal(library.counts('lesson', copy.id).terms, 2);
  assert.equal(library.counts('lesson', branch.lesson.id).terms, 2);
  const copied = library.findTerm('aktywa', 'assets', copy.id);
  assert.notEqual(copied.id, term.id);
  assert.deepEqual(copied.tags, ['finanse']);
  assert.equal(copied.isFavorite, true);
  assert.equal(library.maps.progress.size, 1);

  const second = await library.copyLesson(branch.lesson.id, branch.module.id);
  assert.equal(second.name, 'Financial Ratios (kopia 2)');
});

test('zmiana kolejności zapisuje nowe pozycje', async () => {
  const { library } = await makeLibrary();
  const a = await library.createDomain({ name: 'A' });
  const b = await library.createDomain({ name: 'B' });
  const c = await library.createDomain({ name: 'C' });
  await library.reorder('domain', [c.id, a.id, b.id]);
  assert.deepEqual(library.listDomains().map((domain) => domain.name), ['C', 'A', 'B']);
});

test('wyszukiwanie po nazwie ignoruje wielkość liter i znaki diakrytyczne', async () => {
  const { library } = await makeLibrary();
  const branch = await makeBranch(library, { domain: 'Zarządzanie', module: 'Przywództwo', lesson: 'Wstęp' });
  assert.equal(library.findDomain('zarzadzanie').id, branch.domain.id);
  assert.equal(library.findModule('PRZYWODZTWO', branch.domain.id).id, branch.module.id);
  assert.equal(library.findLesson(' wstep ', branch.module.id).id, branch.lesson.id);
  assert.equal(library.findDomain('Finanse'), null);
  assert.equal(library.lessonPath(branch.lesson.id), 'Zarządzanie › Przywództwo › Wstęp');
  assert.equal(library.modulePath(branch.module.id), 'Zarządzanie › Przywództwo');
  assert.equal(library.lessonPath('brak'), '');
});

// ---------------------------------------------------------------- pojęcia

test('nowe pojęcie dziedziczy klucze zakresu i normalizuje treść', async () => {
  const { library } = await makeLibrary();
  const branch = await makeBranch(library);
  const term = await library.createTerm({
    termPL: '  Wskaźnik   płynności ', termEN: 'Current Ratio',
    descriptionPL: 'Iloraz aktywów obrotowych i zobowiązań krótkoterminowych.', descriptionEN: '   ',
    examplePL: '', exampleEN: 'The current ratio is 1.5.',
    tags: ['finanse', 'wskaźniki', 'Finanse'], difficulty: 3, notes: ' ', isFavorite: true
  }, branch.lesson.id);

  assert.deepEqual([term.lessonID, term.moduleID, term.domainID], [branch.lesson.id, branch.module.id, branch.domain.id]);
  assert.equal(term.termPL, 'Wskaźnik płynności');
  assert.equal(term.keyPL, 'wskaznik plynnosci');
  assert.equal(term.descriptionEN, null);
  assert.equal(term.examplePL, null);
  assert.deepEqual(term.tags, ['finanse', 'wskaźniki']);
  assert.equal(term.difficulty, 3);
  assert.equal(term.isFavorite, true);
  assert.equal(term.sortOrder, 0);
});

test('nazwy po polsku i po angielsku są wymagane', async () => {
  const { library } = await makeLibrary();
  const branch = await makeBranch(library);
  await rejectsWith(library.createTerm({ termPL: ' ', termEN: 'assets' }, branch.lesson.id), 'missingTermPL');
  await rejectsWith(library.createTerm({ termPL: 'aktywa', termEN: '' }, branch.lesson.id), 'missingTermEN');
  await rejectsWith(library.createTerm({ termPL: 'aktywa', termEN: 'assets', difficulty: 9 }, branch.lesson.id), 'invalidDifficulty');
  await rejectsWith(library.createTerm({ termPL: 'aktywa', termEN: 'assets' }, null), 'parentNotSelected', 'lesson');
  assert.equal(library.summary().terms, 0);
});

test('edycja pojęcia zachowuje identyfikator i dane nauki', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  const term = await addTerm(library, branch.lesson, 'aktywa', 'asets');
  await addLearningData(library, adapter, term);

  await library.updateTerm(term.id, { termPL: 'aktywa', termEN: 'assets', descriptionEN: 'Resources controlled by a company.' });

  const reloaded = library.getTerm(term.id);
  assert.equal(reloaded.termEN, 'assets');
  assert.equal(reloaded.keyEN, 'assets');
  assert.equal(reloaded.createdAt, term.createdAt);
  assert.equal(library.summary().terms, 1);
  assert.equal(library.maps.progress.size, 1);
  assert.deepEqual(await historyCounts(adapter), { assessments: 1, reviews: 1, quizAnswers: 1 });
});

test('duplikat jest wykrywany po znormalizowanych nazwach w obrębie lekcji', async () => {
  const { library } = await makeLibrary();
  const branch = await makeBranch(library);
  const other = await library.createLesson({ name: 'Inna' }, { existing: branch.module.id });
  const term = await addTerm(library, branch.lesson, 'Wskaźnik płynności', 'Current Ratio');

  assert.equal(library.findTerm('  wskaznik  PLYNNOSCI', 'current ratio', branch.lesson.id).id, term.id);
  assert.equal(library.findTerm('Wskaźnik płynności', 'Current Ratio', other.id), null);
  assert.equal(library.findTerm('Wskaźnik płynności', 'Quick Ratio', branch.lesson.id), null);
});

test('oznaczanie wielu pojęć jako ulubione', async () => {
  const { library } = await makeLibrary();
  const branch = await makeBranch(library);
  const first = await addTerm(library, branch.lesson, 'aktywa', 'assets');
  const second = await addTerm(library, branch.lesson, 'bilans', 'balance sheet');

  await library.setFavorite(true, [first.id, second.id]);
  assert.equal(library.summary().favorites, 2);
  await library.setFavorite(false, [first.id]);
  assert.equal(library.summary().favorites, 1);
  assert.equal(library.getTerm(second.id).isFavorite, true);
});

test('przeniesienie pojęć zmienia klucze zakresu i zabiera postępy', async () => {
  const { library, adapter } = await makeLibrary();
  const source = await makeBranch(library, { domain: 'Business English', module: 'Finance', lesson: 'Ratios' });
  const target = await makeBranch(library, { domain: 'Metrology', module: 'CMM', lesson: 'Components' });
  const moved = await addTerm(library, source.lesson, 'aktywa', 'assets');
  const stays = await addTerm(library, source.lesson, 'bilans', 'balance sheet');
  const movedProgress = await addLearningData(library, adapter, moved);
  const stayingProgress = await addLearningData(library, adapter, stays);

  await library.moveTerms([moved.id], target.lesson.id);

  const after = library.getTerm(moved.id);
  assert.deepEqual([after.lessonID, after.moduleID, after.domainID], [target.lesson.id, target.module.id, target.domain.id]);
  assert.equal(library.getTerm(stays.id).lessonID, source.lesson.id);
  assert.equal(library.maps.progress.get(movedProgress.id).lessonID, target.lesson.id);
  assert.equal(library.maps.progress.get(movedProgress.id).domainID, target.domain.id);
  assert.equal(library.maps.progress.get(stayingProgress.id).lessonID, source.lesson.id);
  assert.deepEqual(library.listTerms(target.lesson.id).map((term) => term.termPL), ['aktywa']);
});

test('kopia pojęcia jest niezależna i nie dziedziczy postępów', async () => {
  const { library, adapter } = await makeLibrary();
  const source = await makeBranch(library, { domain: 'Business English', module: 'Finance', lesson: 'Ratios' });
  const target = await makeBranch(library, { domain: 'Metrology', module: 'CMM', lesson: 'Components' });
  const original = await addTerm(library, source.lesson, 'aktywa', 'assets', { descriptionPL: 'Zasoby' });
  await addLearningData(library, adapter, original);

  const copies = await library.copyTerms([original.id], target.lesson.id);

  assert.equal(copies.length, 1);
  assert.notEqual(copies[0].id, original.id);
  assert.deepEqual([copies[0].lessonID, copies[0].domainID], [target.lesson.id, target.domain.id]);
  assert.equal(copies[0].descriptionPL, 'Zasoby');
  assert.equal(library.getTerm(original.id).lessonID, source.lesson.id);
  assert.equal(library.summary().terms, 2);
  assert.equal(library.maps.progress.size, 1);
});

test('operacje na pustym zaznaczeniu zgłaszają błąd', async () => {
  const { library } = await makeLibrary();
  const branch = await makeBranch(library);
  await rejectsWith(library.moveTerms([], branch.lesson.id), 'nothingSelected');
  await rejectsWith(library.copyTerms([], branch.lesson.id), 'nothingSelected');
  await rejectsWith(library.delete({ kind: 'terms', ids: [] }), 'nothingSelected');
});

// ---------------------------------------------------------------- usuwanie

/** Dwie dziedziny; pierwsza ma 2 moduły, 3 lekcje i 4 pojęcia, druga 1 pojęcie. */
async function populate(library, adapter) {
  const first = await makeBranch(library, { domain: 'Business English', module: 'Finance', lesson: 'Ratios' });
  const secondLesson = await library.createLesson({ name: 'Statements' }, { existing: first.module.id });
  const otherModuleLesson = await library.createLesson(
    { name: 'Leadership' },
    { create: { name: 'Management' }, domain: { existing: first.domain.id } }
  );
  const second = await makeBranch(library, { domain: 'Metrology', module: 'CMM', lesson: 'Components' });

  const firstTerms = [
    await addTerm(library, first.lesson, 'aktywa', 'assets'),
    await addTerm(library, first.lesson, 'marża', 'margin'),
    await addTerm(library, secondLesson, 'bilans', 'balance sheet'),
    await addTerm(library, otherModuleLesson, 'przywództwo', 'leadership')
  ];
  const secondTerm = await addTerm(library, second.lesson, 'sonda', 'probe');
  for (const term of [...firstTerms, secondTerm]) await addLearningData(library, adapter, term);
  return { first, second, firstTerms, secondTerm, otherModuleLesson };
}

test('skutki usunięcia dziedziny podają liczbę modułów, lekcji, pojęć i postępów', async () => {
  const { library, adapter } = await makeLibrary();
  const data = await populate(library, adapter);
  const impact = library.deletionImpact({ kind: 'domain', id: data.first.domain.id });
  assert.deepEqual(impact, { name: 'Business English', modules: 2, lessons: 3, terms: 4, progressRecords: 4, notes: 0 });
});

test('usunięcie dziedziny usuwa elementy podrzędne i ich dane nauki', async () => {
  const { library, adapter } = await makeLibrary();
  const data = await populate(library, adapter);

  await library.delete({ kind: 'domain', id: data.first.domain.id });

  assert.deepEqual(library.summary(), { domains: 1, modules: 1, lessons: 1, terms: 1, favorites: 0 });
  assert.equal(library.maps.progress.size, 1);
  assert.equal([...library.maps.progress.values()][0].termID, data.secondTerm.id);
  assert.deepEqual(await historyCounts(adapter), { assessments: 1, reviews: 1, quizAnswers: 1 });
  assert.equal(await adapter.count('terms'), 1);
  assert.equal(await adapter.count('progress'), 1);
  assert.ok(library.getDomain(data.second.domain.id));
});

test('usunięcie modułu nie narusza pozostałych modułów dziedziny', async () => {
  const { library, adapter } = await makeLibrary();
  const data = await populate(library, adapter);

  const impact = library.deletionImpact({ kind: 'module', id: data.first.module.id });
  assert.deepEqual(impact, { name: 'Finance', modules: 0, lessons: 2, terms: 3, progressRecords: 3, notes: 0 });

  await library.delete({ kind: 'module', id: data.first.module.id });

  assert.deepEqual(library.summary(), { domains: 2, modules: 2, lessons: 2, terms: 2, favorites: 0 });
  assert.equal(library.maps.progress.size, 2);
  assert.ok(library.findTerm('przywództwo', 'leadership', data.otherModuleLesson.id));
});

test('usunięcie lekcji usuwa tylko jej pojęcia', async () => {
  const { library, adapter } = await makeLibrary();
  const data = await populate(library, adapter);

  const impact = library.deletionImpact({ kind: 'lesson', id: data.first.lesson.id });
  assert.deepEqual(impact, { name: 'Ratios', modules: 0, lessons: 0, terms: 2, progressRecords: 2, notes: 0 });

  await library.delete({ kind: 'lesson', id: data.first.lesson.id });

  assert.equal(library.summary().lessons, 3);
  assert.equal(library.summary().terms, 3);
  assert.equal(library.maps.progress.size, 3);
  assert.equal((await historyCounts(adapter)).reviews, 3);
});

test('usunięcie pojęć usuwa dane nauki wyłącznie tych pojęć', async () => {
  const { library, adapter } = await makeLibrary();
  const data = await populate(library, adapter);
  const removed = [data.firstTerms[0].id, data.firstTerms[2].id];

  const impact = library.deletionImpact({ kind: 'terms', ids: removed });
  assert.deepEqual(impact, { name: null, modules: 0, lessons: 0, terms: 2, progressRecords: 2, notes: 0 });
  assert.equal(library.deletionImpact({ kind: 'terms', ids: [data.secondTerm.id] }).name, 'sonda');

  await library.delete({ kind: 'terms', ids: removed });

  assert.equal(library.summary().terms, 3);
  assert.equal(library.summary().lessons, 4);
  assert.equal(library.maps.progress.size, 3);
  assert.deepEqual(await historyCounts(adapter), { assessments: 3, reviews: 3, quizAnswers: 3 });
  const remaining = new Set([...library.maps.progress.values()].map((record) => record.termID));
  assert.ok(removed.every((id) => !remaining.has(id)));
});

test('usunięcie nieistniejącego elementu zgłasza błąd i niczego nie zmienia', async () => {
  const { library, adapter } = await makeLibrary();
  await populate(library, adapter);
  await rejectsWith(library.delete({ kind: 'lesson', id: 'brak' }), 'notFound', 'lesson');
  assert.equal(library.summary().lessons, 4);
  assert.equal(library.summary().terms, 5);
});

test('usunięcie wszystkich materiałów zostawia ustawienia', async () => {
  const { library, adapter } = await makeLibrary();
  await populate(library, adapter);
  await library.updateSettings({ appearance: 'dark' });

  await library.deleteAllContent();

  assert.ok(library.isEmpty());
  assert.equal(library.maps.progress.size, 0);
  assert.deepEqual(await historyCounts(adapter), { assessments: 0, reviews: 0, quizAnswers: 0 });
  assert.equal(await adapter.count('terms'), 0);
  assert.equal(library.getSettings().appearance, 'dark');

  // Po ponownym wczytaniu z bazy stan jest taki sam.
  const reopened = new Library(adapter);
  await reopened.load();
  assert.ok(reopened.isEmpty());
  assert.equal(reopened.getSettings().appearance, 'dark');
});

// ---------------------------------------------------------------- trwałość, ustawienia, powiadomienia

test('dane są odtwarzane z bazy po ponownym otwarciu', async () => {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library);
  await addTerm(library, branch.lesson, 'aktywa', 'assets', { tags: ['finanse'] });

  const reopened = new Library(adapter);
  await reopened.load();

  assert.deepEqual(reopened.summary(), library.summary());
  assert.equal(reopened.lessonPath(branch.lesson.id), 'Business English › Finance › Financial Ratios');
  assert.deepEqual(reopened.listTerms(branch.lesson.id)[0].tags, ['finanse']);
});

test('ustawienia mają wartości domyślne i są trwałe po zmianie', async () => {
  const { library, adapter } = await makeLibrary();
  assert.equal(library.getSettings().appearance, 'system');
  assert.equal(await adapter.count('settings'), 0);

  await library.updateSettings({ appearance: 'dark' });

  assert.equal(await adapter.count('settings'), 1);
  const reopened = new Library(adapter);
  await reopened.load();
  assert.equal(reopened.getSettings().appearance, 'dark');
  assert.equal(reopened.getSettings().preferredQuizLength, 10);
});

test('subskrybenci są powiadamiani po każdej udanej zmianie, a po błędzie nie', async () => {
  const { library } = await makeLibrary();
  let notifications = 0;
  const unsubscribe = library.subscribe(() => { notifications += 1; });

  await library.createDomain({ name: 'A' });
  await assert.rejects(library.createDomain({ name: '' }));
  assert.equal(notifications, 1);

  unsubscribe();
  await library.createDomain({ name: 'B' });
  assert.equal(notifications, 1);
});

test('operacje uruchomione jednocześnie wykonują się po kolei', async () => {
  const { library } = await makeLibrary();
  const created = await Promise.all([
    library.createDomain({ name: 'A' }),
    library.createDomain({ name: 'B' }),
    library.createDomain({ name: 'C' })
  ]);
  assert.deepEqual(created.map((domain) => domain.sortOrder), [0, 1, 2]);
});
