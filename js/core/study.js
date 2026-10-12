// Nauka z fiszkami: dobór fiszek do sesji, treść obu stron, ocena z trzech kafelków,
// postęp pojęcia i podsumowanie sesji. Bez zależności od przeglądarki.
//
// Najważniejsze reguły:
//  - oceniane są tylko elementy, które pojęcie ma (tłumaczenie zawsze, opis i przykład,
//    jeśli istnieją) – brak treści nie obniża wyniku,
//  - postęp jest osobny dla każdego kierunku (PL→EN i EN→PL),
//  - fiszka jest „opanowana” tylko przy komplecie zaliczonych elementów i decyzji „Umiem”,
//  - każda zatwierdzona ocena trafia do historii; wcześniejszych wpisów nic nie nadpisuje,
//  - termin następnej powtórki wyznacza FSRS (js/core/fsrs.js), osobno dla każdego kierunku;
//    status ostatniej oceny i długoterminowy poziom z FSRS to dwie różne informacje.

import {
  ASSESSMENT_STATUS_NAMES, DIFFICULTY_MAX, DIRECTIONS, assessmentStatus, hasDescription, hasExample, newID, nowISO
} from './model.js';
import { RATINGS, STATES, newCard } from './fsrs.js';

export const MIXED = 'mixed';

export const STUDY_DIRECTIONS = Object.freeze([
  { id: DIRECTIONS.PL_EN, label: 'PL → EN' },
  { id: DIRECTIONS.EN_PL, label: 'EN → PL' },
  { id: MIXED, label: 'Mieszany' }
]);

export const DIRECTION_NAMES = Object.freeze({ [DIRECTIONS.PL_EN]: 'PL → EN', [DIRECTIONS.EN_PL]: 'EN → PL' });

export const STUDY_SCOPES = Object.freeze([
  { id: 'all', label: 'Wszystkie' },
  { id: 'new', label: 'Nowe' },
  { id: 'repeat', label: 'Do powtórki' },
  { id: 'hard', label: 'Trudne' },
  { id: 'favorites', label: 'Ulubione' },
  { id: 'random', label: 'Losowe' }
]);

export const STUDY_FRONTS = Object.freeze([
  { id: 'term', label: 'Pojęcie' },
  { id: 'description', label: 'Definicja' },
  { id: 'example', label: 'Przykład' }
]);

/** Liczba fiszek w sesji do wyboru; 0 oznacza wszystkie pasujące. */
export const STUDY_COUNTS = Object.freeze([10, 20, 50, 0]);

export const DECISIONS = Object.freeze({ KNOW: 'know', REPEAT: 'repeat' });
export const DECISION_NAMES = Object.freeze({ know: 'Umiem', repeat: 'Powtórz' });

export const TILES = Object.freeze([
  { id: 'term', label: 'Pojęcie' },
  { id: 'description', label: 'Definicja' },
  { id: 'example', label: 'Przykład' }
]);

export const GROUP_NAMES = Object.freeze({
  new: 'Nowe', learning: 'W trakcie nauki', repeat: 'Do powtórki', mastered: 'Opanowane'
});

// ---------------------------------------------------------------- stan nauki pojęcia

/**
 * Grupa, do której należy pojęcie w danym kierunku:
 *   new      – jeszcze nie oceniane,
 *   repeat   – ostatnio odłożone do powtórki,
 *   mastered – ostatnio zatwierdzone jako „Umiem” z kompletem zaliczonych elementów,
 *   learning – zatwierdzone jako „Umiem”, ale z niepełnym wynikiem.
 */
export function learningGroup(progress) {
  if (!progress || !progress.reviewCount) return 'new';
  if (progress.lastDecision === DECISIONS.REPEAT) return 'repeat';
  return progress.lastStatus === 'mastered' ? 'mastered' : 'learning';
}

/** Trudność FSRS (1–10), od której fiszka trafia do zakresu „Trudne”. */
export const HARD_FSRS_DIFFICULTY = 7;

/**
 * Trudne: oznaczone przez użytkownika trudnością 4–5, z wysoką trudnością w FSRS
 * (powtarzające się kłopoty z przypomnieniem) albo ostatnio ocenione poniżej połowy.
 */
export function isHard(term, progress) {
  if ((term.difficulty ?? 0) >= DIFFICULTY_MAX - 1) return true;
  if (!progress || !progress.reviewCount) return false;
  if ((progress.schedule?.difficulty ?? 0) >= HARD_FSRS_DIFFICULTY) return true;
  return progress.lastStatus === 'toLearn' || progress.lastStatus === 'inProgress';
}

/** Termin powtórki w milisekundach albo null, gdy fiszka nie ma jeszcze harmonogramu. */
export function dueTime(progress) {
  const due = progress?.schedule?.due;
  return due ? Date.parse(due) : null;
}

/** Czy termin powtórki według FSRS już minął. */
export function isDue(progress, now = Date.now()) {
  const due = dueTime(progress);
  return due !== null && due <= now;
}

function matchesScope(scope, term, progress, now) {
  switch (scope) {
    case 'new': return learningGroup(progress) === 'new';
    case 'repeat': return isDue(progress, now);
    case 'hard': return isHard(term, progress);
    case 'favorites': return Boolean(term.isFavorite);
    default: return true;
  }
}

// ---------------------------------------------------------------- dobór fiszek

/**
 * Pojęcia z wybranego materiału w kolejności biblioteki.
 * selection: { domainID, moduleID, lessonIDs } – puste pola oznaczają „wszystko”.
 */
export function selectTerms(library, selection = {}) {
  const lessonFilter = selection.lessonIDs?.length ? new Set(selection.lessonIDs) : null;
  const terms = [];
  for (const domain of library.listDomains()) {
    if (selection.domainID && domain.id !== selection.domainID) continue;
    for (const module of library.listModules(domain.id)) {
      if (selection.moduleID && module.id !== selection.moduleID) continue;
      for (const lesson of library.listLessons(module.id)) {
        if (lessonFilter && !lessonFilter.has(lesson.id)) continue;
        terms.push(...library.listTerms(lesson.id));
      }
    }
  }
  return terms;
}

function directionsFor(direction) {
  return direction === MIXED ? [DIRECTIONS.PL_EN, DIRECTIONS.EN_PL] : [direction];
}

function shuffled(items, random) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** Fiszki pasujące do ustawień, przed losowaniem i obcięciem do wybranej liczby. */
function matchingCards(library, config, random, now) {
  const cards = [];
  for (const term of selectTerms(library, config)) {
    const fitting = directionsFor(config.direction)
      .filter((direction) => matchesScope(config.scope, term, library.getProgress(term.id, direction), now));
    if (fitting.length === 0) continue;
    let direction;
    if (fitting.length === 1) direction = fitting[0];
    else if (config.scope === 'repeat') {
      // Powtórka: z dwóch zaległych kierunków najpierw ten, który czeka dłużej.
      direction = fitting.reduce((best, item) => (
        dueTime(library.getProgress(term.id, item)) < dueTime(library.getProgress(term.id, best)) ? item : best));
    } else {
      // Tryb mieszany: każde pojęcie raz, w jednym z pasujących kierunków.
      direction = fitting[Math.floor(random() * fitting.length)];
    }
    cards.push({ termID: term.id, direction });
  }
  return cards;
}

/** Liczba fiszek, które weszłyby do sesji przy każdym zakresie (do opisów w formularzu). */
export function scopeCounts(library, config, now = Date.now()) {
  const counts = {};
  for (const { id } of STUDY_SCOPES) {
    counts[id] = matchingCards(library, { ...config, scope: id }, () => 0, now).length;
  }
  return counts;
}

/**
 * Kolejka sesji: [{ termID, direction }].
 * config: { domainID, moduleID, lessonIDs, direction, scope, count, shuffle }.
 * W zakresie „Do powtórki” najpierw trafiają fiszki najdłużej czekające, a dopiero
 * wybrane są ewentualnie tasowane. `random` i `now` można podstawić w testach.
 */
export function buildQueue(library, config, random = Math.random, now = Date.now()) {
  let cards = matchingCards(library, config, random, now);
  if (config.scope === 'repeat') {
    const due = (card) => dueTime(library.getProgress(card.termID, card.direction));
    cards = cards.slice().sort((a, b) => due(a) - due(b));
    if (config.count > 0) cards = cards.slice(0, config.count);
    return config.shuffle ? shuffled(cards, random) : cards;
  }
  if (config.shuffle || config.scope === 'random') cards = shuffled(cards, random);
  return config.count > 0 ? cards.slice(0, config.count) : cards;
}

/** Ustawienia „Powtórki na dziś”: wszystkie zaległe fiszki z całej biblioteki, w obu kierunkach. */
export function reviewConfig(settings) {
  return {
    domainID: null,
    moduleID: null,
    lessonIDs: [],
    direction: MIXED,
    scope: 'repeat',
    count: 0,
    shuffle: false,
    front: settings.preferredFlashcardFront ?? 'term',
    review: true
  };
}

/**
 * Prognoza powtórek: ile fiszek (par pojęcie + kierunek) jest zaległych teraz, ile dojdzie
 * do końca dzisiejszego dnia i do końca jutra (według czasu urządzenia) oraz najbliższy termin.
 */
export function reviewForecast(library, now = Date.now()) {
  const endOfToday = new Date(now);
  endOfToday.setHours(24, 0, 0, 0);
  const endOfTomorrow = new Date(endOfToday);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  const result = { dueNow: 0, laterToday: 0, tomorrow: 0, next: null };
  for (const progress of library.listProgress()) {
    if (!library.getTerm(progress.termID)) continue;
    const due = dueTime(progress);
    if (due === null) continue;
    if (due <= now) result.dueNow += 1;
    else {
      if (due < endOfToday.getTime()) result.laterToday += 1;
      else if (due < endOfTomorrow.getTime()) result.tomorrow += 1;
      if (result.next === null || due < result.next) result.next = due;
    }
  }
  return result;
}

// ---------------------------------------------------------------- treść fiszki

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Treść obu stron fiszki.
 * Kierunek PL→EN pyta po polsku i oczekuje odpowiedzi po angielsku (EN→PL odwrotnie).
 * `front` wybiera, co widać na pierwszej stronie: pojęcie, definicję czy przykład;
 * gdy pojęcie nie ma takiej treści w języku pytania, pokazujemy samo pojęcie.
 */
export function cardContent(term, direction, front = 'term') {
  const fromPolish = direction !== DIRECTIONS.EN_PL;
  const source = fromPolish ? 'pl' : 'en';
  const target = fromPolish ? 'en' : 'pl';
  const field = (name, language) => text(term[`${name}${language.toUpperCase()}`]);

  let kind = 'term';
  let frontText = field('term', source);
  if (front === 'description' && field('description', source)) {
    kind = 'description';
    frontText = field('description', source);
  } else if (front === 'example' && field('example', source)) {
    kind = 'example';
    frontText = field('example', source);
  }

  const pair = (name) => [target, source]
    .map((language) => ({ text: field(name, language), lang: language }))
    .filter((item) => item.text !== null);

  return {
    source,
    target,
    front: { kind, text: frontText, lang: source },
    back: {
      answer: { text: field('term', target), lang: target },
      question: { text: field('term', source), lang: source },
      descriptions: pair('description'),
      examples: pair('example')
    }
  };
}

// ---------------------------------------------------------------- ocena

/** Stan kafelków nowej fiszki: false – „Nie umiem”, null – „Brak danych” (element nie istnieje). */
export function emptyTiles(term) {
  return {
    term: false,
    description: hasDescription(term) ? false : null,
    example: hasExample(term) ? false : null
  };
}

/** Wynik względem dostępnych elementów, np. { score: 2, available: 2 } dla pojęcia bez przykładu. */
export function scoreTiles(tiles) {
  let score = 0;
  let available = 0;
  for (const { id } of TILES) {
    if (tiles[id] === null || tiles[id] === undefined) continue;
    available += 1;
    if (tiles[id]) score += 1;
  }
  return { score, available };
}

/** Ustawia wszystkie dostępne kafelki („Umiem wszystko” / „Nie umiem niczego”). */
export function setAllTiles(tiles, value) {
  const result = {};
  for (const { id } of TILES) result[id] = tiles[id] === null || tiles[id] === undefined ? null : Boolean(value);
  return result;
}

/** Wpis historii ocen dla zatwierdzonej fiszki. */
export function makeAssessment({ term, direction, tiles, decision, sessionID = null, now = nowISO() }) {
  const { score, available } = scoreTiles(tiles);
  return {
    id: newID(),
    termID: term.id,
    direction,
    sessionID,
    knowsTerm: Boolean(tiles.term),
    knowsDescription: tiles.description ?? null,
    knowsExample: tiles.example ?? null,
    totalScore: score,
    availableElementCount: available,
    assessmentStatus: assessmentStatus(score, available),
    swipeDecision: decision,
    assessedAt: now
  };
}

// ---------------------------------------------------------------- FSRS

/** Polskie nazwy ocen FSRS (w nawiasie nazwa oryginalna). */
export const RATING_LABELS = Object.freeze({ 1: 'Nie pamiętam', 2: 'Trudno', 3: 'Dobrze', 4: 'Łatwo' });

/**
 * Ocena dla FSRS z wyniku fiszki:
 *   - nieznane pojęcie (tłumaczenie) – Again: zapomniane jest to, czego fiszka uczy,
 *   - pojęcie znane, ale nie wszystkie elementy – Hard: przypomnienie z trudem,
 *   - komplet dostępnych elementów – Good: zwykłe, poprawne przypomnienie,
 *   - decyzja „Powtórz” obniża ocenę o jeden stopień (najniżej Again),
 *   - Easy nie jest przyznawane automatycznie – aplikacja nie mierzy, czy przypomnienie
 *     było bez wysiłku, a premia za Easy wydłużałaby odstępy na wyrost.
 */
export function fsrsRating({ knowsTerm, totalScore, availableElementCount, swipeDecision }) {
  let rating;
  if (!knowsTerm) rating = RATINGS.AGAIN;
  else if (totalScore >= availableElementCount) rating = RATINGS.GOOD;
  else rating = RATINGS.HARD;
  if (swipeDecision === DECISIONS.REPEAT) rating = Math.max(RATINGS.AGAIN, rating - 1);
  return rating;
}

/** Karta FSRS (czas w ms) z harmonogramu zapisanego w postępie (czas jako ISO). */
export function scheduleToCard(schedule, now) {
  if (!schedule) return newCard(now);
  return {
    state: schedule.state,
    step: schedule.step ?? null,
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    due: Date.parse(schedule.due),
    lastReview: schedule.lastReview ? Date.parse(schedule.lastReview) : null
  };
}

/**
 * Powtórka w harmonogramie. Zwraca nowy harmonogram (do zapisania w postępie) oraz dane
 * do dziennika powtórek. `previous` to dotychczasowy harmonogram albo null (nowa fiszka).
 */
export function reviewSchedule(scheduler, previous, rating, now, random = Math.random) {
  const before = scheduleToCard(previous, now);
  const { card, retrievability, interval } = scheduler.review(before, rating, now, random);
  const lapse = rating === RATINGS.AGAIN && previous?.state === STATES.REVIEW;
  return {
    schedule: {
      state: card.state,
      step: card.step,
      stability: card.stability,
      difficulty: card.difficulty,
      due: new Date(card.due).toISOString(),
      lastReview: new Date(card.lastReview).toISOString(),
      reps: (previous?.reps ?? 0) + 1,
      lapses: (previous?.lapses ?? 0) + (lapse ? 1 : 0)
    },
    retrievability,
    interval,
    stateBefore: previous ? previous.state : 'new'
  };
}

/** Poziomy długoterminowe z FSRS – osobne od statusu ostatniej oceny. */
export const MASTERY_NAMES = Object.freeze({
  new: 'Nowe', learning: 'W nauce', young: 'Utrwalane', mature: 'Utrwalone'
});

/** Stabilność (w dniach), od której fiszkę uznajemy za utrwaloną – jak „dojrzała” karta w Anki. */
export const MATURE_STABILITY = 21;

export function masteryLevel(progress) {
  const schedule = progress?.schedule;
  if (!schedule) return 'new';
  if (schedule.state !== STATES.REVIEW) return 'learning';
  return schedule.stability >= MATURE_STABILITY ? 'mature' : 'young';
}

/** Odstęp czasu po polsku: „1 min”, „5 godz.”, „3 dni”, „2 mies.”, „4 lata”. */
export function formatInterval(milliseconds) {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} godz.`;
  const days = Math.round(hours / 24);
  if (days === 1) return '1 dzień';
  if (days < 31) return `${days} dni`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} mies.`;
  const years = Math.round(days / 365.25);
  if (years === 1) return '1 rok';
  const last = years % 10;
  const lastTwo = years % 100;
  return `${years} ${last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'lata' : 'lat'}`;
}

/** Termin powtórki względem teraz: „teraz”, „za 10 min”, „za 3 dni”. */
export function describeDue(progress, now = Date.now()) {
  const due = dueTime(progress);
  if (due === null) return null;
  return due <= now ? 'teraz' : `za ${formatInterval(due - now)}`;
}

/** Postęp pojęcia w kierunku po uwzględnieniu nowej oceny. `previous` może być null. */
export function nextProgress(previous, term, assessment, schedule = previous?.schedule ?? null) {
  const mastered = assessment.assessmentStatus === 'mastered' && assessment.swipeDecision === DECISIONS.KNOW;
  return {
    id: previous?.id ?? newID(),
    termID: term.id,
    lessonID: term.lessonID,
    moduleID: term.moduleID,
    domainID: term.domainID,
    direction: assessment.direction,
    ...(previous ?? {}),
    reviewCount: (previous?.reviewCount ?? 0) + 1,
    correctCount: (previous?.correctCount ?? 0) + (mastered ? 1 : 0),
    incorrectCount: (previous?.incorrectCount ?? 0) + (mastered ? 0 : 1),
    lastReviewedAt: assessment.assessedAt,
    lastScore: assessment.totalScore,
    lastAvailable: assessment.availableElementCount,
    lastStatus: assessment.assessmentStatus,
    lastDecision: assessment.swipeDecision,
    knowsTerm: assessment.knowsTerm,
    knowsDescription: assessment.knowsDescription,
    knowsExample: assessment.knowsExample,
    schedule,
    createdAt: previous?.createdAt ?? assessment.assessedAt,
    updatedAt: assessment.assessedAt
  };
}

/** Opis ostatniej oceny, np. „2/3 – Częściowo opanowane”. */
export function describeProgress(progress) {
  if (!progress || !progress.reviewCount) return 'Jeszcze nie oceniane';
  return `${progress.lastScore}/${progress.lastAvailable} – ${ASSESSMENT_STATUS_NAMES[progress.lastStatus] ?? ''}`;
}

// ---------------------------------------------------------------- sesja

/**
 * Nowa sesja nauki. `results[i]` opisuje decyzję dla `queue[i]`.
 * `baseQueue` to pełny zestaw fiszek sesji – runda powtórkowa ma krótszą kolejkę,
 * ale „Powtórz całą sesję” wraca do wszystkich fiszek.
 */
export function makeSession({ config, queue, round = 1, baseQueue = null, now = nowISO() }) {
  return { id: newID(), startedAt: now, config, queue, baseQueue: baseQueue ?? queue, position: 0, results: [], round };
}

/**
 * Kolejka do powtórzenia tych samych fiszek: przy losowej kolejności tasowana na nowo,
 * przy kolejności „jak w lekcjach” bez zmian.
 */
export function repeatQueue(queue, config, random = Math.random) {
  const cards = queue.map((card) => ({ termID: card.termID, direction: card.direction }));
  return config.shuffle || config.scope === 'random' ? shuffled(cards, random) : cards;
}

/** Krótki opis materiału sesji, np. „Lekcja Leadership” albo „Wszystkie dziedziny”. */
export function describeStudyMaterial(library, config) {
  const lessons = (config.lessonIDs ?? []).map((id) => library.getLesson(id)).filter(Boolean);
  if (lessons.length === 1) return `Lekcja ${lessons[0].name}`;
  if (lessons.length > 1) return `Lekcje: ${lessons.map((lesson) => lesson.name).join(', ')}`;
  const module = config.moduleID ? library.getModule(config.moduleID) : null;
  if (module) return `Moduł ${module.name}`;
  const domain = config.domainID ? library.getDomain(config.domainID) : null;
  if (domain) return `Dziedzina ${domain.name}`;
  return 'Wszystkie dziedziny';
}

export function isSessionFinished(session) {
  return session.position >= session.queue.length;
}

/** Liczby do podsumowania sesji i fiszki do rundy powtórkowej. */
export function summarizeSession(session) {
  const statuses = { mastered: 0, partiallyMastered: 0, inProgress: 0, toLearn: 0 };
  let know = 0;
  let repeat = 0;
  let skipped = 0;
  const repeatQueue = [];
  session.results.forEach((result, index) => {
    if (result.skipped) {
      skipped += 1;
      return;
    }
    statuses[result.status] += 1;
    if (result.decision === DECISIONS.KNOW) know += 1;
    else {
      repeat += 1;
      repeatQueue.push(session.queue[index]);
    }
  });
  return {
    total: session.queue.length,
    assessed: know + repeat,
    remaining: Math.max(0, session.queue.length - session.position),
    know,
    repeat,
    skipped,
    statuses,
    repeatQueue
  };
}
