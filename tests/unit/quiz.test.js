// Quizy: pytania jednokrotnego wyboru, dopasowywanie, test mieszany, wynik, zapis i historia.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackup, restoreBackup } from '../../js/core/backup.js';
import { Library } from '../../js/core/library.js';
import {
  answerChoice, answerMatching, buildQuiz, choiceQuestion, countAnswers, formatDuration, matchingRound, quizResult,
  roundSizes, summarizeQuiz
} from '../../js/core/quiz.js';
import { DECISIONS, buildQueue } from '../../js/core/study.js';
import { normalizeKey } from '../../js/core/text.js';
import { addTerm, makeLibrary } from './helpers.js';

const PL_EN = 'pl_en';
const EN_PL = 'en_pl';

/** Powtarzalny generator liczb losowych. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dwie dziedziny: finanse (6 pojęć w dwóch lekcjach) i prawo (4 pojęcia). */
async function setup() {
  const { library, adapter } = await makeLibrary();
  const ratios = await library.createLesson({ name: 'Wskaźniki' }, { create: { name: 'Finanse' }, domain: { create: { name: 'Biznes' } } });
  const reports = await library.createLesson({ name: 'Sprawozdania' }, { existing: ratios.moduleID });
  const contracts = await library.createLesson({ name: 'Umowy' }, { create: { name: 'Cywilne' }, domain: { create: { name: 'Prawo' } } });
  const finance = [];
  for (const [pl, en, lesson] of [
    ['aktywa', 'assets', ratios], ['pasywa', 'liabilities', ratios], ['zysk', 'profit', ratios],
    ['bilans', 'balance sheet', reports], ['przychód', 'revenue', reports], ['koszt', 'cost', reports]
  ]) finance.push(await addTerm(library, lesson, pl, en));
  const law = [];
  for (const [pl, en] of [['umowa', 'contract'], ['strona', 'party'], ['kara', 'penalty'], ['termin', 'deadline']]) {
    law.push(await addTerm(library, contracts, pl, en));
  }
  return { library, adapter, finance, law, ratios, reports, contracts };
}

const quizConfig = (extra = {}) => ({
  type: 'choice', direction: PL_EN, count: 0, choiceShare: 0.6, pairsPerRound: 5, threshold: 0.8, timeLimit: 0, ...extra
});

// ---------------------------------------------------------------- jednokrotny wybór

test('pytanie wyboru: 4 różne odpowiedzi, jedna poprawna, błędne z tej samej dziedziny', async () => {
  const { library, finance } = await setup();
  const pool = [...library.listDomains()].flatMap((domain) => library.listModules(domain.id))
    .flatMap((module) => library.listLessons(module.id)).flatMap((lesson) => library.listTerms(lesson.id));
  for (let seed = 1; seed <= 20; seed += 1) {
    const question = choiceQuestion(finance[0], PL_EN, pool, seeded(seed));
    assert.equal(question.options.length, 4);
    assert.equal(question.prompt.text, 'aktywa');
    assert.equal(question.options[question.correctIndex].text, 'assets');
    assert.equal(new Set(question.options.map((option) => normalizeKey(option.text))).size, 4, 'bez powtórzeń');
    // Pięć innych pojęć z finansów wystarcza – żadne nie pochodzi z prawa.
    const domains = question.options.map((option) => library.getTerm(option.termID).domainID);
    assert.ok(domains.every((id) => id === finance[0].domainID), `dziedziny: ${domains}`);
  }
  const reverse = choiceQuestion(finance[0], EN_PL, pool, seeded(3));
  assert.equal(reverse.prompt.text, 'assets');
  assert.equal(reverse.options[reverse.correctIndex].text, 'aktywa');
});

test('pytanie wyboru: brakujące błędne odpowiedzi z innych dziedzin, mniej odpowiedzi albo pominięcie', async () => {
  const { library, law, finance } = await setup();
  // W prawie są tylko 3 inne pojęcia – czwarta odpowiedź nie jest potrzebna z innej dziedziny.
  const lawOnly = choiceQuestion(law[0], PL_EN, [...law, ...finance], seeded(1));
  assert.equal(lawOnly.options.length, 4);
  // Gdy w dziedzinie jest za mało pojęć, uzupełniają ją inne dziedziny.
  const mixedPool = choiceQuestion(law[0], PL_EN, [law[0], law[1], ...finance], seeded(2));
  const fromLaw = mixedPool.options.filter((option) => library.getTerm(option.termID).domainID === law[0].domainID);
  assert.equal(fromLaw.length, 2, 'najpierw ta sama dziedzina');
  // Odpowiedzi o tym samym brzmieniu (bez wielkości liter i znaków) liczą się raz.
  const twin = await addTerm(library, { id: law[0].lessonID }, 'umowa handlowa', 'Contract');
  const deduped = choiceQuestion(law[0], PL_EN, [law[0], twin, law[1]], seeded(4));
  assert.deepEqual(deduped.options.map((option) => option.text).sort(), ['contract', 'party']);
  // Za mało różnych odpowiedzi: pytanie jest pomijane.
  assert.equal(choiceQuestion(law[0], PL_EN, [law[0], twin], seeded(5)), null);
});

test('pytanie wyboru: pojęcie zapisane drugi raz z innym tłumaczeniem nie jest błędną odpowiedzią', async () => {
  const { library, finance, ratios } = await setup();
  // „aktywa” drugi raz (np. dodane przy imporcie duplikatów) i „Aktywa” z inną wielkością liter.
  const duplicate = await addTerm(library, ratios, 'aktywa', 'property');
  const capitalized = await addTerm(library, ratios, 'Aktywa ', 'holdings');
  const pool = [...finance, duplicate, capitalized];
  for (let seed = 1; seed <= 30; seed += 1) {
    const question = choiceQuestion(finance[0], PL_EN, pool, seeded(seed));
    const texts = question.options.map((option) => option.text);
    assert.ok(!texts.includes('property') && !texts.includes('holdings'), `odpowiedzi: ${texts.join(', ')}`);
    assert.equal(question.options.length, 4);
  }
  // Odwrotnie: dla „property” jedno z „aktywa” byłoby jedyną poprawną odpowiedzią, ale drugie
  // (w EN → PL brzmi tak samo po polsku) nie może trafić jako błędna – odpowiedzi się nie powtarzają.
  const reverse = choiceQuestion(duplicate, EN_PL, pool, seeded(7));
  assert.equal(reverse.options.filter((option) => normalizeKey(option.text) === 'aktywa').length, 1);
});

// ---------------------------------------------------------------- dopasowywanie i budowanie quizu

test('rundy dopasowywania: po 5 par na telefonie, po 8 na szerokim ekranie, równy podział', () => {
  assert.deepEqual(roundSizes(5, 5), [5]);
  assert.deepEqual(roundSizes(8, 5), [4, 4]);
  assert.deepEqual(roundSizes(11, 5), [4, 4, 3]);
  assert.deepEqual(roundSizes(16, 8), [8, 8]);
  assert.deepEqual(roundSizes(0, 5), []);
});

test('quiz jednokrotnego wyboru: liczba pytań, każde pojęcie raz, materiał z wybranych lekcji', async () => {
  const { library, ratios, reports } = await setup();
  const all = buildQuiz(library, quizConfig({ count: 0 }), seeded(1));
  assert.equal(all.items.length, 10);
  assert.equal(all.total, 10);
  assert.equal(new Set(all.items.map((item) => item.termID)).size, 10);
  const limited = buildQuiz(library, quizConfig({ count: 4 }), seeded(2));
  assert.equal(limited.total, 4);
  const lessons = buildQuiz(library, quizConfig({ lessonIDs: [ratios.id], moduleID: ratios.moduleID }), seeded(3));
  assert.deepEqual(lessons.items.map((item) => library.getTerm(item.termID).termPL).sort(), ['aktywa', 'pasywa', 'zysk']);
  // Błędne odpowiedzi mogą pochodzić spoza wybranej lekcji – pytanie i tak ma 4 odpowiedzi.
  assert.ok(lessons.items.every((item) => item.options.length === 4));
  assert.equal(reports.id.length > 0, true);
});

test('quiz dopasowywania i test mieszany: proporcje 60/40, zmiana proporcji, każda para to odpowiedź', async () => {
  const { library } = await setup();
  const matching = buildQuiz(library, quizConfig({ type: 'matching', count: 10 }), seeded(1));
  assert.deepEqual(matching.items.map((item) => item.kind), ['matching', 'matching']);
  assert.deepEqual(matching.items.map((item) => item.pairs.length), [5, 5]);
  assert.equal(matching.total, 10);
  for (const round of matching.items) {
    assert.equal(new Set(round.left.map((item) => item.text)).size, round.pairs.length);
    assert.deepEqual(round.left.map((item) => item.termID).sort(), [...round.pairs].sort());
  }
  const mixed = buildQuiz(library, quizConfig({ type: 'mixed', count: 10 }), seeded(2));
  const kinds = (quiz) => ({
    choice: quiz.items.filter((item) => item.kind === 'choice').length,
    pairs: quiz.items.filter((item) => item.kind === 'matching').reduce((sum, item) => sum + item.pairs.length, 0)
  });
  assert.deepEqual(kinds(mixed), { choice: 6, pairs: 4 });
  assert.equal(mixed.total, 10);
  assert.deepEqual(kinds(buildQuiz(library, quizConfig({ type: 'mixed', count: 10, choiceShare: 0.8 }), seeded(3))), { choice: 8, pairs: 2 });
  // Jedna para nie tworzy rundy – pojęcie dostaje pytanie wyboru (3 pytania: 60% to 2 wybory + 1 para).
  const single = buildQuiz(library, quizConfig({ type: 'mixed', count: 3 }), seeded(4));
  assert.deepEqual(kinds(single), { choice: 3, pairs: 0 });
  assert.equal(single.total, 3);
  // Pojęcia nie powtarzają się między pytaniami i rundami.
  const ids = mixed.items.flatMap((item) => (item.kind === 'matching' ? item.pairs : [item.termID]));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(countAnswers(mixed.items), 10);
});

test('kierunek mieszany i pojęcia wskazane wprost (powtórka błędnych)', async () => {
  const { library, finance } = await setup();
  const mixed = buildQuiz(library, quizConfig({ direction: 'mixed' }), seeded(9));
  assert.deepEqual(new Set(mixed.items.map((item) => item.direction)), new Set([PL_EN, EN_PL]));
  const repeat = buildQuiz(library, quizConfig({ termIDs: [finance[1].id, finance[4].id] }), seeded(1));
  assert.deepEqual(repeat.items.map((item) => item.termID).sort(), [finance[1].id, finance[4].id].sort());
});

// ---------------------------------------------------------------- odpowiedzi i wynik

test('ocena: wybór, pary bez pomyłki, wynik procentowy, próg zaliczenia, lista błędnych', async () => {
  const { finance } = await setup();
  const question = choiceQuestion(finance[0], PL_EN, finance, seeded(1));
  const wrongIndex = (question.correctIndex + 1) % question.options.length;
  assert.equal(answerChoice(question, question.correctIndex).isCorrect, true);
  const wrong = answerChoice(question, wrongIndex);
  assert.deepEqual([wrong.isCorrect, wrong.correctAnswer, wrong.selectedAnswer], [false, 'assets', question.options[wrongIndex].text]);

  const round = matchingRound(finance.slice(0, 4), PL_EN, seeded(2));
  const answers = answerMatching(round, {
    matched: new Set(round.pairs),
    mistakes: new Map([[finance[1].id, 2]]),
    wrongPicks: new Map([[finance[1].id, 'profit']])
  });
  assert.deepEqual(answers.map((answer) => answer.isCorrect), [true, false, true, true]);
  assert.equal(answers[1].selectedAnswer, 'profit');
  // Para niepołączona (koniec czasu) też jest błędna.
  const partial = answerMatching(round, { matched: new Set([finance[0].id]), mistakes: new Map() });
  assert.deepEqual(partial.map((answer) => answer.isCorrect), [true, false, false, false]);

  const summary = summarizeQuiz({ total: 10, answers: [...answers, ...answers.slice(0, 4)], threshold: 0.8, duration: 61_000 });
  assert.deepEqual([summary.correct, summary.incorrect, summary.unanswered, summary.percent, summary.passed], [6, 4, 2, 60, false]);
  assert.deepEqual(summary.wrongTermIDs, [finance[1].id], 'błędne pojęcia bez powtórzeń');
  const exact = summarizeQuiz({ total: 5, answers: [true, true, true, true, false].map((isCorrect, index) => ({ termID: String(index), isCorrect })), threshold: 0.8 });
  assert.deepEqual([exact.percent, exact.passed], [80, true], 'dokładnie próg to zaliczenie');
  assert.equal(formatDuration(61_000), '1:01');
  assert.equal(formatDuration(3_725_000), '1:02:05');
});

// ---------------------------------------------------------------- zapis

test('quiz: zapis odpowiedzi, wynik w historii, statystyki pojęć, bez zmian w powtórkach (FSRS)', async () => {
  const { library, adapter, finance } = await setup();
  const config = quizConfig({ count: 3, lessonIDs: [finance[0].lessonID], moduleID: finance[0].moduleID });
  const built = buildQuiz(library, config, seeded(1));
  const quiz = await library.startQuiz(config, built);
  assert.equal(library.getQuiz().id, quiz.id);

  const [first, second, third] = built.items;
  await library.recordQuizAnswers([{ ...answerChoice(first, first.correctIndex), responseTime: 3000 }]);
  await library.recordQuizAnswers([{ ...answerChoice(second, (second.correctIndex + 1) % 4), responseTime: 5000, usedHint: true }]);
  assert.equal(library.getQuiz().position, 2);
  assert.equal(library.getQuiz().finishedAt, null);

  // Wznowienie po ponownym otwarciu aplikacji.
  const reopened = new Library(adapter);
  await reopened.load();
  assert.equal(reopened.getQuiz().position, 2);
  assert.equal(reopened.getQuizStats(second.termID).lastCorrect, false);

  const finished = await reopened.recordQuizAnswers([{ ...answerChoice(third, third.correctIndex), responseTime: 2000 }]);
  assert.ok(finished.finishedAt, 'ostatnia odpowiedź kończy quiz');
  assert.equal(finished.elapsedMs, 10_000);

  const stored = await adapter.readStore('quizAnswers');
  assert.equal(stored.length, 3);
  assert.ok(stored.every((answer) => answer.sessionID === quiz.id && answer.questionType === 'choice'));
  assert.equal(stored.find((answer) => answer.termID === second.termID).usedHint, true);
  const [record] = await reopened.quizHistory();
  assert.deepEqual(
    [record.totalQuestions, record.correctAnswers, record.incorrectAnswers, record.percent, record.passed, record.finished, record.duration],
    [3, 2, 1, 67, false, true, 10_000]
  );
  assert.deepEqual(record.wrongTermIDs, [second.termID]);
  assert.deepEqual(reopened.getQuizStats(first.termID), { attempts: 1, correct: 1, lastCorrect: true, lastAt: stored[0].answeredAt });

  // Quiz nie tworzy postępów ani wpisów powtórek – harmonogram FSRS jest nietknięty.
  assert.equal(reopened.listProgress().length, 0);
  assert.equal(await adapter.count('reviews'), 0);
  assert.equal(await adapter.count('assessments'), 0);

  // Zakres nauki „Błędy z quizów”: pojęcia, na które ostatnio odpowiedziano źle.
  const errors = buildQueue(reopened, { direction: PL_EN, scope: 'quizErrors', count: 0, shuffle: false });
  assert.deepEqual(errors.map((card) => card.termID), [second.termID]);

  await reopened.closeQuiz();
  assert.equal(reopened.getQuiz(), null);
});

test('koniec czasu i przerwanie: pytania bez odpowiedzi są błędne w wyniku, poprzedni quiz trafia do historii', async () => {
  const { library, adapter } = await setup();
  const config = quizConfig({ type: 'mixed', count: 10, timeLimit: 120 });
  const built = buildQuiz(library, config, seeded(5));
  await library.startQuiz(config, built);
  const firstChoice = built.items[0].kind === 'choice' ? built.items[0] : null;
  if (firstChoice) await library.recordQuizAnswers([answerChoice(firstChoice, firstChoice.correctIndex)]);
  else await library.recordQuizAnswers(answerMatching(built.items[0], { matched: new Set(built.items[0].pairs), mistakes: new Map() }));
  const timedOut = await library.finishQuiz({ timedOut: true, elapsedMs: 120_000 });
  assert.equal(timedOut.timedOut, true);
  const [record] = await library.quizHistory();
  assert.deepEqual([record.timedOut, record.finished, record.totalQuestions], [true, false, 10]);
  assert.equal(record.unanswered, 10 - countAnswers([built.items[0]]));
  assert.equal(record.correctAnswers, countAnswers([built.items[0]]));
  // Pytania bez odpowiedzi nie trafiają do statystyk pojęć.
  assert.equal(await adapter.count('quizAnswers'), countAnswers([built.items[0]]));

  // Nowy quiz po niedokończonym (z odpowiedzią) zapisuje przerwany w historii.
  await library.startQuiz(config, buildQuiz(library, config, seeded(6)));
  const current = library.getQuiz().items[0];
  await library.recordQuizAnswers(current.kind === 'choice'
    ? [answerChoice(current, current.correctIndex)]
    : answerMatching(current, { matched: new Set(current.pairs), mistakes: new Map() }));
  await library.startQuiz(config, buildQuiz(library, config, seeded(7)));
  assert.equal((await library.quizHistory()).length, 2);
  // Quiz bez żadnej odpowiedzi zamknięty – bez wpisu.
  await library.closeQuiz();
  assert.equal((await library.quizHistory()).length, 2);
  await assert.rejects(library.startQuiz(config, { items: [], total: 0 }), (error) => error.code === 'emptyQuiz');
});

test('koniec czasu w trakcie rundy par: połączone pary się liczą, reszta jest bez odpowiedzi; zapis czasu', async () => {
  const { library, adapter } = await setup();
  const config = quizConfig({ type: 'matching', count: 10, timeLimit: 120 });
  const built = buildQuiz(library, config, seeded(3));
  assert.deepEqual(built.items.map((item) => item.pairs.length), [5, 5]);
  await library.startQuiz(config, built);

  // Czas zapisany przy wyjściu z ekranu; cofnięcie zegara nie zmniejsza czasu.
  await library.saveQuizTime(40_000);
  await library.saveQuizTime(10_000);
  assert.equal(library.getQuiz().elapsedMs, 40_000);

  const round = built.items[0];
  const [good, bad, ...untouched] = round.pairs;
  const partial = answerMatching(round, {
    matched: new Set([good, bad]),
    mistakes: new Map([[bad, 1]]),
    wrongPicks: new Map([[bad, 'coś innego']]),
    interrupted: true
  });
  assert.deepEqual(partial.map((answer) => Boolean(answer.unanswered)), round.pairs.map((id) => untouched.includes(id)));

  const finished = await library.finishQuiz({ timedOut: true, elapsedMs: 120_000, partial });
  assert.equal(finished.position, 1, 'przerwana runda liczy się jako rozegrana');
  const result = quizResult(finished);
  assert.deepEqual([result.correct, result.incorrect, result.unanswered, result.percent], [1, 9, 8, 10]);
  assert.equal(result.wrongTermIDs.length, 9, 'pojęcia bez odpowiedzi też są do powtórki');
  assert.equal(result.wrongTermIDs[0], bad);

  // Do statystyk pojęć trafiają tylko próby: para połączona i para z pomyłką.
  const stored = await adapter.readStore('quizAnswers');
  assert.deepEqual(stored.map((answer) => [answer.termID, answer.isCorrect]).sort(), [[bad, false], [good, true]].sort());
  assert.equal(library.getQuizStats(bad).lastCorrect, false);
  assert.equal(library.getQuizStats(untouched[0]), null);

  const [record] = await library.quizHistory();
  assert.deepEqual([record.correctAnswers, record.unanswered, record.percent, record.timedOut], [1, 8, 10, true]);
});

test('kopia zapasowa przenosi odpowiedzi, historię wyników i niedokończony quiz', async () => {
  const { library } = await setup();
  const config = quizConfig({ count: 4 });
  const first = buildQuiz(library, config, seeded(2));
  await library.startQuiz(config, first);
  for (const item of first.items) await library.recordQuizAnswers([answerChoice(item, item.correctIndex)]);
  const second = buildQuiz(library, config, seeded(4));
  await library.startQuiz(config, second);
  await library.recordQuizAnswers([answerChoice(second.items[0], (second.items[0].correctIndex + 1) % second.items[0].options.length)]);
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));

  const { library: target, adapter } = await makeLibrary();
  await restoreBackup(target, backup);
  assert.equal(await adapter.count('quizAnswers'), 5);
  const [record] = await target.quizHistory();
  assert.equal(record.percent, 100);
  const quiz = target.getQuiz();
  assert.deepEqual([quiz.position, quiz.answers.length, quiz.finishedAt], [1, 1, null]);
  assert.equal(target.getQuizStats(second.items[0].termID).lastCorrect, false);
});

test('usunięcie wszystkich danych czyści quiz i jego wyniki', async () => {
  const { library, adapter } = await setup();
  const config = quizConfig({ count: 2 });
  const built = buildQuiz(library, config, seeded(1));
  await library.startQuiz(config, built);
  await library.recordQuizAnswers([answerChoice(built.items[0], built.items[0].correctIndex)]);
  await library.deleteAllContent();
  assert.equal(library.getQuiz(), null);
  assert.equal(await adapter.count('quizAnswers'), 0);
  assert.equal(library.getQuizStats(built.items[0].termID), null);
  assert.equal(DECISIONS.KNOW, 'know');
});
