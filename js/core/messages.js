// Teksty wyliczane z danych (bez zależności od przeglądarki).

import { joinList, pluralDomains, pluralLessons, pluralModules, pluralNotes, pluralTerms } from './text.js';

function question(prefix, name) {
  return name ? `${prefix} „${name}”?` : `${prefix}?`;
}

/** Tytuł ostrzeżenia przed usunięciem. */
export function deletionTitle(target, impact) {
  switch (target.kind) {
    case 'domain': return question('Usunąć dziedzinę', impact.name);
    case 'module': return question('Usunąć moduł', impact.name);
    case 'lesson': return question('Usunąć lekcję', impact.name);
    default:
      return impact.terms === 1 ? question('Usunąć pojęcie', impact.name) : `Usunąć ${pluralTerms(impact.terms)}?`;
  }
}

/** Treść ostrzeżenia: co zostanie usunięte razem z elementem. */
export function deletionMessage(target, impact) {
  const parts = [];
  if (target.kind === 'domain' && impact.modules > 0) parts.push(pluralModules(impact.modules));
  if ((target.kind === 'domain' || target.kind === 'module') && impact.lessons > 0) parts.push(pluralLessons(impact.lessons));
  if (target.kind !== 'terms' && impact.terms > 0) parts.push(pluralTerms(impact.terms));
  if (impact.notes > 0) parts.push(target.kind === 'lesson' ? 'notatka lekcji' : `${pluralNotes(impact.notes)} do lekcji`);

  const sentences = [];
  if (parts.length > 0) sentences.push(`Usunięte zostaną również: ${joinList(parts)}.`);
  if (impact.progressRecords > 0) sentences.push('Usunięte zostaną także zapisane postępy i historia nauki tych pojęć.');
  sentences.push('Przez minutę po usunięciu możesz to cofnąć przyciskiem „Cofnij”.');
  return sentences.join(' ');
}

/** Podsumowanie importu wsadowego (dane przykładowe, pliki). */
export function importSummary(report) {
  if (report.added === 0 && report.updated === 0 && report.skipped > 0) {
    return 'Te pojęcia są już w bibliotece.';
  }
  const created = [pluralTerms(report.added)];
  if (report.lessons > 0) created.push(pluralLessons(report.lessons));
  if (report.modules > 0) created.push(pluralModules(report.modules));
  if (report.domains > 0) created.push(pluralDomains(report.domains));
  let text = `Dodano: ${created.join(', ')}.`;
  if (report.updated > 0) text += ` Zaktualizowano: ${report.updated}.`;
  if (report.skipped > 0) text += ` Pominięto istniejące: ${report.skipped}.`;
  return text;
}
