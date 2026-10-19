// Filtr po dacie utworzenia (od 1.9): moduły, lekcje i pojęcia. Dni liczone w czasie lokalnym,
// zakres „od – do” obejmuje oba dni w całości. Bez zależności od przeglądarki.

/** Gotowe okresy filtra; 'range' – własny zakres dat „od – do”. */
export const CREATED_PRESETS = Object.freeze([
  { id: '', label: 'Wszystkie' },
  { id: 'today', label: 'Dziś' },
  { id: '7d', label: 'Ostatnie 7 dni' },
  { id: '30d', label: 'Ostatnie 30 dni' },
  { id: 'year', label: 'Ten rok' },
  { id: 'range', label: 'Wybrany okres…' }
]);

/** Filtr bez ograniczeń: { preset, from, to } – from i to jako 'RRRR-MM-DD' (tylko dla 'range'). */
export function emptyCreatedFilter() {
  return { preset: '', from: '', to: '' };
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 'RRRR-MM-DD' → początek tego dnia (czas lokalny) albo null. */
function parseDay(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 ? date.getTime() : null;
}

/** Dzień w postaci 'RRRR-MM-DD' (czas lokalny) – np. wartość pola daty. */
export function dayValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Zakres czasu filtra: { from, to } w milisekundach (null – bez ograniczenia z tej strony)
 * albo null, gdy filtr niczego nie ogranicza.
 */
export function createdRange(filter, now = new Date()) {
  const today = startOfDay(now);
  switch (filter?.preset) {
    case 'today': return { from: today, to: null };
    case '7d': return { from: today - 6 * DAY, to: null };
    case '30d': return { from: today - 29 * DAY, to: null };
    case 'year': return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: null };
    case 'range': {
      let from = parseDay(filter.from);
      let to = parseDay(filter.to);
      if (from !== null && to !== null && from > to) [from, to] = [to, from];
      if (from === null && to === null) return null;
      // „do” obejmuje cały dzień.
      return { from, to: to === null ? null : new Date(to).setDate(new Date(to).getDate() + 1) - 1 };
    }
    default: return null;
  }
}

/** Czy filtr coś ogranicza. */
export function isCreatedFilterActive(filter, now = new Date()) {
  return createdRange(filter, now) !== null;
}

/** Czy rekord (z polem createdAt) mieści się w zakresie z createdRange(). Rekord bez daty – nie. */
export function createdWithin(record, range) {
  if (!range) return true;
  const time = Date.parse(record?.createdAt ?? '');
  if (!Number.isFinite(time)) return false;
  return (range.from === null || time >= range.from) && (range.to === null || time <= range.to);
}

/** Data utworzenia do pokazania przy elemencie: „19 paź 2026”. */
export function createdLabel(iso) {
  const time = Date.parse(iso ?? '');
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Opis filtra do podsumowania: „utworzone w ostatnich 7 dniach”, „utworzone od 1 paź 2026 do 15 paź 2026”. */
export function createdFilterSummary(filter, now = new Date()) {
  const range = createdRange(filter, now);
  if (!range) return '';
  switch (filter.preset) {
    case 'today': return 'utworzone dziś';
    case '7d': return 'utworzone w ostatnich 7 dniach';
    case '30d': return 'utworzone w ostatnich 30 dniach';
    case 'year': return `utworzone w ${now.getFullYear()} r.`;
    default: {
      const day = (time) => createdLabel(new Date(time).toISOString());
      if (range.from !== null && range.to !== null) return `utworzone od ${day(range.from)} do ${day(range.to)}`;
      return range.from !== null ? `utworzone od ${day(range.from)}` : `utworzone do ${day(range.to)}`;
    }
  }
}
