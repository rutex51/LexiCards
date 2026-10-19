// Równania w notatkach (1.11): wzory w tekście ($…$, $$…$$) i kwoty, które zostają tekstem;
// odczyt zapisu do drzewa, błędy zapisu, słowny odpowiednik (czytanie na głos, słuchanie), ściągawka.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { noteSteps } from '../../js/core/listen.js';
import { MATH_CHEATSHEET, hasMath, mathSegments, parseMath, spokenMath, spokenText } from '../../js/core/math.js';

const formulas = (text) => mathSegments(text).filter((part) => part.type === 'math').map((part) => [part.source, part.display]);

test('wzory w tekście: $…$ w wierszu, $$…$$ osobno; kwoty, odstępy przy dolarze i \\$ zostają tekstem', () => {
  assert.deepEqual(mathSegments('Pole $P = \\pi r^2$ koła.'), [
    { type: 'text', text: 'Pole ' },
    { type: 'math', source: 'P = \\pi r^2', display: false },
    { type: 'text', text: ' koła.' }
  ]);
  assert.deepEqual(formulas('$$ \\frac{a}{b} $$'), [['\\frac{a}{b}', true]]);
  assert.deepEqual(formulas('$a$ i $b$, potem $$c$$'), [['a', false], ['b', false], ['c', true]]);
  // Kwoty i zwykłe dolary.
  for (const text of ['Kosztuje $20 i $30.', 'Od $5/$10 za sztukę', 'US$5 million', 'Cena $ 5$', 'Zysk $5 $ dziś', 'jeden $', '$$ $$', '$$']) {
    assert.deepEqual(formulas(text), [], text);
  }
  assert.equal(mathSegments('Cena \\$100').map((part) => part.text).join(''), 'Cena $100');
  assert.deepEqual(formulas('Wzór \\$a$ zostaje'), [], 'otwierający dolar poprzedzony \\ to zwykły znak');
  assert.deepEqual(formulas('wzór $a\nb$ w dwóch wierszach'), [], 'wzór w wierszu nie przechodzi do następnego');
  assert.deepEqual(formulas('$x$1'), [], 'zaraz po zamykającym dolarze cyfra – to kwota, nie wzór');
  assert.equal(hasMath('bez wzorów, $20'), false);
  assert.equal(hasMath('jest $x^2$'), true);
});

test('odczyt zapisu: potęgi, indeksy, ułamki, pierwiastki, sumy, funkcje, zbiory, tekst, nawiasy', () => {
  assert.deepEqual(parseMath('x^2').tree, { t: 'scripts', base: { t: 'i', v: 'x' }, sup: { t: 'n', v: '2' } });
  assert.deepEqual(parseMath('a_{ij}^2').tree, parseMath('a^2_{ij}').tree, 'kolejność potęgi i indeksu dowolna');
  assert.deepEqual(parseMath('\\frac{a}{b}').tree, { t: 'frac', a: { t: 'i', v: 'a' }, b: { t: 'i', v: 'b' } });
  assert.deepEqual(parseMath('\\sqrt[3]{x}').tree, { t: 'sqrt', a: { t: 'i', v: 'x' }, index: { t: 'n', v: '3' } });
  const sum = parseMath('\\sum_{i=1}^{n} x_i').tree;
  assert.equal(sum.c[0].base.limits, true, 'suma ma granice nad i pod');
  assert.deepEqual(parseMath('\\sin x').tree.c[0], { t: 'i', v: 'sin', upright: true, fn: true });
  assert.deepEqual(parseMath('\\mathbb{R}').tree, { t: 'i', v: 'ℝ', upright: true });
  assert.deepEqual(parseMath('v \\text{ m/s}').tree.c[1], { t: 'text', v: ' m/s' });
  assert.equal(parseMath('\\left( \\frac{a}{b} \\right)').tree.t, 'fence');
  assert.deepEqual(parseMath('3,14 - 2.5').tree.c.map((node) => node.v), ['3,14', '−', '2.5'], 'liczby z przecinkiem, prawdziwy minus');
  assert.deepEqual(parseMath('a * b').tree.c.map((node) => node.v), ['a', '⋅', 'b'], 'gwiazdka to kropka mnożenia');
  assert.equal(parseMath("f'(x)").tree.c[0].sup.v, '′');
  assert.deepEqual(parseMath('\\Delta \\alpha').tree.c, [{ t: 'i', v: 'Δ', upright: true }, { t: 'i', v: 'α' }]);
});

test('błędy zapisu: nieznane polecenie, nawiasy, \\right bez \\left; bardzo głęboki i bardzo długi zapis bez awarii', () => {
  const unknown = parseMath('\\foo + 1');
  assert.deepEqual(unknown.errors, ['Nieznane polecenie: \\foo']);
  assert.deepEqual(unknown.tree.c[0], { t: 'error', v: '\\foo' });
  assert.deepEqual(parseMath('\\frac{a}{b').errors, ['Brakuje nawiasu „}”.']);
  assert.deepEqual(parseMath('a}').errors, ['Nadmiarowy nawias „}”.']);
  assert.deepEqual(parseMath('a \\right)').errors, ['„\\right” bez „\\left”.']);
  assert.deepEqual(parseMath('a \\right) + b').tree.c.map((node) => node.v), ['a', '+', 'b'], 'reszta zapisu po błędzie zostaje');
  assert.deepEqual(parseMath('\\left( a').errors, ['Brakuje „\\right”.']);
  assert.deepEqual(parseMath('\\sqrt[3{x}').errors, ['Brakuje nawiasu „]”.', 'Brakuje argumentu.']);
  assert.ok(parseMath(`${'{'.repeat(200)}x${'}'.repeat(200)}`).errors.includes('Za dużo zagnieżdżonych nawiasów.'));
  assert.doesNotThrow(() => parseMath('x^'.repeat(3000)));
  assert.doesNotThrow(() => parseMath('\\'));
});

test('wzór słowami po polsku i po angielsku; tekst notatki ze wzorami do czytania i słuchania', () => {
  const cases = [
    ['x^2 + y^2 = r^2', 'x do kwadratu plus y do kwadratu równa się r do kwadratu', 'x squared plus y squared equals r squared'],
    ['\\frac{a+b}{2}', 'a plus b przez 2', 'a plus b over 2'],
    ['\\sqrt{x}', 'pierwiastek z x', 'the square root of x'],
    ['\\sqrt[3]{8} = 2', 'pierwiastek sześcienny z 8 równa się 2', 'the cube root of 8 equals 2'],
    ['a^n', 'a do potęgi n', 'a to the power of n'],
    ['x_1', 'x indeks 1', 'x sub 1'],
    ['\\sum_{i=1}^{n} i', 'suma od i równa się 1 do n i', 'the sum from i equals 1 to n i'],
    ['\\lim_{x \\to 0} f', 'granica przy x dąży do 0 f', 'the limit as x tends to 0 f'],
    ['90^\\circ', '90 stopni', '90 degrees'],
    ['\\alpha \\le \\pi', 'alfa mniejsze lub równe pi', 'alpha is less than or equal to pi'],
    ['\\binom{n}{k}', 'n po k', 'n choose k']
  ];
  for (const [source, pl, en] of cases) {
    assert.equal(spokenMath(source, 'pl'), pl, source);
    assert.equal(spokenMath(source, 'en'), en, source);
  }
  assert.equal(spokenText('Pole koła to $P = \\pi r^2$, a kosztuje $20.', 'pl'), 'Pole koła to P równa się pi r do kwadratu, a kosztuje $20.');
  assert.equal(spokenText('bez wzorów', 'pl'), 'bez wzorów');

  // Słuchanie: notatka lekcji czytana słowami.
  const steps = noteSteps({ html: '<p>Pole: $P = \\pi r^2$.</p>', htmlEN: '<p>Area: $P = \\pi r^2$.</p>' }, 'Koło', 'both');
  assert.deepEqual(steps.filter((step) => step.kind === 'note').map((step) => step.text),
    ['Pole: P równa się pi r do kwadratu.', 'Area: P equals pi r squared.']);
});

test('ściągawka: każdy przykład daje się odczytać bez błędów i ma opis', () => {
  const items = MATH_CHEATSHEET.flatMap((group) => group.items);
  assert.ok(items.length >= 25);
  for (const group of MATH_CHEATSHEET) assert.ok(group.title && group.items.length > 0);
  for (const item of items) {
    assert.ok(item.note, item.source);
    if (item.plain) continue;
    assert.deepEqual(parseMath(item.source).errors, [], item.source);
    assert.ok(spokenMath(item.source, 'pl').length > 0, item.source);
  }
});
