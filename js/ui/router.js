// Nawigacja oparta na adresie po znaku # – działa na hostingu plików statycznych,
// z przyciskiem „Wstecz” przeglądarki i gestem cofania w Safari.

export const TABS = [
  { id: 'start', title: 'Start', icon: 'home', root: '#/start' },
  { id: 'library', title: 'Biblioteka', icon: 'library', root: '#/library' },
  { id: 'study', title: 'Nauka', icon: 'cards', root: '#/study' },
  { id: 'quiz', title: 'Quiz', icon: 'quiz', root: '#/quiz' },
  { id: 'stats', title: 'Statystyki', icon: 'stats', root: '#/stats' }
];

export const routes = {
  start: () => '#/start',
  domains: () => '#/library',
  glossary: () => '#/library/glossary',
  domain: (id) => `#/library/domain/${encodeURIComponent(id)}`,
  module: (id) => `#/library/module/${encodeURIComponent(id)}`,
  lesson: (id) => `#/library/lesson/${encodeURIComponent(id)}`,
  /** Kreator importu; z identyfikatorem lekcji – import do tej lekcji. */
  importFile: (lessonID = null) => (lessonID ? `#/library/import/${encodeURIComponent(lessonID)}` : '#/library/import'),
  /** Przygotowanie sesji nauki; preset: { level: 'domain' | 'module' | 'lesson', id } wybiera materiał. */
  study: (preset = null) => (preset ? `#/study/${preset.level}/${encodeURIComponent(preset.id)}` : '#/study'),
  studySession: () => '#/study/session',
  /** Konfiguracja quizu; preset jak w nauce. */
  quiz: (preset = null) => (preset ? `#/quiz/${preset.level}/${encodeURIComponent(preset.id)}` : '#/quiz'),
  quizSession: () => '#/quiz/session',
  /** Statystyki całej biblioteki albo – ze scope: { level, id } – dziedziny, modułu lub lekcji. */
  stats: (scope = null) => (scope && scope.level !== 'library' ? `#/stats/${scope.level}/${encodeURIComponent(scope.id)}` : '#/stats'),
  settings: () => '#/settings'
};

/** Zamienia fragment adresu na opis ekranu: { tab, name, id }. */
export function parseHash(hash) {
  const parts = String(hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const [first, second, third] = parts;
  switch (first) {
    case 'library':
      if (second === 'glossary') return { tab: 'library', name: 'glossary' };
      if (second === 'import') return { tab: 'library', name: 'import', id: third ?? null };
      if (['domain', 'module', 'lesson'].includes(second) && third) return { tab: 'library', name: second, id: third };
      return { tab: 'library', name: 'domains' };
    case 'study':
      if (second === 'session') return { tab: 'study', name: 'studySession' };
      if (['domain', 'module', 'lesson'].includes(second) && third) {
        return { tab: 'study', name: 'study', id: `${second}:${third}`, preset: { level: second, id: third } };
      }
      return { tab: 'study', name: 'study' };
    case 'quiz':
      if (second === 'session') return { tab: 'quiz', name: 'quizSession' };
      if (['domain', 'module', 'lesson'].includes(second) && third) {
        return { tab: 'quiz', name: 'quiz', id: `${second}:${third}`, preset: { level: second, id: third } };
      }
      return { tab: 'quiz', name: 'quiz' };
    case 'stats':
      if (['domain', 'module', 'lesson'].includes(second) && third) {
        return { tab: 'stats', name: 'stats', id: `${second}:${third}`, scope: { level: second, id: third } };
      }
      return { tab: 'stats', name: 'stats', scope: { level: 'library' } };
    case 'settings': return { tab: null, name: 'settings' };
    default: return { tab: 'start', name: 'start' };
  }
}

export function routeKey(route) {
  return `${route.name}:${route.id ?? ''}`;
}

export class Router {
  constructor(onChange) {
    this.onChange = onChange;
    /** Ostatnio odwiedzony adres w każdej zakładce (jak osobne stosy nawigacji w iOS). */
    this.lastHashByTab = new Map();
    this.current = parseHash(location.hash);
    // Pozycję przewijania przywracamy sami – treść ekranu powstaje dopiero po zmianie adresu.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.addEventListener('hashchange', () => this.#handle());
  }

  start() {
    if (!location.hash || location.hash === '#') {
      history.replaceState(null, '', routes.start());
    }
    this.#handle();
  }

  /**
   * Każdy wpis historii dostaje identyfikator. Wpis, który już go ma, został odwiedzony
   * wcześniej – to powrót („wstecz”/„dalej”), przy którym przywracamy przewinięcie.
   */
  #entry() {
    const known = history.state?.lexicardsEntry;
    if (known) return { entry: known, restored: true };
    const entry = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    history.replaceState({ ...(history.state ?? {}), lexicardsEntry: entry }, '');
    return { entry, restored: false };
  }

  #handle() {
    const hash = location.hash || routes.start();
    this.current = parseHash(hash);
    if (this.current.tab) this.lastHashByTab.set(this.current.tab, hash);
    this.onChange(this.current, this.#entry());
  }

  navigate(hash, { replace = false } = {}) {
    if (replace) {
      history.replaceState(null, '', hash);
      this.#handle();
    } else if (location.hash === hash) {
      // Ponowny wybór miejsca, w którym już jesteśmy, wraca na górę ekranu.
      this.#handle();
      window.scrollTo(0, 0);
    } else {
      location.hash = hash;
    }
  }

  /** Adres zakładki: ostatnie miejsce w niej, a przy ponownym wyborze aktywnej – jej początek. */
  tabHref(tab) {
    if (this.current.tab === tab.id) return tab.root;
    return this.lastHashByTab.get(tab.id) ?? tab.root;
  }
}
