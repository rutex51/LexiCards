// Trwający quiz: pytania jednokrotnego wyboru, rundy łączenia par i ekran wyniku.
//
// Każda odpowiedź (pytanie albo cała runda par) jest zapisywana od razu, a quiz przechodzi
// dalej. Informacja zwrotna o ostatniej odpowiedzi to stan tego ekranu (`review`) – zostaje
// na ekranie, dopóki użytkownik nie przejdzie dalej.
//
// Czas quizu płynie tylko wtedy, gdy ekran quizu jest widoczny. Zegar jest lokalny, a do bazy
// trafia przy każdej odpowiedzi, przy wyjściu z ekranu i przy przejściu aplikacji w tło.

import { DIRECTIONS } from '../../core/model.js';
import {
  PAIRS_PER_ROUND, answerChoice, answerMatching, buildQuiz, formatDuration, quizResult
} from '../../core/quiz.js';
import { cardContent } from '../../core/study.js';
import { emptyState, navButton } from '../components.js';
import { confirmDialog, showError, toast } from '../dialogs.js';
import { h, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';
import { speak, speechAvailable, stopSpeaking } from '../speech.js';
import { openQuizHistory } from './quiz-history.js';

const LANGUAGE_NAMES = { pl: 'Polski', en: 'Angielski' };
const TRANSLATE_TO = { pl: 'Wybierz tłumaczenie na polski', en: 'Wybierz tłumaczenie na angielski' };
const LETTERS = ['A', 'B', 'C', 'D'];
const TICK_MS = 250;
const LOW_TIME_MS = 30_000;
const WRONG_FLASH_MS = 450;
/** Słowo dłuższe niż tyle znaków dostaje w kafelku pary mniejszą czcionkę. */
const LONG_WORD = 13;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function vibrate(duration = 10) {
  try {
    navigator.vibrate?.(duration);
  } catch {
    // sprzężenie haptyczne jest dodatkiem
  }
}

/** Klasa rozmiaru tekstu pytania zależna od długości. */
function promptSize(text) {
  if (text.length <= 18) return 'quiz-prompt__text--xl';
  if (text.length <= 42) return 'quiz-prompt__text--lg';
  return 'quiz-prompt__text--md';
}

/** Tekst pojęcia w języku pytania (do listy błędów); pojęcie mogło zostać usunięte. */
function promptText(term, direction) {
  if (!term) return null;
  return direction === DIRECTIONS.EN_PL ? term.termEN : term.termPL;
}

function animate(element, keyframes, options) {
  if (!element || reducedMotion() || typeof element.animate !== 'function') return;
  try {
    element.animate(keyframes, options);
  } catch {
    // animacja to dodatek
  }
}

export class QuizSessionScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.itemKey = null;
    /** Informacja zwrotna o ostatniej odpowiedzi: { kind, item, answers, selectedIndex }. */
    this.review = null;
    this.hintShown = false;
    this.match = null;
    this.busy = false;
    this.nextRequested = false;
    this.finishing = false;
    this.disposed = false;
    this.elements = {};

    const quiz = ctx.library.getQuiz();
    this.clockBase = quiz?.elapsedMs ?? 0;
    this.clockStart = null;
    this.itemStartElapsed = this.clockBase;
    this.#resumeClock();

    this.timer = window.setInterval(() => this.#tick(), TICK_MS);
    this.onVisibility = () => this.#handleVisibility();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onKeyDown = (event) => this.#handleKey(event);
    document.addEventListener('keydown', this.onKeyDown);
  }

  dispose() {
    this.disposed = true;
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('keydown', this.onKeyDown);
    stopSpeaking();
    this.#pauseClock();
    this.#saveTime();
  }

  // ---------------------------------------------------------------- czas

  #quiz() {
    return this.ctx.library.getQuiz();
  }

  #elapsed() {
    return this.clockBase + (this.clockStart === null ? 0 : Date.now() - this.clockStart);
  }

  #pauseClock() {
    if (this.clockStart === null) return;
    this.clockBase = this.#elapsed();
    this.clockStart = null;
  }

  #resumeClock() {
    const quiz = this.#quiz();
    if (this.clockStart !== null || !quiz || quiz.finishedAt || document.visibilityState === 'hidden') return;
    this.clockStart = Date.now();
  }

  #saveTime() {
    const quiz = this.#quiz();
    if (!quiz || quiz.finishedAt || this.finishing) return;
    this.ctx.library.saveQuizTime(this.#elapsed()).catch((error) => console.error(error));
  }

  #handleVisibility() {
    if (document.visibilityState === 'hidden') {
      this.#pauseClock();
      this.#saveTime();
    } else {
      this.#resumeClock();
    }
  }

  #limitMs(quiz) {
    return Math.max(0, (quiz.config.timeLimit ?? 0) * 1000);
  }

  #timerText(quiz) {
    const limit = this.#limitMs(quiz);
    const elapsed = this.#elapsed();
    return limit > 0 ? formatDuration(Math.max(0, limit - elapsed)) : formatDuration(elapsed);
  }

  #tick() {
    const quiz = this.#quiz();
    if (this.disposed || !quiz || quiz.finishedAt) return;
    const limit = this.#limitMs(quiz);
    if (limit > 0 && this.#elapsed() >= limit) {
      this.#timeUp();
      return;
    }
    const timer = this.elements.timer;
    if (!timer) return;
    timer.querySelector('.quiz-timer__value').textContent = this.#timerText(quiz);
    if (limit > 0) timer.classList.toggle('quiz-timer--low', limit - this.#elapsed() <= LOW_TIME_MS);
  }

  /** Niedokończona runda par jako odpowiedzi częściowe (połączone pary się liczą). */
  #partialAnswers(quiz) {
    const item = quiz.items[quiz.position];
    if (this.review || !item || item.kind !== 'matching' || !this.match) return [];
    const { matched, mistakes } = this.match;
    if (matched.size === 0 && mistakes.size === 0) return [];
    return answerMatching(item, { ...this.match, interrupted: true });
  }

  async #timeUp() {
    if (this.finishing) return;
    this.finishing = true;
    const quiz = this.#quiz();
    const limit = this.#limitMs(quiz);
    this.#pauseClock();
    this.clockBase = limit;
    try {
      await this.ctx.library.finishQuiz({ timedOut: true, elapsedMs: limit, partial: this.#partialAnswers(quiz) });
      this.review = null;
      vibrate(30);
      toast('Koniec czasu.');
    } catch (error) {
      await showError(error);
    } finally {
      this.finishing = false;
      if (!this.disposed) {
        this.ctx.refresh();
        window.scrollTo(0, 0);
      }
    }
  }

  // ---------------------------------------------------------------- przebieg

  async #finishEarly() {
    const quiz = this.#quiz();
    if (!quiz || quiz.finishedAt || this.finishing) return;
    const answered = quiz.answers.length > 0 || this.#partialAnswers(quiz).length > 0;
    const confirmed = await confirmDialog({
      title: 'Zakończyć quiz?',
      message: answered
        ? 'Pytania bez odpowiedzi liczą się jako błędne. Wynik trafi do historii.'
        : 'Nie ma jeszcze żadnej odpowiedzi, więc wynik nie trafi do historii.',
      confirmLabel: 'Zakończ quiz',
      cancelLabel: 'Kontynuuj'
    });
    if (!confirmed || this.disposed) return;
    this.finishing = true;
    try {
      if (!answered) {
        await this.ctx.library.closeQuiz();
        this.ctx.navigate(routes.quiz(), { replace: true });
        return;
      }
      this.#pauseClock();
      await this.ctx.library.finishQuiz({ elapsedMs: this.#elapsed(), partial: this.#partialAnswers(quiz) });
      this.review = null;
    } catch (error) {
      await showError(error);
    } finally {
      this.finishing = false;
      if (!this.disposed) {
        this.ctx.refresh();
        window.scrollTo(0, 0);
      }
    }
  }

  /** Zapisuje odpowiedzi bieżącego pytania lub rundy; informacja zwrotna jest już na ekranie. */
  async #record(answers) {
    this.busy = true;
    this.nextRequested = false;
    try {
      await this.ctx.library.recordQuizAnswers(answers, { elapsedMs: this.#elapsed() });
      if (this.#quiz()?.finishedAt) this.#pauseClock();
    } catch (error) {
      this.review = null;
      this.nextRequested = false;
      await showError(error);
    } finally {
      this.busy = false;
      if (!this.disposed) {
        // „Dalej” wybrane, zanim zapis się skończył – przechodzimy teraz.
        if (this.nextRequested) this.#next();
        else this.ctx.refresh();
      }
    }
  }

  #next() {
    if (!this.review) return;
    if (this.busy) {
      this.nextRequested = true;
      return;
    }
    this.nextRequested = false;
    this.review = null;
    this.ctx.refresh();
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- jednokrotny wybór

  #choose(index) {
    const quiz = this.#quiz();
    if (this.review || this.busy || this.finishing || !quiz || quiz.finishedAt) return;
    const item = quiz.items[quiz.position];
    if (item?.kind !== 'choice' || index < 0 || index >= item.options.length) return;
    const answer = {
      ...answerChoice(item, index),
      usedHint: this.hintShown,
      responseTime: this.#elapsed() - this.itemStartElapsed
    };
    this.review = { kind: 'choice', item, answers: [answer], selectedIndex: index };
    vibrate(answer.isCorrect ? 10 : 24);
    this.ctx.refresh();
    this.#record([answer]);
  }

  #showHint() {
    this.hintShown = true;
    this.ctx.refresh();
  }

  #speaker(text, language, label) {
    if (!speechAvailable() || !text) return null;
    return h('button', {
      type: 'button', class: 'icon-button quiz-speak', 'aria-label': label, title: label,
      dataset: { testid: 'speak', lang: language },
      onClick: (event) => {
        event.stopPropagation();
        speak(text, language, this.ctx.library.getSettings());
      }
    }, icon('speaker', { size: 22 }));
  }

  #promptCard(text, language, label) {
    return h('div', { class: 'quiz-prompt', dataset: { testid: 'quiz-prompt' } },
      h('div', { class: 'quiz-prompt__top' },
        h('span', { class: 'quiz-prompt__label' }, label),
        this.#speaker(text, language, 'Odtwórz wymowę')
      ),
      h('p', { class: `quiz-prompt__text ${promptSize(text)}`, lang: language }, text)
    );
  }

  /** Definicja i przykład pojęcia: przed odpowiedzią – w języku pytania, potem w obu językach. */
  #details(term, direction, { sourceOnly }) {
    if (!term) return null;
    const content = cardContent(term, direction, 'term');
    const pick = (items) => (sourceOnly ? items.filter((item) => item.lang === content.source) : items);
    const sections = [
      ['Definicja', pick(content.back.descriptions)],
      ['Przykład', pick(content.back.examples)]
    ].filter(([, items]) => items.length > 0);
    if (sections.length === 0) return null;
    return h('div', { class: 'quiz-details', dataset: { testid: sourceOnly ? 'quiz-hint' : 'quiz-details' } },
      sections.map(([title, items]) => h('div', { class: 'quiz-details__section' },
        h('h3', { class: 'quiz-details__title' }, title),
        items.map((item) => h('p', { class: 'quiz-details__line', lang: item.lang }, item.text))
      ))
    );
  }

  #choiceView(quiz, item) {
    const { library } = this.ctx;
    const review = this.review?.kind === 'choice' ? this.review : null;
    const term = library.getTerm(item.termID);
    const source = item.prompt.lang;

    const options = h('div', { class: 'quiz-options', role: 'group', 'aria-label': TRANSLATE_TO[item.answerLang] },
      item.options.map((option, index) => {
        let state = '';
        let mark = null;
        if (review) {
          if (index === item.correctIndex) {
            state = ' quiz-option--correct';
            mark = icon('check', { size: 20 });
          } else if (index === review.selectedIndex) {
            state = ' quiz-option--wrong';
            mark = icon('close', { size: 20 });
          } else {
            state = ' quiz-option--dim';
          }
        }
        const button = h('button', {
          type: 'button',
          class: `quiz-option${state}`,
          disabled: Boolean(review),
          'aria-label': review && index === item.correctIndex ? `${option.text} – poprawna odpowiedź` : null,
          dataset: { testid: 'quiz-option', index: String(index), correct: review ? String(index === item.correctIndex) : null }
        },
          h('span', { class: 'quiz-option__letter', 'aria-hidden': 'true' }, LETTERS[index]),
          h('span', { class: 'quiz-option__text', lang: item.answerLang }, option.text),
          mark ? h('span', { class: 'quiz-option__mark', 'aria-hidden': 'true' }, mark) : null
        );
        return onTap(button, () => this.#choose(index));
      })
    );

    let after = null;
    if (review) {
      const [answer] = review.answers;
      const correct = item.options[item.correctIndex];
      after = h('div', {
        class: `quiz-feedback ${answer.isCorrect ? 'quiz-feedback--correct' : 'quiz-feedback--wrong'}`,
        role: 'status',
        dataset: { testid: 'quiz-feedback', correct: String(answer.isCorrect) }
      },
        h('p', { class: 'quiz-feedback__verdict' },
          icon(answer.isCorrect ? 'check' : 'close', { size: 20 }),
          h('span', null, answer.isCorrect ? 'Dobrze' : 'Źle')),
        h('p', { class: 'quiz-feedback__answer' },
          h('span', { lang: source }, item.prompt.text),
          ' → ',
          h('strong', { lang: item.answerLang }, correct.text),
          this.#speaker(correct.text, item.answerLang, 'Odtwórz wymowę odpowiedzi')),
        this.#details(term, item.direction, { sourceOnly: false })
      );
    } else if (this.hintShown) {
      after = this.#details(term, item.direction, { sourceOnly: true });
    }

    const hasHint = !review && !this.hintShown && this.#details(term, item.direction, { sourceOnly: true }) !== null;
    return [
      this.#promptCard(item.prompt.text, source, LANGUAGE_NAMES[source]),
      h('p', { class: 'quiz__instruction' }, TRANSLATE_TO[item.answerLang]),
      options,
      hasHint ? h('button', {
        type: 'button', class: 'button button--quick quiz__hint-button', dataset: { testid: 'quiz-hint-button' },
        onClick: () => this.#showHint()
      }, icon('book', { size: 18 }), h('span', null, 'Pokaż definicję i przykład')) : null,
      after
    ];
  }

  // ---------------------------------------------------------------- łączenie par

  #matchState() {
    if (!this.match) {
      this.match = { selected: null, matched: new Set(), mistakes: new Map(), wrongPicks: new Map(), errors: 0 };
    }
    return this.match;
  }

  #paintMatch() {
    const match = this.match;
    const tiles = this.elements.tiles;
    if (!match || !tiles) return;
    for (const [key, button] of tiles) {
      const [side, termID] = key.split(':');
      const done = match.matched.has(termID);
      const selected = match.selected?.side === side && match.selected.termID === termID;
      button.classList.toggle('match-tile--done', done);
      button.classList.toggle('match-tile--selected', selected);
      button.disabled = done || Boolean(this.review);
      button.setAttribute('aria-pressed', String(selected));
    }
    if (this.elements.matchedCount) this.elements.matchedCount.textContent = String(match.matched.size);
    if (this.elements.errorCount) this.elements.errorCount.textContent = String(match.errors);
  }

  #tapTile(side, termID) {
    const quiz = this.#quiz();
    if (this.review || this.busy || this.finishing || !quiz || quiz.finishedAt) return;
    const item = quiz.items[quiz.position];
    if (item?.kind !== 'matching') return;
    const match = this.#matchState();
    if (match.matched.has(termID)) return;

    const selected = match.selected;
    if (!selected || selected.side === side) {
      // Pierwszy element pary albo zmiana wyboru w tej samej kolumnie.
      match.selected = selected?.side === side && selected.termID === termID ? null : { side, termID };
      vibrate(6);
      this.#paintMatch();
      return;
    }

    // Lewa kolumna to pytanie, prawa – odpowiedź; pomyłka obciąża parę pojęcia z lewej.
    const left = side === 'left' ? termID : selected.termID;
    const right = side === 'right' ? termID : selected.termID;
    match.selected = null;
    const leftTile = this.elements.tiles.get(`left:${left}`);
    const rightTile = this.elements.tiles.get(`right:${right}`);

    if (left === right) {
      match.matched.add(left);
      vibrate(12);
      this.#paintMatch();
      for (const tile of [leftTile, rightTile]) {
        animate(tile, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
      }
      if (match.matched.size === item.pairs.length) this.#finishRound(item);
      return;
    }

    match.errors += 1;
    match.mistakes.set(left, (match.mistakes.get(left) ?? 0) + 1);
    match.wrongPicks.set(left, item.right.find((entry) => entry.termID === right)?.text ?? null);
    vibrate(28);
    this.#paintMatch();
    for (const tile of [leftTile, rightTile]) {
      if (!tile) continue;
      tile.classList.add('match-tile--wrong');
      animate(tile, [
        { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }
      ], { duration: 320, easing: 'ease-in-out' });
      setTimeout(() => tile.classList.remove('match-tile--wrong'), WRONG_FLASH_MS);
    }
  }

  #finishRound(item) {
    const match = this.match;
    const answers = answerMatching(item, match).map((answer) => ({
      ...answer,
      responseTime: (this.#elapsed() - this.itemStartElapsed) / item.pairs.length
    }));
    this.review = { kind: 'matching', item, answers, errors: match.errors };
    this.ctx.refresh();
    this.#record(answers);
  }

  #matchingView(item) {
    const match = this.#matchState();
    this.elements.tiles = new Map();
    const column = (side, entries, label) => h('div', { class: 'match-column', role: 'group', 'aria-label': label },
      entries.map((entry) => {
        const longest = Math.max(...entry.text.split(/\s+/).map((word) => word.length));
        const button = h('button', {
          type: 'button',
          class: `match-tile${longest > LONG_WORD ? ' match-tile--long' : ''}`,
          'aria-pressed': 'false',
          lang: entry.lang,
          dataset: { testid: `match-${side}`, termid: entry.termID }
        }, h('span', { class: 'match-tile__text' }, entry.text));
        this.elements.tiles.set(`${side}:${entry.termID}`, button);
        return onTap(button, () => this.#tapTile(side, entry.termID));
      })
    );
    const leftLang = item.left[0]?.lang ?? 'pl';
    const rightLang = item.right[0]?.lang ?? 'en';

    this.elements.matchedCount = h('strong', { dataset: { testid: 'match-matched' } }, String(match.matched.size));
    this.elements.errorCount = h('strong', { dataset: { testid: 'match-errors' } }, String(match.errors));

    const grid = h('div', { class: 'match-grid', dataset: { testid: 'match-grid' } },
      column('left', item.left, LANGUAGE_NAMES[leftLang]),
      column('right', item.right, LANGUAGE_NAMES[rightLang])
    );
    const result = [
      h('div', { class: 'match-head' },
        h('p', { class: 'quiz__instruction' }, 'Dotknij pojęcia, a potem jego tłumaczenia.'),
        h('p', { class: 'match-counters' },
          h('span', { class: 'match-counter' }, 'Pary: ', this.elements.matchedCount, ` z ${item.pairs.length}`),
          h('span', { class: 'match-counter match-counter--errors' }, 'Błędy: ', this.elements.errorCount))
      ),
      h('div', { class: 'match-languages', 'aria-hidden': 'true' },
        h('span', null, LANGUAGE_NAMES[leftLang]), h('span', null, LANGUAGE_NAMES[rightLang])),
      grid
    ];
    this.#paintMatch();
    return result;
  }

  #matchingReview(review) {
    const { item, answers } = review;
    const byTerm = new Map(answers.map((answer) => [answer.termID, answer]));
    const correct = answers.filter((answer) => answer.isCorrect).length;
    return [
      h('div', {
        class: `quiz-feedback ${correct === answers.length ? 'quiz-feedback--correct' : 'quiz-feedback--partial'}`,
        role: 'status',
        dataset: { testid: 'quiz-feedback', correct: String(correct === answers.length) }
      },
        h('p', { class: 'quiz-feedback__verdict' },
          icon(correct === answers.length ? 'check' : 'info', { size: 20 }),
          h('span', null, correct === answers.length
            ? 'Wszystkie pary bez pomyłki'
            : `Bez pomyłki: ${correct} z ${answers.length}`)),
        review.errors > 0 ? h('p', { class: 'quiz-feedback__note' }, `Błędne połączenia w tej rundzie: ${review.errors}. Para z pomyłką liczy się jako błędna odpowiedź.`) : null
      ),
      h('ul', { class: 'pair-list', role: 'list', dataset: { testid: 'pair-list' } },
        item.left.map((entry) => {
          const answer = byTerm.get(entry.termID);
          const target = item.right.find((other) => other.termID === entry.termID);
          return h('li', { class: `pair-list__item${answer?.isCorrect ? '' : ' pair-list__item--wrong'}`, dataset: { correct: String(Boolean(answer?.isCorrect)) } },
            h('span', { class: 'pair-list__mark', 'aria-label': answer?.isCorrect ? 'Bez pomyłki' : 'Z pomyłką' },
              icon(answer?.isCorrect ? 'check' : 'close', { size: 18 })),
            h('span', { class: 'pair-list__text' },
              h('span', { lang: entry.lang }, entry.text),
              h('span', { class: 'pair-list__arrow', 'aria-hidden': 'true' }, ' → '),
              h('strong', { lang: target?.lang }, target?.text ?? ''),
              !answer?.isCorrect && answer?.selectedAnswer
                ? h('span', { class: 'pair-list__picked' }, `Twoje połączenie: ${answer.selectedAnswer}`)
                : null)
          );
        })
      )
    ];
  }

  // ---------------------------------------------------------------- wynik

  async #repeatWrong(quiz, wrongTermIDs) {
    const { ctx } = this;
    const { library } = ctx;
    if (this.busy) return;
    const termIDs = wrongTermIDs.filter((id) => library.getTerm(id));
    if (termIDs.length === 0) {
      toast('Błędnie rozwiązanych pojęć nie ma już w bibliotece.');
      return;
    }
    this.busy = true;
    try {
      // Runda par potrzebuje co najmniej dwóch pojęć – jedno pojęcie dostaje pytanie wyboru.
      const type = termIDs.length < 2 ? 'choice' : quiz.config.type;
      const config = {
        ...quiz.config,
        type,
        termIDs,
        count: 0,
        pairsPerRound: ctx.isWide() ? PAIRS_PER_ROUND.wide : PAIRS_PER_ROUND.phone
      };
      const built = buildQuiz(library, config);
      await library.startQuiz(config, built);
      this.review = null;
      this.hintShown = false;
      this.match = null;
      this.itemKey = null;
      this.clockBase = 0;
      this.clockStart = null;
      this.itemStartElapsed = 0;
      this.#resumeClock();
    } catch (error) {
      await showError(error);
    } finally {
      this.busy = false;
      if (!this.disposed) {
        ctx.refresh();
        window.scrollTo(0, 0);
      }
    }
  }

  async #close(target) {
    try {
      await this.ctx.library.closeQuiz();
      if (!this.disposed) this.ctx.navigate(target, { replace: true });
    } catch (error) {
      await showError(error);
    }
  }

  #resultsView(quiz) {
    const { ctx } = this;
    const { library } = ctx;
    const result = quizResult(quiz);
    const thresholdPercent = Math.round(result.threshold * 100);
    const button = (kind, testID, label, handler) => onTap(
      h('button', { type: 'button', class: `button ${kind}`, dataset: { testid: testID } }, label),
      handler
    );
    const stat = (label, value, testID) => h('div', { class: 'quiz-stat' },
      h('dt', { class: 'quiz-stat__label' }, label),
      h('dd', { class: 'quiz-stat__value', dataset: { testid: testID } }, value));

    const wrongList = result.wrong.length === 0 ? null : h('section', { class: 'group quiz-wrong' },
      h('h2', { class: 'group__title' }, 'Do powtórki'),
      h('ul', { class: 'group__list', role: 'list', dataset: { testid: 'quiz-wrong' } },
        result.wrong.map((answer) => {
          const prompt = promptText(library.getTerm(answer.termID), answer.direction);
          return h('li', { class: 'quiz-wrong__item', dataset: { testid: 'quiz-wrong-item' } },
            h('span', { class: 'quiz-wrong__term' },
              prompt ? h('span', null, prompt) : null,
              prompt ? h('span', { class: 'pair-list__arrow', 'aria-hidden': 'true' }, ' → ') : null,
              h('strong', null, answer.correctAnswer)),
            h('span', { class: 'quiz-wrong__given' },
              answer.unanswered || !answer.selectedAnswer
                ? 'Bez odpowiedzi'
                : `Twoja odpowiedź: ${answer.selectedAnswer}`)
          );
        })
      )
    );

    return {
      title: 'Wynik quizu',
      compact: true,
      focus: true,
      back: { href: routes.quiz(), label: 'Quiz' },
      body: h('div', { class: 'quiz-result', dataset: { testid: 'quiz-result', passed: String(result.passed) } },
        h('div', {
          class: `quiz-result__ring ${result.passed ? 'quiz-result__ring--passed' : 'quiz-result__ring--failed'}`,
          style: { '--percent': String(result.percent) },
          role: 'img',
          'aria-label': `Wynik ${result.percent}%, próg zaliczenia ${thresholdPercent}%`
        },
          h('span', { class: 'quiz-result__percent', dataset: { testid: 'quiz-percent' } }, `${result.percent}%`)),
        h('h2', { class: 'quiz-result__verdict', dataset: { testid: 'quiz-verdict' } }, result.passed ? 'Zaliczony' : 'Niezaliczony'),
        h('p', { class: 'quiz-result__note' },
          `Próg zaliczenia: ${thresholdPercent}%.`,
          quiz.timedOut ? ' Koniec czasu – pytania bez odpowiedzi liczą się jako błędne.' : ''),
        h('dl', { class: 'quiz-stats' },
          stat('Poprawne', String(result.correct), 'quiz-correct'),
          stat('Błędne', String(result.incorrect - result.unanswered), 'quiz-incorrect'),
          result.unanswered > 0 ? stat('Bez odpowiedzi', String(result.unanswered), 'quiz-unanswered') : null,
          stat('Czas', formatDuration(quiz.elapsedMs), 'quiz-duration')
        ),
        h('div', { class: 'empty__actions quiz-result__actions' },
          result.wrong.length > 0
            ? button('button--primary', 'quiz-repeat-wrong', `Powtórz błędne odpowiedzi (${result.wrong.length})`,
                () => this.#repeatWrong(quiz, result.wrongTermIDs))
            : null,
          button(result.wrong.length > 0 ? 'button--secondary' : 'button--primary', 'quiz-new', 'Nowy quiz', () => this.#close(routes.quiz())),
          button('button--secondary', 'quiz-done', 'Zakończ', () => this.#close(routes.start())),
          button('button--plain', 'quiz-history-open', 'Historia wyników', () => openQuizHistory(ctx))
        ),
        wrongList
      )
    };
  }

  // ---------------------------------------------------------------- klawiatura

  #handleKey(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = event.target;
    const tag = target?.tagName ?? '';
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    const quiz = this.#quiz();
    if (!quiz) return;

    if (this.review) {
      if ((event.key === 'Enter' || event.key === ' ') && !/^(BUTTON|A)$/.test(tag)) {
        event.preventDefault();
        this.#next();
      }
      return;
    }
    if (quiz.finishedAt) return;
    const item = quiz.items[quiz.position];
    if (item?.kind !== 'choice') return;
    const key = event.key.toLowerCase();
    const index = ['1', '2', '3', '4'].includes(key) ? Number(key) - 1 : ['a', 'b', 'c', 'd'].indexOf(key);
    if (index < 0 || index >= item.options.length) return;
    event.preventDefault();
    this.#choose(index);
  }

  // ---------------------------------------------------------------- widok

  view() {
    const quiz = this.#quiz();
    this.elements = {};

    if (!quiz) {
      return {
        title: 'Quiz',
        back: { href: routes.quiz(), label: 'Quiz' },
        body: emptyState({
          iconName: 'quiz',
          title: 'Nie ma trwającego quizu',
          text: 'Wybierz materiał i rodzaj quizu, a potem go rozpocznij.',
          actions: [h('a', { class: 'button button--primary', href: routes.quiz() }, 'Przygotuj quiz')]
        })
      };
    }

    if (quiz.finishedAt && !this.review) return this.#resultsView(quiz);

    // Bieżące pytanie albo – przy informacji zwrotnej – pytanie, na które właśnie odpowiedziano.
    const item = this.review ? this.review.item : quiz.items[quiz.position];
    const found = this.review ? quiz.items.indexOf(this.review.item) : quiz.position;
    const index = found >= 0 ? found : Math.max(0, quiz.position - 1);
    const number = index + 1;
    const key = `${quiz.id}:${quiz.position}`;
    if (!this.review && key !== this.itemKey) {
      this.itemKey = key;
      this.hintShown = false;
      this.match = null;
      this.itemStartElapsed = this.#elapsed();
      stopSpeaking();
    }

    const limit = this.#limitMs(quiz);
    this.elements.timer = h('span', {
      class: 'quiz-timer',
      role: 'timer',
      'aria-label': limit > 0 ? 'Pozostały czas' : 'Czas quizu',
      dataset: { testid: 'quiz-timer' },
      hidden: Boolean(quiz.finishedAt)
    }, icon('clock', { size: 16 }), h('span', { class: 'quiz-timer__value' }, this.#timerText(quiz)));
    if (limit > 0) this.elements.timer.classList.toggle('quiz-timer--low', limit - this.#elapsed() <= LOW_TIME_MS);

    const answered = quiz.answers.length;
    let content;
    if (item.kind === 'choice') content = this.#choiceView(quiz, item);
    else if (this.review) content = this.#matchingReview(this.review);
    else content = this.#matchingView(item);

    const last = Boolean(quiz.finishedAt) || index >= quiz.items.length - 1;
    const nextButton = this.review
      ? onTap(h('button', {
          type: 'button', class: 'button button--primary quiz__next', dataset: { testid: 'quiz-next' }
        }, last ? 'Zobacz wynik' : 'Dalej'), () => this.#next())
      : null;

    const body = h('div', { class: 'quiz', dataset: { testid: 'quiz-session', kind: item.kind } },
      h('div', { class: 'study__header' },
        h('div', { class: 'study__meta' },
          h('span', { class: 'study__lesson' }, item.kind === 'choice' ? 'Jednokrotny wybór' : 'Łączenie par'),
          h('span', { class: 'quiz__meta-end' },
            this.elements.timer,
            h('span', { class: 'study__counter', dataset: { testid: 'quiz-counter' } }, `${number} z ${quiz.items.length}`))
        ),
        h('div', {
          class: 'study__progress', role: 'progressbar', 'aria-label': 'Postęp quizu',
          'aria-valuemin': '0', 'aria-valuemax': String(quiz.total), 'aria-valuenow': String(answered)
        }, h('span', { class: 'study__progress-fill', style: { width: `${Math.round((answered / quiz.total) * 100)}%` } }))
      ),
      content,
      nextButton ? h('div', { class: 'quiz__footer' }, nextButton) : null
    );

    return {
      title: 'Quiz',
      compact: true,
      focus: true,
      back: { href: routes.quiz(), label: 'Quiz' },
      actions: quiz.finishedAt ? [] : [navButton('Zakończ', () => this.#finishEarly())],
      body
    };
  }
}

