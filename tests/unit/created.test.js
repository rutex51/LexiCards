// Filtr po dacie utworzenia (wersja 1.9): okresy, własny zakres, rekordy bez daty, opis filtra,
// filtr w glosariuszu biblioteki.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createdFilterSummary, createdLabel, createdRange, createdWithin, dayValue, emptyCreatedFilter, isCreatedFilterActive
} from '../../js/core/created.js';
import { defaultSettings } from '../../js/core/model.js';
import { addTerm, makeBranch, makeLibrary } from './helpers.js';

const NOW = new Date(2026, 9, 19, 15, 30);
const at = (year, month, day, hour = 12) => ({ createdAt: new Date(year, month - 1, day, hour).toISOString() });

test('filtr daty utworzenia: okresy liczone od początku dnia w czasie lokalnym', () => {
  assert.equal(createdRange(emptyCreatedFilter(), NOW), null);
  assert.equal(isCreatedFilterActive(emptyCreatedFilter(), NOW), false);
  const today = createdRange({ preset: 'today' }, NOW);
  assert.equal(today.from, new Date(2026, 9, 19).getTime());
  assert.equal(today.to, null);
  assert.ok(createdWithin(at(2026, 10, 19, 0), today));
  assert.ok(!createdWithin(at(2026, 10, 18, 23), today));

  const week = createdRange({ preset: '7d' }, NOW);
  assert.ok(createdWithin(at(2026, 10, 13, 0), week), 'siódmy dzień wstecz w zakresie');
  assert.ok(!createdWithin(at(2026, 10, 12, 23), week));
  const month = createdRange({ preset: '30d' }, NOW);
  assert.ok(createdWithin(at(2026, 9, 20, 0), month));
  assert.ok(!createdWithin(at(2026, 9, 19, 23), month));
  const year = createdRange({ preset: 'year' }, NOW);
  assert.ok(createdWithin(at(2026, 1, 1, 0), year));
  assert.ok(!createdWithin(at(2025, 12, 31, 23), year));
});

test('filtr daty utworzenia: własny zakres obejmuje oba dni, odwrócone daty i jedna strona zakresu', () => {
  const range = createdRange({ preset: 'range', from: '2026-10-01', to: '2026-10-05' }, NOW);
  assert.ok(createdWithin(at(2026, 10, 1, 0), range));
  assert.ok(createdWithin({ createdAt: new Date(2026, 9, 5, 23, 59, 59).toISOString() }, range), 'cały dzień „do”');
  assert.ok(!createdWithin(at(2026, 10, 6, 0), range));
  assert.ok(!createdWithin(at(2026, 9, 30, 23), range));
  assert.deepEqual(createdRange({ preset: 'range', from: '2026-10-05', to: '2026-10-01' }, NOW), range, 'odwrócone daty');
  const fromOnly = createdRange({ preset: 'range', from: '2026-10-10', to: '' }, NOW);
  assert.equal(fromOnly.to, null);
  assert.ok(createdWithin(at(2026, 10, 19), fromOnly));
  assert.equal(createdRange({ preset: 'range', from: '', to: '' }, NOW), null, 'pusty zakres niczego nie ogranicza');
  assert.equal(createdRange({ preset: 'range', from: '2026-02-30', to: 'x' }, NOW), null, 'niepoprawne daty');
  assert.ok(!createdWithin({}, range), 'rekord bez daty nie pasuje do zakresu');
  assert.ok(createdWithin({}, null), 'bez filtra – pasuje');
});

test('filtr daty utworzenia: opis do podsumowania, data przy elemencie, wartość pola daty', () => {
  assert.equal(createdFilterSummary({ preset: '7d' }, NOW), 'utworzone w ostatnich 7 dniach');
  assert.equal(createdFilterSummary({ preset: 'year' }, NOW), 'utworzone w 2026 r.');
  assert.match(createdFilterSummary({ preset: 'range', from: '2026-10-01', to: '2026-10-05' }, NOW), /^utworzone od 1 paź 2026 do 5 paź 2026$/);
  assert.match(createdFilterSummary({ preset: 'range', from: '2026-10-01', to: '' }, NOW), /^utworzone od 1 paź 2026$/);
  assert.equal(createdFilterSummary(emptyCreatedFilter(), NOW), '');
  assert.equal(createdLabel(new Date(2026, 9, 19).toISOString()), '19 paź 2026');
  assert.equal(createdLabel(null), null);
  assert.equal(dayValue(new Date(2026, 0, 5)), '2026-01-05');
});

test('glosariusz: filtr daty utworzenia pojęć; ustawienie „utrwalone na końcu listy” domyślnie włączone', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  const old = await addTerm(library, lesson, 'bilans', 'balance sheet');
  const recentTerm = await addTerm(library, lesson, 'aktywa', 'assets');
  library.maps.terms.get(old.id).createdAt = new Date(2026, 0, 10).toISOString();
  library.maps.terms.get(recentTerm.id).createdAt = new Date(2026, 9, 15).toISOString();
  const now = new Date(2026, 9, 19).getTime();
  const all = library.glossary({ now });
  assert.equal(all.total, 2);
  const recent = library.glossary({ now, created: { preset: 'range', from: '2026-10-01', to: '' } });
  assert.deepEqual(recent.items.map((term) => term.termPL), ['aktywa']);
  const january = library.glossary({ now, created: { preset: 'range', from: '2026-01-01', to: '2026-01-31' } });
  assert.deepEqual(january.items.map((term) => term.termPL), ['bilans']);
  assert.equal(defaultSettings().consolidatedLast, true);
});
