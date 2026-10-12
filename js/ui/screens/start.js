// Ekran Start: podsumowanie biblioteki i najkrótsza droga do dodania materiałów.

import { sampleTermCount } from '../../core/samples.js';
import { BOTH, formatStudyTime, overview, percent } from '../../core/stats.js';
import { formatInterval, isSessionFinished, reviewForecast } from '../../core/study.js';
import { pluralCards, pluralLessons, pluralModules, pluralTerms } from '../../core/text.js';
import {
  loadSampleData, openDomainForm, openLessonForm, openTermForm, startTodaysReview, todaysReviewQueue
} from '../actions.js';
import { actionRow, domainBadge, emptyState, group, primaryButton, settingsAction } from '../components.js';
import { showError } from '../dialogs.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';
import { JournalsLoader, kpiTile, statsDirection } from './stats.js';

/** Zdanie podsumowujące bibliotekę, np. „Masz 40 pojęć w 13 lekcjach.” */
export function summarySentence(summary) {
  if (summary.terms === 0) {
    if (summary.lessons === 0) return 'Biblioteka nie ma jeszcze lekcji ani pojęć.';
    // Biernik: „masz 1 lekcję”; pozostałe formy są takie same jak w mianowniku.
    return `Masz ${summary.lessons === 1 ? '1 lekcję' : pluralLessons(summary.lessons)}, ale jeszcze żadnego pojęcia.`;
  }
  const lessons = summary.lessons === 1 ? '1 lekcji' : `${summary.lessons} lekcjach`;
  return `Masz ${pluralTerms(summary.terms)} w ${lessons}.`;
}

function domainTile(library, domain) {
  const counts = library.counts('domain', domain.id);
  return h('li', { class: 'tile' },
    h('a', { class: 'tile__link', href: routes.domain(domain.id) },
      domainBadge(domain, { large: true }),
      h('span', { class: 'tile__name' }, domain.name),
      h('span', { class: 'tile__meta' }, `${pluralModules(counts.modules)}, ${pluralTerms(counts.terms)}`)
    )
  );
}

export class StartScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.starting = false;
    this.journals = new JournalsLoader(ctx);
  }

  dispose() {
    this.journals.dispose();
  }

  /** Najważniejsze wskaźniki (w kierunku wybranym w Statystykach) z przejściem do Statystyk. */
  #progress() {
    const { library } = this.ctx;
    const direction = statsDirection(library.getSettings());
    const data = overview(library, { level: 'library' }, direction, this.journals.get());
    const quiz = data.quiz;
    const directionLabel = direction === BOTH ? 'oba kierunki' : direction === 'en_pl' ? 'EN\u00a0→\u00a0PL' : 'PL\u00a0→\u00a0EN';
    return h('section', { class: 'group' },
      h('div', { class: 'stats-section__header' },
        h('h2', { class: 'group__title' }, 'Postępy'),
        h('a', { class: 'button button--plain', href: routes.stats(), dataset: { testid: 'start-stats' } }, 'Statystyki')),
      h('div', { class: 'start-stats' },
        kpiTile('Opanowane', `${percent(data.statuses.mastered, data.statuses.total) ?? 0}%`, {
          sub: `${data.statuses.mastered} z ${data.statuses.total}, ${directionLabel}`, testID: 'start-kpi-mastered', href: routes.stats()
        }),
        kpiTile('Quizy', !quiz ? '…' : quiz.total === 0 ? '–' : `${percent(quiz.correct, quiz.total)}%`, {
          sub: !quiz ? null : quiz.total === 0 ? 'bez odpowiedzi' : 'poprawnych odpowiedzi', testID: 'start-kpi-quiz', href: routes.stats()
        }),
        kpiTile('Czas nauki', data.recentTime ? formatStudyTime(data.recentTime.total) : '…', {
          sub: 'ostatnie 7 dni', testID: 'start-kpi-time', href: routes.stats()
        })
      )
    );
  }

  /** Powtórka ostatniej sesji jednym dotknięciem: te same fiszki i ustawienia. */
  async #repeatLast() {
    const { ctx } = this;
    if (this.starting) return;
    this.starting = true;
    try {
      await ctx.library.repeatStudy();
      ctx.navigate(routes.studySession());
    } catch (error) {
      await showError(error);
    } finally {
      this.starting = false;
    }
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const actions = [settingsAction()];

    if (library.isEmpty()) {
      return {
        title: 'Start',
        actions,
        body: emptyState({
          iconName: 'cards',
          title: 'Zacznij od pierwszej dziedziny',
          text: `Dziedzina to temat, którego się uczysz, na przykład „Business English”. Możesz też wczytać ${sampleTermCount()} przykładowych pojęć i od razu zobaczyć, jak działa aplikacja.`,
          actions: [
            primaryButton('Dodaj dziedzinę', () => openDomainForm(ctx), { testID: 'start-add-domain' }),
            primaryButton('Importuj z pliku XLSX lub CSV', () => ctx.navigate(routes.importFile()), { testID: 'start-import', kind: 'secondary' }),
            primaryButton('Wczytaj przykładowe dane', () => loadSampleData(ctx), { testID: 'start-load-samples', kind: 'secondary' })
          ]
        })
      };
    }

    const summary = library.summary();
    const domains = library.listDomains();
    const session = library.getStudySession();
    const resumable = session && !isSessionFinished(session);
    const repeatable = !resumable && summary.terms > 0 ? library.getRepeatableStudy() : null;
    const quiz = library.getQuiz();
    const quizOpen = quiz && !quiz.finishedAt ? quiz : null;
    // Powtórka na dziś (FSRS) ma pierwszeństwo przed nową nauką, gdy coś czeka.
    const reviewCount = resumable ? 0 : todaysReviewQueue(library).length;
    const forecast = resumable || reviewCount > 0 ? null : reviewForecast(library);
    const reviewNote = forecast?.next
      ? (forecast.laterToday > 0
          ? `Na teraz nic do powtórki. Dziś jeszcze: ${pluralCards(forecast.laterToday)}, najbliższa za ${formatInterval(forecast.next - Date.now())}.`
          : `Na teraz nic do powtórki. Najbliższa powtórka za ${formatInterval(forecast.next - Date.now())}${forecast.tomorrow > 0 ? `, jutro: ${pluralCards(forecast.tomorrow)}` : ''}.`)
      : null;

    return {
      title: 'Start',
      subtitle: summarySentence(summary),
      actions,
      body: [
        summary.terms > 0 ? h('div', { class: 'start-study' },
          reviewCount > 0 ? h('button', {
            type: 'button',
            class: 'button button--primary button--block',
            dataset: { testid: 'start-review' },
            onClick: () => startTodaysReview(ctx)
          }, `Powtórka na dziś (${pluralCards(reviewCount)})`) : null,
          h('a', {
            class: `button ${reviewCount > 0 ? 'button--secondary' : 'button--primary'} button--block`,
            href: resumable ? routes.studySession() : routes.study(),
            dataset: { testid: 'start-study' }
          }, resumable
            ? `Wznów naukę (fiszka ${session.position + 1} z ${session.queue.length})`
            : 'Rozpocznij naukę'),
          repeatable ? h('button', {
            type: 'button',
            class: 'button button--secondary button--block',
            dataset: { testid: 'start-repeat-last' },
            onClick: () => this.#repeatLast()
          }, `Powtórz ostatnią sesję (${pluralCards(repeatable.queue.length)})`) : null,
          quizOpen ? h('a', {
            class: 'button button--secondary button--block',
            href: routes.quizSession(),
            dataset: { testid: 'start-quiz-resume' }
          }, `Wznów quiz (pytanie ${Math.min(quizOpen.position + 1, quizOpen.items.length)} z ${quizOpen.items.length})`) : null,
          reviewNote ? h('p', { class: 'start-study__note', dataset: { testid: 'start-review-note' } }, reviewNote) : null
        ) : null,
        summary.terms > 0 ? this.#progress() : null,
        h('section', { class: 'group' },
          h('h2', { class: 'group__title' }, 'Twoje dziedziny'),
          h('ul', { class: 'tiles', role: 'list' }, domains.map((domain) => domainTile(library, domain)))
        ),
        group({ title: 'Dodaj materiały' },
          actionRow({ label: 'Nowe pojęcie', iconName: 'plus', onClick: () => openTermForm(ctx), testID: 'start-add-term' }),
          actionRow({ label: 'Nowa lekcja', iconName: 'book', onClick: () => openLessonForm(ctx) }),
          actionRow({ label: 'Nowa dziedzina', iconName: 'folder', onClick: () => openDomainForm(ctx) }),
          actionRow({ label: 'Importuj z pliku XLSX lub CSV', iconName: 'upload', onClick: () => ctx.navigate(routes.importFile()), testID: 'start-import' })
        ),
        group({
          title: 'Szukaj',
          footer: summary.favorites > 0 ? `Ulubione: ${pluralTerms(summary.favorites)}.` : null
        },
          h('li', { class: 'row' },
            h('a', { class: 'row__main', href: routes.glossary() },
              h('span', { class: 'row__leading row__leading--icon' }, icon('search')),
              h('span', { class: 'row__text' },
                h('span', { class: 'row__title' }, 'Glosariusz'),
                h('span', { class: 'row__subtitle' }, 'Wszystkie pojęcia w jednym miejscu')
              ),
              h('span', { class: 'row__chevron' }, icon('chevronRight', { size: 18 }))
            )
          )
        ),
        h('p', { class: 'note' },
          icon('info', { size: 18 }),
          h('span', null,
            'Dane są zapisane tylko w tej przeglądarce na tym urządzeniu. ',
            h('a', { href: routes.settings() }, 'Zapisz kopię zapasową'),
            ', żeby ich nie stracić albo przenieść je na inne urządzenie.'
          )
        )
      ]
    };
  }
}
