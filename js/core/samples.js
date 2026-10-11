// Dane przykładowe: 40 pojęć z dziedzin Business English i Metrology.

import { SAMPLE_DOMAINS } from './sample-data.js';

/** Zamienia drzewo przykładów na wiersze dla Library.importRows(). */
export function sampleRows() {
  const rows = [];
  for (const domain of SAMPLE_DOMAINS) {
    const domainDraft = { name: domain.name, details: domain.details, icon: domain.icon, color: domain.color };
    for (const module of domain.modules) {
      for (const lesson of module.lessons) {
        for (const term of lesson.terms) {
          rows.push({ domain: domainDraft, module: module.name, lesson: lesson.name, term });
        }
      }
    }
  }
  return rows;
}

export function sampleTermCount() {
  return sampleRows().length;
}

/** Dodaje przykłady do biblioteki. Powtórne wywołanie niczego nie duplikuje. */
export function installSampleData(library) {
  return library.importRows(sampleRows(), { duplicates: 'skip' });
}
