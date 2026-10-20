// Kolejność list biblioteki (1.16): ręczna, nazwa A–Z i Z–A (po polsku, liczby jak liczby), według
// daty utworzenia, wybór z ustawień, nowa kolejność po przeniesieniu (przeciąganie).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LIST_SORTS, defaultListSort, listSortOf, movedOrder, sortItems } from '../../js/core/sorting.js';
import { defaultSettings } from '../../js/core/model.js';

const item = (name, sortOrder, createdAt) => ({ id: name, name, sortOrder, createdAt });
const names = (items) => items.map((entry) => entry.name);

test('kolejność listy: ręczna, nazwa A–Z i Z–A po polsku (liczby jak liczby, bez wielkości liter), data – od najnowszych i najstarszych', () => {
  const items = [
    item('Test 10', 0, '2026-01-03T10:00:00.000Z'),
    item('Łódź', 1, '2026-01-01T10:00:00.000Z'),
    item('test 2', 2, '2026-01-02T10:00:00.000Z'),
    item('Zebra', 3, '2026-01-02T10:00:00.000Z'),
    item('Lis', 4, undefined)
  ];
  const shuffled = [items[3], items[0], items[4], items[2], items[1]];
  assert.deepEqual(names(sortItems(shuffled, 'manual')), ['Test 10', 'Łódź', 'test 2', 'Zebra', 'Lis']);
  assert.deepEqual(names(sortItems(items, 'name')), ['Lis', 'Łódź', 'test 2', 'Test 10', 'Zebra'], 'Ł po L, „test 2” przed „Test 10”');
  assert.deepEqual(names(sortItems(items, 'name-desc')), ['Zebra', 'Test 10', 'test 2', 'Łódź', 'Lis']);
  assert.deepEqual(names(sortItems(items, 'newest')), ['Test 10', 'test 2', 'Zebra', 'Łódź', 'Lis'], 'ta sama data – po nazwie; bez daty na końcu');
  assert.deepEqual(names(sortItems(items, 'oldest')), ['Lis', 'Łódź', 'test 2', 'Zebra', 'Test 10']);
  assert.deepEqual(names(items), ['Test 10', 'Łódź', 'test 2', 'Zebra', 'Lis'], 'oryginał bez zmian');
});

test('kolejność listy: wybór z ustawień (domyślnie ręczna, dziedziny bez daty), przeniesienie elementu', () => {
  assert.deepEqual(defaultSettings().listSort, defaultListSort());
  assert.equal(listSortOf(defaultSettings(), 'lesson'), 'manual');
  assert.equal(listSortOf({ listSort: { lesson: 'newest' } }, 'lesson'), 'newest');
  assert.equal(listSortOf({ listSort: { domain: 'newest' } }, 'domain'), 'manual', 'dziedziny nie mają sortowania po dacie');
  assert.equal(listSortOf({ listSort: { module: 'losowo' } }, 'module'), 'manual');
  assert.equal(listSortOf({}, 'module'), 'manual');
  assert.deepEqual(LIST_SORTS.domain, ['manual', 'name', 'name-desc']);
  assert.deepEqual(movedOrder(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(movedOrder(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(movedOrder(['a', 'b'], 1, 1), ['a', 'b']);
});
