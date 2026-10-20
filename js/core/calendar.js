// Kalendarz i godzina do własnego wyboru daty (od 1.21.1): siatka miesiąca od poniedziałku, nazwy
// po polsku, dni jako 'rrrr-mm-dd', okres „od – do” wybierany dwoma dotknięciami i gotowe okresy.
// Bez zależności od przeglądarki.

import { dayValue } from './created.js';

/** Miesiące: mianownik (nagłówek kalendarza) i dopełniacz („20 października”). */
export const MONTHS = Object.freeze(['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień',
  'Październik', 'Listopad', 'Grudzień']);
export const MONTHS_OF = Object.freeze(['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września',
  'października', 'listopada', 'grudnia']);
/** Dni tygodnia od poniedziałku: skrót nad kolumną i pełna nazwa. */
export const WEEKDAYS = Object.freeze(['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']);
export const WEEKDAY_NAMES = Object.freeze(['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']);

/** 'rrrr-mm-dd' → Date (północ, czas lokalny) albo null. */
export function parseDayValue(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
}

/** Dzień przesunięty o `count` dni. */
export function addDays(day, count) {
  const date = parseDayValue(day);
  if (!date) return day;
  date.setDate(date.getDate() + count);
  return dayValue(date);
}

/** Miesiąc { year, month } (month 0–11) przesunięty o `count` miesięcy. */
export function addMonths({ year, month }, count) {
  const index = year * 12 + month + count;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** Numer dnia tygodnia od poniedziałku (0) do niedzieli (6). */
const weekday = (date) => (date.getDay() + 6) % 7;

/**
 * Siatka miesiąca: pełne tygodnie od poniedziałku – dni { day: 'rrrr-mm-dd', date: numer dnia,
 * outside: z sąsiedniego miesiąca }. Zawsze 6 tygodni, więc kalendarz nie zmienia wysokości.
 */
export function monthGrid({ year, month }) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - weekday(first));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { day: dayValue(date), date: date.getDate(), outside: date.getMonth() !== month };
  });
}

/** Miesiąc dnia: { year, month }. */
export function monthOf(day) {
  const date = parseDayValue(day) ?? new Date();
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** „Październik 2026”. */
export const monthTitle = ({ year, month }) => `${MONTHS[month]} ${year}`;

/** „wtorek, 20 października 2026”. */
export function longDay(day) {
  const date = parseDayValue(day);
  if (!date) return '';
  return `${WEEKDAY_NAMES[weekday(date)]}, ${date.getDate()} ${MONTHS_OF[date.getMonth()]} ${date.getFullYear()}`;
}

/** „20 października 2026” – bez dnia tygodnia. */
function plainDay(date) {
  return `${date.getDate()} ${MONTHS_OF[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Okres słowami: „5 – 20 października 2026”, „28 września – 4 października 2026”, „28 grudnia
 * 2025 – 4 stycznia 2026”, jeden dzień – „20 października 2026”; bez dat – ''.
 */
export function rangeText(from, to) {
  const start = parseDayValue(from);
  const end = parseDayValue(to);
  if (!start && !end) return '';
  if (!start || !end) return plainDay(start ?? end);
  if (from === to) return plainDay(start);
  if (start.getFullYear() !== end.getFullYear()) return `${plainDay(start)} – ${plainDay(end)}`;
  if (start.getMonth() !== end.getMonth()) return `${start.getDate()} ${MONTHS_OF[start.getMonth()]} – ${plainDay(end)}`;
  return `${start.getDate()} – ${plainDay(end)}`;
}

/** Liczba dni okresu (oba dni włącznie) albo 0. */
export function rangeDays(from, to) {
  const start = parseDayValue(from);
  const end = parseDayValue(to);
  if (!start || !end) return 0;
  return Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;
}

/**
 * Okres po dotknięciu dnia: bez początku albo z całym okresem – nowy początek (koniec pusty);
 * z samym początkiem – koniec (dzień wcześniejszy niż początek zamienia się z nim miejscami).
 */
export function pickRangeDay(range, day) {
  if (!range.from || range.to) return { from: day, to: '' };
  return day < range.from ? { from: day, to: range.from } : { from: range.from, to: day };
}

/** Gotowe okresy do dziś: ten tydzień (od poniedziałku), ten miesiąc, poprzedni miesiąc, ten rok. */
export const RANGE_PRESETS = Object.freeze([
  { id: 'week', label: 'Ten tydzień' },
  { id: 'month', label: 'Ten miesiąc' },
  { id: 'previousMonth', label: 'Poprzedni miesiąc' },
  { id: 'year', label: 'Ten rok' }
]);

export function presetRange(id, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (id) {
    case 'week': return { from: dayValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekday(today))), to: dayValue(today) };
    case 'month': return { from: dayValue(new Date(today.getFullYear(), today.getMonth(), 1)), to: dayValue(today) };
    case 'previousMonth': return {
      from: dayValue(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: dayValue(new Date(today.getFullYear(), today.getMonth(), 0))
    };
    case 'year': return { from: dayValue(new Date(today.getFullYear(), 0, 1)), to: dayValue(today) };
    default: return null;
  }
}

/** „09:05”. */
export const clockText = ({ hour, minute }) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
