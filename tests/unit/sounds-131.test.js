// Dźwięki 1.31: fiszka odlatująca (szum w stronę lotu) i kartka „album – gruby papier” – długość
// według animacji (klapnięcie w chwili końca przewracania), stereo za kartką, powtarzalność.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultSettings } from '../../js/core/model.js';
import { PAGE_LAND, cardSound, pageSound, roomImpulse } from '../../js/core/sounds.js';

const RATE = 24000;
/** Średnia energia kanału w przedziale [a, b) sekund. */
function energy(samples, a, b) {
  let sum = 0;
  const from = Math.round(a * RATE), to = Math.min(samples.length, Math.round(b * RATE));
  for (let i = from; i < to; i += 1) sum += samples[i] ** 2;
  return sum / Math.max(1, to - from);
}
const finite = (sound) => [...sound.left, ...sound.right].every((value) => Number.isFinite(value) && Math.abs(value) <= 1);

test('dźwięki 1.31: kartka – klapnięcie razem z końcem przewracania, dłuższa animacja – dłuższy dźwięk', () => {
  for (const land of [0.72, 0.9]) {
    const sound = pageSound({ rate: RATE, land });
    assert.ok(Math.abs(sound.land - land) < 1e-9, 'klapnięcie w chwili końca animacji');
    assert.ok(Math.abs(sound.duration - (land / PAGE_LAND + 0.05)) < 0.001);
    assert.equal(sound.left.length, Math.round(sound.duration * RATE));
    assert.ok(finite(sound));
    // Klapnięcie słychać: tuż po `land` głośniej niż chwilę przed nim i niż na końcu.
    const mix = sound.left.map((value, index) => value + sound.right[index]);
    const slap = energy(mix, land, land + 0.03);
    assert.ok(slap > 2 * energy(mix, land - 0.08, land - 0.02), `klapnięcie ${land}`);
    assert.ok(slap > 10 * energy(mix, sound.duration - 0.03, sound.duration));
  }
  assert.ok(pageSound({ rate: RATE, land: 0.9 }).duration > pageSound({ rate: RATE, land: 0.72 }).duration + 0.2);
});

test('dźwięki 1.31: kartka idzie z prawej na lewą (wstecz – odwrotnie), fiszka – w stronę lotu', () => {
  const forward = pageSound({ rate: RATE, land: 0.72 });
  assert.ok(energy(forward.right, 0, 0.25) > energy(forward.left, 0, 0.25), 'początek z prawej');
  assert.ok(energy(forward.left, 0.7, 0.8) > energy(forward.right, 0.7, 0.8), 'klapnięcie z lewej');
  const back = pageSound({ rate: RATE, land: 0.72, direction: -1 });
  assert.ok(energy(back.left, 0, 0.25) > energy(back.right, 0, 0.25));
  assert.ok(energy(back.right, 0.7, 0.8) > energy(back.left, 0.7, 0.8));
  const left = cardSound({ rate: RATE, direction: -1 });
  const right = cardSound({ rate: RATE, direction: 1 });
  assert.equal(left.duration, 0.26);
  assert.ok(finite(left) && finite(right));
  assert.ok(energy(left.left, 0.1, 0.26) > 2 * energy(left.right, 0.1, 0.26), '„Umiem” – w lewo');
  assert.ok(energy(right.right, 0.1, 0.26) > 2 * energy(right.left, 0.1, 0.26));
});

test('dźwięki 1.31: ten sam zarodek – ta sama kartka, inny – trochę inna; pogłos i ustawienie', () => {
  const a = pageSound({ rate: RATE, land: 0.72, seed: 3 });
  const b = pageSound({ rate: RATE, land: 0.72, seed: 3 });
  const c = pageSound({ rate: RATE, land: 0.72, seed: 16 });
  assert.deepEqual(a.left, b.left);
  assert.notDeepEqual(a.left, c.left);
  assert.equal(a.left.length, c.left.length, 'odmiany tej samej długości');
  const ir = roomImpulse({ rate: RATE });
  assert.equal(ir.length, Math.round(RATE * 0.22));
  assert.ok(ir.every(Number.isFinite));
  assert.equal(defaultSettings().sounds, true);
});
