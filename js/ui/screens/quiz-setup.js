// Konfiguracja quizu: materiał, rodzaj, kierunek, liczba pytań, proporcje, limit czasu, próg.
// Pod spodem – ostatnie wyniki.

import { DIRECTIONS } from '../../core/model.js';
import {
  CHOICE_SHARES, DEFAULT_CHOICE_SHARE, DEFAULT_PASS_THRESHOLD, PAIRS_PER_ROUND, PASS_THRESHOLDS, QUIZ_COUNTS,
  QUIZ_TIME_LIMITS, QUIZ_TYPES, buildQuiz, quizTerms
} from '../../core/quiz.js';
import { MIXED, STUDY_DIRECTIONS } from '../../core/study.js';
import { plural } from '../../core/text.js';
import { actionRow, emptyState, field, formGroup, group, segmented, selectInput, settingsAction } from '../components.js';
import { showError, toast } from '../dialogs.js';
import { h } from '../dom.js';
import { initialSelection, lessonsGroup, materialGroup, sanitizeSelection, selectionConfig } from '../material.js';
import { routes } from '../router.js';
import { historyList, openQuizHistory } from './quiz-history.js';

const TYPE_LABELS = { choice: 'Wybór', matching: 'Pary', mixed: 'Mieszany' };
const TYPE_HINTS = {
  choice: 'Pojęcie i do czterech odpowiedzi, jedna poprawna.',
  matching: 'Łączenie pojęć w pary: dotknij pojęcia, a potem jego tłumaczenia.',
  mixed: 'Pytania wyboru i rundy łączenia par; każda para to osobna odpowiedź.'
};

const known = (list, value, fallback) => (list.some((item) => (item.id ?? item) === value) ? value : fallback);

/** Pytania quizu po polsku: „1 pytanie”, „2 pytania”, „5 pytań”. */
const pluralQuestions = (count) => plural(count, 'pytanie', 'pytania', 'pytań');
const pluralPairs = (count) => plural(count, 'para', 'pary', 'par');

export class QuizSetupScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    const { library } = ctx;
    const settings = library.getSettings();
    this.selection = initialSelection(library, settings.quizSelection, route.preset);
    this.type = known(QUIZ_TYPES, settings.quizType, 'choice');
    this.direction = known(STUDY_DIRECTIONS, settings.quizDirection, DIRECTIONS.PL_EN);
    this.count = known(QUIZ_COUNTS, settings.preferredQuizLength, 10);
    this.share = known(CHOICE_SHARES, settings.quizChoiceShare, DEFAULT_CHOICE_SHARE);
    this.timeLimit = known(QUIZ_TIME_LIMITS, settings.quizTimeLimit, 0);
    this.threshold = known(PASS_THRESHOLDS, settings.quizPassThreshold, DEFAULT_PASS_THRESHOLD);
    this.starting = false;
    this.disposed = false;
    this.history = null;

    // Quiz zakończony, ale z niezamkniętym ekranem wyników – wynik jest już w historii.
    const quiz = library.getQuiz();
    if (quiz?.finishedAt) library.closeQuiz().catch((error) => console.error(error));
    this.#loadHistory();
  }

  dispose() {
    this.disposed = true;
  }

  async #loadHistory() {
    try {
      this.history = await this.ctx.library.quizHistory(5);
    } catch (error) {
      console.error(error);
      this.history = [];
    }
    if (!this.disposed) this.ctx.refresh();
  }

  #config() {
    return {
      ...selectionConfig(this.selection),
      type: this.type,
      direction: this.direction,
      count: this.count,
      choiceShare: this.share,
      timeLimit: this.timeLimit,
      threshold: this.threshold,
      pairsPerRound: this.ctx.isWide() ? PAIRS_PER_ROUND.wide : PAIRS_PER_ROUND.phone
    };
  }

  async #start() {
    const { ctx } = this;
    const { library } = ctx;
    if (this.starting) return;
    this.starting = true;
    try {
      const config = this.#config();
      const built = buildQuiz(library, config);
      await library.updateSettings({
        quizType: this.type,
        quizDirection: this.direction,
        preferredQuizLength: this.count,
        quizChoiceShare: this.share,
        quizTimeLimit: this.timeLimit,
        quizPassThreshold: this.threshold,
        quizSelection: selectionConfig(this.selection)
      });
      await library.startQuiz(config, built);
      ctx.navigate(routes.quizSession());
    } catch (error) {
      await showError(error);
    } finally {
      this.starting = false;
    }
  }

  #activeGroup(quiz) {
    const { ctx } = this;
    return group({
      title: 'Niedokończony quiz',
      footer: 'Udzielone odpowiedzi są zapisane. Nowy quiz zamknie poprzedni i zapisze jego wynik.'
    },
      actionRow({
        label: `Wznów quiz (pytanie ${Math.min(quiz.position + 1, quiz.items.length)} z ${quiz.items.length})`,
        iconName: 'quiz',
        testID: 'quiz-resume',
        onClick: () => ctx.navigate(routes.quizSession())
      }),
      actionRow({
        label: 'Zakończ ten quiz',
        iconName: 'close',
        testID: 'quiz-discard',
        onClick: async () => {
          try {
            await ctx.library.closeQuiz();
            toast('Quiz zakończony.');
            this.#loadHistory();
          } catch (error) {
            await showError(error);
          }
        }
      })
    );
  }

  #choiceGroup(title, name, value, options, onChange, footer = null) {
    return h('section', { class: 'group' },
      h('h2', { class: 'form-group__title' }, title),
      segmented({ name, label: title, value, options, onChange }),
      footer ? h('p', { class: 'group__footer' }, footer) : null
    );
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;

    if (library.summary().terms === 0) {
      return {
        title: 'Quiz',
        actions: [settingsAction()],
        body: emptyState({
          iconName: 'quiz',
          title: 'Najpierw dodaj pojęcia',
          text: 'Quiz powstaje z pojęć w Bibliotece. Dodaj je ręcznie, zaimportuj z pliku albo wczytaj dane przykładowe na ekranie Start.',
          actions: [h('a', { class: 'button button--primary', href: routes.domains() }, 'Otwórz Bibliotekę')]
        })
      };
    }

    sanitizeSelection(library, this.selection);
    const config = this.#config();
    const available = quizTerms(library, config).length;
    const planned = config.count > 0 ? Math.min(config.count, available) : available;
    const quiz = library.getQuiz();
    const active = quiz && !quiz.finishedAt ? quiz : null;
    const enough = available >= 2;

    const startButton = h('button', {
      type: 'button',
      class: 'button button--primary',
      disabled: !enough,
      dataset: { testid: 'quiz-start' },
      onClick: () => this.#start()
    }, 'Rozpocznij quiz');

    const directionHint = this.direction === MIXED
      ? 'Każde pytanie i każda runda dostaje losowo jeden z kierunków.'
      : (this.direction === DIRECTIONS.PL_EN ? 'Pytanie po polsku, odpowiedzi po angielsku.' : 'Pytanie po angielsku, odpowiedzi po polsku.');

    return {
      title: 'Quiz',
      actions: [settingsAction()],
      body: [
        active ? this.#activeGroup(active) : null,
        materialGroup(ctx, this.selection, 'quiz'),
        lessonsGroup(ctx, this.selection, 'quiz'),
        this.#choiceGroup('Rodzaj quizu', 'quiz-type', this.type,
          QUIZ_TYPES.map((type) => ({ value: type.id, label: TYPE_LABELS[type.id] })),
          (value) => { this.type = value; ctx.refresh(); }, TYPE_HINTS[this.type]),
        this.#choiceGroup('Kierunek', 'quiz-direction', this.direction,
          STUDY_DIRECTIONS.map((item) => ({ value: item.id, label: item.label })),
          (value) => { this.direction = value; ctx.refresh(); }, directionHint),
        this.#choiceGroup(this.type === 'matching' ? 'Liczba par' : 'Liczba pytań', 'quiz-count', String(this.count),
          QUIZ_COUNTS.map((value) => ({ value: String(value), label: value === 0 ? 'Wszystkie' : String(value) })),
          (value) => { this.count = Number(value); ctx.refresh(); },
          this.type === 'choice' ? null : `Runda łączenia ma do ${config.pairsPerRound} par.`),
        formGroup('Ustawienia',
          this.type === 'mixed' ? field('Proporcje testu mieszanego', selectInput({
            value: String(this.share),
            testID: 'quiz-share',
            options: CHOICE_SHARES.map((share) => ({
              value: String(share),
              label: `${Math.round(share * 100)}% wybór, ${Math.round((1 - share) * 100)}% pary`
            })),
            onChange: (value) => { this.share = Number(value); ctx.refresh(); }
          })) : null,
          field('Limit czasu', selectInput({
            value: String(this.timeLimit),
            testID: 'quiz-time-limit',
            options: QUIZ_TIME_LIMITS.map((seconds) => ({ value: String(seconds), label: seconds === 0 ? 'Bez limitu' : `${seconds / 60} min` })),
            onChange: (value) => { this.timeLimit = Number(value); ctx.refresh(); }
          })),
          field('Próg zaliczenia', selectInput({
            value: String(this.threshold),
            testID: 'quiz-threshold',
            options: PASS_THRESHOLDS.map((value) => ({ value: String(value), label: `${Math.round(value * 100)}%` })),
            onChange: (value) => { this.threshold = Number(value); ctx.refresh(); }
          }))
        ),
        h('p', { class: 'form-note' }, 'Quiz nie zmienia terminów powtórek fiszek. Błędne odpowiedzi trafiają do zakresu „Błędy z quizów” w zakładce Nauka.'),
        this.history === null ? null : group({ title: 'Ostatnie wyniki', className: 'quiz-history' },
          this.history.length === 0
            ? h('li', { class: 'row row--static' }, h('span', { class: 'row__main' }, h('span', { class: 'row__subtitle' }, 'Nie było jeszcze żadnego quizu.')))
            : [
                ...historyList(this.history),
                actionRow({ label: 'Cała historia wyników', iconName: 'clock', testID: 'quiz-history-all', onClick: () => openQuizHistory(ctx) })
              ]
        )
      ],
      bottomBar: h('div', { class: 'bottombar__inner' },
        h('span', { class: 'bottombar__note', role: 'status', dataset: { testid: 'quiz-planned' } },
          // „z N pojęć” – po „z” zawsze dopełniacz, a przycisk jest aktywny od dwóch pojęć.
          enough
            ? `${this.type === 'matching' ? pluralPairs(planned) : pluralQuestions(planned)} z ${available} pojęć`
            : 'Za mało pojęć – potrzebne są co najmniej dwa'),
        startButton
      )
    };
  }
}
