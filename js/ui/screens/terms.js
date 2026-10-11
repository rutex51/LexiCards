// Lista pojęć (wspólna dla lekcji i glosariusza) oraz ekran lekcji.

import { normalizeKey, pluralTerms, formatTags } from '../../core/text.js';
import { DIFFICULTY_MAX, DIRECTIONS } from '../../core/model.js';
import { DIRECTION_NAMES, describeProgress } from '../../core/study.js';
import {
  copyLesson, copyTerms, moveLesson, moveTerms, openAssessmentHistory, openExportSheet, openLessonForm, openTermForm,
  requestDeletion, setFavorite
} from '../actions.js';
import { emptyState, iconButton, navButton, primaryButton } from '../components.js';
import { openMenu } from '../dialogs.js';
import { h, replaceChildren } from '../dom.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';
import { missingView } from './library.js';

/** Stan listy pojęć przechowywany przez ekran między odświeżeniami. */
export function createTermListState() {
  return { expanded: new Set(), selecting: false, selected: new Set() };
}

function detailItem(label, value, { lang = null, required = false } = {}) {
  if (!value && !required) return null;
  return h('div', { class: 'term__detail' },
    h('dt', null, label),
    value
      ? h('dd', { lang }, value)
      // Brak treści jest nazwany wprost, a nie pokazany jako puste pole.
      : h('dd', { class: 'term__missing' }, 'Brak danych')
  );
}

/** Ostatnia ocena pojęcia w kierunku, z datą: „2/3 – Częściowo opanowane, 12 paź 2026”. */
function learningState(progress) {
  const state = describeProgress(progress);
  if (!progress?.lastReviewedAt) return state;
  const date = new Date(progress.lastReviewedAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${state}, ${date}`;
}

function termDetails(ctx, term) {
  const forward = ctx.library.getProgress(term.id, DIRECTIONS.PL_EN);
  const backward = ctx.library.getProgress(term.id, DIRECTIONS.EN_PL);
  return h('div', null,
    h('dl', { class: 'term__details-list' },
      detailItem('Opis po polsku', term.descriptionPL, { lang: 'pl', required: true }),
      detailItem('Opis po angielsku', term.descriptionEN, { lang: 'en', required: true }),
      detailItem('Przykład po polsku', term.examplePL, { lang: 'pl', required: true }),
      detailItem('Przykład po angielsku', term.exampleEN, { lang: 'en', required: true }),
      detailItem('Tagi', formatTags(term.tags)),
      detailItem('Trudność', term.difficulty ? `${term.difficulty} z ${DIFFICULTY_MAX}` : null),
      detailItem('Notatki', term.notes),
      detailItem(`Nauka ${DIRECTION_NAMES[DIRECTIONS.PL_EN]}`, learningState(forward)),
      detailItem(`Nauka ${DIRECTION_NAMES[DIRECTIONS.EN_PL]}`, learningState(backward))
    ),
    forward || backward
      ? h('button', {
          type: 'button', class: 'button button--plain term__history', dataset: { testid: 'term-history' },
          onClick: () => openAssessmentHistory(ctx, term)
        }, 'Historia ocen')
      : null
  );
}

export function termMenu(ctx, term) {
  return openMenu({
    title: term.termPL,
    items: [
      { label: 'Edytuj', icon: 'edit', onSelect: () => openTermForm(ctx, { termID: term.id }) },
      {
        label: term.isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych',
        icon: term.isFavorite ? 'star' : 'starFilled',
        onSelect: () => setFavorite(ctx, !term.isFavorite, [term.id])
      },
      { label: 'Przenieś do…', icon: 'move', onSelect: () => moveTerms(ctx, [term.id]) },
      { label: 'Kopiuj do…', icon: 'copy', onSelect: () => copyTerms(ctx, [term.id]) },
      'separator',
      { label: 'Usuń', icon: 'trash', destructive: true, onSelect: () => requestDeletion(ctx, { kind: 'terms', ids: [term.id] }) }
    ]
  });
}

/**
 * Lista pojęć z rozwijanymi szczegółami. W trybie zaznaczania wiersz działa jak pole wyboru.
 * options.path(term) zwraca ścieżkę lekcji pokazywaną pod pojęciem (glosariusz).
 */
export function termList(ctx, state, terms, { path = null } = {}) {
  return h('ul', { class: `group__list terms${state.selecting ? ' terms--selecting' : ''}`, role: 'list' },
    terms.map((term) => {
      const detailsID = `term-details-${term.id}`;
      const isExpanded = state.expanded.has(term.id);
      const isSelected = state.selected.has(term.id);
      const pathText = path ? path(term) : null;

      const text = h('span', { class: 'term__text' },
        h('span', { class: 'term__pl', lang: 'pl' }, term.termPL),
        h('span', { class: 'term__en', lang: 'en' }, term.termEN),
        pathText ? h('span', { class: 'term__path' }, pathText) : null
      );

      if (state.selecting) {
        const checkbox = h('input', {
          type: 'checkbox', class: 'term__checkbox', checked: isSelected,
          onChange: (event) => {
            if (event.target.checked) state.selected.add(term.id);
            else state.selected.delete(term.id);
            ctx.refresh();
          }
        });
        return h('li', { class: `term${isSelected ? ' term--selected' : ''}`, dataset: { termId: term.id } },
          h('label', { class: 'term__select' }, checkbox, text)
        );
      }

      const details = h('div', { class: 'term__details', id: detailsID, hidden: !isExpanded }, isExpanded ? termDetails(ctx, term) : null);
      const toggle = h('button', {
        type: 'button', class: 'term__toggle', 'aria-expanded': String(isExpanded), 'aria-controls': detailsID,
        onClick: () => {
          const open = !state.expanded.has(term.id);
          if (open) state.expanded.add(term.id);
          else state.expanded.delete(term.id);
          toggle.setAttribute('aria-expanded', String(open));
          details.hidden = !open;
          if (open && !details.firstChild) details.appendChild(termDetails(ctx, term));
        }
      }, text, h('span', { class: 'term__chevron' }, icon('chevronDown', { size: 18 })));

      return h('li', { class: 'term', dataset: { termId: term.id } },
        h('div', { class: 'term__row' },
          toggle,
          iconButton(
            term.isFavorite ? 'starFilled' : 'star',
            term.isFavorite ? `Usuń z ulubionych: ${term.termPL}` : `Dodaj do ulubionych: ${term.termPL}`,
            () => setFavorite(ctx, !term.isFavorite, [term.id]),
            { className: `term__star${term.isFavorite ? ' term__star--on' : ''}`, pressed: term.isFavorite }
          ),
          iconButton('more', `Więcej poleceń: ${term.termPL}`, () => termMenu(ctx, term), { className: 'row__more' })
        ),
        details
      );
    })
  );
}

/** Pasek poleceń dla zaznaczonych pojęć (u dołu ekranu). */
export function selectionBar(ctx, state, visibleTerms) {
  const ids = visibleTerms.map((term) => term.id).filter((id) => state.selected.has(id));
  const count = ids.length;
  const finish = () => {
    state.selected.clear();
    state.selecting = false;
    ctx.refresh();
  };
  const allSelected = visibleTerms.length > 0 && count === visibleTerms.length;

  const actionsButton = h('button', {
    type: 'button', class: 'button button--primary', disabled: count === 0, dataset: { testid: 'selection-actions' },
    onClick: () => openMenu({
      title: `Zaznaczono: ${pluralTerms(count)}`,
      items: [
        { label: 'Dodaj do ulubionych', icon: 'starFilled', onSelect: async () => { if (await setFavorite(ctx, true, ids)) finish(); } },
        { label: 'Usuń z ulubionych', icon: 'star', onSelect: async () => { if (await setFavorite(ctx, false, ids)) finish(); } },
        { label: 'Przenieś do…', icon: 'move', onSelect: async () => { if (await moveTerms(ctx, ids)) finish(); } },
        { label: 'Kopiuj do…', icon: 'copy', onSelect: async () => { if (await copyTerms(ctx, ids)) finish(); } },
        { label: 'Eksportuj…', icon: 'download', onSelect: () => openExportSheet(ctx, { kind: 'terms', ids }) },
        'separator',
        { label: 'Usuń', icon: 'trash', destructive: true, onSelect: async () => { if (await requestDeletion(ctx, { kind: 'terms', ids })) finish(); } }
      ]
    })
  }, count === 0 ? 'Działania' : `Działania (${count})`);

  return h('div', { class: 'bottombar__inner' },
    h('button', {
      type: 'button', class: 'button button--plain',
      onClick: () => {
        if (allSelected) state.selected.clear();
        else for (const term of visibleTerms) state.selected.add(term.id);
        ctx.refresh();
      }
    }, allSelected ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'),
    // Liczba zaznaczonych jest na przycisku; ten tekst ogłaszają czytniki ekranu.
    h('span', { class: 'bottombar__status visually-hidden', role: 'status' }, count === 0 ? 'Zaznacz pojęcia' : `Zaznaczono: ${count}`),
    actionsButton
  );
}

export function searchField({ value, placeholder, onInput, focusKey }) {
  return h('div', { class: 'search' },
    h('span', { class: 'search__icon' }, icon('search', { size: 18 })),
    h('input', {
      class: 'search__input', type: 'search', value, placeholder, 'aria-label': placeholder,
      enterkeyhint: 'search', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false',
      dataset: { focusKey, testid: 'search' },
      onInput: (event) => onInput(event.target.value)
    })
  );
}

// ---------------------------------------------------------------- lekcja

export class LessonScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    this.id = route.id;
    this.search = '';
    this.list = createTermListState();
    this.results = h('div', { class: 'results' });
  }

  #visibleTerms() {
    const terms = this.ctx.library.listTerms(this.id);
    const key = normalizeKey(this.search);
    if (key === '') return terms;
    return terms.filter((term) => term.keyPL.includes(key) || term.keyEN.includes(key));
  }

  /** Odświeża samą listę wyników – pole wyszukiwania zostaje nietknięte podczas pisania. */
  #renderResults() {
    const { ctx } = this;
    const all = ctx.library.listTerms(this.id);
    const visible = this.#visibleTerms();
    if (visible.length === 0) {
      replaceChildren(this.results, h('p', { class: 'results__empty' }, 'Brak pojęć pasujących do wyszukiwania.'));
      return;
    }
    replaceChildren(this.results,
      h('section', { class: 'group' },
        h('h2', { class: 'group__title' }, visible.length === all.length ? pluralTerms(all.length) : `${visible.length} z ${pluralTerms(all.length)}`),
        termList(ctx, this.list, visible)
      )
    );
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const lesson = library.getLesson(this.id);
    if (!lesson) return missingView('Lekcja', routes.domains(), 'Biblioteka');

    const module = library.getModule(lesson.moduleID);
    const backHref = module ? routes.module(module.id) : routes.domains();
    const terms = library.listTerms(lesson.id);

    // Zaznaczenie może wskazywać pojęcia, których już nie ma.
    const existing = new Set(terms.map((term) => term.id));
    for (const id of [...this.list.selected]) if (!existing.has(id)) this.list.selected.delete(id);
    if (terms.length === 0) this.list.selecting = false;

    const moreMenu = () => openMenu({
      title: lesson.name,
      items: [
        { label: 'Edytuj lekcję', icon: 'edit', onSelect: () => openLessonForm(ctx, { lessonID: lesson.id }) },
        { label: 'Przenieś do innego modułu', icon: 'move', onSelect: () => moveLesson(ctx, lesson.id) },
        { label: 'Kopiuj do…', icon: 'copy', onSelect: () => copyLesson(ctx, lesson.id) },
        { label: 'Importuj z pliku…', icon: 'upload', onSelect: () => ctx.navigate(routes.importFile(lesson.id)) },
        terms.length > 0 ? { label: 'Eksportuj lekcję…', icon: 'download', onSelect: () => openExportSheet(ctx, { kind: 'lesson', id: lesson.id }) } : null,
        'separator',
        {
          label: 'Usuń lekcję', icon: 'trash', destructive: true,
          onSelect: async () => {
            if (await requestDeletion(ctx, { kind: 'lesson', id: lesson.id })) ctx.navigate(backHref, { replace: true });
          }
        }
      ]
    });

    const actions = this.list.selecting
      ? [navButton('Gotowe', () => { this.list.selecting = false; this.list.selected.clear(); ctx.refresh(); }, { strong: true })]
      : [
          terms.length > 0 ? navButton('Zaznacz', () => { this.list.selecting = true; ctx.refresh(); }) : null,
          iconButton('plus', 'Dodaj pojęcie', () => openTermForm(ctx, { lessonID: lesson.id }), { className: 'icon-button--accent' }),
          iconButton('more', 'Więcej poleceń', moreMenu)
        ];

    let body;
    if (terms.length === 0) {
      body = emptyState({
        iconName: 'cards',
        title: 'Brak pojęć',
        text: 'Dodaj pierwsze pojęcie: nazwę po polsku i po angielsku, a jeśli chcesz, także opis i przykład użycia.',
        actions: [
          primaryButton('Dodaj pojęcie', () => openTermForm(ctx, { lessonID: lesson.id }), { testID: 'lesson-add-term' }),
          primaryButton('Importuj z pliku XLSX lub CSV', () => ctx.navigate(routes.importFile(lesson.id)), { testID: 'lesson-import', kind: 'secondary' })
        ]
      });
    } else {
      this.#renderResults();
      body = [
        h('a', {
          class: 'button button--primary button--block',
          href: routes.study({ level: 'lesson', id: lesson.id }),
          dataset: { testid: 'lesson-study' }
        }, 'Ucz się tej lekcji'),
        searchField({
          value: this.search,
          placeholder: 'Szukaj po polsku lub angielsku',
          focusKey: 'lesson-search',
          onInput: (value) => {
            this.search = value;
            // W trybie zaznaczania pasek poleceń zależy od widocznych pojęć – odświeżamy całość.
            if (this.list.selecting) ctx.refresh();
            else this.#renderResults();
          }
        }),
        this.results
      ];
    }

    return {
      title: lesson.name,
      subtitle: lesson.details,
      back: { href: backHref, label: module?.name ?? 'Biblioteka' },
      actions,
      body,
      bottomBar: this.list.selecting ? selectionBar(ctx, this.list, this.#visibleTerms()) : null
    };
  }
}
