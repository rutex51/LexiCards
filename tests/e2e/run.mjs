// Testy w prawdziwej przeglądarce (Chromium sterowany przez Playwright).
//
//   npm run test:e2e
//
// Wymaga biblioteki Playwright z przeglądarką Chromium. Gdy nie jest zainstalowana
// w projekcie, ścieżkę do niej można podać w zmiennej PLAYWRIGHT_MODULE.
// Każdy test dostaje świeży profil przeglądarki (pustą bazę danych).

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { decodeText, parseCsv } from '../../js/core/csv.js';
import { openWorkbook } from '../../js/core/xlsx.js';
import { startServer } from '../../tools/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = path.join(ROOT, 'tests/e2e/output');
const run = promisify(execFile);

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return createRequire(import.meta.url)(candidate);
    } catch {
      // próbujemy kolejnej lokalizacji
    }
  }
  throw new Error('Nie znaleziono biblioteki Playwright. Zainstaluj ją (npm install playwright) albo ustaw PLAYWRIGHT_MODULE.');
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

const tests = [];
function test(name, body, options = {}) {
  tests.push({ name, body, options });
}

// ---------------------------------------------------------------- pomocnicze

async function waitUntil(check, message, timeout = 5000) {
  const started = Date.now();
  let last;
  for (;;) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    if (Date.now() - started > timeout) {
      throw new Error(`${message} (ostatni wynik: ${last instanceof Error ? last.message : JSON.stringify(last)})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function expectText(locator, expected, message = '') {
  let text = '';
  await waitUntil(async () => {
    text = (await locator.first().textContent()) ?? '';
    return text.includes(expected);
  }, `${message || 'Oczekiwano tekstu'} „${expected}”`).catch((error) => {
    throw new Error(`${error.message}; jest: „${text.trim().slice(0, 200)}”`);
  });
}

const title = (page) => page.locator('.screen__title');
const sheet = (page) => page.locator('dialog.sheet[open]').last();
const termRows = (page) => page.locator('.terms > .term');

async function tab(page, name) {
  await page.getByRole('navigation', { name: 'Główne sekcje' }).getByRole('link', { name, exact: true }).click();
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll('[aria-current="page"]')].some((link) => link.textContent.trim() === expected),
    name
  );
}

async function saveSheet(page) {
  const count = await page.locator('dialog.sheet[open]').count();
  await sheet(page).locator('.sheet__submit').click();
  await waitUntil(async () => (await page.locator('dialog.sheet[open]').count()) < count, 'Arkusz formularza powinien się zamknąć');
}

async function menuItem(page, name) {
  await page.locator('dialog.menu[open]').getByRole('menuitem', { name, exact: true }).click();
}

async function confirm(page) {
  await page.locator('dialog.alert[open] [data-testid=confirm]').click();
  await page.locator('dialog.alert[open]').waitFor({ state: 'detached' });
}

async function loadSamples(page) {
  await page.click('[data-testid=start-load-samples]');
  await page.locator('.tiles').waitFor();
}

const summary = (page) => page.evaluate(() => window.lexicards.library.summary());

/**
 * O ile pikseli treść jest szersza od ekranu. Porównujemy z szerokością urządzenia, a nie
 * z window.innerWidth: w trybie telefonu przeglądarka poszerza obszar układu do treści,
 * więc innerWidth rośnie razem z nią i niczego by nie wykrył.
 */
const overflowX = (page) => page.evaluate(
  (width) => Math.max(document.documentElement.scrollWidth, window.innerWidth) - width,
  page.viewportSize().width
);

// ---------------------------------------------------------------- kreator importu

const FIXTURES = path.join(ROOT, 'tests/fixtures');
const stepTitle = (page) => page.locator('[data-testid=import-step-title]');
const nextButton = (page) => page.locator('[data-testid=import-next]');

async function chooseImportFile(page, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=import-pick]')]);
  await chooser.setFiles(file);
}

/** Przechodzi do następnego kroku i czeka na jego tytuł. */
async function nextStep(page, expectedTitle) {
  await nextButton(page).click();
  await expectText(stepTitle(page), expectedTitle);
}

async function finishImport(page, buttonLabel) {
  await expectText(nextButton(page), buttonLabel);
  await nextButton(page).click();
  await page.locator('[data-testid=import-done]').waitFor();
}

/** Wartość w wierszu „etykieta – wartość” na ekranie kreatora. */
async function rowValue(page, label) {
  const row = page.locator('.row--static', { hasText: label });
  return (await row.locator('.row__value').textContent()).trim();
}

async function download(page, trigger) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const target = path.join(OUTPUT, file.suggestedFilename());
  await file.saveAs(target);
  return { name: file.suggestedFilename(), bytes: new Uint8Array(await readFile(target)) };
}

// ---------------------------------------------------------------- testy

test('pusta aplikacja: dziedzina, moduł, lekcja i pojęcie krok po kroku (telefon)', async ({ open }) => {
  const page = await open();
  await expectText(page.locator('.empty__title'), 'Zacznij od pierwszej dziedziny');

  await page.click('[data-testid=start-add-domain]');
  assert.equal(await sheet(page).locator('.sheet__submit').isDisabled(), true, 'bez nazwy nie można zapisać');
  await page.fill('[data-testid=domain-name]', '  Prawo   handlowe ');
  await saveSheet(page);
  await expectText(page.locator('.tile__name'), 'Prawo handlowe');
  await expectText(page.locator('.tile__meta'), '0 modułów, 0 pojęć');

  await page.click('.tile__link');
  await expectText(title(page), 'Prawo handlowe');
  await page.click('[data-testid=domain-add-module]');
  await page.fill('[data-testid=module-name]', 'Spółki');
  await saveSheet(page);

  await page.getByRole('link', { name: /Spółki/ }).click();
  await expectText(title(page), 'Spółki');
  await page.click('[data-testid=module-add-lesson]');
  await page.fill('[data-testid=lesson-name]', 'Organy spółki');
  await saveSheet(page);

  await page.getByRole('link', { name: /Organy spółki/ }).click();
  await expectText(title(page), 'Organy spółki');
  await page.click('[data-testid=lesson-add-term]');
  await page.fill('[data-testid=term-pl]', 'zarząd');
  assert.equal(await sheet(page).locator('.sheet__submit').isDisabled(), true, 'bez tłumaczenia nie można zapisać');
  await page.fill('[data-testid=term-en]', 'management board');
  await saveSheet(page);

  await expectText(page.locator('.term__pl'), 'zarząd');
  await expectText(page.locator('.term__en'), 'management board');

  // Brak opisu i przykładu jest nazwany wprost.
  await page.click('.term__toggle');
  await expectText(page.locator('.term__details'), 'Brak danych');

  assert.deepEqual(await summary(page), { domains: 1, modules: 1, lessons: 1, terms: 1, favorites: 0 });
});

test('dane zostają po ponownym otwarciu strony (IndexedDB)', async ({ open }) => {
  const page = await open();
  assert.equal(await page.evaluate(() => window.lexicards.storage), 'indexeddb');
  await loadSamples(page);
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(page.locator('.screen__subtitle'), 'Masz 40 pojęć w 13 lekcjach.');
  assert.equal((await summary(page)).terms, 40);
});

test('nowa lekcja tworzy brakujący moduł i dziedzinę w jednym formularzu', async ({ open }) => {
  const page = await open('#/library');
  await page.click('.icon-button--accent');
  await menuItem(page, 'Lekcję');
  await page.fill('[data-testid=lesson-name]', 'Umowy');
  // Pusta biblioteka: formularz od razu proponuje utworzenie dziedziny i modułu.
  await page.fill('[data-testid=new-domain-name]', 'Prawo');
  assert.equal(await sheet(page).locator('.sheet__submit').isDisabled(), true, 'brakuje nazwy modułu');
  await page.fill('[data-testid=new-module-name]', 'Cywilne');
  await saveSheet(page);
  assert.deepEqual(await summary(page), { domains: 1, modules: 1, lessons: 1, terms: 0, favorites: 0 });
  await expectText(page.locator('.row__subtitle').last(), '1 moduł, 0 pojęć');
});

test('glosariusz: wyszukiwanie bez polskich znaków, filtr, sortowanie, ulubione', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await page.goto(`${page.url().split('#')[0]}#/library/glossary`);
  const count = page.locator('[data-testid=glossary-count]');
  await expectText(count, '40 pojęć');
  assert.equal(await termRows(page).first().locator('.term__pl').textContent(), 'aktywa');

  await page.fill('[data-testid=search]', 'PLYNNOSCI');
  await expectText(count, '1 pojęcie');
  await expectText(page.locator('.term__pl'), 'wskaźnik płynności bieżącej');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), 'search', 'pole wyszukiwania zachowuje fokus');

  await page.fill('[data-testid=search]', 'probe');
  await expectText(count, '3 pojęcia');
  await page.fill('[data-testid=search]', 'xyzxyz');
  await expectText(page.locator('.empty__title'), 'Nic nie znaleziono');
  await page.fill('[data-testid=search]', '');
  await expectText(count, '40 pojęć');

  await page.getByRole('button', { name: 'Filtry i sortowanie' }).click();
  await page.selectOption('[data-testid=filter-domain]', { label: 'Metrology' });
  await page.selectOption('[data-testid=filter-sort]', 'english');
  await saveSheet(page);
  await expectText(count, '18 pojęć');
  await expectText(page.locator('[data-testid=filter-summary]'), 'Filtr: Metrology');
  assert.equal(await termRows(page).first().locator('.term__en').textContent(), 'bridge');

  await page.getByRole('button', { name: 'Dodaj do ulubionych: portal maszyny' }).click();
  await page.getByRole('button', { name: 'Usuń z ulubionych: portal maszyny' }).waitFor();
  await page.getByRole('button', { name: 'Filtry i sortowanie (aktywne)' }).click();
  await sheet(page).getByText('Tylko ulubione').click();
  await saveSheet(page);
  await expectText(count, '1 pojęcie');
  await page.getByRole('button', { name: 'Wyczyść' }).click();
  await expectText(count, '40 pojęć');
});

test('usuwanie dziedziny ostrzega, ile elementów zniknie', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await tab(page, 'Biblioteka');
  await page.getByRole('button', { name: 'Więcej poleceń: Metrology' }).click();
  await menuItem(page, 'Usuń');
  await expectText(page.locator('.alert__title'), 'Usunąć dziedzinę „Metrology”?');
  await expectText(page.locator('.alert__message'), 'Usunięte zostaną również: 2 moduły, 5 lekcji i 18 pojęć.');
  await expectText(page.locator('.alert__message'), 'Tej operacji nie można cofnąć.');

  // Anulowanie niczego nie usuwa.
  await page.locator('dialog.alert[open]').getByRole('button', { name: 'Anuluj' }).click();
  assert.equal((await summary(page)).terms, 40);

  await page.getByRole('button', { name: 'Więcej poleceń: Metrology' }).click();
  await menuItem(page, 'Usuń');
  await confirm(page);
  await waitUntil(async () => (await summary(page)).terms === 22, 'Po usunięciu powinny zostać 22 pojęcia');
  assert.deepEqual(await summary(page), { domains: 1, modules: 3, lessons: 8, terms: 22, favorites: 0 });
  await waitUntil(async () => (await page.getByRole('link', { name: /Metrology/ }).count()) === 0, 'Dziedzina powinna zniknąć z listy');
});

test('duplikat w lekcji wymaga potwierdzenia; „Zapisz i dodaj kolejne” zostawia formularz otwarty', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await tab(page, 'Biblioteka');
  await page.getByRole('link', { name: /Business English/ }).click();
  await page.getByRole('link', { name: /Finance/ }).click();
  await page.getByRole('link', { name: /Investments/ }).click();
  await expectText(page.locator('.results .group__title'), '2 pojęcia');

  await page.getByRole('button', { name: 'Dodaj pojęcie' }).click();
  await page.fill('[data-testid=term-pl]', 'obligacja');
  await page.fill('[data-testid=term-en]', 'bond');
  await page.click('[data-testid=term-save-another]');
  await expectText(sheet(page).locator('.form-footer'), 'Dodano w tej sesji: 1 pojęcie.');
  assert.equal(await page.inputValue('[data-testid=term-pl]'), '', 'formularz jest wyczyszczony');

  // To samo pojęcie jeszcze raz (inna wielkość liter): pierwsza próba tylko ostrzega.
  await page.fill('[data-testid=term-pl]', 'Obligacja');
  await page.fill('[data-testid=term-en]', 'BOND');
  await sheet(page).locator('.sheet__submit').click();
  await expectText(sheet(page).locator('.form-message--warning'), 'Takie pojęcie już istnieje w tej lekcji');
  assert.equal((await summary(page)).terms, 41, 'ostrzeżenie nie zapisuje');
  await saveSheet(page);
  assert.equal((await summary(page)).terms, 42);
  await expectText(page.locator('.results .group__title'), '4 pojęcia');
});

test('przenoszenie pojęcia do innej lekcji i zaznaczanie wielu pojęć', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await tab(page, 'Biblioteka');
  await page.getByRole('link', { name: /Business English/ }).click();
  await page.getByRole('link', { name: /Negotiations/ }).click();
  await page.getByRole('link', { name: /Basic Vocabulary/ }).click();

  await page.getByRole('button', { name: 'Więcej poleceń: oferta' }).click();
  await menuItem(page, 'Przenieś do…');
  const picker = sheet(page);
  await picker.getByRole('button', { name: 'Metrology' }).click();
  await picker.getByRole('button', { name: 'Geometrical Tolerancing' }).click();
  await picker.getByRole('button', { name: 'Position Tolerances' }).click();
  await expectText(page.locator('.results .group__title'), '1 pojęcie');
  const moved = await page.evaluate(() => {
    const { library } = window.lexicards;
    const term = [...library.maps.terms.values()].find((item) => item.termPL === 'oferta');
    return library.lessonPath(term.lessonID);
  });
  assert.equal(moved, 'Metrology › Geometrical Tolerancing › Position Tolerances');

  // Zaznaczanie: usuwamy wszystkie pojęcia lekcji jednym poleceniem.
  await tab(page, 'Biblioteka');
  await page.getByRole('link', { name: /Metrology/ }).click();
  await page.getByRole('link', { name: /Geometrical Tolerancing/ }).click();
  await page.getByRole('link', { name: /Form Tolerances/ }).click();
  await page.getByRole('button', { name: 'Zaznacz', exact: true }).click();
  assert.equal(await page.locator('[data-testid=selection-actions]').isDisabled(), true);
  await page.getByRole('button', { name: 'Zaznacz wszystkie' }).click();
  await expectText(page.locator('.bottombar__status'), 'Zaznaczono: 4');
  await page.click('[data-testid=selection-actions]');
  await menuItem(page, 'Usuń');
  await expectText(page.locator('.alert__title'), 'Usunąć 4 pojęcia?');
  await confirm(page);
  await expectText(page.locator('.empty__title'), 'Brak pojęć');
  assert.equal((await summary(page)).terms, 36);
});

test('zmiana kolejności dziedzin jest zapamiętywana', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await tab(page, 'Biblioteka');
  const names = () => page.locator('.group__list .row__title').allTextContents();
  assert.deepEqual((await names()).slice(-2), ['Business English', 'Metrology']);
  await page.getByRole('button', { name: 'Zmień kolejność dziedzin' }).click();
  await page.getByRole('button', { name: 'Przesuń wyżej: Metrology' }).click();
  await waitUntil(async () => (await names()).join() === 'Metrology,Business English', 'Metrology powinna być pierwsza');
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  assert.deepEqual((await names()).slice(-2), ['Metrology', 'Business English']);
});

test('kopia zapasowa: zapis do pliku, usunięcie wszystkich danych, przywrócenie', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await page.goto(`${page.url().split('#')[0]}#/settings`);
  await expectText(page.locator('.group__footer').first(), 'Nie zapisano jeszcze żadnej kopii.');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=backup-export]')]);
  assert.match(download.suggestedFilename(), /^LexiCards-kopia-\d{4}-\d{2}-\d{2}\.json$/);
  const file = path.join(OUTPUT, 'kopia.json');
  await download.saveAs(file);
  const backup = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(backup.format, 'lexicards-backup');
  assert.equal(backup.counts.terms, 40);
  assert.equal(backup.data.terms.length, 40);
  await expectText(page.locator('.group__footer').first(), 'Ostatnia kopia:');

  await page.click('[data-testid=delete-all]');
  await expectText(page.locator('.alert__message'), 'Usunięte zostaną: 2 dziedziny, 5 modułów, 13 lekcji i 40 pojęć');
  await confirm(page);
  await waitUntil(async () => (await summary(page)).terms === 0, 'Biblioteka powinna być pusta');
  await waitUntil(async () => (await page.locator('[data-testid=delete-all]').count()) === 0, 'Pusta biblioteka nie powinna mieć polecenia usuwania');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=backup-restore]')]);
  await chooser.setFiles(file);
  await expectText(page.locator('.alert__message'), 'Zawartość: 2 dziedziny, 5 modułów, 13 lekcji i 40 pojęć');
  await confirm(page);
  await waitUntil(async () => (await summary(page)).terms === 40, 'Po przywróceniu powinno być 40 pojęć');

  // Przywrócone dane są w bazie, nie tylko w pamięci.
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  assert.deepEqual(await summary(page), { domains: 2, modules: 5, lessons: 13, terms: 40, favorites: 0 });
});

test('uszkodzony plik kopii nie zmienia danych', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await page.goto(`${page.url().split('#')[0]}#/settings`);

  const broken = path.join(OUTPUT, 'zepsuta.json');
  await writeFile(broken, '{"format":"lexicards-backup","formatVersion":1,"data":{"domains":[],"modules":[{"id":"m1","name":"X","domainID":"brak"}]}}');
  let [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=backup-restore]')]);
  await chooser.setFiles(broken);
  await expectText(page.locator('.alert__title'), 'Nie udało się wykonać operacji');
  await expectText(page.locator('.alert__message'), 'wskazuje na nieistniejącą dziedzinę');
  await page.locator('dialog.alert[open]').getByRole('button', { name: 'OK' }).click();

  const notJson = path.join(OUTPUT, 'notatki.json');
  await writeFile(notJson, 'to nie jest kopia');
  [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=backup-restore]')]);
  await chooser.setFiles(notJson);
  await expectText(page.locator('.alert__message'), 'To nie jest poprawny plik kopii zapasowej');
  await page.locator('dialog.alert[open]').getByRole('button', { name: 'OK' }).click();

  assert.equal((await summary(page)).terms, 40);
}, { allowConsoleErrors: true });

test('telefon z arkuszem udostępniania: kopia trafia do „Zachowaj w Plikach”', async ({ open, context }) => {
  // Chromium na komputerze nie ma arkusza udostępniania – podstawiamy go, żeby sprawdzić tę ścieżkę.
  await context.addInitScript(() => {
    navigator.canShare = (data) => Array.isArray(data?.files) && data.files.length === 1;
    navigator.share = async (data) => {
      window.sharedFile = { name: data.files[0].name, text: await data.files[0].text() };
    };
  });
  const page = await open();
  await loadSamples(page);
  await page.goto(`${page.url().split('#')[0]}#/settings`);
  await page.click('[data-testid=backup-export]');
  await expectText(page.locator('.alert__title'), 'Kopia zapasowa jest gotowa');
  await confirm(page);
  const shared = await waitUntil(() => page.evaluate(() => window.sharedFile), 'Plik powinien trafić do arkusza udostępniania');
  assert.match(shared.name, /^LexiCards-kopia-/);
  assert.equal(JSON.parse(shared.text).counts.terms, 40);
  await expectText(page.locator('.group__footer').first(), 'Ostatnia kopia:');
});

test('motyw ciemny jest zapamiętywany i ustawiany przed narysowaniem strony', async ({ open }) => {
  const page = await open('#/settings');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), undefined);
  await page.getByRole('radio', { name: 'Ciemny' }).check();
  await waitUntil(() => page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'Motyw powinien być ciemny');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)');

  // Po ponownym otwarciu motyw jest ustawiony, zanim wystartuje reszta aplikacji.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => { window.themeAtParse = document.documentElement.dataset.theme; });
  });
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  assert.equal(await page.evaluate(() => window.themeAtParse), 'dark');
  assert.equal(await page.evaluate(() => window.lexicards.library.getSettings().appearance), 'dark');
});

test('szeroki ekran: panel boczny i tabela glosariusza; wąski: zakładki i lista', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  assert.equal(await page.locator('.sidebar').isVisible(), true);
  assert.equal(await page.locator('.tabbar').isVisible(), false);
  await tab(page, 'Biblioteka');
  await page.click('[data-testid=open-glossary]');
  await page.locator('table.table').waitFor();
  assert.equal(await page.locator('table.table tbody tr').count(), 40);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.terms').waitFor();
  assert.equal(await page.locator('table.table').count(), 0);
  assert.equal(await page.locator('.sidebar').isVisible(), false);
  assert.equal(await page.locator('.tabbar').isVisible(), true);
}, { device: DESKTOP });

test('wąski ekran 320 px: żaden ekran nie przewija się w poziomie', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const base = page.url().split('#')[0];
  const lessonID = await page.evaluate(() => [...window.lexicards.library.maps.lessons.values()].find((lesson) => lesson.name === 'Negotiation Techniques').id);
  for (const hash of ['#/start', '#/library', '#/library/glossary', `#/library/lesson/${lessonID}`, '#/settings', '#/study', '#/quiz', '#/stats']) {
    await page.goto(base + hash);
    await page.waitForFunction((expected) => location.hash === expected, hash);
    const overflow = await overflowX(page);
    assert.ok(overflow <= 0, `${hash}: treść wystaje o ${overflow} px`);
  }
}, { device: { ...PHONE, viewport: { width: 320, height: 568 } } });

test('„wstecz” przywraca miejsce przewinięcia listy', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await tab(page, 'Biblioteka');
  await page.click('[data-testid=open-glossary]');
  await page.locator('.terms').waitFor();
  await page.evaluate(() => window.scrollTo(0, 1500));
  await waitUntil(() => page.evaluate(() => window.scrollY === 1500), 'Lista powinna się przewinąć');
  await tab(page, 'Start');
  await expectText(title(page), 'Start');
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.goBack();
  await expectText(title(page), 'Glosariusz');
  await waitUntil(() => page.evaluate(() => window.scrollY === 1500), 'Po powrocie lista powinna być w tym samym miejscu');
});

test('glosariusz dociąga długą listę porcjami podczas przewijania', async ({ open }) => {
  const page = await open();
  await page.evaluate(async () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({
      domain: 'Test', module: 'Moduł', lesson: `Lekcja ${1 + (index % 5)}`,
      term: { termPL: `pojęcie ${String(index + 1).padStart(3, '0')}`, termEN: `term ${index + 1}` }
    }));
    await window.lexicards.library.importRows(rows);
  });
  await page.goto(`${page.url().split('#')[0]}#/library/glossary`);
  const count = page.locator('[data-testid=glossary-count]');
  await expectText(count, 'Wczytano 100 z 250 pojęć');
  assert.equal(await termRows(page).count(), 100);

  // Rozwinięte pojęcie zostaje rozwinięte po dociągnięciu kolejnej porcji.
  await termRows(page).first().locator('.term__toggle').click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectText(count, 'Wczytano 200 z 250 pojęć');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await waitUntil(async () => (await count.textContent()) === '250 pojęć', 'Powinny wczytać się wszystkie pojęcia');
  assert.equal(await termRows(page).count(), 250);
  assert.equal(await page.locator('[data-testid=load-more]').count(), 0);
  assert.equal(await termRows(page).first().locator('.term__toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await termRows(page).last().locator('.term__pl').textContent(), 'pojęcie 250');
});

test('obsługa z klawiatury: menu, formularz, Enter zapisuje, Esc anuluje', async ({ open }) => {
  const page = await open('#/library');
  await page.getByRole('button', { name: 'Dodaj', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('dialog.menu[open]').waitFor();
  // Fokus trafia do menu; pierwsza pozycja to „Dziedzinę”.
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Dziedzinę');
  await page.keyboard.press('Enter');
  await sheet(page).waitFor();
  await waitUntil(() => page.evaluate(() => document.activeElement?.dataset.testid === 'domain-name'), 'Fokus powinien być w polu nazwy');
  await page.keyboard.type('Medycyna');
  await page.keyboard.press('Enter');
  await waitUntil(async () => (await summary(page)).domains === 1, 'Enter powinien zapisać dziedzinę');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });

  // Esc w oknie potwierdzenia anuluje usuwanie.
  await page.getByRole('button', { name: 'Więcej poleceń: Medycyna' }).focus();
  await page.keyboard.press('Enter');
  await menuItem(page, 'Usuń');
  await page.locator('dialog.alert[open]').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Anuluj', 'bezpieczny przycisk ma fokus');
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal((await summary(page)).domains, 1);

  // Esc zamyka też formularz bez zapisywania.
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await menuItem(page, 'Dziedzinę');
  await page.keyboard.type('Niezapisana');
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal((await summary(page)).domains, 1);
}, { device: DESKTOP });

test('import XLSX ze strukturą: siedem kroków, lista tworzonych elementów, wynik', async ({ open }) => {
  const page = await open();
  await page.click('[data-testid=start-import]');
  await expectText(title(page), 'Import z pliku');
  await expectText(page.locator('.screen__subtitle'), 'Krok 1 z 7');
  assert.equal(await nextButton(page).isDisabled(), true, 'bez pliku nie można przejść dalej');

  await chooseImportFile(page, path.join(ROOT, 'docs/samples/lexicards_sample.xlsx'));
  await expectText(stepTitle(page), 'Wybierz arkusz');
  await expectText(page.locator('[data-testid=import-size]'), '41 wierszy, 10 kolumn');
  await expectText(page.locator('[data-testid=import-file-preview]'), 'przywództwo');

  await nextStep(page, 'Przypisz kolumny');
  // Nagłówki zostały rozpoznane: kolumny D i E to pojęcie PL i EN.
  assert.equal(await page.inputValue('[data-testid=import-map-termPL]'), '3');
  assert.equal(await page.inputValue('[data-testid=import-map-termEN]'), '4');
  assert.equal(await page.inputValue('[data-testid=import-map-lesson]'), '2');
  assert.equal(await page.inputValue('[data-testid=import-map-tags]'), '9');
  assert.equal(await page.locator('[data-testid=import-unused]').count(), 0);

  await nextStep(page, 'Wybierz miejsce');
  await expectText(page.locator('[data-testid=import-structure-note]'), 'Domain, Module, Lesson');

  await nextStep(page, 'Sprawdź dane');
  assert.equal(await rowValue(page, 'Wiersze z pojęciami'), '40');
  assert.equal(await rowValue(page, 'Poprawne'), '40');
  await expectText(page.locator('.form-message--info'), 'Wszystkie wiersze są poprawne.');

  await nextStep(page, 'Przejrzyj pojęcia');
  await expectText(page.locator('[data-testid=import-preview-count]'), 'Pierwsze 30 z 40 pojęć');
  await expectText(page.locator('[data-testid=import-preview] .term').first(), 'Wiersz 2 → Business English › Management › Leadership');
  await expectText(page.locator('[data-testid=import-preview] .status').first(), 'Nowe');
  await page.click('[data-testid=import-preview-more]');
  await waitUntil(async () => (await page.locator('[data-testid=import-preview] .term').count()) === 40, 'Podgląd powinien pokazać 40 pojęć');

  await nextStep(page, 'Zatwierdź import');
  assert.equal(await rowValue(page, 'Zostaną dodane'), '40');
  const created = page.locator('[data-testid=import-created]');
  await expectText(created, 'Nowe dziedziny: 2');
  await expectText(created, 'Nowe moduły: 5');
  await expectText(created, 'Nowe lekcje: 13');
  await expectText(created, 'Metrology › Geometrical Tolerancing');
  // Do tej pory nic nie zostało zapisane.
  assert.equal((await summary(page)).terms, 0);

  await finishImport(page, 'Importuj 40 pojęć');
  await expectText(page.locator('[data-testid=import-done]'), 'Dodano: 40 pojęć. Utworzono: 2 dziedziny, 5 modułów i 13 lekcji.');
  assert.deepEqual(await summary(page), { domains: 2, modules: 5, lessons: 13, terms: 40, favorites: 0 });

  // Zaimportowane dane są takie same jak wbudowane przykłady.
  const same = await page.evaluate(async () => {
    const { sampleRows } = await import('./js/core/samples.js');
    const { library } = window.lexicards;
    return sampleRows().every((row) => {
      const domain = library.findDomain(row.domain.name);
      const module = domain && library.findModule(row.module, domain.id);
      const lesson = module && library.findLesson(row.lesson, module.id);
      const term = lesson && library.findTerm(row.term.termPL, row.term.termEN, lesson.id);
      return term && (term.descriptionPL ?? '') === (row.term.descriptionPL ?? '') && (term.exampleEN ?? '') === (row.term.exampleEN ?? '')
        && term.tags.join() === (row.term.tags ?? []).join();
    });
  });
  assert.equal(same, true, 'treść pojęć powinna odpowiadać danym przykładowym');

  await page.click('[data-testid=import-open-library]');
  await expectText(title(page), 'Biblioteka');
});

test('import CSV z polskiego Excela (Windows-1250, średniki) do wybranej lekcji', async ({ open }) => {
  const page = await open();
  const lessonID = await page.evaluate(async () => {
    const lesson = await window.lexicards.library.createLesson({ name: 'Słownik prawniczy' }, { create: { name: 'Prawo spółek' }, domain: { create: { name: 'Prawo' } } });
    return lesson.id;
  });
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${lessonID}`);
  await page.click('[data-testid=lesson-import]');
  await expectText(stepTitle(page), 'Wybierz plik');

  await chooseImportFile(page, path.join(FIXTURES, 'polish-windows-1250.csv'));
  await expectText(stepTitle(page), 'Sprawdź odczyt pliku');
  assert.equal(await page.inputValue('[data-testid=import-encoding]'), 'windows-1250');
  assert.equal(await page.inputValue('[data-testid=import-delimiter]'), ';');
  await expectText(page.locator('[data-testid=import-size]'), '5 wierszy, 12 kolumn');
  await expectText(page.locator('[data-testid=import-file-preview]'), 'zarząd');

  // Złe kodowanie psuje polskie litery w podglądzie; powrót do wykrytego je naprawia.
  await page.selectOption('[data-testid=import-encoding]', 'iso-8859-2');
  await waitUntil(async () => !(await page.locator('[data-testid=import-file-preview]').textContent()).includes('zarząd'), 'Podgląd powinien pokazać zniekształcone litery');
  await page.selectOption('[data-testid=import-encoding]', 'windows-1250');
  await expectText(page.locator('[data-testid=import-file-preview]'), 'zarząd');

  await nextStep(page, 'Przypisz kolumny');
  assert.equal(await page.inputValue('[data-testid=import-map-termPL]'), '3');
  assert.equal(await page.inputValue('[data-testid=import-map-notes]'), '11');

  await nextStep(page, 'Wybierz miejsce');
  // Import uruchomiony z lekcji: struktura z pliku jest domyślnie wyłączona, a lekcja wybrana.
  assert.equal(await page.getByRole('switch', { name: 'Odtwórz strukturę z pliku' }).isChecked(), false);
  assert.equal(await page.inputValue('[data-testid=import-lesson]'), lessonID);

  await nextStep(page, 'Sprawdź dane');
  assert.equal(await rowValue(page, 'Poprawne'), '4');
  assert.equal(await rowValue(page, 'Ostrzeżenia'), '1');
  await expectText(page.locator('[data-testid=import-issues]'), 'Wiersz 4 – ostrzeżenie: trudność „9” nie jest liczbą od 1 do 5');

  await nextStep(page, 'Przejrzyj pojęcia');
  await expectText(page.locator('[data-testid=import-preview] .term').first(), 'Prawo › Prawo spółek › Słownik prawniczy');
  await nextStep(page, 'Zatwierdź import');
  await expectText(page.locator('.form-message--info'), 'Pojęcia trafią do istniejących lekcji');
  await finishImport(page, 'Importuj 4 pojęcia');

  await page.click('[data-testid=import-open-lesson]');
  await expectText(title(page), 'Słownik prawniczy');
  assert.deepEqual(await page.locator('.term__pl').allTextContents(), ['zarząd', 'rada nadzorcza', 'wkład niepieniężny', 'oferta']);
  const stored = await page.evaluate((id) => window.lexicards.library.listTerms(id).map((term) => ({
    pl: term.termPL, description: term.descriptionPL, example: term.examplePL, tags: term.tags, difficulty: term.difficulty, notes: term.notes
  })), lessonID);
  assert.deepEqual(stored[0], {
    pl: 'zarząd', description: 'Organ prowadzący sprawy spółki; reprezentuje ją na zewnątrz.',
    example: 'Zarząd zatwierdził „plan naprawczy”.', tags: ['prawo', 'spółki'], difficulty: 3, notes: 'źródło: KSH'
  });
  assert.equal(stored[1].description, 'Organ nadzoru.\nPowołuje zarząd.');
  assert.equal(stored[2].example, 'Żółć, gęślą jaźń – test znaków.');
  assert.equal(stored[2].difficulty, null);
  assert.deepEqual(await summary(page), { domains: 1, modules: 1, lessons: 1, terms: 4, favorites: 0 });
});

test('ponowny import: duplikaty pominięte albo zaktualizowane bez utraty postępów', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  // Postęp nauki jednego pojęcia zapisany tak, jak zrobią to fiszki w kolejnym etapie.
  const termID = await page.evaluate(async () => {
    const { library } = window.lexicards;
    const term = [...library.maps.terms.values()].find((item) => item.termPL === 'bilans');
    const progress = { id: crypto.randomUUID(), termID: term.id, lessonID: term.lessonID, moduleID: term.moduleID, domainID: term.domainID, direction: 'pl_en', reviewCount: 3 };
    await library.adapter.commit({
      puts: { progress: [progress], reviews: [{ id: crypto.randomUUID(), termID: term.id, direction: 'pl_en' }] },
      deletes: {}, purgeTermIDs: [], clear: []
    });
    library.maps.progress.set(progress.id, progress);
    return term.id;
  });

  // Ten sam plik co dane przykładowe, ze zmienionym opisem jednego pojęcia i jednym nowym pojęciem.
  const original = await readFile(path.join(ROOT, 'docs/samples/lexicards_sample.csv'), 'utf8');
  const changed = original.replace('Zestawienie aktywów, zobowiązań i kapitału własnego firmy na określony dzień.', 'Nowy opis bilansu z pliku.')
    + 'Business English;Finance;Investments;obligacja;bond;;;;;\r\n';
  assert.notEqual(changed.length, original.length + 'Business English;Finance;Investments;obligacja;bond;;;;;\r\n'.length, 'opis w pliku testowym powinien zostać podmieniony');
  const file = path.join(OUTPUT, 'zmieniony.csv');
  await writeFile(file, changed);

  await tab(page, 'Biblioteka');
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await menuItem(page, 'Import z pliku');
  await chooseImportFile(page, file);
  await expectText(stepTitle(page), 'Sprawdź odczyt pliku');
  assert.equal(await page.inputValue('[data-testid=import-encoding]'), 'utf-8');
  await nextStep(page, 'Przypisz kolumny');
  await nextStep(page, 'Wybierz miejsce');
  await nextStep(page, 'Sprawdź dane');
  await expectText(page.locator('.group__title', { hasText: 'W bibliotece' }), 'W bibliotece jest już 40 pojęć z pliku');
  assert.equal(await page.locator('[data-testid=import-duplicates-skip]').isChecked(), true);

  // Tryb „pomiń”: dodane zostanie tylko jedno nowe pojęcie.
  await nextStep(page, 'Przejrzyj pojęcia');
  await expectText(page.locator('[data-testid=import-preview] .status').first(), 'Duplikat – zostanie pominięty');
  await nextStep(page, 'Zatwierdź import');
  assert.equal(await rowValue(page, 'Zostaną dodane'), '1');
  assert.equal(await rowValue(page, 'Zostaną pominięte'), '40');

  // Powrót i zmiana trybu na aktualizację.
  await page.click('[data-testid=import-back]');
  await page.click('[data-testid=import-back]');
  await expectText(stepTitle(page), 'Sprawdź dane');
  await page.locator('[data-testid=import-duplicates-update]').check();
  await nextStep(page, 'Przejrzyj pojęcia');
  await nextStep(page, 'Zatwierdź import');
  assert.equal(await rowValue(page, 'Zostaną dodane'), '1');
  assert.equal(await rowValue(page, 'Zostaną zaktualizowane'), '1');
  assert.equal(await rowValue(page, 'Bez zmian (takie same jak w bibliotece)'), '39');
  await finishImport(page, 'Importuj 2 pojęcia');
  await expectText(page.locator('[data-testid=import-done]'), 'Dodano: 1 pojęcie. Zaktualizowano: 1 pojęcie. Pominięto: 39 pojęć.');

  const after = await page.evaluate(async (id) => {
    const { library } = window.lexicards;
    const term = library.getTerm(id);
    return {
      exists: Boolean(term), description: term?.descriptionPL, descriptionEN: term?.descriptionEN, tags: term?.tags,
      terms: library.summary().terms, progress: library.maps.progress.size,
      reviewsInDatabase: await library.adapter.count('reviews'), progressInDatabase: await library.adapter.count('progress')
    };
  }, termID);
  assert.deepEqual(after, {
    exists: true, description: 'Nowy opis bilansu z pliku.',
    descriptionEN: "A statement of a company's assets, liabilities and equity at a specific date.",
    tags: ['finanse', 'sprawozdania'], terms: 41, progress: 1, reviewsInDatabase: 1, progressInDatabase: 1
  });

  // Po ponownym otwarciu strony zaktualizowana treść jest w bazie.
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  assert.equal(await page.evaluate((id) => window.lexicards.library.getTerm(id).descriptionPL, termID), 'Nowy opis bilansu z pliku.');
});

test('plik z nieznanymi nagłówkami i błędami: ręczne przypisanie kolumn, odrzucone wiersze, nowa lekcja', async ({ open }) => {
  const page = await open('#/library/import');
  const file = path.join(OUTPUT, 'wlasny.csv');
  await writeFile(file, [
    'Lp.,Słowo,Tłumaczenie,Komentarz',
    '1,umowa,contract,podstawowe',
    '2,aneks,,brak tłumaczenia',
    '3,,annex,brak polskiego',
    '4,kara umowna,contractual penalty,',
    '5,umowa,Contract,powtórzone w pliku'
  ].join('\n'));
  await chooseImportFile(page, file);
  assert.equal(await page.inputValue('[data-testid=import-delimiter]'), ',');
  await nextStep(page, 'Przypisz kolumny');

  // Nagłówków nie da się przypisać automatycznie – „Dalej” czeka na wskazanie kolumn.
  assert.equal(await page.getByRole('switch', { name: 'Pierwszy wiersz zawiera nagłówki' }).isChecked(), true);
  assert.equal(await nextButton(page).isDisabled(), true);
  await expectText(page.locator('[data-testid=import-hint]'), 'Przypisz kolumnę z pojęciem po polsku.');
  await page.selectOption('[data-testid=import-map-termPL]', { label: 'B: Słowo' });
  await expectText(page.locator('[data-testid=import-hint]'), 'Przypisz kolumnę z pojęciem po angielsku.');
  await page.selectOption('[data-testid=import-map-termEN]', { label: 'C: Tłumaczenie' });
  await page.selectOption('[data-testid=import-map-notes]', { label: 'D: Komentarz' });
  await expectText(page.locator('[data-testid=import-unused]'), 'Kolumny bez przypisania zostaną pominięte: Lp.');

  await nextStep(page, 'Wybierz miejsce');
  // Pusta biblioteka: wszystkie trzy poziomy trzeba nazwać.
  assert.equal(await nextButton(page).isDisabled(), true);
  await page.fill('[data-testid=import-new-domain]', 'Prawo');
  await page.fill('[data-testid=import-new-module]', 'Umowy');
  await expectText(page.locator('[data-testid=import-hint]'), 'Podaj nazwę lekcji.');
  await page.fill('[data-testid=import-new-lesson]', 'Podstawy');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), 'import-new-lesson', 'pisanie nie zabiera fokusu z pola');
  await waitUntil(async () => !(await nextButton(page).isDisabled()), 'Po podaniu nazw można przejść dalej');

  await nextStep(page, 'Sprawdź dane');
  assert.equal(await rowValue(page, 'Wiersze z pojęciami'), '5');
  assert.equal(await rowValue(page, 'Poprawne'), '3');
  assert.equal(await rowValue(page, 'Odrzucone z powodu błędów'), '2');
  const issues = page.locator('[data-testid=import-issues]');
  await expectText(issues, 'Wiersz 3 – błąd: brak pojęcia po angielsku');
  await expectText(issues, 'Wiersz 4 – błąd: brak pojęcia po polsku');
  await expectText(page.locator('[data-testid=import-file-duplicates]'), 'Powtórzenia w samym pliku: 1. Importowane jest pierwsze wystąpienie.');

  await nextStep(page, 'Przejrzyj pojęcia');
  assert.deepEqual(await page.locator('[data-testid=import-preview] .status').allTextContents(), [
    'Nowe', 'Nowe', 'Powtórzenie w pliku – zostanie pominięte'
  ]);
  await nextStep(page, 'Zatwierdź import');
  const created = page.locator('[data-testid=import-created]');
  await expectText(created, 'Prawo › Umowy › Podstawy');
  await finishImport(page, 'Importuj 2 pojęcia');
  await expectText(page.locator('[data-testid=import-done]'), 'Dodano: 2 pojęcia. Pominięto: 1 pojęcie. Utworzono: 1 dziedzinę, 1 moduł i 1 lekcję.');

  await page.click('[data-testid=import-open-lesson]');
  await expectText(title(page), 'Podstawy');
  assert.deepEqual(await page.locator('.term__pl').allTextContents(), ['umowa', 'kara umowna']);
  assert.equal(await page.evaluate(() => [...window.lexicards.library.maps.terms.values()].find((term) => term.termPL === 'umowa').notes), 'podstawowe');
});

test('skoroszyt z kilkoma arkuszami i scalonymi komórkami; plik bez nagłówków', async ({ open }) => {
  const page = await open('#/library/import');
  await chooseImportFile(page, path.join(FIXTURES, 'libreoffice-cases.xlsx'));
  await expectText(stepTitle(page), 'Wybierz arkusz');
  assert.deepEqual(await page.locator('.radio .row__title').allTextContents(), ['Słownik', 'Notatki', 'Ukryty', 'Pusty']);
  await expectText(page.locator('.radio', { hasText: 'Ukryty' }), 'Arkusz ukryty');
  await expectText(page.locator('[data-testid=import-size]'), '7 wierszy, 7 kolumn');

  // Pusty arkusz blokuje przejście dalej, inny arkusz je odblokowuje.
  await page.getByRole('radio', { name: 'Pusty' }).check();
  await expectText(page.locator('.form-message--warning'), 'Ten arkusz jest pusty');
  assert.equal(await nextButton(page).isDisabled(), true);
  await page.getByRole('radio', { name: /Ukryty/ }).check();
  await expectText(page.locator('[data-testid=import-size]'), '2 wiersze, 2 kolumny');
  await page.getByRole('radio', { name: 'Słownik' }).check();
  await expectText(page.locator('[data-testid=import-size]'), '7 wierszy, 7 kolumn');

  await nextStep(page, 'Przypisz kolumny');
  await nextStep(page, 'Wybierz miejsce');
  await nextStep(page, 'Sprawdź dane');
  // Scalone komórki dziedziny i modułu: dwa wiersze przejęły strukturę z wiersza powyżej.
  assert.equal(await rowValue(page, 'Poprawne'), '6');
  assert.equal(await rowValue(page, 'Struktura przejęta z wiersza powyżej'), '2');
  await nextStep(page, 'Przejrzyj pojęcia');
  await expectText(page.locator('[data-testid=import-preview] .term').nth(1), 'Wiersz 3 → Metrology › CMM › Probes');
  await expectText(page.locator('[data-testid=import-preview] .term').nth(5), 'roundness');
  await nextStep(page, 'Zatwierdź import');
  await finishImport(page, 'Importuj 6 pojęć');
  assert.deepEqual(await summary(page), { domains: 1, modules: 2, lessons: 3, terms: 6, favorites: 0 });

  // Drugi plik: dwie kolumny bez nagłówków, do istniejącej lekcji wybranej z list.
  await page.goto(`${page.url().split('#')[0]}#/library/import`);
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await chooseImportFile(page, path.join(FIXTURES, 'no-header.csv'));
  await nextStep(page, 'Przypisz kolumny');
  assert.equal(await page.getByRole('switch', { name: 'Pierwszy wiersz zawiera nagłówki' }).isChecked(), false);
  assert.equal(await page.inputValue('[data-testid=import-map-termPL]'), '0');
  assert.equal(await page.inputValue('[data-testid=import-map-termEN]'), '1');
  await nextStep(page, 'Wybierz miejsce');
  await expectText(page.locator('[data-testid=import-hint]'), 'Wybierz dziedzinę.');
  await page.selectOption('[data-testid=import-domain]', { label: 'Metrology' });
  await page.selectOption('[data-testid=import-module]', { label: 'CMM' });
  await page.selectOption('[data-testid=import-lesson]', { label: 'Accuracy' });
  await nextStep(page, 'Sprawdź dane');
  assert.equal(await rowValue(page, 'Poprawne'), '3');
  await nextStep(page, 'Przejrzyj pojęcia');
  await expectText(page.locator('[data-testid=import-preview] .term').first(), 'Wiersz 1 → Metrology › CMM › Accuracy');
  await nextStep(page, 'Zatwierdź import');
  await finishImport(page, 'Importuj 3 pojęcia');
  assert.deepEqual(await summary(page), { domains: 1, modules: 2, lessons: 3, terms: 9, favorites: 0 });
});

test('nieobsługiwany plik: zrozumiały komunikat i pozostanie w pierwszym kroku', async ({ open }) => {
  const page = await open('#/library/import');
  await chooseImportFile(page, path.join(FIXTURES, 'old-format.xls'));
  await expectText(page.locator('.form-message--error'), 'To stary format Excela (.xls)');
  await expectText(stepTitle(page), 'Wybierz plik');
  assert.equal(await nextButton(page).isDisabled(), true);

  await chooseImportFile(page, path.join(ROOT, 'icons/icon-192.png'));
  await expectText(page.locator('.form-message--error'), 'Nie rozpoznano formatu pliku');

  // Po błędzie można od razu wybrać poprawny plik.
  await chooseImportFile(page, path.join(FIXTURES, 'no-header.csv'));
  await expectText(stepTitle(page), 'Sprawdź odczyt pliku');
  assert.equal(await page.locator('.form-message--error').count(), 0);
});

test('wzór pliku do importu pobiera się i jest poprawnym skoroszytem', async ({ open }) => {
  const page = await open('#/library/import');
  const template = await download(page, () => page.click('[data-testid=import-template]'));
  assert.equal(template.name, 'LexiCards-wzor-importu.xlsx');
  const table = await (await openWorkbook(template.bytes)).readSheet(0);
  assert.deepEqual(table.rows[0].cells.slice(0, 5), ['Domain', 'Module', 'Lesson', 'Term PL', 'Term EN']);
  assert.equal(table.rows.length, 3);
});

test('eksport: lekcja do XLSX, cała biblioteka do CSV, zaznaczone pojęcia', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const base = page.url().split('#')[0];
  const lessonID = await page.evaluate(() => [...window.lexicards.library.maps.lessons.values()].find((lesson) => lesson.name === 'Financial Statements').id);

  // Lekcja → XLSX.
  await page.goto(`${base}#/library/lesson/${lessonID}`);
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Eksportuj lekcję…');
  await expectText(page.locator('[data-testid=export-scope]'), 'Lekcja „Financial Statements”');
  await expectText(page.locator('[data-testid=export-scope]'), '4 pojęcia');
  const workbook = await download(page, () => sheet(page).locator('.sheet__submit').click());
  assert.match(workbook.name, /^LexiCards-financial-statements-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const table = await (await openWorkbook(workbook.bytes)).readSheet(0);
  assert.equal(table.rows.length, 5);
  assert.deepEqual(table.rows[0].cells, ['Domain', 'Module', 'Lesson', 'Term PL', 'Term EN', 'Description PL', 'Description EN', 'Example PL', 'Example EN', 'Tags', 'Difficulty', 'Notes']);
  assert.deepEqual(table.rows[1].cells.slice(0, 5), ['Business English', 'Finance', 'Financial Statements', 'bilans', 'balance sheet']);
  await page.locator('dialog[open]').waitFor({ state: 'detached' });

  // Cała biblioteka → CSV (z Ustawień).
  await page.goto(`${base}#/settings`);
  await page.click('[data-testid=settings-export]');
  await expectText(page.locator('[data-testid=export-scope]'), 'Cała biblioteka');
  await sheet(page).getByRole('radio', { name: 'CSV' }).check();
  const csv = await download(page, () => sheet(page).locator('.sheet__submit').click());
  assert.match(csv.name, /^LexiCards-biblioteka-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.deepEqual([...csv.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'plik CSV zaczyna się znacznikiem UTF-8');
  const rows = parseCsv(decodeText(csv.bytes, 'utf-8'), ';').rows;
  assert.equal(rows.length, 41);
  assert.ok(rows.some((row) => row.cells[3] === 'współrzędnościowa maszyna pomiarowa'));
  await page.locator('dialog[open]').waitFor({ state: 'detached' });

  // Zaznaczone pojęcia z glosariusza → CSV.
  await page.goto(`${base}#/library/glossary`);
  await page.getByRole('button', { name: 'Zaznacz', exact: true }).click();
  await page.locator('.term__checkbox').nth(0).check();
  await page.locator('.term__checkbox').nth(2).check();
  await page.click('[data-testid=selection-actions]');
  await menuItem(page, 'Eksportuj…');
  await expectText(page.locator('[data-testid=export-scope]'), 'Zaznaczone pojęcia');
  await expectText(page.locator('[data-testid=export-scope]'), '2 pojęcia');
  await sheet(page).getByRole('radio', { name: 'CSV' }).check();
  const selected = await download(page, () => sheet(page).locator('.sheet__submit').click());
  const selectedRows = parseCsv(decodeText(selected.bytes, 'utf-8'), ';').rows;
  assert.deepEqual(selectedRows.slice(1).map((row) => row.cells[3]).sort(), ['aktywa', 'analiza SWOT']);
});

test('wyeksportowany plik wczytany do pustej aplikacji odtwarza bibliotekę', async ({ open, browser, track }) => {
  const source = await open();
  await loadSamples(source);
  await source.goto(`${source.url().split('#')[0]}#/settings`);
  await source.click('[data-testid=settings-export]');
  const exported = await download(source, () => sheet(source).locator('.sheet__submit').click());
  const file = path.join(OUTPUT, exported.name);

  // Drugie „urządzenie”: osobny profil przeglądarki z pustą bazą.
  const other = await browser.newContext({ ...PHONE, locale: 'pl-PL' });
  try {
    const page = await other.newPage();
    track(page);
    await page.goto(`${source.url().split('#')[0]}#/library/import`);
    await page.waitForSelector('#app[data-ready="true"]');
    await chooseImportFile(page, file);
    await nextStep(page, 'Przypisz kolumny');
    await nextStep(page, 'Wybierz miejsce');
    await nextStep(page, 'Sprawdź dane');
    await nextStep(page, 'Przejrzyj pojęcia');
    await nextStep(page, 'Zatwierdź import');
    await finishImport(page, 'Importuj 40 pojęć');
    const dump = (target) => target.evaluate(async () => {
      const { collectExportRows } = await import('./js/core/exporter.js');
      return collectExportRows(window.lexicards.library, { kind: 'all' }).rows;
    });
    assert.deepEqual(await dump(page), await dump(source));
  } finally {
    await other.close();
  }
});

// ---------------------------------------------------------------- nauka z fiszkami

const flashcard = (page) => page.locator('[data-testid=flashcard]');
const counter = (page) => page.locator('[data-testid=study-counter]');
const tile = (page, id) => page.locator(`[data-testid=tile-${id}]`);
const score = (page) => page.locator('[data-testid=score]');
const planned = (page) => page.locator('[data-testid=study-planned]');
const side = (page) => flashcard(page).getAttribute('data-side');

/**
 * Mała biblioteka o znanej zawartości. Kolejność fiszek „jak w lekcjach”:
 * aktywa (opis i przykład), pasywa (sam opis), zysk (samo tłumaczenie),
 * amortyzacja (komplet), płynność (sam przykład), umowa (komplet, inny moduł).
 */
async function seedStudy(page) {
  return page.evaluate(async () => {
    const { library } = window.lexicards;
    const basics = await library.createLesson({ name: 'Podstawy' }, { create: { name: 'Finanse' }, domain: { create: { name: 'Biznes' } } });
    const advanced = await library.createLesson({ name: 'Zaawansowane' }, { existing: basics.moduleID });
    const contracts = await library.createLesson({ name: 'Umowy' }, { create: { name: 'Prawo' }, domain: { existing: basics.domainID } });
    const add = async (draft, lesson) => (await library.createTerm(draft, lesson.id)).id;
    const ids = {
      assets: await add({
        termPL: 'aktywa', termEN: 'assets',
        descriptionPL: 'Zasoby majątkowe firmy.', descriptionEN: 'Resources owned by a company.',
        examplePL: 'Aktywa spółki wzrosły.', exampleEN: 'The assets of the company increased.'
      }, basics),
      liabilities: await add({ termPL: 'pasywa', termEN: 'liabilities', descriptionPL: 'Źródła finansowania majątku.' }, basics),
      profit: await add({ termPL: 'zysk', termEN: 'profit' }, basics),
      depreciation: await add({
        termPL: 'amortyzacja', termEN: 'depreciation',
        descriptionPL: 'Rozłożenie kosztu w czasie.', descriptionEN: 'Spreading a cost over time.',
        examplePL: 'Amortyzacja obniża zysk.', exampleEN: 'Depreciation lowers profit.'
      }, advanced),
      liquidity: await add({ termPL: 'płynność', termEN: 'liquidity', exampleEN: 'Liquidity matters in a crisis.' }, advanced),
      contract: await add({
        termPL: 'umowa', termEN: 'contract',
        descriptionPL: 'Zgodne oświadczenie woli stron.', descriptionEN: 'An agreement between parties.',
        examplePL: 'Podpisaliśmy umowę.', exampleEN: 'We signed the contract.'
      }, contracts)
    };
    await library.updateSettings({ shuffleCards: false, studyCount: 0 });
    return {
      ...ids,
      domainID: basics.domainID,
      financeID: basics.moduleID,
      basicsID: basics.id,
      advancedID: advanced.id,
      contractsID: contracts.id
    };
  });
}

/** Otwiera ekran przygotowania sesji (bez przeładowania strony). */
async function openStudySetup(page, hash = '#/study') {
  await page.evaluate((target) => { location.hash = target; }, hash);
  await page.locator('[data-testid=study-start]').waitFor();
}

async function startStudy(page) {
  await page.click('[data-testid=study-start]');
  await page.locator('[data-testid=study-session]').waitFor();
}

/** Wybiera pozycję przełącznika segmentowego o podanej nazwie grupy. */
async function choose(page, groupName, optionLabel) {
  await page.getByRole('radiogroup', { name: groupName }).locator('.segmented__option', { hasText: optionLabel }).click();
  await waitUntil(
    () => page.getByRole('radiogroup', { name: groupName }).getByRole('radio', { name: optionLabel, exact: true }).isChecked(),
    `Opcja „${optionLabel}” powinna zostać zaznaczona`
  );
}

async function flip(page) {
  const before = await side(page);
  await page.locator('[data-testid=card-flip]:visible, [data-testid=card-unflip]:visible').first().click();
  await waitUntil(async () => (await side(page)) !== before, 'Fiszka powinna się obrócić');
}

/** Odkrywa odpowiedź, zaznacza podane kafelki i zatwierdza fiszkę przyciskiem. */
async function assess(page, tiles, decision) {
  const before = await counter(page).textContent();
  await flip(page);
  if (tiles === 'all') await page.click('[data-testid=know-all]');
  else for (const id of tiles) await tile(page, id).click();
  await page.click(`[data-testid=decide-${decision}]`);
  await waitUntil(() => movedOn(page, before), 'Po decyzji powinna pojawić się następna fiszka albo podsumowanie');
}

/**
 * Czy sesja przeszła dalej: inny numer fiszki albo podsumowanie. Sprawdzane jednym odczytem
 * strony – osobne zapytania mogłyby trafić w chwilę, w której licznik już zniknął.
 */
function movedOn(page, before) {
  return page.evaluate((previous) => Boolean(document.querySelector('[data-testid=study-summary]'))
    || (document.querySelector('[data-testid=study-counter]')?.textContent ?? previous) !== previous, before);
}

const progressOf = (page, termID, direction) => page.evaluate(
  ([id, way]) => window.lexicards.library.getProgress(id, way), [termID, direction]
);
const stored = (page) => page.evaluate(() => window.lexicards.library.exportAll());
const activeSession = (page) => page.evaluate(() => window.lexicards.library.getStudySession());

/** Przeciągnięcie palcem (zdarzenia dotykowe przeglądarki, nie myszy). */
async function touchDrag(context, page, locator, dx, { release = true, dy = 0 } = {}) {
  const client = await context.newCDPSession(page);
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 140);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  const steps = 8;
  for (let step = 1; step <= steps; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x + (dx * step) / steps, y: y + (dy * step) / steps, id: 1 }]
    });
  }
  const end = () => client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  if (release) await end();
  return { end };
}

test('fiszki: obrót, trzy kafelki, wynik, decyzje, podsumowanie i runda powtórkowa', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page);
  await expectText(title(page), 'Nauka');
  await expectText(planned(page), '6 fiszek');
  await startStudy(page);

  // Nagłówek sesji: lekcja, numer fiszki, pasek postępu; pasek zakładek jest schowany.
  await expectText(counter(page), '1 z 6');
  await expectText(page.locator('[data-testid=study-lesson]'), 'Podstawy');
  assert.equal(await page.locator('.study__progress').getAttribute('aria-valuemax'), '6');
  assert.equal(await page.locator('.tabbar').isVisible(), false, 'w trakcie nauki nie widać paska zakładek');

  // Pierwsza strona: samo pojęcie po polsku; odpowiedź jest ukryta.
  assert.equal(await side(page), 'front');
  assert.equal(await flashcard(page).getAttribute('data-direction'), 'pl_en');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'aktywa');
  assert.equal(await page.locator('[data-testid=card-back]').isVisible(), false);

  // Przed odkryciem odpowiedzi nie da się niczego ocenić ani zatwierdzić.
  for (const id of ['term', 'description', 'example']) assert.equal(await tile(page, id).isDisabled(), true, `kafelek ${id} nieaktywny`);
  for (const id of ['know-all', 'know-none', 'decide-know', 'decide-repeat']) {
    assert.equal(await page.locator(`[data-testid=${id}]`).isDisabled(), true, `${id} nieaktywny`);
  }
  assert.equal(await page.locator('[data-testid=study-hint]').isVisible(), true);
  assert.equal(await page.locator('[data-testid=study-undo]').isDisabled(), true, 'nie ma czego cofać');

  // Dotknięcie fiszki obraca ją; na odwrocie tłumaczenie, opis i przykład w obu językach.
  await flashcard(page).locator('[data-testid=card-front] .flashcard__text').click();
  await waitUntil(async () => (await side(page)) === 'back', 'Dotknięcie fiszki powinno ją obrócić');
  const back = page.locator('[data-testid=card-back]');
  await expectText(back.locator('.flashcard__text--answer'), 'assets');
  await expectText(back.locator('.flashcard__question'), 'aktywa');
  for (const text of ['Resources owned by a company.', 'Zasoby majątkowe firmy.', 'The assets of the company increased.', 'Aktywa spółki wzrosły.']) {
    await expectText(back, text);
  }
  assert.equal(await page.locator('[data-testid=study-hint]').isVisible(), false);

  // Kafelki działają jak przełączniki, wynik liczy zaznaczone elementy.
  await expectText(score(page), '0/3');
  assert.equal(await tile(page, 'term').isDisabled(), false);
  await expectText(tile(page, 'term'), 'Nie umiem');
  await tile(page, 'term').click();
  assert.equal(await tile(page, 'term').getAttribute('aria-pressed'), 'true');
  await expectText(tile(page, 'term').locator('.rating__state'), 'Umiem');
  await expectText(score(page), '1/3');
  await tile(page, 'description').click();
  await expectText(score(page), '2/3');
  await tile(page, 'term').click();
  assert.equal(await tile(page, 'term').getAttribute('aria-pressed'), 'false');
  await expectText(score(page), '1/3');

  // Szybkie przyciski zaznaczają i odznaczają wszystko, ale niczego nie zatwierdzają.
  await page.click('[data-testid=know-all]');
  await expectText(score(page), '3/3');
  await page.click('[data-testid=know-none]');
  await expectText(score(page), '0/3');
  await page.click('[data-testid=know-all]');
  await expectText(score(page), '3/3');
  await expectText(counter(page), '1 z 6');
  assert.equal((await stored(page)).assessments.length, 0, 'szybkie przyciski nie zapisują oceny');

  // Powrót na pierwszą stronę nie kasuje oceny i nie blokuje kafelków.
  await page.click('[data-testid=card-unflip]');
  await waitUntil(async () => (await side(page)) === 'front', 'Fiszka powinna wrócić na pierwszą stronę');
  await expectText(score(page), '3/3');
  assert.equal(await tile(page, 'term').isDisabled(), false);

  // „Umiem” przy komplecie: opanowane w kierunku PL → EN, drugi kierunek nietknięty.
  await page.click('[data-testid=decide-know]');
  await expectText(counter(page), '2 z 6');
  const first = await progressOf(page, ids.assets, 'pl_en');
  assert.equal(first.lastStatus, 'mastered');
  assert.equal(first.lastDecision, 'know');
  assert.equal(first.reviewCount, 1);
  assert.equal(await progressOf(page, ids.assets, 'en_pl'), null);

  // Nowa fiszka zaczyna od pierwszej strony i pustej oceny.
  assert.equal(await side(page), 'front');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'pasywa');
  assert.equal(await tile(page, 'term').isDisabled(), true);

  // Pojęcie bez przykładu: kafelek „Brak danych”, wynik liczony z dwóch elementów.
  await flip(page);
  await expectText(tile(page, 'example').locator('.rating__state'), 'Brak danych');
  assert.equal(await tile(page, 'example').isDisabled(), true);
  await expectText(score(page), '0/2');
  await expectText(page.locator('[data-testid=card-back]'), 'Brak danych');
  await tile(page, 'term').click();
  await expectText(score(page), '1/2');
  await page.click('[data-testid=decide-repeat]');
  await expectText(counter(page), '3 z 6');

  // Pojęcie z samym tłumaczeniem: 1/1 to komplet.
  await flip(page);
  await expectText(tile(page, 'description').locator('.rating__state'), 'Brak danych');
  await expectText(tile(page, 'example').locator('.rating__state'), 'Brak danych');
  await expectText(score(page), '0/1');
  await page.click('[data-testid=know-all]');
  await expectText(score(page), '1/1');
  assert.equal(await tile(page, 'description').getAttribute('aria-pressed'), 'false', '„Umiem wszystko” nie zaznacza brakującego elementu');
  await page.click('[data-testid=decide-know]');
  await expectText(counter(page), '4 z 6');
  await expectText(page.locator('[data-testid=study-lesson]'), 'Zaawansowane');

  await assess(page, [], 'repeat');               // amortyzacja 0/3, Powtórz
  await assess(page, ['term'], 'know');           // płynność: „Umiem” zaznacza wszystko (2/2)
  await expectText(page.locator('[data-testid=study-lesson]'), 'Umowy');
  await assess(page, 'all', 'know');              // umowa 3/3, Umiem

  // Podsumowanie.
  await page.locator('[data-testid=study-summary]').waitFor();
  await expectText(page.locator('.empty__title'), 'Sesja zakończona');
  await expectText(page.locator('[data-testid=summary-text]'), 'Ocenione fiszki: 6. Umiem: 4. Do powtórki: 2.');
  const legend = (await page.locator('[data-testid=summary-statuses] li').allTextContents()).map((text) => text.trim());
  assert.deepEqual(legend, ['Opanowane4', 'Częściowo opanowane1', 'W trakcie nauki0', 'Do nauki1']);

  // Historia ocen: jeden wpis na fiszkę, z wynikiem względem dostępnych elementów.
  let data = await stored(page);
  assert.equal(data.assessments.length, 6);
  const byTerm = (termID) => data.assessments.filter((entry) => entry.termID === termID);
  const pick = (entry) => ({
    term: entry.knowsTerm, description: entry.knowsDescription, example: entry.knowsExample,
    score: `${entry.totalScore}/${entry.availableElementCount}`, status: entry.assessmentStatus,
    decision: entry.swipeDecision, direction: entry.direction
  });
  assert.deepEqual(pick(byTerm(ids.assets)[0]), {
    term: true, description: true, example: true, score: '3/3', status: 'mastered', decision: 'know', direction: 'pl_en'
  });
  assert.deepEqual(pick(byTerm(ids.liabilities)[0]), {
    term: true, description: false, example: null, score: '1/2', status: 'partiallyMastered', decision: 'repeat', direction: 'pl_en'
  });
  assert.deepEqual(pick(byTerm(ids.profit)[0]), {
    term: true, description: null, example: null, score: '1/1', status: 'mastered', decision: 'know', direction: 'pl_en'
  });
  assert.deepEqual(pick(byTerm(ids.depreciation)[0]), {
    term: false, description: false, example: false, score: '0/3', status: 'toLearn', decision: 'repeat', direction: 'pl_en'
  });
  // „Umiem” oznacza komplet – kafelki zaznaczyły się same, mimo że zaznaczony był tylko jeden.
  const liquidity = await progressOf(page, ids.liquidity, 'pl_en');
  assert.deepEqual([liquidity.lastScore, liquidity.lastAvailable, liquidity.lastStatus], [2, 2, 'mastered']);

  // Runda powtórkowa obejmuje tylko fiszki odłożone do powtórki.
  await expectText(page.locator('[data-testid=summary-repeat]'), 'Powtórz odłożone (2)');
  await page.click('[data-testid=summary-repeat]');
  await expectText(counter(page), '1 z 2');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'pasywa');
  await assess(page, 'all', 'know');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'amortyzacja');
  await assess(page, 'all', 'know');
  await expectText(page.locator('.empty__title'), 'Runda powtórkowa zakończona');
  await expectText(page.locator('[data-testid=summary-text]'), 'Ocenione fiszki: 2. Umiem: 2. Do powtórki: 0.');
  assert.equal(await page.locator('[data-testid=summary-repeat]').count(), 0);

  await page.click('[data-testid=summary-done]');
  await page.waitForFunction(() => location.hash === '#/start');
  await expectText(page.locator('[data-testid=start-study]'), 'Rozpocznij naukę');

  // Dziennik sesji i stan po zakończeniu.
  data = await stored(page);
  assert.equal(data.assessments.length, 8, 'wcześniejsze wpisy historii zostają');
  assert.equal(await activeSession(page), null);
  const sessions = data.studySessions.sort((a, b) => a.round - b.round);
  assert.deepEqual(
    sessions.map((session) => [session.round, session.totalCards, session.assessedCards, session.knownCards, session.repeatCards, session.finished]),
    [[1, 6, 6, 4, 2, true], [2, 2, 2, 2, 0, true]]
  );
  const again = await progressOf(page, ids.liabilities, 'pl_en');
  assert.equal(again.reviewCount, 2);
  assert.equal(again.lastStatus, 'mastered');
});

test('fiszki: gesty – w lewo „Umiem”, w prawo „Powtórz”, krótki ruch wraca', async ({ open, context }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page);
  await startStudy(page);

  // Przed odkryciem odpowiedzi przesunięcie niczego nie zatwierdza i nie obraca fiszki.
  await touchDrag(context, page, flashcard(page), -220);
  await page.waitForTimeout(350);
  await expectText(counter(page), '1 z 6');
  assert.equal(await side(page), 'front');
  assert.equal((await stored(page)).assessments.length, 0);

  // Stuknięcie palcem obraca fiszkę.
  await flashcard(page).locator('[data-testid=card-front] .flashcard__text').tap();
  await waitUntil(async () => (await side(page)) === 'back', 'Stuknięcie powinno obrócić fiszkę');
  await page.click('[data-testid=know-all]');

  // Za krótki ruch: fiszka wraca na miejsce, bez decyzji i bez obrotu.
  await touchDrag(context, page, flashcard(page), -45);
  await page.waitForTimeout(350);
  await expectText(counter(page), '1 z 6');
  assert.equal(await side(page), 'back');
  assert.equal(await flashcard(page).evaluate((element) => element.style.transform), '');

  // Ruch w pionie przewija stronę, a nie fiszkę.
  await touchDrag(context, page, flashcard(page), 10, { dy: -160 });
  await page.waitForTimeout(200);
  await expectText(counter(page), '1 z 6');

  // W trakcie przesuwania widać, jaka decyzja zapadnie.
  const held = await touchDrag(context, page, flashcard(page), -170, { release: false });
  assert.equal(await flashcard(page).getAttribute('data-swipe'), 'know');
  assert.equal(await page.locator('.flashcard__stamp--know').evaluate((element) => getComputedStyle(element).opacity), '1');
  await held.end();
  await expectText(counter(page), '2 z 6');
  const known = await progressOf(page, ids.assets, 'pl_en');
  assert.equal(known.lastDecision, 'know');
  assert.equal(known.lastStatus, 'mastered');

  // W prawo: „Powtórz”.
  await flashcard(page).locator('[data-testid=card-front] .flashcard__text').tap();
  await waitUntil(async () => (await side(page)) === 'back', 'Stuknięcie powinno obrócić fiszkę');
  const right = await touchDrag(context, page, flashcard(page), 170, { release: false });
  assert.equal(await flashcard(page).getAttribute('data-swipe'), 'repeat');
  await right.end();
  await expectText(counter(page), '3 z 6');
  const repeated = await progressOf(page, ids.liabilities, 'pl_en');
  assert.equal(repeated.lastDecision, 'repeat');
  assert.equal(repeated.lastStatus, 'toLearn');
  assert.equal((await stored(page)).assessments.length, 2);
});

test('fiszki: przeciąganie myszą i przyciski zastępujące gesty (szeroki ekran)', async ({ open }) => {
  const page = await open();
  await seedStudy(page);
  await openStudySetup(page);
  await startStudy(page);

  const drag = async (dx) => {
    const box = await flashcard(page).boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + 90;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  };

  // Przeciągnięcie przed odkryciem odpowiedzi nie obraca fiszki (kliknięcie kończące ruch jest pomijane).
  await drag(-240);
  await page.waitForTimeout(300);
  assert.equal(await side(page), 'front');
  await expectText(counter(page), '1 z 6');

  await flip(page);
  await drag(260);
  await expectText(counter(page), '2 z 6');
  assert.equal(await side(page), 'front', 'nowa fiszka zaczyna od pierwszej strony');
  assert.equal(await page.locator('.sidebar').isVisible(), true, 'na szerokim ekranie panel boczny zostaje');
}, { device: DESKTOP });

test('fiszki: cofnięcie ostatniej decyzji przywraca poprzedni stan', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page);
  await startStudy(page);

  // Pierwsza ocena pojęcia: po cofnięciu nie zostaje po niej ślad.
  await assess(page, 'all', 'know');
  assert.equal(await page.locator('[data-testid=study-undo]').isDisabled(), false);
  await page.click('[data-testid=study-undo]');
  await expectText(counter(page), '1 z 6');
  await expectText(page.locator('.toast').last(), 'Cofnięto ostatnią decyzję.');
  assert.equal(await progressOf(page, ids.assets, 'pl_en'), null);
  assert.equal((await stored(page)).assessments.length, 0);
  assert.equal(await side(page), 'front', 'cofnięta fiszka wraca nieodkryta');
  assert.equal(await page.locator('[data-testid=study-undo]').isDisabled(), true);

  // Cofać można kolejne decyzje wstecz, aż do początku sesji.
  await assess(page, 'all', 'know');
  await assess(page, ['term'], 'repeat');
  await expectText(counter(page), '3 z 6');
  await page.click('[data-testid=study-undo]');
  await expectText(counter(page), '2 z 6');
  await page.click('[data-testid=study-undo]');
  await expectText(counter(page), '1 z 6');
  assert.equal((await stored(page)).assessments.length, 0);
  assert.equal((await stored(page)).progress.length, 0);

  // Ocena zapisana wcześniej zostaje, gdy cofamy późniejszą.
  await assess(page, 'all', 'know');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await expectText(page.locator('.toast').last(), 'Sesja zakończona. Ocenione fiszki: 1 z 6.');
  await page.locator('[data-testid=study-start]').waitFor();
  await startStudy(page);
  await assess(page, [], 'repeat');
  let progress = await progressOf(page, ids.assets, 'pl_en');
  assert.deepEqual([progress.reviewCount, progress.lastStatus, progress.lastDecision], [2, 'toLearn', 'repeat']);
  await page.click('[data-testid=study-undo]');
  await expectText(counter(page), '1 z 6');
  progress = await progressOf(page, ids.assets, 'pl_en');
  assert.deepEqual([progress.reviewCount, progress.lastStatus, progress.lastDecision], [1, 'mastered', 'know']);
  assert.equal((await stored(page)).assessments.length, 1);
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();

  // Cofnięcie z ekranu podsumowania wraca do ostatniej fiszki.
  await openStudySetup(page, `#/study/lesson/${ids.contractsID}`);
  await expectText(planned(page), '1 fiszka');
  await startStudy(page);
  await assess(page, 'all', 'know');
  await page.locator('[data-testid=study-summary]').waitFor();
  await page.click('[data-testid=summary-undo]');
  await expectText(counter(page), '1 z 1');
  assert.equal(await progressOf(page, ids.contract, 'pl_en'), null);
});

test('fiszki: przerwaną sesję można wznowić po ponownym otwarciu strony albo zakończyć', async ({ open }) => {
  const page = await open();
  await seedStudy(page);
  await openStudySetup(page);
  await startStudy(page);
  await assess(page, 'all', 'know');
  await assess(page, ['term'], 'repeat');
  await expectText(counter(page), '3 z 6');

  // Ponowne otwarcie strony w trakcie sesji: ta sama fiszka, oceny zostały.
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(counter(page), '3 z 6');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'zysk');
  assert.equal((await stored(page)).assessments.length, 2);

  // Wyjście z sesji niczego nie kasuje; można wrócić z ekranu Nauka i ze Startu.
  await page.getByRole('link', { name: 'Nauka' }).first().click();
  await expectText(page.locator('[data-testid=study-resume]'), 'Wznów naukę (fiszka 3 z 6)');
  await tab(page, 'Start');
  await expectText(page.locator('[data-testid=start-study]'), 'Wznów naukę (fiszka 3 z 6)');
  await page.click('[data-testid=start-study]');
  await expectText(counter(page), '3 z 6');

  // Zakończenie przed czasem zapisuje sesję w dzienniku jako niedokończoną.
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await expectText(page.locator('.toast').last(), 'Sesja zakończona. Ocenione fiszki: 2 z 6.');
  await page.locator('[data-testid=study-start]').waitFor();
  assert.equal(await page.locator('[data-testid=study-resume]').count(), 0);
  let data = await stored(page);
  assert.deepEqual(
    data.studySessions.map((session) => [session.totalCards, session.assessedCards, session.finished]),
    [[6, 2, false]]
  );

  // Sesja bez żadnej oceny nie zostawia wpisu w dzienniku.
  await startStudy(page);
  await page.getByRole('link', { name: 'Nauka' }).first().click();
  await page.click('[data-testid=study-discard]');
  await expectText(page.locator('.toast').last(), 'Sesja zakończona.');
  await waitUntil(async () => (await page.locator('[data-testid=study-resume]').count()) === 0, 'Grupa niedokończonej sesji powinna zniknąć');
  data = await stored(page);
  assert.equal(data.studySessions.length, 1);
  assert.equal(await activeSession(page), null);

  // Adres sesji bez trwającej sesji prowadzi do przygotowania nowej.
  await page.evaluate(() => { location.hash = '#/study/session'; });
  await expectText(page.locator('.empty__title'), 'Nie ma trwającej sesji');
});

test('fiszki: kierunek EN → PL ma osobne postępy; zakresy Nowe, Do powtórki, Trudne, Ulubione', async ({ open, context }) => {
  // Zegar przeglądarki pod kontrolą testu – „Do powtórki” zależy od terminów FSRS.
  await context.clock.install();
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page);
  await choose(page, 'Kierunek nauki', 'EN → PL');
  await startStudy(page);

  // Pytanie po angielsku, odpowiedź po polsku.
  assert.equal(await flashcard(page).getAttribute('data-direction'), 'en_pl');
  await expectText(page.locator('[data-testid=card-front] .flashcard__label'), 'Angielski');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'assets');
  await flip(page);
  await expectText(page.locator('[data-testid=card-back] .flashcard__text--answer'), 'aktywa');
  await expectText(page.locator('[data-testid=card-back] .flashcard__label'), 'Polski');
  await page.click('[data-testid=know-all]');
  await page.click('[data-testid=decide-know]');
  await expectText(counter(page), '2 z 6');
  await assess(page, [], 'repeat');        // liabilities: 0/2, Powtórz
  await assess(page, ['term'], 'know');    // profit: 1/1, Umiem
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();

  assert.equal((await progressOf(page, ids.assets, 'en_pl')).lastStatus, 'mastered');
  assert.equal(await progressOf(page, ids.assets, 'pl_en'), null, 'kierunek PL → EN pozostaje nieoceniony');

  const scopes = async () => (await page.locator('[data-testid=study-scope] option').allTextContents()).map((text) => text.trim());
  // Zaraz po sesji nic nie jest jeszcze zaległe: „Powtórz” przy 0/2 to Again – fiszka wraca po minucie.
  assert.ok((await scopes()).includes('Do powtórki (0)'));
  await page.clock.fastForward('02:00');
  await page.evaluate((id) => window.lexicards.library.setFavorite(true, [id]), ids.contract);
  await waitUntil(async () => (await scopes()).includes('Ulubione (1)'), 'Zakres „Ulubione” powinien pokazać jedno pojęcie');

  // Kierunek zapamiętany z poprzedniej sesji: EN → PL.
  assert.deepEqual(await scopes(), ['Wszystkie (6)', 'Nowe (3)', 'Do powtórki (1)', 'Częściowo zapamiętane (0)', 'Trudne (1)', 'Błędy z quizów (0)', 'Ulubione (1)', 'Losowe (6)']);
  await choose(page, 'Kierunek nauki', 'PL → EN');
  assert.deepEqual(await scopes(), ['Wszystkie (6)', 'Nowe (6)', 'Do powtórki (0)', 'Częściowo zapamiętane (0)', 'Trudne (0)', 'Błędy z quizów (0)', 'Ulubione (1)', 'Losowe (6)']);
  await choose(page, 'Kierunek nauki', 'Mieszany');
  assert.deepEqual(await scopes(), ['Wszystkie (6)', 'Nowe (6)', 'Do powtórki (1)', 'Częściowo zapamiętane (0)', 'Trudne (1)', 'Błędy z quizów (0)', 'Ulubione (1)', 'Losowe (6)']);

  // Zakres bez fiszek: nie da się rozpocząć.
  await choose(page, 'Kierunek nauki', 'PL → EN');
  await page.selectOption('[data-testid=study-scope]', 'repeat');
  await expectText(planned(page), 'Brak fiszek dla tych ustawień');
  assert.equal(await page.locator('[data-testid=study-start]').isDisabled(), true);

  // „Do powtórki” w kierunku EN → PL: tylko fiszka odłożona do powtórki.
  await choose(page, 'Kierunek nauki', 'EN → PL');
  await expectText(planned(page), '1 fiszka');
  await startStudy(page);
  await expectText(counter(page), '1 z 1');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'liabilities');
  await page.getByRole('link', { name: 'Nauka' }).first().click();
  await page.click('[data-testid=study-discard]');
  await waitUntil(async () => (await page.locator('[data-testid=study-resume]').count()) === 0, 'Sesja powinna zostać zamknięta');

  // Tryb mieszany: każde pojęcie raz, w jednym z dwóch kierunków.
  await page.selectOption('[data-testid=study-scope]', 'all');
  await choose(page, 'Kierunek nauki', 'Mieszany');
  await expectText(planned(page), '6 fiszek');
  await startStudy(page);
  const session = await activeSession(page);
  assert.equal(new Set(session.queue.map((card) => card.termID)).size, 6);
  assert.ok(session.queue.every((card) => card.direction === 'pl_en' || card.direction === 'en_pl'));
});

test('fiszki: przygotowanie sesji – materiał, wiele lekcji, liczba fiszek, kolejność, pierwsza strona', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await tab(page, 'Nauka');
  await page.locator('[data-testid=study-start]').waitFor();

  // Domyślnie 20 losowych fiszek z całej biblioteki.
  await expectText(planned(page), '20 fiszek z 40 pasujących');
  assert.equal(await page.locator('[data-testid=study-module]').isDisabled(), true, 'moduł wybiera się po dziedzinie');
  await choose(page, 'Liczba fiszek', '10');
  await expectText(planned(page), '10 fiszek z 40 pasujących');
  await choose(page, 'Liczba fiszek', 'Wszystkie');
  await expectText(planned(page), '40 fiszek');

  // Dziedzina → moduł → wybrane lekcje.
  await page.selectOption('[data-testid=study-domain]', { label: 'Metrology' });
  await expectText(planned(page), '18 fiszek');
  const moduleName = await page.evaluate(() => {
    const { library } = window.lexicards;
    const domain = library.listDomains().find((item) => item.name === 'Metrology');
    return library.listModules(domain.id).find((module) => library.listLessons(module.id).length >= 2).name;
  });
  await page.selectOption('[data-testid=study-module]', { label: moduleName });
  const lessons = await page.evaluate((name) => {
    const { library } = window.lexicards;
    const module = [...library.maps.modules.values()].find((item) => item.name === name);
    return library.listLessons(module.id).map((lesson) => ({ id: lesson.id, name: lesson.name, terms: library.listTerms(lesson.id).length }));
  }, moduleName);
  assert.equal(await page.locator('[data-testid=study-all-lessons]').isChecked(), true);
  const total = lessons.reduce((sum, lesson) => sum + lesson.terms, 0);
  await expectText(planned(page), `${total} fisz`);

  const lessonBox = (name) => page.locator('.group--compact .row', { hasText: name }).locator('input');
  await lessonBox(lessons[0].name).check();
  await waitUntil(async () => !(await page.locator('[data-testid=study-all-lessons]').isChecked()), '„Wszystkie lekcje” powinno się odznaczyć');
  await expectText(planned(page), `${lessons[0].terms} fisz`);
  await lessonBox(lessons[1].name).check();
  const two = lessons[0].terms + lessons[1].terms;
  await expectText(planned(page), `${two} fisz`);

  // Kolejność „jak w lekcjach”: fiszki w kolejności biblioteki.
  await choose(page, 'Kolejność fiszek', 'Jak w lekcjach');
  await choose(page, 'Pierwsza strona fiszki', 'Definicja');
  await startStudy(page);
  await expectText(counter(page), `1 z ${two}`);
  let session = await activeSession(page);
  const expected = await page.evaluate((ids) => ids.flatMap((id) => window.lexicards.library.listTerms(id).map((term) => term.id)), [lessons[0].id, lessons[1].id]);
  assert.deepEqual(session.queue.map((card) => card.termID), expected);

  // Pierwsza strona pokazuje definicję w języku pytania, a odwrót – pojęcie i tłumaczenie.
  const firstTerm = await page.evaluate((id) => window.lexicards.library.getTerm(id), expected[0]);
  await expectText(page.locator('[data-testid=card-front] .flashcard__label'), 'Definicja po polsku');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), firstTerm.descriptionPL);
  await flip(page);
  await expectText(page.locator('[data-testid=card-back] .flashcard__text--answer'), firstTerm.termEN);
  await expectText(page.locator('[data-testid=card-back] .flashcard__question'), firstTerm.termPL);
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();

  // Ustawienia sesji są zapamiętane – także wybrany materiał, również po ponownym otwarciu strony.
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await page.locator('[data-testid=study-start]').waitFor();
  assert.equal(await page.getByRole('radiogroup', { name: 'Pierwsza strona fiszki' }).getByRole('radio', { name: 'Definicja', exact: true }).isChecked(), true);
  assert.equal(await page.getByRole('radiogroup', { name: 'Liczba fiszek' }).getByRole('radio', { name: 'Wszystkie', exact: true }).isChecked(), true);
  assert.equal(await lessonBox(lessons[0].name).isChecked(), true);
  assert.equal(await lessonBox(lessons[1].name).isChecked(), true);
  await expectText(planned(page), `${two} fisz`);

  // Kolejność losowa: ten sam zestaw pojęć.
  await page.selectOption('[data-testid=study-domain]', '');
  await choose(page, 'Kolejność fiszek', 'Losowa');
  await choose(page, 'Liczba fiszek', '10');
  await expectText(planned(page), '10 fiszek z 40 pasujących');
  await startStudy(page);
  session = await activeSession(page);
  assert.equal(session.queue.length, 10);
  assert.equal(new Set(session.queue.map((card) => card.termID)).size, 10, 'fiszki się nie powtarzają');
});

test('fiszki: powtórka całej sesji z podsumowania, z ekranu Nauka i ze Startu', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);
  for (let card = 0; card < 3; card += 1) await assess(page, 'all', 'know');

  // Wszystko „Umiem”: nie ma czego odkładać, ale całą sesję można powtórzyć.
  await page.locator('[data-testid=study-summary]').waitFor();
  assert.equal(await page.locator('[data-testid=summary-repeat]').count(), 0);
  const repeatAll = page.locator('[data-testid=summary-repeat-all]');
  await expectText(repeatAll, 'Powtórz całą sesję (3)');
  assert.ok((await repeatAll.getAttribute('class')).includes('button--primary'), 'to główne polecenie podsumowania');
  await repeatAll.click();
  await expectText(counter(page), '1 z 3');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'aktywa');
  assert.equal((await stored(page)).studySessions.length, 1, 'poprzednia sesja jest w dzienniku');

  // Po zakończeniu przed czasem ekran Nauka proponuje powtórkę tej samej sesji.
  await assess(page, 'all', 'know');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  const repeatLast = page.locator('[data-testid=study-repeat-last]');
  await expectText(repeatLast, 'Powtórz całą sesję (3 fiszki)');
  await expectText(page.locator('.group', { has: repeatLast }).locator('.group__footer'), 'Lekcja Podstawy, PL → EN');
  // Materiał ostatniej sesji jest też wybrany w formularzu.
  assert.equal(await page.locator('[data-testid=study-module]').inputValue(), ids.financeID);
  assert.equal(await page.locator('.group--compact .row', { hasText: 'Podstawy' }).locator('input').isChecked(), true);
  await expectText(planned(page), '3 fiszki');

  // Po ponownym otwarciu strony: jedno dotknięcie na Starcie.
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await tab(page, 'Start');
  await expectText(page.locator('[data-testid=start-repeat-last]'), 'Powtórz ostatnią sesję (3 fiszki)');
  await page.click('[data-testid=start-repeat-last]');
  await expectText(counter(page), '1 z 3');
  await expectText(page.locator('[data-testid=study-lesson]'), 'Podstawy');

  // Po rundzie powtórkowej „cała sesja” to nadal wszystkie trzy fiszki.
  await assess(page, 'all', 'know');
  await assess(page, [], 'repeat');
  await assess(page, 'all', 'know');
  await expectText(page.locator('[data-testid=summary-repeat]'), 'Powtórz odłożone (1)');
  await expectText(repeatAll, 'Powtórz całą sesję (3)');
  assert.ok((await repeatAll.getAttribute('class')).includes('button--secondary'));
  await page.click('[data-testid=summary-repeat]');
  await expectText(counter(page), '1 z 1');
  await assess(page, 'all', 'know');
  await expectText(page.locator('.empty__title'), 'Runda powtórkowa zakończona');
  await expectText(repeatAll, 'Powtórz całą sesję (3)');
  await repeatAll.click();
  await expectText(counter(page), '1 z 3');
});

test('fiszki: przyciski podsumowania działają po jednym dotknięciu, bez podwójnego wywołania', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  const finishByTouch = async () => {
    while (!(await page.locator('[data-testid=study-summary]').count())) {
      await page.tap('[data-testid=card-flip]');
      await waitUntil(async () => (await side(page)) === 'back', 'Fiszka powinna się obrócić');
      await page.tap('[data-testid=know-all]');
      const before = await counter(page).textContent();
      await page.tap('[data-testid=decide-know]');
      await waitUntil(() => movedOn(page, before), 'Po decyzji powinna pojawić się następna fiszka');
    }
  };
  // Licznik wywołań powtórki – jedno dotknięcie ma uruchomić ją dokładnie raz.
  await page.evaluate(() => {
    const { library } = window.lexicards;
    const original = library.repeatStudy.bind(library);
    window.repeatCalls = 0;
    library.repeatStudy = (...args) => { window.repeatCalls += 1; return original(...args); };
  });

  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await page.tap('[data-testid=study-start]');
  await page.locator('[data-testid=study-session]').waitFor();
  await finishByTouch();
  await page.tap('[data-testid=summary-repeat-all]');
  await expectText(counter(page), '1 z 3');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.repeatCalls), 1);

  // „Zakończ” przenosi na Start; kliknięcie nie trafia potem w element nowego ekranu.
  await finishByTouch();
  await page.tap('[data-testid=summary-done]');
  await page.waitForFunction(() => location.hash === '#/start');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => location.hash), '#/start');
  assert.equal(await activeSession(page), null);
});

test('powtórki FSRS: podpowiedź odstępu, powtórka na dziś ze Startu, termin i ocena w szczegółach pojęcia', async ({ open, context }) => {
  // Stała godzina w środku dnia – prognoza „dziś / jutro” nie zależy od pory uruchomienia testu.
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);
  const whenKnow = page.locator('[data-testid=when-know]');
  const whenRepeat = page.locator('[data-testid=when-repeat]');

  // Przed odkryciem odpowiedzi nie ma podpowiedzi; potem zależy od kafelków.
  assert.equal((await whenKnow.textContent()).trim(), '');
  await flip(page);
  await expectText(whenKnow, 'wróci za 10 min');         // „Umiem” to zawsze komplet: Good
  await expectText(whenRepeat, 'wróci za 1 min');        // „Powtórz” bez kafelków: Again
  await page.click('[data-testid=know-all]');
  await expectText(whenKnow, 'wróci za 10 min');
  await expectText(whenRepeat, 'wróci za 6 min');        // komplet + Powtórz: Hard (5,5 min)
  await page.click('[data-testid=decide-know]');
  await expectText(counter(page), '2 z 3');

  await flip(page);
  await tile(page, 'term').click();
  await expectText(whenKnow, 'wróci za 10 min');         // „Umiem”: Good
  await expectText(whenRepeat, 'wróci za 6 min');        // 1/2 + Powtórz – częściowo: Hard
  await page.click('[data-testid=decide-know]');
  await assess(page, [], 'repeat');                      // zysk: Again
  await page.click('[data-testid=summary-done]');
  await page.waitForFunction(() => location.hash === '#/start');

  // Na Starcie: nic zaległego, ale wiadomo, kiedy będzie.
  assert.equal(await page.locator('[data-testid=start-review]').count(), 0);
  await expectText(page.locator('[data-testid=start-review-note]'), 'Na teraz nic do powtórki. Dziś jeszcze: 3 fiszki, najbliższa za 1 min.');

  // Po 11 minutach wszystkie trzy są zaległe; powtórka zaczyna od najdłużej czekającej.
  await page.clock.fastForward('11:00');
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(page.locator('[data-testid=start-review]'), 'Powtórka na dziś (3 fiszki)');
  await tab(page, 'Nauka');
  await expectText(page.locator('[data-testid=study-review]'), 'Powtórz zaległe (3 fiszki)');
  await tab(page, 'Start');
  await page.click('[data-testid=start-review]');
  await expectText(counter(page), '1 z 3');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'zysk');
  await assess(page, 'all', 'know');
  // Aktywa i pasywa – obie Good z terminem za 10 min; aktywa oceniono wcześniej, więc czekają dłużej.
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'aktywa');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();
  const session = await page.evaluate(() => window.lexicards.library.getSettings().lastStudySession);
  assert.equal(session.config.review, true);

  // Szczegóły pojęcia: ostatnia ocena osobno, a pod nią termin i poziom z FSRS.
  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.basicsID);
  const row = termRows(page).filter({ hasText: 'aktywa' });
  await row.locator('.term__toggle').click();
  const details = row.locator('.term__details');
  await expectText(details, '3/3 – Opanowane');
  await expectText(details, 'Powtórka: teraz');
  await expectText(details, 'Poziom: W nauce');
  await row.locator('[data-testid=term-history]').click();
  await expectText(sheet(page).locator('[data-testid=history-fsrs]'), 'FSRS: Dobrze (Good), następna powtórka za 10 min');
  await sheet(page).getByRole('button', { name: 'Zamknij' }).click();

  // Dziennik powtórek: jeden wpis na zatwierdzoną fiszkę, z oceną FSRS.
  const data = await stored(page);
  assert.deepEqual(data.reviews.map((review) => review.rating).sort(), [1, 3, 3, 3]);
  assert.ok(data.progress.every((progress) => progress.schedule && progress.schedule.due));

  // Ustawienia: docelowa skuteczność.
  await page.evaluate(() => { location.hash = '#/settings'; });
  assert.equal(await page.locator('[data-testid=desired-retention]').inputValue(), '0.9');
  await page.selectOption('[data-testid=desired-retention]', '0.95');
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().desiredRetention === 0.95), 'Ustawienie powinno się zapisać');
});

test('fiszki: „Umiem” zaznacza wszystko; „Powtórz” dzieli na częściowo zapamiętane i nieznane', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);

  // „Umiem” bez zaznaczania: kafelki zaznaczają się same, wynik 3/3.
  await flip(page);
  await page.click('[data-testid=decide-know]');
  await expectText(counter(page), '2 z 3');
  const assets = await progressOf(page, ids.assets, 'pl_en');
  assert.deepEqual([assets.lastScore, assets.lastAvailable, assets.lastStatus], [3, 3, 'mastered']);

  await assess(page, ['term'], 'repeat');   // pasywa: 1/2 – częściowo zapamiętane
  await assess(page, [], 'repeat');         // zysk: nic – nieznane

  await page.locator('[data-testid=study-summary]').waitFor();
  const postponed = page.locator('[data-testid=summary-repeat]');
  const partial = page.locator('[data-testid=summary-repeat-partial]');
  const unknown = page.locator('[data-testid=summary-repeat-unknown]');
  await expectText(postponed, 'Powtórz odłożone (2)');
  await expectText(partial, 'Powtórz częściowo zapamiętane (1)');
  await expectText(unknown, 'Powtórz nieznane (1)');
  await expectText(page.locator('[data-testid=summary-repeat-all]'), 'Powtórz całą sesję (3)');
  assert.ok((await postponed.getAttribute('class')).includes('button--primary'));
  assert.ok((await partial.getAttribute('class')).includes('button--secondary'));

  // Runda z częściowo zapamiętanymi: tylko „pasywa”.
  await partial.click();
  await expectText(counter(page), '1 z 1');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'pasywa');
  await assess(page, [], 'know');
  await expectText(page.locator('.empty__title'), 'Runda powtórkowa zakończona');
  // Zostało tylko nieznane „zysk” – jeden przycisk dla odłożonych, bez powielania.
  await expectText(postponed, 'Powtórz odłożone (1)');
  assert.equal(await partial.count(), 0);
  assert.equal(await unknown.count(), 0);

  // Po zamknięciu podsumowania to samo jest w zakładce Nauka.
  await page.click('[data-testid=summary-new]');
  await expectText(page.locator('[data-testid=study-repeat-last]'), 'Powtórz całą sesję (3 fiszki)');
  await expectText(page.locator('[data-testid=study-repeat-postponed]'), 'Powtórz odłożone (1 fiszka)');
  await page.click('[data-testid=study-repeat-postponed]');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'zysk');
  await assess(page, ['term'], 'repeat');   // zysk ma samo tłumaczenie: zaznaczone pojęcie to komplet, ale „Powtórz”
  await page.click('[data-testid=summary-new]');
  // Komplet z „Powtórz” to odłożone, ale ani częściowo zapamiętane, ani nieznane.
  await expectText(page.locator('[data-testid=study-repeat-postponed]'), 'Powtórz odłożone (1 fiszka)');
  assert.equal(await page.locator('[data-testid=study-repeat-partial]').count(), 0);
  assert.equal(await page.locator('[data-testid=study-repeat-unknown]').count(), 0);
  const scopeOptions = (await page.locator('[data-testid=study-scope] option').allTextContents()).map((text) => text.trim());
  assert.ok(scopeOptions.includes('Częściowo zapamiętane (0)'), scopeOptions.join(', '));
});

test('fiszki: wejście z lekcji i z menu biblioteki ustawia materiał', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);

  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.advancedID);
  await page.click('[data-testid=lesson-study]');
  await page.locator('[data-testid=study-start]').waitFor();
  assert.equal(await page.locator('[data-testid=study-domain]').inputValue(), ids.domainID);
  assert.equal(await page.locator('[data-testid=study-module]').inputValue(), ids.financeID);
  assert.equal(await page.locator('.group--compact .row', { hasText: 'Zaawansowane' }).locator('input').isChecked(), true);
  await expectText(planned(page), '2 fiszki');
  await startStudy(page);
  await expectText(page.locator('[data-testid=study-lesson]'), 'Zaawansowane');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'amortyzacja');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();

  // Menu modułu w bibliotece.
  await page.evaluate((id) => { location.hash = `#/library/domain/${id}`; }, ids.domainID);
  await page.getByRole('button', { name: 'Więcej poleceń: Prawo' }).click();
  await menuItem(page, 'Ucz się');
  await page.locator('[data-testid=study-start]').waitFor();
  const lawID = await page.evaluate((id) => window.lexicards.library.getLesson(id).moduleID, ids.contractsID);
  assert.equal(await page.locator('[data-testid=study-module]').inputValue(), lawID);
  await expectText(planned(page), '1 fiszka');
});

test('fiszki: obsługa z klawiatury – spacja, 1 2 3, strzałki, Z', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page);
  await startStudy(page);
  await page.evaluate(() => document.activeElement?.blur());

  // Strzałka przed odkryciem odpowiedzi nic nie robi.
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  await expectText(counter(page), '1 z 6');

  await page.keyboard.press('Space');
  await waitUntil(async () => (await side(page)) === 'back', 'Spacja powinna obrócić fiszkę');
  await page.keyboard.press('1');
  await page.keyboard.press('3');
  assert.equal(await tile(page, 'term').getAttribute('aria-pressed'), 'true');
  assert.equal(await tile(page, 'description').getAttribute('aria-pressed'), 'false');
  assert.equal(await tile(page, 'example').getAttribute('aria-pressed'), 'true');
  await expectText(score(page), '2/3');
  await page.keyboard.press('2');
  await expectText(score(page), '3/3');
  await page.keyboard.press('2');
  await expectText(score(page), '2/3');

  await page.keyboard.press('ArrowLeft');
  await expectText(counter(page), '2 z 6');
  const progress = await progressOf(page, ids.assets, 'pl_en');
  // ← to „Umiem”: komplet, choć zaznaczone były dwa kafelki.
  assert.deepEqual([progress.lastScore, progress.lastAvailable, progress.lastStatus, progress.lastDecision], [3, 3, 'mastered', 'know']);

  await page.keyboard.press('Enter');
  await waitUntil(async () => (await side(page)) === 'back', 'Enter powinien obrócić fiszkę');
  await page.keyboard.press('ArrowRight');
  await expectText(counter(page), '3 z 6');
  assert.equal((await progressOf(page, ids.liabilities, 'pl_en')).lastDecision, 'repeat');

  await page.keyboard.press('z');
  await expectText(counter(page), '2 z 6');
  assert.equal(await progressOf(page, ids.liabilities, 'pl_en'), null);

  // Tab i spacja na kafelku działają jak dotknięcie (bez podwójnego obrotu fiszki).
  await page.locator('[data-testid=card-flip]').focus();
  await page.keyboard.press('Enter');
  await waitUntil(async () => (await side(page)) === 'back', 'Enter na przycisku powinien obrócić fiszkę');
  await page.waitForTimeout(450);
  assert.equal(await side(page), 'back', 'jedno naciśnięcie to jeden obrót');
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.testid),
    'card-unflip', 'fokus przechodzi na przycisk obrotu po drugiej stronie'
  );
  await tile(page, 'term').focus();
  await page.keyboard.press('Space');
  assert.equal(await tile(page, 'term').getAttribute('aria-pressed'), 'true');
  assert.equal(await side(page), 'back');
}, { device: DESKTOP });

test('fiszki: wymowa – przycisk głośnika, szybkość i głos z ustawień', async ({ open, context }) => {
  // Syntezator mowy przeglądarki zastąpiony atrapą, która zapisuje, co miało zostać odczytane.
  await context.addInitScript(() => {
    const spoken = [];
    const voices = [
      { voiceURI: 'pl-zosia', name: 'Zosia', lang: 'pl-PL', default: true, localService: true },
      { voiceURI: 'en-samantha', name: 'Samantha', lang: 'en-US', default: false, localService: true },
      { voiceURI: 'en-daniel', name: 'Daniel', lang: 'en-GB', default: false, localService: true },
      { voiceURI: 'de-anna', name: 'Anna', lang: 'de-DE', default: false, localService: true }
    ];
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.voice = null;
      }
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak: (utterance) => {
          spoken.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate, voice: utterance.voice?.voiceURI ?? null });
          // Jak w przeglądarce: najpierw „start”, potem „end”.
          setTimeout(() => utterance.onstart?.({}), 0);
          setTimeout(() => utterance.onend?.({}), 50);
        },
        cancel: () => {},
        addEventListener: () => {},
        removeEventListener: () => {}
      }
    });
    window.spokenTexts = spoken;
  });
  const page = await open();
  await seedStudy(page);
  const spoken = () => page.evaluate(() => window.spokenTexts);

  // Ustawienia: szybkość i głos angielski (tylko głosy danego języka); wybór głosu odtwarza próbkę.
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.locator('[data-testid=speech-rate]').waitFor();
  assert.deepEqual(
    (await page.locator('[data-testid=voice-en] option').allTextContents()).map((text) => text.trim()),
    ['Domyślny głos systemu', 'Daniel (en-GB)', 'Samantha (en-US)']
  );
  await page.selectOption('[data-testid=speech-rate]', '0.7');
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().speechRate === 0.7), 'Szybkość powinna się zapisać');
  await page.selectOption('[data-testid=voice-en]', 'en-daniel');
  await waitUntil(async () => (await spoken()).length === 1, 'Po wyborze głosu powinna zabrzmieć próbka');
  assert.deepEqual((await spoken())[0], { text: 'Hello, this is a voice sample.', lang: 'en-GB', rate: 0.7, voice: 'en-daniel' });

  await openStudySetup(page);
  await startStudy(page);

  // Głośnik czyta pojęcie w języku pytania i nie obraca fiszki.
  await page.locator('[data-testid=card-front] [data-testid=speak]').click();
  await waitUntil(async () => (await spoken()).length === 2, 'Powinno zostać odczytane pojęcie');
  assert.deepEqual((await spoken())[1], { text: 'aktywa', lang: 'pl-PL', rate: 0.7, voice: null });
  assert.equal(await side(page), 'front');

  // Na odwrocie: tłumaczenie wybranym głosem oraz przykłady w obu językach.
  await flip(page);
  const back = page.locator('[data-testid=card-back]');
  await back.locator('.flashcard__top [data-testid=speak]').click();
  await waitUntil(async () => (await spoken()).length === 3, 'Powinno zostać odczytane tłumaczenie');
  assert.deepEqual((await spoken())[2], { text: 'assets', lang: 'en-GB', rate: 0.7, voice: 'en-daniel' });
  // Głośnik przy każdej linii definicji i przykładu, w kolejności: angielski, polski.
  const languages = (section) => back.locator(`[data-section=${section}] [data-testid=speak]`)
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.lang));
  assert.deepEqual(await languages('description'), ['en', 'pl']);
  assert.deepEqual(await languages('example'), ['en', 'pl']);
  await back.locator('[data-section=description] [data-testid=speak][data-lang=pl]').click();
  await waitUntil(async () => (await spoken()).length === 4, 'Powinna zostać odczytana definicja');
  assert.deepEqual((await spoken())[3], { text: 'Zasoby majątkowe firmy.', lang: 'pl-PL', rate: 0.7, voice: null });
  await back.locator('[data-section=example] [data-testid=speak][data-lang=en]').click();
  await waitUntil(async () => (await spoken()).length === 5, 'Powinien zostać odczytany przykład');
  assert.equal((await spoken())[4].text, 'The assets of the company increased.');
  assert.equal(await side(page), 'back');

  await expectText(counter(page), '1 z 6');
});

test('fiszki: stan nauki i historia ocen w szczegółach pojęcia', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);
  await assess(page, ['term', 'description'], 'repeat');   // aktywa 2/3 – częściowo zapamiętane
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();

  // Druga ocena tego samego pojęcia, tym razem w kierunku EN → PL.
  await choose(page, 'Kierunek nauki', 'EN → PL');
  await startStudy(page);
  await assess(page, [], 'repeat');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();

  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.basicsID);
  const row = termRows(page).filter({ hasText: 'aktywa' });
  await row.locator('.term__toggle').click();
  const details = row.locator('.term__details');
  await expectText(details, 'Nauka PL → EN');
  await expectText(details, '2/3 – Częściowo opanowane');
  await expectText(details, 'Nauka EN → PL');
  await expectText(details, '0/3 – Do nauki');

  await row.locator('[data-testid=term-history]').click();
  const history = sheet(page).locator('[data-testid=history]');
  await waitUntil(async () => (await history.locator('.history__entry').count()) === 2, 'Historia powinna mieć dwa wpisy');
  const entries = (await history.locator('.history__entry').allTextContents()).map((text) => text.trim());
  // Od najnowszej.
  assert.ok(entries[0].startsWith('0/3Do naukiEN → PL, decyzja: Powtórz'), entries[0]);
  assert.ok(entries[1].startsWith('2/3Częściowo opanowanePL → EN, decyzja: Powtórz'), entries[1]);
  await sheet(page).getByRole('button', { name: 'Zamknij' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });

  // Pojęcie jeszcze nieoceniane: bez przycisku historii.
  const other = termRows(page).filter({ hasText: 'zysk' });
  await other.locator('.term__toggle').click();
  await expectText(other.locator('.term__details'), 'Jeszcze nie oceniane');
  assert.equal(await other.locator('[data-testid=term-history]').count(), 0);

  const data = await stored(page);
  assert.equal(data.assessments.length, 2);
  assert.equal(data.progress.length, 2, 'osobny postęp dla każdego kierunku');
});

test('fiszki: pojęcie usunięte w trakcie sesji jest pomijane, a jego historia znika', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);
  await assess(page, 'all', 'know');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'pasywa');

  // Bieżąca fiszka znika z biblioteki (np. usunięta w drugiej karcie).
  await page.evaluate((id) => window.lexicards.library.delete({ kind: 'terms', ids: [id] }), ids.liabilities);
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'zysk');
  await expectText(counter(page), '3 z 3');
  await assess(page, 'all', 'know');
  await expectText(page.locator('[data-testid=summary-text]'), 'Ocenione fiszki: 2. Umiem: 2. Do powtórki: 0. Pominięto usunięte pojęcia: 1.');

  // Usunięcie ocenionego pojęcia usuwa też jego postęp i wpisy historii.
  await page.evaluate((id) => window.lexicards.library.delete({ kind: 'terms', ids: [id] }), ids.assets);
  const data = await stored(page);
  assert.deepEqual(data.assessments.map((entry) => entry.termID), [ids.profit]);
  assert.deepEqual(data.progress.map((entry) => entry.termID), [ids.profit]);
});

test('fiszki: wąski ekran 320 px i długie teksty – nic nie wystaje, przyciski są w zasięgu', async ({ open }) => {
  const page = await open();
  await page.evaluate(async () => {
    const { library } = window.lexicards;
    const lesson = await library.createLesson({ name: 'Bardzo długa nazwa lekcji, która nie mieści się w jednym wierszu nagłówka' },
      { create: { name: 'Moduł' }, domain: { create: { name: 'Dziedzina' } } });
    await library.createTerm({
      termPL: 'współrzędnościowa maszyna pomiarowa z głowicą skanującą i stołem obrotowym',
      termEN: 'coordinate measuring machine with a scanning probe head and a rotary table',
      descriptionPL: 'Urządzenie do wyznaczania wymiarów i odchyłek geometrycznych przedmiotów. '.repeat(6),
      descriptionEN: 'A device for determining dimensions and geometric deviations of workpieces. '.repeat(6),
      examplePL: 'Pomiar wykonano na współrzędnościowej maszynie pomiarowej w klimatyzowanym laboratorium. '.repeat(3),
      exampleEN: 'Thequickbrownfoxjumpsoverthelazydogwithoutanyspacesatallinthisverylongexampletext'
    }, lesson.id);
    await library.updateSettings({ shuffleCards: false, studyCount: 0 });
  });
  const overflow = () => overflowX(page);
  await openStudySetup(page);
  assert.ok((await overflow()) <= 0, `przygotowanie sesji: treść wystaje o ${await overflow()} px`);
  await startStudy(page);
  assert.ok((await overflow()) <= 0, `pierwsza strona: treść wystaje o ${await overflow()} px`);
  await flip(page);
  assert.ok((await overflow()) <= 0, `odwrót: treść wystaje o ${await overflow()} px`);

  // Długi odwrót przewija się wewnątrz fiszki, a przycisk obrotu pozostaje widoczny.
  const inside = await page.locator('[data-testid=card-back]').evaluate((face) => ({
    scrolls: face.scrollHeight > face.clientHeight,
    width: face.scrollWidth - face.clientWidth
  }));
  assert.equal(inside.scrolls, true, 'odwrót przewija się wewnątrz fiszki');
  assert.ok(inside.width <= 0, `tekst wystaje poza fiszkę o ${inside.width} px`);
  // Pomiar po zakończeniu obrotu – w jego trakcie fiszka jest zwężona przez perspektywę.
  await waitUntil(() => flashcard(page).evaluate((element) => element.getAnimations().length === 0), 'Obrót powinien się zakończyć');
  const cardBox = await flashcard(page).boundingBox();
  const flipBox = await page.locator('[data-testid=card-unflip]').boundingBox();
  assert.ok(flipBox.y >= cardBox.y && flipBox.y + flipBox.height <= cardBox.y + cardBox.height, 'przycisk obrotu mieści się na fiszce');
  assert.ok(flipBox.width >= 44 && flipBox.height >= 44, 'przycisk obrotu ma wygodny rozmiar');

  // Głośniki przy długich liniach definicji i przykładu nie zwężają się i leżą w jednej linii.
  const speakers = await page.locator('[data-testid=card-back] .flashcard__line [data-testid=speak]')
    .evaluateAll((buttons) => buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { right: Math.round(box.right), width: Math.round(box.width) };
    }));
  assert.equal(speakers.length, 4, 'głośnik przy każdej linii definicji i przykładu');
  assert.equal(new Set(speakers.map((item) => item.right)).size, 1, `prawe krawędzie: ${speakers.map((item) => item.right).join(', ')}`);
  assert.ok(speakers.every((item) => item.width === 36), `szerokości: ${speakers.map((item) => item.width).join(', ')}`);

  // Kafelki i przyciski decyzji mieszczą się w szerokości ekranu.
  for (const selector of ['[data-testid=tile-term]', '[data-testid=tile-example]', '[data-testid=decide-know]', '[data-testid=decide-repeat]']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320, `${selector} mieści się na ekranie`);
    assert.ok(box.height >= 44, `${selector} ma wygodną wysokość (${box.height})`);
  }
  await page.click('[data-testid=know-all]');
  await page.locator('[data-testid=decide-know]').scrollIntoViewIfNeeded();
  await page.click('[data-testid=decide-know]');
  await page.locator('[data-testid=study-summary]').waitFor();
  assert.ok((await overflow()) <= 0, `podsumowanie: treść wystaje o ${await overflow()} px`);
}, { device: { ...PHONE, viewport: { width: 320, height: 568 } } });

test('fiszki: ograniczony ruch – obrót i decyzja działają bez animacji', async ({ open, context }) => {
  const page = await open();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedStudy(page);
  await openStudySetup(page);
  await startStudy(page);
  await page.click('[data-testid=card-flip]');
  assert.equal(await side(page), 'back', 'bez animacji strona zmienia się od razu');
  assert.equal(await flashcard(page).evaluate((element) => element.getAnimations().length), 0);
  await page.click('[data-testid=know-all]');
  await touchDrag(context, page, flashcard(page), -180);
  await expectText(counter(page), '2 z 6');
});

test('fiszki: kopia zapasowa przenosi postępy, historię ocen i niedokończoną sesję', async ({ open, browser, track }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page);
  await startStudy(page);
  await assess(page, 'all', 'know');
  await assess(page, ['term'], 'repeat');

  await page.evaluate(() => { location.hash = '#/settings'; });
  const file = await download(page, () => page.click('[data-testid=backup-export]'));

  const context = await browser.newContext({ ...PHONE, locale: 'pl-PL', acceptDownloads: true });
  try {
    const other = await context.newPage();
    track(other);
    await other.goto(page.url().split('#')[0]);
    await other.waitForSelector('#app[data-ready="true"]');
    await other.evaluate(() => { location.hash = '#/settings'; });
    const [chooser] = await Promise.all([other.waitForEvent('filechooser'), other.click('[data-testid=backup-restore]')]);
    await chooser.setFiles(path.join(OUTPUT, file.name));
    await confirm(other);
    await waitUntil(async () => (await summary(other)).terms === 6, 'Kopia powinna zostać przywrócona');

    const data = await stored(other);
    assert.equal(data.assessments.length, 2);
    assert.equal((await progressOf(other, ids.assets, 'pl_en')).lastStatus, 'mastered');
    assert.equal((await progressOf(other, ids.liabilities, 'pl_en')).lastDecision, 'repeat');

    // Sesja przerwana na trzeciej fiszce daje się dokończyć na drugim urządzeniu.
    await other.evaluate(() => { location.hash = '#/start'; });
    await expectText(other.locator('[data-testid=start-study]'), 'Wznów naukę (fiszka 3 z 6)');
    await other.click('[data-testid=start-study]');
    await expectText(counter(other), '3 z 6');
    await expectText(other.locator('[data-testid=card-front] .flashcard__text'), 'zysk');
  } finally {
    await context.close();
  }
});

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

// ---------------------------------------------------------------- quizy

const quizPlanned = (page) => page.locator('[data-testid=quiz-planned]');
const quizCounter = (page) => page.locator('[data-testid=quiz-counter]');
const quizFeedback = (page) => page.locator('[data-testid=quiz-feedback]');
const activeQuiz = (page) => page.evaluate(() => window.lexicards.library.getQuiz());
const quizAnswers = (page) => page.evaluate(() => window.lexicards.library.adapter.readStore('quizAnswers'));
const matchTile = (page, side, termID) => page.locator(`[data-testid=match-${side}][data-termid="${termID}"]`);

/** Bieżące pytanie albo runda (null po zakończeniu quizu). */
const currentQuizItem = (page) => page.evaluate(() => {
  const quiz = window.lexicards.library.getQuiz();
  return quiz && !quiz.finishedAt ? quiz.items[quiz.position] : null;
});

async function openQuizSetup(page, hash = '#/quiz') {
  await page.evaluate((target) => { location.hash = target; }, hash);
  await page.locator('[data-testid=quiz-start]').waitFor();
}

async function startQuiz(page) {
  await page.click('[data-testid=quiz-start]');
  await page.locator('[data-testid=quiz-session]').waitFor();
}

/** Odpowiada na bieżące pytanie wyboru (poprawnie albo pierwszą błędną odpowiedzią). */
async function answerChoice(page, correct) {
  const item = await currentQuizItem(page);
  assert.equal(item?.kind, 'choice', 'bieżące pytanie powinno być pytaniem wyboru');
  const index = correct ? item.correctIndex : (item.correctIndex + 1) % item.options.length;
  await page.locator('[data-testid=quiz-option]').nth(index).click();
  await quizFeedback(page).waitFor();
  return { item, index };
}

/** Przechodzi do następnego pytania albo do wyniku. */
async function quizNext(page) {
  await page.click('[data-testid=quiz-next]');
  await waitUntil(async () => (await quizFeedback(page).count()) === 0, 'Informacja zwrotna powinna zniknąć');
}

/** Łączy wszystkie pary bieżącej rundy bez pomyłek (dotykiem: najpierw prawa, potem lewa kolumna). */
async function solveRound(page) {
  const item = await currentQuizItem(page);
  assert.equal(item?.kind, 'matching');
  for (const termID of item.pairs) {
    if (await matchTile(page, 'left', termID).isDisabled()) continue;
    await matchTile(page, 'right', termID).tap();
    await matchTile(page, 'left', termID).tap();
  }
  await quizFeedback(page).waitFor();
  return item;
}

test('quiz: jednokrotny wybór – cztery odpowiedzi, oznaczenie poprawnej, podpowiedź, definicja, wynik i historia', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openQuizSetup(page);
  await expectText(quizPlanned(page), '6 pytań z 6 pojęć');
  await startQuiz(page);
  await expectText(quizCounter(page), '1 z 6');
  await expectText(page.locator('[data-testid=quiz-timer]'), '0:0');

  const seen = new Set();
  for (let number = 1; number <= 6; number += 1) {
    await expectText(quizCounter(page), `${number} z 6`);
    const item = await currentQuizItem(page);
    seen.add(item.termID);
    const texts = (await page.locator('[data-testid=quiz-option] .quiz-option__text').allTextContents()).map((text) => text.trim());
    assert.equal(texts.length, 4, 'cztery odpowiedzi');
    assert.equal(new Set(texts).size, 4, 'odpowiedzi się nie powtarzają');
    assert.deepEqual(texts, item.options.map((option) => option.text));
    await expectText(page.locator('[data-testid=quiz-prompt]'), item.prompt.text);

    const hintButton = page.locator('[data-testid=quiz-hint-button]');
    if (item.termID === ids.profit) assert.equal(await hintButton.count(), 0, 'pojęcie bez definicji i przykładu nie ma podpowiedzi');
    if (item.termID === ids.assets) {
      // Podpowiedź: definicja i przykład w języku pytania, bez tłumaczenia.
      await hintButton.click();
      const hint = page.locator('[data-testid=quiz-hint]');
      await expectText(hint, 'Zasoby majątkowe firmy.');
      await expectText(hint, 'Aktywa spółki wzrosły.');
      assert.equal((await hint.textContent()).includes('Resources owned'), false);

      const { index } = await answerChoice(page, false);
      assert.equal(await quizFeedback(page).getAttribute('data-correct'), 'false');
      await expectText(quizFeedback(page), 'Źle');
      await expectText(quizFeedback(page), 'aktywa → assets');
      // Po odpowiedzi: definicja i przykład w obu językach.
      await expectText(quizFeedback(page), 'Resources owned by a company.');
      await expectText(quizFeedback(page), 'The assets of the company increased.');
      const options = page.locator('[data-testid=quiz-option]');
      assert.match(await options.nth(index).getAttribute('class'), /quiz-option--wrong/);
      assert.match(await options.nth(item.correctIndex).getAttribute('class'), /quiz-option--correct/);
      assert.equal(await options.nth(item.correctIndex).getAttribute('data-correct'), 'true');
      assert.equal(await options.first().isDisabled(), true, 'po odpowiedzi nie można zmienić wyboru');
    } else {
      await answerChoice(page, true);
      await expectText(quizFeedback(page), 'Dobrze');
    }
    await expectText(page.locator('[data-testid=quiz-next]'), number === 6 ? 'Zobacz wynik' : 'Dalej');
    await quizNext(page);
  }
  assert.equal(seen.size, 6, 'każde pojęcie pojawia się raz');

  const result = page.locator('[data-testid=quiz-result]');
  await result.waitFor();
  await expectText(page.locator('[data-testid=quiz-percent]'), '83%');
  await expectText(page.locator('[data-testid=quiz-verdict]'), 'Zaliczony');
  await expectText(page.locator('[data-testid=quiz-correct]'), '5');
  await expectText(page.locator('[data-testid=quiz-incorrect]'), '1');
  assert.equal(await page.locator('[data-testid=quiz-unanswered]').count(), 0);
  const wrong = page.locator('[data-testid=quiz-wrong-item]');
  assert.equal(await wrong.count(), 1);
  await expectText(wrong, 'aktywa → assets');
  await expectText(wrong, 'Twoja odpowiedź:');
  await expectText(page.locator('[data-testid=quiz-repeat-wrong]'), 'Powtórz błędne odpowiedzi (1)');

  // Odpowiedzi zapisane osobno; harmonogram powtórek fiszek (FSRS) bez zmian.
  const answers = await quizAnswers(page);
  assert.equal(answers.length, 6);
  assert.deepEqual(answers.filter((answer) => answer.usedHint).map((answer) => answer.termID), [ids.assets]);
  assert.equal(answers.filter((answer) => !answer.isCorrect).length, 1);
  assert.equal(await page.evaluate(() => window.lexicards.library.listProgress().length), 0);
  assert.equal(await page.evaluate(() => window.lexicards.library.adapter.count('reviews')), 0);

  await page.click('[data-testid=quiz-history-open]');
  const history = sheet(page).locator('[data-testid=quiz-history]');
  await waitUntil(async () => (await history.locator('[data-testid=quiz-history-entry]').count()) === 1, 'Historia powinna mieć jeden wpis');
  await expectText(history, '83%');
  await expectText(history, 'Zaliczony');
  await expectText(history, 'Jednokrotny wybór, 5 z 6 poprawnie');
  await sheet(page).getByRole('button', { name: 'Zamknij' }).click();

  await page.click('[data-testid=quiz-new]');
  await page.locator('[data-testid=quiz-start]').waitFor();
  assert.equal(await activeQuiz(page), null, 'wynik zamknięty');
  const recent = page.locator('.quiz-history [data-testid=quiz-history-entry]');
  await waitUntil(async () => (await recent.count()) === 1, 'Ostatnie wyniki na ekranie Quiz');
  await expectText(recent, '83%');
});

test('quiz: łączenie par – wybór w dowolnej kolejności, liczniki par i błędów, pomyłka obniża wynik', async ({ open }) => {
  const page = await open();
  await seedStudy(page);
  await openQuizSetup(page);
  await choose(page, 'Rodzaj quizu', 'Pary');
  await choose(page, 'Liczba par', 'Wszystkie');
  await expectText(quizPlanned(page), '6 par z 6 pojęć');
  await startQuiz(page);

  const quiz = await activeQuiz(page);
  assert.deepEqual(quiz.items.map((item) => [item.kind, item.pairs.length]), [['matching', 3], ['matching', 3]]);
  assert.equal(quiz.total, 6);
  const round = await currentQuizItem(page);
  assert.equal(await page.locator('[data-testid=match-left]').count(), 3);
  assert.equal(await page.locator('[data-testid=match-right]').count(), 3);
  const [a, b, c] = round.pairs;
  const rightText = (termID) => round.right.find((entry) => entry.termID === termID).text;

  // Błędna para: najpierw prawa kolumna, potem lewa.
  await matchTile(page, 'right', b).tap();
  assert.equal(await matchTile(page, 'right', b).getAttribute('aria-pressed'), 'true');
  await matchTile(page, 'left', a).tap();
  await expectText(page.locator('[data-testid=match-errors]'), '1');
  await expectText(page.locator('[data-testid=match-matched]'), '0');
  assert.equal(await page.locator('[data-testid=match-grid] [aria-pressed=true]').count(), 0, 'po próbie wybór znika');

  // Zmiana wyboru w tej samej kolumnie, potem poprawna para.
  await matchTile(page, 'left', a).tap();
  await matchTile(page, 'left', b).tap();
  assert.equal(await matchTile(page, 'left', a).getAttribute('aria-pressed'), 'false');
  assert.equal(await matchTile(page, 'left', b).getAttribute('aria-pressed'), 'true');
  await matchTile(page, 'right', b).tap();
  await expectText(page.locator('[data-testid=match-matched]'), '1');
  assert.equal(await matchTile(page, 'left', b).isDisabled(), true, 'połączona para jest zablokowana');
  assert.match(await matchTile(page, 'right', b).getAttribute('class'), /match-tile--done/);

  await matchTile(page, 'left', a).tap();
  await matchTile(page, 'right', a).tap();
  await matchTile(page, 'right', c).tap();
  await matchTile(page, 'left', c).tap();
  await quizFeedback(page).waitFor();
  await expectText(quizFeedback(page), 'Bez pomyłki: 2 z 3');
  await expectText(quizFeedback(page), 'Błędne połączenia w tej rundzie: 1');
  const pairs = page.locator('[data-testid=pair-list] li');
  assert.equal(await pairs.count(), 3);
  assert.equal(await pairs.locator('xpath=self::*[@data-correct="false"]').count(), 1);
  await expectText(pairs.filter({ has: page.locator('.pair-list__picked') }), `Twoje połączenie: ${rightText(b)}`);
  await quizNext(page);

  await expectText(quizCounter(page), '2 z 2');
  await solveRound(page);
  await expectText(quizFeedback(page), 'Wszystkie pary bez pomyłki');
  await expectText(page.locator('[data-testid=quiz-next]'), 'Zobacz wynik');
  await quizNext(page);
  await expectText(page.locator('[data-testid=quiz-percent]'), '83%');
  await expectText(page.locator('[data-testid=quiz-verdict]'), 'Zaliczony');

  const answers = await quizAnswers(page);
  assert.equal(answers.length, 6, 'każda para to osobna odpowiedź');
  assert.ok(answers.every((answer) => answer.questionType === 'matching'));
  assert.deepEqual(answers.filter((answer) => !answer.isCorrect).map((answer) => [answer.termID, answer.selectedAnswer]), [[a, rightText(b)]]);
});

test('quiz: test mieszany – proporcje wyboru i par, 8 par na szerokim ekranie, obsługa z klawiatury', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await openQuizSetup(page);
  await choose(page, 'Rodzaj quizu', 'Mieszany');
  await choose(page, 'Liczba pytań', '20');
  assert.equal(await page.locator('[data-testid=quiz-share]').inputValue(), '0.6');
  await startQuiz(page);
  const composition = (quiz) => ({
    choice: quiz.items.filter((item) => item.kind === 'choice').length,
    pairs: quiz.items.filter((item) => item.kind === 'matching').map((item) => item.pairs.length)
  });
  let quiz = await activeQuiz(page);
  assert.equal(quiz.total, 20);
  assert.deepEqual(composition(quiz), { choice: 12, pairs: [8] }, 'domyślnie 60% wyboru i 40% par');

  // Zakończenie bez odpowiedzi nie zapisuje wyniku.
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await confirm(page);
  await page.locator('[data-testid=quiz-start]').waitFor();
  assert.equal(await activeQuiz(page), null);

  await page.selectOption('[data-testid=quiz-share]', '0.4');
  await startQuiz(page);
  quiz = await activeQuiz(page);
  assert.deepEqual(composition(quiz), { choice: 8, pairs: [6, 6] }, '40% wyboru: 12 par w dwóch rundach');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await confirm(page);
  await page.locator('[data-testid=quiz-start]').waitFor();

  // Szeroki ekran: runda ma do 8 par.
  await choose(page, 'Rodzaj quizu', 'Pary');
  await choose(page, 'Liczba par', 'Wszystkie');
  await startQuiz(page);
  assert.equal(await page.locator('[data-testid=match-left]').count(), 8);
  assert.equal(await page.locator('[data-testid=match-right]').count(), 8);
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await confirm(page);
  await page.locator('[data-testid=quiz-start]').waitFor();

  // Klawiatura: 1–4 albo A–D wybiera odpowiedź, Enter przechodzi dalej.
  await choose(page, 'Rodzaj quizu', 'Wybór');
  await choose(page, 'Liczba pytań', '10');
  await startQuiz(page);
  const first = await currentQuizItem(page);
  await page.keyboard.press(String(first.correctIndex + 1));
  await quizFeedback(page).waitFor();
  assert.equal(await quizFeedback(page).getAttribute('data-correct'), 'true');
  await page.keyboard.press('Enter');
  await expectText(quizCounter(page), '2 z 10');
  const second = await currentQuizItem(page);
  await page.keyboard.press('abcd'[(second.correctIndex + 1) % second.options.length]);
  await quizFeedback(page).waitFor();
  assert.equal(await quizFeedback(page).getAttribute('data-correct'), 'false');
  await page.keyboard.press('Enter');
  await expectText(quizCounter(page), '3 z 10');
  const answers = new Map((await quizAnswers(page)).map((answer) => [answer.termID, answer.isCorrect]));
  assert.deepEqual([answers.size, answers.get(first.termID), answers.get(second.termID)], [2, true, false]);
}, { device: DESKTOP });

test('quiz: limit czasu – licznik odlicza, koniec czasu kończy quiz, brakujące odpowiedzi są błędne', async ({ open, context }) => {
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  await seedStudy(page);
  await openQuizSetup(page);
  await page.selectOption('[data-testid=quiz-time-limit]', '120');
  await startQuiz(page);
  const timer = page.locator('[data-testid=quiz-timer]');
  await expectText(timer, '2:00');
  await answerChoice(page, true);
  await quizNext(page);

  await page.clock.fastForward('01:40');
  await waitUntil(async () => /quiz-timer--low/.test(await timer.getAttribute('class')), 'Końcówka czasu powinna być wyróżniona');
  assert.match(await timer.textContent(), /0:[0-2]\d/);

  await page.clock.fastForward('00:30');
  await page.locator('[data-testid=quiz-result]').waitFor();
  await expectText(page.locator('.quiz-result__note'), 'Koniec czasu');
  await expectText(page.locator('[data-testid=quiz-percent]'), '17%');
  await expectText(page.locator('[data-testid=quiz-verdict]'), 'Niezaliczony');
  await expectText(page.locator('[data-testid=quiz-correct]'), '1');
  await expectText(page.locator('[data-testid=quiz-unanswered]'), '5');
  await expectText(page.locator('[data-testid=quiz-duration]'), '2:00');
  assert.equal(await page.locator('[data-testid=quiz-wrong-item]').count(), 5);
  await expectText(page.locator('[data-testid=quiz-wrong]'), 'Bez odpowiedzi');
  await expectText(page.locator('[data-testid=quiz-repeat-wrong]'), 'Powtórz błędne odpowiedzi (5)');

  const [record] = await page.evaluate(() => window.lexicards.library.quizHistory());
  assert.deepEqual([record.timedOut, record.finished, record.unanswered, record.duration], [true, false, 5, 120000]);
  assert.equal((await quizAnswers(page)).length, 1, 'pytania bez odpowiedzi nie trafiają do statystyk pojęć');
});

test('quiz: wznowienie po ponownym otwarciu strony i zakończenie niedokończonego quizu', async ({ open }) => {
  const page = await open();
  await seedStudy(page);
  await openQuizSetup(page);
  await startQuiz(page);
  await answerChoice(page, true);
  await quizNext(page);
  await answerChoice(page, false);
  await quizNext(page);

  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(quizCounter(page), '3 z 6');

  // Niedokończony quiz można wznowić ze Startu i z ekranu Quiz.
  await page.evaluate(() => { location.hash = '#/start'; });
  await expectText(page.locator('[data-testid=start-quiz-resume]'), 'Wznów quiz (pytanie 3 z 6)');
  await page.click('[data-testid=start-quiz-resume]');
  await expectText(quizCounter(page), '3 z 6');

  await openQuizSetup(page);
  await expectText(page.locator('[data-testid=quiz-resume]'), 'Wznów quiz (pytanie 3 z 6)');
  await page.click('[data-testid=quiz-resume]');
  await expectText(quizCounter(page), '3 z 6');

  await openQuizSetup(page);
  await page.click('[data-testid=quiz-discard]');
  await waitUntil(async () => (await page.locator('[data-testid=quiz-resume]').count()) === 0, 'Quiz powinien się zakończyć');
  assert.equal(await activeQuiz(page), null);
  const recent = page.locator('.quiz-history [data-testid=quiz-history-entry]');
  await waitUntil(async () => (await recent.count()) === 1, 'Przerwany quiz w historii');
  await expectText(recent, '17%');
  await expectText(recent, 'Niezaliczony – przerwany');
  await page.evaluate(() => { location.hash = '#/start'; });
  await page.locator('.tiles').waitFor();
  assert.equal(await page.locator('[data-testid=start-quiz-resume]').count(), 0);
});

test('quiz: „Powtórz błędne odpowiedzi”, zakres „Błędy z quizów” w nauce, wynik w szczegółach pojęcia; FSRS bez zmian', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openQuizSetup(page);
  await choose(page, 'Liczba pytań', 'Wszystkie');
  await startQuiz(page);
  for (let number = 1; number <= 6; number += 1) {
    const item = await currentQuizItem(page);
    await answerChoice(page, item.termID !== ids.assets && item.termID !== ids.profit);
    await quizNext(page);
  }
  await expectText(page.locator('[data-testid=quiz-percent]'), '67%');
  await page.click('[data-testid=quiz-repeat-wrong]');
  await expectText(quizCounter(page), '1 z 2');
  let quiz = await activeQuiz(page);
  assert.deepEqual(new Set(quiz.items.map((item) => item.termID)), new Set([ids.assets, ids.profit]));

  // Druga runda: aktywa dobrze, zysk znowu źle.
  for (let number = 1; number <= 2; number += 1) {
    const item = await currentQuizItem(page);
    await answerChoice(page, item.termID === ids.assets);
    await quizNext(page);
  }
  await expectText(page.locator('[data-testid=quiz-percent]'), '50%');
  await page.click('[data-testid=quiz-repeat-wrong]');
  await expectText(quizCounter(page), '1 z 1');
  quiz = await activeQuiz(page);
  assert.deepEqual(quiz.items.map((item) => [item.kind, item.termID]), [['choice', ids.profit]]);
  await answerChoice(page, false);
  await quizNext(page);
  await expectText(page.locator('[data-testid=quiz-percent]'), '0%');
  await page.click('[data-testid=quiz-done]');
  await page.locator('.tiles').waitFor();

  const history = await page.evaluate(() => window.lexicards.library.quizHistory());
  assert.deepEqual(history.map((record) => [record.percent, record.repeatOfWrong]), [[0, true], [50, true], [67, false]]);

  // Nauka: zakres „Błędy z quizów” – pojęcia, na które ostatnio odpowiedziano źle.
  await openStudySetup(page);
  const scopes = (await page.locator('[data-testid=study-scope] option').allTextContents()).map((text) => text.trim());
  assert.ok(scopes.includes('Błędy z quizów (1)'), scopes.join(', '));
  await page.selectOption('[data-testid=study-scope]', 'quizErrors');
  await choose(page, 'Liczba fiszek', 'Wszystkie');
  await startStudy(page);
  await expectText(page.locator('[data-testid=study-counter]'), '1 z 1');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'zysk');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();

  // Szczegóły pojęcia: wyniki quizów.
  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.basicsID);
  const profitRow = termRows(page).filter({ hasText: 'zysk' });
  await profitRow.locator('.term__toggle').click();
  await expectText(profitRow.locator('[data-testid=term-quiz]'), '0 z 3 poprawnie, ostatnio błędnie');
  const assetsRow = termRows(page).filter({ hasText: 'aktywa' });
  await assetsRow.locator('.term__toggle').click();
  await expectText(assetsRow.locator('[data-testid=term-quiz]'), '1 z 2 poprawnie, ostatnio poprawnie');

  // Quizy nie tworzą postępów nauki ani wpisów powtórek.
  assert.equal(await page.evaluate(() => window.lexicards.library.listProgress().length), 0);
  assert.equal(await page.evaluate(() => window.lexicards.library.adapter.count('reviews')), 0);
  assert.equal(await page.evaluate(() => window.lexicards.library.adapter.count('assessments')), 0);
});

test('quiz: wejście z lekcji i z menu biblioteki ustawia materiał, wybór jest zapamiętany', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.basicsID);
  await page.click('[data-testid=lesson-quiz]');
  await page.locator('[data-testid=quiz-start]').waitFor();
  assert.equal(await page.locator('[data-testid=quiz-domain]').inputValue(), ids.domainID);
  assert.equal(await page.locator('[data-testid=quiz-module]').inputValue(), ids.financeID);
  assert.equal(await page.locator('.group--compact .row', { hasText: 'Podstawy' }).locator('input').isChecked(), true);
  await expectText(quizPlanned(page), '3 pytania z 3 pojęć');
  await startQuiz(page);
  const quiz = await activeQuiz(page);
  assert.deepEqual(new Set(quiz.items.map((item) => item.termID)), new Set([ids.assets, ids.liabilities, ids.profit]));
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await confirm(page);
  await page.locator('[data-testid=quiz-start]').waitFor();

  // Ten sam materiał przy następnym otwarciu ekranu Quiz.
  await page.evaluate(() => { location.hash = '#/start'; });
  await page.locator('.tiles').waitFor();
  await openQuizSetup(page);
  await expectText(quizPlanned(page), '3 pytania z 3 pojęć');

  // Menu modułu w bibliotece.
  await page.evaluate((id) => { location.hash = `#/library/domain/${id}`; }, ids.domainID);
  await page.getByRole('button', { name: 'Więcej poleceń: Finanse' }).click();
  await menuItem(page, 'Quiz');
  await page.locator('[data-testid=quiz-start]').waitFor();
  assert.equal(await page.locator('[data-testid=quiz-module]').inputValue(), ids.financeID);
  await expectText(quizPlanned(page), '5 pytań z 5 pojęć');
});

test('quiz: wąski ekran 320 px i długie pojęcia – wybór, pary i wynik nie wystają poza ekran', async ({ open }) => {
  const page = await open();
  await page.evaluate(async () => {
    const { library } = window.lexicards;
    const lesson = await library.createLesson({ name: 'Metrologia' }, { create: { name: 'Pomiary' }, domain: { create: { name: 'Technika' } } });
    const terms = [
      ['współrzędnościowa maszyna pomiarowa z głowicą skanującą', 'coordinate measuring machine with a scanning probe head'],
      ['niepewność pomiaru rozszerzona', 'expanded measurement uncertainty'],
      ['wzorzec', 'gauge'],
      ['powtarzalność', 'repeatability'],
      ['Odchyłkapołożeniabezspacjiwbardzodługimsłowie', 'Positionaldeviationwithoutanyspacesinaverylongword'],
      ['chropowatość powierzchni', 'surface roughness']
    ];
    for (const [termPL, termEN] of terms) {
      await library.createTerm({ termPL, termEN, descriptionPL: 'Opis pojęcia z dziedziny metrologii. '.repeat(4), descriptionEN: 'A metrology term. '.repeat(4) }, lesson.id);
    }
  });
  const overflow = () => overflowX(page);
  await openQuizSetup(page);
  await choose(page, 'Rodzaj quizu', 'Mieszany');
  assert.ok((await overflow()) <= 0, `konfiguracja: treść wystaje o ${await overflow()} px`);
  await choose(page, 'Liczba pytań', 'Wszystkie');
  await page.selectOption('[data-testid=quiz-share]', '0.5');
  await startQuiz(page);
  for (;;) {
    const item = await currentQuizItem(page);
    if (!item) break;
    assert.ok((await overflow()) <= 0, `${item.kind}: treść wystaje o ${await overflow()} px`);
    if (item.kind === 'choice') {
      await answerChoice(page, false);
    } else {
      const tiles = await page.locator('[data-testid=match-grid] button').evaluateAll((buttons) => buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { left: box.left, right: box.right, height: box.height, inner: button.scrollWidth - button.clientWidth };
      }));
      assert.ok(tiles.every((box) => box.left >= 0 && box.right <= 320 && box.inner <= 0), 'kafelki par mieszczą się na ekranie');
      assert.ok(tiles.every((box) => box.height >= 44), 'kafelki par mają wygodną wysokość');
      await solveRound(page);
    }
    assert.ok((await overflow()) <= 0, `informacja zwrotna: treść wystaje o ${await overflow()} px`);
    await quizNext(page);
  }
  await page.locator('[data-testid=quiz-result]').waitFor();
  assert.ok((await overflow()) <= 0, `wynik: treść wystaje o ${await overflow()} px`);
}, { device: { ...PHONE, viewport: { width: 320, height: 568 } } });

// ---------------------------------------------------------------- statystyki

const statsValue = (page, testID) => page.locator(`[data-testid=${testID}]`);

async function openStats(page, hash = '#/stats') {
  await page.evaluate((target) => { location.hash = target; }, hash);
  await page.locator('[data-testid=stats]').waitFor();
}

/** Ocena trzech fiszek lekcji Podstawy (PL → EN): aktywa – Umiem, pasywa – tylko pojęcie, zysk – nic. */
async function studyBasics(page, ids) {
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);
  await assess(page, 'all', 'know');
  await assess(page, ['term'], 'repeat');
  await assess(page, [], 'repeat');
  await page.locator('[data-testid=study-summary]').waitFor();
  await page.click('[data-testid=summary-done]');
  await page.locator('.tiles').waitFor();
}

test('statystyki: wskaźniki, znajomość elementów, kierunki i przejście dziedzina → moduł → lekcja zgadzają się z ocenami', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await studyBasics(page, ids);
  await page.evaluate(() => window.lexicards.library.updateSettings({ statsDirection: 'pl_en' }));

  await openStats(page);
  await expectText(statsValue(page, 'stats-mastered-percent'), '17%');
  await expectText(statsValue(page, 'stats-mastered'), '1 z 6');
  const counts = {};
  for (const status of ['mastered', 'partiallyMastered', 'inProgress', 'toLearn', 'new']) {
    counts[status] = Number(await statsValue(page, `stats-status-${status}`).textContent());
  }
  assert.deepEqual(counts, { mastered: 1, partiallyMastered: 1, inProgress: 0, toLearn: 1, new: 3 });
  await expectText(statsValue(page, 'kpi-terms'), '6');
  await expectText(statsValue(page, 'kpi-due'), '0');
  await expectText(statsValue(page, 'kpi-quiz'), '–');
  await waitUntil(async () => /min/.test(await statsValue(page, 'kpi-time').textContent()), 'Czas nauki powinien się wczytać');

  // Znajomość elementów: ostatnia ocena; brakujący element nie wchodzi do mianownika.
  await expectText(statsValue(page, 'element-term-pl_en'), '67%');
  await expectText(statsValue(page, 'element-term-pl_en'), '2 z 3');
  await expectText(statsValue(page, 'element-description-pl_en'), '1 z 2');
  await expectText(statsValue(page, 'element-example-pl_en'), '1 z 1');

  // Powtórki dziennie: dzisiejsze trzy oceny w tabeli pod wykresem.
  const reviews = page.locator('[data-testid=chart-reviews]');
  await reviews.locator('svg').waitFor();
  await reviews.locator('summary').click();
  const rows = reviews.locator('tbody tr');
  assert.equal(await rows.count(), 1);
  assert.equal((await rows.first().locator('td').textContent()).trim(), '3');
  const progressTable = page.locator('[data-testid=chart-progress]');
  await progressTable.locator('summary').click();
  assert.deepEqual((await progressTable.locator('tbody tr').last().locator('td').allTextContents()).map((text) => text.trim()), ['1', '3']);
  await page.locator('[data-testid=chart-quiz-empty]').waitFor();

  // Drugi kierunek jeszcze nieoceniany; oba kierunki – słabszy wynik i opis sposobu liczenia.
  await choose(page, 'Kierunek', 'EN → PL');
  await expectText(statsValue(page, 'stats-mastered-percent'), '0%');
  await expectText(statsValue(page, 'stats-status-new'), '6');
  await expectText(statsValue(page, 'stats-elements'), 'W tym kierunku nic jeszcze nie oceniono.');
  await choose(page, 'Kierunek', 'Oba kierunki');
  await statsValue(page, 'stats-both-note').waitFor();
  await expectText(statsValue(page, 'stats-status-mastered'), '0');
  assert.equal(await page.locator('[data-testid^=element-term-]').count(), 2, 'elementy osobno dla każdego kierunku');
  assert.equal(await page.evaluate(() => window.lexicards.library.getSettings().statsDirection), 'both');

  // Zestawienie: moduły dziedziny, przejście do modułu i lekcji, powrót.
  await choose(page, 'Kierunek', 'PL → EN');
  await choose(page, 'Poziom zestawienia', 'Moduły');
  const breakdownRows = page.locator('[data-testid=breakdown-row]');
  await waitUntil(async () => (await breakdownRows.count()) === 2, 'Dwa moduły w zestawieniu');
  await expectText(breakdownRows.first(), 'Finanse');
  await expectText(breakdownRows.first(), '20%');
  await expectText(breakdownRows.nth(1), 'Prawo');
  await breakdownRows.first().locator('a').click();
  await waitUntil(() => page.evaluate(() => location.hash.startsWith('#/stats/module/')), 'Statystyki modułu');
  await expectText(title(page), 'Finanse');
  await expectText(page.locator('.screen__subtitle'), 'Statystyki modułu, Biznes');
  await expectText(statsValue(page, 'stats-mastered'), '1 z 5');
  await waitUntil(async () => (await breakdownRows.count()) === 2, 'Dwie lekcje modułu');
  await expectText(breakdownRows.first(), 'Podstawy');
  await expectText(breakdownRows.first(), '33%');
  await breakdownRows.first().locator('a').click();
  await waitUntil(() => page.evaluate(() => location.hash.startsWith('#/stats/lesson/')), 'Statystyki lekcji');
  await expectText(statsValue(page, 'stats-mastered'), '1 z 3');
  assert.equal(await page.locator('[data-testid=stats-breakdown]').count(), 0, 'lekcja nie ma zestawienia niżej');
  await page.locator('.navbar__backlink').click();
  await waitUntil(() => page.evaluate(() => location.hash.startsWith('#/stats/module/')), 'Powrót do modułu');

  // Wejście z menu Biblioteki.
  await page.evaluate((id) => { location.hash = `#/library/domain/${id}`; }, ids.domainID);
  await page.getByRole('button', { name: 'Więcej poleceń: Prawo' }).click();
  await menuItem(page, 'Statystyki');
  await page.locator('[data-testid=stats]').waitFor();
  await expectText(title(page), 'Prawo');
  await expectText(statsValue(page, 'stats-mastered'), '0 z 1');
});

test('statystyki: skuteczność quizów i czas nauki (fiszki i quizy), także na Starcie', async ({ open, context }) => {
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await page.evaluate(() => window.lexicards.library.updateSettings({ statsDirection: 'pl_en' }));

  // Dwie fiszki po 30 s.
  await openStudySetup(page, `#/study/lesson/${ids.advancedID}`);
  await startStudy(page);
  for (let card = 0; card < 2; card += 1) {
    await page.clock.fastForward('00:30');
    await assess(page, 'all', 'know');
  }
  await page.click('[data-testid=summary-done]');
  await page.locator('.tiles').waitFor();

  // Quiz z lekcji Podstawy: trzy pytania po 20 s, jedno błędne.
  await openQuizSetup(page, `#/quiz/lesson/${ids.basicsID}`);
  await startQuiz(page);
  for (let number = 1; number <= 3; number += 1) {
    await page.clock.fastForward('00:20');
    await answerChoice(page, number !== 2);
    await quizNext(page);
  }
  await page.click('[data-testid=quiz-done]');
  await page.locator('.tiles').waitFor();

  await expectText(page.locator('[data-testid=start-kpi-quiz]'), '67%');
  await expectText(page.locator('[data-testid=start-kpi-time]'), '2 min');
  await page.click('[data-testid=start-stats]');
  await page.locator('[data-testid=stats]').waitFor();
  await expectText(statsValue(page, 'kpi-quiz'), '67%');
  await expectText(page.locator('.kpi', { has: statsValue(page, 'kpi-quiz') }), '2 z 3 odpowiedzi poprawnie');
  await expectText(statsValue(page, 'kpi-time'), '2 min');
  await expectText(page.locator('.kpi', { has: statsValue(page, 'kpi-time') }), 'ostatnie 7 dni: 2 min');

  const quiz = page.locator('[data-testid=chart-quiz]');
  await quiz.locator('svg').waitFor();
  await quiz.locator('summary').click();
  assert.equal((await quiz.locator('tbody td').first().textContent()).trim(), '67%');
  // Zapisany czas fiszek (30 s) i odpowiedzi (20 s).
  const stored = await page.evaluate(async () => {
    const journals = await window.lexicards.library.journals();
    return { cards: journals.assessments.map((item) => item.duration), answers: journals.quizAnswers.map((item) => item.responseTime) };
  });
  // Zegar testu płynie też sam (obrót i animacje trwają ułamki sekundy), stąd tolerancja.
  assert.ok(stored.cards.length === 2 && stored.cards.every((value) => value >= 30000 && value < 33000), stored.cards.join(', '));
  assert.ok(stored.answers.length === 3 && stored.answers.every((value) => value >= 20000 && value < 23000), stored.answers.join(', '));
});

test('statystyki: wykres – podpowiedź z klawiatury i zakres dni; historia z kilku dni', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  // Oceny z trzech ostatnich dni (zapisane bezpośrednio z podaną chwilą).
  await page.evaluate(async ({ assets, liabilities, profit }) => {
    const { library } = window.lexicards;
    const day = (offset) => { const date = new Date(); date.setDate(date.getDate() - offset); date.setHours(9, 0, 0, 0); return date.getTime(); };
    const assess = async (termID, decision, now) => {
      await library.startStudy({ direction: 'pl_en', scope: 'all', count: 0, shuffle: false, front: 'term' }, [{ termID, direction: 'pl_en' }]);
      await library.recordStudyDecision({ tiles: {}, decision, now, duration: 10000 });
    };
    await assess(assets, 'repeat', day(10));
    await assess(assets, 'know', day(2));
    await assess(liabilities, 'know', day(1));
    await assess(profit, 'repeat', day(1));
    await library.finishStudy();
    await library.updateSettings({ statsDirection: 'pl_en', statsRange: 7 });
  }, ids);
  await openStats(page);
  const chart = page.locator('[data-testid=chart-progress]');
  await chart.locator('svg').waitFor();
  assert.equal(await page.getByRole('radiogroup', { name: 'Okres' }).getByRole('radio', { name: '7 dni' }).isChecked(), true);

  // Klawiatura: End – dzisiejszy dzień, strzałka w lewo – wczoraj.
  const plot = chart.locator('.chart__plot');
  await plot.focus();
  await page.keyboard.press('End');
  const tooltip = chart.locator('.chart__tooltip');
  await expectText(tooltip, 'Opanowane');
  assert.match(await tooltip.textContent(), /2Opanowane3Ocenione/);
  await page.keyboard.press('ArrowLeft');
  assert.match(await tooltip.textContent(), /2Opanowane3Ocenione/);
  await page.keyboard.press('ArrowLeft');
  assert.match(await tooltip.textContent(), /1Opanowane1Ocenione/, 'przedwczoraj: aktywa opanowane');
  await page.keyboard.press('Escape');
  assert.equal(await tooltip.isHidden(), true);

  // Tabela: tydzień zaczyna się od oceny sprzed 10 dni (aktywa „Do nauki”), więc „Ocenione” = 1 od początku.
  await chart.locator('summary').click();
  const rows = chart.locator('tbody tr');
  assert.equal(await rows.count(), 7, 'siedem dni z jakąkolwiek wartością');
  await choose(page, 'Okres', '30 dni');
  await waitUntil(async () => (await chart.locator('tbody tr').count()) === 11, 'Zakres 30 dni: od dnia pierwszej oceny');
  const reviewRows = page.locator('[data-testid=chart-reviews] tbody tr');
  assert.equal(await reviewRows.count(), 3);
}, { device: DESKTOP });

test('statystyki: wąski ekran 320 px, ciemny motyw i pusta biblioteka', async ({ open }) => {
  const page = await open();
  await page.evaluate(() => { location.hash = '#/stats'; });
  await expectText(page.locator('.empty__title'), 'Statystyki pojawią się po pierwszej nauce');
  const ids = await seedStudy(page);
  await studyBasics(page, ids);
  assert.ok((await overflowX(page)) <= 0, `Start: treść wystaje o ${await overflowX(page)} px`);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  for (const direction of ['PL → EN', 'Oba kierunki']) {
    await openStats(page);
    await choose(page, 'Kierunek', direction);
    await page.locator('[data-testid=chart-reviews] svg').waitFor();
    if (direction === 'Oba kierunki') await expectText(page.locator('[data-testid=chart-progress-empty]'), 'w obu kierunkach');
    assert.ok((await overflowX(page)) <= 0, `${direction}: treść wystaje o ${await overflowX(page)} px`);
  }
  await openStats(page, `#/stats/lesson/${ids.basicsID}`);
  assert.ok((await overflowX(page)) <= 0, `lekcja: treść wystaje o ${await overflowX(page)} px`);
}, { device: { ...PHONE, viewport: { width: 320, height: 568 } } });

// ---------------------------------------------------------------- słuchanie

/** Atrapa syntezatora: zapisuje wypowiedzi (tekst, język, chwila) i kończy każdą po 200 ms. */
async function fakeSpeechForListening(context) {
  await context.addInitScript(() => {
    const spoken = [];
    let timer = null;
    let current = null;
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        speaking: false,
        pending: false,
        speak(utterance) {
          spoken.push({ text: utterance.text, lang: utterance.lang, at: Date.now() });
          current = utterance;
          timer = setTimeout(() => {
            utterance.onstart?.({});
            timer = setTimeout(() => { current = null; utterance.onend?.(); }, 200);
          }, 0);
        },
        cancel() {
          clearTimeout(timer);
          const utterance = current;
          current = null;
          utterance?.onerror?.({ error: 'interrupted' });
        },
        addEventListener() {},
        removeEventListener() {}
      }
    });
    window.spokenTexts = spoken;
    window.wakeLockRequests = 0;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => { window.wakeLockRequests += 1; return { release: async () => {}, addEventListener() {} }; } }
    });
  });
}

const spokenTexts = (page) => page.evaluate(() => window.spokenTexts.map(({ text, lang, at }) => ({ text, lang, at })));

async function openListening(page, ids) {
  await page.evaluate((selection) => window.lexicards.library.updateSettings({ listenSelection: selection }),
    { domainID: ids.domainID, moduleID: ids.financeID, lessonIDs: [ids.basicsID] });
  await openStudySetup(page);
  await page.click('[data-testid=study-listen]');
  await page.locator('[data-testid=listen-start]').waitFor();
}

test('słuchanie: pojęcie, czas na zastanowienie, odpowiedź, definicja i przykład; koniec; powtórki bez zmian', async ({ open, context }) => {
  await fakeSpeechForListening(context);
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await openListening(page, ids);

  // Domyślnie: kierunek mieszany, definicja i przykład po angielsku.
  assert.equal(await page.getByRole('radiogroup', { name: 'Kierunek słuchania' }).getByRole('radio', { name: 'Mieszany', exact: true }).isChecked(), true);
  assert.equal(await page.locator('[data-testid=listen-description]').isChecked(), true);
  assert.equal(await page.locator('[data-testid=listen-example]').isChecked(), true);
  assert.equal(await page.getByRole('radiogroup', { name: 'Język definicji i przykładu' }).getByRole('radio', { name: 'Po angielsku' }).isChecked(), true);
  await choose(page, 'Kierunek słuchania', 'PL → EN');
  await choose(page, 'Liczba pojęć', 'Wszystkie');
  await choose(page, 'Czas na zastanowienie', '3 s');
  await expectText(page.locator('[data-testid=listen-planned]'), '3 pojęcia, ok. 1 min');

  await page.click('[data-testid=listen-start]');
  await page.locator('[data-testid=listen-player]').waitFor();
  await waitUntil(async () => {
    await page.clock.runFor(500);
    return page.locator('[data-testid=listen-done]').count();
  }, 'Słuchanie powinno dojść do końca', 20000);
  await expectText(page.locator('[data-testid=listen-summary]'), 'Odsłuchane pojęcia: 3 z 3.');

  const spoken = await spokenTexts(page);
  assert.deepEqual(spoken[0], { ...spoken[0], text: 'Zaczynamy. 3 pojęcia.', lang: 'pl-PL' });
  assert.deepEqual(spoken.at(-1), { ...spoken.at(-1), text: 'Koniec. Odsłuchano 3 pojęcia.', lang: 'pl-PL' });
  const after = (text) => {
    const index = spoken.findIndex((item) => item.text === text);
    assert.ok(index > 0, `brak wypowiedzi „${text}”`);
    return spoken.slice(index);
  };
  const assets = after('aktywa');
  assert.deepEqual(assets.slice(0, 4).map(({ text, lang }) => `${lang} ${text}`), [
    'pl-PL aktywa', 'en-US assets', 'en-US Resources owned by a company.', 'en-US The assets of the company increased.'
  ]);
  assert.ok(assets[1].at - assets[0].at >= 3200, `czas na zastanowienie: ${assets[1].at - assets[0].at} ms`);
  // Bez angielskiej definicji – polska; bez przykładu – nic.
  assert.deepEqual(after('pasywa').slice(0, 3).map(({ text, lang }) => `${lang} ${text}`), [
    'pl-PL pasywa', 'en-US liabilities', 'pl-PL Źródła finansowania majątku.'
  ]);
  assert.deepEqual(after('zysk').slice(0, 2).map(({ text, lang }) => `${lang} ${text}`), ['pl-PL zysk', 'en-US profit']);
  assert.equal(spoken.length, 1 + 4 + 3 + 2 + 1);

  assert.ok(await page.evaluate(() => window.wakeLockRequests) >= 1, 'prośba o niewygaszanie ekranu');
  assert.equal(await page.evaluate(() => window.lexicards.library.listProgress().length), 0);
  assert.equal(await page.evaluate(() => window.lexicards.library.adapter.count('assessments')), 0);
  const settings = await page.evaluate(() => window.lexicards.library.getSettings());
  assert.deepEqual([settings.listenDirection, settings.listenPause, settings.listenCount], ['pl_en', 3, 0]);
});

test('słuchanie: pauza, wznowienie, dalej, powtórz i sprawdzenie czytania przy wyłączonym ekranie', async ({ open, context }) => {
  await fakeSpeechForListening(context);
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await page.evaluate(() => window.lexicards.library.updateSettings({ listenDirection: 'pl_en', listenCount: 0, listenPause: 8 }));
  await openListening(page, ids);
  await expectText(page.locator('[data-testid=listen-background-note]'), 'Jeszcze nie sprawdzone');
  await page.click('[data-testid=listen-start]');
  const player = page.locator('[data-testid=listen-player]');
  await waitUntil(async () => {
    await page.clock.runFor(100);
    return (await player.getAttribute('data-step')) === 'think';
  }, 'Po pojęciu – czas na zastanowienie');
  await expectText(page.locator('[data-testid=listen-wake]'), 'Ekran nie zgaśnie');

  // Pauza: nic nie jest czytane; wznowienie – czas na zastanowienie od nowa.
  await page.click('[data-testid=listen-toggle]');
  assert.equal(await player.getAttribute('data-phase'), 'paused');
  const before = (await spokenTexts(page)).length;
  await page.clock.runFor(20000);
  assert.equal((await spokenTexts(page)).length, before, 'w pauzie cisza');
  await page.click('[data-testid=listen-toggle]');
  assert.equal(await player.getAttribute('data-phase'), 'playing');
  await page.clock.runFor(7000);
  assert.equal((await spokenTexts(page)).length, before, 'pełne 8 s na zastanowienie po wznowieniu');
  await page.clock.runFor(1500);
  assert.equal((await spokenTexts(page)).length, before + 1, 'potem odpowiedź');

  // Dalej: następne pojęcie od razu; powtórz – to samo jeszcze raz.
  await page.click('[data-testid=listen-next]');
  await page.clock.runFor(400);
  const next = (await spokenTexts(page)).at(-1);
  assert.equal(next.lang, 'pl-PL');
  await page.click('[data-testid=listen-repeat]');
  await page.clock.runFor(400);
  assert.equal((await spokenTexts(page)).at(-1).text, next.text);

  // Ekran wyłączony na 10 s (strona w tle), czytanie trwa – wynik zapamiętany.
  const setVisibility = (state) => page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new window.Event('visibilitychange'));
  }, state);
  await setVisibility('hidden');
  await page.clock.runFor(10000);
  await setVisibility('visible');
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().listenBackground?.result === 'continues'), 'Wynik sprawdzenia powinien się zapisać');
  await expectText(page.locator('.toast').last(), 'Czytanie trwało');

  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=listen-start]').waitFor();
  await expectText(page.locator('[data-testid=listen-background-note]'), 'czytanie trwa także przy wyłączonym ekranie');
});

test('słuchanie: wąski ekran 320 px – ustawienia i odtwarzacz mieszczą się, przyciski są duże', async ({ open, context }) => {
  await fakeSpeechForListening(context);
  const page = await open();
  await page.evaluate(async () => {
    const { library } = window.lexicards;
    const lesson = await library.createLesson({ name: 'Metrologia' }, { create: { name: 'Pomiary' }, domain: { create: { name: 'Technika' } } });
    await library.createTerm({
      termPL: 'współrzędnościowa maszyna pomiarowa z głowicą skanującą',
      termEN: 'coordinate measuring machine with a scanning probe head',
      descriptionEN: 'A device for determining dimensions and geometric deviations of workpieces. '.repeat(3)
    }, lesson.id);
    await library.createTerm({ termPL: 'wzorzec', termEN: 'gauge' }, lesson.id);
  });
  await openStudySetup(page);
  await page.click('[data-testid=study-listen]');
  await page.locator('[data-testid=listen-start]').waitFor();
  assert.ok((await overflowX(page)) <= 0, `ustawienia: treść wystaje o ${await overflowX(page)} px`);
  await page.click('[data-testid=listen-start]');
  await page.locator('[data-testid=listen-player]').waitFor();
  assert.ok((await overflowX(page)) <= 0, `odtwarzacz: treść wystaje o ${await overflowX(page)} px`);
  for (const id of ['listen-previous', 'listen-toggle', 'listen-next', 'listen-repeat']) {
    const box = await page.locator(`[data-testid=${id}]`).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.y + box.height <= 568, `${id} mieści się na ekranie`);
    assert.ok(box.height >= 44 && box.width >= 44, `${id} jest duży (${box.width}×${box.height})`);
  }
}, { device: { ...PHONE, viewport: { width: 320, height: 568 } } });

/**
 * Atrapa syntezatora z kolejką jak w Safari: wypowiedzi czekają jedna za drugą, a wypowiedź
 * głosem z listy `hanging` nie zaczyna się i nie kończy – blokuje kolejkę do wywołania cancel().
 * `window.heard` – to, co faktycznie zabrzmiało.
 */
async function fakeQueuedSpeech(context, hanging = []) {
  await context.addInitScript((hangingURIs) => {
    const voices = [
      { voiceURI: 'pl-zosia', name: 'Zosia', lang: 'pl-PL', default: true, localService: true },
      { voiceURI: 'com.apple.speech.synthesis.voice.Albert', name: 'Albert', lang: 'en-US', default: false, localService: true },
      { voiceURI: 'en-bells', name: 'Bells', lang: 'en-US', default: false, localService: true },
      { voiceURI: 'en-daniel', name: 'Daniel', lang: 'en-GB', default: false, localService: true },
      { voiceURI: 'en-samantha', name: 'Samantha', lang: 'en-US', default: false, localService: true }
    ];
    const heard = [];
    const queue = [];
    let current = null;
    let timer = null;
    const next = () => {
      current = queue.shift() ?? null;
      const utterance = current;
      if (!utterance || hangingURIs.includes(utterance.voice?.voiceURI)) return;
      timer = setTimeout(() => {
        heard.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.voiceURI ?? null, at: Date.now() });
        utterance.onstart?.({ type: 'start' });
        timer = setTimeout(() => {
          current = null;
          utterance.onend?.({ type: 'end' });
          next();
        }, 200);
      }, 20);
    };
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        get speaking() { return current !== null; },
        get pending() { return queue.length > 0; },
        paused: false,
        speak(utterance) {
          queue.push(utterance);
          if (!current) next();
        },
        cancel() {
          clearTimeout(timer);
          const stopped = [current, ...queue].filter((item) => item && !hangingURIs.includes(item.voice?.voiceURI));
          current = null;
          queue.length = 0;
          for (const utterance of stopped) utterance.onerror?.({ error: 'interrupted' });
        },
        resume() {},
        addEventListener() {},
        removeEventListener() {}
      }
    });
    window.heard = heard;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ release: async () => {}, addEventListener() {} }) }
    });
  }, hanging);
}

test('słuchanie: wybrany głos, który się nie odzywa, nie wycisza reszty – czyta głos zastępczy', async ({ open, context }) => {
  await fakeQueuedSpeech(context, ['en-daniel']);
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await page.evaluate(() => window.lexicards.library.updateSettings({
    preferredVoicePL: 'pl-zosia', preferredVoiceEN: 'en-daniel',
    listenDirection: 'pl_en', listenCount: 0, listenPause: 3, listenDescription: false, listenExample: false
  }));
  await openListening(page, ids);
  await page.click('[data-testid=listen-start]');
  await page.locator('[data-testid=listen-player]').waitFor();
  await waitUntil(async () => {
    await page.clock.runFor(500);
    return page.locator('[data-testid=listen-done]').count();
  }, 'Słuchanie powinno dojść do końca', 30000);
  const heard = await page.evaluate(() => window.heard.map(({ text, voice }) => `${voice} ${text}`));
  // Wszystko słychać: polskie pojęcia głosem Zosia, angielskie odpowiedzi głosem zastępczym.
  assert.deepEqual(heard, [
    'pl-zosia Zaczynamy. 3 pojęcia.',
    ...heard.slice(1, 7),
    'pl-zosia Koniec. Odsłuchano 3 pojęcia.'
  ]);
  const pairs = heard.slice(1, 7);
  for (const [polish, english] of [['aktywa', 'assets'], ['pasywa', 'liabilities'], ['zysk', 'profit']]) {
    const index = pairs.indexOf(`pl-zosia ${polish}`);
    assert.ok(index >= 0, `brak „${polish}”: ${heard.join(' | ')}`);
    assert.equal(pairs[index + 1], `en-samantha ${english}`);
  }
  // Po dwóch nieudanych startach aplikacja mówi, który głos nie działa.
  await expectText(page.locator('[data-testid=listen-voice-note]'), 'Głos angielski „Daniel” nie odzywa się – czyta głos zastępczy. Inny głos wybierzesz w Ustawieniach.');

  // Ustawienia: ta sama uwaga przy wyborze głosu i sprawdzenie wymowy krok po kroku.
  await page.evaluate(() => { location.hash = '#/settings'; });
  await expectText(page.locator('[data-testid=voice-en-silent]'), 'Głos „Daniel” nie odzywa się w tej przeglądarce – zamiast niego czyta głos zastępczy. Wybierz inny głos.');
  assert.equal(await page.locator('[data-testid=voice-pl-silent]').count(), 0);
  await page.click('[data-testid=speech-check]');
  await expectText(page.locator('[data-testid=speech-check]'), 'Sprawdzam…');
  await waitUntil(async () => {
    await page.clock.runFor(250);
    return page.locator('[data-testid=speech-check-summary]').count();
  }, 'Sprawdzenie wymowy powinno się zakończyć', 20000);
  assert.deepEqual(await page.locator('[data-testid=speech-check-result]').allTextContents(), [
    'Głos polski: działa („Zosia”).',
    'Głos angielski: „Daniel” nie odezwał się – przeczytał zastępczy „Samantha”.',
    'Głos polski: działa („Zosia”).'
  ]);
  assert.deepEqual(await page.locator('[data-testid=speech-check-result]').evaluateAll((items) => items.map((item) => item.dataset.ok)), ['true', 'false', 'true']);
  await expectText(page.locator('[data-testid=speech-check-summary]'), 'Aplikacja sama przełącza się na głos zastępczy, ale lepiej wybrać inny głos w polu powyżej.');
  await expectText(page.locator('[data-testid=speech-check]'), 'Sprawdź wymowę');
  assert.equal(await page.locator('[data-testid=voice-en-silent]').count(), 1, 'uwaga przy głosie zostaje po sprawdzeniu');
  // Wybór innego głosu: próbka zabrzmi od razu, uwaga znika.
  await page.selectOption('[data-testid=voice-en]', 'en-samantha');
  await waitUntil(async () => {
    await page.clock.runFor(100);
    return (await page.evaluate(() => window.heard.at(-1)?.text)) === 'Hello, this is a voice sample.';
  }, 'Po wyborze głosu powinna zabrzmieć próbka');
  assert.equal(await page.locator('[data-testid=voice-en-silent]').count(), 0);
}, { device: PHONE });

test('ustawienia: sprawdzenie wymowy, gdy wszystko działa', async ({ open, context }) => {
  await fakeQueuedSpeech(context);
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.click('[data-testid=speech-check]');
  await waitUntil(async () => {
    await page.clock.runFor(250);
    return page.locator('[data-testid=speech-check-summary]').count();
  }, 'Sprawdzenie wymowy powinno się zakończyć');
  assert.deepEqual(await page.locator('[data-testid=speech-check-result]').allTextContents(), [
    'Głos polski: działa („domyślny głos systemu”).',
    'Głos angielski: działa („domyślny głos systemu”).',
    'Głos polski: działa („domyślny głos systemu”).'
  ]);
  await expectText(page.locator('[data-testid=speech-check-summary]'), 'Oba głosy działają, także po zmianie języka.');
  // Przerwa między krokami jak w słuchaniu; pierwszy krok pada od razu po dotknięciu.
  const heard = await page.evaluate(() => window.heard.map(({ text, lang }) => `${lang} ${text}`));
  assert.deepEqual(heard, ['pl-PL Sprawdzam polski głos.', 'en-US Now the English voice.', 'pl-PL I znowu po polsku.']);
});

test('iPhone: dotknięcie pola formularza nie powiększa strony (czcionka pól ≥ 16 px, maximum-scale)', async ({ open }) => {
  const page = await open();
  // Na iPhonie widok dostaje maximum-scale=1 – Safari nie powiększa strony przy polach formularza.
  assert.match(await page.locator('meta[name=viewport]').getAttribute('content'), /maximum-scale=1/);

  await loadSamples(page);
  // Mniejszy rozmiar tekstu w systemie (Dynamic Type): treść 14 px, pola nadal 16 px.
  await page.evaluate(() => { document.documentElement.style.fontSize = '14px'; });
  await page.click('[data-testid=start-add-term]');
  await sheet(page).waitFor();
  const sizes = await sheet(page).locator('input.input, textarea.input, select.input')
    .evaluateAll((fields) => fields.map((field) => parseFloat(getComputedStyle(field).fontSize)));
  assert.ok(sizes.length >= 6, `pól: ${sizes.length}`);
  assert.ok(sizes.every((size) => size >= 16), `rozmiary pól: ${sizes.join(', ')}`);
  // Pola opisów i przykładów nie podpowiadają danych kontaktowych.
  const autocomplete = await sheet(page).locator('textarea').evaluateAll((fields) => fields.map((field) => field.getAttribute('autocomplete')));
  assert.ok(autocomplete.every((value) => value === 'off'));
}, { device: { ...PHONE, userAgent: IPHONE_UA } });

test('poza iPhone\'em znacznik widoku pozwala swobodnie powiększać', async ({ open }) => {
  const page = await open();
  assert.doesNotMatch(await page.locator('meta[name=viewport]').getAttribute('content'), /maximum-scale/);
  // Przy domyślnym rozmiarze tekstu pola mają rozmiar treści, nie mniej.
  await page.click('[data-testid=start-add-domain]');
  const size = await sheet(page).locator('input.input').first().evaluate((field) => parseFloat(getComputedStyle(field).fontSize));
  const body = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  assert.equal(size, Math.max(16, body));
});

test('zmiana w jednej karcie pojawia się w drugiej', async ({ open }) => {
  const first = await open();
  const second = await open();
  await loadSamples(first);
  await expectText(second.locator('.screen__subtitle'), 'Masz 40 pojęć w 13 lekcjach.');
});

test('bez internetu: aplikacja otwiera się z pamięci przeglądarki, dane są na miejscu', async ({ open, context }) => {
  const page = await open();
  await loadSamples(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await waitUntil(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'Tryb offline powinien się włączyć');

  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(page.locator('.screen__subtitle'), 'Masz 40 pojęć w 13 lekcjach.');

  // Bezpośrednie wejście na adres wewnątrz aplikacji też działa bez sieci.
  await page.goto(`${page.url().split('#')[0]}#/library/glossary`);
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(page.locator('[data-testid=glossary-count]'), '40 pojęć');
  await context.setOffline(false);
});

test('aktualizacja: po zmianie plików przeglądarka pobiera nowe wydanie', async ({ open, browser, track }) => {
  // Osobna kopia aplikacji, którą można zmienić w trakcie testu.
  const copy = await mkdtemp(path.join(tmpdir(), 'lexicards-update-'));
  for (const name of ['index.html', 'manifest.webmanifest', 'sw.js', 'package.json', 'css', 'js', 'icons', 'tools']) {
    await cp(path.join(ROOT, name), path.join(copy, name), { recursive: true });
  }
  const server = await startServer({ port: 0, base: '/LexiCards/', root: copy });
  const context = await browser.newContext({ ...PHONE, locale: 'pl-PL' });
  try {
    const page = await context.newPage();
    track(page);
    await page.goto(server.url);
    await page.waitForSelector('#app[data-ready="true"]');
    await loadSamples(page);
    const firstBuild = await page.evaluate(() => window.lexicards.build);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await waitUntil(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'Tryb offline powinien się włączyć');

    // „Nowe wydanie”: zmiana jednego pliku i ponowne wygenerowanie listy plików.
    const css = path.join(copy, 'css/app.css');
    await writeFile(css, `${await readFile(css, 'utf8')}\n/* znacznik-nowego-wydania */\n`);
    await run(process.execPath, [path.join(copy, 'tools/build.mjs')]);

    // Pierwsze otwarcie po wydaniu działa jeszcze na starych plikach i pobiera nowe w tle.
    await page.reload();
    await page.waitForSelector('#app[data-ready="true"]');
    await expectText(page.locator('.toast').last(), 'Pobrano nową wersję aplikacji');

    // Przycisk w komunikacie uruchamia nowe wydanie; dane zostają.
    await Promise.all([page.waitForEvent('load'), page.locator('.toast__button').click()]);
    await page.waitForSelector('#app[data-ready="true"]');
    const secondBuild = await page.evaluate(() => window.lexicards.build);
    assert.notEqual(secondBuild, firstBuild);
    const served = await page.evaluate(() => fetch('css/app.css').then((response) => response.text()));
    assert.ok(served.includes('znacznik-nowego-wydania'), 'arkusz stylów pochodzi z nowego wydania');
    assert.equal((await summary(page)).terms, 40);
    const caches = await page.evaluate(() => window.caches.keys());
    assert.deepEqual(caches, [`lexicards-${secondBuild}`], 'stara pamięć podręczna została usunięta');
  } finally {
    await context.close();
    await server.close();
    await rm(copy, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- uruchomienie

async function main() {
  const { chromium } = await loadPlaywright();
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(OUTPUT, { recursive: true });

  const filter = process.argv[2] ?? '';
  const server = await startServer({ port: 0, base: '/LexiCards/' });
  const browser = await chromium.launch();
  let failed = 0;
  let passed = 0;

  for (const { name, body, options } of tests) {
    if (filter && !name.includes(filter)) continue;
    const context = await browser.newContext({ ...(options.device ?? PHONE), locale: 'pl-PL', acceptDownloads: true });
    const problems = [];
    const track = (page) => {
      page.on('pageerror', (error) => problems.push(`błąd strony: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' && !options.allowConsoleErrors) problems.push(`konsola: ${message.text()}`);
      });
    };
    const open = async (hash = '') => {
      const page = await context.newPage();
      track(page);
      await page.goto(server.url + hash);
      await page.waitForSelector('#app[data-ready="true"]');
      return page;
    };
    const started = Date.now();
    try {
      await body({ open, context, browser, track });
      assert.deepEqual(problems, [], 'Strona zgłosiła błędy');
      passed += 1;
      console.log(`ok   ${name} (${Date.now() - started} ms)`);
    } catch (error) {
      failed += 1;
      console.log(`BŁĄD ${name}`);
      console.log(String(error.stack ?? error).split('\n').map((line) => `     ${line}`).join('\n'));
      const page = context.pages().at(-1);
      if (page) {
        const shot = path.join(OUTPUT, `${name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}.png`);
        await page.screenshot({ path: shot }).catch(() => {});
        console.log(`     zrzut ekranu: ${path.relative(ROOT, shot)}`);
      }
    } finally {
      await context.close();
    }
  }

  await browser.close();
  await server.close();
  console.log(`\ntestów: ${passed + failed}, zaliczonych: ${passed}, niezaliczonych: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

await main();
