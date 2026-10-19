// Ekrany Biblioteki: lista dziedzin, dziedzina (moduły), moduł (lekcje).

import { createdRange, createdWithin } from '../../core/created.js';
import { pluralLessons, pluralModules, pluralTerms } from '../../core/text.js';
import {
  copyLesson, deleteNow, moveLesson, moveModule, openDomainForm, openExportSheet, openLessonForm, openModuleForm, openTermForm,
  reorder, requestDeletion
} from '../actions.js';
import {
  createdFilterControl, createdFilterFor, createdLine, domainBadge, emptyState, group, iconButton, linkRow, navButton, primaryButton,
  rememberCreatedFilter, reorderRow, settingsAction
} from '../components.js';
import { openMenu, toast } from '../dialogs.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import {
  confirmConsolidation, consolidationMenuItem, markConsolidated, masteryBar, masteryOf, masterySubtitle, setConsolidated
} from '../mastery.js';
import { noteButton, noteMenuItem } from '../notes.js';
import { routes } from '../router.js';
import { swipeRow } from '../swipe.js';

/** Wiersze w trybie zmiany kolejności; każda zmiana jest od razu zapisywana. */
/**
 * Wiersze trybu zmiany kolejności. groupOf: elementy różnych grup (np. utrwalone na końcu listy)
 * nie mijają się – przesuwać można tylko w obrębie grupy, a zapisana kolejność to kolejność listy.
 */
function reorderRows(ctx, level, items, leadingFor = () => null, groupOf = () => 0) {
  const move = (index, delta) => {
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    reorder(ctx, level, ids);
  };
  return items.map((item, index) => reorderRow({
    leading: leadingFor(item),
    title: item.name,
    isFirst: index === 0 || groupOf(items[index - 1]) !== groupOf(item),
    isLast: index === items.length - 1 || groupOf(items[index + 1]) !== groupOf(item),
    onUp: () => move(index, -1),
    onDown: () => move(index, 1)
  }));
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

// ---------------------------------------------------------------- lista dziedzin

export class DomainsScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.reordering = false;
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const domains = library.listDomains();
    if (domains.length < 2) this.reordering = false;

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
          domains.length > 1 ? iconButton('reorder', 'Zmień kolejność dziedzin', () => { this.reordering = true; ctx.refresh(); }) : null,
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
      ? reorderRows(ctx, 'domain', domains, (domain) => domainBadge(domain))
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
      body: [
        this.reordering ? null : group({},
          linkRow({
            href: routes.glossary(),
            leading: h('span', { class: 'row__leading--icon' }, icon('search')),
            title: 'Glosariusz',
            subtitle: `Wszystkie pojęcia: ${library.summary().terms}`,
            testID: 'open-glossary'
          })
        ),
        group({ title: 'Dziedziny' }, rows)
      ]
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

    const modules = consolidatedLast(library, library.listModules(domain.id), (id) => library.isModuleConsolidated(id));
    if (modules.length < 2) this.reordering = false;

    const moreMenu = () => openMenu({
      title: domain.name,
      items: [
        { label: 'Ucz się tej dziedziny', icon: 'cards', onSelect: () => ctx.navigate(routes.study({ level: 'domain', id: domain.id })) },
        { label: 'Quiz z tej dziedziny', icon: 'quiz', onSelect: () => ctx.navigate(routes.quiz({ level: 'domain', id: domain.id })) },
        { label: 'Statystyki dziedziny', icon: 'stats', onSelect: () => ctx.navigate(routes.stats({ level: 'domain', id: domain.id })) },
        { label: 'Edytuj dziedzinę', icon: 'edit', onSelect: () => openDomainForm(ctx, domain.id) },
        modules.length > 1 ? { label: 'Zmień kolejność modułów', icon: 'reorder', onSelect: () => { this.reordering = true; ctx.refresh(); } } : null,
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
        ? reorderRows(ctx, 'module', modules, () => null, reorderGroup(library, (id) => library.isModuleConsolidated(id)))
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
      body = [list.control, group({ title: list.title }, rows), list.empty];
    }

    return {
      title: domain.name,
      subtitle: domain.details,
      back: { href: routes.domains(), label: 'Biblioteka' },
      actions,
      body
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
    const lessons = consolidatedLast(library, library.listLessons(module.id), (id) => library.isLessonConsolidated(id));
    if (lessons.length < 2) this.reordering = false;

    const moreMenu = () => openMenu({
      title: module.name,
      items: [
        { label: 'Ucz się tego modułu', icon: 'cards', onSelect: () => ctx.navigate(routes.study({ level: 'module', id: module.id })) },
        { label: 'Quiz z tego modułu', icon: 'quiz', onSelect: () => ctx.navigate(routes.quiz({ level: 'module', id: module.id })) },
        { label: 'Statystyki modułu', icon: 'stats', onSelect: () => ctx.navigate(routes.stats({ level: 'module', id: module.id })) },
        consolidationMenuItem(ctx, 'module', module.id),
        { label: 'Edytuj moduł', icon: 'edit', onSelect: () => openModuleForm(ctx, { moduleID: module.id }) },
        { label: 'Przenieś do innej dziedziny', icon: 'move', onSelect: () => moveModule(ctx, module.id) },
        lessons.length > 1 ? { label: 'Zmień kolejność lekcji', icon: 'reorder', onSelect: () => { this.reordering = true; ctx.refresh(); } } : null,
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
        ? reorderRows(ctx, 'lesson', lessons, () => null, reorderGroup(library, (id) => library.isLessonConsolidated(id)))
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
      body = [list.control, group({ title: list.title }, rows), list.empty];
    }

    return {
      title: module.name,
      subtitle: module.details,
      back: { href: backHref, label: domain?.name ?? 'Biblioteka' },
      actions,
      body
    };
  }
}
