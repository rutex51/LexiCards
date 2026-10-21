// Odtwarzanie dźwięków (od 1.31): fiszka odlatująca po decyzji i przewracana kartka notatki
// i rysunku. Próbki liczy core/sounds.js przy pierwszym użyciu (bez plików, offline), pogłos małego
// pokoju dodaje Web Audio (ConvolverNode). Kontekst dźwięku powstaje dopiero przy pierwszym dotknięciu
// albo klawiszu – Safari pozwala grać dopiero po geście. Bez <audio> i bez sesji dźwięku: na iPhonie
// takie dźwięki mieszają się z muzyką i milkną przy przełączniku wyciszenia jak dźwięki gier.

import { cardSound, pageSound, roomImpulse } from '../core/sounds.js';

const VOLUME = 0.45;
const WET = 0.16;
/** Każda kartka trochę inna – kilka odmian na zmianę. */
const VARIANTS = 3;
/** Próbki liczone z częstotliwością 24 kHz (pasmo do 12 kHz wystarcza papierowi) – o połowę szybciej; Web Audio przelicza. */
const RATE = 24000;

let enabled = () => true;
let context = null;
let output = null;
const buffers = new Map();
let turn = 0;

/** Dziennik odtworzeń (testy): { sound, land?, offset?, direction, played }. */
export const soundLog = [];

/** enabled() – czy grać (ustawienie „Dźwięki”), sprawdzane przy każdym dźwięku. */
export function configureSounds(options = {}) {
  if (typeof options.enabled === 'function') enabled = options.enabled;
  const unlock = () => {
    if (enabled()) audio();
  };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

function audio() {
  const Context = window.AudioContext ?? window.webkitAudioContext;
  if (!Context) return null;
  if (!context) {
    try {
      context = new Context({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const rate = context.sampleRate;
    const ir = context.createBuffer(2, Math.round(rate * 0.22), rate);
    ir.copyToChannel(roomImpulse({ rate, seed: 101 }), 0);
    ir.copyToChannel(roomImpulse({ rate, seed: 202 }), 1);
    const reverb = context.createConvolver();
    reverb.normalize = false;
    reverb.buffer = ir;
    const wet = context.createGain();
    wet.gain.value = WET;
    output = context.createGain();
    output.gain.value = VOLUME;
    output.connect(context.destination);
    output.connect(reverb);
    reverb.connect(wet);
    wet.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

function bufferOf(key, make) {
  let buffer = buffers.get(key);
  if (!buffer) {
    const rate = RATE;
    const sound = make(rate);
    buffer = context.createBuffer(2, sound.left.length, rate);
    buffer.copyToChannel(sound.left, 0);
    buffer.copyToChannel(sound.right, 1);
    buffer.land = sound.land ?? 0;
    // Pamięć: kilka długości kartek wystarczy (przyciski, przeciąganie, rysunek).
    if (buffers.size > 24) buffers.delete(buffers.keys().next().value);
    buffers.set(key, buffer);
  }
  return buffer;
}

function play(buffer, offset = 0) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  const now = context.currentTime;
  if (offset > 0) {
    // Dźwięk od środka – krótkie wejście bez trzasku.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.015);
  }
  source.connect(gain);
  gain.connect(output);
  source.start(now, offset);
}

function run(entry, start) {
  const played = enabled() && Boolean(audio());
  soundLog.push({ ...entry, played });
  if (soundLog.length > 50) soundLog.shift();
  if (!played) return;
  try {
    start();
  } catch {
    // dźwięk nie jest potrzebny do działania aplikacji
  }
}

/** Następna odmiana dźwięku – liczona zawczasu, po zakończeniu animacji (bez przycięcia następnej). */
function prepareNext(after, key, make) {
  setTimeout(() => {
    if (context && !buffers.has(key)) bufferOf(key, make);
  }, after);
}

const cardKey = (side, variant) => `card:${side}:${variant}`;
const cardMaker = (side, variant) => (rate) => cardSound({ rate, direction: side, seed: 11 + variant * 7 });
const pageKey = (ms, side, variant) => `page:${ms}:${side}:${variant}`;
const pageMaker = (ms, side, variant) => (rate) => pageSound({ rate, land: ms / 1000, direction: side, seed: 3 + variant * 13 });

/** Fiszka odlatuje: direction −1 – w lewo, 1 – w prawo. */
export function playCard(direction = 1) {
  const side = direction < 0 ? -1 : 1;
  turn += 1;
  const variant = turn % VARIANTS;
  run({ sound: 'card', direction: side }, () => {
    play(bufferOf(cardKey(side, variant), cardMaker(side, variant)));
    const next = (variant + 1) % VARIANTS;
    prepareNext(400, cardKey(side, next), cardMaker(side, next));
  });
}

/**
 * Kartka: klapnięcie po `land` ms – razem z końcem animacji. remaining – kartka puszczona w połowie
 * przeciągania: gra końcówka dźwięku kartki przewracanej przez `land` ms, tak by klapnięcie wypadło
 * po `remaining` ms.
 */
export function playPage({ land, direction = 1, remaining = null }) {
  const side = direction < 0 ? -1 : 1;
  const ms = Math.max(200, Math.round(land / 10) * 10);
  turn += 1;
  const variant = turn % VARIANTS;
  const offset = remaining === null ? 0 : Math.max(0, (ms - remaining) / 1000);
  run({ sound: 'page', land: ms, offset: Math.round(offset * 1000), direction: side }, () => {
    play(bufferOf(pageKey(ms, side, variant), pageMaker(ms, side, variant)), offset);
    const next = (variant + 1) % VARIANTS;
    prepareNext(ms + 300, pageKey(ms, side, next), pageMaker(ms, side, next));
  });
}
