// Glosariusz: wszystkie pojęcia z wyszukiwaniem, filtrami, sortowaniem i zaznaczaniem.
// Wąski ekran – lista z rozwijanymi szczegółami; szeroki – tabela wielokolumnowa.
// Wyniki są dociągane porcjami podczas przewijania.

import { normalizeKey, pluralTerms } from '../../core/text.js';
import { setFavorite } from '../actions.js';
import { emptyState, field, formGroup, iconButton, navButton, primaryButton, selectInput, textInput, toggle } from '../components.js';
import { openFormSheet } from '../dialogs.js';
import { h, replaceChildren } from '../dom.js';
import { routes } from '../router.js';
import { createTermListState, searchField, selectionBar, termList, termMenu } from './terms.js';

const PAGE_SIZE = 100;
const ALL = '';

const SORT_OPTIONS = [
  { value: 'polish', label: 'Polski A–Z' },
  { value: 'english', label: 'Angielski A–Z' },
  { value: 'newest', label: 'Najnowsze' },
  { value: 'oldest', label: 'Najstarsze' }
];

function emptyFilter() {
  return { domainID: ALL, moduleID: ALL, lessonID: ALL, favoritesOnly: false, tag: '' };
}

export class GlossaryScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.search = '';
    this.filter = emptyFilter();
    this.sort = 'polish';
    this.limit = PAGE_SIZE;
    this.list = createTermListState();
    this.results = h('div', { class: 'results' });
    this.observer = null;
  }

  dispose() {
    this.observer?.disconnect();
  }

  #isFilterActive() {
    const filter = this.filter;
    return Boolean(filter.domainID || filter.moduleID || filter.lessonID || filter.favoritesOnly || normalizeKey(filter.tag));
  }

  #query() {
    const filter = this.filter;
    let scope = { kind: 'all' };
    if (filter.lessonID) scope = { kind: 'lesson', id: filter.lessonID };
    else if (filter.moduleID) scope = { kind: 'module', id: filter.moduleID };
    else if (filter.domainID) scope = { kind: 'domain', id: filter.domainID };
    return { scope, searchText: this.search, favoritesOnly: filter.favoritesOnly, tag: filter.tag, sort: this.sort };
  }

  #page() {
    return this.ctx.library.glossary(this.#query(), 0, this.limit);
  }

  /** Usuwa z filtra elementy, które przestały istnieć. */
  #sanitizeFilter() {
    const { library } = this.ctx;
    if (this.filter.domainID && !library.getDomain(this.filter.domainID)) this.filter.domainID = ALL;
    if (this.filter.moduleID && !library.getModule(this.filter.moduleID)) this.filter.moduleID = ALL;
    if (this.filter.lessonID && !library.getLesson(this.filter.lessonID)) this.filter.lessonID = ALL;
  }

  #filterSummary() {
    const { library } = this.ctx;
    const parts = [];
    if (this.filter.lessonID) parts.push(library.lessonPath(this.filter.lessonID));
    else if (this.filter.moduleID) parts.push(library.modulePath(this.filter.moduleID));
    else if (this.filter.domainID) parts.push(library.getDomain(this.filter.domainID)?.name ?? '');
    if (this.filter.favoritesOnly) parts.push('tylko ulubione');
    if (normalizeKey(this.filter.tag)) parts.push(`tag „${this.filter.tag.trim()}”`);
    return parts.join(', ');
  }

  #openFilters() {
    const { ctx } = this;
    const { library } = ctx;
    const draft = { ...this.filter, sort: this.sort };

    openFormSheet({
      title: 'Filtry i sortowanie',
      submitLabel: 'Zastosuj',
      build: () => {
        const scopeSlot = h('div', { class: 'form-group__slot' });
        const renderScope = () => {
          const modules = draft.domainID ? library.listModules(draft.domainID) : [];
          const lessons = draft.moduleID ? library.listLessons(draft.moduleID) : [];
          const moduleSelect = selectInput({
            value: draft.moduleID,
            options: [{ value: ALL, label: 'Wszystkie' }, ...modules.map((module) => ({ value: module.id, label: module.name }))],
            onChange: (value) => { draft.moduleID = value; draft.lessonID = ALL; renderScope(); }
          });
          moduleSelect.disabled = !draft.domainID;
          const lessonSelect = selectInput({
            value: draft.lessonID,
            options: [{ value: ALL, label: 'Wszystkie' }, ...lessons.map((lesson) => ({ value: lesson.id, label: lesson.name }))],
            onChange: (value) => { draft.lessonID = value; }
          });
          lessonSelect.disabled = !draft.moduleID;
          replaceChildren(scopeSlot,
            field('Dziedzina', selectInput({
              value: draft.domainID,
              testID: 'filter-domain',
              options: [{ value: ALL, label: 'Wszystkie' }, ...library.listDomains().map((domain) => ({ value: domain.id, label: domain.name }))],
              onChange: (value) => { draft.domainID = value; draft.moduleID = ALL; draft.lessonID = ALL; renderScope(); }
            })),
            field('Moduł', moduleSelect),
            field('Lekcja', lessonSelect)
          );
        };
        renderScope();

        const rest = h('div', { class: 'form-group__slot' });
        const renderRest = () => replaceChildren(rest,
          toggle({ checked: draft.favoritesOnly, label: 'Tylko ulubione', onChange: (value) => { draft.favoritesOnly = value; } }),
          field('Tag', textInput({ value: draft.tag, placeholder: 'np. finanse', autocapitalize: 'none', testID: 'filter-tag', onInput: (value) => { draft.tag = value; } }), { hint: 'Tag musi zgadzać się w całości.' })
        );
        renderRest();

        return [
          formGroup('Sortowanie', field('Kolejność', selectInput({ value: draft.sort, options: SORT_OPTIONS, testID: 'filter-sort', onChange: (value) => { draft.sort = value; } }))),
          formGroup('Zakres', scopeSlot),
          formGroup('Pozostałe', rest),
          h('button', {
            type: 'button', class: 'button button--secondary button--block',
            onClick: () => {
              Object.assign(draft, emptyFilter());
              renderScope();
              renderRest();
            }
          }, 'Wyczyść filtry')
        ];
      },
      onSubmit: () => {
        const { sort, ...filter } = draft;
        this.filter = filter;
        this.sort = sort;
        this.limit = PAGE_SIZE;
        ctx.refresh();
      }
    });
  }

  #table(page) {
    const { ctx } = this;
    const { library } = ctx;
    const selecting = this.list.selecting;
    const cell = (text, lang = null) => (text
      ? h('td', { lang }, text)
      : h('td', { class: 'table__missing' }, 'Brak danych'));

    return h('div', { class: 'table-wrap' },
      h('table', { class: 'table' },
        h('thead', null, h('tr', null,
          selecting ? h('th', { scope: 'col', class: 'table__narrow' }, h('span', { class: 'visually-hidden' }, 'Zaznaczenie')) : null,
          h('th', { scope: 'col' }, 'Polski'),
          h('th', { scope: 'col' }, 'Angielski'),
          h('th', { scope: 'col' }, 'Opis po polsku'),
          h('th', { scope: 'col' }, 'Opis po angielsku'),
          h('th', { scope: 'col' }, 'Lekcja'),
          selecting ? null : h('th', { scope: 'col', class: 'table__narrow' }, h('span', { class: 'visually-hidden' }, 'Polecenia'))
        )),
        h('tbody', null, page.items.map((term) => {
          const isSelected = this.list.selected.has(term.id);
          return h('tr', { class: isSelected ? 'table__row--selected' : null, dataset: { termId: term.id } },
            selecting ? h('td', { class: 'table__narrow' }, h('input', {
              type: 'checkbox', class: 'term__checkbox', checked: isSelected, 'aria-label': `Zaznacz: ${term.termPL}`,
              onChange: (event) => {
                if (event.target.checked) this.list.selected.add(term.id);
                else this.list.selected.delete(term.id);
                ctx.refresh();
              }
            })) : null,
            h('th', { scope: 'row', lang: 'pl' }, term.termPL),
            h('td', { lang: 'en' }, term.termEN),
            cell(term.descriptionPL, 'pl'),
            cell(term.descriptionEN, 'en'),
            h('td', { class: 'table__path' }, library.lessonPath(term.lessonID)),
            selecting ? null : h('td', { class: 'table__narrow table__actions' },
              iconButton(
                term.isFavorite ? 'starFilled' : 'star',
                term.isFavorite ? `Usuń z ulubionych: ${term.termPL}` : `Dodaj do ulubionych: ${term.termPL}`,
                () => setFavorite(ctx, !term.isFavorite, [term.id]),
                { className: `term__star${term.isFavorite ? ' term__star--on' : ''}`, pressed: term.isFavorite }
              ),
              iconButton('more', `Więcej poleceń: ${term.termPL}`, () => termMenu(ctx, term), { className: 'row__more' })
            )
          );
        }))
      )
    );
  }

  /** Odświeża samą listę wyników – pole wyszukiwania zostaje nietknięte podczas pisania. */
  #renderResults() {
    const { ctx } = this;
    const { library } = ctx;
    this.observer?.disconnect();
    const page = this.#page();

    if (page.total === 0) {
      const filtered = this.#isFilterActive() || normalizeKey(this.search) !== '';
      replaceChildren(this.results, emptyState({
        iconName: 'search',
        title: filtered ? 'Nic nie znaleziono' : 'Brak pojęć',
        text: filtered
          ? 'Żadne pojęcie nie spełnia wybranych kryteriów.'
          : 'Dodaj pojęcia w lekcjach albo wczytaj dane przykładowe na ekranie Start.',
        actions: this.#isFilterActive()
          ? [primaryButton('Wyczyść filtry', () => { this.filter = emptyFilter(); ctx.refresh(); }, { kind: 'secondary' })]
          : []
      }));
      return;
    }

    const shown = page.items.length;
    const status = shown < page.total ? `Wczytano ${shown} z ${pluralTerms(page.total)}` : pluralTerms(page.total);
    const more = shown < page.total
      ? h('button', {
          type: 'button', class: 'button button--secondary button--block', dataset: { testid: 'load-more' },
          onClick: () => { this.limit += PAGE_SIZE; this.#renderResults(); }
        }, 'Pokaż więcej')
      : null;

    replaceChildren(this.results,
      h('section', { class: 'group' },
        h('h2', { class: 'group__title', dataset: { testid: 'glossary-count' } }, status),
        ctx.isWide()
          ? this.#table(page)
          : termList(ctx, this.list, page.items, { path: (term) => library.lessonPath(term.lessonID) })
      ),
      more
    );

    // Kolejna porcja dociąga się sama, gdy przycisk pojawi się na ekranie.
    if (more && 'IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.limit += PAGE_SIZE;
          this.#renderResults();
        }
      }, { rootMargin: '200px' });
      this.observer.observe(more);
    }
  }

  view() {
    const { ctx } = this;
    this.#sanitizeFilter();

    const page = this.#page();
    const existing = new Set(page.items.map((term) => term.id));
    for (const id of [...this.list.selected]) if (!existing.has(id)) this.list.selected.delete(id);
    if (page.total === 0) this.list.selecting = false;

    const filterActive = this.#isFilterActive();
    const actions = this.list.selecting
      ? [navButton('Gotowe', () => { this.list.selecting = false; this.list.selected.clear(); ctx.refresh(); }, { strong: true })]
      : [
          page.total > 0 ? navButton('Zaznacz', () => { this.list.selecting = true; ctx.refresh(); }) : null,
          iconButton('filter', filterActive ? 'Filtry i sortowanie (aktywne)' : 'Filtry i sortowanie', () => this.#openFilters(), {
            className: filterActive ? 'icon-button--active' : ''
          })
        ];

    this.#renderResults();

    return {
      title: 'Glosariusz',
      back: { href: routes.domains(), label: 'Biblioteka' },
      actions,
      wide: true,
      body: [
        searchField({
          value: this.search,
          placeholder: 'Szukaj po polsku lub angielsku',
          focusKey: 'glossary-search',
          onInput: (value) => {
            this.search = value;
            this.limit = PAGE_SIZE;
            if (this.list.selecting) ctx.refresh();
            else this.#renderResults();
          }
        }),
        filterActive
          ? h('p', { class: 'filter-summary', dataset: { testid: 'filter-summary' } },
              h('span', null, `Filtr: ${this.#filterSummary()}`),
              h('button', { type: 'button', class: 'button button--plain', onClick: () => { this.filter = emptyFilter(); ctx.refresh(); } }, 'Wyczyść')
            )
          : null,
        this.results
      ],
      bottomBar: this.list.selecting ? selectionBar(ctx, this.list, page.items) : null
    };
  }
}
