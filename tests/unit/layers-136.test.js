// Warstwy 1.36: lista warstw (tło, obraz, warstwy elementów), sygnatury elementów (rząd 1–3), wygląd
// kaskadowo (ukrycie, krycie, nasycenie), nasycenie koloru, zapis w rysunku (format 11).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRAWING_VERSION, cleanDrawing, emptyDrawing, eraseAt, translateStroke } from '../../js/core/drawing.js';
import {
  BACKGROUND_LAYER, LAYER_LIMIT, PHOTO_LAYER, addLayer, cleanLayers, cleanSignatures, defaultLayers, drawingLayers, elementLayers, layerUse,
  layersActive, layersOf, levelEffect, nextLayerId, removeLayer, saturateHex, strokeEffect, toneStroke, updateLayer, withSignatures
} from '../../js/core/layers.js';
import { translateItem } from '../../js/core/arrays.js';

const pen = (layers) => ({ tool: 'pen', color: '#d70015', points: [10, 10, 2, 50, 10, 2, 90, 10, 2], ...(layers ? { layers } : {}) });

test('warstwy 1.36: domyślnie tło, obraz i pięć warstw; sprawdzanie, dodawanie, zmiana, usuwanie pustej', () => {
  const base = defaultLayers();
  assert.deepEqual(base.map((layer) => [layer.id, layer.name]),
    [[-1, 'Tło'], [0, 'Obraz'], [1, 'Warstwa 1'], [2, 'Warstwa 2'], [3, 'Warstwa 3'], [4, 'Warstwa 4'], [5, 'Warstwa 5']]);
  assert.ok(base.every((layer) => !layer.hidden && layer.opacity === 100 && layer.saturation === 100));
  assert.equal(layersActive(base), false);
  assert.deepEqual(drawingLayers({}), base, 'rysunek bez warstw');
  // Sprawdzanie: poziomy stałe zawsze (z nazwą stałą), warstwa 1 zawsze, liczby 0–100, nazwy przycięte.
  const clean = cleanLayers([
    { id: 7, name: '  Wymiary  ', hidden: true, opacity: 140, saturation: -5 },
    { id: -1, name: 'Inna nazwa', opacity: 50 },
    { id: 7, name: 'Powtórka' },
    { id: 0.5 }, { id: 2000 }, null,
    { id: 3, name: 'x'.repeat(50) }
  ]);
  assert.deepEqual(clean.map((layer) => layer.id), [-1, 0, 7, 3, 1]);
  assert.deepEqual(clean[0], { id: -1, name: 'Tło', hidden: false, opacity: 50, saturation: 100 });
  assert.deepEqual(clean[2], { id: 7, name: 'Wymiary', hidden: true, opacity: 100, saturation: 0 });
  assert.equal(clean[3].name.length, 30);
  assert.deepEqual(cleanLayers('x'), base);
  // Dodawanie – następny numer, najwyżej LAYER_LIMIT warstw elementów.
  assert.equal(nextLayerId(base), 6);
  const six = addLayer(base);
  assert.deepEqual(six.at(-1), { id: 6, name: 'Warstwa 6', hidden: false, opacity: 100, saturation: 100 });
  let many = base;
  for (let index = 0; index < 40; index += 1) many = addLayer(many);
  assert.equal(elementLayers(many).length, LAYER_LIMIT);
  assert.equal(nextLayerId(many), null);
  assert.equal(elementLayers(cleanLayers(Array.from({ length: 40 }, (_, index) => ({ id: index + 1 })))).length, LAYER_LIMIT);
  // Zmiana – nazwy tła stałe; usuwanie – tylko pustej warstwy innej niż 1.
  const renamed = updateLayer(base, 2, { name: 'Osie', opacity: 40 });
  assert.deepEqual([renamed[3].name, renamed[3].opacity], ['Osie', 40]);
  assert.equal(updateLayer(base, BACKGROUND_LAYER, { name: 'X' })[0].name, 'Tło');
  const strokes = [pen([2]), pen()];
  assert.deepEqual([layerUse(strokes, 1), layerUse(strokes, 2), layerUse(strokes, 3)], [1, 1, 0]);
  assert.equal(removeLayer(base, strokes, 2), base, 'używana zostaje');
  assert.equal(removeLayer(base, strokes, 1), base, 'warstwa 1 zostaje');
  assert.deepEqual(elementLayers(removeLayer(base, strokes, 3)).map((layer) => layer.id), [1, 2, 4, 5]);
});

test('warstwy 1.36: sygnatury – do trzech, bez powtórzeń, tylko istniejące warstwy; sama warstwa 1 – bez pola', () => {
  assert.deepEqual(layersOf(pen()), [1]);
  assert.deepEqual(layersOf(pen([3, 2])), [3, 2]);
  assert.deepEqual(cleanSignatures([2, 2, 4, 0, -1, 1.5, 5, 3]), [2, 4, 5]);
  assert.equal(cleanSignatures([1]), null);
  assert.equal(cleanSignatures([]), null);
  assert.equal(cleanSignatures('2'), null);
  assert.deepEqual(cleanSignatures([9, 2], new Set([1, 2, 3])), [2], 'nieistniejąca warstwa wypada');
  assert.deepEqual(withSignatures(pen(), [1, 3]).layers, [1, 3]);
  assert.equal('layers' in withSignatures(pen([2]), [1]), false);
});

test('warstwy 1.36: wygląd kaskadowo – ukryta którakolwiek, krycie i nasycenie mnożą się; tło i obraz osobno', () => {
  let layers = defaultLayers();
  layers = updateLayer(layers, 1, { opacity: 50 });
  layers = updateLayer(layers, 2, { saturation: 40 });
  layers = updateLayer(layers, 3, { hidden: true });
  layers = updateLayer(layers, PHOTO_LAYER, { saturation: 0 });
  assert.equal(layersActive(layers), true);
  // Pięć prostokątów: wszystkie w warstwie 1 (krycie 50%), trzy także w 2, jeden – także w 3 (ukryta).
  assert.deepEqual(strokeEffect(layers, pen()), { hidden: false, opacity: 0.5, saturation: 1 });
  assert.deepEqual(strokeEffect(layers, pen([1, 2])), { hidden: false, opacity: 0.5, saturation: 0.4 });
  assert.equal(strokeEffect(layers, pen([1, 2, 3])).hidden, true);
  assert.deepEqual(strokeEffect(updateLayer(layers, 2, { opacity: 50 }), pen([1, 2])).opacity, 0.25);
  assert.deepEqual(strokeEffect(layers, pen([9])), { hidden: false, opacity: 1, saturation: 1 }, 'nieznana warstwa – bez zmian');
  assert.deepEqual(levelEffect(layers, PHOTO_LAYER), { hidden: false, opacity: 1, saturation: 0 });
  assert.deepEqual(levelEffect(layers, BACKGROUND_LAYER), { hidden: false, opacity: 1, saturation: 1 });
});

test('warstwy 1.36: nasycenie koloru – szarość tej samej jasności, bez zmian dla szarości i przy 100%', () => {
  assert.equal(saturateHex('#d70015', 1), '#d70015');
  const grey = saturateHex('#d70015', 0);
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(grey.slice(at, at + 2), 16));
  assert.ok(r === g && g === b, `szarość (${grey})`);
  assert.equal(saturateHex('#1d1d1f', 0.3).length, 7);
  assert.equal(saturateHex('#808080', 0), '#808080');
  const half = saturateHex('#0040dd', 0.5);
  assert.notEqual(half, '#0040dd');
  assert.ok(parseInt(half.slice(5, 7), 16) > parseInt(half.slice(1, 3), 16), 'nadal niebieski');
  assert.equal(saturateHex('nie kolor', 0), 'nie kolor');
  // Element: kolor, tekst kształtu, karteczka (kolory z palety), szyk.
  const shape = { tool: 'shape', shape: 'rect', color: '#d70015', label: { text: 'A', color: '#0040dd' } };
  const toned = toneStroke(shape, 0);
  assert.notEqual(toned.color, shape.color);
  assert.notEqual(toned.label.color, shape.label.color);
  assert.equal(shape.color, '#d70015', 'oryginał bez zmian');
  const sticky = toneStroke({ tool: 'sticky', color: 'pink' }, 0, () => ({ fill: '#ffc2d4', ink: '#c2386a' }));
  assert.equal(typeof sticky.color, 'object');
  assert.equal(toneStroke(shape, 1), shape);
});

test('warstwy 1.36: zapis w rysunku (format 11) – warstwy, warstwa nowych elementów, sygnatury; kreski zachowują sygnatury przy przesuwaniu i gumce', () => {
  assert.equal(DRAWING_VERSION, 21, 'od 1.49 – operacje na ścianach brył; 1.48.2 – szkic na XY (Z do góry); 1.48 – bryły ze szkicu; 1.47 – bryły; 1.45 – schematy procesów; 1.44 – diagramy jakości i układ kartki; 1.42 – wymiar długości łuku, kierunek wymiaru, osie okręgu; 1.41 – ramka rysunkowa; 1.40 (warstwy – od 11)');
  const empty = emptyDrawing();
  assert.equal('layers' in cleanDrawing(empty), false, 'rysunek bez zmian warstw – bez pola');
  const layers = updateLayer(addLayer(defaultLayers()), 6, { name: 'Konstrukcja', hidden: true });
  const saved = cleanDrawing({
    ...empty, layers, activeLayer: 6,
    strokes: [pen([6, 2, 2, 9]), pen([1]), { tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 2, x: 400, y: 300, w: 200, h: 100, angle: 0, layers: [2, 3] }]
  });
  assert.deepEqual(saved.layers.map((layer) => layer.id), [-1, 0, 1, 2, 3, 4, 5, 6]);
  assert.equal(saved.layers.at(-1).name, 'Konstrukcja');
  assert.equal(saved.activeLayer, 6);
  assert.deepEqual(saved.strokes[0].layers, [6, 2], 'powtórka i nieistniejąca warstwa wypadają');
  assert.equal('layers' in saved.strokes[1], false);
  assert.deepEqual(saved.strokes[2].layers, [2, 3]);
  assert.equal(cleanDrawing({ ...empty, activeLayer: 1 }).activeLayer, undefined);
  assert.equal(cleanDrawing({ ...empty, activeLayer: 8 }).activeLayer, undefined, 'nieistniejąca warstwa');
  // Przesunięcie i gumka fragmentów – kawałki zostają na swoich warstwach.
  assert.deepEqual(translateStroke(pen([4]), 5, 5).layers, [4]);
  assert.deepEqual(translateItem(pen([4]), 5, 5).layers, [4]);
  const strokes = [pen([4])];
  assert.equal(eraseAt(strokes, 50, 10, 4), true);
  assert.ok(strokes.length >= 1 && strokes.every((stroke) => stroke.layers?.[0] === 4), 'kawałki z sygnaturami');
  // Gumka pomija elementy ukrytych warstw.
  const hidden = [pen([6])];
  assert.equal(eraseAt(hidden, 50, 10, 4, (stroke) => !stroke.layers?.includes(6)), false);
});
