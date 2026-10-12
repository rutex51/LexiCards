// Sesja nauki: fiszka z obrotem, trzy kafelki oceny, zatwierdzanie gestem lub przyciskiem,
// cofanie ostatniej decyzji i podsumowanie.
//
// Ekran sam aktualizuje kafelki i stronę fiszki (bez przebudowy całego widoku), żeby
// animacje nie zaczynały się od nowa. Pełna przebudowa następuje po zmianie danych,
// czyli po każdej zatwierdzonej fiszce.

import { ASSESSMENT_STATUS_NAMES } from '../../core/model.js';
import {
  DECISIONS, TILES, cardContent, emptyTiles, formatInterval, isSessionFinished, scoreTiles, setAllTiles, summarizeSession
} from '../../core/study.js';
import { emptyState, iconButton, navButton } from '../components.js';
import { showError, toast } from '../dialogs.js';
import { h, onTap, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';
import { speak, speechAvailable, stopSpeaking } from '../speech.js';

const TILE_ICONS = { term: 'translate', description: 'book', example: 'chat' };
const LANGUAGE_NAMES = { pl: 'Polski', en: 'Angielski' };
const LANGUAGE_LOCATIVE = { pl: 'po polsku', en: 'po angielsku' };
const SWIPE_START = 12;
const STATUS_ORDER = ['mastered', 'partiallyMastered', 'inProgress', 'toLearn'];

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function vibrate(duration = 10) {
  try {
    navigator.vibrate?.(duration);
  } catch {
    // sprzężenie haptyczne jest dodatkiem – brak wsparcia niczego nie psuje
  }
}

/** Klasa rozmiaru tekstu zależna od jego długości, żeby długie pojęcia mieściły się na fiszce. */
function sizeClass(text) {
  const length = text.length;
  if (length <= 18) return 'flashcard__text--xl';
  if (length <= 42) return 'flashcard__text--lg';
  if (length <= 110) return 'flashcard__text--md';
  return 'flashcard__text--sm';
}

export class StudySessionScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.cardKey = null;
    this.revealed = false;
    this.showingBack = false;
    this.tiles = null;
    this.busy = false;
    this.flipping = false;
    this.closing = false;
    this.disposed = false;
    this.elements = {};
    this.drag = null;
    this.suppressClick = false;
    /** Losowanie do rozmycia odstępu FSRS – jedno na fiszkę, żeby podgląd zgadzał się z zapisem. */
    this.fuzz = Math.random();

    this.onKeyDown = (event) => this.#handleKey(event);
    document.addEventListener('keydown', this.onKeyDown);
  }

  dispose() {
    this.disposed = true;
    document.removeEventListener('keydown', this.onKeyDown);
    stopSpeaking();
    // Sesja doprowadzona do końca jest zamykana przy wyjściu z podsumowania.
    const session = this.ctx.library.getStudySession();
    if (session && isSessionFinished(session) && !this.closing) {
      this.ctx.library.finishStudy().catch((error) => console.error(error));
    }
  }

  // ---------------------------------------------------------------- stan bieżącej fiszki

  #settings() {
    return this.ctx.library.getSettings();
  }

  #speakerButton(text, language, label) {
    if (!speechAvailable() || !text) return null;
    return h('button', {
      type: 'button', class: 'icon-button flashcard__speak', 'aria-label': label, title: label,
      dataset: { testid: 'speak', lang: language },
      onClick: (event) => {
        event.stopPropagation();
        speak(text, language, this.#settings());
      }
    }, icon('speaker', { size: 22 }));
  }

  #updateTiles() {
    const { score, available } = scoreTiles(this.tiles);
    for (const { id } of TILES) {
      const button = this.elements.tiles?.[id];
      if (!button) continue;
      const value = this.tiles[id];
      const missing = value === null;
      button.disabled = missing || !this.revealed || this.busy;
      button.setAttribute('aria-pressed', String(Boolean(value)));
      button.classList.toggle('rating--known', Boolean(value));
      button.classList.toggle('rating--missing', missing);
      const state = button.querySelector('.rating__state');
      state.textContent = missing ? 'Brak danych' : (value ? 'Umiem' : 'Nie umiem');
      replaceChildren(button.querySelector('.rating__icon'), icon(value ? 'check' : (missing ? 'minus' : TILE_ICONS[id]), { size: 24 }));
    }
    if (this.elements.scoreText) {
      this.elements.scoreText.textContent = `${score}/${available}`;
      this.elements.scoreFill.style.width = `${available ? Math.round((score / available) * 100) : 0}%`;
      this.elements.scoreBar.setAttribute('aria-valuenow', String(score));
    }
    for (const control of this.elements.afterReveal ?? []) control.disabled = !this.revealed || this.busy;
    if (this.elements.hint) this.elements.hint.hidden = this.revealed;
    this.#updatePreview();
  }

  /** Pod przyciskami decyzji: za ile fiszka wróci według FSRS przy obecnych kafelkach. */
  #updatePreview() {
    const { when } = this.elements;
    if (!when) return;
    const preview = this.revealed ? this.ctx.library.previewStudyDecision(this.tiles, { random: () => this.fuzz }) : null;
    for (const decision of [DECISIONS.KNOW, DECISIONS.REPEAT]) {
      const target = when[decision];
      const interval = preview?.[decision]?.interval;
      target.textContent = interval ? `wróci za ${formatInterval(interval)}` : '';
    }
  }

  #toggleTile(id) {
    if (!this.revealed || this.busy || this.tiles[id] === null) return;
    this.tiles = { ...this.tiles, [id]: !this.tiles[id] };
    vibrate();
    this.#updateTiles();
  }

  #setAll(value) {
    if (!this.revealed || this.busy) return;
    this.tiles = setAllTiles(this.tiles, value);
    vibrate();
    this.#updateTiles();
  }

  /** Obraca fiszkę: połowa obrotu, zamiana strony, druga połowa. */
  async #flip() {
    const { card, front, back } = this.elements;
    if (!card || this.flipping || this.busy) return;
    this.flipping = true;
    const showBack = !this.showingBack;
    const hadFocus = card.contains(document.activeElement);
    const swap = () => {
      this.showingBack = showBack;
      if (showBack) this.revealed = true;
      front.hidden = showBack;
      back.hidden = !showBack;
      card.dataset.side = showBack ? 'back' : 'front';
      this.#updateTiles();
      // Przycisk, który miał fokus, właśnie zniknął – przenosimy fokus na jego odpowiednik.
      if (hadFocus) (showBack ? back : front).querySelector('[data-flip]')?.focus({ preventScroll: true });
    };
    try {
      if (reducedMotion() || typeof card.animate !== 'function') {
        swap();
      } else {
        const turn = (from, to, easing) => card.animate(
          [{ transform: `perspective(1100px) rotateY(${from}deg)` }, { transform: `perspective(1100px) rotateY(${to}deg)` }],
          { duration: 170, easing }
        ).finished;
        await turn(0, 90, 'ease-in');
        swap();
        await turn(-90, 0, 'ease-out');
      }
    } catch {
      // Przerwana animacja (np. przebudowa widoku): stan i tak jest spójny po swap().
    } finally {
      this.flipping = false;
    }
  }

  // ---------------------------------------------------------------- decyzje

  async #flyOut(decision) {
    const { card } = this.elements;
    if (!card || reducedMotion() || typeof card.animate !== 'function') return;
    const direction = decision === DECISIONS.KNOW ? -1 : 1;
    const from = this.drag?.offset ?? 0;
    try {
      await card.animate(
        [
          { transform: `translateX(${from}px) rotate(${from / 24}deg)`, opacity: 1 },
          { transform: `translateX(${direction * 120}%) rotate(${direction * 14}deg)`, opacity: 0 }
        ],
        { duration: 220, easing: 'ease-in', fill: 'forwards' }
      ).finished;
    } catch {
      // animacja przerwana – decyzja i tak zostanie zapisana
    }
  }

  async #decide(decision) {
    // Decyzja może zapaść jeszcze w trakcie obrotu – odpowiedź jest już wtedy widoczna.
    if (this.busy || !this.revealed) return;
    this.busy = true;
    this.#updateTiles();
    vibrate(14);
    await this.#flyOut(decision);
    try {
      await this.ctx.library.recordStudyDecision({ tiles: this.tiles, decision, random: () => this.fuzz });
    } catch (error) {
      await showError(error);
    } finally {
      this.busy = false;
      this.drag = null;
      if (!this.disposed) this.ctx.refresh();
    }
  }

  async #undo() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.ctx.library.undoStudyDecision();
      toast('Cofnięto ostatnią decyzję.');
    } catch (error) {
      await showError(error);
    } finally {
      this.busy = false;
      if (!this.disposed) this.ctx.refresh();
    }
  }

  async #endEarly() {
    if (this.busy) return;
    this.closing = true;
    try {
      const { summary } = await this.ctx.library.finishStudy();
      toast(summary.assessed > 0
        ? `Sesja zakończona. Ocenione fiszki: ${summary.assessed} z ${summary.total}.`
        : 'Sesja zakończona.');
      // Użytkownik mógł w tym czasie przejść gdzie indziej – wtedy go nie przenosimy.
      if (!this.disposed) this.ctx.navigate(routes.study(), { replace: true });
    } catch (error) {
      this.closing = false;
      await showError(error);
    }
  }

  async #closeSummary(target) {
    this.closing = true;
    try {
      await this.ctx.library.finishStudy();
      if (!this.disposed) this.ctx.navigate(target, { replace: true });
    } catch (error) {
      this.closing = false;
      await showError(error);
    }
  }

  /**
   * Kolejna runda z fiszkami tej sesji: 'repeat' – odłożone, 'partial' – częściowo
   * zapamiętane, 'all' – wszystkie od początku (także ocenione jako „Umiem”).
   */
  async #repeat(kind) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.ctx.library.repeatStudy(Math.random, kind);
    } catch (error) {
      await showError(error);
    } finally {
      this.busy = false;
      if (!this.disposed) this.ctx.refresh();
    }
  }

  // ---------------------------------------------------------------- gesty i klawiatura

  #attachSwipe(card) {
    const reset = (animated) => {
      card.style.transition = animated && !reducedMotion() ? 'transform 0.2s ease' : '';
      card.style.transform = '';
      card.dataset.swipe = '';
    };
    card.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.busy) return;
      this.drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, offset: 0, active: false };
    });
    card.addEventListener('pointermove', (event) => {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active) {
        if (Math.abs(dx) < SWIPE_START || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        drag.active = true;
        // Przesunięcie zatwierdza fiszkę dopiero po odkryciu odpowiedzi – wcześniej fiszka
        // tylko lekko się ugina i wraca na miejsce.
        drag.locked = !this.revealed;
        card.style.transition = '';
        try {
          card.setPointerCapture(event.pointerId);
        } catch {
          // brak przechwycenia wskaźnika nie przeszkadza w geście
        }
      }
      event.preventDefault();
      if (drag.locked) {
        card.style.transform = `translateX(${Math.sign(dx) * Math.min(16, Math.abs(dx) * 0.12)}px)`;
        return;
      }
      drag.offset = dx;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
      card.dataset.swipe = dx < 0 ? 'know' : 'repeat';
    });
    const finish = (event, cancelled) => {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.active) {
        this.drag = null;
        return;
      }
      // Kliknięcie kończące przeciągnięcie nie powinno obrócić fiszki.
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 0);
      const threshold = Math.min(130, card.offsetWidth * 0.28);
      if (!cancelled && !drag.locked && Math.abs(drag.offset) >= threshold) {
        this.#decide(drag.offset < 0 ? DECISIONS.KNOW : DECISIONS.REPEAT);
      } else {
        this.drag = null;
        reset(true);
      }
    };
    card.addEventListener('pointerup', (event) => finish(event, false));
    card.addEventListener('pointercancel', (event) => finish(event, true));
    card.addEventListener('click', (event) => {
      if (this.suppressClick) return;
      if (event.target.closest('button, a')) return;
      this.#flip();
    });
  }

  #handleKey(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = event.target;
    const tag = target?.tagName ?? '';
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    const session = this.ctx.library.getStudySession();
    if (!session || isSessionFinished(session)) return;
    const onButton = /^(BUTTON|A)$/.test(tag);

    switch (event.key) {
      case ' ':
      case 'Enter':
        if (onButton) return;
        this.#flip();
        break;
      case '1': this.#toggleTile('term'); break;
      case '2': this.#toggleTile('description'); break;
      case '3': this.#toggleTile('example'); break;
      case 'ArrowLeft': this.#decide(DECISIONS.KNOW); break;
      case 'ArrowRight': this.#decide(DECISIONS.REPEAT); break;
      case 'z':
      case 'Z':
      case 'Backspace':
        if (session.results.length > 0) this.#undo();
        break;
      default: return;
    }
    event.preventDefault();
  }

  // ---------------------------------------------------------------- widoki

  #cardView(term, card, front) {
    const { library } = this.ctx;
    const content = cardContent(term, card.direction, front);
    const frontLabel = {
      term: LANGUAGE_NAMES[content.source],
      description: `Definicja ${LANGUAGE_LOCATIVE[content.source]}`,
      example: `Przykład ${LANGUAGE_LOCATIVE[content.source]}`
    }[content.front.kind];

    // Każdą linię opisu i przykładu można odsłuchać osobno, w jej języku.
    const section = (id, title, items, speakLabel) => h('div', { class: 'flashcard__section', dataset: { section: id } },
      h('h3', { class: 'flashcard__section-title' }, title),
      items.length === 0
        ? h('p', { class: 'flashcard__missing' }, 'Brak danych')
        : items.map((item) => h('p', { class: 'flashcard__line', lang: item.lang },
            h('span', null, item.text),
            this.#speakerButton(item.text, item.lang, `${speakLabel} ${LANGUAGE_LOCATIVE[item.lang]}`)
          ))
    );

    const frontFace = h('div', { class: 'flashcard__face', hidden: this.showingBack, dataset: { testid: 'card-front' } },
      h('div', { class: 'flashcard__top' },
        h('span', { class: 'flashcard__label' }, frontLabel),
        this.#speakerButton(content.front.text, content.front.lang, 'Odtwórz wymowę')
      ),
      h('p', { class: `flashcard__text ${sizeClass(content.front.text)}`, lang: content.front.lang }, content.front.text),
      h('button', { type: 'button', class: 'flashcard__flip', dataset: { testid: 'card-flip', flip: '' }, onClick: (event) => { event.stopPropagation(); this.#flip(); } },
        icon('flip', { size: 18 }), h('span', null, 'Pokaż odpowiedź'))
    );

    const backFace = h('div', { class: 'flashcard__face flashcard__face--back', hidden: !this.showingBack, dataset: { testid: 'card-back' } },
      // Odwrót mieści dużo treści, więc powrót do pytania to mały przycisk w nagłówku
      // (fiszkę można też po prostu dotknąć).
      h('div', { class: 'flashcard__top' },
        h('span', { class: 'flashcard__label' }, LANGUAGE_NAMES[content.target]),
        h('span', { class: 'flashcard__tools' },
          h('button', {
            type: 'button', class: 'icon-button flashcard__turn', 'aria-label': 'Pokaż pytanie', title: 'Pokaż pytanie',
            dataset: { testid: 'card-unflip', flip: '' },
            onClick: (event) => { event.stopPropagation(); this.#flip(); }
          }, icon('flip', { size: 22 })),
          this.#speakerButton(content.back.answer.text, content.back.answer.lang, 'Odtwórz wymowę tłumaczenia')
        )
      ),
      h('p', { class: `flashcard__text flashcard__text--answer ${sizeClass(content.back.answer.text)}`, lang: content.back.answer.lang },
        content.back.answer.text),
      h('p', { class: 'flashcard__question', lang: content.back.question.lang }, content.back.question.text),
      section('description', 'Definicja', content.back.descriptions, 'Odtwórz definicję'),
      section('example', 'Przykład', content.back.examples, 'Odtwórz przykład'),
      h('span', { class: 'flashcard__fade', 'aria-hidden': 'true' })
    );

    const cardElement = h('div', {
      class: 'flashcard',
      dataset: { testid: 'flashcard', side: this.showingBack ? 'back' : 'front', swipe: '', direction: card.direction }
    },
      frontFace,
      backFace,
      h('span', { class: 'flashcard__stamp flashcard__stamp--know', 'aria-hidden': 'true' }, 'Umiem'),
      h('span', { class: 'flashcard__stamp flashcard__stamp--repeat', 'aria-hidden': 'true' }, 'Powtórz')
    );
    this.#attachSwipe(cardElement);
    this.elements.card = cardElement;
    this.elements.front = frontFace;
    this.elements.back = backFace;
    this.elements.lessonName = library.getLesson(term.lessonID)?.name ?? '';
    return cardElement;
  }

  #tilesView() {
    this.elements.tiles = {};
    return h('div', { class: 'rating-row', role: 'group', 'aria-label': 'Co już umiesz' },
      TILES.map(({ id, label }) => {
        const button = h('button', {
          type: 'button', class: 'rating', 'aria-pressed': 'false', dataset: { testid: `tile-${id}` },
          onClick: () => this.#toggleTile(id)
        },
          h('span', { class: 'rating__icon' }),
          h('span', { class: 'rating__name' }, label),
          h('span', { class: 'rating__state' })
        );
        this.elements.tiles[id] = button;
        return button;
      })
    );
  }

  #summaryView(session) {
    const summary = summarizeSession(session);
    const { library } = this.ctx;
    // Liczone z najnowszej oceny każdej fiszki, więc obejmują wszystkie rundy tej sesji.
    const postponed = library.getRepeatableStudy('repeat');
    const partial = library.getRepeatableStudy('partial');
    const repeatable = library.getRepeatableStudy();
    const primary = postponed ? 'repeat' : (partial ? 'partial' : 'all');
    const kind = (name) => (name === primary ? 'button--primary' : 'button--secondary');
    const action = (kind, testID, label, handler) => onTap(
      h('button', { type: 'button', class: `button ${kind}`, dataset: { testid: testID } }, label),
      handler
    );
    const parts = STATUS_ORDER.filter((status) => summary.statuses[status] > 0);

    return {
      title: 'Fiszki',
      compact: true,
      focus: true,
      back: { href: routes.study(), label: 'Nauka' },
      body: h('div', { class: 'study-summary', dataset: { testid: 'study-summary' } },
        h('div', { class: 'empty__icon' }, icon('check', { size: 40 })),
        h('h2', { class: 'empty__title' }, (session.round ?? 1) > 1 ? 'Runda powtórkowa zakończona' : 'Sesja zakończona'),
        h('p', { class: 'empty__text', dataset: { testid: 'summary-text' } },
          h('span', { class: 'study-summary__line' }, `Ocenione fiszki: ${summary.assessed}.`),
          ' ',
          h('span', { class: 'study-summary__line' }, `Umiem: ${summary.know}. Do powtórki: ${summary.repeat}.`),
          summary.skipped > 0 ? ' ' : null,
          summary.skipped > 0 ? h('span', { class: 'study-summary__line' }, `Pominięto usunięte pojęcia: ${summary.skipped}.`) : null),
        summary.assessed > 0 ? h('div', { class: 'status-bar', role: 'img', 'aria-label': parts.map((status) => `${ASSESSMENT_STATUS_NAMES[status]}: ${summary.statuses[status]}`).join(', ') },
          parts.map((status) => h('span', { class: `status-bar__part status-bar__part--${status}`, style: { 'flex-grow': String(summary.statuses[status]) } }))
        ) : null,
        h('ul', { class: 'status-legend', role: 'list', dataset: { testid: 'summary-statuses' } },
          STATUS_ORDER.map((status) => h('li', { class: `status-legend__item status-legend__item--${status}` },
            h('span', { class: 'status-legend__dot', 'aria-hidden': 'true' }),
            h('span', null, ASSESSMENT_STATUS_NAMES[status]),
            h('strong', null, String(summary.statuses[status]))
          ))
        ),
        // Podsumowanie pojawia się w miejscu fiszki tuż po dotknięciu – przyciski reagują
        // już na samo dotknięcie (onTap), bo Safari gubi tu czasem pierwsze kliknięcie.
        h('div', { class: 'empty__actions' },
          postponed ? action(kind('repeat'), 'summary-repeat', `Powtórz odłożone (${postponed.queue.length})`,
            () => this.#repeat('repeat')) : null,
          partial ? action(kind('partial'), 'summary-repeat-partial', `Powtórz częściowo zapamiętane (${partial.queue.length})`,
            () => this.#repeat('partial')) : null,
          repeatable ? action(kind('all'), 'summary-repeat-all',
            `Powtórz całą sesję (${repeatable.queue.length})`, () => this.#repeat('all')) : null,
          action('button--secondary', 'summary-new', 'Nowa sesja', () => this.#closeSummary(routes.study())),
          action('button--secondary', 'summary-done', 'Zakończ', () => this.#closeSummary(routes.start())),
          session.results.length > 0 ? action('button--plain', 'summary-undo', 'Cofnij ostatnią decyzję', () => this.#undo()) : null
        )
      )
    };
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const session = library.getStudySession();
    this.elements = {};

    if (!session) {
      return {
        title: 'Nauka',
        back: { href: routes.study(), label: 'Nauka' },
        body: emptyState({
          iconName: 'cards',
          title: 'Nie ma trwającej sesji',
          text: 'Wybierz materiał i rozpocznij nową sesję.',
          actions: [h('a', { class: 'button button--primary', href: routes.study() }, 'Przygotuj sesję')]
        })
      };
    }

    if (isSessionFinished(session)) return this.#summaryView(session);

    const card = session.queue[session.position];
    const term = library.getTerm(card.termID);
    if (!term) {
      // Pojęcie usunięto w trakcie sesji – przechodzimy do następnej fiszki.
      library.skipMissingStudyCards().catch((error) => console.error(error));
      return { title: 'Fiszki', compact: true, focus: true, back: { href: routes.study(), label: 'Nauka' }, body: h('p', { class: 'boot' }, 'Wczytywanie…') };
    }

    const key = `${session.id}:${session.position}:${session.results.length}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      this.revealed = false;
      this.showingBack = false;
      this.tiles = emptyTiles(term);
      this.drag = null;
      this.fuzz = Math.random();
      stopSpeaking();
    }

    const total = session.queue.length;
    const number = session.position + 1;
    const cardElement = this.#cardView(term, card, session.config.front ?? 'term');
    const tiles = this.#tilesView();

    this.elements.scoreFill = h('span', { class: 'score__fill' });
    this.elements.scoreBar = h('div', {
      class: 'score__bar', role: 'progressbar', 'aria-label': 'Wynik fiszki', 'aria-valuemin': '0',
      'aria-valuemax': String(scoreTiles(this.tiles).available), 'aria-valuenow': '0'
    }, this.elements.scoreFill);
    this.elements.scoreText = h('span', { class: 'score__text', dataset: { testid: 'score' } });

    const allButton = h('button', { type: 'button', class: 'button button--quick', dataset: { testid: 'know-all' }, onClick: () => this.#setAll(true) }, 'Umiem wszystko');
    const noneButton = h('button', { type: 'button', class: 'button button--quick', dataset: { testid: 'know-none' }, onClick: () => this.#setAll(false) }, 'Nie umiem niczego');
    // Pod nazwą decyzji – kiedy fiszka wróci (FSRS); puste, dopóki odpowiedź jest zakryta.
    this.elements.when = {
      [DECISIONS.KNOW]: h('span', { class: 'decision__when', dataset: { testid: 'when-know' } }),
      [DECISIONS.REPEAT]: h('span', { class: 'decision__when', dataset: { testid: 'when-repeat' } })
    };
    const knowButton = h('button', { type: 'button', class: 'button button--know decision', dataset: { testid: 'decide-know' }, onClick: () => this.#decide(DECISIONS.KNOW) },
      h('span', { class: 'decision__label' }, icon('arrowLeft', { size: 20 }), h('span', null, 'Umiem')),
      this.elements.when[DECISIONS.KNOW]);
    const repeatButton = h('button', { type: 'button', class: 'button button--repeat decision', dataset: { testid: 'decide-repeat' }, onClick: () => this.#decide(DECISIONS.REPEAT) },
      h('span', { class: 'decision__label' }, h('span', null, 'Powtórz'), icon('arrowRight', { size: 20 })),
      this.elements.when[DECISIONS.REPEAT]);
    this.elements.afterReveal = [allButton, noneButton, knowButton, repeatButton];
    this.elements.hint = h('p', { class: 'study__hint', dataset: { testid: 'study-hint' } },
      'Odwróć fiszkę, a potem zaznacz, co umiesz. Przesuń ją w lewo („Umiem”) albo w prawo („Powtórz”).');

    const undoButton = iconButton('undo', 'Cofnij ostatnią decyzję', () => this.#undo());
    undoButton.disabled = session.results.length === 0;
    undoButton.dataset.testid = 'study-undo';

    const body = h('div', { class: 'study', dataset: { testid: 'study-session' } },
      h('div', { class: 'study__header' },
        h('div', { class: 'study__meta' },
          h('span', { class: 'study__lesson', dataset: { testid: 'study-lesson' } }, this.elements.lessonName),
          h('span', { class: 'study__counter', dataset: { testid: 'study-counter' } }, `${number} z ${total}`)
        ),
        h('div', {
          class: 'study__progress', role: 'progressbar', 'aria-label': 'Postęp sesji',
          'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(session.position)
        }, h('span', { class: 'study__progress-fill', style: { width: `${Math.round((session.position / total) * 100)}%` } }))
      ),
      cardElement,
      tiles,
      h('div', { class: 'score' }, this.elements.scoreBar, this.elements.scoreText),
      h('div', { class: 'quick' }, allButton, noneButton),
      h('div', { class: 'study__decisions' }, knowButton, repeatButton),
      this.elements.hint,
      h('p', { class: 'study__keys' }, 'Klawiatura: spacja – odwróć, 1 2 3 – kafelki, ← Umiem, → Powtórz, Z – cofnij.')
    );

    this.#updateTiles();

    return {
      title: 'Fiszki',
      compact: true,
      focus: true,
      back: { href: routes.study(), label: 'Nauka' },
      actions: [undoButton, navButton('Zakończ', () => this.#endEarly())],
      body
    };
  }
}
