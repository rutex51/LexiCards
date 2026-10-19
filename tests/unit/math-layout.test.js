// Układ wzoru na płótnie (1.13 – wzory na rysunku): wymiary ułamka, potęgi, pierwiastka, sumy
// z granicami i nawiasów, odstępy wokół działań i relacji, znak liczby, błędy zapisu na czerwono.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { layoutMath } from '../../js/core/math-layout.js';

/** Przybliżona szerokość: pół wielkości czcionki na znak (wielkość z opisu czcionki). */
const measure = (text, font) => [...text].length * Number(/([\d.]+)px/.exec(font)[1]) * 0.5;
const box = (source, size = 40) => layoutMath(source, { size, measure });

/** Płótno zapisujące wywołania (napisy z położeniem, kolorem i czcionką, kreski). */
function recorder() {
  const calls = { text: [], lines: 0 };
  return {
    calls,
    fillStyle: '#000000', strokeStyle: '#000000', font: '', lineWidth: 1, lineJoin: 'miter', lineCap: 'butt', textBaseline: '', textAlign: '',
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, moveTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, fill() {},
    lineTo() { calls.lines += 1; },
    stroke() {},
    fillText(text, x, y) { calls.text.push({ text, x, y, color: this.fillStyle, font: this.font }); }
  };
}

test('układ wzoru: ułamek wyższy od wiersza, potęga wyżej, pierwiastek i nawiasy szersze, suma z granicami nad i pod', () => {
  const letter = box('x');
  assert.ok(letter.width > 0 && letter.ascent > 0 && letter.descent > 0);
  const fraction = box('\\frac{a}{b}');
  assert.ok(fraction.ascent > letter.ascent && fraction.descent > letter.descent, 'ułamek sięga nad i pod wiersz');
  const power = box('x^2');
  assert.ok(power.width > letter.width && power.ascent > letter.ascent, 'potęga obok i wyżej');
  const root = box('\\sqrt{x}');
  assert.ok(root.width > letter.width + 10, 'znak pierwiastka');
  const fenced = box('\\left( \\frac{a}{b} \\right)');
  assert.ok(fenced.width > fraction.width && fenced.ascent >= fraction.ascent, 'nawiasy wokół ułamka');
  const sum = box('\\sum_{i=1}^{n} i');
  const plain = box('\\sum i');
  assert.ok(sum.ascent > plain.ascent && sum.descent > plain.descent, 'granice sumy nad i pod znakiem');
  const small = box('\\frac{a}{b}', 20);
  assert.ok(Math.abs(small.width * 2 - fraction.width) < 1, 'wymiary rosną z wielkością');
});

test('układ wzoru: odstępy wokół „+” i „=”, znak liczby bez odstępu, wszystkie znaki narysowane, błąd na czerwono', () => {
  const ctx = recorder();
  const sum = box('a+b=c');
  sum.draw(ctx, 0, 100, '#0040dd');
  assert.deepEqual(ctx.calls.text.map((call) => call.text), ['a', '+', 'b', '=', 'c']);
  const [a, plus, b, equals] = ctx.calls.text;
  assert.ok(plus.x - (a.x + 20) > 5, 'odstęp przed „+”');
  assert.ok(equals.x - (b.x + 20) > b.x - (plus.x + 20) - 0.01, 'przy „=” odstęp nie mniejszy niż przy „+”');
  assert.ok(ctx.calls.text.every((call) => call.y === 100 && call.color === '#0040dd'));
  assert.match(a.font, /^italic /, 'zmienna kursywą');

  const minus = recorder();
  box('-x').draw(minus, 0, 50, '#000000');
  const [sign, x] = minus.calls.text;
  assert.equal(sign.text, '−');
  assert.ok(Math.abs(x.x - (sign.x + 20)) < 0.01, 'znak liczby bez odstępów');

  const wrong = box('x + \\bogus');
  assert.deepEqual(wrong.errors, ['Nieznane polecenie: \\bogus']);
  const marked = recorder();
  wrong.draw(marked, 0, 50, '#1d1d1f');
  assert.equal(marked.calls.text.find((call) => call.text === '\\bogus').color, '#d70015');

  const fraction = recorder();
  box('\\frac{1}{2}').draw(fraction, 0, 80, '#000000');
  const [top, bottom] = fraction.calls.text;
  assert.ok(top.y < 80 && bottom.y > 80, 'licznik nad, mianownik pod linią bazową');
  assert.ok(fraction.calls.lines >= 1, 'kreska ułamkowa');

  const sine = recorder();
  box('\\sin x').draw(sine, 0, 50, '#000000');
  const [name, variable] = sine.calls.text;
  assert.equal(name.text, 'sin');
  assert.doesNotMatch(name.font, /italic/, 'nazwa funkcji prosto');
  assert.ok(variable.x - (name.x + 60) > 5, 'odstęp po nazwie funkcji („sin x”, nie „sinx”)');
});
