// Słuchanie (np. w samochodzie): aplikacja czyta pojęcie, daje chwilę na zastanowienie,
// czyta odpowiedź, a potem definicję i przykład; od 1.7 może najpierw przeczytać notatki lekcji.
// Bez zależności od przeglądarki – tu powstaje tylko scenariusz kroków; czyta go odtwarzacz
// w interfejsie.
//
// Słuchanie nie zmienia harmonogramu powtórek (FSRS): aplikacja nie wie, czy pamiętałeś odpowiedź.

import { DIRECTIONS } from './model.js';
import { PAGE_BREAK_LINE, isEmptyNoteHtml, noteText } from './note-format.js';
import { referenceLabel } from './note-refs.js';
import { pluralNotes, pluralTerms } from './text.js';

/** Czas na zastanowienie (sekundy). */
export const LISTEN_PAUSES = Object.freeze([3, 5, 8, 12]);
export const DEFAULT_LISTEN_PAUSE = 5;
/** Liczba pojęć w jednym słuchaniu; 0 – wszystkie. */
export const LISTEN_COUNTS = Object.freeze([10, 20, 50, 0]);
/** Język definicji i przykładu: angielski (więcej osłuchania z językiem obcym) albo polski. */
export const LISTEN_DETAIL_LANGUAGES = Object.freeze([
  { id: 'en', label: 'Po angielsku' },
  { id: 'pl', label: 'Po polsku' }
]);

/** Notatka lekcji przed pojęciami: nie czytać, wersja polska, angielska albo obie (gdy są). */
export const LISTEN_NOTE_MODES = Object.freeze([
  { id: 'off', label: 'Nie' },
  { id: 'pl', label: 'PL' },
  { id: 'en', label: 'EN' },
  { id: 'both', label: 'PL + EN' }
]);

/** Przerwa między elementami po odpowiedzi i między pojęciami (ms). */
export const DETAIL_GAP = 700;
export const CARD_GAP = 1500;
/** Średnie tempo syntezatora przy szybkości 1 – do szacowania czasu słuchania. */
const CHARACTERS_PER_SECOND = 13;

export const STEP_LABELS = Object.freeze({
  intro: 'Początek',
  prompt: 'Pojęcie',
  think: 'Zastanów się',
  answer: 'Odpowiedź',
  description: 'Definicja',
  example: 'Przykład',
  noteTitle: 'Notatka',
  note: 'Notatka',
  outro: 'Koniec'
});

const SOURCE = { [DIRECTIONS.PL_EN]: 'pl', [DIRECTIONS.EN_PL]: 'en' };
const TARGET = { [DIRECTIONS.PL_EN]: 'en', [DIRECTIONS.EN_PL]: 'pl' };

function field(term, name, language) {
  const value = term[`${name}${language.toUpperCase()}`];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Tekst w wybranym języku, a gdy go brak – w drugim. */
function inLanguage(term, name, preferred) {
  const other = preferred === 'pl' ? 'en' : 'pl';
  const text = field(term, name, preferred);
  if (text) return { text, lang: preferred };
  const fallback = field(term, name, other);
  return fallback ? { text: fallback, lang: other } : null;
}

/**
 * Kroki jednego pojęcia: [{ kind, text?, lang?, ms? }].
 * options: { thinkMs, description, example, repeatAnswer, detailLanguage: 'en' | 'pl' }.
 */
export function listenSteps(term, direction, options = {}) {
  const thinkMs = Math.max(0, options.thinkMs ?? DEFAULT_LISTEN_PAUSE * 1000);
  const source = SOURCE[direction] ?? 'pl';
  const target = TARGET[direction] ?? 'en';
  const answer = { kind: 'answer', text: field(term, 'term', target) ?? '', lang: target };
  const steps = [
    { kind: 'prompt', text: field(term, 'term', source) ?? '', lang: source },
    { kind: 'think', ms: thinkMs },
    answer
  ];
  if (options.repeatAnswer) steps.push({ kind: 'answer', text: answer.text, lang: target, repeat: true });
  const details = options.detailLanguage === 'pl' ? 'pl' : 'en';
  if (options.description !== false) {
    const description = inLanguage(term, 'description', details);
    if (description) steps.push({ kind: 'description', ...description });
  }
  if (options.example !== false) {
    const example = inLanguage(term, 'example', details);
    if (example) steps.push({ kind: 'example', ...example });
  }
  return steps;
}

/** Zdania tekstu – czytanie kawałkami (pauza i powrót nie cofają o cały akapit). */
export function sentences(text) {
  const parts = String(text ?? '').match(/[^.!?…]+(?:[.!?…]+["”»)]*|$)/g) ?? [];
  const result = parts.map((part) => part.trim()).filter(Boolean);
  return result.length > 0 ? result : [String(text ?? '').trim()].filter(Boolean);
}

/**
 * Wersje notatki do przeczytania: [{ html, lang }]. 'pl' i 'en' – wybrana wersja, a gdy jej nie ma,
 * druga; 'both' – obie, które są; 'off' – żadna.
 */
export function noteVersions(note, mode) {
  if (!note || mode === 'off') return [];
  const pl = isEmptyNoteHtml(note.html ?? '') ? null : { html: note.html, lang: 'pl' };
  const en = isEmptyNoteHtml(note.htmlEN ?? '') ? null : { html: note.htmlEN, lang: 'en' };
  if (mode === 'both') return [pl, en].filter(Boolean);
  const [wanted, other] = mode === 'en' ? [en, pl] : [pl, en];
  return [wanted ?? other].filter(Boolean);
}

/**
 * Kroki notatki lekcji: zapowiedź („Notatka do lekcji …”) i kolejne zdania – bez podziałów
 * stron, odwołań do obrazów i punktorów list. Przy obu wersjach angielska ma własną zapowiedź.
 */
export function noteSteps(note, lessonName, mode) {
  const versions = noteVersions(note, mode);
  if (versions.length === 0) return [];
  const steps = [{ kind: 'noteTitle', text: `Notatka do lekcji ${lessonName}.`, lang: 'pl' }];
  versions.forEach((version, index) => {
    if (index > 0) steps.push({ kind: 'noteTitle', text: 'English version.', lang: 'en' });
    const lines = noteText(version.html).split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && line !== PAGE_BREAK_LINE && referenceLabel(line) === null);
    for (const line of lines) {
      for (const sentence of sentences(line.replace(/^•\s*/, ''))) steps.push({ kind: 'note', text: sentence, lang: version.lang });
    }
  });
  // Notatka bez tekstu do przeczytania (np. same odwołania do obrazów) – bez zapowiedzi.
  return steps.some((step) => step.kind === 'note') ? steps : [];
}

/** Zapowiedź na początku: „Zaczynamy. 20 pojęć.”, z notatkami: „Zaczynamy. Notatka lekcji i 20 pojęć.” */
export function introText(count, notes = 0) {
  if (notes > 0) return `Zaczynamy. ${notes === 1 ? 'Notatka lekcji' : pluralNotes(notes)} i ${pluralTerms(count)}.`;
  return `Zaczynamy. ${pluralTerms(count)}.`;
}

/** Zakończenie: „Koniec. Odsłuchano 20 pojęć.” */
export function outroText(count) {
  return `Koniec. Odsłuchano ${pluralTerms(count)}.`;
}

/** Szacowany czas czytania notatek (ms): notes – [{ steps }] z noteSteps(). */
export function estimateNotes(notes, rate = 1) {
  const speed = CHARACTERS_PER_SECOND * (rate > 0 ? rate : 1);
  let total = 0;
  for (const note of notes) {
    for (const step of note.steps) total += (step.text.length / speed) * 1000 + DETAIL_GAP;
    total += CARD_GAP;
  }
  return total;
}

/** Szacowany czas słuchania (ms) przy danej szybkości mowy. */
export function estimateListening(terms, options = {}, rate = 1) {
  const speed = CHARACTERS_PER_SECOND * (rate > 0 ? rate : 1);
  let total = 0;
  for (const { term, direction } of terms) {
    const steps = listenSteps(term, direction, options);
    for (const step of steps) {
      if (step.kind === 'think') total += step.ms;
      else total += (step.text.length / speed) * 1000 + DETAIL_GAP;
    }
    total += CARD_GAP;
  }
  return total;
}
