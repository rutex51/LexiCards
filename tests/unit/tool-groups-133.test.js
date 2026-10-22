// Grupy narzędzi 1.33: gotowe zestawy, dobór grup (kolejność, schowane grupy standardowe, własne grupy)
// z pamięci urządzenia, grupy na kółkach i grupa na starcie przy własnym doborze.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanToolSettings, defaultToolSettings } from '../../js/core/drawing.js';
import {
  ALL_ITEMS, GROUP_ICONS, GROUP_LIMITS, PRESETS, TOOL_GROUPS, cleanToolGroups, defaultToolGroups, findGroup, groupsOf, itemLabel, newGroupId,
  startGroup
} from '../../js/core/tool-ring.js';

test('grupy 1.33: gotowe zestawy – znane pozycje bez powtórzeń, ikony do wyboru, nazwy pozycji', () => {
  assert.deepEqual(PRESETS.map((preset) => preset.label), ['Metrologia', 'Szkic odręczny', 'Geometria', 'Notatki']);
  for (const preset of PRESETS) {
    assert.ok(preset.items.every((item) => ALL_ITEMS.includes(item)), preset.id);
    assert.equal(new Set(preset.items).size, preset.items.length, preset.id);
    assert.ok(GROUP_ICONS.includes(preset.icon), `ikona ${preset.id}`);
    assert.ok(!TOOL_GROUPS.some((group) => group.id === preset.id), 'id zestawu inne niż grup standardowych');
  }
  assert.deepEqual(PRESETS[1].items.map(itemLabel), ['Pióro', 'Gumka', 'Strzałka']);
  assert.equal(itemLabel('shape:curve'), 'Strzałka po łuku');
  assert.equal(itemLabel('gdt'), 'Ramka tolerancji');
  for (const item of ALL_ITEMS) assert.notEqual(itemLabel(item), item, `nazwa ${item}`);
});

test('grupy 1.33: dobór z pamięci – kolejność, brakujące grupy w miejscu z kolejności domyślnej, co najmniej jedna grupa standardowa, sprawdzone własne grupy', () => {
  assert.deepEqual(cleanToolGroups(null), defaultToolGroups());
  assert.deepEqual(defaultToolGroups().mine.map((group) => group.id), ['metrology'], 'na początek – Metrologia');
  const clean = cleanToolGroups({
    order: ['text', 'nieznana', 'write', 'text'],
    off: ['symbols', 'symbols', 'x'],
    mine: [
      { id: 'own-1', label: '  Ulubione  ', icon: 'nieznana', items: ['pen', 'pen', 'shape:rect', 'shape:polygon', 'zła'] },
      { id: 'write', label: 'Podszywa się pod standardową', items: ['pen'] },
      { id: 'own-1', label: 'Powtórka', items: [] },
      { id: 'Zła nazwa!', items: ['pen'] },
      { id: 'own-2', label: '', icon: 'caliper', items: 'pen' },
      null
    ]
  });
  // Brakująca grupa – za tą, która jest przed nią w kolejności domyślnej (od 1.34 Wymiary za Tekstem i wzorami).
  assert.deepEqual(clean.order, ['text', 'dims', 'symbols', 'write', 'shapes', 'construct']);
  assert.deepEqual(clean.off, ['symbols']);
  assert.deepEqual(clean.mine, [
    { id: 'own-1', label: 'Ulubione', icon: 'star', items: ['pen', 'shape:rect'] },
    { id: 'own-2', label: 'Moja grupa', icon: 'caliper', items: [] }
  ]);
  const everyOff = cleanToolGroups({ off: TOOL_GROUPS.map((group) => group.id) });
  assert.deepEqual(everyOff.off, [], 'wszystkie schowane – wracają');
  assert.deepEqual(cleanToolGroups({ mine: [] }).mine, [], 'puste lewe kółko zostaje puste');
  // Granice: 8 grup, 12 pozycji, 30 znaków nazwy.
  const many = cleanToolGroups({
    mine: Array.from({ length: 12 }, (_, index) => ({ id: `own-${index + 1}`, label: 'x'.repeat(50), items: ALL_ITEMS }))
  });
  assert.equal(many.mine.length, GROUP_LIMITS.groups);
  assert.equal(many.mine[0].items.length, GROUP_LIMITS.items);
  assert.equal(many.mine[0].label.length, GROUP_LIMITS.label);
  assert.equal(newGroupId([{ id: 'own-1' }, { id: 'own-3' }]), 'own-2');
  assert.equal(newGroupId([]), 'own-1');
  // Zapis w ustawieniach narzędzi.
  const settings = cleanToolSettings({ ...defaultToolSettings(), toolGroups: { off: ['text'], mine: [] } });
  assert.deepEqual(settings.toolGroups.off, ['text']);
  assert.deepEqual(settings.toolGroups.mine, []);
  assert.deepEqual(cleanToolSettings({}).toolGroups, defaultToolGroups(), 'ustawienia sprzed 1.33');
});

test('grupy 1.33: grupy na kółkach i grupa na starcie przy własnym doborze', () => {
  const config = cleanToolGroups({
    order: ['symbols', 'shapes', 'write', 'construct', 'text'],
    off: ['write', 'text'],
    mine: [{ id: 'own-1', label: 'Pusta', items: [] }, { id: 'sketch', label: 'Szkic', icon: 'sketch', items: ['pen', 'eraser'] }]
  });
  assert.deepEqual(groupsOf('right', config).map((group) => group.id), ['symbols', 'shapes', 'construct', 'dims']);
  assert.deepEqual(groupsOf('left', config).map((group) => group.id), ['sketch'], 'pusta grupa nie jest na kółku');
  assert.equal(findGroup('right', 'write', config), null, 'schowana grupa');
  assert.equal(findGroup('left', 'sketch', config).label, 'Szkic');
  assert.equal(findGroup('left', 'metrology', config), null, 'bez Metrologii');
  // Zapamiętana grupa schowana – grupa z narzędziem: najpierw standardowa, potem własna, inaczej pierwsza z prawej.
  assert.deepEqual(startGroup('right:write', 'shape:rect', config), { side: 'right', id: 'shapes' });
  assert.deepEqual(startGroup('right:write', 'pen', config), { side: 'left', id: 'sketch' });
  assert.deepEqual(startGroup('left:own-1', 'highlighter', config), { side: 'right', id: 'symbols' });
  assert.deepEqual(startGroup('left:sketch', 'pen', config), { side: 'left', id: 'sketch' });
  // Bez doboru – jak w 1.32.
  assert.deepEqual(startGroup('left:metrology', 'pen'), { side: 'left', id: 'metrology' });
});
