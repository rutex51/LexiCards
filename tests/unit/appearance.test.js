// Kolor aplikacji: domyślny, odczyt z ustawień (także ze starej albo nowszej kopii) i kopia zapasowa.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBackup, parseBackupText, restoreBackup } from '../../js/core/backup.js';
import { ACCENT_COLORS, DEFAULT_ACCENT, accentColor, defaultSettings } from '../../js/core/model.js';
import { makeLibrary } from './helpers.js';

test('kolory aplikacji: niebieski domyślnie, nieznana wartość – niebieski', () => {
  assert.deepEqual(ACCENT_COLORS.map((item) => item.id), ['blue', 'graphite', 'orange', 'green', 'red']);
  assert.equal(defaultSettings().accentColor, DEFAULT_ACCENT);
  assert.equal(DEFAULT_ACCENT, 'blue');
  for (const id of ['graphite', 'orange', 'green', 'red']) assert.equal(accentColor({ accentColor: id }), id);
  // Kopia sprzed wersji 0.6.3 nie ma tego pola; kopia z nowszej wersji może mieć kolor, którego tu nie ma.
  assert.equal(accentColor({}), 'blue');
  assert.equal(accentColor({ accentColor: 'purple' }), 'blue');
  assert.equal(accentColor(null), 'blue');
});

test('kolor aplikacji jest zapisywany i wraca z kopią zapasową razem z motywem', async () => {
  const { library } = await makeLibrary();
  await library.updateSettings({ appearance: 'dark', accentColor: 'orange' });
  const text = JSON.stringify(await createBackup(library, '0.6.3'));
  const { library: fresh } = await makeLibrary();
  assert.equal(fresh.getSettings().accentColor, 'blue');
  await restoreBackup(fresh, parseBackupText(text));
  assert.equal(fresh.getSettings().appearance, 'dark');
  assert.equal(fresh.getSettings().accentColor, 'orange');
});
