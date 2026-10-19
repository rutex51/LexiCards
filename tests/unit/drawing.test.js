// Rysunki odręczne (1.12): grubość kreski z nacisku, wygładzanie, zapis punktów, gumka całych
// kresek, cofanie i ponawianie, sprawdzanie danych rysunku, ustawienia narzędzi, sygnatury,
// rysunek w notatce (zapis, kopia lekcji, kopia zapasowa w obu plikach). Od 1.12.1: gumka
// fragmentów, zaznaczanie prostokątem i przesuwanie, linijka, historia jako stany przed i po zmianie.
// Od 1.13: pola tekstowe i wzory na rysunku (dane, gumka, zaznaczanie, zapis i kopia zapasowa).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DrawingHistory, PAGE_HEIGHT, PAGE_WIDTH, PEN_WIDTHS, addPoint, cleanDrawing, cleanToolSettings, defaultToolSettings,
  drawingWithoutPhotoBytes, emptyDrawing, eraseAt, eraseFromStroke, hasContent, isElement, nextDrawingLabel, penWidth, rulerDegrees,
  rulerOffset, rulerPoint, selectionBounds, smoothPoint, snapRulerAngle, strokeBounds, strokesAt, strokesInRect, touchesStroke,
  translateStroke
} from '../../js/core/drawing.js';
import { createBackup, createMediaArchive, openMediaArchive, restoreBackup, restoreMedia, validateBackup } from '../../js/core/backup.js';
import { openZipBlob } from '../../js/core/zip.js';
import { makeBranch, makeLibrary } from './helpers.js';

const line = (x0, y0, x1, y1, w = 4, tool = 'pen') => {
  const stroke = { tool, color: '#1d1d1f', points: [] };
  for (let step = 0; step <= 10; step += 1) addPoint(stroke, { x: x0 + (x1 - x0) * step / 10, y: y0 + (y1 - y0) * step / 10, w });
  return stroke;
};

test('grubość kreski z nacisku: czułość od wyłączonej do dużej, bez nacisku – środek zakresu', () => {
  const width = { min: 2, max: 6 };
  assert.equal(penWidth(0.5, width, 'medium'), 4);
  assert.equal(penWidth(1, width, 'medium'), 6);
  assert.equal(penWidth(0, width, 'medium'), 4, 'nacisk 0 (palec, mysz) – środek');
  assert.equal(penWidth(0.1, width, 'medium'), 2.4);
  assert.equal(penWidth(1, width, 'off'), 4, 'bez czułości – stała grubość');
  assert.equal(penWidth(1, width, 'low'), 5);
  assert.equal(penWidth(1, width, 'high'), 6, 'duża czułość nie wychodzi poza zakres');
  assert.equal(penWidth(0.2, width, 'high'), 2.08);
  assert.ok(penWidth(0.9, width, 'high') > penWidth(0.9, width, 'medium'));
});

test('wygładzanie i zapis punktów: punkt przesunięty w stronę poprzedniego, zaokrąglony, bez powtórzeń', () => {
  assert.deepEqual(smoothPoint(null, { x: 10, y: 10, w: 3 }, 0.5), { x: 10, y: 10, w: 3 });
  assert.deepEqual(smoothPoint({ x: 0, y: 0, w: 2 }, { x: 10, y: 20, w: 3 }, 0), { x: 10, y: 20, w: 3 });
  const smoothed = smoothPoint({ x: 0, y: 0, w: 2 }, { x: 10, y: 20, w: 3 }, 1);
  assert.deepEqual([smoothed.x, smoothed.y], [2.5, 5], 'największe wygładzanie – ćwierć drogi');
  const stroke = { tool: 'pen', color: '#000000', points: [] };
  assert.equal(addPoint(stroke, { x: 1.234, y: 5.678, w: 2.3456 }), true);
  assert.deepEqual(stroke.points, [1.2, 5.7, 2.35]);
  assert.equal(addPoint(stroke, { x: 1.21, y: 5.69, w: 3 }), false, 'ten sam punkt po zaokrągleniu');
  assert.deepEqual(stroke.points, [1.2, 5.7, 3], 'zostaje większa grubość');
});

test('gumka: dotyk kreski z jej grubością, kropka, kolejność od wierzchu', () => {
  const horizontal = line(0, 100, 200, 100, 6);
  assert.equal(touchesStroke(horizontal, 100, 112, 10), true, 'promień gumki + połowa grubości');
  assert.equal(touchesStroke(horizontal, 100, 114, 10), false);
  assert.equal(touchesStroke(horizontal, 230, 100, 10), false, 'za końcem kreski');
  const dot = { tool: 'pen', color: '#000000', points: [50, 50, 8] };
  assert.equal(touchesStroke(dot, 58, 50, 4), true);
  const strokes = [horizontal, line(100, 0, 100, 200), dot];
  assert.deepEqual(strokesAt(strokes, 100, 100, 5), [1, 0], 'skrzyżowanie – obie kreski, od ostatniej');
  assert.deepEqual(strokesAt(strokes, 400, 400, 5), []);
});

test('historia: dodanie, gumka jednym pociągnięciem jako jeden krok, cofnij i ponów w kolejności', () => {
  const strokes = [];
  const history = new DrawingHistory(strokes);
  const [a, b, c] = [line(0, 0, 10, 0), line(0, 10, 10, 10), line(0, 20, 10, 20)];
  history.add(a);
  history.add(b);
  history.add(c);
  assert.equal(history.canRedo, false);
  // Jedno pociągnięcie gumką usuwa b, potem a.
  assert.equal(history.remove([1]), true);
  assert.equal(history.remove([0]), true);
  history.closeStep();
  assert.deepEqual(strokes, [c]);
  assert.equal(history.remove([5]), false, 'nic do usunięcia');
  assert.equal(history.undo(), true);
  assert.deepEqual(strokes, [a, b, c], 'cofnięcie pociągnięcia gumki – kreski na swoich miejscach');
  assert.equal(history.redo(), true);
  assert.deepEqual(strokes, [c]);
  history.undo();
  history.undo();
  assert.deepEqual(strokes, [a, b], 'cofnięcie ostatniej dodanej kreski');
  history.add(line(5, 5, 6, 6));
  assert.equal(history.canRedo, false, 'nowa kreska kasuje ponawianie');
  while (history.undo());
  assert.deepEqual(strokes, []);
  assert.equal(history.canUndo, false);
});

test('dane rysunku: pusty rysunek, sprawdzanie złych kresek i liczb, zdjęcie, zapis bez bajtów zdjęcia', () => {
  const page = emptyDrawing();
  assert.deepEqual([page.width, page.height, page.paper, page.strokes.length], [PAGE_WIDTH, PAGE_HEIGHT, 'grid', 0]);
  assert.equal(hasContent(page), false);
  const photo = { type: 'image/jpeg', width: 800, height: 600, bytes: new ArrayBuffer(10) };
  const onPhoto = emptyDrawing({ photo });
  assert.deepEqual([onPhoto.width, onPhoto.height, onPhoto.paper], [800, 600, 'plain']);
  assert.equal(hasContent(onPhoto), true);

  const cleaned = cleanDrawing({
    version: 7, width: 1600.4, height: 1100, paper: 'kropki',
    strokes: [
      { tool: 'pen', color: '#1D1D1F', points: [1, 2, 3, 4, 5, 6, 7] },
      { tool: 'laser', color: '#000000', points: [1, 2, 3] },
      { tool: 'pen', color: 'red', points: [1, 2, 3] },
      { tool: 'highlighter', color: '#ffd60a', points: [1, 2, 99, 'x', 4, 5, 1e9, 1e9, 0] },
      { tool: 'pen', color: '#000000', points: [] },
      null
    ],
    photo: { type: 'image/png', width: 10, height: 10, bytes: new ArrayBuffer(4) }
  });
  assert.equal(cleaned.width, 1600);
  assert.equal(cleaned.paper, 'plain', 'nieznane tło – gładkie');
  assert.deepEqual(cleaned.strokes, [
    { tool: 'pen', color: '#1d1d1f', points: [1, 2, 3, 4, 5, 6] },
    { tool: 'highlighter', color: '#ffd60a', points: [1, 2, 40, 3200, 2200, 0.5] }
  ]);
  assert.ok(cleaned.photo.bytes instanceof ArrayBuffer);
  assert.equal(cleanDrawing({ width: 0, height: 10 }), null);
  assert.equal(cleanDrawing('rysunek'), null);
  const light = drawingWithoutPhotoBytes(cleaned);
  assert.equal(light.photo.bytes, undefined);
  assert.ok(cleaned.photo.bytes, 'oryginał bez zmian');
  assert.equal(drawingWithoutPhotoBytes(page), page);
  // Opis zdjęcia bez bajtów (plik danych) zostaje.
  assert.deepEqual(cleanDrawing({ ...light }).photo, { type: 'image/png', width: 10, height: 10 });
});

test('ustawienia narzędzi: domyślne, złe wartości zastąpione, grubości od ≤ do', () => {
  assert.deepEqual(cleanToolSettings(null), defaultToolSettings());
  const cleaned = cleanToolSettings({
    sensitivity: 'ogromna', smoothing: 3, penWidth: 7, penColor: 'blue', highlighterWidth: 2, highlighterColor: 'pink',
    penWidths: [{ min: 9, max: 2 }, { min: -5, max: 100 }, { min: 'x', max: 8 }]
  });
  assert.equal(cleaned.sensitivity, 'medium');
  assert.equal(cleaned.smoothing, 1);
  assert.equal(cleaned.penWidth, 1);
  assert.deepEqual([cleaned.penColor, cleaned.highlighterWidth, cleaned.highlighterColor], ['blue', 2, 'pink']);
  assert.deepEqual(cleaned.penWidths, [{ min: 2, max: 9 }, { min: 0.5, max: 40 }, { min: PEN_WIDTHS[2].min, max: 8 }]);
  assert.deepEqual(cleanToolSettings({ penWidths: [{ min: 1, max: 2 }] }).penWidths, defaultToolSettings().penWidths, 'zła liczba grubości');
  assert.deepEqual([cleaned.eraserMode, cleaned.eraserSize], ['stroke', 1], 'gumka – domyślnie całe kreski, średnia');
  const eraser = cleanToolSettings({ eraserMode: 'pixel', eraserSize: 3 });
  assert.deepEqual([eraser.eraserMode, eraser.eraserSize], ['pixel', 3]);
  const wrong = cleanToolSettings({ eraserMode: 'laser', eraserSize: 9 });
  assert.deepEqual([wrong.eraserMode, wrong.eraserSize], ['stroke', 1]);
});

test('gumka fragmentów: dziura na brzegu koła także między rzadkimi punktami, kawałki z grubością, kropka, cała kreska', () => {
  const horizontal = line(0, 100, 200, 100, 4);
  assert.equal(eraseFromStroke(horizontal, 100, 130, 10), null, 'koło obok kreski');
  const pieces = eraseFromStroke(horizontal, 100, 100, 10);
  assert.equal(pieces.length, 2);
  // Promień 10 + połowa grubości 2: dziura od x = 88 do x = 112.
  assert.deepEqual(pieces[0].points.slice(-3), [88, 100, 4]);
  assert.deepEqual(pieces[1].points.slice(0, 3), [112, 100, 4]);
  assert.deepEqual([pieces[0].tool, pieces[0].color], ['pen', '#1d1d1f']);
  assert.equal(horizontal.points.length, 33, 'oryginał bez zmian');

  // Dwa punkty daleko od siebie – przecięcie w środku odcinka; grubość z nacisku przeliczona w miejscu cięcia.
  const sparse = { tool: 'highlighter', color: '#ffd60a', points: [0, 0, 2, 200, 0, 6] };
  const cut = eraseFromStroke(sparse, 100, 0, 7);
  assert.deepEqual(cut.map((piece) => piece.points), [[0, 0, 2, 90, 0, 3.8], [110, 0, 4.2, 200, 0, 6]]);
  assert.equal(cut[0].tool, 'highlighter');

  assert.deepEqual(eraseFromStroke(line(0, 0, 10, 0), 5, 0, 30), [], 'cała kreska w kole');
  const dot = { tool: 'pen', color: '#000000', points: [50, 50, 8] };
  assert.deepEqual(eraseFromStroke(dot, 55, 50, 2), []);
  assert.equal(eraseFromStroke(dot, 70, 50, 2), null);
  // Brzeg kreski: od końca zostaje okruch krótszy niż jeden odcinek – bez kropek.
  assert.deepEqual(eraseFromStroke(line(0, 0, 100, 0, 2), 0, 0, 30).map((piece) => piece.points.slice(0, 3)), [[31, 0, 2]]);

  // Na całym rysunku: skrzyżowanie dwóch kresek – każda w dwóch kawałkach; nic nie dotyka – bez zmian.
  const strokes = [line(0, 100, 200, 100), line(100, 0, 100, 200)];
  assert.equal(eraseAt(strokes, 100, 100, 5), true);
  assert.equal(strokes.length, 4);
  assert.equal(eraseAt(strokes, 500, 500, 5), false);
  assert.deepEqual(strokeBounds(line(10, 20, 30, 20, 4)), { minX: 8, minY: 18, maxX: 32, maxY: 22 });
});

test('zaznaczanie prostokątem: kreski w całości w prostokącie, granice zaznaczenia, przesunięcie bez zmiany oryginału', () => {
  const strokes = [line(10, 10, 50, 10), line(10, 100, 300, 100), line(20, 30, 40, 50)];
  assert.deepEqual(strokesInRect(strokes, { x0: 0, y0: 0, x1: 60, y1: 60 }), [0, 2]);
  assert.deepEqual(strokesInRect(strokes, { x0: 60, y0: 60, x1: 0, y1: 0 }), [0, 2], 'prostokąt od dowolnego rogu');
  assert.deepEqual(strokesInRect(strokes, { x0: 0, y0: 0, x1: 100, y1: 120 }), [0, 2], 'kreska wystająca poza prostokąt – nie');
  assert.deepEqual(selectionBounds([strokes[0], strokes[2]]), { minX: 8, minY: 8, maxX: 52, maxY: 52 });
  assert.equal(selectionBounds([]), null);
  const moved = translateStroke(strokes[0], 5.04, -2);
  assert.deepEqual(moved.points.slice(0, 6), [15, 8, 4, 19, 8, 4]);
  assert.deepEqual(strokes[0].points.slice(0, 3), [10, 10, 4], 'oryginał bez zmian');
  assert.notEqual(moved, strokes[0]);
});

test('linijka: kąt przyskakuje co 45°, stopnie jak w geometrii (0–179), położenie punktu względem linijki', () => {
  const degrees = (value) => Math.round((value * 180) / Math.PI * 1000) / 1000;
  const radians = (value) => (value * Math.PI) / 180;
  assert.equal(degrees(snapRulerAngle(radians(44))), 45);
  assert.equal(degrees(snapRulerAngle(radians(40))), 40);
  assert.equal(degrees(snapRulerAngle(radians(-89))), -90);
  assert.equal(degrees(snapRulerAngle(radians(-179))), 180);
  assert.equal(degrees(snapRulerAngle(radians(361))), 0);
  assert.equal(rulerDegrees(0), 0);
  assert.equal(rulerDegrees(radians(-45)), 45, 'w górę w prawo – 45°');
  assert.equal(rulerDegrees(radians(45)), 135);
  assert.equal(rulerDegrees(Math.PI), 0, 'obrócona o 180° – ta sama linijka');
  assert.equal(rulerDegrees(radians(-90)), 90);
  const ruler = { x: 100, y: 100, angle: Math.PI / 2 };
  const offset = rulerOffset(ruler, 80, 150);
  assert.deepEqual([Math.round(offset.along), Math.round(offset.across)], [50, 20]);
  const point = rulerPoint(ruler, 50, 20);
  assert.deepEqual([Math.round(point.x), Math.round(point.y)], [80, 150]);
});

test('historia od 1.12.1: zmiana jako jeden krok (begin … commit), bez skutku – bez kroku, cofnięcie przywraca dokładny stan', () => {
  const [a, b] = [line(0, 0, 10, 0), line(0, 10, 10, 10)];
  const strokes = [a, b];
  const history = new DrawingHistory(strokes);
  history.begin();
  assert.equal(history.commit(), false, 'bez zmian – bez kroku');
  assert.equal(history.canUndo, false);
  // Przesunięcie zaznaczenia: w trakcie kilka zmian, w historii jeden krok.
  history.begin();
  strokes[1] = translateStroke(b, 5, 0);
  strokes[1] = translateStroke(b, 9, 0);
  assert.equal(history.canUndo, true, 'trwająca zmiana też da się cofnąć');
  assert.equal(history.commit(), true);
  const moved = strokes[1];
  // Gumka fragmentów – a w dwóch kawałkach.
  history.begin();
  eraseAt(strokes, 5, 0, 1);
  history.commit();
  assert.equal(strokes.length, 3);
  assert.equal(history.undo(), true);
  assert.deepEqual(strokes, [a, moved]);
  assert.equal(history.undo(), true);
  assert.deepEqual(strokes, [a, b]);
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), true);
  assert.deepEqual(strokes, [a, moved]);
});

const textBox = (x = 100, y = 100) => ({ tool: 'text', color: '#1d1d1f', x, y, size: 40, text: 'Bilans', maxWidth: 960, width: 120, height: 50 });
const formula = (x = 400, y = 300) => ({ tool: 'math', color: '#0040dd', x, y, size: 40, source: '\\frac{a}{b}', width: 60, height: 90 });

test('pola tekstowe i wzory (1.13): granice, gumka całych kresek tak, gumka fragmentów nie, zaznaczanie i przesunięcie', () => {
  const [text, math] = [textBox(), formula()];
  assert.equal(isElement(text), true);
  assert.equal(isElement(line(0, 0, 1, 1)), false);
  assert.deepEqual(strokeBounds(text), { minX: 100, minY: 100, maxX: 220, maxY: 150 });
  assert.equal(touchesStroke(text, 150, 120, 0), true);
  assert.equal(touchesStroke(text, 230, 120, 5), false);
  assert.equal(touchesStroke(text, 223, 120, 5), true, 'z promieniem gumki');
  assert.deepEqual(strokesAt([text, math], 420, 340, 2), [1]);
  assert.equal(eraseFromStroke(math, 420, 340, 30), null, 'gumka fragmentów nie przecina wzoru');
  const strokes = [text, line(0, 120, 300, 120)];
  eraseAt(strokes, 150, 120, 10);
  assert.equal(strokes[0], text, 'pole tekstowe zostaje, kreska pod nim jest przecięta');
  assert.equal(strokes.length, 3);
  assert.deepEqual(strokesInRect([text, math], { x0: 90, y0: 90, x1: 230, y1: 160 }), [0]);
  assert.deepEqual(strokesInRect([text, math], { x0: 90, y0: 90, x1: 200, y1: 160 }), [], 'pole wystaje poza prostokąt');
  const moved = translateStroke(math, 10.04, -5);
  assert.deepEqual([moved.x, moved.y, moved.source, moved.width], [410, 295, '\\frac{a}{b}', 60]);
  assert.equal(math.x, 400, 'oryginał bez zmian');
});

test('pola tekstowe i wzory: sprawdzanie danych (puste, złe liczby i kolory odrzucone, wielkość ograniczona), zapis w notatce i kopia zapasowa', async () => {
  const cleaned = cleanDrawing({
    ...emptyDrawing(),
    strokes: [
      { ...textBox(), color: '#1D1D1F', size: 999, maxWidth: undefined },
      { ...formula(), text: 'zbędne' },
      { ...textBox(), text: '   ' },
      { ...formula(), source: 42 },
      { ...textBox(), x: 'x' },
      { ...formula(), color: 'blue' },
      { ...textBox(), text: 'x'.repeat(5000) }
    ]
  });
  assert.equal(cleaned.version, 2);
  assert.equal(cleaned.strokes.length, 3);
  assert.deepEqual([cleaned.strokes[0].color, cleaned.strokes[0].size, cleaned.strokes[0].maxWidth], ['#1d1d1f', 200, 1600]);
  assert.deepEqual(Object.keys(cleaned.strokes[1]).sort(), ['color', 'height', 'size', 'source', 'tool', 'width', 'x', 'y']);
  assert.equal(cleaned.strokes[2].text.length, 2000);

  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  const drawing = { ...emptyDrawing(), strokes: [line(10, 10, 300, 10), textBox(), formula()] };
  await library.saveNote(lesson.id, {
    html: '<p>Rysunek</p>',
    images: [{ bytes: pngBytes(7), type: 'image/png', width: 1600, height: 1100, label: 'Rysunek 1', drawing }]
  });
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const archive = await createMediaArchive(library, 'test');
  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, backup);
  await restoreMedia(fresh, archive.blob);
  const [restored] = await fresh.noteImages(lesson.id);
  assert.deepEqual(restored.drawing.strokes.slice(1), [textBox(), formula()], 'pole tekstowe i wzór po przywróceniu kopii');
});

test('sygnatura nowego rysunku: kolejna wolna „Rysunek N”', () => {
  assert.equal(nextDrawingLabel([]), 'Rysunek 1');
  assert.equal(nextDrawingLabel(['Obraz 1', 'Rysunek 1', 'rysunek 2', 'Rysunek 4']), 'Rysunek 3');
});

// ---------------------------------------------------------------- rysunek w notatce

const pngBytes = (seed) => {
  const bytes = new Uint8Array(40);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  bytes[39] = seed;
  return bytes;
};
const sketch = () => ({ ...emptyDrawing(), strokes: [line(10, 10, 300, 200), line(40, 500, 900, 520, 24, 'highlighter')] });
const onPhoto = () => ({
  ...emptyDrawing({ photo: { type: 'image/jpeg', width: 4000, height: 3000, bytes: new Uint8Array([1, 2, 3, 4, 5]).buffer } }),
  strokes: [line(5, 5, 50, 50)]
});

test('rysunek w notatce: zapis z kreskami, znacznik w opisie, zmiana sygnatury, kopia lekcji, cofnięcie usunięcia, zwykły obraz bez kresek', async () => {
  const { library } = await makeLibrary();
  const { lesson, module } = await makeBranch(library);
  const photoPage = onPhoto();
  assert.deepEqual([photoPage.width, photoPage.height], [2048, 1536], 'duże zdjęcie – strona pomniejszona');
  await library.saveNote(lesson.id, {
    html: '<p>[[Rysunek 1]]</p>',
    images: [
      { bytes: pngBytes(1), type: 'image/png', width: 1600, height: 1100, label: 'Rysunek 1', drawing: sketch() },
      { bytes: pngBytes(2), type: 'image/jpeg', width: 2048, height: 1536, label: 'Rysunek 2', drawing: photoPage },
      { bytes: pngBytes(3), type: 'image/png', width: 30, height: 20, label: null }
    ]
  });
  const metas = library.getNote(lesson.id).images;
  assert.deepEqual(metas.map((meta) => [meta.label, meta.drawing === true]), [['Rysunek 1', true], ['Rysunek 2', true], ['Obraz 1', false]]);
  const images = await library.noteImages(lesson.id);
  assert.equal(images[0].drawing.strokes.length, 2);
  assert.equal(images[0].drawing.strokes[1].tool, 'highlighter');
  assert.equal(images[1].drawing.photo.width, 4000);
  assert.deepEqual([...new Uint8Array(images[1].drawing.photo.bytes)], [1, 2, 3, 4, 5]);
  assert.equal(images[2].drawing, undefined);

  // Zapis z samym { id } zostawia rysunek (np. zmiana sygnatury).
  await library.saveNote(lesson.id, { html: '<p>x</p>', images: [{ id: metas[0].id, label: 'Schemat' }, { id: metas[2].id }] });
  const kept = await library.noteImages(lesson.id);
  assert.deepEqual(kept.map((image) => [image.label, Boolean(image.drawing)]), [['Schemat', true], ['Obraz 1', false]]);
  assert.equal(library.getNote(lesson.id).images[0].drawing, true);

  const copy = await library.copyLesson(lesson.id, module.id);
  const copied = await library.noteImages(copy.id);
  assert.notEqual(copied[0].id, kept[0].id);
  assert.deepEqual(copied[0].drawing.strokes, kept[0].drawing.strokes, 'kopia lekcji z kreskami');
  assert.equal(library.getNote(copy.id).images[0].drawing, true);

  // „Cofnij” po usunięciu lekcji – rysunek wraca z kreskami.
  const deleted = await library.deleteWithUndo({ kind: 'lesson', id: lesson.id });
  assert.equal(library.getNote(lesson.id), null);
  await library.restoreDeleted(deleted);
  const back = await library.noteImages(lesson.id);
  assert.deepEqual(back[0].drawing.strokes, kept[0].drawing.strokes, 'cofnięcie usunięcia z kreskami');
  assert.equal(library.getNote(lesson.id).images[0].drawing, true);
});

test('rysunek w kopii zapasowej: znacznik w pliku danych, kreski i zdjęcie w pliku ZIP, przywrócenie na nowym urządzeniu', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  await library.saveNote(lesson.id, {
    html: '<p>Rysunki</p>',
    images: [
      { bytes: pngBytes(1), type: 'image/png', width: 1600, height: 1100, label: 'Rysunek 1', drawing: sketch() },
      { bytes: pngBytes(2), type: 'image/jpeg', width: 2048, height: 1536, label: 'Rysunek 2', drawing: onPhoto() },
      { bytes: pngBytes(3), type: 'image/png', width: 30, height: 20 }
    ]
  });
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const validated = validateBackup(backup).data.notes[0].images;
  assert.deepEqual(validated.map((meta) => meta.drawing === true), [true, true, false], 'znacznik rysunku przechodzi sprawdzanie');

  const archive = await createMediaArchive(library, 'test');
  assert.deepEqual([archive.images, archive.files, archive.missing], [3, 0, 0]);
  const zip = await openZipBlob(archive.blob);
  const names = [...zip.entries.keys()].filter((name) => name.startsWith('rysunki/'));
  assert.equal(names.filter((name) => name.endsWith('.json')).length, 2);
  assert.equal(names.filter((name) => name.endsWith('-zdjecie.jpeg')).length, 1);
  const { manifest } = await openMediaArchive(archive.blob);
  assert.deepEqual(manifest.items.map((item) => Boolean(item.drawing)), [true, true, false]);
  const stored = JSON.parse(new TextDecoder().decode(await zip.read(zip.entries.get(manifest.items[1].drawing.path))));
  assert.equal(stored.photo.bytes, undefined, 'zdjęcie osobnym plikiem, nie w JSON');

  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, backup);
  const report = await restoreMedia(fresh, archive.blob);
  assert.deepEqual(report, { images: 3, files: 0, present: 0, unmatched: 0, damaged: 0, missing: 0 });
  const restored = await fresh.noteImages(lesson.id);
  assert.deepEqual(restored[0].drawing.strokes, sketch().strokes);
  assert.equal(restored[0].drawing.paper, 'grid');
  assert.deepEqual([...new Uint8Array(restored[1].drawing.photo.bytes)], [1, 2, 3, 4, 5]);
  assert.equal(restored[1].drawing.photo.type, 'image/jpeg');
  assert.equal(restored[2].drawing, undefined);
});
