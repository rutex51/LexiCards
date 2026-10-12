// FSRS-6: zgodność z oficjalną implementacją py-fsrs i podstawowe własności harmonogramu.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_PARAMETERS, RATINGS, STATES, createScheduler, newCard, roundHalfEven
} from '../../js/core/fsrs.js';

const reference = JSON.parse(await readFile(new URL('../fixtures/fsrs-reference.json', import.meta.url), 'utf8'));
const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 5, 8, 0);

function close(actual, expected, message) {
  if (expected === null) {
    assert.equal(actual, null, message);
    return;
  }
  const tolerance = Math.max(Math.abs(expected), 1) * 1e-9;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} zamiast ${expected}`);
}

test('wektory referencyjne pochodzą z py-fsrs 6.3.2 i obejmują wszystkie ustawienia', () => {
  assert.equal(reference.pyFsrsVersion, '6.3.2');
  assert.equal(reference.configs.length, 4);
  const steps = reference.configs.flatMap((config) => config.histories.flat());
  assert.ok(steps.length > 1000, `powtórek: ${steps.length}`);
  // W danych są wszystkie oceny, wszystkie stany i powtórki z rozmyciem odstępu.
  assert.deepEqual(new Set(steps.map((step) => step.rating)), new Set([1, 2, 3, 4]));
  assert.deepEqual(new Set(steps.map((step) => step.card.state)), new Set(['learning', 'review', 'relearning']));
  assert.ok(steps.some((step) => step.random.length > 0));
});

for (const config of reference.configs) {
  test(`zgodność z py-fsrs krok po kroku: ${config.name}`, () => {
    const scheduler = createScheduler(config.options);
    let reviews = 0;
    config.histories.forEach((history, historyIndex) => {
      let card = newCard(START);
      history.forEach((step, stepIndex) => {
        const where = `historia ${historyIndex + 1}, powtórka ${stepIndex + 1}`;
        const values = [...step.random];
        const random = () => {
          assert.ok(values.length > 0, `${where}: rozmycie wymaga więcej losowań niż w oryginale`);
          return values.shift();
        };
        const result = scheduler.review(card, step.rating, step.at, random);
        assert.equal(values.length, 0, `${where}: niewykorzystane losowania`);
        close(result.retrievability, step.retrievability, `${where}: przypomnienie`);
        card = result.card;
        const expected = step.card;
        assert.equal(card.state, expected.state, `${where}: stan`);
        assert.equal(card.step, expected.step, `${where}: krok`);
        close(card.stability, expected.stability, `${where}: stabilność`);
        close(card.difficulty, expected.difficulty, `${where}: trudność`);
        assert.equal(card.due, expected.due, `${where}: termin (${new Date(card.due).toISOString()} zamiast ${new Date(expected.due).toISOString()})`);
        assert.equal(card.lastReview, expected.lastReview, `${where}: ostatnia powtórka`);
        reviews += 1;
      });
    });
    assert.ok(reviews > 100);
  });
}

test('pierwsza ocena: stabilność to parametr oceny, odstęp przy skuteczności 90% równa się stabilności', () => {
  const scheduler = createScheduler({ learningSteps: [], enableFuzzing: false });
  const expectedDays = { 1: 1, 2: 1, 3: 2, 4: 8 };
  for (const rating of [1, 2, 3, 4]) {
    const { card } = scheduler.review(newCard(START), rating, START);
    assert.equal(card.stability, DEFAULT_PARAMETERS[rating - 1]);
    assert.equal(card.state, STATES.REVIEW);
    assert.equal((card.due - START) / DAY, expectedDays[rating], `ocena ${rating}`);
  }
  // R(t = S) = 90% z definicji współczynnika krzywej zapominania.
  const card = { state: STATES.REVIEW, step: null, stability: 10, difficulty: 5, due: START, lastReview: START };
  assert.ok(Math.abs(scheduler.retrievability(card, START + 10 * DAY) - 0.9) < 1e-12);
  assert.equal(scheduler.nextInterval(10), 10);
});

test('domyślne kroki nauki: Again 1 min, Hard 5,5 min, Good 10 min, potem przejście do powtórek', () => {
  const scheduler = createScheduler({ enableFuzzing: false });
  const minutes = (card, at) => (card.due - at) / 60_000;
  assert.equal(minutes(scheduler.review(newCard(START), RATINGS.AGAIN, START).card, START), 1);
  assert.equal(minutes(scheduler.review(newCard(START), RATINGS.HARD, START).card, START), 5.5);
  const first = scheduler.review(newCard(START), RATINGS.GOOD, START).card;
  assert.deepEqual([first.state, first.step, minutes(first, START)], [STATES.LEARNING, 1, 10]);
  const later = START + 10 * 60_000;
  const second = scheduler.review(first, RATINGS.GOOD, later).card;
  assert.equal(second.state, STATES.REVIEW);
  assert.ok(second.due - later >= DAY);
});

test('zapomnienie karty w powtórkach: ponowna nauka, niższa stabilność, wyższa trudność', () => {
  const scheduler = createScheduler({ enableFuzzing: false });
  const card = { state: STATES.REVIEW, step: null, stability: 30, difficulty: 5, due: START + 30 * DAY, lastReview: START };
  const { card: after } = scheduler.review(card, RATINGS.AGAIN, START + 30 * DAY);
  assert.equal(after.state, STATES.RELEARNING);
  assert.equal(after.due - (START + 30 * DAY), 10 * 60_000);
  assert.ok(after.stability < card.stability);
  assert.ok(after.difficulty > card.difficulty);
  // Hard daje krótszy odstęp niż Good, Good krótszy niż Easy.
  const at = START + 30 * DAY;
  const interval = (rating) => scheduler.review(card, rating, at).card.due - at;
  assert.ok(interval(RATINGS.HARD) < interval(RATINGS.GOOD));
  assert.ok(interval(RATINGS.GOOD) < interval(RATINGS.EASY));
});

test('powtórka nie zmienia karty wejściowej; zła ocena jest odrzucana', () => {
  const scheduler = createScheduler();
  const card = Object.freeze(newCard(START));
  scheduler.review(card, RATINGS.GOOD, START);
  assert.throws(() => scheduler.review(card, 5, START), /nieznana ocena/);
  assert.throws(() => createScheduler({ parameters: [1, 2, 3] }), /parametrów/);
});

test('zaokrąglanie odstępów jak w Pythonie (połówki do parzystej)', () => {
  assert.deepEqual([0.5, 1.5, 2.5, 3.5, 2.4999, 2.5001, 7].map(roundHalfEven), [0, 2, 2, 4, 2, 3, 7]);
});
