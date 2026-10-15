// Nauka z fiszkami: kolejka, treść fiszki, ocena z kafelków, postęp, historia, cofanie, sesja.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackup, restoreBackup } from '../../js/core/backup.js';
import { Library, LibraryError } from '../../js/core/library.js';
import { availableElementCount } from '../../js/core/model.js';
import {
  DECISIONS, REPEAT_KINDS, buildQueue, cardContent, describeProgress, describeStudyMaterial, emptyTiles, isHard, isSessionFinished,
  learningGroup, makeAssessment, nextProgress, repeatQueue, scopeCounts, scoreTiles, selectTerms, setAllTiles,
  summarizeSession
} from '../../js/core/study.js';
import { addTerm, makeBranch, makeLibrary } from './helpers.js';

const FULL = { descriptionPL: 'opis', descriptionEN: 'description', examplePL: 'przykład', exampleEN: 'example' };
const PL_EN = 'pl_en';
const EN_PL = 'en_pl';

/** Powtarzalny generator liczb losowych do testów kolejności. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function setup() {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library, { domain: 'D', module: 'M', lesson: 'L1' });
  const full = await addTerm(library, branch.lesson, 'bilans', 'balance sheet', FULL);
  const noExample = await addTerm(library, branch.lesson, 'aktywa', 'assets', { descriptionPL: 'opis' });
  const bare = await addTerm(library, branch.lesson, 'pasywa', 'liabilities');
  return { library, adapter, branch, full, noExample, bare };
}

const config = (extra = {}) => ({ direction: PL_EN, scope: 'all', count: 0, shuffle: false, front: 'term', ...extra });

// ---------------------------------------------------------------- kafelki i wynik

test('kafelki: brakujący opis lub przykład to „Brak danych”, a nie „Nie umiem”', async () => {
  const { full, noExample, bare } = await setup();
  assert.deepEqual(emptyTiles(full), { term: false, description: false, example: false });
  assert.deepEqual(emptyTiles(noExample), { term: false, description: false, example: null });
  assert.deepEqual(emptyTiles(bare), { term: false, description: null, example: null });
  assert.deepEqual([full, noExample, bare].map(availableElementCount), [3, 2, 1]);
});

test('wynik jest liczony względem dostępnych elementów: 0/3–3/3, 2/2, 1/1', () => {
  assert.deepEqual(scoreTiles({ term: false, description: false, example: false }), { score: 0, available: 3 });
  assert.deepEqual(scoreTiles({ term: true, description: false, example: false }), { score: 1, available: 3 });
  assert.deepEqual(scoreTiles({ term: true, description: true, example: false }), { score: 2, available: 3 });
  assert.deepEqual(scoreTiles({ term: true, description: true, example: true }), { score: 3, available: 3 });
  assert.deepEqual(scoreTiles({ term: true, description: true, example: null }), { score: 2, available: 2 });
  assert.deepEqual(scoreTiles({ term: true, description: null, example: null }), { score: 1, available: 1 });
});

test('status oceny: pełna fiszka i fiszki z mniejszą liczbą elementów', async () => {
  const { full, noExample, bare } = await setup();
  const status = (term, tiles) => makeAssessment({ term, direction: PL_EN, tiles, decision: DECISIONS.KNOW }).assessmentStatus;
  const three = (a, b, c) => ({ term: a, description: b, example: c });
  assert.equal(status(full, three(true, true, true)), 'mastered');
  assert.equal(status(full, three(true, true, false)), 'partiallyMastered');
  assert.equal(status(full, three(true, false, false)), 'inProgress');
  assert.equal(status(full, three(false, false, false)), 'toLearn');
  // Dwa dostępne elementy: 2/2 opanowane, 1/2 częściowo, 0/2 do nauki.
  assert.equal(status(noExample, three(true, true, null)), 'mastered');
  assert.equal(status(noExample, three(true, false, null)), 'partiallyMastered');
  assert.equal(status(noExample, three(false, false, null)), 'toLearn');
  // Jeden dostępny element: 1/1 opanowane.
  assert.equal(status(bare, three(true, null, null)), 'mastered');
  assert.equal(status(bare, three(false, null, null)), 'toLearn');

  const record = makeAssessment({ term: noExample, direction: EN_PL, tiles: three(true, true, null), decision: DECISIONS.REPEAT, sessionID: 's1' });
  assert.deepEqual(
    [record.termID, record.direction, record.sessionID, record.knowsTerm, record.knowsDescription, record.knowsExample,
      record.totalScore, record.availableElementCount, record.swipeDecision],
    [noExample.id, EN_PL, 's1', true, true, null, 2, 2, 'repeat']
  );
});

test('szybkie ocenianie zaznacza i odznacza tylko dostępne kafelki', () => {
  const tiles = { term: false, description: true, example: null };
  assert.deepEqual(setAllTiles(tiles, true), { term: true, description: true, example: null });
  assert.deepEqual(setAllTiles(tiles, false), { term: false, description: false, example: null });
});

// ---------------------------------------------------------------- treść fiszki

test('treść fiszki zależy od kierunku', async () => {
  const { full } = await setup();
  const forward = cardContent(full, PL_EN);
  assert.deepEqual(forward.front, { kind: 'term', text: 'bilans', lang: 'pl' });
  assert.deepEqual(forward.back.answer, { text: 'balance sheet', lang: 'en' });
  // Na odwrocie najpierw treść w języku odpowiedzi, potem w języku pytania.
  assert.deepEqual(forward.back.descriptions, [{ text: 'description', lang: 'en' }, { text: 'opis', lang: 'pl' }]);
  assert.deepEqual(forward.back.examples, [{ text: 'example', lang: 'en' }, { text: 'przykład', lang: 'pl' }]);

  const backward = cardContent(full, EN_PL);
  assert.deepEqual(backward.front, { kind: 'term', text: 'balance sheet', lang: 'en' });
  assert.deepEqual(backward.back.answer, { text: 'bilans', lang: 'pl' });
  assert.deepEqual(backward.back.descriptions.map((item) => item.lang), ['pl', 'en']);
});

test('pierwsza strona: pojęcie, definicja albo przykład; brak treści wraca do pojęcia', async () => {
  const { full, noExample, bare } = await setup();
  assert.deepEqual(cardContent(full, PL_EN, 'description').front, { kind: 'description', text: 'opis', lang: 'pl' });
  assert.deepEqual(cardContent(full, EN_PL, 'example').front, { kind: 'example', text: 'example', lang: 'en' });
  // Na odwrocie widać wtedy także pojęcie w języku pytania.
  assert.deepEqual(cardContent(full, PL_EN, 'description').back.question, { text: 'bilans', lang: 'pl' });
  // Pojęcie ma tylko polski opis: w kierunku EN→PL pierwszą stroną zostaje pojęcie.
  assert.equal(cardContent(noExample, EN_PL, 'description').front.kind, 'term');
  assert.equal(cardContent(noExample, PL_EN, 'example').front.kind, 'term');
  assert.deepEqual(cardContent(bare, PL_EN, 'example').back, {
    answer: { text: 'liabilities', lang: 'en' }, question: { text: 'pasywa', lang: 'pl' }, descriptions: [], examples: []
  });
});

// ---------------------------------------------------------------- kolejka

test('dobór materiału: dziedzina, moduł i wybrane lekcje', async () => {
  const { library, branch } = await setup();
  const second = await library.createLesson({ name: 'L2' }, { existing: branch.module.id });
  await addTerm(library, second, 'kapitał', 'equity');
  const other = await makeBranch(library, { domain: 'Inna', module: 'X', lesson: 'Y' });
  await addTerm(library, other.lesson, 'obcy', 'foreign');
  const names = (selection) => selectTerms(library, selection).map((term) => term.termPL);

  assert.deepEqual(names({}), ['bilans', 'aktywa', 'pasywa', 'kapitał', 'obcy']);
  assert.deepEqual(names({ domainID: branch.domain.id }), ['bilans', 'aktywa', 'pasywa', 'kapitał']);
  assert.deepEqual(names({ moduleID: branch.module.id, lessonIDs: [second.id] }), ['kapitał']);
  assert.deepEqual(names({ lessonIDs: [second.id, other.lesson.id] }), ['kapitał', 'obcy']);
  assert.deepEqual(names({ moduleID: other.module.id }), ['obcy']);
});

test('kolejka: kolejność lekcji, liczba fiszek i powtarzalne losowanie', async () => {
  const { library, branch } = await setup();
  for (let index = 0; index < 20; index += 1) await addTerm(library, branch.lesson, `p${index}`, `t${index}`);
  const ordered = buildQueue(library, config());
  assert.equal(ordered.length, 23);
  assert.deepEqual(ordered.slice(0, 3).map((card) => library.getTerm(card.termID).termPL), ['bilans', 'aktywa', 'pasywa']);
  assert.ok(ordered.every((card) => card.direction === PL_EN));
  assert.equal(buildQueue(library, config({ count: 10 })).length, 10);

  const first = buildQueue(library, config({ shuffle: true }), seeded(7));
  const again = buildQueue(library, config({ shuffle: true }), seeded(7));
  const different = buildQueue(library, config({ shuffle: true }), seeded(8));
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, ordered);
  assert.notDeepEqual(first, different);
  assert.deepEqual(first.map((card) => card.termID).sort(), ordered.map((card) => card.termID).sort());
  // Zakres „Losowe” miesza także bez włączonej losowej kolejności.
  assert.notDeepEqual(buildQueue(library, config({ scope: 'random' }), seeded(3)), ordered);
});

test('zakresy: nowe, do powtórki, trudne, ulubione – osobno dla kierunku', async () => {
  const { library, branch, full, noExample, bare } = await setup();
  const hard = await addTerm(library, branch.lesson, 'trudne', 'hard', { difficulty: 5 });
  await library.setFavorite(true, [bare.id]);

  // Oceny w kierunku PL→EN: bilans „Umiem”, aktywa „Powtórz” z 1/2 (częściowo), pasywa „Powtórz” bez kafelków.
  await library.startStudy(config(), [full, noExample, bare].map((term) => ({ termID: term.id, direction: PL_EN })));
  await library.recordStudyDecision({ tiles: {}, decision: DECISIONS.KNOW });
  await library.recordStudyDecision({ tiles: { term: true }, decision: DECISIONS.REPEAT });
  await library.recordStudyDecision({ tiles: { term: false }, decision: DECISIONS.REPEAT });
  await library.finishStudy();

  const names = (extra, now = Date.now()) => buildQueue(library, config(extra), Math.random, now)
    .map((card) => library.getTerm(card.termID).termPL);
  assert.deepEqual(names({ scope: 'new' }), ['trudne']);
  // „Do powtórki” według terminów FSRS (domyślne kroki nauki): pasywa – Again, wraca po 1 min;
  // aktywa – częściowo, czyli Hard: 5,5 min; bilans – Good: 10 min.
  // Kolejność: najpierw najdłużej czekające.
  assert.deepEqual(names({ scope: 'repeat' }), []);
  const minute = 60_000;
  assert.deepEqual(names({ scope: 'repeat' }, Date.now() + 2 * minute), ['pasywa']);
  assert.deepEqual(names({ scope: 'repeat' }, Date.now() + 6 * minute), ['pasywa', 'aktywa']);
  assert.deepEqual(names({ scope: 'repeat' }, Date.now() + 11 * minute), ['pasywa', 'aktywa', 'bilans']);
  assert.deepEqual(names({ scope: 'repeat', count: 2 }, Date.now() + 11 * minute), ['pasywa', 'aktywa'], 'limit bierze najbardziej zaległe');
  assert.deepEqual(names({ scope: 'hard' }), ['pasywa', 'trudne']);
  assert.deepEqual(names({ scope: 'favorites' }), ['pasywa']);
  // Częściowo zapamiętane: „Powtórz” z częścią kafelków (aktywa 1/2); pasywa nieznane, bilans opanowany.
  assert.deepEqual(names({ scope: 'partial' }), ['aktywa']);
  // W drugim kierunku wszystko jest jeszcze nowe.
  assert.deepEqual(names({ scope: 'new', direction: EN_PL }), ['bilans', 'aktywa', 'pasywa', 'trudne']);
  assert.deepEqual(names({ scope: 'repeat', direction: EN_PL }, Date.now() + 11 * minute), []);

  // Braki według ostatniej oceny: pasywa – nieznane pojęcie, aktywa – znane pojęcie bez definicji;
  // aktywa nie ma przykładu, a bilans ma komplet – żadne nie trafia do „Nie znam przykładu”.
  assert.deepEqual(names({ scope: 'unknownTerm' }), ['pasywa']);
  assert.deepEqual(names({ scope: 'unknownDescription' }), ['aktywa']);
  assert.deepEqual(names({ scope: 'unknownExample' }), []);
  assert.deepEqual(names({ scope: 'unknownTerm', direction: EN_PL }), [], 'drugi kierunek nie był oceniany');

  assert.deepEqual(scopeCounts(library, config(), Date.now() + 11 * minute), {
    all: 4, new: 1, repeat: 3, partial: 1, hard: 2, unknownTerm: 1, unknownDescription: 1, unknownExample: 0,
    quizErrors: 0, favorites: 1, random: 4
  });
  assert.equal(isHard(hard, null), true);
  assert.equal(isHard(full, library.getProgress(full.id, PL_EN)), false);

  // Tryb mieszany: każde pojęcie raz; „nowe” wybiera kierunek, w którym pojęcie jest nowe.
  const mixed = buildQueue(library, config({ direction: 'mixed', scope: 'new' }), seeded(1));
  assert.equal(mixed.length, 4);
  const byTerm = new Map(mixed.map((card) => [card.termID, card.direction]));
  assert.equal(byTerm.get(full.id), EN_PL);
  assert.equal(byTerm.get(noExample.id), EN_PL);
  const all = buildQueue(library, config({ direction: 'mixed' }), seeded(5));
  assert.equal(new Set(all.map((card) => card.termID)).size, 4);
  assert.ok(new Set(all.map((card) => card.direction)).size === 2, 'tryb mieszany używa obu kierunków');
});

// ---------------------------------------------------------------- decyzje, postęp, historia

test('zatwierdzenie fiszki: wpis w historii, postęp kierunku i przesunięcie sesji w jednej operacji', async () => {
  const { library, adapter, full, noExample } = await setup();
  const queue = [full, noExample].map((term) => ({ termID: term.id, direction: PL_EN }));
  const session = await library.startStudy(config(), queue);
  assert.deepEqual([session.position, session.results.length, session.queue.length], [0, 0, 2]);
  assert.equal(library.getProgress(full.id, PL_EN), null);
  assert.equal(describeProgress(null), 'Jeszcze nie oceniane');

  // „Powtórz” z częścią zaznaczonych kafelków: fiszka częściowo zapamiętana.
  const afterFirst = await library.recordStudyDecision({ tiles: { term: true, description: true, example: false }, decision: DECISIONS.REPEAT });
  assert.equal(afterFirst.position, 1);
  const progress = library.getProgress(full.id, PL_EN);
  assert.deepEqual(
    [progress.reviewCount, progress.correctCount, progress.incorrectCount, progress.lastScore, progress.lastAvailable,
      progress.lastStatus, progress.lastDecision, progress.knowsTerm, progress.knowsDescription, progress.knowsExample],
    [1, 0, 1, 2, 3, 'partiallyMastered', 'repeat', true, true, false]
  );
  assert.deepEqual([progress.lessonID, progress.moduleID, progress.domainID], [full.lessonID, full.moduleID, full.domainID]);
  assert.equal(describeProgress(progress), '2/3 – Częściowo opanowane');
  assert.equal(REPEAT_KINDS.partial(progress), true);
  assert.equal(REPEAT_KINDS.repeat(progress), true);
  // „Umiem” oznacza komplet: kafelki są zaliczone niezależnie od zaznaczenia.
  await library.recordStudyDecision({ tiles: { term: false, description: false }, decision: DECISIONS.KNOW });
  const known = library.getProgress(noExample.id, PL_EN);
  assert.deepEqual([known.lastScore, known.lastAvailable, known.lastStatus, known.knowsTerm, known.knowsDescription, known.knowsExample],
    [2, 2, 'mastered', true, true, null]);
  // Drugi kierunek pozostaje nietknięty.
  assert.equal(library.getProgress(full.id, EN_PL), null);

  const history = await library.termAssessments(full.id);
  assert.equal(history.length, 1);
  assert.deepEqual([history[0].totalScore, history[0].availableElementCount, history[0].assessmentStatus, history[0].sessionID],
    [2, 3, 'partiallyMastered', session.id]);
  assert.equal(await adapter.count('assessments'), 2);
  assert.equal(await adapter.count('progress'), 2);
  assert.equal((await adapter.readStore('settings'))[0].activeStudySession.position, 2);
});

test('kafelek elementu, którego pojęcie nie ma, nie wpływa na wynik nawet po zaznaczeniu', async () => {
  const { library, bare } = await setup();
  await library.startStudy(config(), [{ termID: bare.id, direction: PL_EN }]);
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });
  const progress = library.getProgress(bare.id, PL_EN);
  assert.deepEqual([progress.lastScore, progress.lastAvailable, progress.lastStatus, progress.knowsDescription, progress.knowsExample],
    [1, 1, 'mastered', null, null]);
  assert.equal(learningGroup(progress), 'mastered');
});

test('pełny wynik z decyzją „Powtórz” trafia do powtórki, nie do opanowanych', async () => {
  const { library, full } = await setup();
  await library.startStudy(config(), [{ termID: full.id, direction: PL_EN }]);
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.REPEAT });
  const progress = library.getProgress(full.id, PL_EN);
  assert.equal(progress.lastStatus, 'mastered');
  assert.equal(learningGroup(progress), 'repeat');
  assert.deepEqual([progress.correctCount, progress.incorrectCount], [0, 1]);
});

test('kolejne oceny tego samego pojęcia dopisują się do historii i nie nadpisują wcześniejszych', async () => {
  const { library, adapter, full } = await setup();
  const card = { termID: full.id, direction: PL_EN };
  await library.startStudy(config(), [card, card]);
  await library.recordStudyDecision({ tiles: { term: false, description: false, example: false }, decision: DECISIONS.REPEAT });
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });

  const history = await library.termAssessments(full.id);
  assert.deepEqual(history.map((entry) => entry.totalScore).sort(), [0, 3]);
  assert.equal(await adapter.count('assessments'), 2);
  const progress = library.getProgress(full.id, PL_EN);
  assert.deepEqual([progress.reviewCount, progress.correctCount, progress.incorrectCount, progress.lastStatus], [2, 1, 1, 'mastered']);
  assert.equal(await adapter.count('progress'), 1, 'jeden rekord postępu na pojęcie i kierunek');
});

test('postępy obu kierunków są niezależne', async () => {
  const { library, adapter, full } = await setup();
  await library.startStudy(config({ direction: 'mixed' }), [
    { termID: full.id, direction: PL_EN }, { termID: full.id, direction: EN_PL }
  ]);
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });
  await library.recordStudyDecision({ tiles: { term: false, description: false, example: false }, decision: DECISIONS.REPEAT });
  assert.equal(learningGroup(library.getProgress(full.id, PL_EN)), 'mastered');
  assert.equal(learningGroup(library.getProgress(full.id, EN_PL)), 'repeat');
  assert.equal(await adapter.count('progress'), 2);
  assert.deepEqual((await library.termAssessments(full.id)).map((entry) => entry.direction).sort(), [EN_PL, PL_EN]);
});

test('nieprawidłowe wywołania są odrzucane i niczego nie zapisują', async () => {
  const { library, adapter, full } = await setup();
  await assert.rejects(library.recordStudyDecision({ tiles: {}, decision: DECISIONS.KNOW }), (error) => error.code === 'noStudySession');
  await assert.rejects(library.startStudy(config(), []), (error) => error.code === 'emptyStudyQueue');
  await assert.rejects(library.undoStudyDecision(), (error) => error.code === 'nothingToUndo');
  await assert.rejects(library.finishStudy(), (error) => error instanceof LibraryError);
  await library.startStudy(config(), [{ termID: full.id, direction: PL_EN }]);
  await assert.rejects(library.recordStudyDecision({ tiles: {}, decision: 'maybe' }), (error) => error.code === 'invalidDecision');
  assert.equal(await adapter.count('assessments'), 0);
  assert.equal(library.getStudySession().position, 0);
});

test('nieudany zapis decyzji nie przesuwa sesji i nie zostawia oceny', async () => {
  const { library, adapter, full } = await setup();
  await library.startStudy(config(), [{ termID: full.id, direction: PL_EN }]);
  adapter.failNextCommit = new Error('brak miejsca');
  await assert.rejects(library.recordStudyDecision({ tiles: { term: true }, decision: DECISIONS.KNOW }), /brak miejsca/);
  assert.equal(library.getStudySession().position, 0);
  assert.equal(library.getProgress(full.id, PL_EN), null);
  assert.equal(await adapter.count('assessments'), 0);
  // Ponowna próba działa.
  await library.recordStudyDecision({ tiles: { term: true }, decision: DECISIONS.KNOW });
  assert.equal(library.getStudySession().position, 1);
});

// ---------------------------------------------------------------- cofanie

test('cofnięcie decyzji przywraca poprzedni postęp i usuwa wpis z historii', async () => {
  const { library, adapter, full, noExample } = await setup();
  const queue = [full, noExample, full].map((term) => ({ termID: term.id, direction: PL_EN }));
  await library.startStudy(config(), queue);
  await library.recordStudyDecision({ tiles: { term: true, description: false, example: false }, decision: DECISIONS.REPEAT });
  const firstProgress = library.getProgress(full.id, PL_EN);
  await library.recordStudyDecision({ tiles: { term: true, description: true }, decision: DECISIONS.KNOW });
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });
  assert.equal(library.getProgress(full.id, PL_EN).reviewCount, 2);
  assert.equal(await adapter.count('assessments'), 3);

  // Cofnięcie trzeciej decyzji: postęp „bilansu” wraca do stanu po pierwszej ocenie.
  let session = await library.undoStudyDecision();
  assert.deepEqual([session.position, session.results.length], [2, 2]);
  assert.deepEqual(library.getProgress(full.id, PL_EN), firstProgress);
  assert.equal(await adapter.count('assessments'), 2);
  assert.equal((await library.termAssessments(full.id)).length, 1);

  // Cofnięcie drugiej: pojęcie, które wcześniej nie miało postępu, znów go nie ma.
  session = await library.undoStudyDecision();
  assert.equal(session.position, 1);
  assert.equal(library.getProgress(noExample.id, PL_EN), null);
  assert.equal(await adapter.count('progress'), 1);

  // Cofnięcie pierwszej i brak kolejnych decyzji do cofnięcia.
  session = await library.undoStudyDecision();
  assert.deepEqual([session.position, session.results.length], [0, 0]);
  assert.equal(await adapter.count('assessments'), 0);
  assert.equal(await adapter.count('progress'), 0);
  await assert.rejects(library.undoStudyDecision(), (error) => error.code === 'nothingToUndo');

  // Po cofnięciu fiszkę można ocenić ponownie.
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });
  assert.equal(learningGroup(library.getProgress(full.id, PL_EN)), 'mastered');
});

// ---------------------------------------------------------------- sesja

test('sesję można wznowić po ponownym uruchomieniu aplikacji', async () => {
  const { library, adapter, full, noExample, bare } = await setup();
  const queue = [full, noExample, bare].map((term) => ({ termID: term.id, direction: PL_EN }));
  const started = await library.startStudy(config({ front: 'description' }), queue);
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });

  const reopened = new Library(adapter);
  await reopened.load();
  const session = reopened.getStudySession();
  assert.equal(session.id, started.id);
  assert.deepEqual([session.position, session.queue.length, session.config.front], [1, 3, 'description']);
  assert.equal(isSessionFinished(session), false);
  // Po wznowieniu działa także cofnięcie ostatniej decyzji.
  await reopened.undoStudyDecision();
  assert.equal(reopened.getProgress(full.id, PL_EN), null);
  await reopened.recordStudyDecision({ tiles: { term: false, description: false, example: false }, decision: DECISIONS.REPEAT });
  assert.equal(reopened.getStudySession().position, 1);
});

test('zakończenie sesji: podsumowanie, wpis w dzienniku sesji i fiszki do rundy powtórkowej', async () => {
  const { library, adapter, branch, full, noExample, bare } = await setup();
  const queue = [full, noExample, bare].map((term) => ({ termID: term.id, direction: PL_EN }));
  await library.startStudy(config({ domainID: branch.domain.id, lessonIDs: [branch.lesson.id] }), queue);
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });
  await library.recordStudyDecision({ tiles: { term: true, description: false }, decision: DECISIONS.REPEAT });
  await library.recordStudyDecision({ tiles: { term: false }, decision: DECISIONS.REPEAT });
  assert.equal(isSessionFinished(library.getStudySession()), true);

  const summary = summarizeSession(library.getStudySession());
  assert.deepEqual(
    [summary.total, summary.assessed, summary.remaining, summary.know, summary.repeat],
    [3, 3, 0, 1, 2]
  );
  assert.deepEqual(summary.statuses, { mastered: 1, partiallyMastered: 1, inProgress: 0, toLearn: 1 });
  assert.deepEqual(summary.repeatQueue, [queue[1], queue[2]]);

  const finished = await library.finishStudy();
  assert.deepEqual(finished.summary, summary);
  assert.equal(library.getStudySession(), null);
  const [record] = await adapter.readStore('studySessions');
  assert.deepEqual(
    [record.direction, record.scope, record.totalCards, record.assessedCards, record.knownCards, record.repeatCards, record.finished],
    [PL_EN, 'all', 3, 3, 1, 2, true]
  );
  assert.deepEqual(record.selectedDomainIDs, [branch.domain.id]);
  assert.deepEqual(record.selectedLessonIDs, [branch.lesson.id]);
  assert.ok(record.completedAt >= record.startedAt);

  // Runda powtórkowa z odłożonymi fiszkami.
  const round = await library.startStudy(config(), summary.repeatQueue, { round: 2 });
  assert.deepEqual([round.round, round.queue.length], [2, 2]);
});

// ---------------------------------------------------------------- powtórzenie całej sesji

const ALL_KNOWN = { term: true, description: true, example: true };

test('„Powtórz całą sesję”: te same fiszki od nowa, także gdy wszystkie oceniono jako „Umiem”', async () => {
  const { library, adapter, full, noExample, bare } = await setup();
  const queue = [full, noExample, bare].map((term) => ({ termID: term.id, direction: PL_EN }));
  const first = await library.startStudy(config({ front: 'example' }), queue);
  for (let index = 0; index < queue.length; index += 1) {
    await library.recordStudyDecision({ tiles: ALL_KNOWN, decision: DECISIONS.KNOW });
  }
  assert.equal(summarizeSession(library.getStudySession()).repeatQueue.length, 0, 'nic nie odłożono do powtórki');
  assert.deepEqual(library.getRepeatableStudy().queue, queue);

  const again = await library.repeatStudy();
  assert.notEqual(again.id, first.id);
  assert.deepEqual(again.queue, queue, 'kolejność jak w lekcjach zostaje');
  assert.deepEqual([again.position, again.round, again.config.front], [0, 1, 'example']);
  // Poprzednia sesja trafiła do dziennika i jest zapamiętana jako ostatnia.
  assert.equal(await adapter.count('studySessions'), 1);
  assert.deepEqual(library.getSettings().lastStudySession.queue, queue);
});

test('runda powtórkowa pamięta pełny zestaw fiszek, więc da się wrócić do całej sesji', async () => {
  const { library, full, noExample, bare } = await setup();
  const queue = [full, noExample, bare].map((term) => ({ termID: term.id, direction: PL_EN }));
  const first = await library.startStudy(config(), queue);
  await library.recordStudyDecision({ tiles: ALL_KNOWN, decision: DECISIONS.KNOW });
  await library.recordStudyDecision({ tiles: {}, decision: DECISIONS.REPEAT });
  await library.recordStudyDecision({ tiles: ALL_KNOWN, decision: DECISIONS.KNOW });
  const repeat = summarizeSession(library.getStudySession()).repeatQueue;
  const round = await library.startStudy(first.config, repeat, { round: 2, baseQueue: first.baseQueue });
  assert.deepEqual(round.queue, [queue[1]]);
  await library.recordStudyDecision({ tiles: ALL_KNOWN, decision: DECISIONS.KNOW });

  assert.deepEqual(library.getRepeatableStudy().queue, queue, 'cała sesja, nie tylko runda powtórkowa');
  const whole = await library.repeatStudy();
  assert.deepEqual([whole.queue, whole.round], [queue, 1]);
});

test('powtórka odłożonych, częściowo zapamiętanych i nieznanych: z całej sesji, według najnowszej oceny', async () => {
  const { library, branch, full, noExample, bare } = await setup();
  const extra = await addTerm(library, branch.lesson, 'zysk', 'profit', FULL);
  const queue = [full, noExample, bare, extra].map((term) => ({ termID: term.id, direction: PL_EN }));
  const first = await library.startStudy(config(), queue);
  await library.recordStudyDecision({ tiles: {}, decision: DECISIONS.KNOW });                  // bilans: „Umiem” = komplet
  await library.recordStudyDecision({ tiles: { term: true }, decision: DECISIONS.REPEAT });    // aktywa: 1/2 – częściowo
  await library.recordStudyDecision({ tiles: {}, decision: DECISIONS.REPEAT });                // pasywa: nic – nieznane
  await library.recordStudyDecision({ tiles: { term: true }, decision: DECISIONS.REPEAT });    // zysk: 1/3 – częściowo

  const names = (kind) => library.getRepeatableStudy(kind)?.queue.map((card) => library.getTerm(card.termID).termPL) ?? [];
  const kinds = () => library.repeatChoices().map((choice) => choice.kind);
  assert.deepEqual(names('repeat'), ['aktywa', 'pasywa', 'zysk']);
  assert.deepEqual(names('partial'), ['aktywa', 'zysk']);
  assert.deepEqual(names('unknown'), ['pasywa']);
  assert.deepEqual(names('all'), ['bilans', 'aktywa', 'pasywa', 'zysk']);
  assert.deepEqual(kinds(), ['repeat', 'partial', 'unknown', 'all']);

  // Runda z częściowo zapamiętanymi to kolejna runda tej samej sesji – pełny zestaw zostaje.
  const round = await library.repeatStudy(Math.random, 'partial');
  assert.deepEqual([round.round, round.queue.length, round.baseQueue.length], [2, 2, 4]);
  assert.deepEqual(round.baseQueue, first.baseQueue);
  await library.recordStudyDecision({ tiles: {}, decision: DECISIONS.KNOW });                                // aktywa: komplet
  await library.recordStudyDecision({ tiles: { term: true, description: true }, decision: DECISIONS.REPEAT }); // zysk: 2/3
  // Nieznane z pierwszej rundy nadal czekają, mimo że nie było ich w tej rundzie.
  assert.deepEqual(names('unknown'), ['pasywa']);
  assert.deepEqual(names('partial'), ['zysk']);
  assert.deepEqual(names('repeat'), ['pasywa', 'zysk']);

  // Po zamknięciu sesji to samo jest dostępne z ostatniej sesji.
  await library.finishStudy();
  assert.equal(library.getStudySession(), null);
  const again = await library.repeatStudy(Math.random, 'unknown');
  assert.deepEqual([again.round, again.queue.length, again.baseQueue.length], [2, 1, 4]);
  assert.equal(library.getTerm(again.queue[0].termID).termPL, 'pasywa');
  await library.recordStudyDecision({ tiles: {}, decision: DECISIONS.KNOW });
  assert.equal(library.getRepeatableStudy('unknown'), null, 'nic nieznanego już nie ma');
  await assert.rejects(library.repeatStudy(Math.random, 'unknown'), (error) => error.code === 'noLastStudy');
  // Odłożone i częściowo zapamiętane to teraz te same fiszki – zostaje jedno polecenie.
  assert.deepEqual(names('repeat'), ['zysk']);
  assert.deepEqual(kinds(), ['repeat', 'all']);
});

test('ostatnią sesję można powtórzyć także po jej zamknięciu i ponownym otwarciu aplikacji', async () => {
  const { library, adapter, branch, full, noExample, bare } = await setup();
  const queue = [full, noExample, bare].map((term) => ({ termID: term.id, direction: EN_PL }));
  await library.startStudy(config({ direction: EN_PL, shuffle: true, lessonIDs: [branch.lesson.id] }), queue);
  await library.recordStudyDecision({ tiles: ALL_KNOWN, decision: DECISIONS.KNOW });
  await library.finishStudy();
  assert.equal(library.getStudySession(), null);

  const reopened = new Library(adapter);
  await reopened.load();
  const repeatable = reopened.getRepeatableStudy();
  assert.deepEqual(repeatable.queue, queue, 'pełny zestaw, także fiszki, do których nie doszło');
  assert.equal(describeStudyMaterial(reopened, repeatable.config), 'Lekcja L1');

  // Kolejność losowa: te same fiszki w nowym porządku, ten sam kierunek.
  const session = await reopened.repeatStudy(seeded(7));
  assert.deepEqual(
    session.queue.map((card) => card.termID).sort(),
    queue.map((card) => card.termID).sort()
  );
  assert.ok(session.queue.every((card) => card.direction === EN_PL));
  assert.deepEqual(repeatQueue(queue, { shuffle: false, scope: 'all' }), queue);
});

test('powtórka pomija usunięte pojęcia; bez sesji do powtórzenia jest czytelny błąd', async () => {
  const { library, full, noExample, bare } = await setup();
  await assert.rejects(library.repeatStudy(), (error) => error instanceof LibraryError && error.code === 'noLastStudy');
  assert.equal(library.getRepeatableStudy(), null);

  const queue = [full, noExample, bare].map((term) => ({ termID: term.id, direction: PL_EN }));
  await library.startStudy(config(), queue);
  // Sesja bez żadnej oceny nie staje się „ostatnią”.
  await library.finishStudy();
  assert.equal(library.getRepeatableStudy(), null);

  await library.startStudy(config(), queue);
  await library.recordStudyDecision({ tiles: ALL_KNOWN, decision: DECISIONS.KNOW });
  await library.finishStudy();
  await library.delete({ kind: 'terms', ids: [noExample.id] });
  assert.deepEqual(library.getRepeatableStudy().queue.map((card) => card.termID), [full.id, bare.id]);

  await library.deleteAllContent();
  assert.equal(library.getSettings().lastStudySession, null);
  assert.equal(library.getRepeatableStudy(), null);
});

test('sesja przerwana przed końcem zapisuje to, co oceniono; sesja bez ocen nie zostawia śladu', async () => {
  const { library, adapter, full, noExample } = await setup();
  const queue = [full, noExample].map((term) => ({ termID: term.id, direction: PL_EN }));
  await library.startStudy(config(), queue);
  await library.finishStudy();
  assert.equal(await adapter.count('studySessions'), 0);

  await library.startStudy(config(), queue);
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });
  // Rozpoczęcie nowej sesji zamyka poprzednią.
  await library.startStudy(config(), queue);
  const records = await adapter.readStore('studySessions');
  assert.equal(records.length, 1);
  assert.deepEqual([records[0].totalCards, records[0].assessedCards, records[0].finished], [2, 1, false]);
  assert.equal(library.getStudySession().position, 0);
});

test('pojęcie usunięte w trakcie sesji jest pomijane, a jego historia znika razem z nim', async () => {
  const { library, adapter, full, noExample, bare } = await setup();
  const queue = [full, noExample, bare].map((term) => ({ termID: term.id, direction: PL_EN }));
  await library.startStudy(config(), queue);
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });
  assert.equal(await adapter.count('assessments'), 1);

  // Usunięcie ocenionego pojęcia czyści jego postęp i historię.
  await library.delete({ kind: 'terms', ids: [full.id, noExample.id] });
  assert.equal(await adapter.count('assessments'), 0);
  assert.equal(await adapter.count('progress'), 0);

  const session = await library.skipMissingStudyCards();
  assert.equal(session.position, 2);
  assert.deepEqual(session.results[1], { skipped: true });
  assert.equal(library.getTerm(session.queue[session.position].termID).termPL, 'pasywa');
  assert.equal(summarizeSession(session).skipped, 1);

  // Cofnięcie pominięcia i decyzji o usuniętym pojęciu nie tworzy osieroconego postępu.
  await library.undoStudyDecision();
  await library.undoStudyDecision();
  assert.equal(library.getStudySession().position, 0);
  assert.equal(await adapter.count('progress'), 0);
  assert.equal((await library.skipMissingStudyCards()).position, 2);
});

test('przeniesienie pojęcia aktualizuje klucze zakresu w jego postępie', async () => {
  const { library, branch, full } = await setup();
  await library.startStudy(config(), [{ termID: full.id, direction: PL_EN }]);
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW });
  const other = await makeBranch(library, { domain: 'Inna', module: 'X', lesson: 'Y' });
  await library.moveTerms([full.id], other.lesson.id);
  const progress = library.getProgress(full.id, PL_EN);
  assert.deepEqual([progress.lessonID, progress.moduleID, progress.domainID], [other.lesson.id, other.module.id, other.domain.id]);
  assert.notEqual(progress.lessonID, branch.lesson.id);
});

test('kopia zapasowa przenosi historię ocen, postępy i trwającą sesję', async () => {
  const { library, full, noExample } = await setup();
  await library.startStudy(config(), [full, noExample].map((term) => ({ termID: term.id, direction: PL_EN })));
  await library.recordStudyDecision({ tiles: { term: true, description: true, example: false }, decision: DECISIONS.REPEAT });
  const backup = JSON.parse(JSON.stringify(await createBackup(library, '0.3.0')));
  assert.equal(backup.counts.assessments, 1);

  const target = await makeLibrary();
  await restoreBackup(target.library, backup);
  assert.equal(target.library.getStudySession().position, 1);
  assert.equal(target.library.getProgress(full.id, PL_EN).lastScore, 2);
  assert.equal((await target.library.termAssessments(full.id)).length, 1);
  await target.library.recordStudyDecision({ tiles: { term: true, description: true }, decision: DECISIONS.KNOW });
  assert.equal(await target.adapter.count('assessments'), 2);
});

test('usunięcie wszystkich danych kończy trwającą sesję', async () => {
  const { library, adapter, full } = await setup();
  await library.startStudy(config(), [{ termID: full.id, direction: PL_EN }]);
  await library.recordStudyDecision({ tiles: { term: true }, decision: DECISIONS.REPEAT });
  await library.deleteAllContent();
  assert.equal(library.getStudySession(), null);
  assert.equal((await adapter.readStore('settings'))[0].activeStudySession, null);
  assert.equal(await adapter.count('assessments'), 0);
  assert.equal(await adapter.count('studySessions'), 0);
});

test('nextProgress zachowuje identyfikator i datę utworzenia istniejącego postępu', async () => {
  const { full } = await setup();
  const first = makeAssessment({ term: full, direction: PL_EN, tiles: { term: true, description: false, example: false }, decision: DECISIONS.KNOW, now: '2026-10-01T10:00:00.000Z' });
  const created = nextProgress(null, full, first);
  const second = makeAssessment({ term: full, direction: PL_EN, tiles: { term: true, description: true, example: true }, decision: DECISIONS.KNOW, now: '2026-10-02T10:00:00.000Z' });
  const updated = nextProgress(created, full, second);
  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, '2026-10-01T10:00:00.000Z');
  assert.deepEqual([updated.updatedAt, updated.lastReviewedAt, updated.reviewCount], ['2026-10-02T10:00:00.000Z', '2026-10-02T10:00:00.000Z', 2]);
});
