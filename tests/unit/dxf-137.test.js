// DXF 1.37: czytanie (jednostki, warstwy, bloki, łamane z łukami, splajny, teksty), zamiana na elementy rysunku
// i zapis kartki jako DXF R12 – także w obie strony.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyDrawing } from '../../js/core/drawing.js';
import {
  aciHex, dashOfLinetype, decodeDxf, drawingToDxf, dxfLayerName, dxfPrimitives, dxfString, dxfText, fittingScale, hexAci, pageUnitMillimeters, paperColor,
  parseDxf, primitivesBounds, primitivesToElements
} from '../../js/core/dxf.js';
import { addLayer, defaultLayers, updateLayer } from '../../js/core/layers.js';
import { angleDimFromPoints, arcGeometry, dimFromPoints, dimGeometry, polyPoints } from '../../js/core/shapes.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const dxf = (...pairs) => `${pairs.flat().join('\n')}\n`;
const entity = (type, ...codes) => [0, type, ...codes.flat()];

const SAMPLE = dxf(
  [0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC'],
  [0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 3,
    0, 'LAYER', 2, 'OSIE', 70, 0, 62, 1, 6, 'CENTER',
    0, 'LAYER', 2, 'UKRYTA', 70, 0, 62, -3, 6, 'CONTINUOUS',
    0, 'LAYER', 2, 'ZAMROZONA', 70, 1, 62, 5, 6, 'HIDDEN',
    0, 'ENDTAB', 0, 'ENDSEC'],
  [0, 'SECTION', 2, 'BLOCKS',
    0, 'BLOCK', 8, '0', 2, 'OTWOR', 70, 0, 10, 0, 20, 0, 30, 0,
    ...entity('CIRCLE', [8, '0', 62, 0, 10, 0, 20, 0, 30, 0, 40, 2]),
    0, 'ENDBLK', 8, '0',
    0, 'ENDSEC'],
  [0, 'SECTION', 2, 'ENTITIES',
    ...entity('LINE', [8, '0', 10, 0, 20, 0, 30, 0, 11, 100, 21, 0, 31, 0]),
    ...entity('CIRCLE', [8, 'OSIE', 10, 50, 20, 50, 30, 0, 40, 20]),
    ...entity('ARC', [8, '0', 62, 3, 10, 0, 20, 0, 30, 0, 40, 10, 50, 0, 51, 90]),
    ...entity('LWPOLYLINE', [8, 'UKRYTA', 90, 4, 70, 1, 10, 0, 20, 0, 10, 40, 20, 0, 42, 1, 10, 40, 20, 20, 10, 0, 20, 20]),
    ...entity('TEXT', [8, '0', 10, 5, 20, 60, 30, 0, 40, 5, 1, '%%c20 %%p0,1']),
    ...entity('MTEXT', [8, '0', 10, 5, 20, 80, 30, 0, 40, 4, 1, '{\\fArial|b1;Linia}\\Pdruga']),
    ...entity('INSERT', [8, 'OSIE', 62, 6, 2, 'OTWOR', 10, 80, 20, 20, 30, 0, 41, 2, 42, 2, 50, 0]),
    ...entity('SPLINE', [8, '0', 70, 8, 71, 2, 72, 6, 73, 3, 40, 0, 40, 0, 40, 0, 40, 1, 40, 1, 40, 1, 10, 0, 20, 0, 30, 0, 10, 50, 20, 100, 30, 0, 10, 100, 20, 0, 30, 0]),
    ...entity('ELLIPSE', [8, 'ZAMROZONA', 10, 0, 20, 0, 30, 0, 11, 30, 21, 0, 31, 0, 40, 0.5, 41, 0, 42, 6.283185307179586]),
    ...entity('POINT', [8, '0', 10, 1, 20, 2, 30, 0]),
    ...entity('XLINE', [8, '0', 10, 0, 20, 0, 30, 0, 11, 0, 21, 1, 31, 0]),
    ...entity('HATCH', [8, '0', 2, 'SOLID']),
    0, 'ENDSEC'],
  [0, 'EOF']
);

test('DXF 1.37: czytanie – jednostki, warstwy (kolor, wyłączona, zamrożona, rodzaj linii), bloki, encje i pominięte', () => {
  const parsed = parseDxf(SAMPLE);
  assert.equal(parsed.unitMm, 1);
  assert.deepEqual(parsed.layers.get('OSIE'), { color: 1, hidden: false, linetype: 'CENTER' });
  assert.equal(parsed.layers.get('UKRYTA').hidden, true, 'ujemny kolor – wyłączona');
  assert.equal(parsed.layers.get('ZAMROZONA').hidden, true, 'zamrożona');
  assert.ok(parsed.blocks.has('OTWOR'));
  assert.equal(parsed.entities.length, 12);
  const { primitives, skipped } = dxfPrimitives(parsed);
  assert.equal(skipped, 1, 'kreskowanie pominięte');
  assert.deepEqual(primitives.map((item) => item.kind), ['line', 'circle', 'arc', 'poly', 'text', 'text', 'circle', 'poly', 'ellipse', 'point', 'xline']);
  const [line, circle, arc, poly, text, mtext, hole, spline, ellipse] = primitives;
  assert.deepEqual([line.a, line.b], [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  assert.deepEqual([circle.color, circle.dash], ['#ff0000', 'center'], 'kolor i rodzaj linii z warstwy');
  assert.equal(arc.color, '#00ff00');
  near(arc.end - arc.start, Math.PI / 2);
  // Łamana zamknięta z łukiem (wybrzuszenie 1 – półokrąg) między (40, 0) i (40, 20): punkt na łuku x = 50.
  assert.equal(poly.closed, true);
  near(Math.max(...poly.points.map((point) => point.x)), 50, 1e-6);
  assert.equal(text.text, '⌀20 ±0,1');
  assert.equal(mtext.text, 'Linia\ndruga');
  assert.equal(mtext.top, true);
  // Blok: okrąg r = 2 w skali 2 przy (80, 20), kolor z bloku (BYBLOCK – kolor wstawienia), warstwa wstawienia.
  assert.deepEqual([hole.c, hole.r, hole.layer, hole.color], [{ x: 80, y: 20 }, 4, 'OSIE', '#ff00ff']);
  // Splajn stopnia 2 przez (0, 0), (50, 100), (100, 0): koniec w (100, 0), szczyt w połowie (y = 50).
  near(spline.points[0].x, 0, 1e-6);
  near(spline.points.at(-1).x, 100, 1e-3);
  near(Math.max(...spline.points.map((point) => point.y)), 50, 0.2);
  assert.deepEqual([ellipse.a, ellipse.b, ellipse.dash], [30, 15, 'dashed']);
  assert.deepEqual(primitivesBounds([line, circle]), { minX: 0, minY: 0, maxX: 100, maxY: 70 });
  assert.throws(() => parseDxf('to nie jest dxf'), /To nie jest plik DXF/);
  assert.throws(() => parseDxf('AutoCAD Binary DXF\r\n\u001a'), /binarny/);
});

test('DXF 1.37: teksty, kolory ACI, rodzaje linii, nazwy warstw, skala dopasowana do strony', () => {
  assert.equal(dxfText('%%d45 %%%'), '°45 %');
  assert.equal(dxfText('\\A1;{\\H2.5;Ø}\\~10', true), 'Ø 10');
  assert.equal(aciHex(1), '#ff0000');
  assert.equal(aciHex(7), '#1d1d1f');
  assert.equal(aciHex(250), '#333333');
  assert.match(aciHex(30), /^#[0-9a-f]{6}$/);
  assert.equal(hexAci('#1d1d1f'), 7);
  assert.equal(hexAci('#ff0000'), 1);
  assert.equal(hexAci(aciHex(30)), 30);
  assert.equal(hexAci('nie'), 7);
  assert.equal(paperColor('#ffff00') !== '#ffff00', true, 'żółty przyciemniony na białej kartce');
  assert.equal(paperColor('#0040dd'), '#0040dd');
  assert.deepEqual(['CENTER', 'Center2', 'PHANTOM', 'DOT', 'HIDDEN', 'DASHED', 'CONTINUOUS', null].map(dashOfLinetype),
    ['center', 'center', 'phantom', 'dotted', 'dashed', 'dashed', 'solid', 'solid']);
  assert.equal(dxfLayerName('Osie główne / łuki'), 'OSIE_GLOWNE_LUKI');
  assert.equal(dxfLayerName('ąę'), 'AE');
  assert.equal(dxfLayerName('///'), 'WARSTWA');
  // Strona 1600 × 1100 = 36,4 × 25 kratek: 300 × 200 mm – 1 cm na kratkę, 3 × 2 m – 10 cm, 20 × 10 mm – 1 mm.
  assert.deepEqual(fittingScale(300, 200, 1600, 1100), { value: 1, unit: 'cm' });
  assert.deepEqual(fittingScale(3000, 2000, 1600, 1100), { value: 10, unit: 'cm' });
  assert.deepEqual(fittingScale(20, 10, 1600, 1100), { value: 1, unit: 'mm' });
  assert.deepEqual(fittingScale(60000, 10, 1600, 1100), { value: 2, unit: 'm' });
  near(pageUnitMillimeters({ value: 1, unit: 'cm' }), 10 / 44);
});

test('DXF 1.37: elementy rysunku – milimetry w skali strony, oś y w dół, warstwy, długie łamane dzielone', () => {
  const parsed = parseDxf(SAMPLE);
  const { primitives } = dxfPrimitives(parsed);
  const bounds = primitivesBounds(primitives);
  const pageUnitMm = pageUnitMillimeters({ value: 1, unit: 'cm' });
  const layerOf = (name) => ({ OSIE: 2, UKRYTA: 3 })[name] ?? 1;
  const elements = primitivesToElements(primitives, { unitMm: 1, pageUnitMm, origin: { x: 100, y: 50 }, bounds, layerOf });
  const [line, circle, arc, ...rest] = elements;
  // Odcinek 100 mm = 440 jednostek strony; y = 0 w pliku – na dole obszaru (oś y w dół).
  assert.deepEqual([line.shape, line.w, line.angle], ['line', 440, 0]);
  near(line.y, 50 + (bounds.maxY - 0) * (1 / pageUnitMm), 0.1);
  assert.deepEqual([circle.shape, circle.w, circle.layers, circle.dash], ['ellipse', 176, [2], 'center']);
  assert.equal(arc.shape, 'arc');
  const geometry = arcGeometry(arc);
  near(geometry.radius, 44, 0.2);
  near(Math.abs(geometry.sweep), Math.PI / 2, 1e-3);
  const polygon = rest.find((element) => element.shape === 'polygon' || element.shape === 'polyline');
  assert.deepEqual(polygon.layers, [3]);
  const text = rest.find((element) => element.tool === 'text');
  assert.equal(text.text, '⌀20 ±0,1');
  assert.ok(text.size > 20 && text.size < 40, `wielkość tekstu ${text.size}`);
  // Łamana ze 100 punktów – kawałki po najwyżej 24 wierzchołki, kolejne zaczynają się na końcu poprzedniego.
  const long = { kind: 'poly', points: Array.from({ length: 100 }, (_, index) => ({ x: index, y: (index % 2) * 3 })), closed: false, layer: '0', color: '#1d1d1f', dash: 'solid', weight: null };
  const parts = primitivesToElements([long], { unitMm: 1, pageUnitMm, origin: { x: 0, y: 0 }, bounds: primitivesBounds([long]), layerOf });
  assert.ok(parts.length >= 5 && parts.every((part) => part.nodes.length / 2 <= 24));
  const end = polyPoints(parts[0]).at(-1);
  const start = polyPoints(parts[1])[0];
  near(end.x, start.x, 0.01);
  near(end.y, start.y, 0.01);
});

test('DXF 1.37: zapis kartki (R12) i odczyt z powrotem – warstwy, kolory, długości, okrąg, łuk, tekst; pominięte karteczki', () => {
  const drawing = emptyDrawing();
  drawing.layers = updateLayer(updateLayer(addLayer(defaultLayers()), 2, { name: 'Osie główne' }), 3, { hidden: true });
  drawing.strokes = [
    { tool: 'shape', shape: 'line', color: '#d70015', size: 2, x: 300, y: 200, w: 440, h: 0, angle: 0, skew: 0, adjust: 0, layers: [2], dash: 'center' },
    { tool: 'shape', shape: 'ellipse', color: '#1d1d1f', size: 2, x: 600, y: 500, w: 88, h: 88, angle: 0, skew: 0, adjust: 0, layers: [3] },
    { tool: 'shape', shape: 'rect', color: '#0040dd', size: 2, x: 900, y: 500, w: 220, h: 132, angle: 0, skew: 0, adjust: 0 },
    { tool: 'pen', color: '#1d1d1f', points: [100, 900, 2, 150, 920, 2, 200, 900, 2] },
    { tool: 'text', color: '#1d1d1f', x: 100, y: 100, size: 28, text: 'Wałek', width: 80, height: 35, maxWidth: 1600 },
    { tool: 'sticky', color: 'yellow', x: 10, y: 10, width: 200, height: 200, size: 24, text: 'x' }
  ];
  const arc = { tool: 'shape', shape: 'arc', color: '#1d1d1f', size: 2, x: 1200, y: 800, w: 88, h: 44, angle: 0, skew: 0, adjust: 0, nodes: [-0.5, 0.5, 0, -0.5, 0.5, 0.5] };
  drawing.strokes.push(arc);
  const { text, written, skipped } = drawingToDxf(drawing);
  assert.equal(skipped, 1, 'karteczka pominięta');
  assert.equal(written, 6);
  assert.match(text, /AC1009/);
  const parsed = parseDxf(text);
  assert.equal(parsed.unitMm, 1);
  assert.deepEqual([...parsed.layers.keys()], ['0', 'WARSTWA_1', 'OSIE_GLOWNE', 'WARSTWA_3', 'WARSTWA_4', 'WARSTWA_5', 'WARSTWA_6']);
  assert.equal(parsed.layers.get('WARSTWA_3').hidden, true);
  const { primitives } = dxfPrimitives(parsed);
  assert.deepEqual(primitives.map((item) => item.kind), ['line', 'circle', 'poly', 'poly', 'text', 'arc']);
  const [line, circle, rect, , label, readArc] = primitives;
  const mm = pageUnitMillimeters(drawing.scale);
  near(Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y), 440 * mm, 1e-3);
  assert.deepEqual([line.layer, line.color, line.dash], ['OSIE_GLOWNE', '#ff0000', 'center']);
  near(line.a.y, (1100 - 200) * mm, 1e-3);
  near(circle.r, 44 * mm, 1e-3);
  assert.equal(circle.layer, 'WARSTWA_3');
  assert.equal(rect.closed, true);
  assert.equal(label.text, 'Wałek');
  // Łuk: z powrotem na stronie przez te same trzy punkty.
  const back = primitivesToElements([readArc], {
    unitMm: 1, pageUnitMm: mm, origin: { x: 0, y: 0 }, bounds: { minX: 0, minY: 0, maxX: 1600 * mm, maxY: 1100 * mm }
  })[0];
  const [a, b] = [arcGeometry(arc), arcGeometry(back)];
  near(a.center.x, b.center.x, 0.01);
  near(a.center.y, b.center.y, 0.01);
  near(a.radius, b.radius, 0.01);
  near(Math.abs(a.sweep), Math.abs(b.sweep), 1e-3);
});

test('DXF 1.37: wymiary z grotami i liczbą (TEXT wyśrodkowany), wymiar kształtu, polskie litery i znaki ⌀ ° ±, groty z powrotem jako wypełnione', () => {
  const style = { color: '#1d1d1f', size: 2 };
  const drawing = emptyDrawing();
  drawing.strokes = [
    dimFromPoints('linear', { x: 400, y: 532 }, { x: 576, y: 532 }, style),
    dimFromPoints('diameter', { x: 800, y: 300 }, { x: 888, y: 300 }, style),
    angleDimFromPoints({ x: 300, y: 800 }, { x: 476, y: 800 }, { x: 300, y: 624 }, style),
    { tool: 'shape', shape: 'rect', color: '#0040dd', size: 2, x: 1100, y: 500, w: 220, h: 132, angle: 0, skew: 0, adjust: 0, dims: ['width'] },
    { tool: 'text', color: '#1d1d1f', x: 100, y: 100, size: 28, text: 'Żółw ±0,1\ndruga', width: 80, height: 70, maxWidth: 1600 }
  ];
  const { text } = drawingToDxf(drawing);
  assert.ok(/^[\x20-\x7e\r\n]*$/.test(text), 'plik R12 – same znaki ASCII');
  const parsed = parseDxf(text);
  const types = parsed.entities.map((item) => item.type);
  // Liniowy i kształtu: 2 linie pomocnicze, linia wymiarowa, 2 groty; średnica: linia i 2 groty; kąt: łuk i 2 groty.
  assert.equal(types.filter((type) => type === 'SOLID').length, 8);
  assert.equal(types.filter((type) => type === 'ARC').length, 1);
  const labels = parsed.entities.filter((item) => item.type === 'TEXT');
  assert.deepEqual(labels.map((item) => dxfText(item.first(1))), ['4 cm', '⌀2 cm', '90°', '5 cm', 'Żółw ±0,1', 'druga']);
  assert.deepEqual([labels[0].number(72), labels[0].number(73)], [1, 2], 'liczba wymiaru wyśrodkowana');
  assert.equal(labels[1].first(1), '%%c2 cm');
  const { primitives, skipped } = dxfPrimitives(parsed);
  assert.equal(skipped, 0);
  const heads = primitives.filter((item) => item.fill);
  assert.equal(heads.length, 8);
  const mm = pageUnitMillimeters(drawing.scale);
  const elements = primitivesToElements(heads, { unitMm: 1, pageUnitMm: mm, origin: { x: 0, y: 0 }, bounds: { minX: 0, minY: 0, maxX: 1600 * mm, maxY: 1100 * mm } });
  assert.ok(elements.every((element) => element.shape === 'polygon' && element.fill === 'solid' && element.nodes.length === 6), 'grot – wypełniony trójkąt');
  // Liczba wymiaru wczytana z powrotem – wyśrodkowana na tym samym miejscu co na kartce.
  const [number] = primitivesToElements(primitives.filter((item) => item.kind === 'text').slice(0, 1), {
    unitMm: 1, pageUnitMm: mm, origin: { x: 0, y: 0 }, bounds: { minX: 0, minY: 0, maxX: 1600 * mm, maxY: 1100 * mm }
  });
  const spot = dimGeometry(drawing.strokes[0], 'length').text;
  near(number.x + number.width / 2, spot.x, 1.5);
  near(number.y + number.height / 2, spot.y, 1.5);
  assert.equal(dxfString('⌀20 −0,1 ±1° ą€'), '%%c20 -0,1 %%p1%%d \\U+0105\\U+20AC');
  assert.equal(dxfText('\\U+0141\\U+00F3d\\U+017A'), 'Łódź');
});

test('DXF 1.37: odczyt bajtów – UTF-8, strona kodowa z $DWGCODEPAGE, bez niej Windows-1250', () => {
  const utf8 = new TextEncoder().encode('0\nTEXT\n1\nŁódź\n');
  assert.match(decodeDxf(utf8), /Łódź/);
  // „Łódź” w Windows-1250: Ł A3, ó F3, d, ź 9F.
  const cp1250 = Uint8Array.from([0x30, 0x0a, 0x54, 0x45, 0x58, 0x54, 0x0a, 0x31, 0x0a, 0xa3, 0xf3, 0x64, 0x9f, 0x0a]);
  assert.match(decodeDxf(cp1250), /Łódź/);
  const header = new TextEncoder().encode('9\n$DWGCODEPAGE\n3\nANSI_1252\n0\nTEXT\n1\n');
  const latin = new Uint8Array([...header, 0xe9, 0x0a]);
  assert.match(decodeDxf(latin.buffer), /é/);
});
