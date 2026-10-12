// Słuchanie (np. w samochodzie): aplikacja czyta pojęcie, daje chwilę na zastanowienie,
// czyta odpowiedź, a potem definicję i przykład. Bez zależności od przeglądarki – tu powstaje
// tylko scenariusz kroków; czyta go odtwarzacz w interfejsie.
//
// Słuchanie nie zmienia harmonogramu powtórek (FSRS): aplikacja nie wie, czy pamiętałeś odpowiedź.

import { DIRECTIONS } from './model.js';
import { pluralTerms } from './text.js';

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

/** Zapowiedź na początku: „Zaczynamy. 20 pojęć.” */
export function introText(count) {
  return `Zaczynamy. ${pluralTerms(count)}.`;
}

/** Zakończenie: „Koniec. Odsłuchano 20 pojęć.” */
export function outroText(count) {
  return `Koniec. Odsłuchano ${pluralTerms(count)}.`;
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
