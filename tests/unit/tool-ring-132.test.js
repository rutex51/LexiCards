// Kółka narzędzi 1.32: grupy (standardowe i zestaw Metrologia), grupa na starcie, układ małych kółek
// (widoczny wycinek, zanikanie przy krawędzi ekranu), obrót z dociągnięciem, schowane elementy interfejsu.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanToolSettings, defaultToolSettings } from '../../js/core/drawing.js';
import { DIM_MODES, SHAPES } from '../../js/core/shapes.js';
import {
  EDIT_ITEMS, QUALITY_ITEMS, RING_CENTER, SOLID_ITEMS, TOOL_GROUPS, USER_GROUPS, clampRotation, cleanUiHidden, findGroup, isModeItem, ringItems, ringStep, rotationFor,
  snapRotation, startGroup, toolItem, uiPartHidden
} from '../../js/core/tool-ring.js';

// Od 1.43 także polecenia edycji geometrii.
const COMMANDS = ['text', 'math', 'table', 'sticky', 'gdt', 'datum', 'roughness', ...EDIT_ITEMS, ...QUALITY_ITEMS, 'vsm', 'diagram:timeline', 'diagram:defects', ...SOLID_ITEMS];

test('kółka 1.32: grupy – każdy kształt i polecenie w grupie standardowej, Metrologia z symbolami, pozycje bez powtórzeń', () => {
  // Od 1.34 także Wymiary, od 1.43 Edycja.
  assert.deepEqual(TOOL_GROUPS.map((group) => group.id), ['write', 'shapes', 'construct', 'text', 'dims', 'symbols', 'edit', 'quality', 'process', 'solids']);
  const items = TOOL_GROUPS.flatMap((group) => group.items);
  assert.equal(new Set(items).size, items.length, 'pozycja w jednej grupie standardowej');
  // Od 1.36 wymiar – cztery pozycje 'dim:<rodzaj>' zamiast 'shape:dim'.
  // Od 1.43 także łamana (narzędzie punkt po punkcie).
  const panelShapes = SHAPES.filter((kind) => kind !== 'polygon' && kind !== 'dim');
  for (const kind of panelShapes) assert.ok(items.includes(`shape:${kind}`), `kształt ${kind} w grupie`);
  for (const mode of DIM_MODES) assert.ok(items.includes(`dim:${mode}`), `wymiar ${mode} w grupie`);
  for (const item of [...items, ...USER_GROUPS.flatMap((group) => group.items)]) {
    const known = item.startsWith('dim:') ? DIM_MODES.includes(item.slice(4)) : ['pen', 'highlighter', 'eraser'].includes(item) || SHAPES.includes(item.slice(6));
    assert.ok(isModeItem(item) ? known : COMMANDS.includes(item), item);
  }
  const metrology = findGroup('left', 'metrology');
  assert.equal(metrology.label, 'Metrologia');
  for (const item of ['gdt', 'datum', 'roughness', 'shape:xline', 'shape:point']) assert.ok(metrology.items.includes(item));
  assert.equal(findGroup('right', 'metrology'), null, 'Metrologia jest po lewej');
  assert.equal(toolItem('shape', 'ellipse'), 'shape:ellipse');
  assert.equal(toolItem('pen', 'rect'), 'pen');
  assert.equal(toolItem('shape', 'dim', 'angle'), 'dim:angle');
  assert.equal(toolItem('shape', 'dim'), 'dim:linear');
});

test('kółka 1.32: grupa na starcie – zapamiętana, inaczej z bieżącym narzędziem, inaczej „Pisanie”', () => {
  assert.deepEqual(startGroup('left:metrology', 'pen'), { side: 'left', id: 'metrology' });
  assert.deepEqual(startGroup('right:symbols', 'pen'), { side: 'right', id: 'symbols' });
  assert.deepEqual(startGroup('left:shapes', 'shape:xline'), { side: 'right', id: 'construct' }, 'nieznana grupa po lewej');
  assert.deepEqual(startGroup(null, 'shape:rect'), { side: 'right', id: 'shapes' });
  assert.deepEqual(startGroup(42, 'select'), { side: 'right', id: 'write' });
});

test('kółka 1.32: małe kółka – co 45°, wycinek ok. 40% okręgu do środka ekranu, zanikanie dalej i przy krawędzi', () => {
  assert.deepEqual(ringStep(5), { step: 45, wrap: false });
  assert.deepEqual(ringStep(8), { step: 45, wrap: true });
  // Od 1.44: więcej niż 8 kółek (8 grup i „Grupy narzędzi”) – gęściej, każde w innym miejscu okręgu.
  assert.deepEqual(ringStep(9), { step: 40, wrap: true });
  for (const count of [9, 10, 12]) {
    const angles = ringItems({ count, rotation: 0, side: 'right', radius: 84, edge: 400, size: 46 }).map((item) => Math.round(((item.angle % 360) + 360) % 360));
    assert.equal(new Set(angles).size, count, `${count} kółek bez nakładania: ${angles}`);
  }
  const base = { radius: 84, edge: 400, size: 46 };
  const right = ringItems({ count: 5, rotation: 0, side: 'right', ...base });
  assert.equal(right[0].angle, RING_CENTER.right);
  assert.deepEqual(right.map((item) => item.opacity), [1, 1, 0.111, 0, 0], 'wybrana i sąsiednia w pełni, dalsza zanika');
  // Lewe kółko – lustrzane odbicie prawego.
  const left = ringItems({ count: 5, rotation: 0, side: 'left', ...base });
  left.forEach((item, index) => {
    assert.ok(Math.abs(item.x + right[index].x) < 1e-9 && Math.abs(item.y - right[index].y) < 1e-9, `lustro ${index}`);
  });
  // Widoczny wycinek (kółko widać co najmniej w połowie): 35–50% obwodu.
  let visible = 0;
  for (let rotation = 0; rotation < 360; rotation += 1) {
    const [item] = ringItems({ count: 8, rotation, side: 'right', ...base });
    if (item.opacity >= 0.5) visible += 1;
  }
  assert.ok(visible / 360 >= 0.35 && visible / 360 <= 0.5, `wycinek ${visible / 360}`);
  // Krawędź ekranu: kółko blisko krawędzi znika płynnie.
  const near = ringItems({ count: 8, rotation: 90, side: 'right', radius: 84, edge: 78, size: 46 });
  const toEdge = near.find((item) => Math.abs(item.angle - 32) < 1e-9);
  assert.equal(toEdge.opacity, 0, 'kółko za krawędzią ekranu');
  const margin = ringItems({ count: 8, rotation: 45, side: 'right', radius: 84, edge: 78, size: 46 }).find((item) => Math.abs(item.angle - 77) < 1e-9);
  assert.equal(margin.opacity, 1, 'kółko pod dużym kółkiem – widoczne');
});

test('kółka 1.32: obrót – bez zawijania zatrzymuje się na pierwszej i ostatniej grupie, z zawijaniem dociąga po najkrótszej drodze', () => {
  assert.equal(clampRotation(-30, 5), 0);
  assert.equal(clampRotation(400, 5), 180);
  assert.deepEqual(snapRotation(70, 5), { index: 2, rotation: 90 });
  assert.deepEqual(snapRotation(-500, 5), { index: 0, rotation: 0 });
  assert.deepEqual(snapRotation(-50, 8), { index: 7, rotation: -45 });
  assert.equal(rotationFor(3, 5, 0), 135);
  assert.equal(rotationFor(7, 8, 0), -45, 'ostatnia grupa – obrót w drugą stronę, nie o 315°');
  assert.equal(rotationFor(0, 8, 350), 360);
});

test('kółka 1.32: schowane elementy – zapis na urządzeniu, lewe kółko domyślnie schowane tylko na telefonie', () => {
  const clean = cleanUiHidden({ top: true, right: 'tak', left: false, extra: true });
  assert.deepEqual(clean, { right: false, left: false, top: true, bottom: false, info: false, status: false });
  const fresh = cleanUiHidden(null);
  assert.equal(fresh.left, null);
  assert.equal(uiPartHidden(fresh, 'left', true), true, 'telefon');
  assert.equal(uiPartHidden(fresh, 'left', false), false, 'iPad i komputer');
  assert.equal(uiPartHidden(clean, 'top', false), true);
  const settings = cleanToolSettings({ ...defaultToolSettings(), toolGroup: 'left:metrology', uiHidden: { bottom: true } });
  assert.equal(settings.toolGroup, 'left:metrology');
  assert.equal(settings.uiHidden.bottom, true);
  assert.equal(cleanToolSettings({ toolGroup: 'x'.repeat(80) }).toolGroup, null);
});
