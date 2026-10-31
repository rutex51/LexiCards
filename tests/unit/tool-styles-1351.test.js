// Styl nowych kształtów 1.35.1: rodzaj linii i wypełnienie zapamiętane osobno dla każdego kształtu,
// ustawienia sprzed 1.35.1 (wspólne) jako wartość domyślna, sprawdzanie zapisu.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STYLE_DEFAULTS, cleanToolSettings, defaultToolSettings, shapeToolStyle, withShapeToolStyle } from '../../js/core/drawing.js';

/** Rodzaj linii i wypełnienie (od 1.40 styl ma też kreskowanie – sprawdzane w testach 1.40). */
const dashFill = (tools, kind) => {
  const { dash, fill } = shapeToolStyle(tools, kind);
  return { dash, fill };
};

test('style kształtów 1.35.1: każdy kształt pamięta swój rodzaj linii i wypełnienie, reszta – wspólne ustawienie', () => {
  let tools = defaultToolSettings();
  assert.deepEqual(tools.shapeStyles, {});
  assert.deepEqual(dashFill(tools, 'xline'), { dash: 'solid', fill: 'none' });
  tools = withShapeToolStyle(tools, 'xline', 'dash', 'center');
  tools = withShapeToolStyle(tools, 'arc', 'dash', 'dotted');
  tools = withShapeToolStyle(tools, 'rect', 'fill', 'light');
  // Wybór dla łuku nie zmienia prostej (do 1.35 rodzaj linii był wspólny).
  assert.deepEqual(dashFill(tools, 'xline'), { dash: 'center', fill: 'none' });
  assert.deepEqual(dashFill(tools, 'arc'), { dash: 'dotted', fill: 'none' });
  assert.deepEqual(dashFill(tools, 'rect'), { dash: 'solid', fill: 'light' });
  tools = withShapeToolStyle(tools, 'rect', 'dash', 'dashed');
  assert.deepEqual(dashFill(tools, 'rect'), { dash: 'dashed', fill: 'light' }, 'wypełnienie zostaje');
  // Wspólne wartości (ustawienia sprzed 1.35.1) dla kształtów bez własnych – zapisane od 1.63 (ze znacznikiem; starsze –
  // test 1.63 w drawing-163.test.js).
  const old = cleanToolSettings({ styleDefaults: STYLE_DEFAULTS, shapeDash: 'phantom', shapeFill: 'solid' });
  assert.deepEqual(dashFill(old, 'ellipse'), { dash: 'phantom', fill: 'solid' });
  assert.deepEqual(dashFill(withShapeToolStyle(old, 'ellipse', 'dash', 'solid'), 'ellipse'), { dash: 'solid', fill: 'solid' });
});

test('style kształtów 1.35.1: zapis – znane kształty i wartości, reszta odrzucona', () => {
  const saved = cleanToolSettings({
    styleDefaults: STYLE_DEFAULTS,
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
