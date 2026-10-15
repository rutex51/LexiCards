// Wymowa przez syntezator mowy przeglądarki (Web Speech API). Nic nie jest wysyłane
// do zewnętrznych usług – głosy pochodzą z systemu urządzenia.
//
// Safari (zwłaszcza na iPhonie) potrafi „zawiesić” wypowiedź: nie zaczyna jej czytać, nie
// zgłasza ani końca, ani błędu, a każda następna czeka za nią w kolejce – syntezator milknie
// aż do przeładowania strony. Dlatego każda wypowiedź ma strażnika:
// - gdy nie zacznie się w ciągu START_TIMEOUT (albo zgłosi błąd przed startem), kolejka jest
//   czyszczona (cancel), a tekst czytany jeszcze raz – głosem zastępczym,
// - głos, który nie odezwał się dwa razy, choć zastępczy tak, jest do końca sesji pomijany
//   (ustawienia i ekran słuchania o tym informują),
// - gdy po starcie koniec nie nadejdzie w czasie dopasowanym do długości tekstu, kolejka jest
//   czyszczona i czytanie idzie dalej,
// - przed wypowiedzią pozostałości w kolejce są usuwane, a wstrzymany syntezator wznawiany.

const LANGUAGE_TAGS = { pl: 'pl-PL', en: 'en-US' };
const LANGUAGE_NAMES = { pl: 'polski', en: 'angielski' };

/** Czas na rozpoczęcie wypowiedzi; po nim – powtórka głosem zastępczym (ms). */
export const START_TIMEOUT = 4000;
/** Po cancel() Safari potrafi zgubić wypowiedź podaną od razu – krótki odstęp (ms). */
export const AFTER_CANCEL = 150;
/** Zapas na koniec wypowiedzi po jej starcie: stała + czas na znak przy szybkości 1 (ms). */
const END_MARGIN = 3000;
const MS_PER_CHARACTER = 160;
/** Po tylu nieudanych startach głos jest pomijany do końca sesji. */
const SILENT_AFTER = 2;

/** Głosy-efekty z systemów Apple – nie nadają się na zastępstwo. */
const NOVELTY_URI = /speech\.synthesis\.voice|eloquence/i;
const NOVELTY_NAMES = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'fred', 'good news',
  'hysterical', 'jester', 'junior', 'kathy', 'organ', 'pipe organ', 'princess', 'ralph', 'superstar',
  'trinoids', 'whisper', 'wobble', 'zarvox'
]);
const NOVELTY_RANK = 8;

export const SPEECH_RATES = Object.freeze([
  { value: 0.7, label: 'Wolno' },
  { value: 0.85, label: 'Nieco wolniej' },
  { value: 1, label: 'Normalnie' },
  { value: 1.15, label: 'Szybko' }
]);

/** Bieżąca wypowiedź – odwołanie trzymane do końca czytania, bez niego przeglądarka może ją urwać. */
let current = null;
/** Bieżące zadanie mowy (jedno naraz). */
let active = null;
/** Nieudane starty głosów w tej sesji: voiceURI albo „default:pl” → liczba. */
const failures = new Map();
/** Kiedy strona ostatnio zniknęła z ekranu – zablokowany telefon to nie wina głosu. */
let lastHiddenAt = -Infinity;
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lastHiddenAt = Date.now();
  });
}

export function speechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/** Głosy systemowe dla języka 'pl' albo 'en' (lista bywa pusta, dopóki system jej nie wczyta). */
export function listVoices(language) {
  if (!speechAvailable()) return [];
  const prefix = language.toLowerCase();
  return window.speechSynthesis.getVoices()
    .filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

/** Wywołuje `listener`, gdy system udostępni listę głosów. Zwraca funkcję wyrejestrowującą. */
export function onVoicesChanged(listener) {
  if (!speechAvailable() || typeof window.speechSynthesis.addEventListener !== 'function') return () => {};
  window.speechSynthesis.addEventListener('voiceschanged', listener);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', listener);
}

// ---------------------------------------------------------------- głosy

const voiceKey = (voice, language) => (voice ? voice.voiceURI : `default:${language}`);
const isSilent = (voice, language) => (failures.get(voiceKey(voice, language)) ?? 0) >= SILENT_AFTER;
const voiceName = (voice) => voice?.name ?? 'domyślny głos systemu';

function rateOf(settings) {
  const rate = Number(settings?.speechRate);
  return rate > 0 ? rate : 1;
}

/** Głos wybrany w ustawieniach (gdy jest na liście systemu). */
function chosenVoice(language, settings) {
  const uri = language === 'pl' ? settings?.preferredVoicePL : settings?.preferredVoiceEN;
  return uri ? listVoices(language).find((voice) => voice.voiceURI === uri) ?? null : null;
}

/** Im mniej, tym lepszy zastępca: zwykły głos, dokładnie ten język (pl-PL, en-US), w urządzeniu. */
function voiceRank(voice, language) {
  const name = voice.name.toLowerCase().replace(/\s*\(.*\)\s*$/, '');
  let rank = 0;
  if (NOVELTY_URI.test(voice.voiceURI ?? '') || NOVELTY_NAMES.has(name)) rank += NOVELTY_RANK;
  if (voice.lang.toLowerCase().replace('_', '-') !== LANGUAGE_TAGS[language].toLowerCase()) rank += 2;
  if (voice.localService === false) rank += 1;
  if (!voice.default) rank += 0.5;
  return rank;
}

/**
 * Najlepszy głos języka inny niż `except` i niż głosy, które się nie odzywają; głosy-efekty
 * nigdy – wtedy lepszy jest domyślny głos systemu (null).
 */
function replacementVoice(language, except) {
  let best = null;
  let bestRank = NOVELTY_RANK;
  for (const voice of listVoices(language)) {
    if (voice.voiceURI === except?.voiceURI || isSilent(voice, language)) continue;
    const rank = voiceRank(voice, language);
    if (rank < bestRank) {
      best = voice;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Głosy dla dwóch prób: wybrany (albo domyślny systemu), potem zastępczy. Gdy zastępcy nie ma,
 * druga próba powtarza pierwszą – samo wyczyszczenie kolejki bywa wystarczające.
 */
function attemptVoices(language, chosen) {
  let first = chosen;
  if (chosen && isSilent(chosen, language)) first = replacementVoice(language, chosen);
  else if (!chosen && isSilent(null, language)) first = replacementVoice(language, null);
  const second = first ? replacementVoice(language, first) : replacementVoice(language, null);
  return [first, second && second !== first ? second : (first ? null : second)];
}

/** Nazwa wybranego głosu, który w tej sesji się nie odzywa (czyta za niego zastępczy), albo null. */
export function silentVoice(language, settings) {
  const chosen = chosenVoice(language, settings);
  return chosen && isSilent(chosen, language) ? chosen.name : null;
}

/** Nowa szansa dla głosu (np. po ponownym wybraniu w ustawieniach); bez argumentu – dla wszystkich. */
export function forgetSilentVoices(voiceURI = null) {
  if (voiceURI) failures.delete(voiceURI);
  else failures.clear();
}

// ---------------------------------------------------------------- czytanie

function makeUtterance(text, language, rate, voice) {
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang ?? LANGUAGE_TAGS[language] ?? language;
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  return utterance;
}

/**
 * Zadanie mowy: do dwóch prób, strażnik startu i końca. `onDone(result)` po zakończeniu
 * (także nieudanym); przerwane przez cancel() albo następne zadanie – bez `onDone`.
 * result: { language, started, voice, replaced, failed } – `voice` i `failed` to nazwy głosów.
 */
function startSpeech(text, language, settings, onDone, { strict = false } = {}) {
  const synthesis = window.speechSynthesis;
  const rate = rateOf(settings);
  const chosen = chosenVoice(language, settings);
  const voices = attemptVoices(language, chosen);
  const skipped = Boolean(chosen && voices[0] !== chosen);
  const result = { language, started: false, voice: null, replaced: skipped, failed: skipped ? chosen.name : null };
  let done = false;
  let timer = null;
  let utterance = null;

  const wait = (ms, action) => {
    clearTimeout(timer);
    timer = setTimeout(action, ms);
  };
  const release = () => {
    done = true;
    clearTimeout(timer);
    if (current === utterance) current = null;
    utterance = null;
    if (active === handle) active = null;
  };
  const finish = () => {
    if (done) return;
    release();
    onDone?.(result);
  };
  /** Czyści kolejkę syntezatora; zdarzenia porzuconej wypowiedzi są już ignorowane. */
  const flush = () => {
    utterance = null;
    current = null;
    synthesis.cancel();
  };

  const attempt = (index) => {
    if (done) return;
    const voice = voices[index];
    const spoken = makeUtterance(text, language, rate, voice);
    const since = Date.now();
    let started = false;
    utterance = spoken;
    current = spoken;
    const mine = () => !done && utterance === spoken;
    const fail = () => {
      flush();
      // Zablokowany ekran albo inna aplikacja – to nie wina głosu: ta sama próba jeszcze raz.
      const hidden = lastHiddenAt >= since || (typeof document !== 'undefined' && document.visibilityState === 'hidden');
      if (hidden) wait(AFTER_CANCEL, () => attempt(index));
      else if (index + 1 < voices.length) {
        result.failed ??= voiceName(voice);
        wait(AFTER_CANCEL, () => attempt(index + 1));
      } else finish();
    };
    spoken.onstart = () => {
      if (!mine() || started) return;
      started = true;
      result.started = true;
      result.voice = voiceName(voice);
      const key = voiceKey(voice, language);
      failures.delete(key);
      if (index > 0) {
        result.replaced = true;
        const firstKey = voiceKey(voices[0], language);
        // W sprawdzeniu wymowy jeden nieudany start wystarcza – to celowa próba, nie przypadek.
        if (firstKey !== key) failures.set(firstKey, strict ? SILENT_AFTER : (failures.get(firstKey) ?? 0) + 1);
      }
      wait(END_MARGIN + (text.length * MS_PER_CHARACTER) / rate, () => {
        flush();
        finish();
      });
    };
    spoken.onend = () => {
      if (!mine()) return;
      if (started) finish();
      else fail();
    };
    spoken.onerror = (event) => {
      if (!mine()) return;
      if (started || event?.error === 'interrupted' || event?.error === 'canceled') finish();
      else fail();
    };
    wait(START_TIMEOUT, () => {
      if (mine() && !started) fail();
    });
    if (synthesis.paused && typeof synthesis.resume === 'function') synthesis.resume();
    synthesis.speak(spoken);
  };

  const handle = {
    cancel() {
      if (!done) release();
    }
  };
  active?.cancel();
  active = handle;
  if (synthesis.speaking || synthesis.pending) {
    // Pozostałość po poprzedniej (np. zawieszonej) wypowiedzi.
    synthesis.cancel();
    current = null;
    wait(AFTER_CANCEL, () => attempt(0));
  } else {
    // Bez opóźnienia: pierwsza wypowiedź musi paść w obsłudze dotknięcia (wymóg Safari).
    attempt(0);
  }
  return handle;
}

/**
 * Czyta tekst w języku 'pl' albo 'en'. Kolejne wywołanie przerywa poprzednie,
 * więc ponowne dotknięcie głośnika odtwarza tekst od początku.
 * settings: { speechRate, preferredVoicePL, preferredVoiceEN } – identyfikatory głosów z listVoices().
 */
export function speak(text, language, settings = {}) {
  if (!speechAvailable() || !text) return false;
  startSpeech(text, language, settings, null);
  return true;
}

/**
 * Czyta tekst i wywołuje `onDone(result)`, gdy skończy – także gdy się nie udało (wtedy
 * result.started = false). Zwraca funkcję, która unieważnia oczekiwanie (np. przy pauzie).
 * options.strict – głos, który nie zaczął czytać, od razu uznany za niedziałający.
 */
export function speakThen(text, language, settings, onDone, options = {}) {
  if (!speechAvailable() || !text) {
    const timer = setTimeout(() => onDone({ language, started: false, voice: null, replaced: false, failed: null, skipped: true }), 0);
    return () => clearTimeout(timer);
  }
  const handle = startSpeech(text, language, settings, onDone, options);
  return () => handle.cancel();
}

export function stopSpeaking() {
  active?.cancel();
  active = null;
  current = null;
  if (speechAvailable()) window.speechSynthesis.cancel();
}

// ---------------------------------------------------------------- sprawdzenie wymowy

/** Próba jak w słuchaniu: polski, angielski i znowu polski – zmiana języka jest najczęstszym kłopotem. */
export const CHECK_STEPS = Object.freeze([
  { language: 'pl', text: 'Sprawdzam polski głos.' },
  { language: 'en', text: 'Now the English voice.' },
  { language: 'pl', text: 'I znowu po polsku.' }
]);
const CHECK_GAP = 700;

/**
 * Czyta CHECK_STEPS po kolei, każdy głos dostaje nową szansę; ten, który się nie odezwie, jest
 * od razu pomijany (głos zastępczy, uwaga w ustawieniach). `onProgress(results, finished)`
 * po każdym kroku. Pierwsza wypowiedź pada od razu – wywołuj w obsłudze dotknięcia.
 * Zwraca funkcję przerywającą.
 */
export function checkSpeech(settings, onProgress) {
  forgetSilentVoices();
  const results = [];
  let cancel = null;
  const run = (index) => {
    const step = CHECK_STEPS[index];
    cancel = speakThen(step.text, step.language, settings(), (result) => {
      results.push({ ...result, text: step.text });
      const last = index + 1 >= CHECK_STEPS.length;
      onProgress(results, last);
      if (last) return;
      const timer = setTimeout(() => run(index + 1), CHECK_GAP);
      cancel = () => clearTimeout(timer);
    }, { strict: true });
  };
  run(0);
  return () => {
    cancel?.();
    stopSpeaking();
  };
}

/** Opis wyniku jednego kroku sprawdzenia. */
export function describeCheck(result) {
  const language = LANGUAGE_NAMES[result.language] ?? result.language;
  if (result.skipped) return `Głos ${language}: przeglądarka nie ma syntezatora mowy.`;
  if (!result.started) return `Głos ${language}: brak dźwięku – syntezator nie zaczął czytać.`;
  if (result.replaced) {
    return `Głos ${language}: „${result.failed}” nie odezwał się – przeczytał zastępczy „${result.voice}”.`;
  }
  return `Głos ${language}: działa („${result.voice}”).`;
}
