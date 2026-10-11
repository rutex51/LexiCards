import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  blankToNull, collapseWhitespace, formatTags, isBlank, joinList, normalizeKey, parseTags,
  pluralDomains, pluralLessons, pluralModules, pluralTerms, uniqueTags
} from '../../js/core/text.js';
import { assessmentStatus, availableElementCount, termFieldsFromDraft } from '../../js/core/model.js';
import { deletionMessage, deletionTitle, importSummary } from '../../js/core/messages.js';

test('klucz ignoruje wielkość liter, znaki diakrytyczne i nadmiarowe spacje', () => {
  assert.equal(normalizeKey('  Łódź   Fabryczna '), 'lodz fabryczna');
  assert.equal(normalizeKey('Zażółć GĘŚLĄ jaźń'), 'zazolc gesla jazn');
  assert.equal(normalizeKey('Cash\tFlow\n'), 'cash flow');
  assert.equal(normalizeKey(''), '');
  assert.equal(normalizeKey('   '), '');
  assert.equal(normalizeKey(null), '');
});

test('te same pojęcia zapisane różnie dają ten sam klucz', () => {
  assert.equal(normalizeKey('Wskaźnik płynności'), normalizeKey('wskaznik  PLYNNOSCI'));
  assert.notEqual(normalizeKey('balance sheet'), normalizeKey('balance sheets'));
});

test('scalanie białych znaków zachowuje wielkość liter i znaki diakrytyczne', () => {
  assert.equal(collapseWhitespace('  Rachunek   zysków \n i strat '), 'Rachunek zysków i strat');
});

test('puste teksty są zamieniane na null', () => {
  assert.equal(blankToNull('  '), null);
  assert.equal(blankToNull(''), null);
  assert.equal(blankToNull(undefined), null);
  assert.equal(blankToNull('  a '), 'a');
  assert.equal(isBlank(' \n'), true);
  assert.equal(isBlank('x'), false);
});

test('tagi: rozdzielanie, usuwanie duplikatów, zapis do edycji', () => {
  assert.deepEqual(parseTags('finanse, Raporty;finanse\n  CMM '), ['finanse', 'Raporty', 'CMM']);
  assert.deepEqual(parseTags(' , ; '), []);
  assert.deepEqual(parseTags('Finanse, FINANSE, finanse'), ['Finanse']);
  assert.deepEqual(uniqueTags(['GD&T', ' kształt ', 'gd&t']), ['GD&T', 'kształt']);
  assert.equal(formatTags(['a', 'b']), 'a, b');
});

test('odmiana przez liczby', () => {
  const cases = [
    [0, '0 pojęć'], [1, '1 pojęcie'], [2, '2 pojęcia'], [4, '4 pojęcia'], [5, '5 pojęć'],
    [11, '11 pojęć'], [12, '12 pojęć'], [14, '14 pojęć'], [21, '21 pojęć'], [22, '22 pojęcia'],
    [25, '25 pojęć'], [102, '102 pojęcia'], [112, '112 pojęć'], [1000, '1000 pojęć']
  ];
  for (const [count, expected] of cases) assert.equal(pluralTerms(count), expected);
  assert.deepEqual([pluralModules(1), pluralModules(3), pluralModules(8)], ['1 moduł', '3 moduły', '8 modułów']);
  assert.deepEqual([pluralLessons(1), pluralLessons(2), pluralLessons(5)], ['1 lekcja', '2 lekcje', '5 lekcji']);
  assert.deepEqual([pluralDomains(1), pluralDomains(4), pluralDomains(6)], ['1 dziedzina', '4 dziedziny', '6 dziedzin']);
});

test('wyliczenie „a, b i c”', () => {
  assert.equal(joinList([]), '');
  assert.equal(joinList(['a']), 'a');
  assert.equal(joinList(['a', 'b']), 'a i b');
  assert.equal(joinList(['a', 'b', 'c']), 'a, b i c');
});

test('status oceny jest proporcjonalny do liczby dostępnych elementów', () => {
  const cases = [
    [0, 3, 'toLearn'], [1, 3, 'inProgress'], [2, 3, 'partiallyMastered'], [3, 3, 'mastered'],
    [0, 2, 'toLearn'], [1, 2, 'partiallyMastered'], [2, 2, 'mastered'],
    [0, 1, 'toLearn'], [1, 1, 'mastered']
  ];
  for (const [score, available, expected] of cases) {
    assert.equal(assessmentStatus(score, available), expected, `${score}/${available}`);
  }
});

test('brak opisu i przykładu zmniejsza liczbę ocenianych elementów', () => {
  const full = termFieldsFromDraft({ termPL: 'aktywa', termEN: 'assets', descriptionPL: 'Zasoby', exampleEN: 'Example' });
  const noExample = termFieldsFromDraft({ termPL: 'bilans', termEN: 'balance sheet', descriptionEN: 'Statement', examplePL: '  ' });
  const bare = termFieldsFromDraft({ termPL: 'oferta', termEN: 'offer' });
  assert.equal(availableElementCount(full), 3);
  assert.equal(availableElementCount(noExample), 2);
  assert.equal(availableElementCount(bare), 1);
  assert.equal(noExample.examplePL, null);
});

test('pola pojęcia: normalizacja nazw, kluczy i tagów', () => {
  const fields = termFieldsFromDraft({
    termPL: '  Wskaźnik   płynności ', termEN: 'Current Ratio', descriptionEN: '   ',
    tags: ['finanse', 'wskaźniki', 'Finanse'], difficulty: 3, notes: ' ', isFavorite: 1
  });
  assert.equal(fields.termPL, 'Wskaźnik płynności');
  assert.equal(fields.keyPL, 'wskaznik plynnosci');
  assert.equal(fields.keyEN, 'current ratio');
  assert.equal(fields.descriptionEN, null);
  assert.deepEqual(fields.tags, ['finanse', 'wskaźniki']);
  assert.deepEqual(fields.tagKeys, ['finanse', 'wskazniki']);
  assert.equal(fields.notes, null);
  assert.equal(fields.isFavorite, true);
});

test('ostrzeżenie przed usunięciem podaje liczbę elementów podrzędnych', () => {
  const target = { kind: 'domain', id: 'x' };
  const impact = { name: 'Metrology', modules: 2, lessons: 5, terms: 18, progressRecords: 3 };
  assert.equal(deletionTitle(target, impact), 'Usunąć dziedzinę „Metrology”?');
  const message = deletionMessage(target, impact);
  assert.match(message, /2 moduły, 5 lekcji i 18 pojęć/);
  assert.match(message, /postępy i historia nauki/);
  assert.match(message, /nie można cofnąć/);

  const empty = { name: 'Pusta', modules: 0, lessons: 0, terms: 0, progressRecords: 0 };
  assert.equal(deletionMessage(target, empty), 'Tej operacji nie można cofnąć.');

  const many = { name: null, modules: 0, lessons: 0, terms: 5, progressRecords: 0 };
  assert.equal(deletionTitle({ kind: 'terms', ids: [] }, many), 'Usunąć 5 pojęć?');
  assert.equal(deletionMessage({ kind: 'terms', ids: [] }, many), 'Tej operacji nie można cofnąć.');
  assert.equal(deletionTitle({ kind: 'terms', ids: [] }, { ...many, terms: 1, name: 'sonda' }), 'Usunąć pojęcie „sonda”?');
});

test('podsumowanie importu', () => {
  assert.equal(
    importSummary({ domains: 2, modules: 5, lessons: 13, added: 40, updated: 0, skipped: 0 }),
    'Dodano: 40 pojęć, 13 lekcji, 5 modułów, 2 dziedziny.'
  );
  assert.equal(
    importSummary({ domains: 0, modules: 0, lessons: 0, added: 0, updated: 0, skipped: 40 }),
    'Te pojęcia są już w bibliotece.'
  );
  assert.equal(
    importSummary({ domains: 0, modules: 0, lessons: 1, added: 3, updated: 2, skipped: 1 }),
    'Dodano: 3 pojęcia, 1 lekcja. Zaktualizowano: 2. Pominięto istniejące: 1.'
  );
});
