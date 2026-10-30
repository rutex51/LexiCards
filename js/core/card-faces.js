// Strony fiszki (od 1.39, od 1.56 w osobnym module) – bez przeglądarki.
//
// Fiszka ma pierwszą stronę (pytanie: pojęcie, definicja albo przykład w języku pytania) i 1–3 strony po obrotach.
// Strona po obrocie pokazuje dowolny zestaw części: tłumaczenie, definicję, przykład (FACE_PARTS). Kolejne obroty:
// pierwszy i drugi – w poziomie (od lewej do prawej, od prawej do lewej), trzeci i powrót do pytania – w pionie
// (z góry na dół, z dołu do góry).
//
// Od 1.56 pojęcie może mieć własne strony – cardFaces { front, faces: [rodzaj strony…] } (zamiast ustawień nauki)
// – i obrazy z notatki swojej lekcji przypięte do stron – cardMedia [{ kind: 'image' | 'table', label, face }]:
// rysunek albo zdjęcie (sygnatura obrazu notatki) albo tabela (sygnatura tabeli), face – numer strony (0 – pytanie).

/** Liczba obrotów fiszki. */
export const FLIP_COUNTS = Object.freeze([1, 2, 3]);
/** Pierwsza strona fiszki: co widać jako pytanie. */
export const FRONT_KINDS = Object.freeze(['term', 'description', 'example']);
/** Części strony po obrocie. */
export const FACE_PART_IDS = Object.freeze(['answer', 'description', 'example']);
export const FACE_PART_LABELS = Object.freeze({ answer: 'Tłumaczenie', description: 'Definicja', example: 'Przykład' });

/**
 * Rodzaje strony po obrocie – każdy niepusty zestaw części (od 1.56 także tłumaczenie z definicją albo z przykładem);
 * 'media' – sama treść przypięta z notatki (tylko we własnych stronach pojęcia).
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
export const MEDIA_FACE = 'media';

/** Strony domyślne przy 2 i 3 obrotach. */
export const DEFAULT_FLIP_FACES = Object.freeze({ 2: Object.freeze(['answer', 'details']), 3: Object.freeze(['answer', 'description', 'example']) });
/**
 * Kierunek kolejnych obrotów (od 1.56): pierwszy – od lewej do prawej, drugi – od prawej do lewej, trzeci – z góry na dół;
 * powrót do pytania – z dołu do góry.
 */
export const FLIP_TURNS = Object.freeze(['left', 'right', 'down']);
export const RETURN_TURN = 'up';
export const TURN_LABELS = Object.freeze({ left: 'od lewej do prawej', right: 'od prawej do lewej', down: 'z góry na dół', up: 'z dołu do góry' });

/** Części strony danego rodzaju (nieznany rodzaj – bez części). */
export function faceParts(kind) {
  return FLIP_FACES.find((face) => face.id === kind)?.parts ?? [];
}
/** Rodzaj strony z zestawu części (kolejność bez znaczenia); pusty zestaw – 'media'. */
export function faceKind(parts) {
  const wanted = FACE_PART_IDS.filter((part) => parts.includes(part));
  if (wanted.length === 0) return MEDIA_FACE;
  return FLIP_FACES.find((face) => face.parts.length === wanted.length && face.parts.every((part) => wanted.includes(part))).id;
}
const knownFace = (kind) => FLIP_FACES.some((face) => face.id === kind);

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
 * stron po obrotach ('media' – sama treść z notatki).
 */
export function cleanCardFaces(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.faces)) return null;
  const faces = raw.faces.slice(0, FLIP_COUNTS.at(-1)).filter((kind) => knownFace(kind) || kind === MEDIA_FACE);
  if (faces.length === 0) return null;
  return { front: FRONT_KINDS.includes(raw.front) ? raw.front : 'term', faces };
}

/** Sprawdzone obrazy i tabele przypięte do stron fiszki ([] – bez); powtórzenia tej samej sygnatury – raz. */
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
    const face = Number.isInteger(item.face) ? Math.min(FLIP_COUNTS.at(-1), Math.max(0, item.face)) : 0;
    list.push({ kind: item.kind, label, face });
  }
  return list;
}

/**
 * Strony fiszki pojęcia w sesji: własne strony pojęcia, a bez nich – z sesji (`sessionFront`, `sessionFaces`).
 * Wynik: { front, faces } – faces to rodzaje stron po obrotach.
 */
export function termCardFaces(term, sessionFront, sessionFaces) {
  const own = cleanCardFaces(term?.cardFaces);
  if (own) return own;
  return { front: FRONT_KINDS.includes(sessionFront) ? sessionFront : 'term', faces: sessionFaces };
}

/** Obrazy i tabele na stronie `face` fiszki o `total` stronach (przypięte dalej niż ostatnia strona – na ostatniej). */
export function mediaOnFace(term, face, total) {
  return cleanCardMedia(term?.cardMedia).filter((item) => Math.min(item.face, total - 1) === face);
}

/** Numery stron po obrotach (od 1), które nic by nie pokazały: sama treść z notatki ('media') bez przypiętego obrazu. */
export function emptyCardFaces(cardFaces, cardMedia) {
  const own = cleanCardFaces(cardFaces);
  if (!own) return [];
  const total = own.faces.length + 1;
  return own.faces.map((kind, index) => (kind === MEDIA_FACE && mediaOnFace({ cardMedia }, index + 1, total).length === 0 ? index + 1 : 0))
    .filter(Boolean);
}
