// Czysta logika tekstowa: normalizacja, tagi, odmiana przez liczby.
// Bez zależności od przeglądarki – testowana w Node.

/** Znaki, których rozkład Unicode nie sprowadza do litery bazowej. */
const MANUAL_FOLDS = { 'ł': 'l', 'đ': 'd', 'ø': 'o', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe' };

/** Usuwa białe znaki z brzegów i zastępuje każdy ich ciąg jedną spacją. */
export function collapseWhitespace(text) {
  return String(text ?? '').split(/\s+/u).filter(Boolean).join(' ');
}

/**
 * Klucz porównawczy: bez wielkości liter, znaków diakrytycznych i nadmiarowych spacji.
 * Nie zależy od ustawień regionalnych urządzenia, więc ten sam tekst daje ten sam klucz
 * na telefonie i na komputerze (ważne przy przenoszeniu kopii zapasowej).
 * Przykład: "  Łódź   Fabryczna " → "lodz fabryczna".
 */
export function normalizeKey(text) {
  const folded = collapseWhitespace(text)
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
  let result = '';
  for (const character of folded) {
    result += MANUAL_FOLDS[character] ?? character;
  }
  return result;
}

/** `null`, jeżeli tekst jest pusty lub składa się z samych białych znaków. */
export function blankToNull(text) {
  const value = String(text ?? '').trim();
  return value === '' ? null : value;
}

export function isBlank(text) {
  return blankToNull(text) === null;
}

// ---------------------------------------------------------------- tagi

/** Usuwa puste pozycje i duplikaty (porównanie po kluczu), zachowując kolejność. */
export function uniqueTags(tags) {
  const seen = new Set();
  const result = [];
  for (const raw of tags ?? []) {
    const tag = collapseWhitespace(raw);
    const key = normalizeKey(tag);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** Zamienia tekst wpisany przez użytkownika ("a, b; c") na listę tagów. */
export function parseTags(input) {
  return uniqueTags(String(input ?? '').split(/[,;\n]/u));
}

export function formatTags(tags) {
  return (tags ?? []).join(', ');
}

// ---------------------------------------------------------------- odmiana

/**
 * Odmiana rzeczownika przez liczby:
 * one – 1 moduł; few – 2, 3, 4, 22… moduły; many – 0, 5–21, 25… modułów.
 */
export function pluralForm(count, one, few, many) {
  const value = Math.abs(count);
  if (value === 1) return one;
  const lastDigit = value % 10;
  const lastTwo = value % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

export function plural(count, one, few, many) {
  return `${count} ${pluralForm(count, one, few, many)}`;
}

export const pluralDomains = (count) => plural(count, 'dziedzina', 'dziedziny', 'dziedzin');
export const pluralModules = (count) => plural(count, 'moduł', 'moduły', 'modułów');
export const pluralLessons = (count) => plural(count, 'lekcja', 'lekcje', 'lekcji');
export const pluralTerms = (count) => plural(count, 'pojęcie', 'pojęcia', 'pojęć');
/** Dopełniacz po „z”: „3 z 4 pojęć”, „1 z 1 pojęcia”. */
export const ofTerms = (count) => `${count} ${count === 1 ? 'pojęcia' : 'pojęć'}`;
export const pluralCards = (count) => plural(count, 'fiszka', 'fiszki', 'fiszek');
export const pluralNotes = (count) => plural(count, 'notatka', 'notatki', 'notatek');
export const pluralImages = (count) => plural(count, 'obraz', 'obrazy', 'obrazów');
export const pluralTables = (count) => plural(count, 'tabela', 'tabele', 'tabel');
export const pluralAttachments = (count) => plural(count, 'załącznik', 'załączniki', 'załączników');
export const pluralFiles = (count) => plural(count, 'plik', 'pliki', 'plików');

/** Rozmiar pliku: „830 B”, „12 KB”, „1,5 MB”, „1,2 GB”. */
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`;
}

/** Łączy elementy w wyliczenie: „a, b i c”. */
export function joinList(parts) {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} i ${parts[parts.length - 1]}`;
}

const pad2 = (value) => String(value).padStart(2, '0');

/** Data do wstawienia w notatce (od 1.20): „20.10.2026”. */
export function formatDay(date) {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** Godzina: „14:35”. */
export function formatClock(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Data i godzina: „20.10.2026, 14:35”. */
export function formatDayTime(date) {
  return `${formatDay(date)}, ${formatClock(date)}`;
}

/**
 * Data i godzina wpisane ręcznie – wartości pól daty (rrrr-mm-dd) i godziny (gg:mm): obie –
 * „20.10.2026, 14:35”, jedna z nich – sama data albo godzina; puste albo niepoprawne – null.
 */
export function formatEnteredDate(day, time) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? '').trim());
  const clock = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
  const dayText = date && Number(date[2]) >= 1 && Number(date[2]) <= 12 && Number(date[3]) >= 1 && Number(date[3]) <= 31
    ? `${date[3]}.${date[2]}.${date[1]}` : null;
  const clockText = clock && Number(clock[1]) < 24 && Number(clock[2]) < 60 ? `${pad2(clock[1])}:${clock[2]}` : null;
  if (dayText && clockText) return `${dayText}, ${clockText}`;
  return dayText ?? clockText;
}
