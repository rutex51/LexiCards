// Przygotowanie sesji nauki: materiał, kierunek, zakres, liczba fiszek, kolejność, pierwsza strona,
// od 1.39 obroty fiszki (1–3) i treść stron po kolejnych obrotach (od 1.56 – dowolne części strony).

import { pluralCards } from '../../core/text.js';
import {
  DIRECTION_NAMES, FLIP_COUNTS, FLIP_TURNS, MIXED, RETURN_TURN, STUDY_COUNTS, STUDY_DIRECTIONS, STUDY_FRONTS, STUDY_SCOPES, buildQueue,
  describeStudyMaterial, flipFaces, isSessionFinished, scopeCounts
} from '../../core/study.js';
import { FACE_PART_IDS, FACE_PART_LABELS, TURN_LABELS, faceKind, faceParts } from '../../core/card-faces.js';
import { startTodaysReview, todaysReviewQueue } from '../actions.js';
import { initialSelection, lessonsGroup, materialGroup, sanitizeSelection, selectionConfig } from '../material.js';
import { REPEAT_LABELS } from './study-session.js';
import {
  actionRow, checkSegmented, emptyState, field, formGroup, group, segmented, selectInput, settingsAction, startBubble
} from '../components.js';
import { showError, toast } from '../dialogs.js';
import { h } from '../dom.js';
import { routes } from '../router.js';
import { openStudyCalendar } from '../study-calendar.js';


export class StudySetupScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    const { library } = ctx;
    const settings = library.getSettings();

    // Bez wskazania z biblioteki ekran otwiera się z materiałem wybranym ostatnio.
    this.selection = initialSelection(library, settings.studySelection, route.preset);

    const known = (list, value, fallback) => (list.some((item) => (item.id ?? item) === value) ? value : fallback);
    this.direction = known(STUDY_DIRECTIONS, settings.preferredDirection, 'pl_en');
    this.scope = known(STUDY_SCOPES, settings.studyScope, 'all');
    this.count = known(STUDY_COUNTS, settings.studyCount, 20);
    this.shuffle = settings.shuffleCards !== false;
    this.front = known(STUDY_FRONTS, settings.preferredFlashcardFront, 'term');
    // Obroty fiszki (od 1.39) i treść stron po nich – osobno zapamiętana dla 2 i 3 obrotów.
    this.flips = FLIP_COUNTS.includes(settings.flashcardFlips) ? settings.flashcardFlips : 1;
    this.faces = { 2: flipFaces(2, settings.flashcardFaces), 3: flipFaces(3, settings.flashcardFaces) };
    this.starting = false;

    // Sesja doprowadzona do końca, ale niezamknięta (np. po zamknięciu karty na podsumowaniu).
    const session = library.getStudySession();
    if (session && isSessionFinished(session)) library.finishStudy().catch((error) => console.error(error));
  }

  #config() {
    return {
      ...selectionConfig(this.selection),
      direction: this.direction,
      scope: this.scope,
      count: this.count,
      shuffle: this.shuffle,
      front: this.front,
      flips: this.flips,
      ...(this.flips > 1 ? { faces: [...this.faces[this.flips]] } : {})
    };
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
        flashcardFlips: this.flips,
        flashcardFaces: { 2: [...this.faces[2]], 3: [...this.faces[3]] },
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

  /**
   * Obroty fiszki (od 1.39): 1, 2 albo 3; przy 2 i 3 – co pokazuje każda następna strona. Od 1.56 części strony
   * (tłumaczenie, definicja, przykład) zaznaczane dowolnie; pierwszy obrót od lewej do prawej, drugi od prawej do lewej,
   * trzeci z góry na dół, powrót z dołu do góry.
   */
  #flipsGroup() {
    const { ctx } = this;
    const faces = this.flips > 1 ? this.faces[this.flips] : [];
    return h('section', { class: 'group study-flips', dataset: { testid: 'study-flips' } },
      h('h2', { class: 'form-group__title' }, 'Obroty fiszki'),
      segmented({
        name: 'study-flips', label: 'Obroty fiszki', value: String(this.flips),
        options: FLIP_COUNTS.map((count) => ({ value: String(count), label: count === 1 ? '1 obrót' : `${count} obroty` })),
        onChange: (value) => { this.flips = Number(value); ctx.refresh(); }
      }),
      faces.map((face, index) => field(`Po ${index + 1}. obrocie (${TURN_LABELS[FLIP_TURNS[index]]})`, checkSegmented({
        name: `study-face-${index + 1}`, label: `Treść strony po ${index + 1}. obrocie`, testID: `study-face-${index + 1}`,
        values: faceParts(face), options: FACE_PART_IDS.map((part) => ({ value: part, label: FACE_PART_LABELS[part] })),
        onChange: (part, checked) => {
          const parts = faceParts(face).filter((item) => item !== part).concat(checked ? [part] : []);
          // Strona musi coś pokazywać – ostatniej zaznaczonej części nie da się odznaczyć.
          if (parts.length === 0) return false;
          this.faces[this.flips] = this.faces[this.flips].map((item, at) => (at === index ? faceKind(parts) : item));
          ctx.refresh();
          return true;
        }
      }))),
      h('p', { class: 'group__footer' }, this.flips === 1
        ? 'Na odwrocie: tłumaczenie, definicja i przykład. 2 albo 3 obroty – każda następna strona pokazuje wybrane części, po ostatniej fiszka wraca do pytania.'
        : `Zaznacz, co pokazuje każda strona. Dotknięcie fiszki obraca ją na następną stronę; po ostatniej wraca do pytania (${TURN_LABELS[RETURN_TURN]}). `
          + 'Pojęcie może mieć własne strony i obrazy z notatki – w oknie pojęcia.')
    );
  }

  /**
   * Ostatnia zakończona sesja do powtórzenia jednym dotknięciem, z tymi samymi ustawieniami:
   * cała, same odłożone albo same częściowo zapamiętane (według najnowszej oceny fiszki).
   */
  #lastSessionGroup(repeatable) {
    const { ctx } = this;
    const { library } = ctx;
    const { config } = repeatable;
    const direction = config.direction === MIXED ? 'kierunek mieszany' : DIRECTION_NAMES[config.direction];
    const rows = {
      all: { subtitle: 'Wszystkie fiszki, także ocenione jako „Umiem”', iconName: 'undo', testID: 'study-repeat-last' },
      repeat: { subtitle: 'Wszystkie przesunięte na „Powtórz”', iconName: 'arrowRight', testID: 'study-repeat-postponed' },
      partial: { subtitle: '„Powtórz” z częścią zaznaczonych kafelków', iconName: 'minus', testID: 'study-repeat-partial' },
      unknown: { subtitle: '„Powtórz” bez żadnego zaznaczonego kafelka', iconName: 'close', testID: 'study-repeat-unknown' }
    };
    // Cała sesja na górze – to najczęstszy wybór przy wracaniu do materiału.
    const choices = library.repeatChoices();
    const ordered = [...choices.filter((choice) => choice.kind === 'all'), ...choices.filter((choice) => choice.kind !== 'all')];
    return group({
      title: 'Ostatnia sesja',
      footer: `${describeStudyMaterial(library, config)}, ${direction}. Te same ustawienia co ostatnio.`
    },
      ordered.map((choice) => actionRow({
        label: `${REPEAT_LABELS[choice.kind]} (${pluralCards(choice.queue.length)})`,
        subtitle: rows[choice.kind].subtitle,
        iconName: rows[choice.kind].iconName,
        testID: rows[choice.kind].testID,
        onClick: () => this.#repeatLast(choice.kind)
      }))
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

    sanitizeSelection(this.ctx.library, this.selection);
    const config = this.#config();
    const counts = scopeCounts(library, config);
    const matching = counts[this.scope];
    const planned = this.count > 0 ? Math.min(this.count, matching) : matching;
    const session = library.getStudySession();
    const active = session && !isSessionFinished(session) ? session : null;
    // „Powtórka na dziś” i „Ostatnia sesja” można ukryć w Ustawieniach (od 1.20) – są też na Starcie.
    const settings = library.getSettings();
    const repeatable = active || settings.studyShowLast === false ? null : library.getRepeatableStudy();
    const reviewCount = active || settings.studyShowReview === false ? 0 : todaysReviewQueue(library).length;

    // Telefon: „Rozpocznij” to środkowy przycisk paska zakładek; szeroki ekran: przycisk na pasku poleceń.
    const wide = ctx.isWide();
    const startButton = wide
      ? startBubble({ label: 'Rozpocznij naukę', disabled: planned === 0, testID: 'study-start', onClick: () => this.#start() })
      : null;

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
        group({ title: 'Słuchanie' },
          actionRow({
            label: 'Słuchaj, np. w samochodzie',
            subtitle: 'Aplikacja czyta pojęcie, daje chwilę na zastanowienie i czyta odpowiedź',
            iconName: 'headphones',
            testID: 'study-listen',
            onClick: () => ctx.navigate(routes.listen())
          })
        ),
        materialGroup(ctx, this.selection, 'study'),
        lessonsGroup(ctx, this.selection, 'study'),
        // Od 1.23: plan nauki tego materiału w kalendarzu (plik .ics).
        group({ title: 'Kalendarz' },
          actionRow({
            label: 'Zaplanuj naukę w kalendarzu',
            subtitle: 'Plik .ics do Outlooka: terminy z powtarzaniem, przypomnienie, linki do lekcji',
            iconName: 'calendar',
            testID: 'study-calendar',
            onClick: () => openStudyCalendar(ctx, selectionConfig(this.selection))
          })
        ),
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
              partial: 'Pojęcia ostatnio przesunięte na „Powtórz” z częścią zaznaczonych kafelków.',
              hard: 'Pojęcia z trudnością 4–5, sprawiające kłopot w powtórkach albo ostatnio ocenione poniżej połowy.',
              unknownTerm: 'Pojęcia, których tłumaczenia nie znałeś przy ostatniej ocenie w tym kierunku.',
              unknownDescription: 'Pojęcia z definicją, której nie znałeś przy ostatniej ocenie w tym kierunku.',
              unknownExample: 'Pojęcia z przykładem, którego nie znałeś przy ostatniej ocenie w tym kierunku.',
              quizErrors: 'Pojęcia, na które ostatnio odpowiedziałeś w quizie błędnie.',
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
        ),
        this.#flipsGroup()
      ],
      bottomBar: h('div', { class: `bottombar__inner ${startButton ? 'bottombar__inner--bubble' : 'bottombar__inner--note'}` },
        h('span', { class: 'bottombar__note', role: 'status', dataset: { testid: 'study-planned' } },
          planned === 0
            ? 'Brak fiszek dla tych ustawień'
            : (planned < matching ? `${pluralCards(planned)} z ${matching} pasujących` : pluralCards(planned))),
        startButton
      ),
      primaryAction: wide ? null : {
        label: 'Rozpocznij naukę', short: 'Rozpocznij', disabled: planned === 0, testID: 'study-start', onAction: () => this.#start()
      }
    };
  }
}
