// Pasowania ISO 286 (od 1.25) – bez przeglądarki: litery odchyłek podstawowych otworów i wałków,
// klasy dokładności (IT), pasowania zalecane i lista ostatnio użytych pasowań na urządzeniu.
// Zapis klasy tolerancji: litera (wielka – otwór, mała – wałek) i numer klasy dokładności („H7”, „g6”,
// „js6”), pasowanie – klasa otworu i wałka („H7/g6”). Wartości odchyłek nie są tu liczone.

/** Litery położenia pola tolerancji otworów (ISO 286-1); wałki – te same małymi literami. */
export const HOLE_LETTERS = Object.freeze([
  'A', 'B', 'C', 'CD', 'D', 'E', 'EF', 'F', 'FG', 'G', 'H', 'J', 'JS', 'K', 'M', 'N', 'P', 'R', 'S', 'T', 'U', 'V', 'X', 'Y', 'Z', 'ZA', 'ZB', 'ZC'
]);
export const SHAFT_LETTERS = Object.freeze(HOLE_LETTERS.map((letter) => letter.toLowerCase()));
/** Klasy dokładności IT01, IT0, IT1 … IT18 – w zapisie klasy tolerancji sam numer. */
export const IT_GRADES = Object.freeze(['01', '0', ...Array.from({ length: 18 }, (_, index) => String(index + 1))]);

/**
 * Pasowania zalecane (ISO 286-2, jak w tablicach pasowań): zasada stałego otworu i stałego wałka,
 * w każdej – luźne, mieszane (przejściowe) i ciasne (wtłaczane); dalej inne często używane.
 */
export const PREFERRED_FITS = Object.freeze([
  {
    id: 'hole', label: 'Zasada stałego otworu', groups: [
      { label: 'Luźne', fits: ['H11/c11', 'H9/d9', 'H8/f7', 'H7/g6', 'H7/h6'] },
      { label: 'Mieszane', fits: ['H7/k6', 'H7/n6'] },
      { label: 'Ciasne', fits: ['H7/p6', 'H7/s6', 'H7/u6'] }
    ]
  },
  {
    id: 'shaft', label: 'Zasada stałego wałka', groups: [
      { label: 'Luźne', fits: ['C11/h11', 'D9/h9', 'F8/h7', 'G7/h6', 'H7/h6'] },
      { label: 'Mieszane', fits: ['K7/h6', 'N7/h6'] },
      { label: 'Ciasne', fits: ['P7/h6', 'S7/h6', 'U7/h6'] }
    ]
  },
  {
    id: 'other', label: 'Inne często używane', groups: [
      { label: 'Luźne', fits: ['H6/h5', 'H7/f7', 'H8/e8', 'H8/h7'] },
      { label: 'Mieszane', fits: ['H7/js6', 'H7/m6'] },
      { label: 'Ciasne', fits: ['H7/r6'] }
    ]
  }
]);

/** Ile ostatnich pasowań pokazuje okno tolerancji wymiaru. */
export const RECENT_FITS_MAX = 6;
/** Na początek (zanim cokolwiek wybierzesz): najczęstsze. */
export const DEFAULT_RECENT_FITS = Object.freeze(['H7', 'h6', 'H7/g6', 'H7/k6', 'g6', 'H8']);

const CLASS_RE = /^([A-Za-z]{1,2})(\d{1,2})$/;
const lettersOf = (letter) => (letter === letter.toUpperCase() ? HOLE_LETTERS : SHAFT_LETTERS);

/** Klasa tolerancji z tabeli ISO 286 („H7”, „js6”, „ZC11”)? */
export function isToleranceClass(text) {
  const match = CLASS_RE.exec(String(text ?? '').trim());
  if (!match) return false;
  const [, letter, grade] = match;
  return (letter === letter.toUpperCase() || letter === letter.toLowerCase()) && lettersOf(letter).includes(letter) && IT_GRADES.includes(grade);
}

/** Pasowanie albo klasa z tabeli: „H7”, „g6” albo otwór i wałek „H7/g6”. */
export function isTableFit(text) {
  const parts = String(text ?? '').trim().split('/');
  if (parts.length === 1) return isToleranceClass(parts[0]);
  return parts.length === 2 && isToleranceClass(parts[0]) && isToleranceClass(parts[1])
    && parts[0][0] === parts[0][0].toUpperCase() && parts[1][0] === parts[1][0].toLowerCase();
}

/** Klasa tolerancji z litery i klasy dokładności (otwór – wielka litera, wałek – mała). */
export const toleranceClass = (letter, grade) => `${letter}${grade}`;

/** Lista ostatnich pasowań po użyciu `fit`: na początku, bez powtórzeń, najwyżej RECENT_FITS_MAX. */
export function rememberFit(list, fit) {
  const value = String(fit ?? '').trim();
  if (!value) return [...list];
  return [value, ...list.filter((item) => item !== value)].slice(0, RECENT_FITS_MAX);
}

/** Sprawdzona lista ostatnich pasowań (ustawienia na urządzeniu) albo domyślna. */
export function cleanRecentFits(raw, isFit) {
  if (!Array.isArray(raw)) return [...DEFAULT_RECENT_FITS];
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const value = String(item ?? '').trim();
    if (!value || seen.has(value) || !isFit(value)) continue;
    seen.add(value);
    list.push(value);
    if (list.length === RECENT_FITS_MAX) break;
  }
  return list.length > 0 ? list : [...DEFAULT_RECENT_FITS];
}
