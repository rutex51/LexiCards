// Statystyki: statusy w kierunkach, znajomość elementów, odtworzenie postępu w czasie,
// powtórki i quizy dziennie, zestawienia według hierarchii, czas nauki.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOTH, LEGACY_CARD_TIME, TERM_STATUS_FILTERS, assessmentDurations, breakdown, breakdownLevels, dailySeries, dayRange,
  dueCount, elementStats, formatStudyTime, isTermDue, overview, quizAccuracy, scopeTerms, statusCounts, studyTime,
  termStatus
} from '../../js/core/stats.js';
import { DECISIONS, MAX_CARD_TIME } from '../../js/core/study.js';
import { addTerm, makeBranch, makeLibrary } from './helpers.js';

const PL_EN = 'pl_en';
const EN_PL = 'en_pl';
const FULL = { descriptionPL: 'opis', descriptionEN: 'description', examplePL: 'przykład', exampleEN: 'example' };
const NONE = { term: false, description: false, example: false };
const NOW = new Date(2026, 9, 12, 18, 0).getTime();

/** Chwila `offset` dni przed NOW o danej godzinie (czas lokalny – tak jak liczy aplikacja). */
function at(offset, hour) {
  const date = new Date(NOW);
  date.setDate(date.getDate() - offset);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

async function setup() {
  const { library, adapter } = await makeLibrary();
  const first = await makeBranch(library, { domain: 'Biznes', module: 'Finanse', lesson: 'Podstawy' });
  const second = await library.createLesson({ name: 'Umowy' }, { create: { name: 'Prawo' }, domain: { existing: first.domain.id } });
  const other = await library.createLesson({ name: 'Pomiary' }, { create: { name: 'Metrologia' }, domain: { create: { name: 'Technika' } } });
  const full = await addTerm(library, first.lesson, 'bilans', 'balance sheet', FULL);
  const noExample = await addTerm(library, first.lesson, 'aktywa', 'assets', { descriptionPL: 'opis' });
  const bare = await addTerm(library, first.lesson, 'pasywa', 'liabilities');
  const contract = await addTerm(library, second, 'umowa', 'contract');
  const gauge = await addTerm(library, other, 'wzorzec', 'gauge');
  return { library, adapter, first, second, other, full, noExample, bare, contract, gauge };
}

/** Jedna fiszka w osobnej sesji, zatwierdzona w chwili `now`. */
async function assess(library, term, direction, decision, tiles, now, duration = null) {
  await library.startStudy({ direction, scope: 'all', count: 0, shuffle: false, front: 'term' }, [{ termID: term.id, direction }]);
  await library.recordStudyDecision({ tiles, decision, now, random: () => 0.5, duration });
}

test('statusy w kierunku i w obu kierunkach (słabszy z dwóch), do powtórki, znajomość elementów', async () => {
  const { library, full, noExample, bare } = await setup();
  const { KNOW, REPEAT } = DECISIONS;
  await assess(library, full, PL_EN, KNOW, {}, at(0, 9));
  await assess(library, noExample, PL_EN, REPEAT, { term: true, description: false }, at(0, 9));
  await assess(library, bare, PL_EN, REPEAT, NONE, at(0, 9));
  await assess(library, full, EN_PL, REPEAT, { term: true, description: true, example: false }, at(0, 9));
  const terms = scopeTerms(library);
  assert.equal(terms.length, 5);

  const counts = (direction) => {
    const { total, ...rest } = statusCounts(library, terms, direction);
    assert.equal(total, 5);
    return rest;
  };
  assert.deepEqual(counts(PL_EN), { mastered: 1, partiallyMastered: 1, inProgress: 0, toLearn: 1, new: 2 });
  assert.deepEqual(counts(EN_PL), { mastered: 0, partiallyMastered: 1, inProgress: 0, toLearn: 0, new: 4 });
  // Oba kierunki: „bilans” opanowany PL → EN, częściowo EN → PL – liczy się słabszy wynik;
  // pojęcia ocenione tylko w jednym kierunku są w drugim nowe.
  assert.deepEqual(counts(BOTH), { mastered: 0, partiallyMastered: 1, inProgress: 0, toLearn: 0, new: 4 });
  assert.equal(termStatus(library, full.id, BOTH), 'partiallyMastered');

  // Terminy FSRS: tuż po ocenie nic nie czeka, dobę później – wszystkie ocenione fiszki.
  assert.equal(dueCount(library, terms, PL_EN, at(0, 9)), 0);
  assert.equal(dueCount(library, terms, PL_EN, at(-1, 12)), 3);
  assert.equal(dueCount(library, terms, EN_PL, at(-1, 12)), 1);
  assert.equal(dueCount(library, terms, BOTH, at(-1, 12)), 3, 'pojęcie liczy się raz, gdy czeka w którymkolwiek kierunku');

  // Elementy: ostatnia ocena każdego elementu; brakujący element nie wchodzi do mianownika.
  assert.deepEqual(elementStats(library, terms, PL_EN), {
    assessed: 3,
    term: { known: 2, total: 3 },
    description: { known: 1, total: 2 },
    example: { known: 1, total: 1 }
  });
  assert.deepEqual(elementStats(library, terms, EN_PL), {
    assessed: 1,
    term: { known: 1, total: 1 },
    description: { known: 1, total: 1 },
    example: { known: 0, total: 1 }
  });
});

test('glosariusz: filtr statusu w kierunku albo w obu; „Do powtórki” osobno od poziomu opanowania', async () => {
  const { library, full, noExample, bare } = await setup();
  const { KNOW, REPEAT } = DECISIONS;
  await assess(library, full, PL_EN, KNOW, {}, at(0, 9));
  await assess(library, noExample, PL_EN, REPEAT, { term: true, description: false }, at(0, 9));
  await assess(library, bare, PL_EN, REPEAT, NONE, at(0, 9));
  await assess(library, full, EN_PL, REPEAT, { term: true, description: true, example: false }, at(0, 9));
  assert.deepEqual(TERM_STATUS_FILTERS.map((item) => item.label),
    ['Nowe', 'Do nauki', 'W trakcie nauki', 'Częściowo opanowane', 'Opanowane', 'Do powtórki']);

  const names = (status, statusDirection, now = at(0, 10)) => library.glossary({ status, statusDirection, now }).items.map((term) => term.termPL);
  assert.deepEqual(names('mastered', PL_EN), ['bilans']);
  assert.deepEqual(names('partiallyMastered', PL_EN), ['aktywa']);
  assert.deepEqual(names('toLearn', PL_EN), ['pasywa']);
  assert.deepEqual(names('new', PL_EN), ['umowa', 'wzorzec']);
  assert.deepEqual(names('partiallyMastered', EN_PL), ['bilans']);
  // Oba kierunki: słabszy status – „bilans” opanowany tylko w jednym kierunku nie jest opanowany.
  assert.deepEqual(names('mastered', BOTH), []);
  assert.deepEqual(names('partiallyMastered', BOTH), ['bilans']);
  // Bez kierunku – oba; pusty status nie filtruje.
  assert.deepEqual(library.glossary({ status: 'new', now: at(0, 10) }).total, 4);
  assert.equal(library.glossary({ status: '' }).total, 5);
  // Do powtórki: tuż po ocenie nic, dobę później – ocenione pojęcia, niezależnie od poziomu.
  assert.deepEqual(names('due', PL_EN, at(0, 9)), []);
  assert.deepEqual(names('due', PL_EN, at(-1, 12)), ['aktywa', 'bilans', 'pasywa']);
  assert.deepEqual(names('due', EN_PL, at(-1, 12)), ['bilans']);
  assert.equal(isTermDue(library, full.id, BOTH, at(-1, 12)), true);
  assert.equal(isTermDue(library, full.id, BOTH, at(0, 9)), false);
  // Status łączy się z pozostałymi filtrami.
  assert.deepEqual(library.glossary({ status: 'new', statusDirection: PL_EN, searchText: 'umo' }).items.map((term) => term.termPL), ['umowa']);
});

test('postęp w czasie odtworzony z historii ocen zgadza się z bieżącym stanem; powtórki i quizy dziennie', async () => {
  const { library, full, noExample, bare } = await setup();
  const { KNOW, REPEAT } = DECISIONS;
  await assess(library, full, PL_EN, REPEAT, NONE, at(2, 10));
  await assess(library, full, PL_EN, KNOW, {}, at(1, 10));
  await assess(library, bare, PL_EN, REPEAT, NONE, at(1, 23));
  await assess(library, noExample, PL_EN, KNOW, {}, at(0, 8));
  await assess(library, full, EN_PL, KNOW, {}, at(0, 9));
  const terms = scopeTerms(library);
  const journals = {
    ...(await library.journals()),
    quizAnswers: [
      { termID: full.id, direction: PL_EN, isCorrect: true, answeredAt: new Date(at(1, 12)).toISOString(), responseTime: 4000 },
      { termID: bare.id, direction: PL_EN, isCorrect: false, answeredAt: new Date(at(1, 12)).toISOString(), responseTime: 6000 },
      { termID: full.id, direction: EN_PL, isCorrect: true, answeredAt: new Date(at(0, 12)).toISOString(), responseTime: 3000 },
      // Poza zakresem dni wykresu.
      { termID: full.id, direction: PL_EN, isCorrect: false, answeredAt: new Date(at(9, 12)).toISOString(), responseTime: 3000 }
    ]
  };

  const series = dailySeries(journals, terms, PL_EN, { days: 3, now: NOW });
  assert.deepEqual(series.map((point) => point.key), dayRange(3, NOW).map((day) => day.key));
  const statuses = series.map(({ statuses: { mastered, toLearn, new: fresh } }) => [mastered, toLearn, fresh]);
  assert.deepEqual(statuses, [[0, 1, 4], [1, 1, 3], [2, 1, 2]]);
  assert.deepEqual(series.map((point) => point.assessed), [1, 2, 3]);
  assert.deepEqual(series.map((point) => point.reviews[PL_EN]), [1, 2, 1]);
  assert.deepEqual(series.map((point) => point.quiz[PL_EN]), [{ correct: 0, total: 0 }, { correct: 1, total: 2 }, { correct: 0, total: 0 }]);
  // Stan na dziś = bieżące postępy.
  const { total, ...now } = statusCounts(library, terms, PL_EN);
  assert.equal(total, 5);
  assert.deepEqual(series.at(-1).statuses, now);

  const both = dailySeries(journals, terms, BOTH, { days: 3, now: NOW });
  assert.deepEqual(both.map((point) => point.statuses.mastered), [0, 0, 1], 'opanowane w obu kierunkach dopiero dziś');
  const { total: bothTotal, ...bothNow } = statusCounts(library, terms, BOTH);
  assert.equal(bothTotal, 5);
  assert.deepEqual(both.at(-1).statuses, bothNow);
  assert.deepEqual(both.at(-1).reviews, { [PL_EN]: 1, [EN_PL]: 1 });
  assert.deepEqual(both.at(-1).quiz[EN_PL], { correct: 1, total: 1 });

  const ids = new Set(terms.map((term) => term.id));
  assert.deepEqual(quizAccuracy(journals.quizAnswers, ids, PL_EN), { correct: 1, total: 3 });
  assert.deepEqual(quizAccuracy(journals.quizAnswers, ids, BOTH), { correct: 2, total: 4 });
  assert.deepEqual(quizAccuracy(journals.quizAnswers, new Set([bare.id]), BOTH), { correct: 0, total: 1 });
});

test('czas nauki: zapisany czas fiszki z limitem, szacunek dla starszych ocen, czas odpowiedzi w quizach', async () => {
  const { library, full, noExample, bare } = await setup();
  await assess(library, full, PL_EN, DECISIONS.KNOW, {}, at(0, 9), 12_000);
  await assess(library, noExample, PL_EN, DECISIONS.KNOW, {}, at(0, 9), 15 * 60_000);
  const recorded = (await library.journals()).assessments;
  assert.deepEqual(recorded.map((assessment) => assessment.duration).sort((a, b) => a - b), [12_000, MAX_CARD_TIME]);

  // Oceny bez zapisanego czasu: odstęp od poprzedniej oceny w sesji (pierwsza – od startu), najwyżej 2 min.
  const start = at(3, 10);
  const legacy = [
    { id: 'a', termID: full.id, direction: PL_EN, sessionID: 's1', assessedAt: new Date(start + 30_000).toISOString() },
    { id: 'b', termID: noExample.id, direction: PL_EN, sessionID: 's1', assessedAt: new Date(start + 90_000).toISOString() },
    { id: 'c', termID: bare.id, direction: EN_PL, sessionID: 's1', assessedAt: new Date(start + 600_000).toISOString() },
    { id: 'd', termID: bare.id, direction: PL_EN, sessionID: 'unknown', assessedAt: new Date(start).toISOString() }
  ];
  const durations = assessmentDurations(legacy, [{ id: 's1', startedAt: new Date(start).toISOString() }]);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => durations.get(id)), [30_000, 60_000, LEGACY_CARD_TIME, 0]);

  const journals = {
    assessments: [...recorded, ...legacy],
    studySessions: [{ id: 's1', startedAt: new Date(start).toISOString() }],
    quizAnswers: [
      { termID: full.id, direction: PL_EN, responseTime: 5_000, answeredAt: new Date(at(0, 12)).toISOString() },
      { termID: bare.id, direction: EN_PL, responseTime: 7_000, answeredAt: new Date(at(5, 12)).toISOString() }
    ]
  };
  const all = new Set([full.id, noExample.id, bare.id]);
  assert.deepEqual(studyTime(journals, all, PL_EN), { flashcards: 12_000 + MAX_CARD_TIME + 90_000, quiz: 5_000, total: 12_000 + MAX_CARD_TIME + 90_000 + 5_000 });
  assert.equal(studyTime(journals, all, BOTH).total, 12_000 + MAX_CARD_TIME + 90_000 + LEGACY_CARD_TIME + 5_000 + 7_000);
  assert.equal(studyTime(journals, all, BOTH, { since: at(1, 0) }).total, 12_000 + MAX_CARD_TIME + 5_000, 'tylko ostatnie dni');
  assert.equal(studyTime(journals, new Set([bare.id]), BOTH).total, LEGACY_CARD_TIME + 7_000, 'tylko pojęcia z zakresu');

  assert.deepEqual(
    [0, 20_000, 25 * 60_000, 65 * 60_000, 12 * 3_600_000].map(formatStudyTime),
    ['0 min', '< 1 min', '25 min', '1 godz. 5 min', '12 godz.']
  );
});

test('zestawienia według dziedzin, modułów i lekcji oraz komplet wskaźników zakresu', async () => {
  const { library, first, second, other, full, noExample, contract, gauge } = await setup();
  await assess(library, full, PL_EN, DECISIONS.KNOW, {}, at(0, 9), 20_000);
  await assess(library, noExample, PL_EN, DECISIONS.KNOW, {}, at(0, 9), 10_000);
  await assess(library, contract, PL_EN, DECISIONS.REPEAT, NONE, at(0, 9), 5_000);
  await assess(library, gauge, EN_PL, DECISIONS.KNOW, {}, at(0, 9), 7_000);

  assert.deepEqual(breakdownLevels({ level: 'library' }), ['domain', 'module', 'lesson']);
  assert.deepEqual(breakdownLevels({ level: 'module', id: first.module.id }), ['lesson']);
  assert.deepEqual(breakdownLevels({ level: 'lesson', id: first.lesson.id }), []);

  const summary = (rows) => rows.map((row) => [row.name, row.counts.mastered, row.counts.total]);
  assert.deepEqual(summary(breakdown(library, { level: 'library' }, 'domain', PL_EN)), [['Biznes', 2, 4], ['Technika', 0, 1]]);
  assert.deepEqual(summary(breakdown(library, { level: 'library' }, 'module', PL_EN)), [['Finanse', 2, 3], ['Prawo', 0, 1], ['Metrologia', 0, 1]]);
  assert.deepEqual(summary(breakdown(library, { level: 'domain', id: first.domain.id }, 'lesson', PL_EN)), [['Podstawy', 2, 3], ['Umowy', 0, 1]]);
  assert.deepEqual(breakdown(library, { level: 'domain', id: first.domain.id }, 'lesson', PL_EN).map((row) => row.parent), ['Finanse', 'Prawo']);
  assert.deepEqual(summary(breakdown(library, { level: 'library' }, 'domain', EN_PL)), [['Biznes', 0, 4], ['Technika', 1, 1]]);
  assert.equal(scopeTerms(library, { level: 'lesson', id: second.id }).length, 1);
  assert.equal(scopeTerms(library, { level: 'module', id: other.moduleID }).length, 1);

  const journals = {
    ...(await library.journals()),
    quizAnswers: [
      { termID: full.id, direction: PL_EN, isCorrect: true, responseTime: 3_000, answeredAt: new Date(at(0, 10)).toISOString() },
      { termID: gauge.id, direction: PL_EN, isCorrect: false, responseTime: 3_000, answeredAt: new Date(at(0, 10)).toISOString() }
    ]
  };
  const business = overview(library, { level: 'domain', id: first.domain.id }, PL_EN, journals, { now: NOW });
  assert.equal(business.terms, 4);
  assert.equal(business.statuses.mastered, 2);
  assert.deepEqual(business.quiz, { correct: 1, total: 1 });
  assert.equal(business.time.total, 20_000 + 10_000 + 5_000 + 3_000);
  assert.equal(business.recentTime.total, business.time.total);
  assert.deepEqual(Object.keys(business.elements), [PL_EN]);
  const everything = overview(library, { level: 'library' }, BOTH, null, { now: NOW });
  assert.deepEqual(Object.keys(everything.elements), [PL_EN, EN_PL], 'oba kierunki osobno');
  assert.equal(everything.quiz, null, 'bez dzienników – pola z dzienników puste');
});

test('dzienniki do statystyk są czytane raz na zmianę dzienników', async () => {
  const { library, full } = await setup();
  const first = library.journals();
  assert.equal(library.journals(), first, 'bez zmian – ten sam odczyt');
  assert.equal((await first).assessments.length, 0);
  await assess(library, full, PL_EN, DECISIONS.KNOW, {}, at(0, 9));
  const second = library.journals();
  assert.notEqual(second, first);
  assert.equal((await second).assessments.length, 1);
  assert.equal((await second).reviews.length, 1);
  // Zmiana ustawień nie dotyczy dzienników – bez ponownego odczytu.
  await library.updateSettings({ statsRange: 90 });
  assert.equal(library.journals(), second);
});
