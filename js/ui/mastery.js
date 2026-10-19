// Postęp i utrwalenie na listach lekcji i modułów.
//
// Pasek po lewej pokazuje, jaka część pojęć ma status „Opanowane” z fiszek (w kierunku ze
// Statystyk). „Utrwalona” to osobny, ręczny status lekcji (moduł jest utrwalony, gdy wszystkie
// jego lekcje są): pełny pasek, zielona poświata wiersza i rzadkie powtórki. Status znika sam,
// gdy do lekcji dojdzie nowe pojęcie albo do modułu nowa lekcja.

import { CONSOLIDATED_REVIEW_OPTIONS, consolidatedReviewDays } from '../core/model.js';
import { lessonMastery, moduleMastery, statsDirection } from '../core/stats.js';
import { joinList, pluralForm } from '../core/text.js';
import { checkRow, group } from './components.js';
import { confirmDialog, showError, toast } from './dialogs.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const WORDS = {
  lesson: { done: 'utrwalona', mark: 'Oznacz jako utrwaloną', subject: 'Lekcja' },
  module: { done: 'utrwalony', mark: 'Oznacz jako utrwalony', subject: 'Moduł' }
};

/** „po miesiącu”, „po 2 miesiącach” – okres rzadkich powtórek z ustawień. */
export function consolidatedAfter(settings) {
  const days = consolidatedReviewDays(settings);
  return CONSOLIDATED_REVIEW_OPTIONS.find((option) => option.days === days)?.after ?? `po ${days} dniach`;
}

/** Postęp lekcji albo modułu w kierunku ze Statystyk. */
export function masteryOf(ctx, level, id) {
  const direction = statsDirection(ctx.library.getSettings());
  return level === 'module' ? moduleMastery(ctx.library, id, direction) : lessonMastery(ctx.library, id, direction);
}

/** Pionowy pasek postępu (po lewej w wierszu listy). */
export function masteryBar(progress, level) {
  const value = progress.consolidated ? 100 : (progress.percent ?? 0);
  const label = progress.consolidated
    ? WORDS[level].done
    : (progress.percent === null ? 'brak pojęć' : `opanowane ${progress.percent}%`);
  return h('span', {
    class: `mastery-bar${progress.consolidated ? ' mastery-bar--consolidated' : ''}`,
    role: 'img',
    'aria-label': label,
    dataset: { testid: 'mastery', percent: String(progress.percent ?? ''), consolidated: progress.consolidated ? 'true' : null }
  }, h('span', { class: 'mastery-bar__fill', style: { height: `${value}%` } }));
}

/** Opis pod nazwą: „4 pojęcia, opanowane 75%” albo „4 pojęcia, utrwalona”. */
export function masterySubtitle(base, progress, level) {
  if (progress.consolidated) return [base, ', ', h('strong', { class: 'mastery-done' }, WORDS[level].done)];
  if (progress.percent === null) return base;
  return `${base}, opanowane ${progress.percent}%`;
}

/** Wiersz listy oznaczony poświatą, gdy element jest utrwalony. */
export function markConsolidated(row, progress) {
  if (progress.consolidated) row.classList.add('row--consolidated');
  return row;
}

/** Oznacza lekcję albo moduł jako utrwalone (albo cofa oznaczenie). Zwraca true po zapisie. */
export async function setConsolidated(ctx, level, id, consolidated) {
  const { library } = ctx;
  try {
    if (level === 'module') await library.setModuleConsolidated(id, consolidated);
    else await library.setLessonConsolidated(id, consolidated);
  } catch (error) {
    await showError(error);
    return false;
  }
  const name = (level === 'module' ? library.getModule(id) : library.getLesson(id))?.name ?? '';
  if (consolidated) {
    toast(`${WORDS[level].subject} „${name}” ${level === 'module' ? 'jest utrwalony' : 'jest utrwalona'}. Fiszki wrócą najwcześniej ${consolidatedAfter(library.getSettings())}.`);
  } else {
    toast(`Cofnięto utrwalenie: ${name}.`);
  }
  return true;
}

/** Pytanie przed utrwaleniem albo cofnięciem (lekkie przesunięcie wiersza, od 1.9). */
export async function confirmConsolidation(ctx, level, id, consolidated) {
  const { library } = ctx;
  const name = (level === 'module' ? library.getModule(id) : library.getLesson(id))?.name ?? '';
  const subject = level === 'module' ? 'moduł' : 'lekcję';
  const confirmed = await confirmDialog({
    title: consolidated ? `Oznaczyć ${subject} „${name}” jako ${level === 'module' ? 'utrwalony' : 'utrwaloną'}?` : `Cofnąć utrwalenie: ${name}?`,
    message: consolidated
      ? `Fiszki ${level === 'module' ? 'wszystkich lekcji modułu' : 'tej lekcji'} wrócą najwcześniej ${consolidatedAfter(library.getSettings())} od ostatniej powtórki.`
      : 'Fiszki wrócą do zwykłych powtórek.',
    confirmLabel: consolidated ? 'Utrwal' : 'Cofnij utrwalenie'
  });
  return confirmed ? setConsolidated(ctx, level, id, consolidated) : false;
}

/** Pozycja menu lekcji albo modułu: oznaczenie „utrwalona” albo jego cofnięcie. */
export function consolidationMenuItem(ctx, level, id) {
  const progress = masteryOf(ctx, level, id);
  if (progress.consolidated) {
    return { label: 'Cofnij utrwalenie', icon: 'undo', onSelect: () => setConsolidated(ctx, level, id, false) };
  }
  // Moduł oznacza się razem ze wszystkimi lekcjami; pusta lekcja albo moduł nie mają czego utrwalić.
  return { label: WORDS[level].mark, icon: 'select', disabled: progress.total === 0, onSelect: () => setConsolidated(ctx, level, id, true) };
}

/**
 * Pozycja menu „…” lekcji, modułu i dziedziny (od 1.10.5): włącza albo wyłącza ustawienie
 * „Utrwalone na końcu listy” (Ustawienia → Listy lekcji i modułów) bez przechodzenia do Ustawień.
 */
export function consolidatedLastMenuItem(ctx) {
  const last = ctx.library.getSettings().consolidatedLast !== false;
  return {
    label: last ? 'Wyłącz „Utrwalone na końcu listy”' : 'Włącz „Utrwalone na końcu listy”',
    icon: 'reorder',
    onSelect: async () => {
      try {
        await ctx.library.updateSettings({ consolidatedLast: !last });
      } catch (error) {
        await showError(error);
        return;
      }
      toast(last
        ? 'Utrwalone lekcje i moduły zostają tam, gdzie je ustawisz. Zmienisz to też w Ustawieniach.'
        : 'Utrwalone lekcje i moduły są teraz na końcu listy.');
    }
  };
}

/**
 * Przełącznik „Utrwalone na końcu listy” nad listą w trybie zmiany kolejności (od 1.10.6) – to samo
 * ustawienie co w Ustawieniach. Tylko gdy na liście są utrwalone – bez nich niczego nie zmienia.
 */
export function consolidatedLastToggle(ctx, level, hasConsolidated) {
  if (!hasConsolidated) return null;
  const last = ctx.library.getSettings().consolidatedLast !== false;
  const noun = level === 'module' ? 'moduły' : 'lekcje';
  return group({
    footer: last
      ? `Utrwalone ${noun} są pod pozostałymi i przesuwasz je tylko między sobą. Wyłącz, żeby przesuwać je razem z innymi.`
      : `Utrwalone ${noun} przesuwasz razem z innymi. Włącz, żeby były na końcu listy.`
  }, checkRow({
    checked: last,
    title: 'Utrwalone na końcu listy',
    testID: 'reorder-consolidated-last',
    onChange: async (value) => {
      try {
        await ctx.library.updateSettings({ consolidatedLast: value });
      } catch (error) {
        await showError(error);
      }
    }
  }));
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });

/** Wiersz „Lekcja utrwalona” na ekranie lekcji (tylko dla utrwalonej). */
export function consolidationRow(ctx, lesson) {
  if (!lesson.consolidatedAt) return null;
  return h('li', { class: 'row row--static row--consolidated', dataset: { testid: 'lesson-consolidated' } },
    h('span', { class: 'row__main' },
      h('span', { class: 'row__leading row__leading--icon mastery-icon' }, icon('select')),
      h('span', { class: 'row__text' },
        h('span', { class: 'row__title' }, 'Lekcja utrwalona'),
        h('span', { class: 'row__subtitle' },
          `Od ${shortDate(lesson.consolidatedAt)}. Fiszki wracają najwcześniej ${consolidatedAfter(ctx.library.getSettings())} od ostatniej powtórki.`)
      )
    ),
    h('button', {
      type: 'button', class: 'button button--plain mastery-undo', dataset: { testid: 'lesson-unconsolidate' },
      onClick: () => setConsolidated(ctx, 'lesson', lesson.id, false)
    }, 'Cofnij')
  );
}

/** Komunikat o utracie statusu „utrwalona” po dodaniu pojęcia albo lekcji. */
export function consolidationNotice(notice) {
  if (notice.kind !== 'consolidationLost') return null;
  return notice.level === 'module'
    ? `Moduł „${notice.name}” nie jest już utrwalony – doszła nowa lekcja.`
    : `Lekcja „${notice.name}” nie jest już utrwalona – doszło nowe pojęcie.`;
}

const NOTICE_NAMES = 3;

/** Komunikaty po zapisie: jeden element – zdanie o nim; kilka naraz (np. import) – jedno zbiorcze. */
export function consolidationMessages(notices) {
  const lost = notices.filter((notice) => notice.kind === 'consolidationLost');
  if (lost.length <= 1) return lost.map(consolidationNotice);
  const names = lost.map((notice) => `„${notice.name}”`);
  const shown = names.length > NOTICE_NAMES
    ? `${names.slice(0, NOTICE_NAMES).join(', ')} i ${names.length - NOTICE_NAMES} ${pluralForm(names.length - NOTICE_NAMES, 'inny', 'inne', 'innych')}`
    : joinList(names);
  return [`Nie są już utrwalone: ${shown} – doszły nowe pojęcia albo lekcje.`];
}
