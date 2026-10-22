// Styl nowych kształtów 1.35.1: rodzaj linii i wypełnienie zapamiętane osobno dla każdego kształtu,
// ustawienia sprzed 1.35.1 (wspólne) jako wartość domyślna, sprawdzanie zapisu.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanToolSettings, defaultToolSettings, shapeToolStyle, withShapeToolStyle } from '../../js/core/drawing.js';

test('style kształtów 1.35.1: każdy kształt pamięta swój rodzaj linii i wypełnienie, reszta – wspólne ustawienie', () => {
  let tools = defaultToolSettings();
  assert.deepEqual(tools.shapeStyles, {});
  assert.deepEqual(shapeToolStyle(tools, 'xline'), { dash: 'solid', fill: 'none' });
  tools = withShapeToolStyle(tools, 'xline', 'dash', 'center');
  tools = withShapeToolStyle(tools, 'arc', 'dash', 'dotted');
  tools = withShapeToolStyle(tools, 'rect', 'fill', 'light');
  // Wybór dla łuku nie zmienia prostej (do 1.35 rodzaj linii był wspólny).
  assert.deepEqual(shapeToolStyle(tools, 'xline'), { dash: 'center', fill: 'none' });
  assert.deepEqual(shapeToolStyle(tools, 'arc'), { dash: 'dotted', fill: 'none' });
  assert.deepEqual(shapeToolStyle(tools, 'rect'), { dash: 'solid', fill: 'light' });
  tools = withShapeToolStyle(tools, 'rect', 'dash', 'dashed');
  assert.deepEqual(shapeToolStyle(tools, 'rect'), { dash: 'dashed', fill: 'light' }, 'wypełnienie zostaje');
  // Ustawienia sprzed 1.35.1: wspólne wartości dla kształtów bez własnych.
  const old = cleanToolSettings({ shapeDash: 'phantom', shapeFill: 'solid' });
  assert.deepEqual(shapeToolStyle(old, 'ellipse'), { dash: 'phantom', fill: 'solid' });
  assert.deepEqual(shapeToolStyle(withShapeToolStyle(old, 'ellipse', 'dash', 'solid'), 'ellipse'), { dash: 'solid', fill: 'solid' });
});

test('style kształtów 1.35.1: zapis – znane kształty i wartości, reszta odrzucona', () => {
  const saved = cleanToolSettings({
    shapeStyles: {
      xline: { dash: 'center', fill: 'solid' },
      arc: { dash: 'falista' },
      nieznany: { dash: 'dotted' },
      rect: { dash: 'dashed', fill: 'kropki' },
      ellipse: 'x'
    }
  });
  assert.deepEqual(saved.shapeStyles, { xline: { dash: 'center', fill: 'solid' }, rect: { dash: 'dashed' } });
  assert.deepEqual(cleanToolSettings({ shapeStyles: [] }).shapeStyles, {});
  assert.deepEqual(cleanToolSettings({}).shapeStyles, {}, 'ustawienia sprzed 1.35.1');
});
