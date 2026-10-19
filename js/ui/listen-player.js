// Odtwarzacz słuchania: czyta kolejne kroki pojęć (pojęcie, przerwa, odpowiedź, definicja,
// przykład) syntezatorem mowy urządzenia; od 1.7 przed pojęciami może przeczytać notatki lekcji.
//
// Każde przejście dalej ma „bilet” (token): pauza, „dalej” albo „powtórz” wydają nowy bilet,
// więc spóźnione zakończenie przerwanej wypowiedzi albo licznika czasu niczego nie przestawia.
// Wznowienie po pauzie czyta bieżący krok od początku – pauza wbudowana w syntezator
// bywa w Safari zawodna.

import { CARD_GAP, DETAIL_GAP, introText, listenSteps, outroText } from '../core/listen.js';
import { AFTER_CANCEL, speakThen, stopSpeaking } from './speech.js';

export class ListenPlayer {
  /**
   * cards: [{ term, direction }] – kopia pojęć z chwili startu,
   * notes: [{ lessonID, lessonName, steps }] – notatki lekcji czytane przed pojęciami (noteSteps()),
   * options: jak w listenSteps(), settings: () => ustawienia mowy, onChange: () => void.
   */
  constructor({ cards, notes = [], options, settings, onChange }) {
    this.cards = cards.map((card) => ({ ...card, steps: listenSteps(card.term, card.direction, options) }));
    this.notes = notes.filter((note) => note.steps.length > 0);
    /** Kolejne pozycje: najpierw notatki, potem pojęcia. */
    this.items = [...this.notes.map((note) => ({ note, steps: note.steps })), ...this.cards];
    this.options = options;
    this.settings = settings;
    this.onChange = onChange;
    this.phase = 'ready';
    /** -1 – zapowiedź, 0…n-1 – pozycje (notatki, potem pojęcia), n – zakończenie. */
    this.cardIndex = -1;
    this.stepIndex = 0;
    /** Liczba ukończonych kroków – do sprawdzenia, czy czytanie trwa przy zablokowanym ekranie. */
    this.stepsDone = 0;
    this.listened = new Set();
    this.token = 0;
    this.cancelWait = null;
    this.thinkStartedAt = null;
    this.thinkEndsAt = null;
  }

  /** Liczba pojęć (bez notatek). */
  get total() {
    return this.cards.length;
  }

  /** Numer bieżącego pojęcia (od 1); 0 – przed pojęciami (zapowiedź, notatki). */
  get cardNumber() {
    return Math.max(0, Math.min(this.total, this.cardIndex - this.notes.length + 1));
  }

  /** Bieżący krok: { kind, text, lang, ms }. */
  currentStep() {
    if (this.cardIndex < 0) return { kind: 'intro', text: introText(this.total, this.notes.length), lang: 'pl' };
    if (this.cardIndex >= this.items.length) return { kind: 'outro', text: outroText(this.listened.size), lang: 'pl' };
    return this.items[this.cardIndex].steps[this.stepIndex];
  }

  /** Bieżące pojęcie albo null (zapowiedź, notatka, zakończenie). */
  currentCard() {
    const item = this.items[this.cardIndex];
    return item && !item.note ? item : null;
  }

  /** Bieżąca notatka lekcji albo null. */
  currentNote() {
    return this.items[this.cardIndex]?.note ?? null;
  }

  /** Start – wywoływany bezpośrednio w obsłudze dotknięcia (Safari wymaga gestu do pierwszej wypowiedzi). */
  start() {
    this.phase = 'playing';
    this.cardIndex = -1;
    this.stepIndex = 0;
    this.listened = new Set();
    this.#play();
  }

  pause() {
    if (this.phase !== 'playing') return;
    this.#interrupt();
    this.phase = 'paused';
    this.onChange();
  }

  /** Wznowienie: bieżący krok od początku. */
  resume() {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.#play();
  }

  toggle() {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  /** Następna pozycja – pojęcie albo notatka (od początku, bez reszty bieżącej). */
  next() {
    if (this.phase === 'finished' || this.phase === 'ready') return;
    this.#jump(Math.min(this.cardIndex + 1, this.items.length));
  }

  /** Poprzednia pozycja; w środku pozycji – ta sama od początku. */
  previous() {
    if (this.phase === 'finished' || this.phase === 'ready') return;
    const last = this.items.length - 1;
    const target = this.stepIndex > 0 || this.cardIndex >= this.items.length ? Math.min(this.cardIndex, last) : this.cardIndex - 1;
    this.#jump(Math.max(0, target));
  }

  /** To samo pojęcie (albo ta sama notatka) jeszcze raz od początku. */
  repeat() {
    if (this.phase === 'finished' || this.phase === 'ready') return;
    this.#jump(Math.max(0, Math.min(this.cardIndex, this.items.length - 1)));
  }

  /** Ponowne odczytanie bieżącego kroku – np. po powrocie z tła, gdy system przerwał mowę. */
  restartStep() {
    if (this.phase !== 'playing') return;
    this.#interrupt();
    this.#later(AFTER_CANCEL, this.token, () => this.#play());
  }

  stop() {
    this.#interrupt();
    this.phase = 'finished';
  }

  #interrupt() {
    this.token += 1;
    this.cancelWait?.();
    this.cancelWait = null;
    this.thinkStartedAt = null;
    this.thinkEndsAt = null;
    stopSpeaking();
  }

  #jump(cardIndex) {
    const playing = this.phase === 'playing';
    this.#interrupt();
    this.cardIndex = cardIndex;
    this.stepIndex = 0;
    if (playing) this.#later(AFTER_CANCEL, this.token, () => this.#play());
    this.onChange();
  }

  #later(ms, token, action) {
    const timer = setTimeout(() => {
      if (token === this.token) action();
    }, ms);
    this.cancelWait = () => clearTimeout(timer);
  }

  #play() {
    const token = ++this.token;
    const step = this.currentStep();
    this.thinkStartedAt = null;
    this.thinkEndsAt = null;
    if (step.kind === 'think') {
      this.thinkStartedAt = Date.now();
      this.thinkEndsAt = this.thinkStartedAt + step.ms;
      this.#later(step.ms, token, () => this.#advance(token));
    } else {
      this.cancelWait = speakThen(step.text, step.lang, this.settings(), () => {
        if (token === this.token) this.#advance(token);
      });
    }
    this.onChange();
  }

  #advance(token) {
    if (token !== this.token || this.phase !== 'playing') return;
    this.stepsDone += 1;
    const step = this.currentStep();
    if (step.kind === 'outro') {
      this.phase = 'finished';
      this.cancelWait = null;
      this.onChange();
      return;
    }
    let delay = DETAIL_GAP;
    if (step.kind === 'intro') {
      this.cardIndex = 0;
      this.stepIndex = 0;
    } else {
      const card = this.items[this.cardIndex];
      if (step.kind === 'answer' && !step.repeat) this.listened.add(this.cardIndex);
      if (this.stepIndex + 1 < card.steps.length) {
        // Po pojęciu od razu liczy się czas na zastanowienie, po nim od razu pada odpowiedź;
        // zdania notatki idą jedno po drugim.
        if (step.kind === 'prompt' || step.kind === 'think' || step.kind === 'note') delay = 0;
        this.stepIndex += 1;
      } else {
        delay = CARD_GAP;
        this.cardIndex += 1;
        this.stepIndex = 0;
      }
    }
    if (delay === 0) this.#play();
    else {
      this.#later(delay, token, () => this.#play());
      this.onChange();
    }
  }
}
