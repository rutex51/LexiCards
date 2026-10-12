// Start aplikacji: baza danych, biblioteka, nawigacja i odświeżanie ekranów.

import { Library } from './core/library.js';
import { openDefaultAdapter } from './core/storage.js';
import { toast } from './ui/dialogs.js';
import { h, replaceChildren } from './ui/dom.js';
import { Router, routeKey } from './ui/router.js';
import { GlossaryScreen } from './ui/screens/glossary.js';
import { ImportScreen } from './ui/screens/import.js';
import { DomainScreen, DomainsScreen, ModuleScreen } from './ui/screens/library.js';
import { QuizSessionScreen } from './ui/screens/quiz-session.js';
import { QuizSetupScreen } from './ui/screens/quiz-setup.js';
import { SettingsScreen } from './ui/screens/settings.js';
import { StartScreen } from './ui/screens/start.js';
import { StudySessionScreen } from './ui/screens/study-session.js';
import { StudySetupScreen } from './ui/screens/study-setup.js';
import { LessonScreen } from './ui/screens/terms.js';
import { UpcomingScreen } from './ui/screens/upcoming.js';
import { Shell } from './ui/shell.js';
import { APP_VERSION, BUILD_ID } from './version.js';

const SCREENS = {
  start: StartScreen,
  domains: DomainsScreen,
  domain: DomainScreen,
  module: ModuleScreen,
  lesson: LessonScreen,
  glossary: GlossaryScreen,
  import: ImportScreen,
  study: StudySetupScreen,
  studySession: StudySessionScreen,
  quiz: QuizSetupScreen,
  quizSession: QuizSessionScreen,
  stats: UpcomingScreen,
  settings: SettingsScreen
};

const WIDE_QUERY = '(min-width: 900px)';

/**
 * iPhone i iPad: Safari nie powiększa strony przy dotknięciu pola formularza, gdy widok ma
 * maximum-scale=1. Powiększanie dwoma palcami nadal działa – Safari ignoruje to ograniczenie
 * dla gestów użytkownika. Na innych urządzeniach znacznik zostaje bez zmian, bo tam
 * maximum-scale blokowałoby też ręczne powiększanie.
 */
function preventInputZoom() {
  const agent = navigator.userAgent;
  const apple = /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  const meta = document.querySelector('meta[name="viewport"]');
  if (!apple || !meta || /maximum-scale/.test(meta.content)) return;
  meta.content = `${meta.content}, maximum-scale=1`;
}

preventInputZoom();
const APPEARANCE_KEY = 'lexicards-appearance';
const THEME_COLORS = { light: '#f2f2f7', dark: '#000000' };

/** Ustawia motyw i zapamiętuje go, żeby kolejne uruchomienie nie mignęło innym. */
function applyAppearance(appearance) {
  const root = document.documentElement;
  if (appearance === 'light' || appearance === 'dark') root.dataset.theme = appearance;
  else delete root.dataset.theme;
  try {
    localStorage.setItem(APPEARANCE_KEY, appearance);
  } catch {
    // Pamięć lokalna bywa wyłączona; motyw i tak zostanie ustawiony po wczytaniu bazy.
  }
  const dark = appearance === 'dark' || (appearance !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

/** Arkusze formularzy trzymają się widocznej części ekranu, także nad klawiaturą telefonu. */
function trackVisualViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const style = document.documentElement.style;
  const update = () => {
    if (viewport.scale > 1.01) {
      style.removeProperty('--vv-height');
      style.removeProperty('--vv-top');
      return;
    }
    style.setProperty('--vv-height', `${viewport.height}px`);
    style.setProperty('--vv-top', `${viewport.offsetTop}px`);
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  update();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let announced = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nowe wydanie jest już pobrane; otwarta aplikacja działa jeszcze na starych plikach.
    if (!hadController || announced) return;
    announced = true;
    toast('Pobrano nową wersję aplikacji.', {
      action: { label: 'Uruchom ją', onSelect: () => window.location.reload() }
    });
  });

  let registration = null;
  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.warn('Tryb offline niedostępny:', error);
    }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  // Aplikacja z ekranu początkowego rzadko startuje od zera, więc nowego wydania
  // szukamy także przy każdym powrocie do niej.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration?.update().catch(() => {});
  });
}

async function boot() {
  const root = document.getElementById('app');
  const adapter = await openDefaultAdapter();
  const library = new Library(adapter);
  await library.load();
  applyAppearance(library.getSettings().appearance);

  const wide = window.matchMedia(WIDE_QUERY);
  /** Bieżący ekran: { key, screen }. Obiekt ekranu żyje, dopóki adres się nie zmieni. */
  let current = null;
  let refreshQueued = false;
  /** Pozycje przewijania zapamiętane dla wpisów historii (powrót gestem „wstecz”). */
  const scrollByEntry = new Map();
  let currentEntry = null;

  const router = new Router((route, navigation) => show(route, navigation));
  const shell = new Shell(root, router);

  const ctx = {
    library,
    env: { storageKind: adapter.kind, appVersion: APP_VERSION, buildID: BUILD_ID },
    refresh() {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        render({ keepScroll: true });
      });
    },
    navigate: (hash, options) => router.navigate(hash, options),
    isWide: () => wide.matches,
    applyAppearance: () => applyAppearance(library.getSettings().appearance)
  };

  function render({ keepScroll }) {
    if (!current) return;
    try {
      shell.render(current.screen.view(), { keepScroll });
    } catch (error) {
      console.error(error);
      shell.render({
        title: 'Coś poszło nie tak',
        body: h('div', { class: 'empty' },
          h('h2', { class: 'empty__title' }, 'Nie udało się wyświetlić tego ekranu'),
          h('p', { class: 'empty__text' }, error?.message ?? String(error)),
          h('div', { class: 'empty__actions' }, h('a', { class: 'button button--primary', href: '#/start' }, 'Wróć na Start'))
        )
      }, { keepScroll: false });
    }
  }

  function show(route, navigation) {
    if (currentEntry !== null) scrollByEntry.set(currentEntry, window.scrollY);
    currentEntry = navigation.entry;

    const key = routeKey(route);
    const changed = !current || current.key !== key;
    const first = current === null;
    if (changed) {
      current?.screen.dispose?.();
      const Screen = SCREENS[route.name] ?? StartScreen;
      current = { key, screen: new Screen(ctx, route) };
    }
    shell.setActiveTab(route.tab, route.name === 'settings');
    render({ keepScroll: !changed });
    if (changed) {
      if (navigation.restored) window.scrollTo(0, scrollByEntry.get(navigation.entry) ?? 0);
      if (!first) shell.focusTitle();
    }
  }

  // Zmiany w innej karcie przeglądarki: wczytujemy dane ponownie, żeby obie karty pokazywały to samo.
  const channel = adapter.kind === 'indexeddb' && 'BroadcastChannel' in window ? new BroadcastChannel('lexicards') : null;
  let applyingRemote = false;
  let persistenceRequested = false;

  library.subscribe(() => {
    if (!applyingRemote) channel?.postMessage('changed');
    ctx.refresh();
    // Pierwsze dane: prosimy przeglądarkę, żeby nie usuwała bazy przy porządkach.
    if (!persistenceRequested && adapter.kind === 'indexeddb' && !library.isEmpty()) {
      persistenceRequested = true;
      navigator.storage?.persist?.().catch(() => {});
    }
  });

  if (channel) {
    channel.onmessage = async () => {
      applyingRemote = true;
      try {
        await library.load();
        ctx.applyAppearance();
      } catch (error) {
        console.error(error);
      } finally {
        applyingRemote = false;
      }
    };
  }

  wide.addEventListener('change', () => ctx.refresh());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => ctx.applyAppearance());

  if (adapter.kind !== 'indexeddb') {
    shell.showBanner('Przeglądarka nie pozwala zapisywać danych (na przykład w trybie prywatnym). Zmiany znikną po zamknięciu karty.');
  }

  trackVisualViewport();
  router.start();
  registerServiceWorker();

  // Uchwyt dla testów automatycznych i diagnostyki w konsoli.
  window.lexicards = { library, version: APP_VERSION, build: BUILD_ID, storage: adapter.kind };
  root.dataset.ready = 'true';
}

boot().catch((error) => {
  console.error(error);
  const root = document.getElementById('app');
  replaceChildren(root,
    h('div', { class: 'empty', role: 'alert' },
      h('h1', { class: 'empty__title' }, 'Nie udało się uruchomić aplikacji'),
      h('p', { class: 'empty__text' }, error?.message ?? String(error)),
      h('div', { class: 'empty__actions' },
        h('button', { type: 'button', class: 'button button--primary', onClick: () => location.reload() }, 'Spróbuj ponownie')
      )
    )
  );
});
