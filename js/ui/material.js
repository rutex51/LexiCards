// Wybór materiału (dziedzina → moduł → lekcje) wspólny dla nauki i quizu.

import { pluralTerms } from '../core/text.js';
import { checkRow, field, formGroup, group, selectInput } from './components.js';

/** Pusta wartość listy wyboru – „wszystkie”. */
export const ALL = '';

/**
 * Wybór startowy: zapamiętany ostatnio albo wskazany z biblioteki
 * (preset: { level: 'domain' | 'module' | 'lesson', id }; od 1.23 { level: 'lessons', ids }).
 */
export function initialSelection(library, remembered, preset) {
  let selection = {
    domainID: remembered?.domainID ?? ALL,
    moduleID: remembered?.moduleID ?? ALL,
    lessonIDs: new Set(remembered?.lessonIDs ?? [])
  };
  if (preset?.level === 'lesson') {
    const lesson = library.getLesson(preset.id);
    if (lesson) selection = { domainID: lesson.domainID, moduleID: lesson.moduleID, lessonIDs: new Set([lesson.id]) };
  } else if (preset?.level === 'module') {
    const module = library.getModule(preset.id);
    if (module) selection = { domainID: module.domainID, moduleID: module.id, lessonIDs: new Set() };
  } else if (preset?.level === 'domain' && library.getDomain(preset.id)) {
    selection = { domainID: preset.id, moduleID: ALL, lessonIDs: new Set() };
  } else if (preset?.level === 'lessons') {
    // Kilka lekcji (od 1.23, link z kalendarza): lekcje modułu pierwszej z nich; wszystkie – cały moduł.
    const lessons = (preset.ids ?? []).map((id) => library.getLesson(id)).filter(Boolean);
    if (lessons.length > 0) {
      const { moduleID, domainID } = lessons[0];
      const chosen = new Set(lessons.filter((lesson) => lesson.moduleID === moduleID).map((lesson) => lesson.id));
      selection = { domainID, moduleID, lessonIDs: chosen.size === library.listLessons(moduleID).length ? new Set() : chosen };
    }
  }
  return selection;
}

/** Usuwa z wyboru elementy, których już nie ma w bibliotece. */
export function sanitizeSelection(library, selection) {
  if (selection.domainID && !library.getDomain(selection.domainID)) selection.domainID = ALL;
  const module = selection.moduleID ? library.getModule(selection.moduleID) : null;
  if (!module || (selection.domainID && module.domainID !== selection.domainID)) selection.moduleID = ALL;
  for (const id of [...selection.lessonIDs]) {
    const lesson = library.getLesson(id);
    if (!lesson || lesson.moduleID !== selection.moduleID) selection.lessonIDs.delete(id);
  }
}

/** Wybór w postaci do zapisania w ustawieniach i konfiguracji. */
export function selectionConfig(selection) {
  return {
    domainID: selection.domainID || null,
    moduleID: selection.moduleID || null,
    lessonIDs: [...selection.lessonIDs]
  };
}

/** Grupa „Materiał”: dziedzina i moduł. Identyfikatory testowe: `${prefix}-domain`, `${prefix}-module`. */
export function materialGroup(ctx, selection, prefix) {
  const { library } = ctx;
  const domains = library.listDomains();
  const modules = selection.domainID ? library.listModules(selection.domainID) : [];
  const moduleSelect = selectInput({
    value: selection.moduleID,
    testID: `${prefix}-module`,
    options: [{ value: ALL, label: 'Wszystkie moduły' }, ...modules.map((module) => ({ value: module.id, label: module.name }))],
    onChange: (value) => { selection.moduleID = value; selection.lessonIDs.clear(); ctx.refresh(); }
  });
  moduleSelect.disabled = !selection.domainID;

  return formGroup('Materiał',
    field('Dziedzina', selectInput({
      value: selection.domainID,
      testID: `${prefix}-domain`,
      options: [{ value: ALL, label: 'Wszystkie dziedziny' }, ...domains.map((domain) => ({ value: domain.id, label: domain.name }))],
      onChange: (value) => { selection.domainID = value; selection.moduleID = ALL; selection.lessonIDs.clear(); ctx.refresh(); }
    })),
    field('Moduł', moduleSelect)
  );
}

/** Lekcje wybranego modułu (gdy ma co najmniej dwie). */
export function lessonsGroup(ctx, selection, prefix) {
  const { library } = ctx;
  if (!selection.moduleID) return null;
  const lessons = library.listLessons(selection.moduleID);
  if (lessons.length < 2) return null;
  const everything = selection.lessonIDs.size === 0;

  return group({ title: 'Lekcje', className: 'group--compact' },
    checkRow({
      checked: everything,
      title: 'Wszystkie lekcje modułu',
      testID: `${prefix}-all-lessons`,
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
