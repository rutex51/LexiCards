// FSRS-6 – planowanie powtórek w odstępach (Free Spaced Repetition Scheduler).
//
// Wierne przeniesienie klasy Scheduler z oficjalnej implementacji py-fsrs 6.3.2
// (https://github.com/open-spaced-repetition/py-fsrs, plik fsrs/scheduler.py):
// te same wzory, domyślne parametry, stany, kroki nauki, krótkoterminowa stabilność
// i rozmycie odstępów. Zgodność sprawdza tests/unit/fsrs.test.js na historiach
// powtórek policzonych przez oryginał (tools/gen_fsrs_reference.py).
//
// Różnice tylko w formie: czas to milisekundy od 1970 r. (UTC), karta to zwykły obiekt
// zapisywalny w bazie, a funkcję losującą do rozmycia można podać z zewnątrz.
//
// Kod py-fsrs jest objęty licencją MIT:
//
//   MIT License
//
//   Copyright (c) 2022 Open Spaced Repetition
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.

export const FSRS_VERSION = 'FSRS-6 (py-fsrs 6.3.2)';

export const STATES = Object.freeze({ LEARNING: 'learning', REVIEW: 'review', RELEARNING: 'relearning' });
export const RATINGS = Object.freeze({ AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 });
export const RATING_NAMES = Object.freeze({ 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' });

/** Domyślne parametry FSRS-6 (wytrenowane przez autorów na dużym zbiorze powtórek). */
export const DEFAULT_PARAMETERS = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
]);

const STABILITY_MIN = 0.001;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;
const MINUTE = 60_000;
const DAY = 86_400_000;

const FUZZ_RANGES = Object.freeze([
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 }
]);

/** Zaokrąglenie jak round() w Pythonie: połówki do liczby parzystej. */
export function roundHalfEven(value) {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest > 0.5) return floor + 1;
  if (rest < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Pełne doby między dwiema chwilami – jak timedelta.days w Pythonie. */
function wholeDays(from, to) {
  return Math.floor((to - from) / DAY);
}

const clampDifficulty = (value) => Math.min(Math.max(value, MIN_DIFFICULTY), MAX_DIFFICULTY);
const clampStability = (value) => Math.max(value, STABILITY_MIN);

/** Nowa karta: stan nauki, krok 0, bez stabilności i trudności. */
export function newCard(now) {
  return { state: STATES.LEARNING, step: 0, stability: null, difficulty: null, due: now, lastReview: null };
}

/**
 * Planista FSRS. Ustawienia (wartości domyślne jak w py-fsrs):
 *   desiredRetention  – docelowe prawdopodobieństwo przypomnienia (0.9),
 *   learningSteps     – kroki nauki nowej karty w minutach ([1, 10]),
 *   relearningSteps   – kroki ponownej nauki po zapomnieniu w minutach ([10]),
 *   maximumInterval   – najdłuższy odstęp w dniach (36500),
 *   enableFuzzing     – lekkie losowe rozmycie dłuższych odstępów (true).
 */
export function createScheduler({
  parameters = DEFAULT_PARAMETERS,
  desiredRetention = 0.9,
  learningSteps = [1, 10],
  relearningSteps = [10],
  maximumInterval = 36500,
  enableFuzzing = true
} = {}) {
  const w = parameters;
  if (w.length !== DEFAULT_PARAMETERS.length) throw new Error(`FSRS: oczekiwano ${DEFAULT_PARAMETERS.length} parametrów`);
  const DECAY = -w[20];
  const FACTOR = 0.9 ** (1 / DECAY) - 1;
  const learning = learningSteps.map((minutes) => minutes * MINUTE);
  const relearning = relearningSteps.map((minutes) => minutes * MINUTE);

  function retrievability(card, now) {
    if (card.lastReview === null || card.lastReview === undefined || card.stability === null || card.stability === undefined) return 0;
    const elapsedDays = Math.max(0, wholeDays(card.lastReview, now));
    return (1 + (FACTOR * elapsedDays) / card.stability) ** DECAY;
  }

  const initialStability = (rating) => clampStability(w[rating - 1]);

  function initialDifficulty(rating, clamp) {
    const value = w[4] - Math.E ** (w[5] * (rating - 1)) + 1;
    return clamp ? clampDifficulty(value) : value;
  }

  function nextInterval(stability) {
    let interval = (stability / FACTOR) * (desiredRetention ** (1 / DECAY) - 1);
    interval = roundHalfEven(interval);
    interval = Math.max(interval, 1);
    return Math.min(interval, maximumInterval);
  }

  function shortTermStability(stability, rating) {
    let increase = Math.E ** (w[17] * (rating - 3 + w[18])) * stability ** -w[19];
    if (rating !== RATINGS.AGAIN) increase = Math.max(increase, 1);
    return clampStability(stability * increase);
  }

  function nextDifficulty(difficulty, rating) {
    const easy = initialDifficulty(RATINGS.EASY, false);
    const delta = -(w[6] * (rating - 3));
    const damped = difficulty + ((10 - difficulty) * delta) / 9;
    return clampDifficulty(w[7] * easy + (1 - w[7]) * damped);
  }

  function forgetStability(difficulty, stability, recall) {
    const longTerm = w[11] * difficulty ** -w[12] * ((stability + 1) ** w[13] - 1) * Math.E ** ((1 - recall) * w[14]);
    const shortTerm = stability / Math.E ** (w[17] * w[18]);
    return Math.min(longTerm, shortTerm);
  }

  function recallStability(difficulty, stability, recall, rating) {
    const hardPenalty = rating === RATINGS.HARD ? w[15] : 1;
    const easyBonus = rating === RATINGS.EASY ? w[16] : 1;
    return stability * (1 + Math.E ** w[8] * (11 - difficulty) * stability ** -w[9] * (Math.E ** ((1 - recall) * w[10]) - 1) * hardPenalty * easyBonus);
  }

  function nextStability(difficulty, stability, recall, rating) {
    const value = rating === RATINGS.AGAIN
      ? forgetStability(difficulty, stability, recall)
      : recallStability(difficulty, stability, recall, rating);
    return clampStability(value);
  }

  function fuzzRange(intervalDays) {
    let delta = 1;
    for (const range of FUZZ_RANGES) {
      delta += range.factor * Math.max(Math.min(intervalDays, range.end) - range.start, 0);
    }
    let min = roundHalfEven(intervalDays - delta);
    let max = roundHalfEven(intervalDays + delta);
    min = Math.max(2, min);
    max = Math.min(max, maximumInterval);
    min = Math.min(min, max);
    return { min, max };
  }

  function fuzzed(intervalMs, random) {
    const days = Math.floor(intervalMs / DAY);
    if (days < 2.5) return intervalMs;
    const { min, max } = fuzzRange(days);
    const value = random() * (max - min + 1) + min;
    return Math.min(roundHalfEven(value), maximumInterval) * DAY;
  }

  /** Odstęp w krokach nauki dla oceny Hard (jak w py-fsrs). */
  function hardStep(steps, step) {
    if (step === 0 && steps.length === 1) return steps[0] * 1.5;
    if (step === 0 && steps.length >= 2) return (steps[0] + steps[1]) / 2;
    return steps[step];
  }

  /** Wspólny przebieg stanów Learning i Relearning (różnią się tylko listą kroków). */
  function stepInterval(card, rating, steps) {
    if (steps.length === 0 || (card.step >= steps.length && rating !== RATINGS.AGAIN)) {
      card.state = STATES.REVIEW;
      card.step = null;
      return nextInterval(card.stability) * DAY;
    }
    switch (rating) {
      case RATINGS.AGAIN:
        card.step = 0;
        return steps[0];
      case RATINGS.HARD:
        return hardStep(steps, card.step);
      case RATINGS.GOOD:
        if (card.step + 1 === steps.length) {
          card.state = STATES.REVIEW;
          card.step = null;
          return nextInterval(card.stability) * DAY;
        }
        card.step += 1;
        return steps[card.step];
      case RATINGS.EASY:
        card.state = STATES.REVIEW;
        card.step = null;
        return nextInterval(card.stability) * DAY;
      default:
        throw new Error(`FSRS: nieznana ocena ${rating}`);
    }
  }

  /**
   * Powtórka karty z oceną 1–4 w chwili `now` (ms). Zwraca nową kartę (wejściowa się
   * nie zmienia) oraz szczegóły: przewidywane przypomnienie przed powtórką i odstęp.
   */
  function review(input, rating, now, random = Math.random) {
    if (![1, 2, 3, 4].includes(rating)) throw new Error(`FSRS: nieznana ocena ${rating}`);
    const card = { ...input };
    const daysSince = card.lastReview === null || card.lastReview === undefined ? null : wholeDays(card.lastReview, now);
    const recall = retrievability(card, now);
    let interval;

    if (card.state === STATES.LEARNING || card.state === STATES.RELEARNING) {
      if (card.state === STATES.LEARNING && (card.stability === null || card.difficulty === null)) {
        card.stability = initialStability(rating);
        card.difficulty = initialDifficulty(rating, true);
      } else if (daysSince !== null && daysSince < 1) {
        card.stability = shortTermStability(card.stability, rating);
        card.difficulty = nextDifficulty(card.difficulty, rating);
      } else {
        card.stability = nextStability(card.difficulty, card.stability, recall, rating);
        card.difficulty = nextDifficulty(card.difficulty, rating);
      }
      interval = stepInterval(card, rating, card.state === STATES.LEARNING ? learning : relearning);
    } else if (card.state === STATES.REVIEW) {
      card.stability = daysSince !== null && daysSince < 1
        ? shortTermStability(card.stability, rating)
        : nextStability(card.difficulty, card.stability, recall, rating);
      card.difficulty = nextDifficulty(card.difficulty, rating);
      if (rating === RATINGS.AGAIN && relearning.length > 0) {
        card.state = STATES.RELEARNING;
        card.step = 0;
        interval = relearning[0];
      } else {
        interval = nextInterval(card.stability) * DAY;
      }
    } else {
      throw new Error(`FSRS: nieznany stan karty ${card.state}`);
    }

    if (enableFuzzing && card.state === STATES.REVIEW) interval = fuzzed(interval, random);
    card.due = now + interval;
    card.lastReview = now;
    return { card, retrievability: recall, interval };
  }

  return { review, retrievability, nextInterval, parameters: w, desiredRetention };
}
