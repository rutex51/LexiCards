// Powtórki FSRS w nauce: ocena z kafelków, harmonogram w postępie, dziennik, cofanie,
// przeliczenie ocen sprzed FSRS, powtórka na dziś.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackup, parseBackupText, restoreBackup } from '../../js/core/backup.js';
import { RATINGS, STATES, createScheduler, newCard } from '../../js/core/fsrs.js';
import { Library } from '../../js/core/library.js';
import { MemoryAdapter } from '../../js/core/storage.js';
import {
  DECISIONS, buildQueue, describeDue, formatInterval, fsrsRating, masteryLevel, reviewConfig, reviewForecast
} from '../../js/core/study.js';
import { addTerm, makeBranch, makeLibrary } from './helpers.js';

const FULL = { descriptionPL: 'opis', descriptionEN: 'description', examplePL: 'przykład', exampleEN: 'example' };
const PL_EN = 'pl_en';
const EN_PL = 'en_pl';
const MINUTE = 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 12, 7, 0);
const ALL = { term: true, description: true, example: true };
const NONE = { term: false, description: false, example: false };
const fixed = (value) => () => value;

async function setup() {
  const { library, adapter } = await makeLibrary();
  const branch = await makeBranch(library, { domain: 'D', module: 'M', lesson: 'L' });
  const full = await addTerm(library, branch.lesson, 'bilans', 'balance sheet', FULL);
  const noExample = await addTerm(library, branch.lesson, 'aktywa', 'assets', { descriptionPL: 'opis' });
  const bare = await addTerm(library, branch.lesson, 'pasywa', 'liabilities');
  return { library, adapter, branch, full, noExample, bare };
}

const config = (extra = {}) => ({ direction: PL_EN, scope: 'all', count: 0, shuffle: false, front: 'term', ...extra });
const cardsOf = (terms, direction = PL_EN) => terms.map((term) => ({ termID: term.id, direction }));

// ---------------------------------------------------------------- ocena dla FSRS

test('ocena FSRS z kafelków i decyzji: Again / Hard / Good, nigdy Easy', () => {
  const rating = (knowsTerm, totalScore, availableElementCount, swipeDecision) =>
    fsrsRating({ knowsTerm, totalScore, availableElementCount, swipeDecision });
  const { KNOW, REPEAT } = DECISIONS;
  // „Umiem” – komplet (kafelki zaznacza aplikacja).
  assert.equal(rating(true, 3, 3, KNOW), RATINGS.GOOD);
  assert.equal(rating(true, 2, 2, KNOW), RATINGS.GOOD, 'brakujące elementy nie obniżają oceny');
  assert.equal(rating(true, 1, 1, KNOW), RATINGS.GOOD);
  // „Powtórz” – kafelki tak, jak je zaznaczono.
  assert.equal(rating(false, 0, 3, REPEAT), RATINGS.AGAIN, 'nic – nieznane');
  assert.equal(rating(false, 2, 3, REPEAT), RATINGS.AGAIN, 'bez tłumaczenia to zapomnienie, nawet przy 2/3');
  assert.equal(rating(true, 1, 3, REPEAT), RATINGS.HARD, 'częściowo zapamiętane');
  assert.equal(rating(true, 2, 3, REPEAT), RATINGS.HARD);
  assert.equal(rating(true, 1, 2, REPEAT), RATINGS.HARD);
  assert.equal(rating(true, 3, 3, REPEAT), RATINGS.HARD, 'wszystko zaznaczone, ale „Powtórz”');
  assert.equal(rating(false, 0, 1, REPEAT), RATINGS.AGAIN);
  // Oceny ze starszych wersji: „Umiem” z niepełnym wynikiem.
  assert.equal(rating(true, 2, 3, KNOW), RATINGS.HARD);
  assert.equal(rating(false, 0, 3, KNOW), RATINGS.AGAIN);
  // Easy (4) nie występuje w żadnej kombinacji.
  for (const knowsTerm of [true, false]) {
    for (const [score, available] of [[0, 1], [1, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3], [3, 3]]) {
      for (const decision of [KNOW, REPEAT]) assert.notEqual(rating(knowsTerm, score, available, decision), RATINGS.EASY);
    }
  }
});

// ---------------------------------------------------------------- zapis

test('zatwierdzenie fiszki zapisuje harmonogram w postępie kierunku i wpis w dzienniku powtórek', async () => {
  const { library, adapter, full, noExample } = await setup();
  await library.startStudy(config(), cardsOf([full, noExample]));
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 });
  await library.recordStudyDecision({ tiles: { term: true }, decision: DECISIONS.REPEAT, now: T0 + MINUTE });

  const progress = library.getProgress(full.id, PL_EN);
  // Nowa fiszka z oceną Good: pierwszy krok nauki zaliczony, następny za 10 minut.
  assert.deepEqual(
    [progress.schedule.state, progress.schedule.step, Date.parse(progress.schedule.due) - T0, progress.schedule.reps],
    [STATES.LEARNING, 1, 10 * MINUTE, 1]
  );
  assert.equal(progress.lastStatus, 'mastered', 'status ostatniej oceny zostaje osobno');
  assert.equal(library.getProgress(full.id, EN_PL), null, 'drugi kierunek bez zmian');

  const reviews = await adapter.readStore('reviews');
  assert.equal(reviews.length, 2);
  const [assessment] = await library.termAssessments(full.id);
  assert.equal(assessment.review.rating, RATINGS.GOOD);
  assert.equal(assessment.review.stateBefore, 'new');
  assert.equal(assessment.review.interval, 10 * MINUTE);
  const second = (await library.termAssessments(noExample.id))[0];
  assert.equal(second.review.rating, RATINGS.HARD, '1/2 z „Powtórz” – częściowo zapamiętane – to Hard');
  assert.equal(library.getStudySession().results[1].rating, RATINGS.HARD);
});

test('kolejne powtórki: harmonogram zgodny z planistą FSRS, odstępy rosną, zapomnienie liczy się jako lapse', async () => {
  const { library, full } = await setup();
  const scheduler = createScheduler();
  let card = newCard(T0);
  let at = T0;
  const decisions = [
    [ALL, DECISIONS.KNOW, RATINGS.GOOD],
    [ALL, DECISIONS.KNOW, RATINGS.GOOD],
    [ALL, DECISIONS.KNOW, RATINGS.GOOD],
    [NONE, DECISIONS.REPEAT, RATINGS.AGAIN],
    [ALL, DECISIONS.KNOW, RATINGS.GOOD]
  ];
  for (const [tiles, decision, rating] of decisions) {
    await library.startStudy(config(), cardsOf([full]));
    await library.recordStudyDecision({ tiles, decision, now: at, random: fixed(0.5) });
    card = scheduler.review(card, rating, at, fixed(0.5)).card;
    const schedule = library.getProgress(full.id, PL_EN).schedule;
    assert.equal(schedule.state, card.state);
    assert.equal(Date.parse(schedule.due), card.due);
    assert.equal(schedule.stability, card.stability);
    at = card.due;
  }
  const schedule = library.getProgress(full.id, PL_EN).schedule;
  assert.deepEqual([schedule.reps, schedule.lapses], [5, 1]);
  assert.equal(schedule.state, STATES.REVIEW);
});

test('podgląd przed zatwierdzeniem zgadza się z zapisanym wynikiem', async () => {
  const { library, full } = await setup();
  // Fiszka po kilku dniach w powtórkach – odstępy są już dłuższe i rozmyte.
  await library.startStudy(config(), cardsOf([full, full, full]));
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 });
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 + 10 * MINUTE });
  const later = T0 + 5 * DAY;
  const partial = { term: true, description: true, example: false };
  const preview = library.previewStudyDecision(partial, { random: fixed(0.3), now: later });
  assert.equal(preview.know.rating, RATINGS.GOOD, '„Umiem” to komplet, niezależnie od kafelków');
  assert.equal(preview.repeat.rating, RATINGS.HARD, '„Powtórz” z częścią kafelków');
  assert.ok(preview.repeat.interval >= DAY && preview.repeat.interval < preview.know.interval);
  const none = library.previewStudyDecision({}, { random: fixed(0.3), now: later });
  assert.equal(none.repeat.rating, RATINGS.AGAIN);
  assert.equal(none.repeat.interval, 10 * MINUTE, 'Again w powtórkach: ponowna nauka za 10 minut');
  assert.equal(none.know.interval, preview.know.interval);
  await library.recordStudyDecision({ tiles: partial, decision: DECISIONS.REPEAT, random: fixed(0.3), now: later });
  assert.equal(Date.parse(library.getProgress(full.id, PL_EN).schedule.due) - later, preview.repeat.interval);
});

test('docelowa skuteczność z ustawień zmienia odstępy: 95% częściej niż 90%', async () => {
  const intervalFor = async (retention) => {
    const { library, full } = await setup();
    await library.updateSettings({ desiredRetention: retention });
    await library.startStudy(config(), cardsOf([full, full, full]));
    await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 });
    await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 + 10 * MINUTE });
    return library.previewStudyDecision(ALL, { random: fixed(0.5), now: T0 + 20 * DAY }).know.interval;
  };
  assert.ok(await intervalFor(0.95) < await intervalFor(0.9));
});

test('cofnięcie decyzji usuwa wpis powtórki i przywraca poprzedni harmonogram', async () => {
  const { library, adapter, full } = await setup();
  await library.startStudy(config(), cardsOf([full, full]));
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 });
  const before = structuredClone(library.getProgress(full.id, PL_EN).schedule);
  await library.recordStudyDecision({ tiles: NONE, decision: DECISIONS.REPEAT, now: T0 + MINUTE });
  assert.equal((await adapter.readStore('reviews')).length, 2);
  await library.undoStudyDecision();
  assert.deepEqual(library.getProgress(full.id, PL_EN).schedule, before);
  assert.equal((await adapter.readStore('reviews')).length, 1);
  await library.undoStudyDecision();
  assert.equal(library.getProgress(full.id, PL_EN), null);
  assert.equal((await adapter.readStore('reviews')).length, 0);
});

// ---------------------------------------------------------------- oceny sprzed FSRS

/** Zamienia dane w bazie na postać z wersji 0.3: postęp bez harmonogramu, bez dziennika powtórek. */
async function asLegacy(library, adapter) {
  const data = await library.exportAll();
  data.progress = data.progress.map(({ schedule: _schedule, ...rest }) => rest);
  data.reviews = [];
  await adapter.replaceAll(data);
  return data;
}

test('oceny zapisane przed FSRS są przeliczane na harmonogram przy otwarciu aplikacji', async () => {
  const { library, adapter, full, bare } = await setup();
  await library.startStudy(config(), cardsOf([full, bare, full]));
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 });
  await library.recordStudyDecision({ tiles: NONE, decision: DECISIONS.KNOW, now: T0 + MINUTE });
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 + 12 * MINUTE });
  const expected = Object.fromEntries(library.listProgress().map((progress) => [progress.termID, progress.schedule]));

  await asLegacy(library, adapter);
  const reopened = new Library(adapter);
  await reopened.load();
  for (const progress of reopened.listProgress()) {
    const schedule = progress.schedule;
    assert.ok(schedule, 'harmonogram odtworzony');
    // Przeliczenie bez rozmycia daje to samo, co bieżące powtórki (tu odstępy są krótkie, bez rozmycia).
    assert.equal(schedule.state, expected[progress.termID].state);
    assert.equal(schedule.due, expected[progress.termID].due);
    assert.equal(schedule.reps, expected[progress.termID].reps);
  }
  const reviews = await adapter.readStore('reviews');
  assert.equal(reviews.length, 3);
  assert.ok(reviews.every((review) => review.migrated === true));

  // Drugie otwarcie niczego już nie dopisuje.
  const again = new Library(adapter);
  await again.load();
  assert.equal((await adapter.readStore('reviews')).length, 3);
});

test('przywrócenie kopii z wersji sprzed FSRS też odtwarza harmonogram', async () => {
  const { library, adapter, full } = await setup();
  await library.startStudy(config(), cardsOf([full]));
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 });
  // Dane w postaci, w jakiej zapisałaby je kopia z wersji 0.3.
  const data = await asLegacy(library, adapter);
  assert.equal(data.progress[0].schedule, undefined);
  const backup = await createBackup({ exportAll: async () => data, mediaSummary: () => ({ images: 0, files: 0, size: 0 }) }, '0.3.3');

  const fresh = new Library(new MemoryAdapter());
  await fresh.load();
  await restoreBackup(fresh, parseBackupText(JSON.stringify(backup)));
  const schedule = fresh.getProgress(full.id, PL_EN).schedule;
  assert.equal(schedule.state, STATES.LEARNING);
  assert.equal(Date.parse(schedule.due) - T0, 10 * MINUTE);
});

// ---------------------------------------------------------------- powtórka na dziś

test('powtórka na dziś: zaległe fiszki z całej biblioteki, jedno pojęcie raz, najpierw najstarsze', async () => {
  const { library, full, noExample, bare } = await setup();
  await library.startStudy(config({ direction: 'mixed' }), [
    { termID: full.id, direction: PL_EN },
    { termID: full.id, direction: EN_PL },
    { termID: noExample.id, direction: EN_PL },
    { termID: bare.id, direction: PL_EN }
  ]);
  await library.recordStudyDecision({ tiles: NONE, decision: DECISIONS.REPEAT, now: T0 });            // bilans PL→EN: Again, 1 min
  await library.recordStudyDecision({ tiles: NONE, decision: DECISIONS.REPEAT, now: T0 - 5 * MINUTE }); // bilans EN→PL: Again, wcześniej
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.KNOW, now: T0 });            // aktywa EN→PL: Good, 10 min
  await library.recordStudyDecision({ tiles: ALL, decision: DECISIONS.REPEAT, now: T0 });          // pasywa: Hard, 5,5 min
  await library.finishStudy();

  const settings = library.getSettings();
  const at = (minutes) => T0 + minutes * MINUTE;
  const names = (now) => buildQueue(library, reviewConfig(settings), Math.random, now)
    .map((card) => `${library.getTerm(card.termID).termPL} ${card.direction}`);
  assert.deepEqual(names(at(2)), ['bilans en_pl']);
  assert.deepEqual(names(at(6)), ['bilans en_pl', 'pasywa pl_en']);
  assert.deepEqual(names(at(11)), ['bilans en_pl', 'pasywa pl_en', 'aktywa en_pl']);

  const forecast = reviewForecast(library, at(2));
  assert.equal(forecast.dueNow, 2, 'oba kierunki bilansu są zaległe');
  assert.equal(forecast.next, at(5.5));
  assert.equal(forecast.laterToday + forecast.tomorrow, 2);
});

test('poziom długoterminowy, opis terminu i odstępy po polsku', () => {
  assert.equal(masteryLevel(null), 'new');
  assert.equal(masteryLevel({ schedule: { state: 'learning', stability: 1 } }), 'learning');
  assert.equal(masteryLevel({ schedule: { state: 'relearning', stability: 40 } }), 'learning');
  assert.equal(masteryLevel({ schedule: { state: 'review', stability: 5 } }), 'young');
  assert.equal(masteryLevel({ schedule: { state: 'review', stability: 21 } }), 'mature');
  assert.deepEqual(
    [10 * MINUTE, 5.5 * MINUTE, 3 * 3_600_000, DAY, 3 * DAY, 45 * DAY, 400 * DAY, 3 * 365.25 * DAY, 5 * 365.25 * DAY].map(formatInterval),
    ['10 min', '6 min', '3 godz.', '1 dzień', '3 dni', '1 mies.', '1 rok', '3 lata', '5 lat']
  );
  const progress = { schedule: { due: new Date(T0 + 3 * DAY).toISOString() } };
  assert.equal(describeDue(progress, T0), 'za 3 dni');
  assert.equal(describeDue(progress, T0 + 4 * DAY), 'teraz');
  assert.equal(describeDue(null, T0), null);
});
