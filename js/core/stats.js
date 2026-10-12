// Statystyki nauki: wskaźniki (KPI), znajomość elementów, szeregi dzienne do wykresów,
// zestawienia według dziedzin, modułów i lekcji oraz czas nauki. Bez zależności od przeglądarki.
//
// Kierunki nie są mieszane bez oznaczenia:
//  - wybrany kierunek (PL → EN albo EN → PL) – liczy się tylko on,
//  - „oba kierunki” – pojęcie ma status słabszego z dwóch kierunków (opanowane = opanowane
//    w obu), jest do powtórki, gdy czeka w którymkolwiek; liczby zdarzeń (powtórki, odpowiedzi
//    w quizach, czas) obejmują oba kierunki razem,
//  - znajomość pojęć, definicji i przykładów jest zawsze podawana osobno dla każdego kierunku.

import { ASSESSMENT_STATUS_NAMES, DIRECTIONS } from './model.js';
import { MAX_CARD_TIME, dueTime, selectTerms } from './study.js';

export const BOTH = 'both';

export const STATS_DIRECTIONS = Object.freeze([
  { id: DIRECTIONS.PL_EN, label: 'PL → EN' },
  { id: DIRECTIONS.EN_PL, label: 'EN → PL' },
  { id: BOTH, label: 'Oba kierunki' }
]);

/** Statusy od najlepszego; „new” – pojęcie jeszcze nie oceniane w danym kierunku. */
export const STATUS_ORDER = Object.freeze(['mastered', 'partiallyMastered', 'inProgress', 'toLearn', 'new']);
export const STATUS_LABELS = Object.freeze({ ...ASSESSMENT_STATUS_NAMES, new: 'Nowe' });
const RANK = { new: 0, toLearn: 1, inProgress: 2, partiallyMastered: 3, mastered: 4 };

/** Zakres dni na wykresach. */
export const STATS_RANGES = Object.freeze([7, 30, 90]);

/** Czas między ocenami starszymi niż zapis czasu fiszki (wersje sprzed 0.6.0) – górny limit szacunku. */
export const LEGACY_CARD_TIME = 120_000;

const directionsOf = (direction) => (direction === BOTH ? [DIRECTIONS.PL_EN, DIRECTIONS.EN_PL] : [direction]);
const inDirection = (direction, value) => direction === BOTH || value === direction;

/** Słabszy z dwóch statusów. */
export function weakerStatus(a, b) {
  return RANK[a] <= RANK[b] ? a : b;
}

// ---------------------------------------------------------------- zakres materiału

/**
 * Zakres statystyk: { level: 'library' } albo { level: 'domain' | 'module' | 'lesson', id }.
 * Zwraca pojęcia zakresu w kolejności biblioteki.
 */
export function scopeTerms(library, scope = { level: 'library' }) {
  switch (scope.level) {
    case 'domain': return selectTerms(library, { domainID: scope.id });
    case 'module': return selectTerms(library, { moduleID: scope.id });
    case 'lesson': return selectTerms(library, { lessonIDs: [scope.id] });
    default: return selectTerms(library, {});
  }
}

/** Poziom poniżej zakresu, z którego można wybierać zestawienie: dziedziny, moduły, lekcje. */
export function breakdownLevels(scope) {
  switch (scope.level) {
    case 'domain': return ['module', 'lesson'];
    case 'module': return ['lesson'];
    case 'lesson': return [];
    default: return ['domain', 'module', 'lesson'];
  }
}

// ---------------------------------------------------------------- stan pojęć

/** Status pojęcia w kierunku albo – dla obu kierunków – słabszy z dwóch. */
export function termStatus(library, termID, direction) {
  return directionsOf(direction)
    .map((way) => library.getProgress(termID, way)?.lastStatus ?? 'new')
    .reduce(weakerStatus);
}

/** Liczba pojęć w każdym statusie: { mastered, partiallyMastered, inProgress, toLearn, new, total }. */
export function statusCounts(library, terms, direction) {
  const counts = { mastered: 0, partiallyMastered: 0, inProgress: 0, toLearn: 0, new: 0, total: terms.length };
  for (const term of terms) counts[termStatus(library, term.id, direction)] += 1;
  return counts;
}

/** Pojęcia do powtórki (termin FSRS minął): w wybranym kierunku albo w którymkolwiek. */
export function dueCount(library, terms, direction, now = Date.now()) {
  let count = 0;
  for (const term of terms) {
    const due = directionsOf(direction).some((way) => {
      const time = dueTime(library.getProgress(term.id, way));
      return time !== null && time <= now;
    });
    if (due) count += 1;
  }
  return count;
}

/**
 * Znajomość pojęć, definicji i przykładów w jednym kierunku – z ostatniej oceny każdego
 * elementu. Mianownikiem są ocenione pojęcia, które mają dany element.
 * Zwraca { assessed, term: { known, total }, description: {...}, example: {...} }.
 */
export function elementStats(library, terms, direction) {
  const result = {
    assessed: 0,
    term: { known: 0, total: 0 },
    description: { known: 0, total: 0 },
    example: { known: 0, total: 0 }
  };
  for (const term of terms) {
    const progress = library.getProgress(term.id, direction);
    if (!progress?.reviewCount) continue;
    result.assessed += 1;
    result.term.total += 1;
    if (progress.knowsTerm) result.term.known += 1;
    for (const [key, field] of [['description', 'knowsDescription'], ['example', 'knowsExample']]) {
      const value = progress[field];
      if (value === null || value === undefined) continue;
      result[key].total += 1;
      if (value) result[key].known += 1;
    }
  }
  return result;
}

/** Odsetek (0–100, zaokrąglony) albo null, gdy nie ma z czego liczyć. */
export function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

// ---------------------------------------------------------------- quizy i czas

/** Skuteczność quizów: odpowiedzi na pojęcia z zakresu, w kierunku. { correct, total }. */
export function quizAccuracy(answers, termIDs, direction) {
  let correct = 0;
  let total = 0;
  for (const answer of answers) {
    if (!termIDs.has(answer.termID) || !inDirection(direction, answer.direction)) continue;
    total += 1;
    if (answer.isCorrect) correct += 1;
  }
  return { correct, total };
}

/**
 * Czas każdej oceny fiszki (id → ms). Oceny od wersji 0.6.0 mają zapisany czas nad fiszką.
 * Dla starszych czas jest szacowany: odstęp od poprzedniej oceny w tej samej sesji (pierwsza
 * fiszka – od początku sesji), najwyżej 2 minuty.
 */
export function assessmentDurations(assessments, studySessions = []) {
  const starts = new Map(studySessions.map((session) => [session.id, Date.parse(session.startedAt)]));
  const bySession = new Map();
  const durations = new Map();
  for (const assessment of assessments) {
    if (Number.isFinite(assessment.duration)) {
      durations.set(assessment.id, Math.min(assessment.duration, MAX_CARD_TIME));
      continue;
    }
    const key = assessment.sessionID ?? '';
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(assessment);
  }
  for (const [sessionID, list] of bySession) {
    list.sort((a, b) => Date.parse(a.assessedAt) - Date.parse(b.assessedAt));
    let previous = sessionID && starts.has(sessionID) ? starts.get(sessionID) : null;
    for (const assessment of list) {
      const time = Date.parse(assessment.assessedAt);
      const gap = previous === null ? 0 : time - previous;
      durations.set(assessment.id, Math.max(0, Math.min(gap, LEGACY_CARD_TIME)));
      previous = time;
    }
  }
  return durations;
}

/**
 * Czas nauki w zakresie: fiszki (czas nad fiszką) i quizy (czas odpowiedzi).
 * `since` – liczyć tylko zdarzenia od tej chwili (ms). Zwraca { flashcards, quiz, total } w ms.
 */
export function studyTime(journals, termIDs, direction, { since = null, durations = null } = {}) {
  const times = durations ?? assessmentDurations(journals.assessments, journals.studySessions);
  let flashcards = 0;
  for (const assessment of journals.assessments) {
    if (!termIDs.has(assessment.termID) || !inDirection(direction, assessment.direction)) continue;
    if (since !== null && Date.parse(assessment.assessedAt) < since) continue;
    flashcards += times.get(assessment.id) ?? 0;
  }
  let quiz = 0;
  for (const answer of journals.quizAnswers) {
    if (!termIDs.has(answer.termID) || !inDirection(direction, answer.direction)) continue;
    if (since !== null && Date.parse(answer.answeredAt) < since) continue;
    quiz += Math.max(0, answer.responseTime ?? 0);
  }
  return { flashcards, quiz, total: flashcards + quiz };
}

/** Czas nauki po polsku: „0 min”, „< 1 min”, „25 min”, „1 godz. 5 min”, „12 godz.”. */
export function formatStudyTime(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds <= 0) return '0 min';
  if (seconds < 60) return '< 1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 && hours < 10 ? `${hours} godz. ${rest} min` : `${Math.round(minutes / 60)} godz.`;
}

// ---------------------------------------------------------------- szeregi dzienne

/** Klucz dnia według czasu urządzenia: „2026-10-12”. */
export function dayKey(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Ostatnie `days` dni kończące się dziś: [{ key, start, end }] (granice dnia w ms). */
export function dayRange(days, now = Date.now()) {
  const result = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = new Date(today);
    start.setDate(start.getDate() - offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    result.push({ key: dayKey(start), start: start.getTime(), end: end.getTime() });
  }
  return result;
}

/**
 * Dane do wykresów dziennych w zakresie i kierunku, dla ostatnich `days` dni:
 *  - stan na koniec dnia (odtworzony z historii ocen): liczba pojęć w każdym statusie,
 *  - powtórki fiszek danego dnia: osobno PL → EN i EN → PL,
 *  - odpowiedzi w quizach danego dnia: poprawne i wszystkie, osobno dla kierunków.
 * Zwraca [{ key, start, statuses: {...}, assessed, reviews: { pl_en, en_pl }, quiz: { pl_en: {correct,total}, en_pl } }].
 */
export function dailySeries(journals, terms, direction, { days = 30, now = Date.now() } = {}) {
  const range = dayRange(days, now);
  const termIDs = new Set(terms.map((term) => term.id));
  const ways = directionsOf(direction);
  const index = new Map(range.map((day, position) => [day.key, position]));
  const points = range.map((day) => ({
    key: day.key,
    start: day.start,
    statuses: null,
    assessed: 0,
    reviews: { [DIRECTIONS.PL_EN]: 0, [DIRECTIONS.EN_PL]: 0 },
    quiz: {
      [DIRECTIONS.PL_EN]: { correct: 0, total: 0 },
      [DIRECTIONS.EN_PL]: { correct: 0, total: 0 }
    }
  }));

  // Stan pojęć: odtwarzamy oceny po kolei i zapisujemy liczniki na koniec każdego dnia.
  const events = journals.assessments
    .filter((assessment) => termIDs.has(assessment.termID) && ways.includes(assessment.direction))
    .map((assessment) => ({ ...assessment, time: Date.parse(assessment.assessedAt) }))
    .sort((a, b) => a.time - b.time);
  const perWay = new Map();
  const combined = new Map();
  const counts = { mastered: 0, partiallyMastered: 0, inProgress: 0, toLearn: 0, new: terms.length };
  const statusOf = (termID) => ways.map((way) => perWay.get(`${termID}\n${way}`) ?? 'new').reduce(weakerStatus);
  let cursor = 0;
  for (const point of points) {
    const end = range[index.get(point.key)].end;
    while (cursor < events.length && events[cursor].time < end) {
      const event = events[cursor];
      perWay.set(`${event.termID}\n${event.direction}`, event.assessmentStatus);
      const before = combined.get(event.termID) ?? 'new';
      const after = statusOf(event.termID);
      if (before !== after) {
        counts[before] -= 1;
        counts[after] += 1;
        combined.set(event.termID, after);
      }
      cursor += 1;
    }
    point.statuses = { ...counts };
    point.assessed = terms.length - counts.new;
  }

  for (const review of journals.reviews) {
    if (!termIDs.has(review.termID) || !ways.includes(review.direction)) continue;
    const position = index.get(dayKey(Date.parse(review.reviewedAt)));
    if (position !== undefined) points[position].reviews[review.direction] += 1;
  }
  for (const answer of journals.quizAnswers) {
    if (!termIDs.has(answer.termID) || !ways.includes(answer.direction)) continue;
    const position = index.get(dayKey(Date.parse(answer.answeredAt)));
    if (position === undefined) continue;
    const bucket = points[position].quiz[answer.direction];
    bucket.total += 1;
    if (answer.isCorrect) bucket.correct += 1;
  }
  return points;
}

// ---------------------------------------------------------------- zestawienie według hierarchii

/**
 * Zestawienie elementów poziomu `level` ('domain' | 'module' | 'lesson') w zakresie: dla każdego
 * – liczba pojęć w statusach. Kolejność jak w bibliotece; puste elementy też są na liście.
 * Zwraca [{ level, id, name, parent, counts }].
 */
export function breakdown(library, scope, level, direction) {
  const key = { domain: 'domainID', module: 'moduleID', lesson: 'lessonID' }[level];
  const totals = new Map();
  for (const term of scopeTerms(library, scope)) {
    const id = term[key];
    if (!totals.has(id)) totals.set(id, { mastered: 0, partiallyMastered: 0, inProgress: 0, toLearn: 0, new: 0, total: 0 });
    const counts = totals.get(id);
    counts[termStatus(library, term.id, direction)] += 1;
    counts.total += 1;
  }
  const empty = () => ({ mastered: 0, partiallyMastered: 0, inProgress: 0, toLearn: 0, new: 0, total: 0 });
  const row = (item, parent) => ({ level, id: item.id, name: item.name, parent, counts: totals.get(item.id) ?? empty() });

  const domains = scope.level === 'library' ? library.listDomains() : [];
  const domainIDs = scope.level === 'domain' ? [scope.id] : domains.map((domain) => domain.id);
  const modules = scope.level === 'module'
    ? [library.getModule(scope.id)].filter(Boolean)
    : domainIDs.flatMap((id) => library.listModules(id));
  if (level === 'domain') return domains.map((domain) => row(domain, null));
  if (level === 'module') return modules.map((module) => row(module, library.getDomain(module.domainID)?.name ?? null));
  const lessons = scope.level === 'lesson'
    ? [library.getLesson(scope.id)].filter(Boolean)
    : modules.flatMap((module) => library.listLessons(module.id));
  return lessons.map((lesson) => row(lesson, library.getModule(lesson.moduleID)?.name ?? null));
}

// ---------------------------------------------------------------- komplet wskaźników

/**
 * Wszystkie wskaźniki ekranu statystyk dla zakresu i kierunku.
 * `journals` może być null (dzienniki jeszcze się wczytują) – wtedy pola z dzienników są null.
 */
export function overview(library, scope, direction, journals, { now = Date.now(), recentDays = 7 } = {}) {
  const terms = scopeTerms(library, scope);
  const termIDs = new Set(terms.map((term) => term.id));
  const result = {
    terms: terms.length,
    statuses: statusCounts(library, terms, direction),
    due: dueCount(library, terms, direction, now),
    elements: Object.fromEntries(directionsOf(direction).map((way) => [way, elementStats(library, terms, way)])),
    quiz: null,
    time: null,
    recentTime: null
  };
  if (journals) {
    const durations = assessmentDurations(journals.assessments, journals.studySessions);
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (recentDays - 1));
    result.quiz = quizAccuracy(journals.quizAnswers, termIDs, direction);
    result.time = studyTime(journals, termIDs, direction, { durations });
    result.recentTime = studyTime(journals, termIDs, direction, { durations, since: since.getTime() });
  }
  return result;
}
