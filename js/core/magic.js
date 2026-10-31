// Szybkie fiszki (od 1.62) – bez przeglądarki.
//
// W edytorze notatki zaznaczony tekst (albo akapit z odwołaniem [[sygnatura]] do obrazu lub tabeli)
// trafia na szybką fiszkę: w treści dostaje <span data-magic="N.M"> (note-format.js) – N to numer
// fiszki w tej notatce, M – numer fragmentu. Tekst fragmentu na fiszce jest zawsze tekstem z notatki
// (zmiana w notatce zmienia fiszkę), więc fiszki przechowują tylko sygnatury i pola, do których trafiły
// fragmenty. Fiszki są w rekordzie notatki (pole magic):
//
//   magic: { next, cards: [card] } – next: numer następnej fiszki,
//   card: { no, state: 'active' | 'folder' | 'done', frags: [{ sig, slot }], next, lessonID?, sentAt? }
//     'active' – fiszka w budowie obok edytora (najwyżej jedna), 'folder' – w teczce (czeka na sprawdzenie),
//     'done' – dodana do lekcji jako pojęcie: { no, state: 'done', termID, doneAt } (bez fragmentów –
//     fragmenty w treści zostają oznaczone, z sygnaturą).
//   slot: pole fiszki (MAGIC_SLOTS) albo null – fragment jeszcze w „worku”; lessonID – lekcja docelowa
//   (bez – lekcja notatki); next – numer następnego fragmentu.
//
// settleMagic() przy każdym zapisie notatki porządkuje oba końce: fiszka traci fragmenty, których nie ma
// już w treści (usunięty tekst), a treść traci oznaczenia, których nie ma na żadnej fiszce.

import { MAGIC_SIG_RE, docFromHtml, htmlFromDoc } from './note-format.js';
import { labelKey, referenceLabel } from './note-refs.js';
import { collapseWhitespace } from './text.js';

/** Pola szybkiej fiszki: pojęcie, definicja (w formularzu pojęcia – „Opis”) i przykład po polsku i angielsku oraz obraz. */
export const MAGIC_SLOTS = Object.freeze(['termPL', 'termEN', 'defPL', 'defEN', 'exPL', 'exEN', 'media']);
/** Najwyższy numer fiszki i fragmentu (sygnatura ma najwyżej trzy cyfry po obu stronach kropki). */
export const MAGIC_MAX = 999;

const STATES = ['active', 'folder', 'done'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}T/;

export const isMagicSig = (value) => MAGIC_SIG_RE.test(String(value ?? ''));
/** Numer fiszki z sygnatury fragmentu („3.2” → 3). */
export const sigCard = (sig) => Number(String(sig).split('.')[0]);
/** Numer fragmentu z sygnatury („3.2” → 2). */
export const sigPart = (sig) => Number(String(sig).split('.')[1]);

/**
 * Fragmenty szybkich fiszek w treści notatki: Map sygnatura → { text, language: 'pl' | 'en', object }.
 * object – sygnatura obrazu albo tabeli, gdy fragment to całe odwołanie [[…]] (inaczej null). Fragment
 * rozdzielony na kilka akapitów (np. Enter w środku) to jeden tekst; ta sama sygnatura w obu wersjach
 * językowych (nie powinna się zdarzyć) – liczy się wersja polska.
 */
export function magicFragments(html, htmlEN = '') {
  const result = new Map();
  for (const [language, source] of [['pl', html], ['en', htmlEN]]) {
    for (const block of docFromHtml(source ?? '').blocks) {
      if (block.type === 'break') continue;
      const blockText = block.runs.map((run) => run.text).join('');
      const label = block.type === 'p' ? referenceLabel(blockText) : null;
      const pieces = new Map();
      let previous = null;
      for (const run of block.runs) {
        if (!run.magic) {
          previous = null;
          continue;
        }
        const text = run.text.replace(/\n/g, ' ');
        const current = pieces.get(run.magic);
        pieces.set(run.magic, current === undefined ? text : current + (previous === run.magic ? '' : ' ') + text);
        previous = run.magic;
      }
      for (const [sig, raw] of pieces) {
        const text = collapseWhitespace(raw);
        if (!text) continue;
        const entry = result.get(sig);
        if (entry && entry.language !== language) continue;
        if (entry) {
          entry.text = collapseWhitespace(`${entry.text} ${text}`);
          entry.object = null;
        } else {
          const object = label && text === collapseWhitespace(blockText) ? label : null;
          result.set(sig, { text, language, object });
        }
      }
    }
  }
  return result;
}

const validDate = (value) => typeof value === 'string' && DATE_RE.test(value);

/**
 * Sprawdzone fiszki notatki ({ next, cards }) albo null – bez fiszek. fragments (magicFragments) – fragmenty,
 * które są w treści; fiszka traci pozostałe, a fiszka bez fragmentów (w budowie albo w teczce) znika.
 * Fiszka w budowie jest najwyżej jedna (następne trafiają do teczki).
 */
export function cleanMagic(raw, fragments = null) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) return null;
  const cards = [];
  const numbers = new Set();
  let active = false;
  for (const item of raw.cards) {
    if (!item || typeof item !== 'object') continue;
    const no = Number(item.no);
    if (!Number.isInteger(no) || no < 1 || no > MAGIC_MAX || numbers.has(no) || !STATES.includes(item.state)) continue;
    if (item.state === 'done') {
      numbers.add(no);
      cards.push({ no, state: 'done', termID: typeof item.termID === 'string' ? item.termID : null, ...(validDate(item.doneAt) ? { doneAt: item.doneAt } : {}) });
      continue;
    }
    const frags = [];
    const seen = new Set();
    let next = Number.isInteger(item.next) && item.next > 0 ? item.next : 1;
    for (const frag of Array.isArray(item.frags) ? item.frags : []) {
      const sig = frag?.sig;
      if (!isMagicSig(sig) || sigCard(sig) !== no || seen.has(sig) || (fragments && !fragments.has(sig))) continue;
      seen.add(sig);
      frags.push({ sig, slot: MAGIC_SLOTS.includes(frag.slot) ? frag.slot : null });
      next = Math.max(next, sigPart(sig) + 1);
    }
    if (frags.length === 0) continue;
    let state = item.state;
    if (state === 'active') {
      if (active) state = 'folder';
      active = true;
    }
    numbers.add(no);
    cards.push({
      no, state, frags, next: Math.min(MAGIC_MAX + 1, next),
      ...(typeof item.lessonID === 'string' && item.lessonID ? { lessonID: item.lessonID } : {}),
      ...(state === 'folder' && validDate(item.sentAt) ? { sentAt: item.sentAt } : {})
    });
  }
  if (cards.length === 0) return null;
  let next = Number.isInteger(raw.next) && raw.next > 0 ? raw.next : 1;
  for (const card of cards) next = Math.max(next, card.no + 1);
  if (fragments) for (const sig of fragments.keys()) next = Math.max(next, sigCard(sig) + 1);
  return { next: Math.min(MAGIC_MAX + 1, next), cards };
}

/**
 * Sygnatury, które zostają oznaczone w treści: fragmenty fiszek w budowie i w teczce oraz wszystkie fragmenty
 * fiszek dodanych do lekcji.
 */
export function keptSigs(magic, fragments) {
  const keep = new Set();
  const done = new Set();
  for (const card of magic?.cards ?? []) {
    if (card.state === 'done') done.add(card.no);
    else for (const frag of card.frags) keep.add(frag.sig);
  }
  for (const sig of fragments?.keys() ?? []) if (done.has(sigCard(sig))) keep.add(sig);
  return keep;
}

/** Treść bez oznaczeń szybkiej fiszki poza `keep` (Set sygnatur; null – bez żadnych). */
export function stripMagic(html, keep = null) {
  const doc = docFromHtml(html ?? '');
  let changed = false;
  for (const block of doc.blocks) {
    for (const run of block.runs) {
      if (run.magic && !keep?.has(run.magic)) {
        delete run.magic;
        changed = true;
      }
    }
  }
  return changed ? htmlFromDoc(doc) : html;
}

/** Treść bez oznaczeń podanych fragmentów (Set sygnatur) – fragmenty wracają do zwykłego tekstu. */
export function unmarkMagic(html, sigs) {
  const doc = docFromHtml(html ?? '');
  let changed = false;
  for (const block of doc.blocks) {
    for (const run of block.runs) {
      if (run.magic && sigs.has(run.magic)) {
        delete run.magic;
        changed = true;
      }
    }
  }
  return changed ? htmlFromDoc(doc) : html;
}

/**
 * Fiszki i treść notatki po zapisie: { magic, html, htmlEN } – fiszki bez fragmentów, których nie ma w treści,
 * i treść bez oznaczeń, których nie ma na fiszkach. html i htmlEN – znormalizowane.
 */
export function settleMagic(raw, html, htmlEN = '') {
  const fragments = magicFragments(html, htmlEN);
  if (!raw && fragments.size === 0) return { magic: null, html, htmlEN };
  const magic = cleanMagic(raw, fragments);
  const keep = keptSigs(magic, fragments);
  const orphan = [...fragments.keys()].some((sig) => !keep.has(sig));
  return { magic, html: orphan ? stripMagic(html, keep) : html, htmlEN: orphan ? stripMagic(htmlEN, keep) : htmlEN };
}

/** Fiszka w budowie albo null. */
export const activeMagicCard = (magic) => magic?.cards.find((card) => card.state === 'active') ?? null;

/** Numer następnej fiszki notatki (null – wyczerpane numery). */
export function nextMagicNumber(magic, fragments = null) {
  let next = magic?.next ?? 1;
  for (const card of magic?.cards ?? []) next = Math.max(next, card.no + 1);
  for (const sig of fragments?.keys() ?? []) next = Math.max(next, sigCard(sig) + 1);
  return next > MAGIC_MAX ? null : next;
}

/**
 * Stan fiszki: { count – fragmenty w treści, loose – w worku, term – jest pojęcie (PL albo EN), complete –
 * pojęcie po polsku i po angielsku oraz definicja, przykład albo obraz }.
 */
export function magicCardStatus(card, fragments) {
  const live = (card.frags ?? []).filter((frag) => fragments.has(frag.sig));
  const filled = (slots) => live.some((frag) => slots.includes(frag.slot));
  const term = filled(['termPL', 'termEN']);
  return {
    count: live.length,
    loose: live.filter((frag) => !frag.slot).length,
    term,
    complete: filled(['termPL']) && filled(['termEN']) && filled(['defPL', 'defEN', 'exPL', 'exEN', 'media'])
  };
}

/**
 * Szkic pojęcia z fiszki (pola formularza pojęcia): teksty fragmentów w polu – w kolejności dodania, rozdzielone
 * spacją; obrazy i tabele z pola „Obraz” – przypięte do fiszki (media: false – bez nich, np. pojęcie w innej
 * lekcji niż notatka). tableLabels – sygnatury tabel notatki (pozostałe obiekty to obrazy).
 */
export function magicTermDraft(card, fragments, { tableLabels = [], media = true } = {}) {
  const live = (card.frags ?? []).filter((frag) => fragments.has(frag.sig));
  const join = (slot) => collapseWhitespace(live.filter((frag) => frag.slot === slot && !fragments.get(frag.sig).object)
    .map((frag) => fragments.get(frag.sig).text).join(' '));
  const tables = new Set(tableLabels.map(labelKey));
  const cardMedia = media
    ? live.filter((frag) => frag.slot === 'media' && fragments.get(frag.sig).object)
      .map((frag) => fragments.get(frag.sig).object)
      .map((label) => ({ kind: tables.has(labelKey(label)) ? 'table' : 'image', label }))
    : [];
  return {
    termPL: join('termPL'),
    termEN: join('termEN'),
    descriptionPL: join('defPL'),
    descriptionEN: join('defEN'),
    examplePL: join('exPL'),
    exampleEN: join('exEN'),
    cardMedia
  };
}
