// Odtwarzacz słuchania: czyta kolejne kroki pojęć (pojęcie, przerwa, odpowiedź, definicja,
// przykład) syntezatorem mowy urządzenia.
//
// Każde przejście dalej ma „bilet” (token): pauza, „dalej” albo „powtórz” wydają nowy bilet,
// więc spóźnione zakończenie przerwanej wypowiedzi albo licznika czasu niczego nie przestawia.
// Wznowienie po pauzie czyta bieżący krok od początku – pauza wbudowana w syntezator
// bywa w Safari zawodna.

import { CARD_GAP, DETAIL_GAP, introText, listenSteps, outroText } from '../core/listen.js';
import { speakThen, stopSpeaking } from './speech.js';

/** Po przerwaniu mowy Safari potrafi zgubić wypowiedź podaną od razu – krótki odstęp. */
const AFTER_CANCEL = 150;

export class ListenPlayer {
  /**
   * cards: [{ term, direction }] – kopia pojęć z chwili startu,
   * options: jak w listenSteps(), settings: () => ustawienia mowy, onChange: () => void.
   */
  constructor({ cards, options, settings, onChange }) {
    this.cards = cards.map((card) => ({ ...card, steps: listenSteps(card.term, card.direction, options) }));
    this.options = options;
    this.settings = settings;
    this.onChange = onChange;
    this.phase = 'ready';
    /** -1 – zapowiedź, 0…n-1 – pojęcia, n – zakończenie. */
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

  get total() {
    return this.cards.length;
  }

  /** Bieżący krok: { kind, text, lang, ms }. */
  currentStep() {
    if (this.cardIndex < 0) return { kind: 'intro', text: introText(this.total), lang: 'pl' };
    if (this.cardIndex >= this.total) return { kind: 'outro', text: outroText(this.listened.size), lang: 'pl' };
    return this.cards[this.cardIndex].steps[this.stepIndex];
  }

  currentCard() {
    return this.cardIndex >= 0 && this.cardIndex < this.total ? this.cards[this.cardIndex] : null;
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

  /** Następne pojęcie (od pojęcia, bez reszty bieżącego). */
  next() {
    if (this.phase === 'finished' || this.phase === 'ready') return;
    this.#jump(Math.min(this.cardIndex + 1, this.total));
  }

  /** Poprzednie pojęcie; w środku pojęcia – to samo od początku. */
  previous() {
    if (this.phase === 'finished' || this.phase === 'ready') return;
    const target = this.stepIndex > 0 || this.cardIndex >= this.total ? Math.min(this.cardIndex, this.total - 1) : this.cardIndex - 1;
    this.#jump(Math.max(0, target));
  }

  /** To samo pojęcie jeszcze raz od początku. */
  repeat() {
    if (this.phase === 'finished' || this.phase === 'ready') return;
    this.#jump(Math.max(0, Math.min(this.cardIndex, this.total - 1)));
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
      const card = this.cards[this.cardIndex];
      if (step.kind === 'answer' && !step.repeat) this.listened.add(this.cardIndex);
      if (this.stepIndex + 1 < card.steps.length) {
        // Po pojęciu od razu liczy się czas na zastanowienie, po nim od razu pada odpowiedź.
        if (step.kind === 'prompt' || step.kind === 'think') delay = 0;
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
