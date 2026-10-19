// Sygnatury obrazów notatki i odwołania do nich w treści (od 1.6).
//
// Każdy obraz notatki ma sygnaturę – domyślnie „Obraz 1”, „Obraz 2”… (nadawaną raz, przy dodaniu,
// więc nie zmienia się przy przesuwaniu obrazów), którą można zmienić. Linijka treści złożona
// tylko z odwołania [[sygnatura]] to miejsce obrazu w podglądzie; obrazy bez odwołania są przed
// tekstem albo po nim. Wielkość liter, polskie znaki i odstępy w odwołaniu nie mają znaczenia.
// Bez zależności od przeglądarki.

import { docFromHtml, htmlFromDoc } from './note-format.js';
import { collapseWhitespace, normalizeKey } from './text.js';

/** Najdłuższa sygnatura (znaki). */
export const IMAGE_LABEL_MAX = 40;
const DEFAULT_PREFIX = 'Obraz';
const REFERENCE_RE = /^\[\[([^[\]]+)\]\]$/;

/** Sygnatura bez nawiasów kwadratowych i nadmiarowych odstępów, najwyżej 40 znaków. */
export function cleanImageLabel(label) {
  return collapseWhitespace(String(label ?? '').replace(/[[\]]/g, ' ')).slice(0, IMAGE_LABEL_MAX).trim();
}

/** Klucz porównania sygnatur: bez wielkości liter, znaków diakrytycznych i odstępów. */
export function labelKey(label) {
  return normalizeKey(cleanImageLabel(label));
}

/** Odwołanie do obrazu w treści: [[sygnatura]]. */
export function referenceToken(label) {
  return `[[${cleanImageLabel(label)}]]`;
}

/** Sygnatura z linijki treści, która jest samym odwołaniem [[…]], albo null. */
export function referenceLabel(text) {
  const match = REFERENCE_RE.exec(collapseWhitespace(text));
  if (!match) return null;
  const label = cleanImageLabel(match[1]);
  return label === '' ? null : label;
}

/**
 * Obrazy z sygnaturami: sygnatura zostaje, jeśli jest poprawna i nie powtarza się w notatce;
 * brakująca albo powtórzona dostaje kolejną wolną „Obraz N”. Zwraca nowe obiekty (z `label`).
 */
export function withImageLabels(images) {
  const used = new Set();
  const labels = images.map((image) => {
    const label = cleanImageLabel(image?.label);
    const key = labelKey(label);
    if (label === '' || used.has(key)) return null;
    used.add(key);
    return label;
  });
  let next = 1;
  return images.map((image, index) => {
    let label = labels[index];
    if (label === null) {
      while (used.has(labelKey(`${DEFAULT_PREFIX} ${next}`))) next += 1;
      label = `${DEFAULT_PREFIX} ${next}`;
      used.add(labelKey(label));
    }
    return { ...image, label };
  });
}

/** Numer obrazu (od 0) o tej sygnaturze albo -1. */
export function findImageByLabel(images, label) {
  const key = labelKey(label);
  return key === '' ? -1 : images.findIndex((image) => labelKey(image.label) === key);
}

/** Sygnatury, do których odwołuje się treść (HTML notatki), w kolejności. */
export function referencedLabels(html) {
  return docFromHtml(html ?? '').blocks
    .filter((block) => block.type === 'p')
    .map((block) => referenceLabel(block.runs.map((run) => run.text).join('')))
    .filter(Boolean);
}

/** Treść ze zmienioną sygnaturą w odwołaniach: [[from]] → [[to]]. */
export function renameReferences(html, from, to) {
  const key = labelKey(from);
  const doc = docFromHtml(html ?? '');
  let changed = false;
  for (const block of doc.blocks) {
    if (block.type !== 'p') continue;
    const label = referenceLabel(block.runs.map((run) => run.text).join(''));
    if (label && labelKey(label) === key) {
      block.runs = [{ text: referenceToken(to) }];
      changed = true;
    }
  }
  return changed ? htmlFromDoc(doc) : html;
}
