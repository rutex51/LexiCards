// Strony fiszki (od 1.39, od 1.56 w osobnym module) – bez przeglądarki.
//
// Fiszka ma pierwszą stronę (pytanie: pojęcie, definicja albo przykład w języku pytania) i 1–3 strony po obrotach.
// Strona po obrocie pokazuje dowolny zestaw części: tłumaczenie, definicję, przykład i (od 1.56.1) obraz – wszystkie
// rysunki, zdjęcia i tabele z notatki przypięte do pojęcia. Od 1.56.2 każdy obrót (także powrót do pytania) idzie
// od prawej do lewej.
//
// Od 1.56 pojęcie może mieć własne strony – cardFaces { front, faces: [rodzaj strony…] } (zamiast ustawień nauki)
// – i obrazy z notatki swojej lekcji – cardMedia [{ kind: 'image' | 'table', label }]: rysunek albo zdjęcie (sygnatura
// obrazu notatki) albo tabela (sygnatura tabeli). Od 1.56.1 obrazy trafiają na strony z częścią „Obraz”, a gdy żadna
// jej nie ma – na ostatnią stronę.

/** Liczba obrotów fiszki. */
export const FLIP_COUNTS = Object.freeze([1, 2, 3]);
/** Pierwsza strona fiszki: co widać jako pytanie. */
export const FRONT_KINDS = Object.freeze(['term', 'description', 'example']);
/** Części strony po obrocie (od 1.56.1 także obraz). */
export const MEDIA_PART = 'media';
export const FACE_PART_IDS = Object.freeze(['answer', 'description', 'example', MEDIA_PART]);
export const FACE_PART_LABELS = Object.freeze({ answer: 'Tłumaczenie', description: 'Definicja', example: 'Przykład', [MEDIA_PART]: 'Obraz' });
const TEXT_PARTS = FACE_PART_IDS.filter((part) => part !== MEDIA_PART);

/**
 * Rodzaje stron z tekstem – każdy niepusty zestaw części tekstu (od 1.56 także tłumaczenie z definicją albo
 * z przykładem). Strona z obrazem: rodzaj tekstu z dopiskiem „+media” albo sam 'media' (od 1.56.1).
 */
export const FLIP_FACES = Object.freeze([
  { id: 'answer', label: 'Tłumaczenie', parts: Object.freeze(['answer']) },
  { id: 'description', label: 'Definicja', parts: Object.freeze(['description']) },
  { id: 'example', label: 'Przykład', parts: Object.freeze(['example']) },
  { id: 'details', label: 'Definicja i przykład', parts: Object.freeze(['description', 'example']) },
  { id: 'answer-description', label: 'Tłumaczenie i definicja', parts: Object.freeze(['answer', 'description']) },
  { id: 'answer-example', label: 'Tłumaczenie i przykład', parts: Object.freeze(['answer', 'example']) },
  { id: 'all', label: 'Wszystko', parts: Object.freeze(['answer', 'description', 'example']) }
]);
export const MEDIA_FACE = MEDIA_PART;
const WITH_MEDIA = `+${MEDIA_PART}`;

/** Strony domyślne przy 2 i 3 obrotach. */
export const DEFAULT_FLIP_FACES = Object.freeze({ 2: Object.freeze(['answer', 'details']), 3: Object.freeze(['answer', 'description', 'example']) });
/** Kierunek obrotu fiszki (od 1.56.2 jeden dla wszystkich stron i powrotu do pytania): od prawej do lewej. */
export const FLIP_TURN = 'right';
export const FLIP_TURN_LABEL = 'od prawej do lewej';

/** Części strony danego rodzaju (nieznany rodzaj – bez części). */
export function faceParts(kind) {
  if (kind === MEDIA_FACE) return [MEDIA_PART];
  if (typeof kind !== 'string') return [];
  const media = kind.endsWith(WITH_MEDIA);
  const text = FLIP_FACES.find((face) => face.id === (media ? kind.slice(0, -WITH_MEDIA.length) : kind))?.parts;
  if (!text) return [];
  return media ? [...text, MEDIA_PART] : text;
}
/** Rodzaj strony z zestawu części (kolejność bez znaczenia); pusty zestaw – null. */
export function faceKind(parts) {
  const text = TEXT_PARTS.filter((part) => parts.includes(part));
  const media = parts.includes(MEDIA_PART);
  if (text.length === 0) return media ? MEDIA_FACE : null;
  const id = FLIP_FACES.find((face) => face.parts.length === text.length && face.parts.every((part) => text.includes(part))).id;
  return media ? `${id}${WITH_MEDIA}` : id;
}
const knownFace = (kind) => faceParts(kind).length > 0;
/** Czy strona pokazuje obraz z notatki. */
export const hasMediaPart = (kind) => faceParts(kind).includes(MEDIA_PART);

/**
 * Strony po kolejnych obrotach – tyle, ile obrotów (1 obrót – ['all']). `faces` – zapisany wybór
 * { 2: [...], 3: [...] }; złe i brakujące pozycje – domyślne.
 */
export function flipFaces(count, faces) {
  const flips = FLIP_COUNTS.includes(count) ? count : 1;
  if (flips === 1) return ['all'];
  const chosen = faces && typeof faces === 'object' && Array.isArray(faces[flips]) ? faces[flips] : [];
  return DEFAULT_FLIP_FACES[flips].map((fallback, index) => (knownFace(chosen[index]) ? chosen[index] : fallback));
}

// ---------------------------------------------------------------- własne strony pojęcia (od 1.56)

/** Najwięcej obrazów i tabel przypiętych do jednej fiszki; najdłuższa sygnatura. */
export const CARD_MEDIA_LIMIT = 6;
const LABEL_MAX = 40;
export const CARD_MEDIA_KINDS = Object.freeze(['image', 'table']);

/**
 * Sprawdzone własne strony pojęcia albo null (jak w ustawieniach nauki): front – pierwsza strona, faces – 1–3 rodzaje
 * stron po obrotach.
 */
export function cleanCardFaces(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.faces)) return null;
  const faces = raw.faces.slice(0, FLIP_COUNTS.at(-1)).filter(knownFace);
  if (faces.length === 0) return null;
  return { front: FRONT_KINDS.includes(raw.front) ? raw.front : 'term', faces };
}

/**
 * Sprawdzone obrazy i tabele przypięte do fiszki ([] – bez); powtórzenia tej samej sygnatury – raz. Numer strony
 * przy obrazie (1.56) jest pomijany – od 1.56.1 o stronie decyduje część „Obraz”.
 */
export function cleanCardMedia(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    if (list.length >= CARD_MEDIA_LIMIT) break;
    if (!item || !CARD_MEDIA_KINDS.includes(item.kind) || typeof item.label !== 'string') continue;
    const label = item.label.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
    const key = `${item.kind}:${label.toLocaleLowerCase('pl')}`;
    if (!label || seen.has(key)) continue;
    seen.add(key);
    list.push({ kind: item.kind, label });
  }
  return list;
}

/**
 * Strony fiszki pojęcia w sesji: własne strony pojęcia, a bez nich – z sesji (`sessionFront`, `sessionFaces`).
 * Pojęcie bez obrazów: część „Obraz” znika, a strona z samym obrazem – cała (żadna nie została – jedna strona ze
 * wszystkim). Wynik: { front, faces } – faces to rodzaje stron po obrotach.
 */
export function termCardFaces(term, sessionFront, sessionFaces) {
  const spec = cleanCardFaces(term?.cardFaces) ?? { front: FRONT_KINDS.includes(sessionFront) ? sessionFront : 'term', faces: sessionFaces };
  if (cleanCardMedia(term?.cardMedia).length > 0) return spec;
  const faces = spec.faces.map((kind) => faceKind(faceParts(kind).filter((part) => part !== MEDIA_PART))).filter(Boolean);
  return { front: spec.front, faces: faces.length > 0 ? faces : ['all'] };
}

/** Numery stron (od 1) z obrazami: strony z częścią „Obraz”, a gdy żadna jej nie ma – ostatnia. */
export function mediaFaces(faces) {
  const marked = faces.map((kind, index) => (hasMediaPart(kind) ? index + 1 : 0)).filter(Boolean);
  return marked.length > 0 ? marked : [faces.length];
}

/** Obrazy i tabele pojęcia na stronie `face` (0 – pytanie, bez obrazów) fiszki o stronach po obrotach `faces`. */
export function mediaOnFace(term, face, faces) {
  if (face === 0 || !mediaFaces(faces).includes(face)) return [];
  return cleanCardMedia(term?.cardMedia);
}

/** Numery stron po obrotach (od 1), które nic by nie pokazały: sam obraz, a pojęcie nie ma przypiętego obrazu. */
export function emptyCardFaces(cardFaces, cardMedia) {
  const own = cleanCardFaces(cardFaces);
  if (!own || cleanCardMedia(cardMedia).length > 0) return [];
  return own.faces.map((kind, index) => (kind === MEDIA_FACE ? index + 1 : 0)).filter(Boolean);
}
