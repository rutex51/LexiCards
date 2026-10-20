// Wersja 1.21.1: logika własnego wyboru daty i godziny – siatka miesiąca od poniedziałku, nazwy
// po polsku, okres wybierany dwoma dotknięciami, gotowe okresy, zapis godziny.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays, addMonths, clockText, longDay, monthGrid, monthOf, monthTitle, parseDayValue, pickRangeDay, presetRange, rangeDays,
  rangeText
} from '../../js/core/calendar.js';
import { pluralDays } from '../../js/core/text.js';

test('kalendarz 1.21.1: siatka miesiąca – 6 tygodni od poniedziałku, dni sąsiednich miesięcy oznaczone', () => {
  const october = monthGrid({ year: 2026, month: 9 });
  assert.equal(october.length, 42);
  // 1 października 2026 to czwartek – przed nim trzy dni września.
  assert.deepEqual(october.slice(0, 4).map((cell) => [cell.day, cell.outside]), [
    ['2026-09-28', true], ['2026-09-29', true], ['2026-09-30', true], ['2026-10-01', false]
  ]);
  assert.equal(october.filter((cell) => !cell.outside).length, 31);
  assert.equal(october[41].day, '2026-11-08');
  // Luty 2027 zaczyna się w poniedziałek – pierwszy dzień siatki to 1 lutego.
  assert.equal(monthGrid({ year: 2027, month: 1 })[0].day, '2027-02-01');
  // Przejście na czas zimowy (25.10.2026) nie psuje dni.
  assert.ok(october.every((cell, index) => index === 0 || addDays(october[index - 1].day, 1) === cell.day));
});

test('kalendarz 1.21.1: dni i miesiące – przesunięcia, nazwy po polsku, złe daty', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.deepEqual(addMonths({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.deepEqual(addMonths({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(addMonths({ year: 2026, month: 9 }, -22), { year: 2024, month: 11 });
  assert.deepEqual(monthOf('2026-10-20'), { year: 2026, month: 9 });
  assert.equal(monthTitle({ year: 2026, month: 9 }), 'Październik 2026');
  assert.equal(longDay('2026-10-20'), 'wtorek, 20 października 2026');
  assert.equal(longDay('2026-11-01'), 'niedziela, 1 listopada 2026');
  assert.equal(longDay('2026-02-30'), '');
  assert.equal(parseDayValue('2026-13-01'), null);
  assert.equal(parseDayValue('20.10.2026'), null);
  assert.equal(parseDayValue('2026-10-20').getDate(), 20);
});

test('okres 1.21.1: dwa dotknięcia (koniec przed początkiem – zamiana), opis słowami, liczba dni, gotowe okresy', () => {
  let range = { from: '', to: '' };
  range = pickRangeDay(range, '2026-10-16');
  assert.deepEqual(range, { from: '2026-10-16', to: '' });
  range = pickRangeDay(range, '2026-10-05');
  assert.deepEqual(range, { from: '2026-10-05', to: '2026-10-16' }, 'wcześniejszy dzień – zamiana');
  assert.deepEqual(pickRangeDay(range, '2026-10-10'), { from: '2026-10-10', to: '' }, 'cały okres – nowy początek');
  assert.deepEqual(pickRangeDay({ from: '2026-10-05', to: '' }, '2026-10-05'), { from: '2026-10-05', to: '2026-10-05' }, 'jeden dzień');

  assert.equal(rangeText('2026-10-05', '2026-10-20'), '5 – 20 października 2026');
  assert.equal(rangeText('2026-09-28', '2026-10-04'), '28 września – 4 października 2026');
  assert.equal(rangeText('2025-12-28', '2026-01-04'), '28 grudnia 2025 – 4 stycznia 2026');
  assert.equal(rangeText('2026-10-20', '2026-10-20'), '20 października 2026');
  assert.equal(rangeText('2026-10-20', ''), '20 października 2026');
  assert.equal(rangeText('', ''), '');
  assert.equal(rangeDays('2026-10-05', '2026-10-16'), 12);
  assert.equal(rangeDays('2026-10-20', '2026-10-20'), 1);
  assert.equal(rangeDays('2026-10-01', '2026-10-31'), 31, 'przez zmianę czasu');
  assert.equal(pluralDays(1), '1 dzień');
  assert.equal(pluralDays(12), '12 dni');

  const now = new Date(2026, 9, 20, 14, 35);
  assert.deepEqual(presetRange('week', now), { from: '2026-10-19', to: '2026-10-20' }, 'tydzień od poniedziałku');
  assert.deepEqual(presetRange('week', new Date(2026, 9, 25)), { from: '2026-10-19', to: '2026-10-25' }, 'niedziela – ten sam tydzień');
  assert.deepEqual(presetRange('month', now), { from: '2026-10-01', to: '2026-10-20' });
  assert.deepEqual(presetRange('previousMonth', now), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(presetRange('previousMonth', new Date(2026, 0, 10)), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(presetRange('year', now), { from: '2026-01-01', to: '2026-10-20' });
  assert.equal(presetRange('inny', now), null);
});

test('godzina 1.21.1: zapis „09:05”', () => {
  assert.equal(clockText({ hour: 9, minute: 5 }), '09:05');
  assert.equal(clockText({ hour: 23, minute: 59 }), '23:59');
});
