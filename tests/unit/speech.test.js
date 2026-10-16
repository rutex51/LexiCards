// Wymowa: strażnik startu, głos zastępczy, czyszczenie zawieszonej kolejki (jak w Safari)
// i sprawdzenie wymowy. Syntezator to atrapa z kolejką; czas odmierza atrapa zegara.

import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';
import {
  AFTER_CANCEL, CHECK_STEPS, START_TIMEOUT, checkSpeech, describeCheck, forgetSilentVoices, silentVoice, speak, speakThen,
  stopSpeaking
} from '../../js/ui/speech.js';

const VOICES = [
  { voiceURI: 'pl-zosia', name: 'Zosia', lang: 'pl-PL', default: true, localService: true },
  { voiceURI: 'com.apple.speech.synthesis.voice.Albert', name: 'Albert', lang: 'en-US', default: false, localService: true },
  { voiceURI: 'en-bubbles', name: 'Bubbles', lang: 'en-US', default: false, localService: true },
  { voiceURI: 'en-daniel', name: 'Daniel', lang: 'en-GB', default: false, localService: true },
  { voiceURI: 'en-karen', name: 'Karen', lang: 'en-AU', default: false, localService: true },
  { voiceURI: 'en-samantha', name: 'Samantha', lang: 'en-US', default: false, localService: true }
];
const START_DELAY = 20;
const SPEAK_TIME = 200;

/**
 * Syntezator z kolejką. behaviour[voiceURI | 'default']:
 * 'hang' – nie zaczyna i blokuje kolejkę, 'error' – błąd przed startem, 'endless' – zaczyna, ale nie kończy.
 */
function installSynth({ voices = VOICES, behaviour = {} } = {}) {
  const heard = [];
  const queue = [];
  let current = null;
  let timer = null;
  const synth = {
    paused: false,
    cancels: 0,
    resumes: 0,
    getVoices: () => voices,
    get speaking() { return current !== null; },
    get pending() { return queue.length > 0; },
    speak(utterance) {
      queue.push(utterance);
      if (!current && !synth.paused) next();
    },
    cancel() {
      synth.cancels += 1;
      clearTimeout(timer);
      const stopped = [current, ...queue].filter((item) => item && mode(item) !== 'hang');
      current = null;
      queue.length = 0;
      for (const utterance of stopped) utterance.onerror?.({ error: 'interrupted' });
    },
    resume() {
      synth.resumes += 1;
      synth.paused = false;
      if (!current) next();
    }
  };
  const mode = (utterance) => behaviour[utterance.voice?.voiceURI ?? 'default'] ?? 'ok';
  function next() {
    current = queue.shift() ?? null;
    const utterance = current;
    if (!utterance) return;
    const kind = mode(utterance);
    if (kind === 'hang') return;
    if (kind === 'error') {
      timer = setTimeout(() => {
        current = null;
        utterance.onerror?.({ error: 'synthesis-failed' });
        next();
      }, 5);
      return;
    }
    timer = setTimeout(() => {
      heard.push(`${utterance.voice?.name ?? 'domyślny'} (${utterance.lang}): ${utterance.text}`);
      utterance.onstart?.({});
      if (kind === 'endless') return;
      timer = setTimeout(() => {
        current = null;
        utterance.onend?.({});
        next();
      }, SPEAK_TIME);
    }, START_DELAY);
  }
  globalThis.window = {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
    }
  };
  return { synth, heard };
}

/** Upływ czasu krokami po 1 ms – atrapa zegara nie uruchamia w jednym tick() liczników ustawionych w jego trakcie. */
function advance(ms) {
  for (let step = 0; step < ms; step += 1) mock.timers.tick(1);
}

/** speakThen z zapisem wyniku. */
function say(text, language, settings) {
  const outcome = { result: null };
  outcome.cancel = speakThen(text, language, settings, (result) => { outcome.result = result; });
  return outcome;
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  forgetSilentVoices();
});

afterEach(() => {
  stopSpeaking();
  mock.timers.reset();
  delete globalThis.window;
});

const DANIEL = { preferredVoicePL: 'pl-zosia', preferredVoiceEN: 'en-daniel', speechRate: 1 };

test('głos, który nie zaczyna czytać: kolejka czyszczona, tekst czyta głos zastępczy (nie efekt dźwiękowy)', () => {
  const { synth, heard } = installSynth({ behaviour: { 'en-daniel': 'hang' } });
  const first = say('assets', 'en', DANIEL);
  advance(START_TIMEOUT - 1);
  assert.deepEqual(heard, []);
  assert.equal(first.result, null, 'jeszcze czeka na start');
  advance(1);
  assert.equal(synth.cancels, 1, 'zawieszona wypowiedź usunięta z kolejki');
  advance(AFTER_CANCEL + START_DELAY + SPEAK_TIME);
  assert.deepEqual(heard, ['Samantha (en-US): assets']);
  assert.deepEqual(first.result, { language: 'en', started: true, voice: 'Samantha', replaced: true, failed: 'Daniel' });
  assert.equal(silentVoice('en', DANIEL), null, 'jeden nieudany start to jeszcze nie wyrok');

  // Kolejna polska wypowiedź nie czeka za zawieszoną.
  const polish = say('aktywa', 'pl', DANIEL);
  advance(START_DELAY + SPEAK_TIME);
  assert.equal(heard.at(-1), 'Zosia (pl-PL): aktywa');
  assert.equal(polish.result.replaced, false);

  // Drugi nieudany start – głos pomijany do końca sesji, następne wypowiedzi od razu zastępczym.
  say('liabilities', 'en', DANIEL);
  advance(START_TIMEOUT + AFTER_CANCEL + START_DELAY + SPEAK_TIME);
  assert.equal(heard.at(-1), 'Samantha (en-US): liabilities');
  assert.equal(silentVoice('en', DANIEL), 'Daniel');
  const third = say('profit', 'en', DANIEL);
  advance(START_DELAY);
  assert.equal(heard.at(-1), 'Samantha (en-US): profit', 'bez czekania na wybrany głos');
  advance(SPEAK_TIME);
  assert.deepEqual(third.result, { language: 'en', started: true, voice: 'Samantha', replaced: true, failed: 'Daniel' });

  // Ponowny wybór głosu w ustawieniach daje mu nową szansę.
  forgetSilentVoices('en-daniel');
  assert.equal(silentVoice('en', DANIEL), null);
});

test('błąd przed startem: od razu głos zastępczy; bez innych głosów – domyślny głos systemu', () => {
  const { heard } = installSynth({ behaviour: { 'en-daniel': 'error' } });
  const outcome = say('assets', 'en', DANIEL);
  advance(5 + AFTER_CANCEL + START_DELAY + SPEAK_TIME);
  assert.deepEqual(heard, ['Samantha (en-US): assets']);
  assert.equal(outcome.result.failed, 'Daniel');

  // Tylko głosy-efekty poza wybranym – zastępuje domyślny głos systemu, nie „Albert” ani „Bubbles”.
  const only = installSynth({ voices: VOICES.filter((voice) => !['en-samantha', 'en-karen'].includes(voice.voiceURI)), behaviour: { 'en-daniel': 'hang' } });
  const fallback = say('profit', 'en', DANIEL);
  advance(START_TIMEOUT + AFTER_CANCEL + START_DELAY + SPEAK_TIME);
  assert.deepEqual(only.heard, ['domyślny (en-US): profit']);
  assert.deepEqual(fallback.result, { language: 'en', started: true, voice: 'domyślny głos systemu', replaced: true, failed: 'Daniel' });
});

test('pozostałość w kolejce jest usuwana przed nową wypowiedzią; wstrzymany syntezator jest wznawiany', () => {
  const { synth, heard } = installSynth({ behaviour: { 'en-daniel': 'hang' } });
  // Zawieszona wypowiedź spoza aplikacji (np. sprzed przeładowania ustawień).
  const stuck = new window.SpeechSynthesisUtterance('stuck');
  stuck.voice = VOICES[3];
  synth.speak(stuck);
  assert.equal(synth.speaking, true);
  say('aktywa', 'pl', {});
  assert.equal(synth.cancels, 1, 'kolejka wyczyszczona przed wypowiedzią');
  advance(AFTER_CANCEL + START_DELAY + SPEAK_TIME);
  assert.deepEqual(heard, ['domyślny (pl-PL): aktywa']);

  synth.paused = true;
  say('pasywa', 'pl', {});
  assert.equal(synth.resumes, 1);
  advance(START_DELAY + SPEAK_TIME);
  assert.equal(heard.at(-1), 'domyślny (pl-PL): pasywa');
});

test('brak końca po starcie: kolejka czyszczona, czytanie idzie dalej; nic nie działa – wynik bez startu', () => {
  const { synth } = installSynth({ behaviour: { default: 'endless' } });
  const text = 'A statement of assets and liabilities.';
  const outcome = say(text, 'en', {});
  advance(START_DELAY);
  assert.equal(outcome.result, null);
  advance(3000 + text.length * 160 - 1);
  assert.equal(outcome.result, null, 'czeka na koniec tyle, ile może trwać czytanie');
  advance(1);
  assert.equal(outcome.result?.started, true);
  assert.equal(synth.cancels, 1);
  assert.equal(synth.speaking, false, 'kolejka pusta – następna wypowiedź nie czeka');

  // Syntezator nie zaczyna niczego: dwie próby, potem dalej (bez zawieszenia odtwarzacza).
  const dead = installSynth({ behaviour: { default: 'hang', 'en-samantha': 'hang', 'en-karen': 'hang', 'en-daniel': 'hang' } });
  const silent = say('assets', 'en', {});
  advance(2 * START_TIMEOUT + AFTER_CANCEL);
  assert.deepEqual(silent.result, { language: 'en', started: false, voice: null, replaced: false, failed: 'domyślny głos systemu' });
  assert.equal(dead.synth.speaking, false);
  assert.equal(describeCheck(silent.result), 'Głos angielski: brak dźwięku – syntezator nie zaczął czytać.');
});

test('przerwanie: bez wywołania onDone; kolejne speak() przerywa poprzednie', () => {
  const { heard } = installSynth({ behaviour: { 'en-daniel': 'hang' } });
  const outcome = say('assets', 'en', DANIEL);
  outcome.cancel();
  stopSpeaking();
  advance(2 * START_TIMEOUT);
  assert.equal(outcome.result, null);
  assert.deepEqual(heard, [], 'po przerwaniu nie ma powtórki głosem zastępczym');

  speak('aktywa', 'pl', DANIEL);
  advance(START_DELAY + 50);
  speak('pasywa', 'pl', DANIEL);
  advance(AFTER_CANCEL + START_DELAY + SPEAK_TIME);
  assert.deepEqual(heard, ['Zosia (pl-PL): aktywa', 'Zosia (pl-PL): pasywa']);
});

test('sprawdzenie wymowy: polski, angielski, polski – wynik każdego kroku', () => {
  installSynth({ behaviour: { 'en-daniel': 'hang' } });
  // Głos uznany wcześniej za niedziałający dostaje w sprawdzeniu nową szansę.
  for (let index = 0; index < 2; index += 1) {
    say('x', 'en', DANIEL);
    advance(START_TIMEOUT + AFTER_CANCEL + START_DELAY + SPEAK_TIME);
  }
  assert.equal(silentVoice('en', DANIEL), 'Daniel');
  const progress = [];
  checkSpeech(() => DANIEL, (results, finished) => progress.push({ count: results.length, finished, results }));
  assert.equal(silentVoice('en', DANIEL), null);
  advance(20_000);
  assert.deepEqual(progress.map(({ count, finished }) => `${count}${finished ? '!' : ''}`), ['1', '2', '3!']);
  const results = progress.at(-1).results;
  assert.deepEqual(results.map((result) => result.text), CHECK_STEPS.map((step) => step.text));
  assert.deepEqual(results.map(describeCheck), [
    'Głos polski: działa („Zosia”).',
    'Głos angielski: „Daniel” nie odezwał się – przeczytał zastępczy „Samantha”.',
    'Głos polski: działa („Zosia”).'
  ]);
  // Głos, który w sprawdzeniu się nie odezwał, jest od razu pomijany.
  assert.equal(silentVoice('en', DANIEL), 'Daniel');
});

test('dziennik dźwięku: wypowiedzi, start, koniec i strażnik – z godziną; cisza w tle to poprawny plik WAV', async () => {
  const { clearSpeechLog, speechLogEntries, speechLogText } = await import('../../js/ui/speech.js');
  const { silentWav } = await import('../../js/ui/audio-keepalive.js');
  installSynth({ behaviour: { 'en-daniel': 'hang' } });
  clearSpeechLog();
  say('assets', 'en', DANIEL);
  advance(START_TIMEOUT + AFTER_CANCEL + START_DELAY + SPEAK_TIME);
  assert.deepEqual(speechLogEntries().map(({ type, detail }) => `${type}${detail ? ` ${detail}` : ''}`), [
    'mów en Daniel „assets”',
    'brak startu 4 s',
    'czyszczenie kolejki',
    'mów en Samantha „assets”',
    'start głos zastępczy',
    'koniec'
  ]);
  const lines = speechLogText().split('\n');
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^\d\d:\d\d:\d\d\.\d {2}mów {2}en Daniel „assets”$/);

  // Cisza: nagłówek RIFF/WAVE, PCM mono 16 bit 8 kHz, same zera.
  const wav = new DataView(silentWav(1, 8000));
  const text = (offset) => String.fromCharCode(...[0, 1, 2, 3].map((index) => wav.getUint8(offset + index)));
  assert.deepEqual([text(0), text(8), text(12), text(36)], ['RIFF', 'WAVE', 'fmt ', 'data']);
  assert.deepEqual([wav.getUint16(20, true), wav.getUint16(22, true), wav.getUint32(24, true), wav.getUint16(34, true)], [1, 1, 8000, 16]);
  assert.equal(wav.byteLength, 44 + 16000);
  assert.equal(wav.getUint32(40, true), 16000);
  let loud = 0;
  for (let offset = 44; offset < wav.byteLength; offset += 2) if (wav.getInt16(offset, true) !== 0) loud += 1;
  assert.equal(loud, 0);
});
