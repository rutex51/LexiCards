// Słuchanie: ustawienia (materiał, kierunek, zakres, czas na zastanowienie, co czytać)
// i odtwarzanie. Ekran ma być obsługiwany bez patrzenia: duży przycisk pauzy, ekran nie gaśnie.
//
// Słuchanie nie zmienia powtórek FSRS ani postępów – nie ma oceny odpowiedzi.

import {
  DEFAULT_LISTEN_PAUSE, LISTEN_COUNTS, LISTEN_DETAIL_LANGUAGES, LISTEN_PAUSES, STEP_LABELS, estimateListening
} from '../../core/listen.js';
import { DIRECTIONS } from '../../core/model.js';
import { MIXED, STUDY_DIRECTIONS, STUDY_SCOPES, buildQueue, scopeCounts } from '../../core/study.js';
import { pluralTerms } from '../../core/text.js';
import { checkRow, emptyState, field, formGroup, group, navButton, segmented, selectInput } from '../components.js';
import { toast } from '../dialogs.js';
import { h, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { ListenPlayer } from '../listen-player.js';
import { initialSelection, lessonsGroup, materialGroup, sanitizeSelection, selectionConfig } from '../material.js';
import { routes } from '../router.js';
import { speechAvailable } from '../speech.js';

const DIRECTION_SHORT = { [DIRECTIONS.PL_EN]: 'PL → EN', [DIRECTIONS.EN_PL]: 'EN → PL' };
/** Najkrótsza nieobecność, po której wiadomo, czy czytanie trwało przy zablokowanym ekranie. */
const BACKGROUND_TEST_MS = 8000;

const known = (list, value, fallback) => (list.some((item) => (item.id ?? item) === value) ? value : fallback);

function formatMinutes(milliseconds) {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  return `ok. ${minutes} min`;
}

export class ListenScreen {
  constructor(ctx) {
    this.ctx = ctx;
    const settings = ctx.library.getSettings();
    this.selection = initialSelection(ctx.library, settings.listenSelection, null);
    this.direction = known(STUDY_DIRECTIONS, settings.listenDirection, MIXED);
    this.scope = known(STUDY_SCOPES, settings.listenScope, 'all');
    this.count = known(LISTEN_COUNTS, settings.listenCount, 20);
    this.pause = known(LISTEN_PAUSES, settings.listenPause, DEFAULT_LISTEN_PAUSE);
    this.description = settings.listenDescription !== false;
    this.example = settings.listenExample !== false;
    this.repeatAnswer = Boolean(settings.listenRepeatAnswer);
    this.detailLanguage = known(LISTEN_DETAIL_LANGUAGES, settings.listenDetailLanguage, 'en');
    this.player = null;
    this.wakeLock = null;
    this.wakeState = null;
    this.hidden = null;
    this.disposed = false;

    this.onVisibility = () => this.#visibilityChanged();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  dispose() {
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.player?.stop();
    this.#releaseScreen();
  }

  // ---------------------------------------------------------------- ekran i tło

  async #keepScreenOn() {
    if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') {
      this.wakeState = 'unsupported';
      this.ctx.refresh();
      return;
    }
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (this.disposed || !this.player || this.player.phase === 'finished') {
        lock.release?.().catch?.(() => {});
        return;
      }
      this.wakeLock = lock;
      this.wakeState = 'on';
      lock.addEventListener?.('release', () => {
        if (this.wakeLock === lock) {
          this.wakeLock = null;
          this.wakeState = 'off';
          if (!this.disposed) this.ctx.refresh();
        }
      });
    } catch (error) {
      console.warn('Blokada wygaszania ekranu niedostępna:', error);
      this.wakeState = 'failed';
    }
    if (!this.disposed) this.ctx.refresh();
  }

  #releaseScreen() {
    const lock = this.wakeLock;
    this.wakeLock = null;
    if (lock) Promise.resolve(lock.release?.()).catch(() => {});
  }

  /**
   * Sprawdzenie na urządzeniu: czy czytanie trwało, gdy ekran był zablokowany albo aplikacja
   * w tle. Wynik jest zapamiętany i widoczny w ustawieniach słuchania.
   */
  #visibilityChanged() {
    const player = this.player;
    if (!player) return;
    if (document.visibilityState === 'hidden') {
      if (player.phase === 'playing') this.hidden = { at: Date.now(), steps: player.stepsDone };
      return;
    }
    const away = this.hidden;
    this.hidden = null;
    if (player.phase === 'finished') return;
    // System zwalnia blokadę ekranu, gdy strona znika – po powrocie prosimy o nią ponownie.
    if (!this.wakeLock) this.#keepScreenOn();
    if (!away || player.phase !== 'playing') return;
    if (Date.now() - away.at >= BACKGROUND_TEST_MS) {
      const continued = player.stepsDone > away.steps;
      this.ctx.library.updateSettings({ listenBackground: { result: continued ? 'continues' : 'stops', testedAt: new Date().toISOString() } })
        .catch((error) => console.error(error));
      toast(continued
        ? 'Czytanie trwało, gdy ekran był wyłączony.'
        : 'Czytanie zatrzymało się, gdy ekran był wyłączony – trzymaj LexiCards na ekranie.');
    }
    // Wypowiedź przerwana przez system nie zgłasza końca – czytamy bieżący krok jeszcze raz.
    player.restartStep();
  }

  // ---------------------------------------------------------------- start

  #config() {
    return {
      ...selectionConfig(this.selection),
      direction: this.direction,
      scope: this.scope,
      count: this.count,
      shuffle: true,
      front: 'term'
    };
  }

  #options() {
    return {
      thinkMs: this.pause * 1000,
      description: this.description,
      example: this.example,
      repeatAnswer: this.repeatAnswer,
      detailLanguage: this.detailLanguage
    };
  }

  #cards(config = this.#config()) {
    const { library } = this.ctx;
    return buildQueue(library, config)
      .map((card) => ({ term: library.getTerm(card.termID), direction: card.direction }))
      .filter((card) => card.term);
  }

  /** Start w obsłudze dotknięcia: pierwsza wypowiedź musi paść bezpośrednio po geście. */
  #start(cards = null) {
    const list = cards ?? this.#cards();
    if (list.length === 0) return;
    this.player?.stop();
    this.player = new ListenPlayer({
      cards: list,
      options: this.#options(),
      settings: () => this.ctx.library.getSettings(),
      onChange: () => {
        if (this.player?.phase === 'finished') this.#releaseScreen();
        if (!this.disposed) this.ctx.refresh();
      }
    });
    this.player.start();
    this.#keepScreenOn();
    this.ctx.library.updateSettings({
      listenSelection: selectionConfig(this.selection),
      listenDirection: this.direction,
      listenScope: this.scope,
      listenCount: this.count,
      listenPause: this.pause,
      listenDescription: this.description,
      listenExample: this.example,
      listenRepeatAnswer: this.repeatAnswer,
      listenDetailLanguage: this.detailLanguage
    }).catch((error) => console.error(error));
    window.scrollTo(0, 0);
  }

  #again() {
    const cards = this.player.cards.map(({ term, direction }) => ({ term, direction }));
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [cards[index], cards[other]] = [cards[other], cards[index]];
    }
    this.#start(cards);
  }

  #close() {
    this.player?.stop();
    this.player = null;
    this.#releaseScreen();
    this.wakeState = null;
    this.ctx.refresh();
  }

  // ---------------------------------------------------------------- widoki

  #backgroundNote() {
    const test = this.ctx.library.getSettings().listenBackground;
    if (test?.result === 'continues') {
      return 'Sprawdzone na tym urządzeniu: czytanie trwa także przy wyłączonym ekranie.';
    }
    if (test?.result === 'stops') {
      return 'Sprawdzone na tym urządzeniu: przy wyłączonym ekranie albo w innej aplikacji czytanie się zatrzymuje. '
        + 'Trzymaj LexiCards na ekranie – aplikacja nie pozwoli mu zgasnąć.';
    }
    return 'Jeszcze nie sprawdzone na tym urządzeniu, czy czytanie trwa przy wyłączonym ekranie. Uruchom słuchanie, '
      + 'zablokuj telefon na około 30 sekund i odblokuj go – aplikacja zapamięta wynik.';
  }

  #setupView() {
    const { ctx } = this;
    const { library } = ctx;
    sanitizeSelection(library, this.selection);
    const config = this.#config();
    const counts = scopeCounts(library, config);
    const matching = counts[this.scope];
    const planned = this.count > 0 ? Math.min(this.count, matching) : matching;
    const available = speechAvailable();
    // Szacunek na przykładowych pojęciach z wybranego zakresu.
    const sample = planned > 0 ? this.#cards({ ...config, shuffle: false, count: 0 }).slice(0, 40) : [];
    const estimate = sample.length > 0
      ? (estimateListening(sample, this.#options(), Number(library.getSettings().speechRate) || 1) / sample.length) * planned
      : 0;

    const startButton = h('button', {
      type: 'button',
      class: 'button button--primary',
      disabled: planned === 0 || !available,
      dataset: { testid: 'listen-start' },
      onClick: () => this.#start()
    }, icon('play', { size: 18 }), h('span', null, 'Rozpocznij słuchanie'));

    return {
      title: 'Słuchanie',
      back: { href: routes.study(), label: 'Nauka' },
      body: [
        h('p', { class: 'listen-intro' },
          'Aplikacja czyta pojęcie, daje chwilę na zastanowienie, a potem czyta odpowiedź, definicję i przykład. '
          + 'Ustaw wszystko przed jazdą – w trakcie nic nie trzeba dotykać.'),
        available ? null : h('p', { class: 'form-message form-message--warning', role: 'status' },
          icon('warning', { size: 18 }), h('span', null, 'Ta przeglądarka nie ma syntezatora mowy, więc słuchanie nie zadziała.')),
        materialGroup(ctx, this.selection, 'listen'),
        lessonsGroup(ctx, this.selection, 'listen'),
        h('section', { class: 'group' },
          h('h2', { class: 'form-group__title' }, 'Kierunek'),
          segmented({
            name: 'listen-direction', label: 'Kierunek słuchania', value: this.direction,
            options: STUDY_DIRECTIONS.map((item) => ({ value: item.id, label: item.label })),
            onChange: (value) => { this.direction = value; ctx.refresh(); }
          }),
          h('p', { class: 'group__footer' }, this.direction === MIXED
            ? 'Każde pojęcie losowo po polsku albo po angielsku – odpowiedź w drugim języku.'
            : (this.direction === DIRECTIONS.PL_EN
                ? 'Słyszysz pojęcie po polsku, przypominasz sobie angielskie.'
                : 'Słyszysz pojęcie po angielsku, przypominasz sobie polskie.'))
        ),
        formGroup('Zakres',
          field('Które pojęcia', selectInput({
            value: this.scope,
            testID: 'listen-scope',
            options: STUDY_SCOPES.map((item) => ({ value: item.id, label: `${item.label} (${counts[item.id]})` })),
            onChange: (value) => { this.scope = value; ctx.refresh(); }
          }))
        ),
        h('section', { class: 'group' },
          h('h2', { class: 'form-group__title' }, 'Liczba pojęć'),
          segmented({
            name: 'listen-count', label: 'Liczba pojęć', value: String(this.count),
            options: LISTEN_COUNTS.map((value) => ({ value: String(value), label: value === 0 ? 'Wszystkie' : String(value) })),
            onChange: (value) => { this.count = Number(value); ctx.refresh(); }
          })
        ),
        h('section', { class: 'group' },
          h('h2', { class: 'form-group__title' }, 'Czas na zastanowienie'),
          segmented({
            name: 'listen-pause', label: 'Czas na zastanowienie', value: String(this.pause),
            options: LISTEN_PAUSES.map((value) => ({ value: String(value), label: `${value} s` })),
            onChange: (value) => { this.pause = Number(value); ctx.refresh(); }
          })
        ),
        group({ title: 'Po odpowiedzi', className: 'group--compact' },
          checkRow({ checked: this.description, title: 'Czytaj definicję', testID: 'listen-description', onChange: (value) => { this.description = value; ctx.refresh(); } }),
          checkRow({ checked: this.example, title: 'Czytaj przykład', testID: 'listen-example', onChange: (value) => { this.example = value; ctx.refresh(); } }),
          checkRow({ checked: this.repeatAnswer, title: 'Powtórz odpowiedź drugi raz', testID: 'listen-repeat-answer', onChange: (value) => { this.repeatAnswer = value; ctx.refresh(); } })
        ),
        this.description || this.example ? h('section', { class: 'group' },
          h('h2', { class: 'form-group__title' }, 'Język definicji i przykładu'),
          segmented({
            name: 'listen-detail-language', label: 'Język definicji i przykładu', value: this.detailLanguage,
            options: LISTEN_DETAIL_LANGUAGES.map((item) => ({ value: item.id, label: item.label })),
            onChange: (value) => { this.detailLanguage = value; ctx.refresh(); }
          }),
          h('p', { class: 'group__footer' }, 'Gdy pojęcie nie ma definicji albo przykładu w tym języku, aplikacja przeczyta wersję w drugim języku.')
        ) : null,
        group({ title: 'Dobrze wiedzieć', footer: null },
          h('li', { class: 'row row--static' }, h('span', { class: 'row__main' }, h('span', { class: 'row__text' },
            h('span', { class: 'row__subtitle', dataset: { testid: 'listen-background-note' } }, this.#backgroundNote())))),
          h('li', { class: 'row row--static' }, h('span', { class: 'row__main' }, h('span', { class: 'row__text' },
            h('span', { class: 'row__subtitle' },
              'Słuchanie nie zmienia terminów powtórek. Głos i szybkość mowy ustawisz w ',
              h('a', { href: routes.settings() }, 'Ustawieniach'), '.'))))
        )
      ],
      bottomBar: h('div', { class: 'bottombar__inner' },
        h('span', { class: 'bottombar__note', role: 'status', dataset: { testid: 'listen-planned' } },
          planned === 0 ? 'Brak pojęć dla tych ustawień' : `${pluralTerms(planned)}, ${formatMinutes(estimate)}`),
        startButton
      )
    };
  }

  #playerView() {
    const player = this.player;
    const step = player.currentStep();
    const card = player.currentCard();
    const finished = player.phase === 'finished';
    const control = (iconName, label, testID, handler, className = '') => onTap(h('button', {
      type: 'button', class: `listen-control ${className}`.trim(), 'aria-label': label, title: label, dataset: { testid: testID }
    }, icon(iconName, { size: className ? 34 : 26 })), handler);

    if (finished) {
      return {
        title: 'Słuchanie',
        compact: true,
        focus: true,
        back: { href: routes.study(), label: 'Nauka' },
        body: h('div', { class: 'listen listen--done', dataset: { testid: 'listen-done' } },
          h('div', { class: 'empty__icon' }, icon('headphones', { size: 40 })),
          h('h2', { class: 'empty__title' }, 'Koniec słuchania'),
          h('p', { class: 'empty__text', dataset: { testid: 'listen-summary' } }, `Odsłuchane pojęcia: ${player.listened.size} z ${player.total}.`),
          h('div', { class: 'empty__actions' },
            onTap(h('button', { type: 'button', class: 'button button--primary', dataset: { testid: 'listen-again' } }, 'Jeszcze raz'), () => this.#again()),
            onTap(h('button', { type: 'button', class: 'button button--secondary', dataset: { testid: 'listen-settings' } }, 'Zmień ustawienia'), () => this.#close()),
            h('a', { class: 'button button--secondary', href: routes.study() }, 'Zakończ'))
        )
      };
    }

    const number = card ? player.cardIndex + 1 : (player.cardIndex < 0 ? 0 : player.total);
    const progress = player.total > 0 ? Math.round((player.listened.size / player.total) * 100) : 0;
    const thinking = step.kind === 'think' && player.thinkEndsAt && player.phase === 'playing';
    const remaining = thinking ? Math.max(0, player.thinkEndsAt - Date.now()) : 0;
    const thinkTotal = thinking ? player.thinkEndsAt - player.thinkStartedAt : 1;
    const shown = step.kind === 'think' ? card?.steps[0] : step;
    const playing = player.phase === 'playing';

    const wakeNote = {
      on: 'Ekran nie zgaśnie, dopóki słuchasz.',
      unsupported: 'Ta przeglądarka nie pozwala utrzymać włączonego ekranu – na czas jazdy wyłącz automatyczną blokadę (Ustawienia iPhone’a › Ekran i jasność).',
      failed: 'Nie udało się zablokować wygaszania ekranu – na czas jazdy wyłącz automatyczną blokadę (Ustawienia iPhone’a › Ekran i jasność).',
      off: 'Blokada wygaszania ekranu wyłączyła się – dotknij „Wznów”, żeby ją przywrócić.'
    }[this.wakeState] ?? '';

    return {
      title: 'Słuchanie',
      compact: true,
      focus: true,
      back: { href: routes.study(), label: 'Nauka' },
      actions: [navButton('Zakończ', () => this.#close())],
      body: h('div', { class: 'listen', dataset: { testid: 'listen-player', phase: player.phase, step: step.kind } },
        h('div', { class: 'study__header' },
          h('div', { class: 'study__meta' },
            h('span', { class: 'study__lesson' }, card ? `Pojęcie ${number} z ${player.total}` : STEP_LABELS[step.kind]),
            card ? h('span', { class: 'study__counter' }, DIRECTION_SHORT[card.direction]) : null),
          h('div', {
            class: 'study__progress', role: 'progressbar', 'aria-label': 'Postęp słuchania',
            'aria-valuemin': '0', 'aria-valuemax': String(player.total), 'aria-valuenow': String(player.listened.size)
          }, h('span', { class: 'study__progress-fill', style: { width: `${progress}%` } }))
        ),
        h('div', { class: 'listen__stage' },
          h('span', { class: `listen__label listen__label--${step.kind}`, dataset: { testid: 'listen-step' } },
            playing ? STEP_LABELS[step.kind] : 'Pauza'),
          shown?.text ? h('p', { class: `listen__text${step.kind === 'description' || step.kind === 'example' ? ' listen__text--long' : ''}`, lang: shown.lang, dataset: { testid: 'listen-text' } }, shown.text) : null,
          thinking ? h('div', { class: 'listen__think', 'aria-hidden': 'true' },
            h('span', {
              class: 'listen__think-fill',
              style: { '--from': `${(remaining / thinkTotal) * 100}%`, 'animation-duration': `${remaining}ms` }
            })) : null
        ),
        h('div', { class: 'listen__controls' },
          control('skipBack', 'Poprzednie pojęcie', 'listen-previous', () => player.previous()),
          control(playing ? 'pause' : 'play', playing ? 'Pauza' : 'Wznów', 'listen-toggle', () => {
            player.toggle();
            if (player.phase === 'playing' && !this.wakeLock) this.#keepScreenOn();
          }, 'listen-control--main'),
          control('skipForward', 'Następne pojęcie', 'listen-next', () => player.next())
        ),
        onTap(h('button', { type: 'button', class: 'button button--quick listen__repeat', dataset: { testid: 'listen-repeat' } },
          icon('undo', { size: 18 }), h('span', null, 'Powtórz to pojęcie')), () => player.repeat()),
        h('p', { class: 'listen__note', dataset: { testid: 'listen-wake' } }, wakeNote)
      )
    };
  }

  view() {
    const { library } = this.ctx;
    if (library.summary().terms === 0) {
      return {
        title: 'Słuchanie',
        back: { href: routes.study(), label: 'Nauka' },
        body: emptyState({
          iconName: 'headphones',
          title: 'Najpierw dodaj pojęcia',
          text: 'Słuchanie czyta pojęcia z Biblioteki. Dodaj je ręcznie, zaimportuj z pliku albo wczytaj dane przykładowe na ekranie Start.',
          actions: [h('a', { class: 'button button--primary', href: routes.domains() }, 'Otwórz Bibliotekę')]
        })
      };
    }
    return this.player ? this.#playerView() : this.#setupView();
  }
}
