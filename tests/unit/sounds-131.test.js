// Dźwięki 1.31: fiszka odlatująca (szum w stronę lotu). Od 1.31.1 kartka to nagranie (sounds/kartka.wav):
// plik bez dudnienia i bez metadanych, klapnięcie w opisanej chwili, przesunięcie nagrania tak, by
// klapnięcie wypadło z końcem animacji.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { defaultSettings } from '../../js/core/model.js';
import { PAGE_FILE, PAGE_FILE_LAND, cardSound, pageTiming, roomImpulse } from '../../js/core/sounds.js';

const RATE = 24000;
function energy(samples, a, b, rate = RATE) {
  let sum = 0;
  const from = Math.round(a * rate), to = Math.min(samples.length, Math.round(b * rate));
  for (let i = from; i < to; i += 1) sum += samples[i] ** 2;
  return sum / Math.max(1, to - from);
}
const finite = (sound) => [...sound.left, ...sound.right].every((value) => Number.isFinite(value) && Math.abs(value) <= 1);

/** Plik WAV: { rate, channels, bits, samples (−1…1), chunks }. */
function readWav(path) {
  const data = readFileSync(path);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  const chunks = [];
  let format = null, samples = null;
  for (let at = 12; at + 8 <= data.length;) {
    const id = data.toString('ascii', at, at + 4);
    const size = data.readUInt32LE(at + 4);
    chunks.push(id);
    if (id === 'fmt ') format = { pcm: data.readUInt16LE(at + 8), channels: data.readUInt16LE(at + 10), rate: data.readUInt32LE(at + 12), bits: data.readUInt16LE(at + 22) };
    if (id === 'data') {
      samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i += 1) samples[i] = data.readInt16LE(at + 8 + i * 2) / 32768;
    }
    at += 8 + size + (size % 2);
  }
  return { ...format, samples, chunks };
}

test('dźwięki 1.31.1: nagranie kartki – mono 32 kHz, 1,14 s, bez metadanych, klapnięcie po 0,765 s, bez dudnienia', () => {
  const wav = readWav(new URL(`../../${PAGE_FILE}`, import.meta.url));
  assert.deepEqual([wav.pcm, wav.channels, wav.rate, wav.bits], [1, 1, 32000, 16]);
  assert.deepEqual(wav.chunks, ['fmt ', 'data'], 'w pliku tylko dźwięk – bez daty nagrania i innych opisów');
  assert.ok(Math.abs(wav.samples.length / wav.rate - 1.14) < 0.005);
  // Najgłośniejsze 10 ms – klapnięcie kartki – w opisanej chwili.
  const window = 320;
  let loudest = 0, best = -1;
  for (let i = 0; i + window < wav.samples.length; i += 32) {
    const value = energy(wav.samples, i / wav.rate, (i + window) / wav.rate, wav.rate);
    if (value > best) { best = value; loudest = (i + window / 2) / wav.rate; }
  }
  assert.ok(Math.abs(loudest - PAGE_FILE_LAND) < 0.02, `klapnięcie po ${loudest} s`);
  // Dudnienie (poniżej ok. 100 Hz) wycięte: filtr dolnoprzepustowy pierwszego rzędu 100 Hz zostawia
  // niewiele energii w porównaniu z całością.
  const k = Math.exp(-2 * Math.PI * 100 / wav.rate);
  let low = 0, lowSum = 0, all = 0;
  for (const value of wav.samples) {
    low = (1 - k) * value + k * low;
    lowSum += low ** 2;
    all += value ** 2;
  }
  assert.ok(lowSum / all < 0.02, `udział niskich tonów ${(lowSum / all).toFixed(4)}`);
  const peak = wav.samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  assert.ok(peak > 0.6 && peak < 0.75, `szczyt ${peak}`);
});

test('dźwięki 1.31.1: wyczucie czasu – klapnięcie nagrania z końcem animacji, bez zmiany wysokości', () => {
  const close = (actual, expected) => {
    assert.ok(Math.abs(actual.delay - expected.delay) < 1e-9 && Math.abs(actual.offset - expected.offset) < 1e-9, JSON.stringify(actual));
  };
  close(pageTiming(0.72), { delay: 0, offset: 0.045 });
  close(pageTiming(0.9), { delay: 0.135, offset: 0 });
  close(pageTiming(PAGE_FILE_LAND), { delay: 0, offset: 0 });
  close(pageTiming(0.14), { delay: 0, offset: 0.625 });
  close(pageTiming(0), { delay: 0, offset: PAGE_FILE_LAND });
  close(pageTiming(-1), { delay: 0, offset: PAGE_FILE_LAND });
});

test('dźwięki 1.31: fiszka – w stronę lotu; pogłos; ustawienie domyślnie włączone', () => {
  const left = cardSound({ rate: RATE, direction: -1 });
  const right = cardSound({ rate: RATE, direction: 1 });
  assert.equal(left.duration, 0.26);
  assert.ok(finite(left) && finite(right));
  assert.ok(energy(left.left, 0.1, 0.26) > 2 * energy(left.right, 0.1, 0.26), '„Umiem” – w lewo');
  assert.ok(energy(right.right, 0.1, 0.26) > 2 * energy(right.left, 0.1, 0.26));
  assert.deepEqual(cardSound({ rate: RATE, seed: 4 }).left, cardSound({ rate: RATE, seed: 4 }).left);
  const ir = roomImpulse({ rate: RATE });
  assert.equal(ir.length, Math.round(RATE * 0.22));
  assert.ok(ir.every(Number.isFinite));
  assert.equal(defaultSettings().sounds, true);
});
