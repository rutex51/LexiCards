// Odtwarzanie dźwięków (od 1.31): fiszka odlatująca po decyzji i przewracana kartka notatki
// i rysunku. Fiszkę liczy core/sounds.js przy pierwszym użyciu, pogłos małego pokoju dodaje Web Audio
// (ConvolverNode). Kartka (od 1.31.1) – nagranie sounds/kartka.wav (w pamięci podręcznej do pracy
// offline), wczytywane przy pierwszym geście, bez pogłosu (nagranie ma już swój pokój). Kontekst dźwięku powstaje dopiero przy pierwszym dotknięciu
// albo klawiszu – Safari pozwala grać dopiero po geście. Bez <audio> i bez sesji dźwięku: na iPhonie
// takie dźwięki mieszają się z muzyką i milkną przy przełączniku wyciszenia jak dźwięki gier.

import { PAGE_FILE, cardSound, pageTiming, roomImpulse } from '../core/sounds.js';

const VOLUME = 0.45;
const PAGE_VOLUME = 0.6;
const WET = 0.16;
/** Każda kartka trochę inna – kilka odmian na zmianę. */
const VARIANTS = 3;
/** Próbki liczone z częstotliwością 24 kHz (pasmo do 12 kHz wystarcza papierowi) – o połowę szybciej; Web Audio przelicza. */
const RATE = 24000;

let enabled = () => true;
let context = null;
let output = null;
let pageOutput = null;
let pageBuffer = null;
let pageLoading = null;
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
    pageOutput = context.createGain();
    pageOutput.gain.value = PAGE_VOLUME;
    pageOutput.connect(context.destination);
    loadPage();
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

/** Nagranie kartki: pobranie (z pamięci podręcznej aplikacji) i odczyt – raz; nieudane – przy następnej kartce. */
function loadPage() {
  if (!pageLoading) {
    pageLoading = fetch(new URL(PAGE_FILE, document.baseURI))
      .then((response) => {
        if (!response.ok) throw new Error(`Nagranie kartki: ${response.status}`);
        return response.arrayBuffer();
      })
      // Starsze Safari zna tylko odczyt z wywołaniem zwrotnym.
      .then((data) => new Promise((resolve, reject) => context.decodeAudioData(data, resolve, reject)))
      .then((buffer) => {
        pageBuffer = buffer;
        return buffer;
      })
      .catch(() => {
        pageLoading = null;
        return null;
      });
  }
  return pageLoading;
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
 * Kartka: klapnięcie (najgłośniejsza chwila nagrania) po `land` ms – razem z końcem animacji.
 * remaining – kartka puszczona w połowie przeciągania: klapnięcie po `remaining` ms, nagranie od środka.
 * Dźwięk idzie za kartką: z prawej na lewą (wstecz – odwrotnie).
 */
export function playPage({ land, direction = 1, remaining = null }) {
  const side = direction < 0 ? -1 : 1;
  const goal = (remaining ?? land) / 1000;
  const { delay, offset } = pageTiming(goal);
  turn += 1;
  // Każda kartka trochę inna: minimalnie szybciej albo wolniej (±1,5%).
  const rate = 1 + ((turn % VARIANTS) - 1) * 0.015;
  run({ sound: 'page', land: Math.round(land), offset: Math.round(offset * 1000), delay: Math.round(delay * 1000), direction: side }, () => {
    const asked = performance.now();
    const start = (buffer) => {
      if (!buffer) return;
      // Nagranie wczytane dopiero teraz – klapnięcie i tak razem z końcem animacji.
      const late = (performance.now() - asked) / 1000;
      if (late > goal) return;
      const timing = pageTiming(goal - late);
      const when = context.currentTime + timing.delay;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const gain = context.createGain();
      if (timing.offset > 0) {
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(1, when + 0.015);
      }
      source.connect(gain);
      let last = gain;
      if (typeof context.createStereoPanner === 'function') {
        const pan = context.createStereoPanner();
        pan.pan.setValueAtTime(0.5 * side, when);
        pan.pan.linearRampToValueAtTime(-0.5 * side, when + Math.max(0.05, goal - late - timing.delay));
        gain.connect(pan);
        last = pan;
      }
      last.connect(pageOutput);
      source.start(when, timing.offset);
    };
    if (pageBuffer) start(pageBuffer);
    else loadPage().then(start);
  });
}
