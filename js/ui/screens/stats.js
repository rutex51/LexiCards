// Statystyki: wskaźniki, znajomość elementów, wykresy w czasie i opanowanie według
// dziedzin, modułów i lekcji. Ten sam ekran pokazuje całą bibliotekę albo jedną dziedzinę,
// moduł lub lekcję (przejście w dół z zestawienia).

import { DIRECTIONS } from '../../core/model.js';
import {
  BOTH, STATS_DIRECTIONS, STATS_RANGES, STATUS_LABELS, STATUS_ORDER, breakdown, breakdownLevels, dailySeries,
  formatStudyTime, overview, percent, scopeTerms, statsDirection
} from '../../core/stats.js';
import { pluralTerms } from '../../core/text.js';
import { legend, meter, shareBar, timeChart } from '../charts.js';
import { emptyState, segmented, settingsAction } from '../components.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';
import { missingView } from './library.js';

/** Nazwy kierunków ze spacjami niełamiącymi – „PL → EN” nie rozdziela się między wiersze. */
const DIRECTION_SHORT = { [DIRECTIONS.PL_EN]: 'PL\u00a0→\u00a0EN', [DIRECTIONS.EN_PL]: 'EN\u00a0→\u00a0PL' };
const LEVEL_GENITIVE = { domain: 'dziedziny', module: 'modułu', lesson: 'lekcji' };
const LEVEL_PLURAL = { domain: 'Dziedziny', module: 'Moduły', lesson: 'Lekcje' };
const ELEMENTS = [
  { id: 'term', label: 'Pojęcie (tłumaczenie)' },
  { id: 'description', label: 'Definicja' },
  { id: 'example', label: 'Przykład' }
];
/** Odcień statusu na wykresach – stopnie jednej skali (opanowane najmocniej). */
const STATUS_TONE = { mastered: 'mastered', partiallyMastered: 'partial', inProgress: 'progress', toLearn: 'learn', new: 'new' };
const BOTH_NOTE = 'Oba kierunki: pojęcie jest opanowane, gdy jest opanowane w obu kierunkach (liczy się słabszy wynik), '
  + 'i jest do powtórki, gdy czeka w którymkolwiek. Powtórki, quizy i czas obejmują oba kierunki razem.';

/** Kierunek statystyk – zob. core/stats.js (tu dla ekranów, które importują go z tego modułu). */
export { statsDirection };

const directionLabel = (direction) => STATS_DIRECTIONS.find((item) => item.id === direction)?.label ?? '';

/**
 * Dzienniki nauki dla ekranu: wczytywane w tle, ekran odświeża się po ich nadejściu.
 * Do czasu nowego odczytu zostają poprzednie dane (bez migania pustych wykresów).
 */
export class JournalsLoader {
  constructor(ctx) {
    this.ctx = ctx;
    this.revision = null;
    this.data = null;
    this.failed = false;
    this.disposed = false;
  }

  get() {
    const { library } = this.ctx;
    if (this.revision !== library.journalRevision) {
      const revision = library.journalRevision;
      this.revision = revision;
      library.journals().then((data) => {
        if (this.disposed || this.revision !== revision) return;
        this.data = data;
        this.failed = false;
        this.ctx.refresh();
      }, (error) => {
        console.error(error);
        if (this.disposed) return;
        this.failed = true;
        this.ctx.refresh();
      });
    }
    return this.data;
  }

  dispose() {
    this.disposed = true;
  }
}

/** Kafelek wskaźnika: nazwa, wartość, opcjonalny dopisek. */
export function kpiTile(label, value, { sub = null, testID = null, href = null } = {}) {
  const content = [
    h('span', { class: 'kpi__label' }, label),
    h('span', { class: 'kpi__value', dataset: { testid: testID } }, value),
    sub ? h('span', { class: 'kpi__sub' }, sub) : null
  ];
  return href
    ? h('a', { class: 'kpi kpi--link', href }, content)
    : h('div', { class: 'kpi' }, content);
}

function dayPoints(points) {
  return points.map((point) => {
    const date = new Date(point.start);
    return {
      key: point.key,
      short: date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
      long: date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
    };
  });
}

export class StatsScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    this.scope = route.scope ?? { level: 'library' };
    const settings = ctx.library.getSettings();
    this.direction = statsDirection(settings);
    this.range = STATS_RANGES.includes(settings.statsRange) ? settings.statsRange : 30;
    const levels = breakdownLevels(this.scope);
    this.level = levels.includes(settings.statsLevel) ? settings.statsLevel : levels[0] ?? null;
    this.journals = new JournalsLoader(ctx);
    this.seriesCache = null;
  }

  dispose() {
    this.journals.dispose();
  }

  #remember(patch) {
    this.ctx.library.updateSettings(patch).catch((error) => console.error(error));
  }

  #scopeItem() {
    const { library } = this.ctx;
    const { level, id } = this.scope;
    if (level === 'domain') return library.getDomain(id);
    if (level === 'module') return library.getModule(id);
    if (level === 'lesson') return library.getLesson(id);
    return null;
  }

  /** Zakres nadrzędny – dokąd prowadzi „wstecz”. */
  #parent(item) {
    const { library } = this.ctx;
    if (this.scope.level === 'lesson') {
      const module = library.getModule(item.moduleID);
      return module ? { scope: { level: 'module', id: module.id }, name: module.name } : null;
    }
    if (this.scope.level === 'module') {
      const domain = library.getDomain(item.domainID);
      return domain ? { scope: { level: 'domain', id: domain.id }, name: domain.name } : null;
    }
    return { scope: { level: 'library' }, name: 'Statystyki' };
  }

  // ---------------------------------------------------------------- sekcje

  #directionControl() {
    return h('section', { class: 'stats-filters' },
      segmented({
        name: 'stats-direction',
        label: 'Kierunek',
        value: this.direction,
        options: STATS_DIRECTIONS.map((item) => ({ value: item.id, label: item.label })),
        onChange: (value) => {
          this.direction = value;
          this.seriesCache = null;
          this.#remember({ statsDirection: value });
          this.ctx.refresh();
        }
      }),
      this.direction === BOTH ? h('p', { class: 'group__footer', dataset: { testid: 'stats-both-note' } }, BOTH_NOTE) : null
    );
  }

  #hero(data) {
    const { statuses } = data;
    const share = percent(statuses.mastered, statuses.total) ?? 0;
    const parts = STATUS_ORDER.map((status) => ({ id: status, value: statuses[status], tone: STATUS_TONE[status], name: STATUS_LABELS[status] }));
    return h('section', { class: 'card stats-hero', dataset: { testid: 'stats-hero' } },
      h('h2', { class: 'card__title' }, 'Opanowane pojęcia'),
      h('p', { class: 'stats-hero__figure' },
        h('span', { class: 'stats-hero__value', dataset: { testid: 'stats-mastered-percent' } }, `${share}%`),
        h('span', { class: 'stats-hero__caption', dataset: { testid: 'stats-mastered' } },
          `${statuses.mastered} z ${statuses.total} ${this.direction === BOTH ? 'w obu kierunkach' : `w kierunku ${DIRECTION_SHORT[this.direction]}`}`)),
      shareBar(parts, { className: 'stats-hero__bar' }),
      h('ul', { class: 'status-counts', role: 'list' },
        parts.map((part) => h('li', { class: 'status-counts__item' },
          h('span', { class: `chart__key chart__key--box viz-${part.tone}`, 'aria-hidden': 'true' }),
          h('span', { class: 'status-counts__name' }, part.name),
          h('strong', { dataset: { testid: `stats-status-${part.id}` } }, String(part.value))
        ))
      )
    );
  }

  #kpis(data) {
    const loading = this.journals.failed ? 'brak' : '…';
    const quiz = data.quiz;
    const quizValue = !quiz ? loading : quiz.total === 0 ? '–' : `${percent(quiz.correct, quiz.total)}%`;
    const quizSub = !quiz ? null : quiz.total === 0 ? 'Jeszcze bez odpowiedzi' : `${quiz.correct} z ${quiz.total} odpowiedzi poprawnie`;
    return h('section', { class: 'kpi-grid', 'aria-label': 'Wskaźniki' },
      kpiTile('Wszystkie pojęcia', String(data.terms), { testID: 'kpi-terms' }),
      kpiTile('Do powtórki', String(data.due), { testID: 'kpi-due', sub: data.due > 0 ? 'termin już minął' : 'nic nie czeka' }),
      kpiTile('Skuteczność quizów', quizValue, { testID: 'kpi-quiz', sub: quizSub }),
      kpiTile('Czas nauki', data.time ? formatStudyTime(data.time.total) : loading, {
        testID: 'kpi-time',
        sub: data.recentTime ? `ostatnie 7 dni: ${formatStudyTime(data.recentTime.total)}` : null
      })
    );
  }

  /** Znajomość pojęć, definicji i przykładów – zawsze osobno dla każdego kierunku. */
  #elements(data) {
    const directions = Object.keys(data.elements);
    const assessed = directions.some((direction) => data.elements[direction].assessed > 0);
    return h('section', { class: 'card stats-elements', dataset: { testid: 'stats-elements' } },
      h('h2', { class: 'card__title' }, 'Znajomość elementów'),
      h('p', { class: 'chart__note' }, 'Ostatnia ocena każdego elementu. Liczą się ocenione pojęcia, które mają dany element.'),
      directions.length > 1 ? legend(directions.map((direction) => ({ name: DIRECTION_SHORT[direction], tone: `dir-${direction}`, kind: 'swatch' }))) : null,
      !assessed
        ? h('p', { class: 'chart__empty' }, 'W tym kierunku nic jeszcze nie oceniono.')
        : h('div', { class: 'element-rows' }, ELEMENTS.map((element) => h('div', { class: 'element-row' },
            h('span', { class: 'element-row__label' }, element.label),
            h('div', { class: 'element-row__meters' }, directions.map((direction) => {
              const { known, total } = data.elements[direction][element.id];
              const value = percent(known, total);
              return h('div', { class: `element-meter${directions.length > 1 ? ' element-meter--both' : ''}`, dataset: { testid: `element-${element.id}-${direction}` } },
                directions.length > 1 ? h('span', { class: 'element-meter__direction' }, DIRECTION_SHORT[direction]) : null,
                meter(value, { tone: `dir-${direction}`, label: `${element.label}, ${DIRECTION_SHORT[direction]}` }),
                h('span', { class: 'element-meter__value' }, value === null ? '–' : `${value}%`),
                h('span', { class: 'element-meter__count' }, total === 0 ? 'brak ocen' : `${known} z ${total}`)
              );
            }))
          )))
    );
  }

  #series(journals) {
    const key = `${this.ctx.library.journalRevision}:${this.ctx.library.revision}:${this.direction}:${this.range}:${this.scope.level}:${this.scope.id ?? ''}`;
    if (this.seriesCache?.key === key) return this.seriesCache.points;
    const points = dailySeries(journals, scopeTerms(this.ctx.library, this.scope), this.direction, { days: this.range });
    this.seriesCache = { key, points };
    return points;
  }

  #timeSection(journals) {
    const directions = this.direction === BOTH ? [DIRECTIONS.PL_EN, DIRECTIONS.EN_PL] : [this.direction];
    const header = h('div', { class: 'stats-section__header' },
      h('h2', { class: 'group__title' }, 'W czasie'),
      segmented({
        name: 'stats-range',
        label: 'Okres',
        value: String(this.range),
        options: STATS_RANGES.map((days) => ({ value: String(days), label: `${days} dni` })),
        onChange: (value) => {
          this.range = Number(value);
          this.#remember({ statsRange: this.range });
          this.ctx.refresh();
        }
      })
    );
    if (!journals) {
      return h('section', { class: 'stats-section' }, header,
        h('div', { class: 'card stats-loading' }, h('p', { class: 'chart__empty' }, this.journals.failed ? 'Nie udało się wczytać historii nauki.' : 'Wczytywanie historii…')));
    }
    const points = this.#series(journals);
    const days = dayPoints(points);
    const progress = timeChart({
      title: 'Postęp nauki',
      note: this.direction === BOTH
        ? 'Stan na koniec dnia; liczą się pojęcia ocenione i opanowane w obu kierunkach.'
        : 'Stan na koniec dnia.',
      testID: 'chart-progress',
      points: days,
      series: [
        { id: 'mastered', name: 'Opanowane', tone: 'mastered', kind: 'line', area: true, values: points.map((point) => point.statuses.mastered) },
        { id: 'assessed', name: 'Ocenione', tone: 'context', kind: 'line', values: points.map((point) => point.assessed) }
      ],
      empty: this.direction === BOTH
        ? 'Żadne pojęcie nie jest jeszcze ocenione w obu kierunkach.'
        : 'W tym okresie nie oceniono jeszcze żadnej fiszki.'
    });
    const reviews = timeChart({
      title: 'Powtórki fiszek dziennie',
      testID: 'chart-reviews',
      points: days,
      stacked: true,
      series: directions.map((direction) => ({
        id: direction, name: DIRECTION_SHORT[direction], tone: `dir-${direction}`, kind: 'column',
        values: points.map((point) => point.reviews[direction])
      })),
      empty: 'W tym okresie nie było powtórek.'
    });
    const quiz = timeChart({
      title: 'Skuteczność quizów',
      note: 'Odsetek poprawnych odpowiedzi w dniach z quizem.',
      testID: 'chart-quiz',
      points: days,
      yMax: 100,
      format: (value) => `${value}%`,
      series: directions.map((direction) => ({
        id: direction, name: DIRECTION_SHORT[direction], tone: `dir-${direction}`, kind: 'line', dots: true,
        values: points.map((point) => {
          const { correct, total } = point.quiz[direction];
          return total > 0 ? Math.round((correct / total) * 100) : null;
        })
      })),
      empty: 'W tym okresie nie było quizów.'
    });
    return h('section', { class: 'stats-section' }, header,
      h('div', { class: 'stats-charts' },
        h('div', { class: 'card' }, progress),
        h('div', { class: 'card' }, reviews),
        h('div', { class: 'card' }, quiz)
      )
    );
  }

  /** Opanowanie według dziedzin, modułów albo lekcji; wiersz prowadzi do statystyk elementu. */
  #breakdown() {
    const levels = breakdownLevels(this.scope);
    if (levels.length === 0) return null;
    const rows = breakdown(this.ctx.library, this.scope, this.level, this.direction);
    return h('section', { class: 'card stats-breakdown', dataset: { testid: 'stats-breakdown' } },
      h('div', { class: 'stats-section__header' },
        h('h2', { class: 'card__title' }, `Opanowanie według: ${LEVEL_PLURAL[this.level].toLowerCase()}`),
        levels.length > 1 ? segmented({
          name: 'stats-level',
          label: 'Poziom zestawienia',
          value: this.level,
          options: levels.map((level) => ({ value: level, label: LEVEL_PLURAL[level] })),
          onChange: (value) => {
            this.level = value;
            this.#remember({ statsLevel: value });
            this.ctx.refresh();
          }
        }) : null
      ),
      legend(STATUS_ORDER.map((status) => ({ name: STATUS_LABELS[status], tone: STATUS_TONE[status], kind: 'swatch' }))),
      h('ul', { class: 'breakdown', role: 'list' }, rows.map((row) => {
        const share = percent(row.counts.mastered, row.counts.total);
        const parts = STATUS_ORDER.map((status) => ({ id: status, value: row.counts[status], tone: STATUS_TONE[status], name: STATUS_LABELS[status] }));
        return h('li', { class: 'breakdown__item', dataset: { testid: 'breakdown-row' } },
          h('a', { class: 'breakdown__link', href: routes.stats({ level: row.level, id: row.id }) },
            h('span', { class: 'breakdown__head' },
              h('span', { class: 'breakdown__name' },
                h('span', { class: 'breakdown__title' }, row.name),
                row.parent ? h('span', { class: 'breakdown__parent' }, row.parent) : null),
              h('span', { class: 'breakdown__share' },
                h('strong', null, share === null ? '–' : `${share}%`),
                h('span', null, pluralTerms(row.counts.total))),
              h('span', { class: 'breakdown__chevron' }, icon('chevronRight', { size: 18 }))
            ),
            shareBar(parts, { className: 'breakdown__bar', label: `${row.name}: ${parts.map((part) => `${part.name} ${part.value}`).join(', ')}` })
          )
        );
      }))
    );
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const item = this.scope.level === 'library' ? null : this.#scopeItem();

    if (this.scope.level !== 'library' && !item) return missingView('Statystyki', routes.stats(), 'Statystyki');

    if (library.summary().terms === 0) {
      return {
        title: 'Statystyki',
        actions: [settingsAction()],
        body: emptyState({
          iconName: 'stats',
          title: 'Statystyki pojawią się po pierwszej nauce',
          text: 'Dodaj pojęcia w Bibliotece, a potem ucz się z fiszkami i rozwiązuj quizy – tutaj zobaczysz postępy.',
          actions: [h('a', { class: 'button button--primary', href: routes.domains() }, 'Otwórz Bibliotekę')]
        })
      };
    }

    const journals = this.journals.get();
    const data = overview(library, this.scope, this.direction, journals);
    const parent = item ? this.#parent(item) : null;
    const path = this.scope.level === 'lesson' ? library.modulePath(item.moduleID)
      : this.scope.level === 'module' ? library.getDomain(item.domainID)?.name ?? '' : '';

    return {
      title: item ? item.name : 'Statystyki',
      subtitle: item ? `Statystyki ${LEVEL_GENITIVE[this.scope.level]}${path ? `, ${path}` : ''}` : null,
      back: parent ? { href: routes.stats(parent.scope), label: parent.name } : null,
      actions: [settingsAction()],
      wide: true,
      body: h('div', { class: 'stats', dataset: { testid: 'stats', direction: this.direction } },
        this.#directionControl(),
        h('div', { class: 'stats-top' }, this.#hero(data), this.#kpis(data)),
        data.terms === 0
          ? h('p', { class: 'chart__empty' }, `W tym zakresie nie ma jeszcze pojęć.`)
          : [this.#elements(data), this.#timeSection(journals), this.#breakdown()],
        h('p', { class: 'form-note' }, `Kierunek: ${directionLabel(this.direction)}. Czas nauki to czas nad fiszkami i odpowiedziami w quizach; `
          + 'dla ocen sprzed wersji 0.6.0 jest szacowany z odstępów między ocenami.')
      )
    };
  }
}
