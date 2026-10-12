// Historia wyników quizów: krótka lista na ekranie Quiz i arkusz z całą historią.

import { QUIZ_TYPE_NAMES, formatDuration } from '../../core/quiz.js';
import { message } from '../components.js';
import { openFormSheet } from '../dialogs.js';
import { h, replaceChildren } from '../dom.js';

const HISTORY_LIMIT = 200;

function formatDate(iso) {
  return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function outcome(session) {
  const verdict = session.passed ? 'Zaliczony' : 'Niezaliczony';
  if (session.timedOut) return `${verdict} – koniec czasu`;
  if (!session.finished) return `${verdict} – przerwany`;
  return verdict;
}

/** Wiersze historii (od najnowszego wyniku). */
export function historyList(sessions) {
  return sessions.map((session) => h('li', {
    class: `history__entry quiz-history__entry${session.passed ? ' quiz-history__entry--passed' : ''}`,
    dataset: { testid: 'quiz-history-entry' }
  },
    h('span', { class: 'history__score quiz-history__score' }, `${session.percent}%`),
    h('span', { class: 'row__text' },
      h('span', { class: 'row__title' }, outcome(session)),
      h('span', { class: 'row__subtitle' },
        [
          `${QUIZ_TYPE_NAMES[session.quizType] ?? 'Quiz'}${session.repeatOfWrong ? ' (powtórka błędnych)' : ''}`,
          `${session.correctAnswers} z ${session.totalQuestions} poprawnie`,
          `czas ${formatDuration(session.duration)}`
        ].join(', ')),
      h('span', { class: 'row__subtitle' }, formatDate(session.completedAt))
    )
  ));
}

/** Arkusz z całą historią wyników quizów. */
export function openQuizHistory(ctx) {
  const list = h('div', { class: 'history', dataset: { testid: 'quiz-history' } }, h('p', { class: 'picker__empty' }, 'Wczytywanie…'));
  const sheet = openFormSheet({
    title: 'Wyniki quizów',
    submitLabel: '',
    cancelLabel: 'Zamknij',
    build(api) {
      api.setCanSubmit(false);
      return list;
    },
    onSubmit: () => false
  });
  sheet.dialog.classList.add('sheet--picker');

  ctx.library.quizHistory(HISTORY_LIMIT).then((sessions) => {
    if (sessions.length === 0) {
      replaceChildren(list, h('p', { class: 'picker__empty' }, 'Nie było jeszcze żadnego quizu.'));
      return;
    }
    replaceChildren(list, h('ul', { class: 'group__list', role: 'list' }, historyList(sessions)));
  }).catch((error) => {
    replaceChildren(list, message(error?.message ?? String(error), 'error'));
  });
  return sheet;
}
