// Ekrany Biblioteki: lista dziedzin, dziedzina (moduły), moduł (lekcje).

import { createdRange, createdWithin } from '../../core/created.js';
import { LIST_SORTS, SORT_LABELS, SORT_SHORT, defaultListSort, listSortOf, movedOrder, sortItems } from '../../core/sorting.js';
import { pluralLessons, pluralModules, pluralTerms } from '../../core/text.js';
import {
  copyLesson, deleteNow, moveLesson, moveModule, openDomainForm, openExportSheet, openLessonForm, openModuleForm, openTermForm,
  reorder, requestDeletion
} from '../actions.js';
import {
  createdFilterControl, createdFilterFor, createdLine, domainBadge, emptyState, group, iconButton, linkRow, navButton, primaryButton,
  rememberCreatedFilter, reorderRow, settingsAction
} from '../components.js';
import { openMenu, showError, toast } from '../dialogs.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { magicFolderFab } from '../magic.js';
import {
  confirmConsolidation, consolidatedLastToggle, consolidationMenuItem, markConsolidated, masteryBar, masteryOf, masterySubtitle,
  setConsolidated
} from '../mastery.js';
import { noteButton, noteMenuItem } from '../notes.js';
import { enableDragReorder } from '../reorder-drag.js';
import { routes } from '../router.js';
import { swipeRow } from '../swipe.js';

/**
 * Lista w trybie zmiany kolejności: strzałki w wierszach i (od 1.16) przeciąganie uchwytem ≡.
 * Każda zmiana jest od razu zapisywana. groupOf: elementy różnych grup (np. utrwalone na końcu
 * listy) nie mijają się – przesuwać można tylko w obrębie grupy, a zapisana kolejność to kolejność listy.
 */
function reorderList(ctx, level, items, { title, leadingFor = () => null, groupOf = () => 0 }) {
  const ids = items.map((item) => item.id);
  const move = (from, to) => reorder(ctx, level, movedOrder(ids, from, to));
  const rows = items.map((item, index) => reorderRow({
    leading: leadingFor(item),
    title: item.name,
    isFirst: index === 0 || groupOf(items[index - 1]) !== groupOf(item),
    isLast: index === items.length - 1 || groupOf(items[index + 1]) !== groupOf(item),
    onUp: () => move(index, index - 1),
    onDown: () => move(index, index + 1)
  }));
  const section = group({ title }, rows);
  const list = section.querySelector('.group__list');
  if (list) enableDragReorder(list, { groupOf: (index) => groupOf(items[index]), onMove: move });
  return section;
}

const LEVEL_NOUNS = { domain: 'dziedzin', module: 'modułów', lesson: 'lekcji' };

/** Elementy listy w kolejności wybranej dla poziomu (od 1.16); w trybie zmiany kolejności – zawsze ręcznej. */
const sortedFor = (library, level, items, reordering) => sortItems(items, reordering ? 'manual' : listSortOf(library.getSettings(), level));

async function setListSort(ctx, level, sort) {
  const { library } = ctx;
  try {
    await library.updateSettings({ listSort: { ...defaultListSort(), ...library.getSettings().listSort, [level]: sort } });
  } catch (error) {
    await showError(error);
  }
}

/**
 * Przycisk kolejności przy tytule listy (od 1.16): ręcznie, nazwa A–Z i Z–A, a moduły i lekcje
 * także według daty utworzenia; „Ustaw ręcznie” włącza tryb zmiany kolejności (kolejność ręczna).
 */
function sortAction(ctx, level, startReordering) {
  const current = listSortOf(ctx.library.getSettings(), level);
  const noun = LEVEL_NOUNS[level];
  return h('button', {
    type: 'button', class: 'group__action', 'aria-label': `Kolejność ${noun}: ${SORT_LABELS[current].toLowerCase()}`, title: `Kolejność ${noun}`,
    dataset: { testid: `sort-${level}` },
    onClick: () => openMenu({
      title: `Kolejność ${noun}`,
      items: [
        ...LIST_SORTS[level].map((sort) => ({
          label: SORT_LABELS[sort], checked: sort === current, testID: `sort-${level}-${sort}`, onSelect: () => setListSort(ctx, level, sort)
        })),
        startReordering ? 'separator' : null,
        startReordering ? { label: 'Ustaw ręcznie – przeciągnij…', icon: 'reorder', testID: `sort-${level}-arrange`, onSelect: startReordering } : null
      ]
    })
  }, icon('sort', { size: 16 }), h('span', null, SORT_SHORT[current]));
}

/** Tryb zmiany kolejności dotyczy kolejności ręcznej – włączenie go ją wybiera (gdy była inna). */
function startReordering(ctx, screen, level) {
  screen.reordering = true;
  if (listSortOf(ctx.library.getSettings(), level) !== 'manual') setListSort(ctx, level, 'manual');
  else ctx.refresh();
}

/**
 * Utrwalone na koniec listy; w obu grupach zostaje kolejność ustalona przez użytkownika.
 * Od 1.9 do wyboru w Ustawieniach – wyłączone: lista w kolejności użytkownika.
 */
function consolidatedLast(library, items, isConsolidated) {
  if (library.getSettings().consolidatedLast === false) return items;
  const flags = new Map(items.map((item) => [item.id, isConsolidated(item.id)]));
  return [...items.filter((item) => !flags.get(item.id)), ...items.filter((item) => flags.get(item.id))];
}

/** Grupa w trybie zmiany kolejności: utrwalone nie mijają się z resztą tylko wtedy, gdy są na końcu listy. */
const reorderGroup = (library, isConsolidated) => (library.getSettings().consolidatedLast === false
  ? () => 0
  : (item) => isConsolidated(item.id));

/**
 * Lista modułów albo lekcji z filtrem daty utworzenia (od 1.9). Zwraca { shown, control, title, empty }:
 * widoczne elementy, pole filtra (przy co najmniej dwóch elementach albo aktywnym filtrze), tytuł
 * grupy z liczbą i komunikat, gdy filtr niczego nie zostawił. W trybie zmiany kolejności – bez filtra.
 */
function filteredByCreated(ctx, key, items, { title, nothing, testID, reordering }) {
  const filter = createdFilterFor(key);
  const range = createdRange(filter);
  if (reordering) return { shown: items, control: null, title, empty: null };
  const shown = range ? items.filter((item) => createdWithin(item, range)) : items;
  const control = items.length > 1 || range
    ? createdFilterControl({ value: filter, testID, onChange: (value) => { rememberCreatedFilter(key, value); ctx.refresh(); } })
    : null;
  return {
    shown,
    control,
    title: range ? `${title} – ${shown.length} z ${items.length}` : title,
    empty: range && shown.length === 0 ? h('p', { class: 'results__empty', dataset: { testid: `${testID}-empty` } }, nothing) : null
  };
}

/**
 * Przesuwanie wiersza modułu albo lekcji (od 1.9): w prawo – utrwalenie (albo jego cofnięcie),
 * w lewo – usunięcie. Lekkie przesunięcie pyta, zdecydowane wykonuje od razu.
 */
function swipeActions(ctx, row, level, id, progress) {
  const consolidated = progress.consolidated;
  const target = { kind: level, id };
  const empty = level === 'module' ? 'Moduł nie ma pojęć – nie ma czego utrwalić.' : 'Lekcja nie ma pojęć – nie ma czego utrwalić.';
  return swipeRow(row, {
    right: {
      label: consolidated ? 'Cofnij utrwalenie…' : 'Utrwal…',
      strongLabel: consolidated ? 'Puść – cofnij utrwalenie' : 'Puść – utrwal',
      icon: consolidated ? 'undo' : 'select',
      tone: consolidated ? 'gray' : 'green',
      unavailable: !consolidated && progress.total === 0 ? empty : null,
      confirm: () => confirmConsolidation(ctx, level, id, !consolidated),
      run: () => setConsolidated(ctx, level, id, !consolidated)
    },
    left: {
      label: 'Usuń…',
      strongLabel: 'Puść – usuń',
      icon: 'trash',
      tone: 'red',
      confirm: () => requestDeletion(ctx, target),
      run: () => deleteNow(ctx, target)
    },
    onUnavailable: (text) => toast(text)
  });
}

/** Ekran pokazywany, gdy element został usunięty (np. w innej karcie). */
export function missingView(title, backHref, backLabel) {
  return {
    title,
    back: { href: backHref, label: backLabel },
    body: emptyState({
      iconName: 'folder',
      title: 'Tego elementu już nie ma',
      text: 'Mógł zostać usunięty lub przeniesiony.',
      actions: [h('a', { class: 'button button--primary', href: backHref }, `Wróć: ${backLabel}`)]
    })
  };
}

/** Treść ekranu Biblioteki z teczką szybkich fiszek w prawym dolnym rogu (od 1.62 – gdy coś w niej czeka). */
export function withMagicFolder(ctx, body) {
  const folder = magicFolderFab(ctx);
  if (!folder) return body;
  return [...(Array.isArray(body) ? body : [body]), folder];
}

// ---------------------------------------------------------------- lista dziedzin

export class DomainsScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.reordering = false;
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    if (library.listDomains().length < 2) this.reordering = false;
    const domains = sortedFor(library, 'domain', library.listDomains(), this.reordering);

    const addMenu = () => openMenu({
      title: 'Dodaj',
      items: [
        { label: 'Dziedzinę', icon: 'folder', onSelect: () => openDomainForm(ctx) },
        { label: 'Moduł', icon: 'stack', onSelect: () => openModuleForm(ctx) },
        { label: 'Lekcję', icon: 'book', onSelect: () => openLessonForm(ctx) },
        { label: 'Pojęcie', icon: 'cards', onSelect: () => openTermForm(ctx) },
        'separator',
        { label: 'Import z pliku', icon: 'upload', onSelect: () => ctx.navigate(routes.importFile()) },
        domains.length > 0 ? { label: 'Eksport do pliku', icon: 'download', onSelect: () => openExportSheet(ctx, { kind: 'all' }) } : null
      ]
    });

    const actions = this.reordering
      ? [navButton('Gotowe', () => { this.reordering = false; ctx.refresh(); }, { strong: true })]
      : [
          domains.length > 1 ? iconButton('reorder', 'Zmień kolejność dziedzin', () => startReordering(ctx, this, 'domain')) : null,
          iconButton('plus', 'Dodaj', addMenu, { className: 'icon-button--accent' }),
          settingsAction()
        ];

    if (domains.length === 0) {
      return {
        title: 'Biblioteka',
        actions,
        body: emptyState({
          iconName: 'library',
          title: 'Biblioteka jest pusta',
          text: 'Dziedzina to najwyższy poziom porządkowania materiałów, na przykład „Business English”. W dziedzinie tworzysz moduły, w modułach lekcje, a w lekcjach pojęcia.',
          actions: [primaryButton('Dodaj dziedzinę', () => openDomainForm(ctx), { testID: 'library-add-domain' })]
        })
      };
    }

    const rows = this.reordering
      ? null
      : domains.map((domain) => {
          const counts = library.counts('domain', domain.id);
          return linkRow({
            href: routes.domain(domain.id),
            leading: domainBadge(domain),
            title: domain.name,
            subtitle: `${pluralModules(counts.modules)}, ${pluralTerms(counts.terms)}`,
            onMenu: () => openMenu({
              title: domain.name,
              items: [
                { label: 'Ucz się', icon: 'cards', onSelect: () => ctx.navigate(routes.study({ level: 'domain', id: domain.id })) },
                { label: 'Quiz', icon: 'quiz', onSelect: () => ctx.navigate(routes.quiz({ level: 'domain', id: domain.id })) },
                { label: 'Statystyki', icon: 'stats', onSelect: () => ctx.navigate(routes.stats({ level: 'domain', id: domain.id })) },
                { label: 'Edytuj', icon: 'edit', onSelect: () => openDomainForm(ctx, domain.id) },
                { label: 'Dodaj moduł', icon: 'plus', onSelect: () => openModuleForm(ctx, { domainID: domain.id }) },
                { label: 'Eksportuj…', icon: 'download', onSelect: () => openExportSheet(ctx, { kind: 'domain', id: domain.id }) },
                'separator',
                { label: 'Usuń', icon: 'trash', destructive: true, onSelect: () => requestDeletion(ctx, { kind: 'domain', id: domain.id }) }
              ]
            })
          });
        });

    return {
      title: 'Biblioteka',
      actions,
      body: withMagicFolder(ctx, [
        this.reordering ? null : group({},
          linkRow({
            href: routes.glossary(),
            leading: h('span', { class: 'row__leading--icon' }, icon('search')),
            title: 'Glosariusz',
            subtitle: `Wszystkie pojęcia: ${library.summary().terms}`,
            testID: 'open-glossary'
          })
        ),
        this.reordering
          ? reorderList(ctx, 'domain', domains, { title: 'Dziedziny', leadingFor: (domain) => domainBadge(domain) })
          : group({ title: 'Dziedziny', action: domains.length > 1 ? sortAction(ctx, 'domain', () => startReordering(ctx, this, 'domain')) : null }, rows)
      ])
    };
  }
}

// ---------------------------------------------------------------- dziedzina

export class DomainScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    this.id = route.id;
    this.reordering = false;
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const domain = library.getDomain(this.id);
    if (!domain) return missingView('Dziedzina', routes.domains(), 'Biblioteka');

    if (library.listModules(domain.id).length < 2) this.reordering = false;
    const modules = consolidatedLast(library, sortedFor(library, 'module', library.listModules(domain.id), this.reordering),
      (id) => library.isModuleConsolidated(id));

    const moreMenu = () => openMenu({
      title: domain.name,
      items: [
        { label: 'Ucz się tej dziedziny', icon: 'cards', onSelect: () => ctx.navigate(routes.study({ level: 'domain', id: domain.id })) },
        { label: 'Quiz z tej dziedziny', icon: 'quiz', onSelect: () => ctx.navigate(routes.quiz({ level: 'domain', id: domain.id })) },
        { label: 'Statystyki dziedziny', icon: 'stats', onSelect: () => ctx.navigate(routes.stats({ level: 'domain', id: domain.id })) },
        { label: 'Edytuj dziedzinę', icon: 'edit', onSelect: () => openDomainForm(ctx, domain.id) },
        modules.length > 1 ? { label: 'Zmień kolejność modułów', icon: 'reorder', onSelect: () => startReordering(ctx, this, 'module') } : null,
        { label: 'Eksportuj dziedzinę…', icon: 'download', onSelect: () => openExportSheet(ctx, { kind: 'domain', id: domain.id }) },
        'separator',
        {
          label: 'Usuń dziedzinę', icon: 'trash', destructive: true,
          onSelect: async () => {
            if (await requestDeletion(ctx, { kind: 'domain', id: domain.id })) ctx.navigate(routes.domains(), { replace: true });
          }
        }
      ]
    });

    const addMenu = () => openMenu({
      title: 'Dodaj',
      items: [
        { label: 'Moduł', icon: 'stack', onSelect: () => openModuleForm(ctx, { domainID: domain.id }) },
        { label: 'Lekcję', icon: 'book', onSelect: () => openLessonForm(ctx, { domainID: domain.id }) }
      ]
    });

    const actions = this.reordering
      ? [navButton('Gotowe', () => { this.reordering = false; ctx.refresh(); }, { strong: true })]
      : [
          iconButton('plus', 'Dodaj', addMenu, { className: 'icon-button--accent' }),
          iconButton('more', 'Więcej poleceń', moreMenu)
        ];

    let body;
    if (modules.length === 0) {
      body = emptyState({
        iconName: 'stack',
        title: 'Brak modułów',
        text: 'Moduł grupuje lekcje w obrębie dziedziny, na przykład „Finance” w „Business English”.',
        actions: [primaryButton('Dodaj moduł', () => openModuleForm(ctx, { domainID: domain.id }), { testID: 'domain-add-module' })]
      });
    } else {
      const list = filteredByCreated(ctx, `domain:${domain.id}`, modules, {
        title: 'Moduły', nothing: 'Żaden moduł tej dziedziny nie został utworzony w tym okresie.', testID: 'modules-created',
        reordering: this.reordering
      });
      const rows = this.reordering
        ? null
        : list.shown.map((module) => {
            const counts = library.counts('module', module.id);
            const progress = masteryOf(ctx, 'module', module.id);
            return swipeActions(ctx, markConsolidated(linkRow({
              href: routes.module(module.id),
              leading: masteryBar(progress, 'module'),
              title: module.name,
              subtitle: [masterySubtitle(`${pluralLessons(counts.lessons)}, ${pluralTerms(counts.terms)}`, progress, 'module'), createdLine(module)],
              onMenu: () => openMenu({
                title: module.name,
                items: [
                  { label: 'Ucz się', icon: 'cards', onSelect: () => ctx.navigate(routes.study({ level: 'module', id: module.id })) },
                  { label: 'Quiz', icon: 'quiz', onSelect: () => ctx.navigate(routes.quiz({ level: 'module', id: module.id })) },
                  consolidationMenuItem(ctx, 'module', module.id),
                  { label: 'Statystyki', icon: 'stats', onSelect: () => ctx.navigate(routes.stats({ level: 'module', id: module.id })) },
                  { label: 'Edytuj', icon: 'edit', onSelect: () => openModuleForm(ctx, { moduleID: module.id }) },
                  { label: 'Przenieś do innej dziedziny', icon: 'move', onSelect: () => moveModule(ctx, module.id) },
                  { label: 'Dodaj lekcję', icon: 'plus', onSelect: () => openLessonForm(ctx, { moduleID: module.id }) },
                  { label: 'Eksportuj…', icon: 'download', onSelect: () => openExportSheet(ctx, { kind: 'module', id: module.id }) },
                  'separator',
                  { label: 'Usuń', icon: 'trash', destructive: true, onSelect: () => requestDeletion(ctx, { kind: 'module', id: module.id }) }
                ]
              })
            }), progress), 'module', module.id, progress);
          });
      const toggle = this.reordering && consolidatedLastToggle(ctx, 'module', modules.some((item) => library.isModuleConsolidated(item.id)));
      const listGroup = this.reordering
        ? reorderList(ctx, 'module', modules, { title: list.title, groupOf: reorderGroup(library, (id) => library.isModuleConsolidated(id)) })
        : group({ title: list.title, action: modules.length > 1 ? sortAction(ctx, 'module', () => startReordering(ctx, this, 'module')) : null }, rows);
      body = [list.control, toggle || null, listGroup, list.empty];
    }

    return {
      title: domain.name,
      subtitle: domain.details,
      back: { href: routes.domains(), label: 'Biblioteka' },
      actions,
      body: withMagicFolder(ctx, body)
    };
  }
}

// ---------------------------------------------------------------- moduł

export class ModuleScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    this.id = route.id;
    this.reordering = false;
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const module = library.getModule(this.id);
    if (!module) return missingView('Moduł', routes.domains(), 'Biblioteka');

    const domain = library.getDomain(module.domainID);
    const backHref = domain ? routes.domain(domain.id) : routes.domains();
    if (library.listLessons(module.id).length < 2) this.reordering = false;
    const lessons = consolidatedLast(library, sortedFor(library, 'lesson', library.listLessons(module.id), this.reordering),
      (id) => library.isLessonConsolidated(id));

    const moreMenu = () => openMenu({
      title: module.name,
      items: [
        { label: 'Ucz się tego modułu', icon: 'cards', onSelect: () => ctx.navigate(routes.study({ level: 'module', id: module.id })) },
        { label: 'Quiz z tego modułu', icon: 'quiz', onSelect: () => ctx.navigate(routes.quiz({ level: 'module', id: module.id })) },
        { label: 'Statystyki modułu', icon: 'stats', onSelect: () => ctx.navigate(routes.stats({ level: 'module', id: module.id })) },
        consolidationMenuItem(ctx, 'module', module.id),
        { label: 'Edytuj moduł', icon: 'edit', onSelect: () => openModuleForm(ctx, { moduleID: module.id }) },
        { label: 'Przenieś do innej dziedziny', icon: 'move', onSelect: () => moveModule(ctx, module.id) },
        lessons.length > 1 ? { label: 'Zmień kolejność lekcji', icon: 'reorder', onSelect: () => startReordering(ctx, this, 'lesson') } : null,
        { label: 'Eksportuj moduł…', icon: 'download', onSelect: () => openExportSheet(ctx, { kind: 'module', id: module.id }) },
        'separator',
        {
          label: 'Usuń moduł', icon: 'trash', destructive: true,
          onSelect: async () => {
            if (await requestDeletion(ctx, { kind: 'module', id: module.id })) ctx.navigate(backHref, { replace: true });
          }
        }
      ]
    });

    const actions = this.reordering
      ? [navButton('Gotowe', () => { this.reordering = false; ctx.refresh(); }, { strong: true })]
      : [
          iconButton('plus', 'Dodaj lekcję', () => openLessonForm(ctx, { moduleID: module.id }), { className: 'icon-button--accent' }),
          iconButton('more', 'Więcej poleceń', moreMenu)
        ];

    let body;
    if (lessons.length === 0) {
      body = emptyState({
        iconName: 'book',
        title: 'Brak lekcji',
        text: 'Lekcja zawiera pojęcia, których uczysz się razem.',
        actions: [primaryButton('Dodaj lekcję', () => openLessonForm(ctx, { moduleID: module.id }), { testID: 'module-add-lesson' })]
      });
    } else {
      const list = filteredByCreated(ctx, `module:${module.id}`, lessons, {
        title: 'Lekcje', nothing: 'Żadna lekcja tego modułu nie została utworzona w tym okresie.', testID: 'lessons-created',
        reordering: this.reordering
      });
      const rows = this.reordering
        ? null
        : list.shown.map((lesson) => {
            const progress = masteryOf(ctx, 'lesson', lesson.id);
            return swipeActions(ctx, markConsolidated(linkRow({
              href: routes.lesson(lesson.id),
              leading: masteryBar(progress, 'lesson'),
              title: lesson.name,
              subtitle: [masterySubtitle(pluralTerms(library.counts('lesson', lesson.id).terms), progress, 'lesson'), createdLine(lesson)],
              extra: noteButton(ctx, lesson),
              onMenu: () => openMenu({
                title: lesson.name,
                items: [
                  { label: 'Ucz się', icon: 'cards', onSelect: () => ctx.navigate(routes.study({ level: 'lesson', id: lesson.id })) },
                  { label: 'Quiz', icon: 'quiz', onSelect: () => ctx.navigate(routes.quiz({ level: 'lesson', id: lesson.id })) },
                  consolidationMenuItem(ctx, 'lesson', lesson.id),
                  noteMenuItem(ctx, lesson),
                  { label: 'Statystyki', icon: 'stats', onSelect: () => ctx.navigate(routes.stats({ level: 'lesson', id: lesson.id })) },
                  { label: 'Edytuj', icon: 'edit', onSelect: () => openLessonForm(ctx, { lessonID: lesson.id }) },
                  { label: 'Przenieś do innego modułu', icon: 'move', onSelect: () => moveLesson(ctx, lesson.id) },
                  { label: 'Kopiuj do…', icon: 'copy', onSelect: () => copyLesson(ctx, lesson.id) },
                  { label: 'Dodaj pojęcie', icon: 'plus', onSelect: () => openTermForm(ctx, { lessonID: lesson.id }) },
                  { label: 'Importuj z pliku…', icon: 'upload', onSelect: () => ctx.navigate(routes.importFile(lesson.id)) },
                  { label: 'Eksportuj…', icon: 'download', onSelect: () => openExportSheet(ctx, { kind: 'lesson', id: lesson.id }) },
                  'separator',
                  { label: 'Usuń', icon: 'trash', destructive: true, onSelect: () => requestDeletion(ctx, { kind: 'lesson', id: lesson.id }) }
                ]
              })
            }), progress), 'lesson', lesson.id, progress);
          });
      const toggle = this.reordering && consolidatedLastToggle(ctx, 'lesson', lessons.some((item) => library.isLessonConsolidated(item.id)));
      const listGroup = this.reordering
        ? reorderList(ctx, 'lesson', lessons, { title: list.title, groupOf: reorderGroup(library, (id) => library.isLessonConsolidated(id)) })
        : group({ title: list.title, action: lessons.length > 1 ? sortAction(ctx, 'lesson', () => startReordering(ctx, this, 'lesson')) : null }, rows);
      body = [list.control, toggle || null, listGroup, list.empty];
    }

    return {
      title: module.name,
      subtitle: module.details,
      back: { href: backHref, label: domain?.name ?? 'Biblioteka' },
      actions,
      body: withMagicFolder(ctx, body)
    };
  }
}
