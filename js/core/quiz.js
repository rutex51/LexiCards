// Quizy: jednokrotny wybór, dopasowywanie par i test mieszany. Bez zależności od przeglądarki.
//
// Najważniejsze reguły:
//  - każde pojęcie pojawia się w quizie najwyżej raz,
//  - pytanie jednokrotnego wyboru ma do 4 odpowiedzi o różnym brzmieniu; błędne odpowiedzi
//    pochodzą w miarę możliwości z tej samej dziedziny; gdy unikalnych odpowiedzi jest mniej,
//    pytanie ma ich mniej, a przy mniej niż dwóch jest pomijane,
//  - w dopasowywaniu każda para to osobna oceniana odpowiedź; para jest zaliczona, jeśli
//    połączono ją bez pomyłki,
//  - wynik liczy się względem wszystkich pytań: pytania bez odpowiedzi (koniec czasu,
//    przerwanie) są błędne,
//  - quiz nie zmienia harmonogramu powtórek (FSRS) – ma osobne wyniki i statystyki.

import { DIRECTIONS } from './model.js';
import { MIXED, selectTerms } from './study.js';
import { normalizeKey } from './text.js';

export const QUIZ_TYPES = Object.freeze([
  { id: 'choice', label: 'Jednokrotny wybór' },
  { id: 'matching', label: 'Dopasowywanie' },
  { id: 'mixed', label: 'Test mieszany' }
]);
export const QUIZ_TYPE_NAMES = Object.freeze(Object.fromEntries(QUIZ_TYPES.map((type) => [type.id, type.label])));

/** Liczba pytań (w dopasowywaniu – par); 0 oznacza wszystkie pojęcia z materiału. */
export const QUIZ_COUNTS = Object.freeze([10, 20, 30, 0]);
/** Limit czasu w sekundach; 0 – bez limitu. */
export const QUIZ_TIME_LIMITS = Object.freeze([0, 120, 300, 600]);
export const PASS_THRESHOLDS = Object.freeze([0.6, 0.7, 0.8, 0.9, 1]);
/** Udział pytań jednokrotnego wyboru w teście mieszanym. */
export const CHOICE_SHARES = Object.freeze([0.4, 0.5, 0.6, 0.7, 0.8]);
export const DEFAULT_PASS_THRESHOLD = 0.8;
export const DEFAULT_CHOICE_SHARE = 0.6;
export const MAX_OPTIONS = 4;
/** Domyślna liczba par w rundzie dopasowywania: telefon / szeroki ekran (iPad, komputer). */
export const PAIRS_PER_ROUND = Object.freeze({ phone: 5, wide: 8 });

const SOURCE = { [DIRECTIONS.PL_EN]: 'pl', [DIRECTIONS.EN_PL]: 'en' };
const TARGET = { [DIRECTIONS.PL_EN]: 'en', [DIRECTIONS.EN_PL]: 'pl' };

function termText(term, language) {
  return language === 'pl' ? term.termPL : term.termEN;
}

function shuffled(items, random) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function pickDirection(config, random) {
  if (config.direction === MIXED) return random() < 0.5 ? DIRECTIONS.PL_EN : DIRECTIONS.EN_PL;
  return config.direction === DIRECTIONS.EN_PL ? DIRECTIONS.EN_PL : DIRECTIONS.PL_EN;
}

/** Pojęcia do quizu: wskazane wprost (`termIDs`, np. powtórka błędnych) albo z wybranego materiału. */
export function quizTerms(library, config) {
  if (Array.isArray(config.termIDs) && config.termIDs.length > 0) {
    return config.termIDs.map((id) => library.getTerm(id)).filter(Boolean);
  }
  return selectTerms(library, config);
}

// ---------------------------------------------------------------- jednokrotny wybór

/**
 * Pytanie jednokrotnego wyboru: pojęcie w języku pytania i do 4 odpowiedzi w drugim języku.
 * `pool` to wszystkie pojęcia, z których można brać błędne odpowiedzi. Zwraca null, gdy nie
 * da się ułożyć co najmniej dwóch różnych odpowiedzi.
 */
export function choiceQuestion(term, direction, pool, random = Math.random) {
  const target = TARGET[direction];
  const correct = termText(term, target);
  const used = new Set([normalizeKey(correct)]);
  const sameDomain = [];
  const others = [];
  for (const candidate of pool) {
    if (candidate.id === term.id) continue;
    (candidate.domainID === term.domainID ? sameDomain : others).push(candidate);
  }
  const options = [{ termID: term.id, text: correct }];
  for (const group of [shuffled(sameDomain, random), shuffled(others, random)]) {
    for (const candidate of group) {
      if (options.length >= MAX_OPTIONS) break;
      const text = termText(candidate, target);
      const key = normalizeKey(text);
      if (!key || used.has(key)) continue;
      used.add(key);
      options.push({ termID: candidate.id, text });
    }
  }
  if (options.length < 2) return null;
  const order = shuffled(options, random);
  return {
    kind: 'choice',
    termID: term.id,
    direction,
    prompt: { text: termText(term, SOURCE[direction]), lang: SOURCE[direction] },
    answerLang: target,
    options: order,
    correctIndex: order.findIndex((option) => option.termID === term.id)
  };
}

// ---------------------------------------------------------------- dopasowywanie

/** Rozkłada `count` par na rundy po najwyżej `perRound`, możliwie równo (np. 8 → 4 + 4). */
export function roundSizes(count, perRound) {
  if (count <= 0) return [];
  const rounds = Math.ceil(count / perRound);
  const base = Math.floor(count / rounds);
  const extra = count % rounds;
  return Array.from({ length: rounds }, (_, index) => base + (index < extra ? 1 : 0));
}

/**
 * Runda dopasowywania: lewa kolumna w języku pytania, prawa w drugim języku, obie potasowane.
 * Pojęcia o tym samym brzmieniu w którejś kolumnie nie trafiają do jednej rundy.
 */
export function matchingRound(terms, direction, random = Math.random) {
  const source = SOURCE[direction];
  const target = TARGET[direction];
  return {
    kind: 'matching',
    direction,
    pairs: terms.map((term) => term.id),
    left: shuffled(terms.map((term) => ({ termID: term.id, text: termText(term, source), lang: source })), random),
    right: shuffled(terms.map((term) => ({ termID: term.id, text: termText(term, target), lang: target })), random)
  };
}

/** Dzieli pojęcia na rundy bez powtórzeń brzmienia w kolumnach. Pojęcia, których nie da się dołożyć, odpadają. */
function matchingGroups(terms, sizes) {
  const groups = sizes.map(() => ({ terms: [], left: new Set(), right: new Set() }));
  const leftover = [];
  for (const term of terms) {
    const keys = [normalizeKey(term.termPL), normalizeKey(term.termEN)];
    const group = groups.find((item, index) => item.terms.length < sizes[index]
      && !item.left.has(keys[0]) && !item.right.has(keys[1]));
    if (!group) {
      leftover.push(term);
      continue;
    }
    group.terms.push(term);
    group.left.add(keys[0]);
    group.right.add(keys[1]);
  }
  const complete = [];
  for (const group of groups) {
    if (group.terms.length >= 2) complete.push(group.terms);
    else leftover.push(...group.terms);
  }
  return { groups: complete, leftover };
}

// ---------------------------------------------------------------- budowanie quizu

/**
 * Quiz z ustawień:
 *   type: 'choice' | 'matching' | 'mixed', direction: 'pl_en' | 'en_pl' | 'mixed',
 *   count (0 = wszystkie), choiceShare (test mieszany), pairsPerRound, materiał jak w nauce
 *   (domainID, moduleID, lessonIDs) albo termIDs.
 * Zwraca { items, total } – items to pytania i rundy w kolejności quizu, total to liczba
 * ocenianych odpowiedzi (pytanie = 1, para = 1).
 */
export function buildQuiz(library, config, random = Math.random) {
  const pool = shuffled(quizTerms(library, config), random);
  const available = pool.length;
  const total = config.count > 0 ? Math.min(config.count, available) : available;
  const share = CHOICE_SHARES.includes(config.choiceShare) ? config.choiceShare : DEFAULT_CHOICE_SHARE;
  let choiceCount;
  if (config.type === 'choice') choiceCount = total;
  else if (config.type === 'matching') choiceCount = 0;
  else choiceCount = Math.round(total * share);

  // Błędne odpowiedzi mogą pochodzić z całej biblioteki – materiał quizu bywa mały.
  const distractors = selectTerms(library, {});
  const items = [];
  const used = new Set();
  const addChoice = (term) => {
    const question = choiceQuestion(term, pickDirection(config, random), distractors, random);
    if (!question) return false;
    items.push(question);
    used.add(term.id);
    return true;
  };
  let index = 0;
  while (items.length < choiceCount && index < pool.length) {
    addChoice(pool[index]);
    index += 1;
  }
  const pairTerms = pool.filter((term) => !used.has(term.id)).slice(0, total - items.length);
  const perRound = Math.max(2, config.pairsPerRound || PAIRS_PER_ROUND.phone);
  const { groups, leftover } = matchingGroups(pairTerms, roundSizes(pairTerms.length, perRound));
  for (const group of groups) {
    items.push(matchingRound(group, pickDirection(config, random), random));
    for (const term of group) used.add(term.id);
  }
  // Pojęcia, których nie dało się ułożyć w pary (np. jedno zostało), dostają pytanie wyboru.
  for (const term of leftover) addChoice(term);

  const ordered = shuffled(items, random);
  return { items: ordered, total: countAnswers(ordered) };
}

/** Liczba ocenianych odpowiedzi w pytaniach i rundach. */
export function countAnswers(items) {
  return items.reduce((sum, item) => sum + (item.kind === 'matching' ? item.pairs.length : 1), 0);
}

// ---------------------------------------------------------------- odpowiedzi i wynik

/** Odpowiedź na pytanie wyboru: { termID, direction, questionType, selectedAnswer, correctAnswer, isCorrect }. */
export function answerChoice(question, selectedIndex) {
  const correct = question.options[question.correctIndex];
  const selected = question.options[selectedIndex] ?? null;
  return {
    termID: question.termID,
    direction: question.direction,
    questionType: 'choice',
    selectedAnswer: selected?.text ?? null,
    correctAnswer: correct.text,
    isCorrect: selectedIndex === question.correctIndex
  };
}

/**
 * Odpowiedzi z rundy dopasowywania – po jednej na parę.
 * matched: Set termID połączonych par; mistakes: Map termID → liczba pomyłek przy tej parze
 * (para pierwszego dotkniętego elementu); wrongPicks: Map termID → tekst ostatniej błędnej próby.
 * Runda przerwana (`interrupted`, np. koniec czasu): para niepołączona i bez pomyłek jest
 * oznaczona jako `unanswered` – nie było próby odpowiedzi.
 */
export function answerMatching(round, { matched, mistakes, wrongPicks = new Map(), interrupted = false }) {
  const target = new Map(round.right.map((item) => [item.termID, item.text]));
  return round.pairs.map((termID) => {
    const done = matched.has(termID);
    const errors = mistakes.get(termID) ?? 0;
    const answer = {
      termID,
      direction: round.direction,
      questionType: 'matching',
      selectedAnswer: done && errors === 0 ? target.get(termID) : (wrongPicks.get(termID) ?? null),
      correctAnswer: target.get(termID),
      isCorrect: done && errors === 0
    };
    if (interrupted && !done && errors === 0) answer.unanswered = true;
    return answer;
  });
}

/** Odpowiedzi „bez odpowiedzi” dla pytań, do których nie doszło (koniec czasu, przerwanie). */
export function unansweredAnswers(items) {
  return items.flatMap((item) => (item.kind === 'matching'
    ? item.pairs.map((termID) => ({
        termID, direction: item.direction, questionType: 'matching', selectedAnswer: null,
        correctAnswer: item.right.find((entry) => entry.termID === termID).text, isCorrect: false, unanswered: true
      }))
    : [{
        termID: item.termID, direction: item.direction, questionType: 'choice', selectedAnswer: null,
        correctAnswer: item.options[item.correctIndex].text, isCorrect: false, unanswered: true
      }]));
}

/**
 * Wynik quizu z odpowiedzi: procent względem wszystkich pytań, liczby, zaliczenie, błędne pojęcia
 * (bez powtórzeń, w kolejności wystąpienia).
 */
export function summarizeQuiz({ total, answers, threshold = DEFAULT_PASS_THRESHOLD, duration = 0 }) {
  const correct = answers.filter((answer) => answer.isCorrect).length;
  const unanswered = Math.max(0, total - answers.length) + answers.filter((answer) => answer.unanswered).length;
  const incorrect = total - correct;
  const ratio = total > 0 ? correct / total : 0;
  const wrong = [];
  const seen = new Set();
  for (const answer of answers) {
    if (answer.isCorrect || seen.has(answer.termID)) continue;
    seen.add(answer.termID);
    wrong.push(answer);
  }
  return {
    total,
    correct,
    incorrect,
    unanswered,
    percent: Math.round(ratio * 100),
    passed: ratio >= threshold - 1e-9,
    threshold,
    duration,
    wrongTermIDs: wrong.map((answer) => answer.termID),
    wrong
  };
}

/**
 * Wynik zapisanego quizu ({ total, items, position, answers, config, elapsedMs }): odpowiedzi
 * udzielone plus „bez odpowiedzi” dla pytań od bieżącej pozycji. Błędne pojęcia obejmują
 * także te bez odpowiedzi – one również obniżają wynik.
 */
export function quizResult(quiz) {
  return summarizeQuiz({
    total: quiz.total,
    answers: [...quiz.answers, ...unansweredAnswers(quiz.items.slice(quiz.position))],
    threshold: quiz.config.threshold ?? DEFAULT_PASS_THRESHOLD,
    duration: quiz.elapsedMs
  });
}

/** Czas w formacie „m:ss” albo „h:mm:ss”. */
export function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
