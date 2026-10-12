// Przygotowanie sesji nauki: materiał, kierunek, zakres, liczba fiszek, kolejność, pierwsza strona.

import { pluralCards, pluralTerms } from '../../core/text.js';
import {
  DIRECTION_NAMES, MIXED, STUDY_COUNTS, STUDY_DIRECTIONS, STUDY_FRONTS, STUDY_SCOPES, buildQueue, describeStudyMaterial,
  isSessionFinished, scopeCounts
} from '../../core/study.js';
import { startTodaysReview, todaysReviewQueue } from '../actions.js';
import {
  actionRow, checkRow, emptyState, field, formGroup, group, segmented, selectInput, settingsAction
} from '../components.js';
import { showError, toast } from '../dialogs.js';
import { h } from '../dom.js';
import { routes } from '../router.js';

const ALL = '';

export class StudySetupScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    const { library } = ctx;
    const settings = library.getSettings();

    // Bez wskazania z biblioteki ekran otwiera się z materiałem wybranym ostatnio.
    const remembered = settings.studySelection;
    this.selection = {
      domainID: remembered?.domainID ?? ALL,
      moduleID: remembered?.moduleID ?? ALL,
      lessonIDs: new Set(remembered?.lessonIDs ?? [])
    };
    const preset = route.preset;
    if (preset?.level === 'lesson') {
      const lesson = library.getLesson(preset.id);
      if (lesson) this.selection = { domainID: lesson.domainID, moduleID: lesson.moduleID, lessonIDs: new Set([lesson.id]) };
    } else if (preset?.level === 'module') {
      const module = library.getModule(preset.id);
      if (module) this.selection = { domainID: module.domainID, moduleID: module.id, lessonIDs: new Set() };
    } else if (preset?.level === 'domain' && library.getDomain(preset.id)) {
      this.selection.domainID = preset.id;
    }

    const known = (list, value, fallback) => (list.some((item) => (item.id ?? item) === value) ? value : fallback);
    this.direction = known(STUDY_DIRECTIONS, settings.preferredDirection, 'pl_en');
    this.scope = known(STUDY_SCOPES, settings.studyScope, 'all');
    this.count = known(STUDY_COUNTS, settings.studyCount, 20);
    this.shuffle = settings.shuffleCards !== false;
    this.front = known(STUDY_FRONTS, settings.preferredFlashcardFront, 'term');
    this.starting = false;

    // Sesja doprowadzona do końca, ale niezamknięta (np. po zamknięciu karty na podsumowaniu).
    const session = library.getStudySession();
    if (session && isSessionFinished(session)) library.finishStudy().catch((error) => console.error(error));
  }

  #config() {
    return {
      domainID: this.selection.domainID || null,
      moduleID: this.selection.moduleID || null,
      lessonIDs: [...this.selection.lessonIDs],
      direction: this.direction,
      scope: this.scope,
      count: this.count,
      shuffle: this.shuffle,
      front: this.front
    };
  }

  /** Usuwa z wyboru elementy, których już nie ma w bibliotece. */
  #sanitize() {
    const { library } = this.ctx;
    const selection = this.selection;
    if (selection.domainID && !library.getDomain(selection.domainID)) selection.domainID = ALL;
    const module = selection.moduleID ? library.getModule(selection.moduleID) : null;
    if (!module || (selection.domainID && module.domainID !== selection.domainID)) selection.moduleID = ALL;
    for (const id of [...selection.lessonIDs]) {
      const lesson = library.getLesson(id);
      if (!lesson || lesson.moduleID !== selection.moduleID) selection.lessonIDs.delete(id);
    }
  }

  async #start() {
    const { ctx } = this;
    const { library } = ctx;
    if (this.starting) return;
    this.starting = true;
    try {
      const config = this.#config();
      const queue = buildQueue(library, config);
      await library.updateSettings({
        preferredDirection: this.direction,
        studyScope: this.scope,
        studyCount: this.count,
        shuffleCards: this.shuffle,
        preferredFlashcardFront: this.front,
        studySelection: { domainID: config.domainID, moduleID: config.moduleID, lessonIDs: config.lessonIDs }
      });
      await library.startStudy(config, queue);
      ctx.navigate(routes.studySession());
    } catch (error) {
      await showError(error);
    } finally {
      this.starting = false;
    }
  }

  #materialGroup() {
    const { ctx } = this;
    const { library } = ctx;
    const selection = this.selection;
    const domains = library.listDomains();
    const modules = selection.domainID ? library.listModules(selection.domainID) : [];
    const moduleSelect = selectInput({
      value: selection.moduleID,
      testID: 'study-module',
      options: [{ value: ALL, label: 'Wszystkie moduły' }, ...modules.map((module) => ({ value: module.id, label: module.name }))],
      onChange: (value) => { selection.moduleID = value; selection.lessonIDs.clear(); ctx.refresh(); }
    });
    moduleSelect.disabled = !selection.domainID;

    return formGroup('Materiał',
      field('Dziedzina', selectInput({
        value: selection.domainID,
        testID: 'study-domain',
        options: [{ value: ALL, label: 'Wszystkie dziedziny' }, ...domains.map((domain) => ({ value: domain.id, label: domain.name }))],
        onChange: (value) => { selection.domainID = value; selection.moduleID = ALL; selection.lessonIDs.clear(); ctx.refresh(); }
      })),
      field('Moduł', moduleSelect)
    );
  }

  #lessonsGroup() {
    const { ctx } = this;
    const { library } = ctx;
    const selection = this.selection;
    if (!selection.moduleID) return null;
    const lessons = library.listLessons(selection.moduleID);
    if (lessons.length < 2) return null;
    const everything = selection.lessonIDs.size === 0;

    return group({ title: 'Lekcje', className: 'group--compact' },
      checkRow({
        checked: everything,
        title: 'Wszystkie lekcje modułu',
        testID: 'study-all-lessons',
        onChange: () => { selection.lessonIDs.clear(); ctx.refresh(); }
      }),
      lessons.map((lesson) => checkRow({
        checked: !everything && selection.lessonIDs.has(lesson.id),
        title: lesson.name,
        subtitle: pluralTerms(library.counts('lesson', lesson.id).terms),
        onChange: (checked) => {
          if (checked) selection.lessonIDs.add(lesson.id);
          else selection.lessonIDs.delete(lesson.id);
          // Zaznaczenie każdej lekcji z osobna to to samo co „wszystkie”.
          if (selection.lessonIDs.size === lessons.length) selection.lessonIDs.clear();
          ctx.refresh();
        }
      }))
    );
  }

  /**
   * Ostatnia zakończona sesja do powtórzenia jednym dotknięciem, z tymi samymi ustawieniami:
   * cała, same odłożone albo same częściowo zapamiętane (według najnowszej oceny fiszki).
   */
  #lastSessionGroup(repeatable) {
    const { ctx } = this;
    const { library } = ctx;
    const { config, queue } = repeatable;
    const direction = config.direction === MIXED ? 'kierunek mieszany' : DIRECTION_NAMES[config.direction];
    const postponed = library.getRepeatableStudy('repeat');
    const partial = library.getRepeatableStudy('partial');
    return group({
      title: 'Ostatnia sesja',
      footer: `${describeStudyMaterial(library, config)}, ${direction}. Te same ustawienia co ostatnio.`
    },
      actionRow({
        label: `Powtórz całą sesję (${pluralCards(queue.length)})`,
        subtitle: 'Wszystkie fiszki, także ocenione jako „Umiem”',
        iconName: 'undo',
        testID: 'study-repeat-last',
        onClick: () => this.#repeatLast('all')
      }),
      postponed ? actionRow({
        label: `Powtórz odłożone (${pluralCards(postponed.queue.length)})`,
        subtitle: 'Fiszki przesunięte na „Powtórz”',
        iconName: 'arrowRight',
        testID: 'study-repeat-postponed',
        onClick: () => this.#repeatLast('repeat')
      }) : null,
      partial ? actionRow({
        label: `Powtórz częściowo zapamiętane (${pluralCards(partial.queue.length)})`,
        subtitle: 'Fiszki z „Umiem”, ale bez kompletu kafelków',
        iconName: 'check',
        testID: 'study-repeat-partial',
        onClick: () => this.#repeatLast('partial')
      }) : null
    );
  }

  async #repeatLast(kind) {
    const { ctx } = this;
    if (this.starting) return;
    this.starting = true;
    try {
      await ctx.library.repeatStudy(Math.random, kind);
      ctx.navigate(routes.studySession());
    } catch (error) {
      await showError(error);
    } finally {
      this.starting = false;
    }
  }

  #sessionGroup(session) {
    const { ctx } = this;
    const { library } = ctx;
    return group({
      title: 'Niedokończona sesja',
      footer: 'Oceny z tej sesji są już zapisane. Nowa sesja zamknie poprzednią.'
    },
      actionRow({
        label: `Wznów naukę (fiszka ${Math.min(session.position + 1, session.queue.length)} z ${session.queue.length})`,
        iconName: 'cards',
        testID: 'study-resume',
        onClick: () => ctx.navigate(routes.studySession())
      }),
      actionRow({
        label: 'Zakończ tę sesję',
        iconName: 'close',
        testID: 'study-discard',
        onClick: async () => {
          try {
            await library.finishStudy();
            toast('Sesja zakończona.');
          } catch (error) {
            await showError(error);
          }
        }
      })
    );
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;

    if (library.summary().terms === 0) {
      return {
        title: 'Nauka',
        actions: [settingsAction()],
        body: emptyState({
          iconName: 'cards',
          title: 'Najpierw dodaj pojęcia',
          text: 'Fiszki powstają z pojęć w Bibliotece. Dodaj je ręcznie, zaimportuj z pliku albo wczytaj dane przykładowe na ekranie Start.',
          actions: [h('a', { class: 'button button--primary', href: routes.domains() }, 'Otwórz Bibliotekę')]
        })
      };
    }

    this.#sanitize();
    const config = this.#config();
    const counts = scopeCounts(library, config);
    const matching = counts[this.scope];
    const planned = this.count > 0 ? Math.min(this.count, matching) : matching;
    const session = library.getStudySession();
    const active = session && !isSessionFinished(session) ? session : null;
    const repeatable = active ? null : library.getRepeatableStudy();
    const reviewCount = active ? 0 : todaysReviewQueue(library).length;

    const startButton = h('button', {
      type: 'button',
      class: 'button button--primary',
      disabled: planned === 0,
      dataset: { testid: 'study-start' },
      onClick: () => this.#start()
    }, 'Rozpocznij naukę');

    return {
      title: 'Nauka',
      actions: [settingsAction()],
      body: [
        active ? this.#sessionGroup(active) : null,
        reviewCount > 0 ? group({ title: 'Powtórka na dziś' },
          actionRow({
            label: `Powtórz zaległe (${pluralCards(reviewCount)})`,
            subtitle: 'Fiszki z całej biblioteki, których termin minął',
            iconName: 'clock',
            testID: 'study-review',
            onClick: () => startTodaysReview(ctx)
          })
        ) : null,
        repeatable ? this.#lastSessionGroup(repeatable) : null,
        this.#materialGroup(),
        this.#lessonsGroup(),
        h('section', { class: 'group' },
          h('h2', { class: 'form-group__title' }, 'Kierunek'),
          segmented({
            name: 'study-direction', label: 'Kierunek nauki', value: this.direction,
            options: STUDY_DIRECTIONS.map((item) => ({ value: item.id, label: item.label })),
            onChange: (value) => { this.direction = value; ctx.refresh(); }
          }),
          h('p', { class: 'group__footer' }, this.direction === MIXED
            ? 'Każda fiszka dostaje losowo jeden z kierunków. Postępy są zapisywane osobno dla każdego.'
            : (this.direction === 'pl_en'
                ? 'Widzisz pojęcie po polsku, przypominasz sobie angielskie.'
                : 'Widzisz pojęcie po angielsku, przypominasz sobie polskie.'))
        ),
        formGroup('Zakres',
          field('Które fiszki', selectInput({
            value: this.scope,
            testID: 'study-scope',
            options: STUDY_SCOPES.map((item) => ({ value: item.id, label: `${item.label} (${counts[item.id]})` })),
            onChange: (value) => { this.scope = value; ctx.refresh(); }
          }), {
            hint: {
              all: 'Wszystkie pojęcia z wybranego materiału.',
              new: 'Pojęcia, których w tym kierunku jeszcze nie oceniałeś.',
              repeat: 'Fiszki, których termin powtórki według FSRS już minął – najpierw najdłużej czekające.',
              partial: 'Pojęcia ostatnio zatwierdzone jako „Umiem”, ale bez kompletu kafelków.',
              hard: 'Pojęcia z trudnością 4–5, sprawiające kłopot w powtórkach albo ostatnio ocenione poniżej połowy.',
              favorites: 'Pojęcia oznaczone gwiazdką.',
              random: 'Losowy wybór z całego materiału.'
            }[this.scope]
          })
        ),
        h('section', { class: 'group' },
          h('h2', { class: 'form-group__title' }, 'Liczba fiszek'),
          segmented({
            name: 'study-count', label: 'Liczba fiszek', value: String(this.count),
            options: STUDY_COUNTS.map((value) => ({ value: String(value), label: value === 0 ? 'Wszystkie' : String(value) })),
            onChange: (value) => { this.count = Number(value); ctx.refresh(); }
          })
        ),
        h('section', { class: 'group' },
          h('h2', { class: 'form-group__title' }, 'Kolejność'),
          segmented({
            name: 'study-order', label: 'Kolejność fiszek', value: this.shuffle || this.scope === 'random' ? 'random' : 'library',
            options: [{ value: 'library', label: 'Jak w lekcjach' }, { value: 'random', label: 'Losowa' }],
            onChange: (value) => { this.shuffle = value === 'random'; ctx.refresh(); }
          })
        ),
        h('section', { class: 'group' },
          h('h2', { class: 'form-group__title' }, 'Pierwsza strona fiszki'),
          segmented({
            name: 'study-front', label: 'Pierwsza strona fiszki', value: this.front,
            options: STUDY_FRONTS.map((item) => ({ value: item.id, label: item.label })),
            onChange: (value) => { this.front = value; ctx.refresh(); }
          }),
          this.front === 'term' ? null : h('p', { class: 'group__footer' },
            'Gdy pojęcie nie ma takiej treści w języku pytania, na pierwszej stronie zobaczysz samo pojęcie.')
        )
      ],
      bottomBar: h('div', { class: 'bottombar__inner' },
        h('span', { class: 'bottombar__note', role: 'status', dataset: { testid: 'study-planned' } },
          planned === 0
            ? 'Brak fiszek dla tych ustawień'
            : (planned < matching ? `${pluralCards(planned)} z ${matching} pasujących` : pluralCards(planned))),
        startButton
      )
    };
  }
}
