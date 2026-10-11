// Nauka z fiszkami: dobór fiszek do sesji, treść obu stron, ocena z trzech kafelków,
// postęp pojęcia i podsumowanie sesji. Bez zależności od przeglądarki.
//
// Najważniejsze reguły:
//  - oceniane są tylko elementy, które pojęcie ma (tłumaczenie zawsze, opis i przykład,
//    jeśli istnieją) – brak treści nie obniża wyniku,
//  - postęp jest osobny dla każdego kierunku (PL→EN i EN→PL),
//  - fiszka jest „opanowana” tylko przy komplecie zaliczonych elementów i decyzji „Umiem”,
//  - każda zatwierdzona ocena trafia do historii; wcześniejszych wpisów nic nie nadpisuje.

import {
  ASSESSMENT_STATUS_NAMES, DIFFICULTY_MAX, DIRECTIONS, assessmentStatus, hasDescription, hasExample, newID, nowISO
} from './model.js';

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

/** Trudne: oznaczone przez użytkownika trudnością 4–5 albo ostatnio ocenione poniżej połowy. */
export function isHard(term, progress) {
  if ((term.difficulty ?? 0) >= DIFFICULTY_MAX - 1) return true;
  if (!progress || !progress.reviewCount) return false;
  return progress.lastStatus === 'toLearn' || progress.lastStatus === 'inProgress';
}

function matchesScope(scope, term, progress) {
  switch (scope) {
    case 'new': return learningGroup(progress) === 'new';
    case 'repeat': {
      const group = learningGroup(progress);
      return group === 'repeat' || group === 'learning';
    }
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
function matchingCards(library, config, random) {
  const cards = [];
  for (const term of selectTerms(library, config)) {
    const fitting = directionsFor(config.direction)
      .filter((direction) => matchesScope(config.scope, term, library.getProgress(term.id, direction)));
    if (fitting.length === 0) continue;
    // Tryb mieszany: każde pojęcie raz, w jednym z pasujących kierunków.
    const direction = fitting.length === 1 ? fitting[0] : fitting[Math.floor(random() * fitting.length)];
    cards.push({ termID: term.id, direction });
  }
  return cards;
}

/** Liczba fiszek, które weszłyby do sesji przy każdym zakresie (do opisów w formularzu). */
export function scopeCounts(library, config) {
  const counts = {};
  for (const { id } of STUDY_SCOPES) {
    counts[id] = matchingCards(library, { ...config, scope: id }, () => 0).length;
  }
  return counts;
}

/**
 * Kolejka sesji: [{ termID, direction }].
 * config: { domainID, moduleID, lessonIDs, direction, scope, count, shuffle }.
 * `random` można podstawić w testach.
 */
export function buildQueue(library, config, random = Math.random) {
  let cards = matchingCards(library, config, random);
  if (config.shuffle || config.scope === 'random') cards = shuffled(cards, random);
  return config.count > 0 ? cards.slice(0, config.count) : cards;
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

/** Postęp pojęcia w kierunku po uwzględnieniu nowej oceny. `previous` może być null. */
export function nextProgress(previous, term, assessment) {
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

/** Nowa sesja nauki. `results[i]` opisuje decyzję dla `queue[i]`. */
export function makeSession({ config, queue, round = 1, now = nowISO() }) {
  return { id: newID(), startedAt: now, config, queue, position: 0, results: [], round };
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
