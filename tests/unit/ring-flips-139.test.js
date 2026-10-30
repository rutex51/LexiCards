// 1.39: kółko narzędzi przesuwane ręcznie (wycinek zależny od położenia, zapamiętane miejsce)
// i obroty fiszki (1–3, treść stron po kolejnych obrotach).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanToolSettings, defaultToolSettings } from '../../js/core/drawing.js';
import { DEFAULT_FLIP_FACES, FLIP_TURNS, flipFaces, sessionFlipFaces } from '../../js/core/study.js';
import { cleanRingPositions, ringFacing, ringItems } from '../../js/core/tool-ring.js';

const base = { count: 7, rotation: 0, side: 'right', radius: 84, edge: 78, size: 46 };
const visible = (items) => items.filter((item) => item.opacity > 0.9).length;

test('kółko 1.39: przesunięte na środek – cały okrąg; przy rogu – wycinek; kierunek w stronę środka ekranu', () => {
  const fixed = ringItems(base);
  assert.ok(visible(fixed) < 7, 'stałe miejsce przy krawędzi – wycinek');
  const room = (left, top, width = 1280, height = 746) => ({ left, right: width - left, top, bottom: height - top });
  const middle = ringItems({ ...base, free: { angle: ringFacing(640, 373, 1280, 746), room: room(640, 373) } });
  assert.equal(visible(middle), 7, 'z dala od brzegów – wszystkie małe kółka');
  const corner = ringItems({ ...base, free: { angle: ringFacing(70, 660, 1280, 746), room: room(70, 660) } });
  assert.ok(visible(corner) < 7 && visible(corner) >= 2, `przy rogu – część (${visible(corner)})`);
  // Kółka za brzegiem ekranu znikają całkiem.
  assert.ok(corner.every((item) => item.opacity === 0 || (70 + item.x - 23 > 0 && 660 + item.y + 23 <= 746)), 'nic za brzegiem');
  // Wycinek w stronę środka ekranu: z lewego dolnego rogu – w górę w prawo.
  const angle = ringFacing(70, 660, 1280, 746);
  assert.ok(angle < 0 && angle > -90, `kierunek ${angle}`);
  assert.equal(ringFacing(640, 373, 1280, 746), 90, 'w samym środku – w dół');
});

test('kółko 1.39: zapamiętane miejsce – części obszaru 0–1, złe wartości – stałe miejsce; w ustawieniach narzędzi', () => {
  assert.deepEqual(cleanRingPositions(null), { right: null, left: null });
  assert.deepEqual(cleanRingPositions({ right: { x: 0.51234567, y: 1.4 }, left: { x: 'a', y: 0.2 } }), { right: { x: 0.5123, y: 1 }, left: null });
  assert.deepEqual(defaultToolSettings().ringPositions, { right: null, left: null });
  assert.deepEqual(cleanToolSettings({ ringPositions: { left: { x: 0.25, y: 0.75 } } }).ringPositions, { right: null, left: { x: 0.25, y: 0.75 } });
});

test('fiszka 1.39: 1–3 obroty, treść stron (złe – domyślne), w sesji – z jej ustawień albo z ustawień aplikacji', () => {
  assert.deepEqual(flipFaces(1), ['all']);
  assert.deepEqual(flipFaces(2), [...DEFAULT_FLIP_FACES[2]]);
  assert.deepEqual(flipFaces(3, { 3: ['example', 'nope', 'answer'] }), ['example', 'description', 'answer']);
  assert.deepEqual(flipFaces(7, { 3: ['answer'] }), ['all'], 'nieznana liczba obrotów – jeden');
  assert.deepEqual(FLIP_TURNS, ['left', 'right', 'down'], 'od 1.56: dwa obroty w poziomie, trzeci w pionie');
  assert.deepEqual(sessionFlipFaces({ flips: 2, faces: ['details', 'answer'] }, { flashcardFlips: 3 }), ['details', 'answer']);
  assert.deepEqual(sessionFlipFaces({ front: 'term' }, { flashcardFlips: 3, flashcardFaces: { 3: ['answer', 'example', 'description'] } }), ['answer', 'example', 'description']);
  assert.deepEqual(sessionFlipFaces(null, null), ['all']);
});
