// Sesja nauki: fiszka z obrotem, trzy kafelki oceny, zatwierdzanie gestem lub przyciskiem,
// cofanie ostatniej decyzji i podsumowanie. Od 1.39 fiszka może mieć 1–3 obroty: po każdym kolejna
// strona z wybraną treścią, po ostatniej – powrót do pytania. Od 1.56 dwa pierwsze obroty w poziomie
// (od lewej do prawej, od prawej do lewej), trzeci i powrót w pionie (z góry na dół, z dołu do góry);
// treść stron wyśrodkowana; pojęcie może mieć własne strony i obrazy albo tabele z notatki lekcji
// (core/card-faces.js).
//
// Ekran sam aktualizuje kafelki i stronę fiszki (bez przebudowy całego widoku), żeby
// animacje nie zaczynały się od nowa. Pełna przebudowa następuje po zmianie danych,
// czyli po każdej zatwierdzonej fiszce.

import { ASSESSMENT_STATUS_NAMES } from '../../core/model.js';
import {
  DECISIONS, FLIP_FACES, FLIP_TURNS, RETURN_TURN, TILES, cardContent, emptyTiles, formatInterval, isSessionFinished, scoreTiles, sessionFlipFaces,
  setAllTiles, summarizeSession
} from '../../core/study.js';
import { MEDIA_FACE, faceParts, mediaOnFace, termCardFaces } from '../../core/card-faces.js';
import { findImageByLabel, withImageLabels } from '../../core/note-refs.js';
import { findTableByLabel, tableHtml, withTableLabels } from '../../core/tables.js';
import { urlPool } from '../images.js';
import { emptyState, iconButton, navButton } from '../components.js';
import { openLessonNote } from '../notes.js';
import { showError, toast } from '../dialogs.js';
import { h, onTap, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';
import { playCard } from '../sounds.js';
import { speak, speechAvailable, stopSpeaking } from '../speech.js';

const TILE_ICONS = { term: 'translate', description: 'book', example: 'chat' };
export const REPEAT_LABELS = {
  repeat: 'Powtórz odłożone',
  partial: 'Powtórz częściowo zapamiętane',
  unknown: 'Powtórz nieznane',
  all: 'Powtórz całą sesję'
};
const REPEAT_TEST_IDS = {
  repeat: 'summary-repeat', partial: 'summary-repeat-partial', unknown: 'summary-repeat-unknown', all: 'summary-repeat-all'
};
const LANGUAGE_NAMES = { pl: 'Polski', en: 'Angielski' };
/** Przycisk przejścia na stronę z daną treścią (od 1.39; od 1.56 też tłumaczenie z definicją albo przykładem i sam obraz). */
const FACE_ACTIONS = {
  answer: 'Pokaż odpowiedź', all: 'Pokaż odpowiedź', 'answer-description': 'Pokaż odpowiedź', 'answer-example': 'Pokaż odpowiedź',
  description: 'Pokaż definicję', example: 'Pokaż przykład', details: 'Pokaż definicję i przykład', [MEDIA_FACE]: 'Pokaż obraz z notatki'
};
/** Przycisk na dalszych stronach (od 1.56): mówi, co dochodzi poza tłumaczeniem. */
const NEXT_ACTIONS = {
  ...FACE_ACTIONS, answer: 'Pokaż tłumaczenie', all: 'Pokaż definicję i przykład', 'answer-description': 'Pokaż definicję', 'answer-example': 'Pokaż przykład'
};
/**
 * Animacja obrotu (połowa przed zamianą strony i połowa po niej): od lewej do prawej, od prawej do lewej,
 * z góry na dół, z dołu do góry.
 */
const TURN_FRAMES = {
  left: { axis: 'Y', out: 90, in: -90 },
  right: { axis: 'Y', out: -90, in: 90 },
  down: { axis: 'X', out: -90, in: 90 },
  up: { axis: 'X', out: 90, in: -90 }
};
/** Krótki tekst na stronie (definicja, przykład) – pogrubiony jak pytanie (od 1.56). */
const SHORT_LINE = 42;
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

/** Podpis nad pytaniem: język pojęcia albo „Definicja / Przykład po …”. */
function frontLabelOf(content) {
  return {
    term: LANGUAGE_NAMES[content.source],
    description: `Definicja ${LANGUAGE_LOCATIVE[content.source]}`,
    example: `Przykład ${LANGUAGE_LOCATIVE[content.source]}`
  }[content.front.kind];
}

/*
 * Stos: pod fiszką leżą najwyżej dwie następne (pierwsza z pytaniem, druga pusta), lekko
 * przesunięte w dół i zwężone. Przy obrocie i wyrzuceniu fiszki widać następną; po decyzji
 * podnosi się na miejsce wyrzuconej, a po przebudowie widoku jej miejsce zajmuje prawdziwa
 * fiszka w tym samym położeniu (bez animacji wejścia). Ostatnia fiszka nie ma nic pod spodem.
 */
const STACK_POSES = ['none', 'translateY(4px) scale(0.955)', 'translateY(7px) scale(0.91)'];
const STACK_SHADES = [0, 0.5, 1];

export class StudySessionScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.cardKey = null;
    this.revealed = false;
    this.showingBack = false;
    /** Pokazana strona fiszki: 0 – pytanie, 1… – strony po kolejnych obrotach (od 1.39). */
    this.face = 0;
    this.tiles = null;
    this.busy = false;
    this.flipping = false;
    this.closing = false;
    this.disposed = false;
    this.elements = {};
    this.drag = null;
    this.suppressClick = false;
    /** Następna fiszka podniosła się ze stosu (ustawiane przy wyrzuceniu bieżącej). */
    this.fromStack = false;
    /** Bieżąca fiszka przyszła ze stosu – rysowana bez animacji wejścia (także przy odświeżeniu). */
    this.enterStack = false;
    /** Losowanie do rozmycia odstępu FSRS – jedno na fiszkę, żeby podgląd zgadzał się z zapisem. */
    this.fuzz = Math.random();
    /** Chwila pokazania bieżącej fiszki – czas nad fiszką trafia do statystyk. */
    this.cardShownAt = Date.now();

    /** Obrazy notatek na fiszkach (od 1.56): lekcja → obietnica obrazów z adresami; adresy zwalniane przy wyjściu. */
    this.noteImages = new Map();
    this.urls = urlPool();

    this.onKeyDown = (event) => this.#handleKey(event);
    document.addEventListener('keydown', this.onKeyDown);
  }

  dispose() {
    this.disposed = true;
    this.urls.release();
    this.noteImages.clear();
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
    // Po obrocie podpowiedź znika, ale zostawia swoje miejsce – fiszka i przyciski się nie przesuwają.
    if (this.elements.hint) this.elements.hint.classList.toggle('study__hint--used', this.revealed);
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

  /** Obraca fiszkę na następną stronę (po ostatniej – do pytania). */
  #flip() {
    const faces = this.elements.faces ?? [];
    return this.#flipTo(faces.length > 0 ? (this.face + 1) % faces.length : 0);
  }

  /**
   * Obraca fiszkę na stronę `target`: połowa obrotu, zamiana strony, druga połowa. Kierunek – według obrotu,
   * który prowadzi na następną stronę (FLIP_TURNS); powrót do pytania – z dołu do góry (od 1.56).
   */
  async #flipTo(target) {
    const { card, faces } = this.elements;
    if (!card || !faces || this.flipping || this.busy || target === this.face) return;
    this.flipping = true;
    const turnName = target === this.face + 1 ? FLIP_TURNS[this.face] ?? 'left' : RETURN_TURN;
    const hadFocus = card.contains(document.activeElement);
    const swap = () => {
      this.face = target;
      this.showingBack = target > 0;
      if (target > 0) this.revealed = true;
      faces.forEach((face, index) => { face.hidden = index !== target; });
      card.dataset.side = target > 0 ? 'back' : 'front';
      card.dataset.face = String(target);
      this.#updateTiles();
      // Przycisk, który miał fokus, właśnie zniknął – przenosimy fokus na jego odpowiednik.
      if (hadFocus) faces[target].querySelector('[data-flip]')?.focus({ preventScroll: true });
    };
    try {
      if (reducedMotion() || typeof card.animate !== 'function') {
        swap();
      } else {
        const { axis, out, in: back } = TURN_FRAMES[turnName];
        const turn = (from, to, easing) => card.animate(
          [{ transform: `perspective(1100px) rotate${axis}(${from}deg)` }, { transform: `perspective(1100px) rotate${axis}(${to}deg)` }],
          { duration: 170, easing }
        ).finished;
        card.dataset.turn = turnName;
        await turn(0, out, 'ease-in');
        swap();
        await turn(back, 0, 'ease-out');
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
    const duration = 220;
    this.#raiseStack(duration);
    playCard(direction);
    try {
      await card.animate(
        [
          { transform: `translateX(${from}px) rotate(${from / 24}deg)`, opacity: 1 },
          { transform: `translateX(${direction * 120}%) rotate(${direction * 14}deg)`, opacity: 0 }
        ],
        { duration, easing: 'ease-in', fill: 'forwards' }
      ).finished;
    } catch {
      // animacja przerwana – decyzja i tak zostanie zapisana
    }
  }

  /** Fiszki ze stosu przesuwają się o jedno miejsce w górę (w czasie wyrzucania wierzchniej). */
  #raiseStack(duration) {
    const layers = this.elements.layers ?? [];
    if (layers.length === 0) return;
    this.fromStack = true;
    const options = { duration, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' };
    layers.forEach((layer, index) => {
      const depth = index + 1;
      layer.animate([{ transform: getComputedStyle(layer).transform }, { transform: STACK_POSES[depth - 1] }], options);
      layer.querySelector('.card-stack__shade')
        ?.animate([{ opacity: STACK_SHADES[depth] }, { opacity: STACK_SHADES[depth - 1] }], options);
    });
  }

  /** W trakcie przeciągania następna fiszka lekko się podnosi (lift 0–1). */
  #liftStack(lift) {
    const first = this.elements.layers?.[0];
    if (!first) return;
    const amount = Math.min(1, Math.max(0, lift)) * 0.5;
    first.style.transition = '';
    first.style.transform = lift > 0 ? `translateY(${4 * (1 - amount)}px) scale(${0.955 + 0.045 * amount})` : '';
  }

  async #decide(decision) {
    // Decyzja może zapaść jeszcze w trakcie obrotu – odpowiedź jest już wtedy widoczna.
    if (this.busy || !this.revealed) return;
    // „Umiem” to komplet – kafelki zaznaczają się same, zanim fiszka odleci.
    if (decision === DECISIONS.KNOW) this.tiles = setAllTiles(this.tiles, true);
    this.busy = true;
    this.#updateTiles();
    vibrate(14);
    await this.#flyOut(decision);
    try {
      await this.ctx.library.recordStudyDecision({
        tiles: this.tiles, decision, random: () => this.fuzz, duration: Date.now() - this.cardShownAt
      });
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
      const first = this.elements.layers?.[0];
      if (first) {
        first.style.transition = animated && !reducedMotion() ? 'transform 0.2s ease' : '';
        first.style.transform = '';
      }
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
      this.#liftStack(Math.abs(dx) / Math.min(130, card.offsetWidth * 0.28));
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
    // Strony po obrotach (od 1.39): 1 obrót – jedna strona z całą odpowiedzią; od 1.56 pojęcie może mieć własne strony.
    const session = library.getStudySession();
    const spec = termCardFaces(term, front, sessionFlipFaces(session?.config, this.#settings()));
    const kinds = spec.faces;
    const content = cardContent(term, card.direction, spec.front);
    const frontLabel = frontLabelOf(content);
    const total = kinds.length + 1;

    // Każdą linię opisu i przykładu można odsłuchać osobno, w jej języku; od 1.56 krótkie linie – pogrubione.
    const section = (id, title, items, speakLabel) => h('div', { class: 'flashcard__section', dataset: { section: id } },
      h('h3', { class: 'flashcard__section-title' }, title),
      items.length === 0
        ? h('p', { class: 'flashcard__missing' }, 'Brak danych')
        : items.map((item) => h('p', { class: `flashcard__line${item.text.length <= SHORT_LINE ? ' flashcard__line--short' : ''}`, lang: item.lang },
            h('span', null, item.text),
            this.#speakerButton(item.text, item.lang, `${speakLabel} ${LANGUAGE_LOCATIVE[item.lang]}`)
          ))
    );
    /** Przycisk na dole strony: obrót na następną stronę. */
    const nextButton = (label, testID) => h('button', {
      type: 'button', class: 'flashcard__flip', dataset: { testid: testID, flip: '' },
      onClick: (event) => { event.stopPropagation(); this.#flip(); }
    }, icon('flip', { size: 18 }), h('span', null, label));

    const frontFace = h('div', { class: 'flashcard__face', hidden: this.face !== 0, dataset: { testid: 'card-front' } },
      h('div', { class: 'flashcard__top' },
        h('span', { class: 'flashcard__label' }, frontLabel),
        this.#speakerButton(content.front.text, content.front.lang, 'Odtwórz wymowę')
      ),
      // Od 1.56 treść strony w jednym bloku na środku (z obrazem albo tabelą z notatki pod spodem).
      h('div', { class: 'flashcard__body' },
        h('p', { class: `flashcard__text ${sizeClass(content.front.text)}`, lang: content.front.lang }, content.front.text),
        this.#mediaView(term, mediaOnFace(term, 0, total))),
      nextButton(FACE_ACTIONS[kinds[0]], 'card-flip')
    );

    /** Strona po obrocie `index` (1…) z treścią `kind` (od 1.56 – dowolny zestaw części albo sam obraz z notatki). */
    const backFace = (kind, index) => {
      const parts = faceParts(kind);
      const answer = parts.includes('answer');
      const media = this.#mediaView(term, mediaOnFace(term, index, total));
      const label = answer ? LANGUAGE_NAMES[content.target] : kind === MEDIA_FACE ? 'Z notatki lekcji' : FLIP_FACES.find((face) => face.id === kind).label;
      return h('div', {
        class: `flashcard__face flashcard__face--back flashcard__face--${kind}`, hidden: this.face !== index,
        dataset: { testid: index === 1 ? 'card-back' : `card-face-${index}`, kind }
      },
        // Odwrót mieści dużo treści, więc powrót do pytania to mały przycisk w nagłówku
        // (fiszkę można też po prostu dotknąć).
        h('div', { class: 'flashcard__top' },
          h('span', { class: 'flashcard__label' }, label,
            total > 2 ? h('span', { class: 'flashcard__page', dataset: { testid: `card-page-${index}` } }, ` · ${index + 1}/${total}`) : null),
          h('span', { class: 'flashcard__tools' },
            h('button', {
              type: 'button', class: 'icon-button flashcard__turn', 'aria-label': 'Pokaż pytanie', title: 'Pokaż pytanie',
              dataset: { testid: index === 1 ? 'card-unflip' : `card-unflip-${index}`, flip: '' },
              onClick: (event) => { event.stopPropagation(); this.#flipTo(0); }
            }, icon('flip', { size: 22 })),
            answer ? this.#speakerButton(content.back.answer.text, content.back.answer.lang, 'Odtwórz wymowę tłumaczenia') : null
          )
        ),
        h('div', { class: 'flashcard__body' },
          answer ? h('p', { class: `flashcard__text flashcard__text--answer ${sizeClass(content.back.answer.text)}`, lang: content.back.answer.lang },
            content.back.answer.text) : null,
          answer ? h('p', { class: 'flashcard__question', lang: content.back.question.lang }, content.back.question.text) : null,
          parts.includes('description') ? section('description', 'Definicja', content.back.descriptions, 'Odtwórz definicję') : null,
          parts.includes('example') ? section('example', 'Przykład', content.back.examples, 'Odtwórz przykład') : null,
          media,
          parts.length === 0 && !media ? h('p', { class: 'flashcard__missing' }, 'Brak treści na tej stronie') : null),
        index < kinds.length ? nextButton(NEXT_ACTIONS[kinds[index]], `card-next-${index}`) : null,
        h('span', { class: 'flashcard__fade', 'aria-hidden': 'true' })
      );
    };
    const backFaces = kinds.map((kind, index) => backFace(kind, index + 1));

    const cardElement = h('div', {
      class: 'flashcard',
      dataset: {
        testid: 'flashcard', side: this.face > 0 ? 'back' : 'front', face: String(this.face), faces: String(total), swipe: '', direction: card.direction,
        enter: this.enterStack ? 'stack' : null
      }
    },
      frontFace,
      ...backFaces,
      h('span', { class: 'flashcard__stamp flashcard__stamp--know', 'aria-hidden': 'true' }, 'Umiem'),
      h('span', { class: 'flashcard__stamp flashcard__stamp--repeat', 'aria-hidden': 'true' }, 'Powtórz')
    );
    this.#attachSwipe(cardElement);
    this.elements.card = cardElement;
    this.elements.faces = [frontFace, ...backFaces];
    // Nad fiszką cała ścieżka (od 1.20): dziedzina › moduł › lekcja.
    this.elements.lessonPath = library.lessonPath(term.lessonID).split(' › ').filter(Boolean);
    return cardElement;
  }

  /**
   * Fiszka razem ze stosem: pod spodem następna fiszka (strona z pytaniem, bez przycisków)
   * i – gdy zostały co najmniej dwie – jeszcze jedna pusta.
   */
  #stackView(session, cardElement) {
    const { library } = this.ctx;
    const upcoming = [];
    for (let index = session.position + 1; index < session.queue.length && upcoming.length < 2; index += 1) {
      const next = session.queue[index];
      const term = library.getTerm(next.termID);
      if (term) upcoming.push({ card: next, term });
    }
    const front = session.config.front ?? 'term';
    const layers = upcoming.map((item, index) => h('div', {
      class: `card-stack__layer card-stack__layer--${index + 1}`, 'aria-hidden': 'true', inert: ''
    },
      index === 0 ? this.#previewFace(item.term, item.card, front) : null,
      h('span', { class: 'card-stack__shade' })
    ));
    this.elements.layers = layers;
    // Głębsza warstwa wcześniej w dokumencie – leży niżej.
    return h('div', { class: 'card-stack', dataset: { testid: 'card-stack', depth: String(layers.length) } },
      [...layers].reverse(), cardElement);
  }

  /** Strona z pytaniem następnej fiszki – wygląda jak prawdziwa, ale niczego nie obsługuje. */
  #previewFace(term, card, front) {
    const content = cardContent(term, card.direction, termCardFaces(term, front, []).front);
    return h('div', { class: 'flashcard__face' },
      h('div', { class: 'flashcard__top' },
        h('span', { class: 'flashcard__label' }, frontLabelOf(content)),
        speechAvailable() && content.front.text
          ? h('span', { class: 'icon-button flashcard__speak' }, icon('speaker', { size: 22 }))
          : null
      ),
      h('div', { class: 'flashcard__body' },
        h('p', { class: `flashcard__text ${sizeClass(content.front.text)}`, lang: content.front.lang }, content.front.text)),
      h('span', { class: 'flashcard__flip' }, icon('flip', { size: 18 }), h('span', null, 'Pokaż odpowiedź'))
    );
  }

  /**
   * Obrazy (rysunki, zdjęcia) i tabele z notatki lekcji przypięte do strony fiszki (od 1.56) – z podpisem-sygnaturą;
   * obraz pojawia się po wczytaniu, sygnatury, której nie ma w notatce – krótka informacja.
   */
  #mediaView(term, items) {
    if (items.length === 0) return null;
    const note = this.ctx.library.getNote(term.lessonID);
    const imageLabels = withImageLabels(note?.images ?? []).map((image) => image.label);
    const tables = withTableLabels(note?.tables ?? [], imageLabels);
    const missing = (item) => h('p', { class: 'flashcard__missing', dataset: { testid: 'card-media-missing' } }, `„${item.label}” – nie ma w notatce lekcji`);
    return h('div', { class: 'flashcard__media', dataset: { testid: 'card-media' } }, items.map((item) => {
      const caption = h('figcaption', { class: 'flashcard__media-label' }, item.label);
      if (item.kind === 'table') {
        const index = findTableByLabel(tables, item.label);
        if (index < 0) return missing(item);
        const box = h('div', { class: 'flashcard__table' });
        // Komórki są zamieniane na tekst (tableHtml) – bez znaczników z treści.
        box.innerHTML = tableHtml(tables[index]);
        return h('figure', { class: 'flashcard__figure', dataset: { kind: 'table', label: item.label } }, box, caption);
      }
      const image = h('img', { class: 'flashcard__image', alt: item.label, draggable: 'false' });
      const figure = h('figure', { class: 'flashcard__figure flashcard__figure--loading', dataset: { kind: 'image', label: item.label } }, image, caption);
      this.#noteImageURL(term.lessonID, item.label).then((url) => {
        if (url) {
          image.src = url;
          figure.classList.remove('flashcard__figure--loading');
        } else {
          figure.replaceWith(missing(item));
        }
      });
      return figure;
    }));
  }

  /** Adres obrazu notatki lekcji o danej sygnaturze (null – nie ma); obrazy lekcji wczytywane raz na sesję. */
  async #noteImageURL(lessonID, label) {
    if (!this.noteImages.has(lessonID)) {
      this.noteImages.set(lessonID, this.ctx.library.noteImages(lessonID).then((images) => withImageLabels(images)).catch(() => []));
    }
    const images = await this.noteImages.get(lessonID);
    const index = findImageByLabel(images, label);
    if (index < 0 || this.disposed) return null;
    const image = images[index];
    image.url ??= this.urls.add(image);
    return image.url;
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
    // Grupy liczone z najnowszej oceny każdej fiszki, więc obejmują wszystkie rundy tej sesji.
    const choices = this.ctx.library.repeatChoices();
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
          choices.map((choice, index) => action(
            index === 0 ? 'button--primary' : 'button--secondary',
            REPEAT_TEST_IDS[choice.kind],
            `${REPEAT_LABELS[choice.kind]} (${choice.queue.length})`,
            () => this.#repeat(choice.kind)
          )),
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
      this.face = 0;
      this.tiles = emptyTiles(term);
      this.drag = null;
      this.fuzz = Math.random();
      this.cardShownAt = Date.now();
      this.enterStack = this.fromStack;
      this.fromStack = false;
      stopSpeaking();
    }

    const total = session.queue.length;
    const number = session.position + 1;
    const cardElement = this.#cardView(term, card, session.config.front ?? 'term');
    const stack = this.#stackView(session, cardElement);
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
      'Odwróć fiszkę. Pamiętasz wszystko – przesuń w lewo („Umiem”). Jeśli nie, zaznacz, co pamiętasz, i przesuń w prawo („Powtórz”).');

    const undoButton = iconButton('undo', 'Cofnij ostatnią decyzję', () => this.#undo());
    undoButton.disabled = session.results.length === 0;
    undoButton.dataset.testid = 'study-undo';

    const body = h('div', { class: 'study', dataset: { testid: 'study-session' } },
      h('div', { class: 'study__header' },
        h('div', { class: 'study__meta' },
          h('span', { class: 'study__lesson', title: this.elements.lessonPath.join(' › '), dataset: { testid: 'study-lesson' } },
            this.elements.lessonPath.length > 1 ? h('span', { class: 'study__path' }, `${this.elements.lessonPath.slice(0, -1).join(' › ')} › `) : null,
            h('span', { class: 'study__lesson-name' }, this.elements.lessonPath[this.elements.lessonPath.length - 1] ?? '')),
          h('span', { class: 'study__counter', dataset: { testid: 'study-counter' } }, `${number} z ${total}`)
        ),
        h('div', {
          class: 'study__progress', role: 'progressbar', 'aria-label': 'Postęp sesji',
          'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(session.position)
        }, h('span', { class: 'study__progress-fill', style: { width: `${Math.round((session.position / total) * 100)}%` } }))
      ),
      stack,
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
      actions: [
        // Notatka lekcji bieżącej fiszki – np. schemat do zajrzenia w trakcie nauki.
        library.getNote(term.lessonID)
          ? iconButton('note', 'Notatka lekcji', async (event) => {
              const button = event.currentTarget;
              await openLessonNote(this.ctx, term.lessonID);
              // Fokus nie wraca na przycisk – spacja i strzałki od razu znów sterują fiszką.
              if (document.activeElement === button) button.blur();
            }, { className: 'study__note' })
          : null,
        undoButton,
        navButton('Zakończ', () => this.#endEarly())
      ],
      body
    };
  }
}
