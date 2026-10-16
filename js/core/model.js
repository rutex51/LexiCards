// Model danych: nazwy magazynów, stałe, fabryki rekordów i logika ocen.
//
// Hierarchia: Dziedzina → Moduł → Lekcja → Pojęcie. Powiązania to klucze UUID
// (domainID, moduleID, lessonID, termID). Pojęcie przechowuje także kopie moduleID
// i domainID, żeby filtrowanie i zliczanie nie wymagało przechodzenia po hierarchii.

import { blankToNull, collapseWhitespace, normalizeKey, uniqueTags } from './text.js';

export const SCHEMA_VERSION = 1;

/** Magazyny trzymane w pamięci przez cały czas działania aplikacji. */
export const MEMORY_STORES = ['domains', 'modules', 'lessons', 'terms', 'progress', 'settings'];

/** Dzienniki nauki – tylko dopisywane, czytane z bazy na żądanie (od etapu 3). */
export const HISTORY_STORES = ['assessments', 'reviews', 'quizAnswers', 'studySessions', 'quizSessions'];

/** Dzienniki powiązane z pojęciem kluczem termID – usuwane razem z pojęciem. */
export const TERM_HISTORY_STORES = ['assessments', 'reviews', 'quizAnswers'];

export const ALL_STORES = [...MEMORY_STORES, ...HISTORY_STORES];

export const SETTINGS_ID = 'app';

export const DIRECTIONS = Object.freeze({ PL_EN: 'pl_en', EN_PL: 'en_pl' });

export const DOMAIN_COLORS = Object.freeze([
  'blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'mint', 'teal', 'cyan', 'brown', 'gray'
]);

export const DOMAIN_COLOR_NAMES = Object.freeze({
  blue: 'Niebieski', indigo: 'Indygo', purple: 'Fioletowy', pink: 'Różowy', red: 'Czerwony',
  orange: 'Pomarańczowy', yellow: 'Żółty', green: 'Zielony', mint: 'Miętowy', teal: 'Morski',
  cyan: 'Cyjan', brown: 'Brązowy', gray: 'Szary'
});

/** Kolory aplikacji (przyciski, zaznaczenia, linki) – osobno od motywu jasnego i ciemnego. */
export const ACCENT_COLORS = Object.freeze([
  { id: 'blue', label: 'Niebieski' },
  { id: 'graphite', label: 'Antracytowy' },
  { id: 'orange', label: 'Pomarańczowy' },
  { id: 'green', label: 'Zielony' },
  { id: 'red', label: 'Czerwony' }
]);
export const DEFAULT_ACCENT = 'blue';

/** Kolor aplikacji z ustawień; nieznana wartość (np. z kopii z nowszej wersji) – domyślny. */
export function accentColor(settings) {
  return ACCENT_COLORS.some((item) => item.id === settings?.accentColor) ? settings.accentColor : DEFAULT_ACCENT;
}

/**
 * Ikony dziedzin, z grubsza tematycznie: ogólne i biznes, zarządzanie, ekonomia i finanse,
 * języki, decyzje, zachowania, raportowanie, etyka, nauki i technika, pozostałe.
 * Flagi na Windows wyświetlają się jako litery (np. „ES”) – system nie ma ich obrazków.
 */
export const DOMAIN_ICONS = Object.freeze([
  '📁', '💼', '👔', '🏢', '🧭', '🏛️', '👥',
  '💶', '🏦', '💹', '📈', '📉', '🪙', '🧮',
  '🇬🇧', '🇺🇸', '🇪🇸', '💃', '🗣️', '💬', '🌍', '📚', '🎓',
  '🎯', '🚦', '🧠', '🎭', '🤝',
  '📊', '📑', '📝', '📄',
  '⚖️', '🛡️', '🕊️',
  '📐', '⚙️', '🔧', '🔨', '💻', '⚡', '⚛️', '🩺', '🧪', '🌿',
  '✈️', '🛒', '💡', '🎨', '🎵', '📷'
]);

export const DEFAULT_DOMAIN_ICON = '📁';
export const DEFAULT_DOMAIN_COLOR = 'blue';
export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;

export function newID() {
  return globalThis.crypto.randomUUID();
}

export function nowISO() {
  return new Date().toISOString();
}

export function defaultSettings() {
  const now = nowISO();
  return {
    id: SETTINGS_ID,
    appearance: 'system',          // system | light | dark
    accentColor: 'blue',           // kolor aplikacji: blue | graphite | orange | green | red
    preferredDirection: 'pl_en',   // pl_en | en_pl | mixed
    preferredFlashcardFront: 'term',
    preferredQuizLength: 10,       // liczba pytań quizu (0 = wszystkie pojęcia materiału)
    quizType: 'choice',            // choice | matching | mixed
    quizDirection: 'pl_en',        // pl_en | en_pl | mixed
    quizChoiceShare: 0.6,          // udział pytań wyboru w teście mieszanym
    quizTimeLimit: 0,              // sekundy; 0 – bez limitu
    quizPassThreshold: 0.8,        // próg zaliczenia
    quizSelection: null,           // ostatnio wybrany materiał quizu
    activeQuiz: null,              // trwający albo właśnie zakończony quiz – do wznowienia i wyników
    statsDirection: null,          // kierunek w statystykach: pl_en | en_pl | both; null – jak w nauce
    statsRange: 30,                // dni na wykresach: 7 | 30 | 90
    statsLevel: 'domain',          // zestawienie opanowania: domain | module | lesson
    listenSelection: null,         // słuchanie: ostatnio wybrany materiał
    listenDirection: 'mixed',      // pl_en | en_pl | mixed
    listenScope: 'all',
    listenCount: 20,
    listenPause: 5,                // sekundy na zastanowienie
    listenDescription: true,       // czytać definicję po odpowiedzi
    listenExample: true,           // czytać przykład po odpowiedzi
    listenRepeatAnswer: false,     // powtórzyć odpowiedź drugi raz
    listenDetailLanguage: 'en',    // język definicji i przykładu: en | pl
    listenBackground: null,        // wynik sprawdzenia czytania przy zablokowanym ekranie: { result, testedAt }
    listenKeepAudio: true,         // cichy dźwięk w tle podczas słuchania (Bluetooth, CarPlay) i przyciski systemu
    dailyLearningGoal: 20,
    speechRate: 1,
    preferredVoicePL: null,
    preferredVoiceEN: null,
    shuffleCards: true,
    automaticReviewMode: true,
    studyScope: 'all',             // ostatnio wybrany zakres fiszek
    studyCount: 20,                // ostatnio wybrana liczba fiszek (0 = wszystkie)
    activeStudySession: null,      // trwająca sesja nauki – do wznowienia po ponownym otwarciu
    lastStudySession: null,        // ostatnia zakończona sesja: { config, queue, finishedAt } – do powtórzenia
    desiredRetention: 0.9,         // FSRS: docelowa szansa przypomnienia w dniu powtórki
    studySelection: null,          // ostatnio wybrany materiał: { domainID, moduleID, lessonIDs }
    lastBackupAt: null,
    createdAt: now,
    updatedAt: now
  };
}

export function makeDomain({ name, details = null, icon = null, color = null, sortOrder = 0 }) {
  const now = nowISO();
  return {
    id: newID(),
    name,
    nameKey: normalizeKey(name),
    details,
    icon: icon ?? DEFAULT_DOMAIN_ICON,
    color: color ?? DEFAULT_DOMAIN_COLOR,
    sortOrder,
    createdAt: now,
    updatedAt: now
  };
}

export function makeModule({ domainID, name, details = null, sortOrder = 0 }) {
  const now = nowISO();
  return {
    id: newID(),
    domainID,
    name,
    nameKey: normalizeKey(name),
    details,
    sortOrder,
    createdAt: now,
    updatedAt: now
  };
}

export function makeLesson({ moduleID, domainID, name, details = null, sortOrder = 0 }) {
  const now = nowISO();
  return {
    id: newID(),
    moduleID,
    domainID,
    name,
    nameKey: normalizeKey(name),
    details,
    sortOrder,
    createdAt: now,
    updatedAt: now
  };
}

/** Pola pojęcia wynikające ze szkicu formularza (puste teksty → null). */
export function termFieldsFromDraft(draft) {
  const termPL = collapseWhitespace(draft.termPL);
  const termEN = collapseWhitespace(draft.termEN);
  const tags = uniqueTags(draft.tags ?? []);
  return {
    termPL,
    termEN,
    keyPL: normalizeKey(termPL),
    keyEN: normalizeKey(termEN),
    descriptionPL: blankToNull(draft.descriptionPL),
    descriptionEN: blankToNull(draft.descriptionEN),
    examplePL: blankToNull(draft.examplePL),
    exampleEN: blankToNull(draft.exampleEN),
    tags,
    tagKeys: tags.map(normalizeKey),
    difficulty: draft.difficulty ?? null,
    notes: blankToNull(draft.notes),
    isFavorite: Boolean(draft.isFavorite)
  };
}

export function makeTerm({ lesson, draft, sortOrder = 0 }) {
  const now = nowISO();
  return {
    id: newID(),
    lessonID: lesson.id,
    moduleID: lesson.moduleID,
    domainID: lesson.domainID,
    ...termFieldsFromDraft(draft),
    sortOrder,
    createdAt: now,
    updatedAt: now
  };
}

/** Pusty szkic pojęcia dla formularza. */
export function emptyTermDraft() {
  return {
    termPL: '', termEN: '', descriptionPL: '', descriptionEN: '', examplePL: '', exampleEN: '',
    tags: [], difficulty: null, notes: '', isFavorite: false
  };
}

export function termToDraft(term) {
  return {
    termPL: term.termPL,
    termEN: term.termEN,
    descriptionPL: term.descriptionPL ?? '',
    descriptionEN: term.descriptionEN ?? '',
    examplePL: term.examplePL ?? '',
    exampleEN: term.exampleEN ?? '',
    tags: [...(term.tags ?? [])],
    difficulty: term.difficulty ?? null,
    notes: term.notes ?? '',
    isFavorite: Boolean(term.isFavorite)
  };
}

// ---------------------------------------------------------------- oceny

export function hasDescription(term) {
  return Boolean(term.descriptionPL || term.descriptionEN);
}

export function hasExample(term) {
  return Boolean(term.examplePL || term.exampleEN);
}

/**
 * Liczba elementów podlegających ocenie na fiszce (1–3). Tłumaczenie jest zawsze
 * dostępne; opis i przykład tylko wtedy, gdy istnieją. Brak treści nie obniża wyniku.
 */
export function availableElementCount(term) {
  return 1 + (hasDescription(term) ? 1 : 0) + (hasExample(term) ? 1 : 0);
}

/**
 * Status ostatniej oceny, proporcjonalny do liczby dostępnych elementów:
 * 3 dostępne: 0 → toLearn, 1 → inProgress, 2 → partiallyMastered, 3 → mastered
 * 2 dostępne: 0 → toLearn, 1 → partiallyMastered, 2 → mastered
 * 1 dostępny: 0 → toLearn, 1 → mastered
 */
export function assessmentStatus(score, available) {
  if (available <= 0 || score <= 0) return 'toLearn';
  if (score >= available) return 'mastered';
  return score * 2 >= available ? 'partiallyMastered' : 'inProgress';
}

export const ASSESSMENT_STATUS_NAMES = Object.freeze({
  toLearn: 'Do nauki',
  inProgress: 'W trakcie nauki',
  partiallyMastered: 'Częściowo opanowane',
  mastered: 'Opanowane'
});
