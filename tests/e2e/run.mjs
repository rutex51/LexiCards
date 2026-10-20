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
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { decodeText, parseCsv } from '../../js/core/csv.js';
import { openWorkbook } from '../../js/core/xlsx.js';
import { readZipDirectory } from '../../js/core/zip.js';
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
const IPAD = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true };

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

/** Czeka, aż pole ma wartość `expected` (od 1.19 – wielkość szablonu jest polem). */
async function expectValue(locator, expected, message = '') {
  let value = '';
  await waitUntil(async () => {
    value = await locator.first().inputValue();
    return value === expected;
  }, `${message || 'Oczekiwano wartości'} „${expected}”`).catch((error) => {
    throw new Error(`${error.message}; jest: „${value}”`);
  });
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
/** Opis pod grupą „Kopia zapasowa i przeniesienie” w ustawieniach. */
const backupFooter = (page) => page.locator('.group__footer').filter({ hasText: 'Przeniesienie to dwa pliki' });
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
  await expectText(page.locator('.alert__message'), 'Przez minutę po usunięciu możesz to cofnąć przyciskiem „Cofnij”.');

  // Anulowanie niczego nie usuwa.
  await page.locator('dialog.alert[open]').getByRole('button', { name: 'Anuluj' }).click();
  assert.equal((await summary(page)).terms, 40);

  await page.getByRole('button', { name: 'Więcej poleceń: Metrology' }).click();
  await menuItem(page, 'Usuń');
  await confirm(page);
  await waitUntil(async () => (await summary(page)).terms === 22, 'Po usunięciu powinny zostać 22 pojęcia');
  assert.deepEqual(await summary(page), { domains: 1, modules: 3, lessons: 8, terms: 22, favorites: 0 });
  await waitUntil(async () => (await page.getByRole('link', { name: /Metrology/ }).count()) === 0, 'Dziedzina powinna zniknąć z listy');

  // „Cofnij” w komunikacie (bez okna) przywraca dziedzinę ze wszystkim.
  const undo = page.locator('[data-testid=undo-toast]');
  await expectText(undo, 'Usunięto dziedzinę „Metrology”.');
  assert.equal(await page.locator('dialog[open]').count(), 0, 'bez okna');
  await undo.getByRole('button', { name: 'Cofnij' }).click();
  await page.locator('.toast', { hasText: 'Przywrócono dziedzinę „Metrology”.' }).waitFor();
  await waitUntil(async () => (await summary(page)).terms === 40, 'Po cofnięciu znowu 40 pojęć');
  assert.deepEqual(await summary(page), { domains: 2, modules: 5, lessons: 13, terms: 40, favorites: 0 });
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  assert.equal((await summary(page)).terms, 40, 'przywrócone dane są w bazie');
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
  await expectText(backupFooter(page), 'Nie zapisano jeszcze danych do pliku.');
  assert.equal(await page.locator('[data-testid=backup-media-export]').count(), 0, 'bez obrazów i załączników – bez drugiego pliku');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=backup-export]')]);
  assert.match(download.suggestedFilename(), /^LexiCards-dane-\d{4}-\d{2}-\d{2}\.json$/);
  const file = path.join(OUTPUT, 'kopia.json');
  await download.saveAs(file);
  const backup = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(backup.format, 'lexicards-backup');
  assert.equal(backup.counts.terms, 40);
  assert.equal(backup.data.terms.length, 40);
  await expectText(backupFooter(page), 'Ostatni zapis danych:');

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
  await expectText(page.locator('.alert__title'), 'Plik danych jest gotowy');
  await confirm(page);
  const shared = await waitUntil(() => page.evaluate(() => window.sharedFile), 'Plik powinien trafić do arkusza udostępniania');
  assert.match(shared.name, /^LexiCards-dane-/);
  assert.equal(JSON.parse(shared.text).counts.terms, 40);
  await expectText(backupFooter(page), 'Ostatni zapis danych:');
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

test('kolor aplikacji: wybór w ustawieniach, osobno od motywu, ustawiany przed narysowaniem strony', async ({ open }) => {
  const page = await open('#/settings');
  const tokens = () => page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      accent: document.documentElement.dataset.accent ?? null,
      text: style.getPropertyValue('--accent').trim(),
      fill: style.getPropertyValue('--accent-fill').trim(),
      action: getComputedStyle(document.querySelector('[data-testid=backup-export]')).color
    };
  });
  assert.equal(await page.locator('[data-testid=accent-blue]').isChecked(), true);
  assert.deepEqual(await tokens(), { accent: null, text: '#0058be', fill: '#0058be', action: 'rgb(0, 88, 190)' });
  assert.equal(await page.getByRole('radiogroup', { name: 'Kolor' }).getByRole('radio').count(), 5);

  await page.getByRole('radio', { name: 'Pomarańczowy' }).check();
  await waitUntil(async () => (await tokens()).accent === 'orange', 'Kolor powinien się zmienić');
  assert.deepEqual(await tokens(), { accent: 'orange', text: '#a33e00', fill: '#c2410c', action: 'rgb(163, 62, 0)' });
  await expectText(page.locator('[data-testid=accent-name]'), 'Pomarańczowy. Kolor przycisków, zaznaczeń i linków');
  assert.equal(await page.locator('[data-testid=accent-orange]').isChecked(), true);

  // Motyw ciemny nie zmienia wybranego koloru – tylko jego jaśniejszą wersję.
  await page.getByRole('radio', { name: 'Ciemny' }).check();
  await waitUntil(() => page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'Motyw powinien być ciemny');
  assert.deepEqual(await tokens(), { ...(await tokens()), accent: 'orange', text: '#ffa05c', fill: '#b9450d' });

  // Po ponownym otwarciu kolor jest ustawiony, zanim wystartuje reszta aplikacji.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => { window.accentAtParse = document.documentElement.dataset.accent; });
  });
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  assert.equal(await page.evaluate(() => window.accentAtParse), 'orange');
  assert.equal(await page.evaluate(() => window.lexicards.library.getSettings().accentColor), 'orange');

  // Antracytowy i powrót do niebieskiego.
  await page.getByRole('radio', { name: 'Antracytowy' }).check();
  await waitUntil(async () => (await tokens()).accent === 'graphite', 'Kolor powinien być antracytowy');
  assert.deepEqual(await tokens(), { ...(await tokens()), text: '#c9d0da', fill: '#59616d' });
  await page.getByRole('radio', { name: 'Niebieski' }).check();
  await waitUntil(async () => (await tokens()).accent === null, 'Kolor powinien wrócić do niebieskiego');
  assert.deepEqual(await tokens(), { ...(await tokens()), text: '#78b7ff', fill: '#0a6fe0' });
  assert.equal(await page.evaluate(() => localStorage.getItem('lexicards-accent')), 'blue');
});

test('telefon: środkowy przycisk „Nauka” – na ekranach przygotowania nauki, quizu i słuchania to „Rozpocznij”', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const tabbar = page.locator('.tabbar');
  const studyLink = tabbar.locator('a.tabbar__link--primary');
  const action = tabbar.locator('button.tabbar__link--action');
  // Start: zwykła zakładka w kółku.
  assert.equal(await studyLink.isVisible(), true);
  assert.equal(await action.isVisible(), false);
  await expectText(studyLink, 'Nauka');

  // Nauka: kółko z symbolem odtwarzania zamiast przycisku na pasku poleceń.
  await studyLink.click();
  await page.locator('[data-testid=study-planned]').waitFor();
  assert.equal(await studyLink.isVisible(), false);
  assert.equal(await action.isVisible(), true);
  assert.equal(await action.getAttribute('aria-label'), 'Rozpocznij naukę');
  await expectText(action, 'Rozpocznij');
  assert.equal(await page.locator('.bottombar button').count(), 0, 'pasek poleceń bez przycisku');
  // Rozmiar po krótkiej animacji pojawienia się.
  await action.locator('.tabbar__bubble').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  // Trójkąt odtwarzania jak na komputerze: środek ciężkości 1 px w lewo od środka kółka.
  const glyphOffset = await action.locator('.tabbar__bubble').evaluate((bubble) => {
    const circle = bubble.getBoundingClientRect();
    const glyph = bubble.querySelector('svg').getBoundingClientRect();
    return glyph.left + (12.07 / 24) * glyph.width - (circle.left + circle.width / 2);
  });
  assert.ok(Math.abs(glyphOffset + 1) < 0.6, `trójkąt na środku kółka (przesunięcie ${glyphOffset.toFixed(2)} px)`);
  const bubble = await action.locator('.tabbar__bubble').boundingBox();
  await page.evaluate(() => { location.hash = '#/start'; });
  const normal = await studyLink.locator('.tabbar__bubble').boundingBox();
  assert.deepEqual([bubble.width, bubble.height, bubble.y], [normal.width, normal.height, normal.y], 'to samo kółko co „Nauka”');
  await studyLink.click();
  await page.locator('[data-testid=study-planned]').waitFor();
  // Pusty zakres – przycisk nieaktywny.
  await page.selectOption('[data-testid=study-scope]', 'repeat');
  assert.equal(await action.isDisabled(), true);
  await page.selectOption('[data-testid=study-scope]', 'all');
  assert.equal(await action.isDisabled(), false);
  await action.click();
  await page.locator('[data-testid=study-session]').waitFor();
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-planned]').waitFor();

  // Słuchanie: to samo, z własną nazwą.
  await page.click('[data-testid=study-listen]');
  await page.locator('[data-testid=listen-planned]').waitFor();
  assert.equal(await action.getAttribute('aria-label'), 'Rozpocznij słuchanie');
  assert.equal(await action.getAttribute('data-testid'), 'listen-start');

  // Quiz (od 1.8.2): też kółko zamiast prostokątnego przycisku na pasku poleceń.
  await tabbar.getByRole('link', { name: 'Quiz' }).click();
  await page.locator('[data-testid=quiz-planned]').waitFor();
  assert.equal(await action.getAttribute('aria-label'), 'Rozpocznij quiz');
  assert.equal(await action.getAttribute('data-testid'), 'quiz-start');
  assert.equal(await page.locator('.bottombar button').count(), 0, 'pasek poleceń quizu bez przycisku');

  // Inna zakładka – znowu zwykła „Nauka”.
  await tabbar.getByRole('link', { name: 'Statystyki' }).click();
  await page.locator('[data-testid=quiz-planned]').waitFor({ state: 'detached' });
  assert.equal(await studyLink.isVisible(), true);
  assert.equal(await action.isVisible(), false);
  assert.equal(await action.getAttribute('data-testid'), null);
});

test('szeroki ekran: „Rozpocznij” – okrągły przycisk na środku paska poleceń, wystający ponad pasek, z podpisem (nauka, quiz, słuchanie)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  for (const [hash, kind, label] of [['#/study', 'study', 'Rozpocznij naukę'], ['#/quiz', 'quiz', 'Rozpocznij quiz'], ['#/study/listen', 'listen', 'Rozpocznij słuchanie']]) {
    await page.evaluate((target) => { location.hash = target; }, hash);
    await page.locator(`[data-testid=${kind}-planned]`).waitFor();
    assert.equal(await page.locator('.tabbar').isVisible(), false);
    const start = page.locator(`.bottombar [data-testid=${kind}-start]`);
    assert.equal(await page.locator(`[data-testid=${kind}-start]`).count(), 1);
    assert.equal(await start.locator('.start-bubble__label').textContent(), label);
    assert.equal((await start.getAttribute('class')).includes('start-bubble'), true);
    const geometry = await start.evaluate((button) => {
      const bar = button.closest('.bottombar').getBoundingClientRect();
      const inner = button.closest('.bottombar__inner').getBoundingClientRect();
      const circle = button.querySelector('.start-bubble__circle').getBoundingClientRect();
      const caption = button.querySelector('.start-bubble__label').getBoundingClientRect();
      return {
        centered: Math.abs(circle.left + circle.width / 2 - (inner.left + inner.width / 2)),
        round: getComputedStyle(button.querySelector('.start-bubble__circle')).borderRadius,
        above: bar.top - circle.top,
        below: circle.bottom - bar.top,
        caption: caption.top >= circle.bottom && caption.bottom <= bar.bottom,
        size: [circle.width, circle.height]
      };
    });
    assert.ok(geometry.centered < 1, `kółko na środku paska (${geometry.centered})`);
    assert.equal(geometry.round, '50%');
    assert.deepEqual(geometry.size, [64, 64]);
    assert.ok(geometry.above >= 20 && geometry.below >= 20, `kółko wystaje ponad linię paska (${geometry.above} nad, ${geometry.below} pod)`);
    assert.ok(geometry.caption, 'podpis pod kółkiem, w pasku');
    // Trójkąt odtwarzania: środek ciężkości (x = 12,07 z 24) przesunięty o tyle samo co w kółku
    // paska zakładek na telefonie (−1 px) – nie w prawo.
    const offset = await start.evaluate((button) => {
      const circle = button.querySelector('.start-bubble__circle').getBoundingClientRect();
      const glyph = button.querySelector('.start-bubble__circle svg').getBoundingClientRect();
      return glyph.left + (12.07 / 24) * glyph.width - (circle.left + circle.width / 2);
    });
    assert.ok(Math.abs(offset + 1) < 0.6, `trójkąt na środku kółka (przesunięcie ${offset.toFixed(2)} px)`);
    // Komunikat (np. po wczytaniu danych) jest nad kółkiem, nie na nim.
    const toast = page.locator('.toast').first();
    if (await toast.count()) {
      const [toastBox, circleBox] = [await toast.boundingBox(), await start.locator('.start-bubble__circle').boundingBox()];
      assert.ok(toastBox.y + toastBox.height <= circleBox.y, 'komunikat nad kółkiem');
    }
    await page.screenshot({ path: path.join(OUTPUT, `start-${kind}-komputer.png`) });
  }
  // Pusty zakres – szare, nieaktywne kółko.
  await page.evaluate(() => { location.hash = '#/study'; });
  await page.locator('[data-testid=study-planned]').waitFor();
  await page.selectOption('[data-testid=study-scope]', 'repeat');
  assert.equal(await page.locator('[data-testid=study-start]').isDisabled(), true);
  await page.selectOption('[data-testid=study-scope]', 'all');
  await page.click('[data-testid=study-start]');
  await page.locator('[data-testid=study-session]').waitFor();
}, { device: DESKTOP });

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

// ---------------------------------------------------------------- notatki lekcji

const IMAGE_FILE = path.join(ROOT, 'icons/icon-192.png');
const noteDialog = (page) => page.locator('dialog.note-dialog[open]');

/** Identyfikatory lekcji z danych przykładowych. */
function sampleLessons(page) {
  return page.evaluate(() => {
    const lessons = [...window.lexicards.library.maps.lessons.values()];
    const statements = lessons.find((lesson) => lesson.name === 'Financial Statements');
    const investments = lessons.find((lesson) => lesson.name === 'Investments');
    return { statements: statements.id, investments: investments.id, module: statements.moduleID };
  });
}

/** Notatka z biblioteki (tekst i opis obrazów). */
const storedNote = (page, lessonID) => page.evaluate((id) => window.lexicards.library.getNote(id), lessonID);

/**
 * Przechodzi po kolei przez strony otwartej notatki (przyciskiem „Następna strona”) i zwraca
 * dla każdej: liczbę obrazów, tekst i o ile treść wystaje poza stronę (≤ 0 – mieści się).
 */
async function walkNotePages(page) {
  const dialog = noteDialog(page);
  const book = dialog.locator('[data-testid=note-book]');
  await book.waitFor();
  const total = Number(await book.getAttribute('data-pages'));
  if ((await book.getAttribute('data-page')) !== '1') {
    await page.keyboard.press('Home');
    await waitUntil(async () => (await book.getAttribute('data-page')) === '1', 'Pierwsza strona notatki');
  }
  const result = [];
  for (let number = 1; number <= total; number += 1) {
    if (number > 1) {
      await dialog.locator('[data-testid=note-page-next]').click();
      await waitUntil(async () => (await book.getAttribute('data-page')) === String(number)
        && (await dialog.locator('[data-testid=note-page]').count()) === 1, `Strona ${number} notatki`);
    }
    const current = dialog.locator('[data-testid=note-page]');
    await waitUntil(() => imagesLoaded(current), 'Obrazy strony powinny się wyświetlić');
    result.push({
      figures: await current.locator('.note-page__figure').count(),
      text: (await current.textContent()).replace(/\s+/g, ' ').trim(),
      overflow: await pageOverflow(current)
    });
  }
  return result;
}

/** O ile treść strony notatki wystaje poza jej obrys (w pionie albo w poziomie). */
function pageOverflow(locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    // Treść ma się mieścić w polu strony bez dolnego marginesu wewnętrznego.
    const bottom = box.bottom - parseFloat(getComputedStyle(element).paddingBottom);
    let worst = -Infinity;
    for (const child of element.querySelectorAll('.note-page__content *')) {
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      worst = Math.max(worst, rect.bottom - bottom, rect.right - box.right, box.left - rect.left);
    }
    return worst;
  });
}

/** Czy wszystkie obrazy w elemencie są wczytane (mają wymiary). */
function imagesLoaded(locator) {
  return locator.evaluate((element) => [...element.querySelectorAll('img')].every((image) => image.complete && image.naturalWidth > 0));
}

test('notatka lekcji: dodanie z listy lekcji, formatowanie, obraz, podgląd, powiększenie, usunięcie', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  await expectText(title(page), 'Finance');
  assert.equal(await page.getByRole('button', { name: 'Notatka: Financial Statements' }).count(), 0, 'bez notatki nie ma ikony');

  await page.getByRole('button', { name: 'Więcej poleceń: Financial Statements' }).click();
  await menuItem(page, 'Dodaj notatkę');
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-editor]').waitFor();
  await expectText(dialog.locator('.note-sheet__lesson'), 'Financial Statements');
  await expectText(dialog.locator('.note-sheet__path'), 'Business English › Finance');
  await expectText(dialog.locator('[data-testid=note-right]'), 'Zapisz');

  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.click();
  await page.keyboard.type('Bilans');
  await dialog.locator('[data-testid=note-format-heading]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Pokazuje ');
  await dialog.locator('[data-testid=note-format-bold]').click();
  assert.equal(await dialog.locator('[data-testid=note-format-bold]').getAttribute('aria-pressed'), 'true');
  await page.keyboard.type('majątek');
  await dialog.locator('[data-testid=note-format-bold]').click();
  await page.keyboard.type(' firmy.');
  await page.keyboard.press('Enter');
  await dialog.locator('[data-testid=note-format-insertUnorderedList]').click();
  await page.keyboard.type('Aktywa = Pasywa');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Kapitał ');
  await dialog.locator('[data-testid=note-format-color]').click();
  await dialog.locator('.note-colors__swatch[data-color=green]').click();
  await page.keyboard.type('własny');

  // Obrazy są na górze edytora, nad tekstem; wybór miejsca w podglądzie widać, gdy jest obraz.
  const topOf = (selector) => dialog.locator(selector).evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(await topOf('.note-editor__images') < await topOf('.note-editor__text'), 'obrazy nad tekstem');
  assert.equal(await dialog.locator('[data-testid=note-image-placement]').isHidden(), true, 'bez obrazów nie ma wyboru');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.locator('[data-testid=note-image-add]').click()]);
  await chooser.setFiles(IMAGE_FILE);
  await dialog.locator('.note-images__item img').waitFor();
  const placement = page.getByRole('radiogroup', { name: 'Obrazy w podglądzie' });
  assert.equal(await placement.getByRole('radio', { name: 'Po tekście' }).isChecked(), true, 'domyślnie obrazy po tekście');

  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const html = await dialog.locator('[data-testid=note-text]').innerHTML();
  assert.equal(html, '<h3>Bilans</h3><p>Pokazuje <strong>majątek</strong> firmy.</p><ul><li>Aktywa = Pasywa</li><li>Kapitał <span data-color="green">własny</span></li></ul>');
  await expectText(dialog.locator('[data-testid=note-right]'), 'Edytuj');
  await dialog.locator('.note-page__figure img').waitFor();
  await waitUntil(() => imagesLoaded(dialog.locator('[data-testid=note-book]')), 'Obraz notatki powinien się wyświetlić');
  assert.equal(await dialog.locator('[data-testid=note-book]').getAttribute('data-pages'), '1', 'krótka notatka to jedna strona');
  assert.equal(await dialog.locator('.note-pager').isHidden(), true, 'przy jednej stronie nie ma przycisków stron');
  const note = await storedNote(page, ids.statements);
  assert.equal(note.images.length, 1);
  assert.deepEqual([note.images[0].type, note.images[0].width, note.images[0].height], ['image/png', 192, 192]);
  assert.ok(await topOf('.note-page__figure') > await topOf('[data-testid=note-text]'), 'w podglądzie obraz po tekście');

  // Obrazy przed tekstem: wybór w edytorze, zapisany w notatce, w podglądzie obraz nad tekstem.
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-editor]').waitFor();
  await placement.locator('.segmented__option', { hasText: 'Przed tekstem' }).click();
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('.note-page__figure img').waitFor();
  assert.equal((await storedNote(page, ids.statements)).imagesFirst, true);
  assert.ok(await topOf('.note-page__figure') < await topOf('[data-testid=note-text]'), 'w podglądzie obraz przed tekstem');
  await waitUntil(() => imagesLoaded(dialog.locator('[data-testid=note-book]')), 'Obraz notatki powinien się wyświetlić');

  // Powiększenie: dwukrotne kliknięcie i klawisze; Esc zamyka tylko podgląd obrazu.
  await dialog.locator('.note-page__figure').click();
  const lightbox = page.locator('dialog.lightbox[open]');
  await lightbox.waitFor();
  const width = () => lightbox.locator('.lightbox__image').evaluate((image) => image.getBoundingClientRect().width);
  await waitUntil(async () => (await width()) > 100, 'Obraz powinien wypełnić ekran');
  const fit = await width();
  await lightbox.locator('[data-testid=lightbox-stage]').dblclick();
  await waitUntil(async () => (await width()) > fit * 2, 'Dwukrotne kliknięcie powiększa obraz');
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await waitUntil(async () => Math.abs((await width()) - fit) < 2, 'Pomniejszenie wraca do rozmiaru ekranu');
  await page.keyboard.press('Escape');
  await lightbox.waitFor({ state: 'detached' });
  assert.equal(await noteDialog(page).count(), 1, 'okno notatki zostaje otwarte');

  await dialog.locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Notatka: Financial Statements' }).waitFor();

  // Po ponownym otwarciu strony notatka jest na miejscu (IndexedDB), a ekran lekcji ją pokazuje.
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(page.locator('[data-testid=lesson-note]'), 'Bilans');
  await expectText(page.locator('[data-testid=lesson-note]'), 'Pokazuje majątek firmy.');
  await waitUntil(() => imagesLoaded(page.locator('[data-testid=lesson-note]')), 'Miniatura obrazu na ekranie lekcji');
  await page.click('[data-testid=lesson-note]');
  await noteDialog(page).locator('[data-testid=note-text]').waitFor();

  // Zmiany porzucone po pytaniu: notatka bez zmian.
  await noteDialog(page).locator('[data-testid=note-right]').click();
  await noteDialog(page).locator('[data-testid=note-image-remove]').click();
  await noteDialog(page).locator('[data-testid=note-left]').click();
  await expectText(page.locator('dialog.alert[open] .alert__title'), 'Odrzucić zmiany?');
  await confirm(page);
  await noteDialog(page).locator('[data-testid=note-text]').waitFor();
  assert.equal((await storedNote(page, ids.statements)).images.length, 1);

  // Usunięcie notatki.
  await noteDialog(page).locator('[data-testid=note-right]').click();
  await noteDialog(page).locator('[data-testid=note-delete]').click();
  await expectText(page.locator('dialog.alert[open] .alert__title'), 'Usunąć notatkę?');
  await confirm(page);
  await noteDialog(page).waitFor({ state: 'detached' });
  assert.equal(await storedNote(page, ids.statements), null);
  assert.equal(await page.evaluate(async () => (await window.lexicards.library.adapter.readStore('noteImages')).length), 0);
  await page.locator('[data-testid=lesson-note-add]').waitFor();
});

test('notatka: wklejony tekst z Worda i strony zachowuje formatowanie, wklejony obraz trafia do obrazów, kopiowanie', async ({ open, context }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.click('[data-testid=lesson-note-add]');
  const dialog = noteDialog(page);
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.click();

  const paste = (data) => editor.evaluate(async (element, { html, text, image }) => {
    const transfer = new window.DataTransfer();
    if (html) transfer.setData('text/html', html);
    if (text) transfer.setData('text/plain', text);
    if (image) {
      const bytes = await (await fetch(image)).arrayBuffer();
      transfer.items.add(new File([bytes], 'zrzut.png', { type: 'image/png' }));
    }
    element.dispatchEvent(new window.ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, data);

  await paste({
    html: "<html><head><style>p{mso-style:x}</style></head><body><p class=MsoNormal><b>Ważne:</b> <i>kursywa</i> i <span style='color:#2F5496'>kolor Worda</span><o:p></o:p></p>"
      + "<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'><![if !supportLists]>·&nbsp;&nbsp;<![endif]>punkt z Worda</p><script>window.zle = 1</script></body></html>",
    text: 'Ważne: kursywa i kolor Worda\npunkt z Worda'
  });
  await waitUntil(async () => (await editor.innerHTML()).includes('punkt z Worda'), 'Wklejony tekst powinien być w edytorze');
  assert.equal(await page.evaluate(() => window.zle), undefined, 'skrypt z wklejonego HTML się nie wykonał');
  await paste({ image: './icons/icon-192.png' });
  await dialog.locator('.note-images__item img').waitFor();

  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const note = await storedNote(page, ids.statements);
  assert.equal(note.html, '<p><strong>Ważne:</strong> <em>kursywa</em> i kolor Worda</p><ul><li>punkt z Worda</li></ul>');
  assert.equal(note.images.length, 1);

  await dialog.locator('[data-testid=note-copy]').click();
  await expectText(page.locator('.toast'), 'Skopiowano notatkę');
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { types: item.types, html: await (await item.getType('text/html')).text(), text: await (await item.getType('text/plain')).text() };
  });
  assert.ok(copied.types.includes('text/html'));
  assert.match(copied.html, /<strong>Ważne:<\/strong>/);
  assert.match(copied.html, /<img src="data:image\/png;base64,/);
  assert.equal(copied.text, 'Ważne: kursywa i kolor Worda\n\n• punkt z Worda');
});

test('import notatek z arkusza: wybór zawartości, sprawdzenie notatek z obrazami, import razem z pojęciami', async ({ open }) => {
  const page = await open();
  await page.click('[data-testid=start-import]');
  await chooseImportFile(page, path.join(FIXTURES, 'openpyxl-notes.xlsx'));
  await expectText(stepTitle(page), 'Wybierz zawartość');
  await expectText(page.locator('.screen__subtitle'), 'Krok 2 z 9');
  assert.equal(await page.isChecked('[data-testid=import-content-terms]'), true);
  assert.equal(await page.isChecked('[data-testid=import-content-notes]'), true);
  await expectText(page.locator('.row', { has: page.locator('[data-testid=import-content-terms]') }), 'Arkusz „Pojęcia”: 2 wiersze');
  await expectText(page.locator('.row', { has: page.locator('[data-testid=import-content-notes]') }), 'Arkusz „Notatki”: 2 wiersze, 2 obrazy');

  await nextStep(page, 'Wybierz arkusz');
  assert.deepEqual(await page.locator('input[name=import-sheet]').evaluateAll((inputs) => inputs.map((input) => input.closest('label').textContent.trim())), ['Pojęcia']);
  await nextStep(page, 'Przypisz kolumny');
  await nextStep(page, 'Wybierz miejsce');
  await nextStep(page, 'Sprawdź dane');
  await nextStep(page, 'Przejrzyj pojęcia');
  await nextStep(page, 'Sprawdź notatki');
  assert.equal(await rowValue(page, 'Notatki'), '2');
  assert.equal(await rowValue(page, 'Obrazy'), '2');
  const list = page.locator('[data-testid=import-notes-list]');
  await expectText(list, 'Wiersze 2–3 → Business English › Finance › Financial Statements');
  await expectText(list, 'Wiersz 4 → Business English › Finance › Investments');
  await expectText(list.locator('.status').first(), 'Nowa notatka');
  await waitUntil(async () => (await list.locator('img').count()) === 2 && imagesLoaded(list), 'Miniatury obrazów w podglądzie');

  await nextStep(page, 'Zatwierdź import');
  await expectText(page.locator('[data-testid=import-confirm-notes]'), 'Zostaną dodane2');
  await expectText(page.locator('[data-testid=import-created]'), 'Business English › Finance › Investments');
  assert.equal((await summary(page)).terms, 0, 'do ostatniego kroku nic nie jest zapisane');
  await finishImport(page, 'Importuj 2 pojęcia i 2 notatki');
  await expectText(page.locator('[data-testid=import-done]'), 'Dodano: 2 pojęcia. Dodano 2 notatki (2 obrazy).');

  const lessons = await page.evaluate(() => {
    const { library } = window.lexicards;
    return [...library.maps.lessons.values()].map((lesson) => ({ id: lesson.id, name: lesson.name, note: library.getNote(lesson.id) }));
  });
  const statements = lessons.find((lesson) => lesson.name === 'Financial Statements');
  assert.equal(statements.note.images.length, 2);
  assert.match(statements.note.html, /^<h3>Bilans<\/h3>/);
  assert.equal(lessons.find((lesson) => lesson.name === 'Investments').note.images.length, 0);

  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${statements.id}`);
  await page.click('[data-testid=lesson-note]');
  const text = noteDialog(page).locator('[data-testid=note-text]');
  await expectText(text.locator('h3'), 'Bilans');
  await expectText(text.locator('[data-color=red]'), 'zobowiązania');
  await expectText(text.locator('u'), 'pasywów');
  assert.equal((await walkNotePages(page)).reduce((sum, item) => sum + item.figures, 0), 2, 'dwa obrazy w notatce');
});

test('import samych notatek do istniejących lekcji: zastąp albo zostaw istniejące', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate((id) => window.lexicards.library.saveNote(id, { html: '<p>Moja notatka</p>', images: [] }), ids.statements);
  await page.goto(`${page.url().split('#')[0]}#/library/import`);
  await chooseImportFile(page, path.join(FIXTURES, 'libreoffice-notes.xlsx'));
  await expectText(stepTitle(page), 'Wybierz zawartość');
  await page.click('[data-testid=import-content-terms]');
  await expectText(page.locator('.screen__subtitle'), 'Krok 2 z 4');
  await nextStep(page, 'Sprawdź notatki');
  await expectText(page.locator('.group__title', { hasText: 'już notatkę' }), '1 lekcja ma już notatkę');
  assert.equal(await page.isChecked('[data-testid=import-note-mode-replace]'), true);
  const statuses = () => page.locator('[data-testid=import-notes-list] .status').allTextContents();
  assert.deepEqual(await statuses(), ['Zastąpi istniejącą notatkę', 'Nowa notatka']);
  await page.click('[data-testid=import-note-mode-skip]');
  await waitUntil(async () => (await statuses())[0] === 'Pominięta – lekcja ma już notatkę', 'Status po wyborze „Zostaw istniejące”');

  await nextStep(page, 'Zatwierdź import');
  await expectText(page.locator('[data-testid=import-confirm-notes]'), 'Zostaną pominięte1');
  await expectText(page.locator('.form-message--info'), 'Notatki trafią do istniejących lekcji');
  await finishImport(page, 'Importuj 1 notatkę');
  await expectText(page.locator('[data-testid=import-done]'), 'Dodano 1 notatkę. Pominięto 1 notatkę.');
  assert.equal((await storedNote(page, ids.statements)).html, '<p>Moja notatka</p>');
  assert.match((await storedNote(page, ids.investments)).html, /obligacje/);
  assert.equal((await summary(page)).lessons, 13, 'żadna nowa lekcja');
});

test('eksport lekcji z notatką do XLSX i import do pustej aplikacji odtwarza notatkę z obrazami, wersją angielską i sygnaturami', async ({ open, browser, track }) => {
  const source = await open();
  await loadSamples(source);
  const ids = await sampleLessons(source);
  await source.evaluate(async (id) => {
    const bytes = await (await fetch('./icons/icon-192.png')).arrayBuffer();
    await window.lexicards.library.saveNote(id, {
      html: '<h3>Bilans</h3><p><strong>Aktywa</strong> = <em>pasywa</em></p><p>[[Schemat]]</p><ul><li><span data-color="blue">niebieski</span></li></ul>',
      htmlEN: '<h3>Balance sheet</h3><p><strong>Assets</strong> = liabilities</p><p>[[Schemat]]</p>',
      images: [{ bytes, type: 'image/png', width: 192, height: 192, name: 'ikona.png', label: 'Schemat' }]
    });
  }, ids.statements);
  await source.goto(`${source.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await source.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(source, 'Eksportuj lekcję…');
  await expectText(sheet(source).locator('[data-testid=export-scope]'), 'Notatki do lekcji: 1');
  await sheet(source).locator('[data-testid=export-notes]').waitFor();
  const exported = await download(source, () => sheet(source).locator('.sheet__submit').click());
  const book = await openWorkbook(exported.bytes);
  assert.deepEqual(book.sheets.map((item) => item.name), ['Pojęcia', 'Notatki']);
  const notes = await book.readSheet(1, { rich: true });
  // Od 1.18 także Image caption – podpis pod obrazem.
  assert.deepEqual(notes.rows[0].cells, ['Domain', 'Module', 'Lesson', 'Note', 'Note EN', 'Image', 'Image label', 'Image caption']);
  assert.ok(notes.rows[1].rich[3].some((run) => run.text === 'Aktywa' && run.b));
  assert.ok(notes.rows[1].rich[4].some((run) => run.text === 'Assets' && run.b), 'wersja angielska w kolumnie Note EN');
  assert.equal(notes.rows[1].cells[6], 'Schemat', 'sygnatura obrazu w kolumnie Image label');
  assert.deepEqual(notes.images.map((item) => [item.row, item.column, item.type]), [[2, 5, 'image/png']]);

  const other = await browser.newContext({ ...PHONE, locale: 'pl-PL' });
  try {
    const page = await other.newPage();
    track(page);
    await page.goto(`${source.url().split('#')[0]}#/library/import`);
    await page.waitForSelector('#app[data-ready="true"]');
    await chooseImportFile(page, path.join(OUTPUT, exported.name));
    await expectText(stepTitle(page), 'Wybierz zawartość');
    await nextStep(page, 'Wybierz arkusz');
    await nextStep(page, 'Przypisz kolumny');
    await nextStep(page, 'Wybierz miejsce');
    await nextStep(page, 'Sprawdź dane');
    await nextStep(page, 'Przejrzyj pojęcia');
    await nextStep(page, 'Sprawdź notatki');
    await nextStep(page, 'Zatwierdź import');
    await finishImport(page, 'Importuj 4 pojęcia i 1 notatkę');
    const restored = await page.evaluate(async () => {
      const { library } = window.lexicards;
      const lesson = [...library.maps.lessons.values()][0];
      const images = await library.noteImages(lesson.id);
      const note = library.getNote(lesson.id);
      return { html: note.html, htmlEN: note.htmlEN, labels: note.images.map((image) => image.label), sizes: images.map((image) => image.bytes.byteLength) };
    });
    const original = await source.evaluate(async (id) => {
      const note = window.lexicards.library.getNote(id);
      return {
        html: note.html, htmlEN: note.htmlEN, labels: note.images.map((image) => image.label),
        sizes: (await window.lexicards.library.noteImages(id)).map((image) => image.bytes.byteLength)
      };
    }, ids.statements);
    assert.deepEqual(original.labels, ['Schemat']);
    assert.deepEqual(restored, original);
  } finally {
    await other.close();
  }
});

/** Treść udawanych załączników (PDF i dokument Word) do testów. */
const FAKE_PDF = '%PDF-1.4 udawany dokument PDF '.repeat(40);
const fakeDocx = () => Array.from({ length: 3000 }, (_, index) => index % 251);

/** Notatka lekcji „Financial Statements” z tekstem, obrazem „Schemat” i dwoma załącznikami. */
async function seedNoteWithFiles(page) {
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate(async ([id, pdf, docx]) => {
    const bytes = await (await fetch('./icons/icon-192.png')).arrayBuffer();
    await window.lexicards.library.saveNote(id, {
      html: '<p>Notatka w kopii</p><p>[[Schemat]]</p>',
      images: [{ bytes, type: 'image/png', width: 192, height: 192, label: 'Schemat' }],
      files: [
        { name: 'Instrukcja.pdf', type: 'application/pdf', bytes: new TextEncoder().encode(pdf) },
        { name: 'Raport.docx', type: '', bytes: new Uint8Array(docx) }
      ]
    });
  }, [ids.statements, FAKE_PDF, fakeDocx()]);
  return ids;
}

async function openLessonNote(page, lessonID) {
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${lessonID}`);
  await page.click('[data-testid=lesson-note]');
  await noteDialog(page).locator('[data-testid=note-files]').waitFor();
  await waitUntil(() => noteDialog(page).locator('.sheet__panel').evaluate((panel) => panel.getAnimations().length === 0), 'Okno notatki otwarte');
}

/** Bajty załącznika notatki z bazy (tablica liczb) albo null. */
const storedFileBytes = (page, lessonID, name) => page.evaluate(async ([id, fileName]) => {
  const { library } = window.lexicards;
  const meta = library.getNote(id).files.find((file) => file.name === fileName);
  const file = meta ? await library.noteFile(id, meta.id) : null;
  return file ? [...new Uint8Array(file.bytes)] : null;
}, [lessonID, name]);

async function restoreFiles(page, files) {
  await page.evaluate(() => { location.hash = '#/settings'; });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=backup-restore]')]);
  await chooser.setFiles(files);
}

test('przeniesienie dwustopniowe: plik danych bez obrazów i załączników, jeden plik obrazów i załączników; na drugim urządzeniu najpierw dane, potem pliki', async ({ open, browser, track }) => {
  const page = await open();
  const ids = await seedNoteWithFiles(page);
  await page.goto(`${page.url().split('#')[0]}#/settings`);
  await expectText(page.locator('[data-testid=backup-media-export]'), 'Jeden plik: 1 obraz i 2 załączniki');
  await expectText(backupFooter(page), 'Nie zapisano jeszcze obrazów i załączników.');

  const data = await download(page, () => page.click('[data-testid=backup-export]'));
  assert.match(data.name, /^LexiCards-dane-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(new TextDecoder().decode(data.bytes));
  assert.equal(backup.formatVersion, 3);
  assert.equal(backup.data.noteImages, undefined, 'plik danych nie ma bajtów obrazów');
  assert.deepEqual([backup.media.images, backup.media.files], [1, 2]);
  assert.ok(data.bytes.byteLength < 200_000, 'plik danych jest mały');

  const media = await download(page, () => page.click('[data-testid=backup-media-export]'));
  assert.match(media.name, /^LexiCards-obrazy-i-zalaczniki-\d{4}-\d{2}-\d{2}\.zip$/);
  const names = [...readZipDirectory(media.bytes).keys()];
  assert.equal(names.length, 4, 'obraz, dwa załączniki i spis treści w jednym pliku');
  assert.ok(names.some((name) => /^obrazy\/.+\.png$/.test(name)));
  assert.ok(names.some((name) => /^zalaczniki\/.+\/Instrukcja\.pdf$/.test(name)));
  assert.ok(names.some((name) => /^zalaczniki\/.+\/Raport\.docx$/.test(name)));
  await expectText(backupFooter(page), 'Ostatni zapis obrazów i załączników:');
  const dataPath = path.join(OUTPUT, data.name);
  const mediaPath = path.join(OUTPUT, media.name);

  const context = await browser.newContext({ ...PHONE, locale: 'pl-PL', acceptDownloads: true });
  try {
    const other = await context.newPage();
    track(other);
    await other.goto(page.url().split('#')[0]);
    await other.waitForSelector('#app[data-ready="true"]');

    // Krok 1: same dane. Notatka jest, ale bez plików obrazu i załączników.
    await restoreFiles(other, dataPath);
    await expectText(other.locator('.alert__message'), 'Obrazy i załączniki notatek (1 obraz i 2 załączniki) są w osobnym pliku');
    await confirm(other);
    await waitUntil(async () => (await summary(other)).terms === 40, 'Dane powinny zostać przywrócone');
    await expectText(other.locator('.row--static', { hasText: 'Brak na tym urządzeniu' }), '1 obraz i 2 załączniki');
    await other.locator('.settings-backup').scrollIntoViewIfNeeded();
    await other.screenshot({ path: path.join(OUTPUT, 'przeniesienie-ustawienia-brak-plikow.png') });

    await openLessonNote(other, ids.statements);
    const dialog = noteDialog(other);
    await expectText(dialog.locator('[data-testid=note-missing-image]'), 'Brak pliku obrazu „Schemat”');
    assert.equal(await dialog.locator('.note-files__item--missing').count(), 2, 'załączniki oznaczone jako brakujące');
    await other.screenshot({ path: path.join(OUTPUT, 'przeniesienie-notatka-bez-plikow.png') });
    await dialog.locator('[data-testid=note-file]').first().click();
    await other.locator('.toast', { hasText: 'Pliku „Instrukcja.pdf” nie ma na tym urządzeniu' }).waitFor();
    assert.equal(await other.locator('dialog.menu[open]').count(), 0, 'bez pliku – bez poleceń');
    await dialog.locator('[data-testid=note-left]').click();

    // Krok 2: plik obrazów i załączników.
    await restoreFiles(other, mediaPath);
    await expectText(other.locator('.alert__message'), 'Dodano 1 obraz i 2 załączniki.');
    await other.locator('dialog.alert[open]').getByRole('button', { name: 'OK' }).click();
    await waitUntil(async () => (await other.locator('.row--static', { hasText: 'Brak na tym urządzeniu' }).count()) === 0, 'Nie powinno już brakować plików');
    assert.deepEqual(await storedFileBytes(other, ids.statements, 'Raport.docx'), fakeDocx());
    assert.equal(new TextDecoder().decode(new Uint8Array(await storedFileBytes(other, ids.statements, 'Instrukcja.pdf'))), FAKE_PDF);

    await openLessonNote(other, ids.statements);
    await waitUntil(() => noteDialog(other).locator('.note-page__figure img').evaluate((image) => image.complete && image.naturalWidth === 192), 'Obraz z drugiego pliku się wyświetla');
    assert.equal(await noteDialog(other).locator('.note-files__item--missing').count(), 0);
  } finally {
    await context.close();
  }

  // Trzecie urządzenie: oba pliki wybrane naraz – najpierw dane, potem obrazy i załączniki.
  const third = await browser.newContext({ ...PHONE, locale: 'pl-PL' });
  try {
    const other = await third.newPage();
    track(other);
    await other.goto(page.url().split('#')[0]);
    await other.waitForSelector('#app[data-ready="true"]');
    await restoreFiles(other, [mediaPath, dataPath]);
    await expectText(other.locator('.alert__message'), 'Potem zostaną dodane obrazy i załączniki notatek z drugiego pliku');
    await confirm(other);
    await expectText(other.locator('.alert__message'), 'Dodano 1 obraz i 2 załączniki.');
    assert.deepEqual(await storedFileBytes(other, ids.statements, 'Raport.docx'), fakeDocx());
    assert.deepEqual(await other.evaluate(() => window.lexicards.library.missingMedia()), { images: 0, files: 0, size: 0 });
  } finally {
    await third.close();
  }
});

test('kopia zapasowa z wersji 1.7 (jeden plik z obrazami) nadal się przywraca; przywrócenie danych na tym samym urządzeniu zostawia obrazy i załączniki', async ({ open }) => {
  const page = await open();
  const ids = await seedNoteWithFiles(page);
  // Kopia w postaci z wersji 1.7: formatVersion 2, obraz w Base64 w tym samym pliku, bez załączników.
  const legacy = await page.evaluate(async () => {
    const { library } = window.lexicards;
    const data = await library.exportAll();
    const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
    data.noteImages = data.noteImages.map(({ bytes, ...record }) => ({ ...record, data: toBase64(bytes) }));
    delete data.noteFiles;
    // Notatki z exportAll to obiekty biblioteki – kopie bez pola files, oryginałów nie ruszamy.
    data.notes = data.notes.map((note) => Object.fromEntries(Object.entries(note).filter(([key]) => key !== 'files')));
    return { format: 'lexicards-backup', formatVersion: 2, appVersion: '1.7.0', exportedAt: new Date().toISOString(), data };
  });
  const legacyPath = path.join(OUTPUT, 'kopia-1.7.json');
  await writeFile(legacyPath, JSON.stringify(legacy));

  // Ten sam telefon: przywrócenie pliku danych z 1.8 nie gubi obrazów ani załączników.
  await page.goto(`${page.url().split('#')[0]}#/settings`);
  const data = await download(page, () => page.click('[data-testid=backup-export]'));
  await restoreFiles(page, path.join(OUTPUT, data.name));
  await expectText(page.locator('.alert__message'), 'Te, które już są na tym urządzeniu, zostaną.');
  await confirm(page);
  await page.locator('.toast', { hasText: 'Przywrócono' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.lexicards.library.missingMedia()), { images: 0, files: 0, size: 0 });
  assert.deepEqual(await storedFileBytes(page, ids.statements, 'Raport.docx'), fakeDocx());

  // Po usunięciu wszystkiego kopia z 1.7 przywraca notatkę z obrazem (załączników wtedy nie było).
  await page.click('[data-testid=delete-all]');
  await confirm(page);
  await waitUntil(async () => (await page.evaluate(() => window.lexicards.library.noteCount())) === 0, 'Notatki powinny zniknąć');
  assert.deepEqual(await page.evaluate(async () => (await window.lexicards.library.adapter.readKeys('noteFiles')).length), 0);
  await restoreFiles(page, legacyPath);
  await confirm(page);
  await waitUntil(async () => (await summary(page)).terms === 40, 'Po przywróceniu powinno być 40 pojęć');
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.click('[data-testid=lesson-note]');
  await expectText(noteDialog(page).locator('[data-testid=note-text]'), 'Notatka w kopii');
  assert.equal((await walkNotePages(page)).reduce((sum, item) => sum + item.figures, 0), 1, 'obraz z kopii się wyświetla');
  assert.equal(await noteDialog(page).locator('[data-testid=note-files]').count(), 0);
});

test('załączniki w edytorze: dodanie, zmiana nazwy z zachowaniem rozszerzenia, usunięcie; lista w podglądzie; telefon otwiera plik arkuszem udostępniania', async ({ open, context }) => {
  // Chromium nie ma arkusza udostępniania – podstawiamy go jak w teście kopii zapasowej.
  await context.addInitScript(() => {
    navigator.canShare = (data) => Array.isArray(data?.files) && data.files.length === 1;
    navigator.share = async (data) => {
      const [file] = data.files;
      window.sharedFile = { name: file.name, type: file.type, size: file.size, text: await file.text() };
    };
  });
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate((id) => window.lexicards.library.saveNote(id, { html: '<p>Notatka z plikami</p>', images: [] }), ids.statements);
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.click('[data-testid=lesson-note]');
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-book]').waitFor();
  assert.equal(await dialog.locator('[data-testid=note-files]').count(), 0, 'bez załączników – bez listy');
  await dialog.locator('[data-testid=note-right]').click();

  // Sekcje edytora: obrazy, (od 1.21) tabele, pod nimi załączniki, na końcu tekst.
  assert.deepEqual(await dialog.locator('.note-editor > section > .form-group__title, .note-editor > section > .note-editor__text-head > .form-group__title').allTextContents(),
    ['Obrazy', 'Tabele', 'Załączniki', 'Tekst']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.locator('[data-testid=note-attachment-add]').click()]);
  await chooser.setFiles([
    { name: 'Instrukcja.pdf', mimeType: 'application/pdf', buffer: Buffer.from(FAKE_PDF) },
    { name: 'Raport.docx', mimeType: '', buffer: Buffer.from(fakeDocx()) },
    { name: 'Zbędny.txt', mimeType: 'text/plain', buffer: Buffer.from('do usunięcia') }
  ]);
  await waitUntil(async () => (await dialog.locator('[data-testid=note-attachment-name]').allTextContents()).length === 3, 'Trzy załączniki na liście');
  await page.screenshot({ path: path.join(OUTPUT, 'zalaczniki-edytor-telefon.png') });
  assert.deepEqual(await dialog.locator('.note-attachments__item .file-badge').allTextContents(), ['PDF', 'DOCX', 'TXT']);
  await expectText(dialog.locator('.note-attachments__meta').nth(1), 'Dokument Word, 3 KB');

  // Zmiana nazwy: rozszerzenie zostaje, nawet gdy zniknie z pola.
  await dialog.locator('[data-testid=note-attachment]').nth(1).click();
  await menuItem(page, 'Zmień nazwę');
  await sheet(page).locator('[data-testid=note-attachment-rename]').fill('Sprawozdanie roczne');
  await saveSheet(page);
  await dialog.locator('[data-testid=note-attachment-remove]').nth(2).click();
  assert.deepEqual(await dialog.locator('[data-testid=note-attachment-name]').allTextContents(), ['Instrukcja.pdf', 'Sprawozdanie roczne.docx']);
  await dialog.locator('[data-testid=note-right]').click();
  await page.locator('.toast', { hasText: 'Zapisano notatkę.' }).waitFor();

  const note = await storedNote(page, ids.statements);
  assert.deepEqual(note.files.map((file) => [file.name, file.type, file.size]), [
    ['Instrukcja.pdf', 'application/pdf', FAKE_PDF.length],
    ['Sprawozdanie roczne.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 3000]
  ]);
  assert.deepEqual(await storedFileBytes(page, ids.statements, 'Sprawozdanie roczne.docx'), fakeDocx());

  // Podgląd: pliki pod nazwą lekcji; dotknięcie – arkusz udostępniania z tym plikiem.
  await dialog.locator('[data-testid=note-files]').waitFor();
  assert.deepEqual(await dialog.locator('.note-files__name').allTextContents(), ['Instrukcja.pdf', 'Sprawozdanie roczne.docx']);
  await dialog.locator('[data-testid=note-file]').first().click();
  await expectText(page.locator('dialog.menu[open] .menu__title'), 'Instrukcja.pdf (PDF,');
  await page.waitForTimeout(150);
  await menuItem(page, 'Otwórz lub zapisz…');
  const shared = await waitUntil(() => page.evaluate(() => window.sharedFile), 'Plik powinien trafić do arkusza udostępniania');
  assert.deepEqual(shared, { name: 'Instrukcja.pdf', type: 'application/pdf', size: FAKE_PDF.length, text: FAKE_PDF });

  // Na liście lekcji notatka bez tekstu pokazuje liczbę załączników; notatka z samymi plikami ma podgląd bez stron.
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-editor]').evaluate((area) => { area.innerHTML = '<p><br></p>'; });
  await dialog.locator('[data-testid=note-right]').click();
  await expectText(dialog.locator('.note-sheet__only-files'), 'Notatka ma tylko załączniki.');
  assert.equal(await dialog.locator('[data-testid=note-book]').count(), 0);
  await dialog.locator('[data-testid=note-left]').click();
  await expectText(page.locator('[data-testid=lesson-note] .note-row__preview'), '2 załączniki');
  await page.screenshot({ path: path.join(OUTPUT, 'zalaczniki-lista-lekcji.png') });
});

test('notatka głosowa: nagrywanie w trakcie pisania, pauza, zakończenie i zapis; nagranie w załącznikach, odtwarzanie, kopia', async ({ open, context }) => {
  await context.grantPermissions(['microphone']);
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.click('[data-testid=lesson-note-add]');
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-editor]').waitFor();

  // Start: pasek nagrywania u góry edytora, czas biegnie; w tym czasie piszemy notatkę.
  await dialog.locator('[data-testid=note-record]').click();
  const bar = dialog.locator('[data-testid=note-recording]');
  await bar.waitFor();
  await waitUntil(async () => (await bar.locator('[data-testid=note-recording-time]').textContent()) === '0:01', 'Czas nagrania biegnie', 4000);
  await dialog.locator('[data-testid=note-editor]').click();
  await page.keyboard.type('Pisane w trakcie nagrywania.');
  await dialog.locator('.sheet__body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
  const pinned = await bar.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const body = element.closest('.sheet__body').getBoundingClientRect();
    return box.top >= body.top - 1 && box.bottom <= body.bottom;
  });
  assert.ok(pinned, 'pasek nagrywania widać po przewinięciu edytora');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-glosowa-nagrywanie-telefon.png') });
  assert.equal(await dialog.locator('[data-testid=note-record]').isDisabled(), true, 'jedno nagranie naraz');

  // Pauza zatrzymuje czas, wznowienie – dalej.
  await bar.locator('[data-testid=note-recording-pause]').click();
  await expectText(bar, 'Pauza');
  const paused = await bar.locator('[data-testid=note-recording-time]').textContent();
  await page.waitForTimeout(1300);
  assert.equal(await bar.locator('[data-testid=note-recording-time]').textContent(), paused, 'w pauzie czas stoi');
  await bar.locator('[data-testid=note-recording-pause]').click();
  await expectText(bar, 'Nagrywanie');
  await page.waitForTimeout(900);

  // Zakończ – nagranie w załącznikach, pasek znika.
  await bar.locator('[data-testid=note-recording-stop]').click();
  await page.locator('.toast', { hasText: 'Dodano notatkę głosową' }).waitFor();
  assert.equal(await bar.isVisible(), false);
  await expectText(dialog.locator('[data-testid=note-attachment-name]'), 'Notatka głosowa');
  await expectText(dialog.locator('.note-attachments__meta'), 'Nagranie, 0:0');

  // Drugie nagranie zakończone samym zapisem notatki.
  await dialog.locator('[data-testid=note-record]').click();
  await bar.waitFor();
  await page.waitForTimeout(1200);
  await dialog.locator('[data-testid=note-right]').click();
  await page.locator('.toast', { hasText: 'Zapisano notatkę.' }).waitFor();
  const note = await storedNote(page, ids.statements);
  assert.equal(note.html, '<p>Pisane w trakcie nagrywania.</p>');
  assert.equal(note.files.length, 2, 'oba nagrania zapisane');
  for (const file of note.files) {
    // Format zależy od przeglądarki: AAC (.m4a), gdy system ma koder, inaczej Opus (.webm).
    const extension = /^Notatka głosowa \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.(m4a|webm)$/.exec(file.name)?.[1];
    assert.ok(extension, `nazwa nagrania: ${file.name}`);
    assert.equal(file.type, extension === 'm4a' ? 'audio/mp4' : 'audio/webm');
    assert.ok(file.size > 1000, `nagranie ma treść (${file.size} B)`);
    assert.ok(file.duration >= 1 && file.duration <= 6, `czas nagrania ${file.duration} s`);
  }
  const recordedBytes = await storedFileBytes(page, ids.statements, note.files[0].name);
  assert.ok(recordedBytes.length === note.files[0].size);

  // Podgląd: nagranie z mikrofonem na liście, „Odtwórz” – odtwarzacz w aplikacji.
  await dialog.locator('[data-testid=note-files]').waitFor();
  assert.equal(await dialog.locator('.note-files__item .file-badge--audio').count(), 2);
  await dialog.locator('[data-testid=note-file]').first().click();
  await menuItem(page, 'Odtwórz');
  const player = page.locator('[data-testid=audio-player]');
  await player.waitFor();
  await waitUntil(() => player.evaluate((audio) => audio.readyState >= 1 && audio.duration > 0.5), 'Odtwarzacz wczytał nagranie');
  await page.locator('dialog.alert[open]').evaluate((alert) => Promise.all(alert.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-glosowa-odtwarzanie-telefon.png') });
  await page.locator('dialog.alert[open]').getByRole('button', { name: 'Zamknij' }).click();

  // Nagranie jest zwykłym załącznikiem: trafia do pliku obrazów i załączników kopii.
  await dialog.locator('[data-testid=note-left]').click();
  await page.goto(`${page.url().split('#')[0]}#/settings`);
  await expectText(page.locator('[data-testid=backup-media-export]'), '2 załączniki');
});

/** Kontrast WCAG dwóch kolorów { r, g, b }. */
function contrast(first, second) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('ekran lekcji i listy: żółty wiersz notatki, piktogramy bez tła, utrwalone z pełnymi zielonymi liniami poziomymi (jasny i ciemny motyw)', async ({ open }) => {
  const page = await open();
  const ids = await seedNoteWithFiles(page);
  await page.evaluate((id) => window.lexicards.library.setLessonConsolidated(id, true), ids.statements);
  const color = (locator, property = 'backgroundColor', pseudo = null) => locator.evaluate((element, [name, part]) => {
    // color-mix() daje „color(srgb 1 0.98 0.91)” (0–1), zwykły kolor – „rgb(255, 255, 255)” albo „rgba(…, 0.3)”.
    const value = getComputedStyle(element, part)[name];
    const scale = value.startsWith('color(') ? 255 : 1;
    const [r, g, b, a = 1] = value.match(/[\d.]+/g).map(Number);
    return { r: Math.round(r * scale), g: Math.round(g * scale), b: Math.round(b * scale), a };
  }, [property, pseudo]);
  const check = async (theme) => {
    await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
    const noteRow = page.locator('li.row--note', { has: page.locator('[data-testid=lesson-note]') });
    const note = await color(noteRow);
    const surface = await color(page.locator('.lesson-note .group__list'));
    const term = await color(page.locator('ul.terms').first());
    // Żółtawy: czerwony i zielony prawie równe, niebieski niżej – ale tylko lekko (delikatnie).
    assert.ok(note.r >= note.g && note.g > note.b, `${theme}: wiersz notatki żółtawy (${JSON.stringify(note)})`);
    const tint = note.r - note.b;
    assert.ok(tint >= 12 && tint <= 40, `${theme}: odcień delikatny (różnica ${tint})`);
    assert.deepEqual(surface, term, `${theme}: tło grupy jak tło listy pojęć`);
    assert.notDeepEqual(note, surface, `${theme}: wiersz notatki różni się od tła`);

    // Piktogramy bez tła: żółta ikona notatki, zielona ikona utrwalenia, obie czytelne (kontrast ≥ 3:1).
    const consolidated = page.locator('[data-testid=lesson-consolidated]');
    const noteIcon = noteRow.locator('.row__leading--icon');
    const checkIcon = consolidated.locator('.row__leading--icon');
    for (const [label, iconBox, row] of [['notatki', noteIcon, noteRow], ['utrwalenia', checkIcon, consolidated]]) {
      assert.equal((await color(iconBox)).a, 0, `${theme}: piktogram ${label} bez tła`);
      assert.equal(await iconBox.locator('svg').evaluate((svg) => svg.getBoundingClientRect().width), 22, `${theme}: piktogram ${label} 22 px`);
      const glyph = await color(iconBox.locator('svg'), 'color');
      // Tło wiersza pod ikoną: notatka – jednolite, utrwalenie – gradient (lewy brzeg, najmocniejszy).
      const under = label === 'notatki' ? note : await row.evaluate((element) => {
        const [r, g, b] = getComputedStyle(element).backgroundImage.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)/).slice(1).map((part) => Math.round(Number(part) * 255));
        return { r, g, b };
      });
      const ratio = contrast(glyph, under);
      assert.ok(ratio >= 3, `${theme}: piktogram ${label} – kontrast ${ratio.toFixed(2)}:1`);
    }
    const yellow = await color(noteIcon.locator('svg'), 'color');
    assert.ok(yellow.r > yellow.g && yellow.g > yellow.b + 100, `${theme}: ikona notatki żółta (${JSON.stringify(yellow)})`);
    const green = await color(checkIcon.locator('svg'), 'color');
    assert.ok(green.g > green.r && green.g > green.b, `${theme}: ikona utrwalenia zielona (${JSON.stringify(green)})`);

    // Utrwalenie nad notatką: bez obwódki (sama poświata), bez linii między wierszami.
    const shadow = await consolidated.evaluate((element) => getComputedStyle(element).boxShadow);
    assert.ok(!/0px 0px 0px 1px/.test(shadow) && /20px/.test(shadow), `${theme}: utrwalenie bez obwódki (${shadow})`);
    assert.equal(await noteRow.evaluate((element) => getComputedStyle(element, '::before').display), 'none', `${theme}: bez linii między wierszami`);
    await page.screenshot({ path: path.join(OUTPUT, `notatka-wiersz-zolty-${theme}.png`) });

    // Lista lekcji w module (kolejność własna – utrwalona między zwykłymi): bez obwódki z boków,
    // pełne zielone linie nad i pod nią, zwykłe wiersze – szara linia od odstępu.
    await page.evaluate(() => window.lexicards.library.updateSettings({ consolidatedLast: false }));
    // Utrwalona lekcja na drugim miejscu – między zwykłymi.
    await page.evaluate(([id, moduleID]) => {
      const { library } = window.lexicards;
      const others = [...library.maps.lessons.values()].filter((lesson) => lesson.moduleID === moduleID && lesson.id !== id)
        .sort((a, b) => a.sortOrder - b.sortOrder).map((lesson) => lesson.id);
      return library.reorder('lesson', [others[0], id, ...others.slice(1)]);
    }, [ids.statements, ids.module]);
    await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
    const rows = page.locator('section.group:has(li.row--consolidated) .group__list > li');
    const flags = await rows.evaluateAll((items) => items.map((item) => item.classList.contains('row--consolidated')));
    const index = flags.indexOf(true);
    assert.ok(flags.length >= 3, 'lista ma co najmniej 3 lekcje');
    assert.equal(index, 1, 'utrwalona na drugim miejscu');
    const listRow = rows.nth(index);
    const listShadow = await listRow.evaluate((element) => getComputedStyle(element).boxShadow);
    assert.ok(!/0px 0px 0px 1px/.test(listShadow), `${theme}: na liście bez obwódki z boków (${listShadow})`);
    const line = (item) => item.evaluate((element) => {
      const style = getComputedStyle(element, '::before');
      return { left: style.left, width: style.borderTopWidth, display: style.display, content: style.content };
    });
    // Linie przy utrwalonej: nad nią (jeśli nie jest pierwsza) i pod nią (górna linia następnego wiersza).
    const lines = [];
    if (index > 0) lines.push(listRow);
    if (index < flags.length - 1) lines.push(rows.nth(index + 1));
    assert.ok(lines.length > 0);
    for (const item of lines) {
      const style = await line(item);
      assert.deepEqual([style.left, style.width], ['0px', '1px'], `${theme}: zielona linia od krawędzi (${JSON.stringify(style)})`);
      const stroke = await color(item, 'borderTopColor', '::before');
      assert.ok(stroke.g > stroke.r && stroke.g > stroke.b, `${theme}: linia zielona (${JSON.stringify(stroke)})`);
    }
    // Zwykła linia między dwoma nieutrwalonymi – szara, od odstępu (jak dotąd).
    const plain = flags.findIndex((flag, position) => position > 0 && !flag && !flags[position - 1]);
    if (plain > 0) {
      const style = await line(rows.nth(plain));
      assert.notEqual(style.left, '0px', `${theme}: zwykła linia od odstępu`);
      const stroke = await color(rows.nth(plain), 'borderTopColor', '::before');
      assert.ok(Math.abs(stroke.g - stroke.r) <= 12, `${theme}: zwykła linia szara`);
    }
    await page.screenshot({ path: path.join(OUTPUT, `lista-lekcji-utrwalona-${theme}.png`) });
    // Utrwalone na końcu (domyślnie): zielona linia tylko nad ostatnim wierszem, przy krawędzi karty – nic.
    await page.evaluate(() => window.lexicards.library.updateSettings({ consolidatedLast: true }));
    await page.reload();
    // Po przeładowaniu lista powstaje chwilę później – evaluateAll nie czeka na wiersze.
    await waitUntil(async () => (await rows.count()) === flags.length, 'Lista lekcji po przeładowaniu');
    const lastFlags = await rows.evaluateAll((items) => items.map((item) => item.classList.contains('row--consolidated')));
    assert.equal(lastFlags.at(-1), true, 'utrwalona na końcu listy');
    assert.deepEqual(await line(rows.last()).then((style) => [style.left, style.width]), ['0px', '1px'], `${theme}: linia nad ostatnim`);
    assert.ok(!/0px 0px 0px 1px/.test(await rows.last().evaluate((element) => getComputedStyle(element).boxShadow)), `${theme}: bez obwódki przy krawędzi karty`);

    // Lekcja bez notatki: „Dodaj notatkę do lekcji” też na żółtym, z tym samym piktogramem.
    await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.investments}`);
    const addRow = page.locator('li.row--note', { has: page.locator('[data-testid=lesson-note-add]') });
    assert.deepEqual(await color(addRow), note, `${theme}: pusty wiersz notatki w tym samym kolorze`);
    assert.deepEqual(await color(addRow.locator('.row__leading--icon svg'), 'color'), yellow, `${theme}: ten sam piktogram`);
  };
  await check('jasny');
  await page.emulateMedia({ colorScheme: 'dark' });
  await check('ciemny');
});

test('piktogram notatki wszędzie ciemnożółty – w obu motywach i przy innym kolorze aplikacji', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate(async (id) => {
    const { library } = window.lexicards;
    await library.saveNote(id, { html: '<p>Ściąga do lekcji</p>', images: [] });
    await library.updateSettings({ accentColor: 'green' });
  }, ids.statements);
  const base = page.url().split('#')[0];
  const stroke = (locator) => locator.evaluate((svg) => getComputedStyle(svg).color);
  const DARK_YELLOW = 'rgb(185, 130, 0)';
  for (const theme of ['jasny', 'ciemny']) {
    if (theme === 'ciemny') await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    const seen = {};
    // Ekran lekcji: wiersz notatki; szczegóły pojęcia: „Notatka lekcji”.
    await page.goto(`${base}#/library/lesson/${ids.statements}`);
    seen['ekran lekcji'] = await stroke(page.locator('[data-testid=lesson-note] .icon--note'));
    await page.locator('.term__toggle').first().click();
    seen['szczegóły pojęcia'] = await stroke(page.locator('[data-testid=term-lesson-note] .icon--note'));
    // Lista lekcji w module: przycisk notatki przy lekcji i polecenie „Notatka” w menu „…”.
    await page.goto(`${base}#/library/module/${ids.module}`);
    seen['lista lekcji'] = await stroke(page.locator('.row__note .icon--note').first());
    await page.getByRole('button', { name: 'Więcej poleceń: Financial Statements' }).click();
    seen['menu „…”'] = await stroke(page.locator('dialog.menu[open]').getByRole('menuitem', { name: 'Notatka', exact: true }).locator('.icon--note'));
    await page.keyboard.press('Escape');
    // Nauka: przycisk notatki przy fiszce.
    await page.goto(`${base}#/study/lesson/${ids.statements}`);
    await page.click('[data-testid=study-start]');
    await page.waitForSelector('[data-testid=flashcard]');
    seen['fiszki'] = await stroke(page.getByRole('button', { name: 'Notatka lekcji' }).locator('.icon--note'));
    for (const [place, value] of Object.entries(seen)) assert.equal(value, DARK_YELLOW, `${theme}: ${place}`);
    await page.goto(`${base}#/library/module/${ids.module}`);
    await page.screenshot({ path: path.join(OUTPUT, `piktogram-notatki-lista-${theme}.png`) });
  }
});

/** Kafelki dziedzin na Starcie: liczba wierszy, przewijanie w bok, położenie listy. */
const startTiles = (page) => page.locator('[data-testid=start-domains]').evaluate((list) => {
  const tops = new Set([...list.children].map((tile) => Math.round(tile.getBoundingClientRect().top)));
  const box = list.getBoundingClientRect();
  return {
    rows: tops.size, scroll: list.classList.contains('tiles--scroll'), overflow: list.scrollWidth - list.clientWidth,
    scrollLeft: list.scrollLeft, left: box.left, right: box.right, firstLeft: list.children[0].getBoundingClientRect().left,
    order: [...list.children].map((tile) => tile.querySelector('.tile__name').textContent)
  };
});

async function seedDomains(page, count) {
  await page.evaluate(async (total) => {
    const { library } = window.lexicards;
    for (let index = library.listDomains().length; index < total; index += 1) await library.createDomain({ name: `Dziedzina ${index + 1}` });
  }, count);
}

test('Start: do czterech dziedzin zwykła siatka, więcej – najwyżej dwa wiersze z przewijaniem w bok (pozycja pamiętana)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const base = page.url().split('#')[0];
  await seedDomains(page, 4);
  await page.goto(`${base}#/`);
  let tiles = await startTiles(page);
  assert.deepEqual([tiles.scroll, tiles.rows, tiles.overflow], [false, 2, 0], 'cztery – siatka 2 × 2 bez przewijania');

  await seedDomains(page, 9);
  await page.goto(`${base}#/`);
  tiles = await startTiles(page);
  assert.equal(tiles.scroll, true);
  assert.equal(tiles.rows, 2, 'dziewięć dziedzin – nadal dwa wiersze');
  assert.ok(tiles.overflow > 300, `przewijanie w bok (${tiles.overflow} px)`);
  // Lista w marginesach treści (jak pozostałe sekcje); strona się nie poszerza.
  assert.deepEqual([tiles.left, tiles.right], [16, 374]);
  assert.equal(tiles.firstLeft, 16);
  assert.ok((await overflowX(page)) <= 0, 'strona bez przewijania w bok');
  // Kolejność kolumnami: pierwsza kolumna – 1. i 2. dziedzina, następna kolumna lekko wystaje.
  const columns = await page.locator('[data-testid=start-domains] > .tile').evaluateAll((items) => items.map((tile) => {
    const box = tile.getBoundingClientRect();
    return { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right) };
  }));
  assert.equal(columns[0].left, columns[1].left);
  assert.ok(columns[1].top > columns[0].top);
  assert.ok(columns[4].left < 374 && columns[4].right > 374, 'trzecia kolumna sięga za linię marginesu');
  // Za linią marginesu kafelka nie widać – w tym miejscu jest tło strony.
  const clipped = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.tile') === null, [382, columns[4].top + 40]);
  assert.ok(clipped, 'kafelek przycięty na linii marginesu');
  const showTiles = () => page.evaluate(() => {
    for (const toast of document.querySelectorAll('.toast')) toast.remove();
    document.querySelector('[data-testid=start-domains]').closest('section').scrollIntoView({ block: 'center' });
  });
  await showTiles();
  await page.screenshot({ path: path.join(OUTPUT, 'start-dziedziny-przewijanie-telefon.png') });

  // Przewinięcie (palcem) zostaje po wejściu w dziedzinę i powrocie.
  // Lista dociąga do kolumny – czekamy, aż przewinięcie się ustali.
  await page.locator('[data-testid=start-domains]').evaluate((list) => { list.scrollLeft = 260; });
  let scrolled = -1;
  await waitUntil(async () => {
    const now = (await startTiles(page)).scrollLeft;
    const stable = now === scrolled;
    scrolled = now;
    await page.waitForTimeout(150);
    return stable;
  }, 'Przewinięcie ustalone');
  assert.ok(scrolled > 100, `przewinięte (${scrolled})`);
  // Wejście adresem kafelka (kliknięcie kafelka za krawędzią najpierw przewinęłoby listę do niego).
  await page.goto(`${base}${await page.locator('[data-testid=start-domains] .tile__link').nth(2).getAttribute('href')}`);
  await page.waitForURL(/#\/library\/domain\//);
  await page.goBack();
  await page.locator('[data-testid=start-domains]').waitFor();
  await waitUntil(async () => Math.abs((await startTiles(page)).scrollLeft - scrolled) <= 1, 'Przewinięcie przywrócone');
  await showTiles();
  await page.screenshot({ path: path.join(OUTPUT, 'start-dziedziny-przewiniete-telefon.png') });
});

test('Start na komputerze: dużo dziedzin – dwa wiersze z przewijaniem w bok i paskiem przewijania', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const base = page.url().split('#')[0];
  await seedDomains(page, 14);
  await page.goto(`${base}#/`);
  const tiles = await startTiles(page);
  assert.deepEqual([tiles.scroll, tiles.rows], [true, 2]);
  assert.ok(tiles.overflow > 0, 'przewijanie w bok');
  assert.ok((await overflowX(page)) <= 0, 'strona bez przewijania w bok');
  await page.evaluate(() => { for (const toast of document.querySelectorAll('.toast')) toast.remove(); });
  await page.screenshot({ path: path.join(OUTPUT, 'start-dziedziny-przewijanie-komputer.png') });
}, { device: DESKTOP });

test('ramki fokusu: po dotknięciu bez ramki (np. „Anuluj” w nowo otwartym oknie, menu, powrót fokusu), klawiaturą – z ramką', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const focused = () => page.evaluate(() => {
    const element = document.activeElement;
    return { text: element?.textContent?.trim(), visible: element?.matches(':focus-visible'), outline: getComputedStyle(element).outlineStyle };
  });
  // Safari po dotknięciu stawia fokus na pierwszym przycisku okna jako widoczny (:focus-visible). Chromium robi
  // tak po wciśnięciu zwykłej litery – a litera nie jest klawiszem nawigacji, więc aplikacja zostaje w trybie dotyku.
  const focusLikeSafari = async (selector) => {
    await page.keyboard.press('q');
    await page.evaluate((query) => document.querySelector(query).focus(), selector);
  };

  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).tap();
  await focusLikeSafari('dialog.menu[open] [role=menuitem]');
  let state = await focused();
  assert.equal(state.visible, true, 'fokus „widoczny” jak w Safari');
  assert.equal(state.outline, 'none', `menu po dotknięciu bez ramki (${state.text})`);
  await menuItem(page, 'Edytuj lekcję');
  const sheet = page.locator('dialog.sheet[open]');
  await sheet.waitFor();
  await focusLikeSafari('dialog.sheet[open] .sheet__header button');
  state = await focused();
  assert.deepEqual([state.text, state.visible, state.outline], ['Anuluj', true, 'none'], '„Anuluj” w nowo otwartym oknie bez ramki');
  await page.screenshot({ path: path.join(OUTPUT, 'fokus-okno-dotyk.png') });

  // Klawiatura: Tab – ramka wraca.
  await page.keyboard.press('Tab');
  state = await focused();
  assert.equal(state.outline, 'solid', `po Tab ramka widoczna (${state.text})`);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('input-pointer')), false);
  // Pisanie w polu (litery, spacja) nie włącza ramek po ponownym dotknięciu.
  await sheet.locator('input').first().tap();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('input-pointer')), true, 'dotknięcie – znów bez ramek');
  await page.keyboard.type('Nowa nazwa lekcji');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('input-pointer')), true, 'pisanie nie włącza ramek');
  await sheet.getByRole('button', { name: 'Anuluj' }).tap();
  await sheet.waitFor({ state: 'detached' });
  // Powrót fokusu po zamknięciu okna (Safari – z ramką): bez ramki.
  await focusLikeSafari('[aria-label="Więcej poleceń"]');
  state = await focused();
  assert.equal(state.outline, 'none', 'przycisk, do którego wraca fokus, bez ramki');
});

test('załączniki na komputerze: PDF w nowej karcie, dokument Word pobierany; upuszczenie pliku na edytor dodaje załącznik', async ({ open, context }) => {
  const page = await open();
  const ids = await seedNoteWithFiles(page);
  await openLessonNote(page, ids.statements);
  const dialog = noteDialog(page);
  await page.screenshot({ path: path.join(OUTPUT, 'zalaczniki-podglad-komputer.png') });

  await dialog.locator('[data-testid=note-file]').first().click();
  assert.deepEqual(await page.locator('dialog.menu[open] [role=menuitem]').allTextContents(), ['Otwórz w nowej karcie', 'Pobierz']);
  // Chromium testowy nie ma przeglądarki PDF, więc sprawdzamy adres przekazany nowej karcie i jego treść.
  await page.evaluate(() => {
    const original = window.open;
    window.open = (url, target) => {
      window.openedURL = { url, target };
      return original.call(window, url, target);
    };
  });
  const [tab] = await Promise.all([context.waitForEvent('page'), menuItem(page, 'Otwórz w nowej karcie')]);
  const opened = await page.evaluate(async () => {
    const { url, target } = window.openedURL;
    const response = await fetch(url);
    return { url, target, type: response.headers.get('content-type'), text: await response.text() };
  });
  assert.match(opened.url, /^blob:/);
  assert.deepEqual([opened.target, opened.type, opened.text], ['_blank', 'application/pdf', FAKE_PDF]);
  await tab.close();

  await dialog.locator('[data-testid=note-file]').nth(1).click();
  assert.deepEqual(await page.locator('dialog.menu[open] [role=menuitem]').allTextContents(), ['Pobierz i otwórz']);
  const file = await download(page, () => menuItem(page, 'Pobierz i otwórz'));
  assert.equal(file.name, 'Raport.docx');
  assert.deepEqual([...file.bytes], fakeDocx());

  // Upuszczenie pliku (nie obrazu) na edytor – trafia do załączników.
  await dialog.locator('[data-testid=note-right]').click();
  const transfer = await page.evaluateHandle(() => {
    const data = new window.DataTransfer();
    data.items.add(new File(['a;b\n1;2'], 'Dane.csv', { type: 'text/csv' }));
    return data;
  });
  await dialog.locator('.note-editor').dispatchEvent('drop', { dataTransfer: transfer });
  await waitUntil(async () => (await dialog.locator('[data-testid=note-attachment-name]').allTextContents()).includes('Dane.csv'), 'Upuszczony plik na liście załączników');
  await dialog.locator('.note-editor__files').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUTPUT, 'zalaczniki-edytor-komputer.png') });
}, { device: DESKTOP });

test('notatka w trakcie nauki i w szczegółach pojęcia; klawisze fiszek nie działają pod oknem notatki', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate((id) => window.lexicards.library.saveNote(id, { html: '<p>Ściąga do lekcji</p>', images: [] }), ids.statements);

  // Szczegóły pojęcia w glosariuszu.
  await page.goto(`${page.url().split('#')[0]}#/library/glossary`);
  await page.fill('[data-testid=search]', 'bilans');
  await page.locator('.term__toggle').first().click();
  await page.click('[data-testid=term-lesson-note]');
  await expectText(noteDialog(page).locator('[data-testid=note-text]'), 'Ściąga do lekcji');
  await noteDialog(page).locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });

  // Sesja nauki tej lekcji: przycisk notatki przy fiszce.
  await page.goto(`${page.url().split('#')[0]}#/study/lesson/${ids.statements}`);
  await page.waitForSelector('[data-testid=study-planned]');
  await page.click('[data-testid=study-start]');
  await page.waitForSelector('[data-testid=flashcard]');
  await page.getByRole('button', { name: 'Notatka lekcji' }).click();
  await expectText(noteDialog(page).locator('[data-testid=note-text]'), 'Ściąga do lekcji');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-testid=flashcard]').getAttribute('data-side'), 'front', 'spacja pod oknem nie odwraca fiszki');
  await page.keyboard.press('Escape');
  await noteDialog(page).waitFor({ state: 'detached' });
  // Fokus nie zostaje na przycisku notatki (inaczej spacja otworzyłaby ją ponownie).
  await waitUntil(() => page.evaluate(() => document.activeElement === document.body), 'Fokus powinien wrócić do strony');
  await page.keyboard.press('Space');
  await waitUntil(async () => (await page.locator('[data-testid=flashcard]').getAttribute('data-side')) === 'back', 'Po zamknięciu notatki spacja odwraca fiszkę');
});

test('okno notatki na wąskim ekranie 320 px i w ciemnym motywie: nic nie wystaje, pasek formatowania przewija się', async ({ open }) => {
  const page = await open();
  await page.setViewportSize({ width: 320, height: 640 });
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate(async (id) => {
    const bytes = await (await fetch('./icons/icon-512.png')).arrayBuffer();
    await window.lexicards.library.saveNote(id, {
      html: '<h3>Bardzodługiesłowobezspacjiktóremusisięzawinąćwoknienotatki</h3><p>https://example.com/bardzo/dlugi/adres/bez/spacji/ktory/nie/moze/wyjsc/poza/ekran</p>',
      images: [{ bytes, type: 'image/png', width: 512, height: 512 }]
    });
  }, ids.statements);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  assert.ok((await overflowX(page)) <= 0, 'ekran lekcji z notatką mieści się w 320 px');
  await page.click('[data-testid=lesson-note]');
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-text]').waitFor();
  const fits = () => dialog.evaluate((element) => {
    const panel = element.querySelector('.sheet__panel').getBoundingClientRect();
    return [...element.querySelectorAll('.note-text, .note-page, .note-page__figure img, .note-toolbar, .note-images, .button')]
      .every((child) => { const box = child.getBoundingClientRect(); return box.left >= panel.left - 0.5 && box.right <= panel.right + 0.5; });
  });
  assert.equal(await fits(), true, 'podgląd mieści się w oknie');
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-editor]').waitFor();
  assert.equal(await fits(), true, 'edytor mieści się w oknie');
  const toolbar = await dialog.locator('.note-toolbar').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  assert.ok(toolbar.scroll >= toolbar.client, 'pasek formatowania może się przewijać');
  const color = await dialog.locator('.note-editor__area').evaluate((element) => getComputedStyle(element).color);
  assert.equal(color, 'rgb(255, 255, 255)', 'w ciemnym motywie tekst jest jasny');
});

const LONG_SENTENCE = 'Zasada lex superior derogat legi inferiori oznacza, że akt wyższego rzędu uchyla akt niższego rzędu w zakresie, w jakim są ze sobą sprzeczne. ';

/** Czeka, aż książka notatki pokaże stronę `number` (po zakończonym obrocie kartki). */
async function notePageShown(page, number) {
  const dialog = noteDialog(page);
  await waitUntil(async () => (await dialog.locator('[data-testid=note-book]').getAttribute('data-page')) === String(number)
    && (await dialog.locator('[data-testid=note-page]').count()) === 1, `Powinna być widoczna strona ${number}`);
}

test('notatka w stronach: długi tekst bez przewijania, podział akapitu i listy, przewracanie przyciskami, klawiszami i palcem', async ({ open, context }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const items = Array.from({ length: 24 }, (_, index) => `Punkt numer ${index + 1} listy`);
  const paragraph = LONG_SENTENCE.repeat(16).trim();
  const html = `<h3>Hierarchia źródeł</h3><p>Konstytucja jest <strong>najwyższym prawem</strong>.</p><ol>${items.map((item) => `<li>${item}</li>`).join('')}</ol>`
    + `<h3>Zasady kolizyjne</h3><p>${paragraph}</p><p>Ostatni akapit tekstu.</p>`;
  await page.evaluate(async ([id, noteHtml]) => {
    const bytes = await (await fetch('./icons/icon-512.png')).arrayBuffer();
    await window.lexicards.library.saveNote(id, { html: noteHtml, images: [{ bytes, type: 'image/png', width: 512, height: 512 }] });
  }, [ids.statements, html]);
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.click('[data-testid=lesson-note]');
  const dialog = noteDialog(page);
  const book = dialog.locator('[data-testid=note-book]');
  await book.waitFor();

  // Po otwarciu fokus jest na oknie, a nie na „Zamknij” (Safari obrysowywał przycisk ramką).
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('note-sheet')), true);
  const total = Number(await book.getAttribute('data-pages'));
  assert.ok(total >= 4, `długa notatka powinna mieć kilka stron (jest ${total})`);
  await expectText(dialog.locator('[data-testid=note-page-indicator]'), `1 z ${total}`);
  assert.equal(await dialog.locator('[data-testid=note-page-previous]').isDisabled(), true);
  assert.ok(await dialog.locator('.sheet__body').evaluate((element) => element.scrollHeight <= element.clientHeight + 1), 'okno się nie przewija');

  // Każda strona mieści się bez przewijania; cała treść jest, w tej samej kolejności.
  const pages = await walkNotePages(page);
  pages.forEach((item, index) => assert.ok(item.overflow <= 1, `strona ${index + 1} wystaje o ${item.overflow} px`));
  const joined = pages.map((item) => item.text).join(' ');
  assert.ok(joined.includes(paragraph), 'długi akapit podzielony między wyrazami, bez zgubionych słów');
  let position = 0;
  for (const item of [...items, 'Zasady kolizyjne', 'Ostatni akapit tekstu.']) {
    const found = joined.indexOf(item, position);
    assert.ok(found >= position, `„${item}” na swoim miejscu`);
    position = found;
  }
  assert.equal(pages.reduce((sum, item) => sum + item.figures, 0), 1, 'obraz na stronie po tekście');
  await expectText(dialog.locator('[data-testid=note-page-indicator]'), `${total} z ${total}`);
  assert.equal(await dialog.locator('[data-testid=note-page-next]').isDisabled(), true);

  // Lista na dwóch stronach: numeracja biegnie dalej.
  await page.keyboard.press('Home');
  await notePageShown(page, 1);
  await page.keyboard.press('ArrowRight');
  await notePageShown(page, 2);
  const list = dialog.locator('[data-testid=note-page] ol').first();
  const start = Number(await list.getAttribute('start'));
  assert.ok(start > 1, 'druga strona zaczyna listę od dalszego numeru');
  await expectText(list.locator('li').first(), `Punkt numer ${start} listy`);
  await page.keyboard.press('ArrowLeft');
  await notePageShown(page, 1);
  await page.keyboard.press('End');
  await notePageShown(page, total);
  await page.keyboard.press('PageUp');
  await notePageShown(page, total - 1);

  // Palcem: w lewo – następna strona, w prawo – poprzednia, krótki ruch wraca.
  await page.keyboard.press('Home');
  await notePageShown(page, 1);
  await touchDrag(context, page, book, -230);
  await notePageShown(page, 2);
  await touchDrag(context, page, book, 230);
  await notePageShown(page, 1);
  await touchDrag(context, page, book, -14);
  await notePageShown(page, 1);

  // W trakcie przeciągania kartka zagina się (strona przycięta wzdłuż zgięcia), a pod nią jest już następna strona.
  const { end } = await touchDrag(context, page, book, -150, { release: false });
  const turning = await dialog.locator('[data-testid=note-page]').evaluateAll((elements) => elements.map((element) => ({
    page: element.dataset.page, clip: element.style.clipPath
  })));
  assert.equal(turning.length, 2, 'dwie strony w trakcie przewracania');
  assert.equal(turning[0].page, '2', 'pod spodem następna strona');
  assert.match(turning[1].clip, /^polygon\(/);
  await end();
  await notePageShown(page, 2);

  // Obraz na stronie powiększa się dotknięciem.
  await page.keyboard.press('End');
  await notePageShown(page, total);
  await dialog.locator('.note-page__figure').click();
  await page.locator('dialog.lightbox[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog.lightbox[open]').waitFor({ state: 'detached' });
  assert.equal(await noteDialog(page).count(), 1);

  // Niższe okno: strony liczone od nowa, nadal bez przewijania.
  await page.setViewportSize({ width: 390, height: 640 });
  await waitUntil(async () => Number(await book.getAttribute('data-pages')) > total, 'Na niższym ekranie powinno być więcej stron');
  for (const [index, item] of (await walkNotePages(page)).entries()) assert.ok(item.overflow <= 1, `po zmianie: strona ${index + 1} wystaje o ${item.overflow} px`);

  // Obrazy przed tekstem: obraz na pierwszej stronie, za nim cała treść – nadal bez przewijania.
  await page.evaluate(async (id) => {
    const library = window.lexicards.library;
    const note = library.getNote(id);
    await library.saveNote(id, { html: note.html, images: note.images.map((image) => ({ id: image.id })), imagesFirst: true });
  }, ids.statements);
  await dialog.locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  await page.click('[data-testid=lesson-note]');
  await book.waitFor();
  const first = await walkNotePages(page);
  assert.equal(first[0].figures, 1, 'obraz na pierwszej stronie');
  assert.equal(first.reduce((sum, item) => sum + item.figures, 0), 1);
  first.forEach((item, index) => assert.ok(item.overflow <= 1, `obrazy przed tekstem: strona ${index + 1} wystaje o ${item.overflow} px`));
  assert.ok(first.map((item) => item.text).join(' ').includes(paragraph), 'cała treść po obrazie');
});

/** Długa notatka (kilka stron) w lekcji „Financial Statements”, otwarta w podglądzie. */
async function openLongNote(page, { paragraphs = 16 } = {}) {
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const items = Array.from({ length: 14 }, (_, index) => `<li>Punkt numer ${index + 1} listy</li>`).join('');
  const html = `<h3>Hierarchia źródeł</h3><p>${LONG_SENTENCE.repeat(4)}</p><ol>${items}</ol>`
    + `<h3>Zasady kolizyjne</h3><p>${LONG_SENTENCE.repeat(paragraphs).trim()}</p><p>Ostatni akapit tekstu.</p>`;
  await page.evaluate(([id, noteHtml]) => window.lexicards.library.saveNote(id, { html: noteHtml, images: [] }), [ids.statements, html]);
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.click('[data-testid=lesson-note]');
  const book = noteDialog(page).locator('[data-testid=note-book]');
  await book.waitFor();
  // Okno już się nie wysuwa – położenie stron jest stałe.
  await waitUntil(() => noteDialog(page).locator('.sheet__panel').evaluate((panel) => panel.getAnimations().length === 0), 'Okno notatki otwarte');
  return { ids, book };
}

test('notatka po zapisie z otwartą klawiaturą (iPhone): po schowaniu klawiatury strony dzielą się od nowa', async ({ open }) => {
  const page = await open();
  const { book } = await openLongNote(page);
  const pages = () => book.evaluate((element) => Number(element.dataset.pages));
  const fresh = await pages();
  assert.ok(fresh >= 2, 'długa notatka ma kilka stron');

  // Klawiatura iPhone'a: widoczna część ekranu jest niższa, a okno notatki razem z nią
  // (aplikacja ustawia --vv-height ze zdarzeń visualViewport). Chromium klawiatury nie ma – udajemy ją.
  await noteDialog(page).locator('[data-testid=note-right]').click();
  await noteDialog(page).locator('[data-testid=note-editor]').waitFor();
  await page.evaluate(() => document.documentElement.style.setProperty('--vv-height', '380px'));
  await noteDialog(page).locator('[data-testid=note-right]').click();
  await page.locator('.toast', { hasText: 'Zapisano notatkę.' }).waitFor();
  await book.waitFor();
  const squeezed = await pages();
  assert.ok(squeezed > fresh, `przy klawiaturze stron jest więcej (${squeezed} > ${fresh})`);

  // Klawiatura się chowa: visualViewport zgłasza zmianę wielkości, okno notatki rośnie.
  await page.evaluate(() => window.visualViewport.dispatchEvent(new window.Event('resize')));
  await waitUntil(async () => (await pages()) === fresh, `Po schowaniu klawiatury ${fresh} stron jak po otwarciu`);
  const fits = await book.evaluate((element) => {
    const content = element.querySelector('[data-testid=note-page] .note-page__content');
    return content.scrollHeight <= content.clientHeight + 1;
  });
  assert.ok(fits, 'strona mieści się bez przewijania');
});

/** Punkty wielokąta z clip-path: polygon(…) w pikselach strony; [] – strona bez przycięcia. */
function polygonPoints(clip) {
  const match = /polygon\((.*)\)/.exec(clip ?? '');
  if (!match) return [];
  return match[1].split(',').map((pair) => {
    const [x, y] = pair.trim().split(/\s+/).map((value) => parseFloat(value));
    return { x, y };
  });
}

const hasPoint = (points, x, y) => points.some((point) => Math.abs(point.x - x) < 1 && Math.abs(point.y - y) < 1);

/**
 * Przewracana kartka w otwartej notatce: widoczne strony (w kolejności warstw), która jest
 * przewracana (przycięta wzdłuż zgięcia), zagięty płat (strona, lustro – ujemny wyznacznik)
 * i przezroczystość cieni.
 */
function curlState(page) {
  return noteDialog(page).locator('[data-testid=note-book]').evaluate((book) => {
    const pages = [...book.querySelectorAll(':scope > [data-testid=note-page]')];
    const turning = pages.find((element) => element.style.clipPath);
    const flap = book.querySelector('.note-page--flap');
    const matrix = flap ? new window.DOMMatrix(getComputedStyle(flap).transform) : null;
    const band = (name) => Number(book.querySelector(`.note-curl__band--${name}`)?.style.opacity || 0);
    return {
      pages: pages.map((element) => element.dataset.page),
      turning: turning?.dataset.page ?? null,
      clip: turning?.style.clipPath ?? '',
      width: turning?.offsetWidth ?? 0,
      height: turning?.offsetHeight ?? 0,
      flap: flap ? {
        page: flap.dataset.page ?? null,
        back: flap.classList.contains('note-page--back'),
        determinant: matrix.a * matrix.d - matrix.b * matrix.c,
        text: flap.textContent
      } : null,
      cast: band('cast'),
      fold: band('fold'),
      light: band('light')
    };
  });
}

/**
 * Czy zagięty płat widać w punkcie przy jego skrajnym wierzchołku (which: 'top' – najwyższy,
 * 'left' – najbardziej z lewej); punkt leży 4 px w głąb płata. Zwraca punkt, obrys książki
 * i okna oraz to, czy w tym miejscu na wierzchu jest płat (z uwzględnieniem przycięć).
 */
function flapProbe(page, which) {
  return noteDialog(page).locator('[data-testid=note-book]').evaluate((book, side) => {
    const flap = book.querySelector('.note-page--flap');
    const box = book.getBoundingClientRect();
    const matrix = new window.DOMMatrix(getComputedStyle(flap).transform);
    const points = /polygon\((.*)\)/.exec(flap.style.clipPath)[1].split(',').map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map((value) => parseFloat(value));
      const point = matrix.transformPoint(new window.DOMPoint(x, y));
      return { x: box.left + point.x, y: box.top + point.y };
    });
    const center = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
    const extreme = points.reduce((best, point) => ((side === 'top' ? point.y < best.y : point.x < best.x) ? point : best));
    const toward = Math.hypot(center.x - extreme.x, center.y - extreme.y) || 1;
    const probe = { x: extreme.x + ((center.x - extreme.x) * 4) / toward, y: extreme.y + ((center.y - extreme.y) * 4) / toward };
    // Płat nie przyjmuje dotknięć (i bywa inert) – na czas sprawdzenia elementFromPoint go „widzi”.
    const layers = [book.querySelector('.note-curl__flap'), book.querySelector('.note-curl__lift'), flap];
    const inert = flap.inert;
    flap.inert = false;
    for (const layer of layers) layer.style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(probe.x, probe.y);
    for (const layer of layers) layer.style.pointerEvents = '';
    flap.inert = inert;
    const panel = book.closest('.sheet__panel').getBoundingClientRect();
    return {
      probe, book: { top: box.top, left: box.left }, panel: { top: panel.top, left: panel.left },
      visible: Boolean(hit?.closest('.note-curl__flap'))
    };
  }, which);
}

/** Dotyk przytrzymany: start w punkcie (x, y), ruchy palca, puszczenie osobno. */
async function touchAt(context, page, x, y) {
  const client = await context.newCDPSession(page);
  let last = { x, y };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  return {
    async move(toX, toY, steps = 8) {
      for (let step = 1; step <= steps; step += 1) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: last.x + ((toX - last.x) * step) / steps, y: last.y + ((toY - last.y) * step) / steps, id: 1 }]
        });
      }
      last = { x: toX, y: toY };
    },
    end: () => client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  };
}

test('notatka: kartka zagina się od chwyconego rogu (dół, góra, krawędź), odwrót z lustrzanym tekstem, cienie, grzbiet', async ({ open, context }) => {
  const page = await open();
  const { ids, book } = await openLongNote(page);
  const dialog = noteDialog(page);
  // Bez stosu pod stroną; na telefonie nie ma przełącznika dwóch stron.
  assert.equal(await book.evaluate((element) => getComputedStyle(element, '::before').content), 'none');
  assert.equal(await book.getAttribute('data-spread'), 'false');
  assert.equal(await dialog.locator('[data-testid=note-spread]').isVisible(), false);
  const box = await book.boundingBox();
  const right = box.x + box.width - 12;
  const bottom = box.y + box.height - 16;

  // Dolny róg: zagina się dół, górny róg i grzbiet leżą płasko; pod spodem następna strona.
  let touch = await touchAt(context, page, right, bottom);
  await touch.move(right - 110, bottom - 40);
  let state = await curlState(page);
  assert.deepEqual(state.pages, ['2', '1'], 'pod spodem następna strona');
  assert.equal(state.turning, '1');
  let flat = polygonPoints(state.clip);
  assert.ok(hasPoint(flat, state.width, 0), `górny róg płasko: ${state.clip}`);
  assert.ok(!hasPoint(flat, state.width, state.height), 'dolny róg zagięty');
  assert.ok(hasPoint(flat, 0, 0) && hasPoint(flat, 0, state.height), 'grzbiet płasko');
  // Odwrót kartki: ta sama strona w lustrze (ujemny wyznacznik przekształcenia), wyblakła.
  assert.equal(state.flap.back, true);
  assert.ok(state.flap.determinant < -0.99, 'odwrót jest lustrzany');
  assert.ok(state.flap.text.includes('Hierarchia źródeł'), 'na odwrocie prześwituje tekst tej samej strony');
  const faded = await dialog.locator('.note-page--back .note-page__content').evaluate((element) => Number(getComputedStyle(element).opacity));
  assert.ok(faded > 0 && faded < 0.5, `tekst odwrotu wyblakły (${faded})`);
  // Cienie: rzucany na stronę pod spodem, przy zgięciu na płaskiej części i jasny pas na płacie.
  assert.ok(state.cast > 0 && state.fold > 0 && state.light > 0, `cienie: ${JSON.stringify(state)}`);
  const firstCast = state.cast;
  await touch.move(right - 170, bottom - 90);
  state = await curlState(page);
  assert.ok(state.cast > firstCast, 'cień rzucany rośnie, gdy kartka się unosi');
  // Palec ucieka daleko w górę i w lewo – kartka nie odrywa się od grzbietu.
  await touch.move(box.x - 300, box.y - 400);
  state = await curlState(page);
  flat = polygonPoints(state.clip);
  assert.ok(hasPoint(flat, 0, 0) && hasPoint(flat, 0, state.height), `grzbiet nadal płasko: ${state.clip}`);
  // Palec wraca – kartka wraca na miejsce.
  await touch.move(right, bottom);
  await touch.end();
  await notePageShown(page, 1);

  // Górny róg: zagina się góra.
  touch = await touchAt(context, page, right, box.y + 16);
  await touch.move(right - 110, box.y + 60);
  state = await curlState(page);
  flat = polygonPoints(state.clip);
  assert.ok(hasPoint(flat, state.width, state.height) && !hasPoint(flat, state.width, 0), `zagięta góra: ${state.clip}`);
  await touch.move(right, box.y + 16);
  await touch.end();
  await notePageShown(page, 1);

  // Środek krawędzi: kartka zgina się prosto, pionowo – także gdy palec idzie ukosem.
  touch = await touchAt(context, page, right, box.y + box.height / 2);
  await touch.move(right - 160, box.y + box.height / 2 - 50);
  state = await curlState(page);
  const columns = [...new Set(polygonPoints(state.clip).map((point) => Math.round(point.x)))].sort((a, b) => a - b);
  assert.equal(columns.length, 2, `zgięcie pionowe: ${state.clip}`);
  assert.equal(columns[0], 0);
  await touch.end();
  await notePageShown(page, 2);

  // Wstecz od lewej krawędzi: poprzednia strona wraca nad bieżącą i zagina się tak samo.
  touch = await touchAt(context, page, box.x + 12, bottom);
  await touch.move(box.x + 150, bottom + 8);
  state = await curlState(page);
  assert.deepEqual(state.pages, ['2', '1'], 'poprzednia strona nad bieżącą');
  assert.equal(state.turning, '1');
  assert.ok(state.flap.determinant < -0.99);
  assert.ok(!hasPoint(polygonPoints(state.clip), state.width, state.height), 'dolny róg zagięty');
  // Kartka wychodzi w górę poza stronę (nad tytuł lekcji), ale w lewy margines – nie.
  const above = await flapProbe(page, 'top');
  assert.ok(above.probe.y < above.book.top - 2, `płat sięga nad stronę: ${JSON.stringify(above)}`);
  assert.equal(above.visible, true, 'nad stroną widać kartkę');
  const aside = await flapProbe(page, 'left');
  assert.ok(aside.probe.x < aside.book.left - 2, `płat sięga w lewo za stronę: ${JSON.stringify(aside)}`);
  assert.equal(aside.visible, false, 'w lewym marginesie kartki nie widać');
  await touch.end();
  await notePageShown(page, 1);

  // Przycisk: kartka przewraca się od dolnego rogu.
  await dialog.locator('[data-testid=note-page-next]').click();
  await page.waitForTimeout(250);
  state = await curlState(page);
  flat = polygonPoints(state.clip);
  assert.ok(flat.length >= 3 && !hasPoint(flat, state.width, state.height), `przycisk zagina dolny róg: ${state.clip}`);
  await notePageShown(page, 2);
  assert.equal(await dialog.locator('.note-curl__flap, .note-page--back').count(), 0, 'po przewróceniu nie zostają warstwy kartki');

  // Notatka zaczynająca się długim akapitem (na kilka stron) otwiera się na pierwszej stronie.
  await page.evaluate(([id, noteHtml]) => window.lexicards.library.saveNote(id, { html: noteHtml, images: [] }),
    [ids.statements, `<p>${LONG_SENTENCE.repeat(30).trim()}</p>`]);
  await dialog.locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  await page.click('[data-testid=lesson-note]');
  await book.waitFor();
  assert.ok(Number(await book.getAttribute('data-pages')) > 2);
  assert.equal(await book.getAttribute('data-page'), '1');
});

test('notatka: dwie strony obok siebie na dużym ekranie – przewracanie jak w książce, myszą za narożnik, wybór zapamiętany', async ({ open }) => {
  const page = await open();
  const { book } = await openLongNote(page, { paragraphs: 34 });
  const dialog = noteDialog(page);
  const shown = () => dialog.locator('[data-testid=note-book] > .note-page');
  const showing = (first) => waitUntil(async () => (await book.getAttribute('data-page')) === String(first)
    && (await shown().count()) === 2, `Powinny być widoczne strony od ${first}`);
  assert.equal(await book.getAttribute('data-spread'), 'true');
  const total = Number(await book.getAttribute('data-pages'));
  assert.ok(total >= 6, `notatka powinna mieć kilka stron (jest ${total})`);
  await showing(1);
  const bookBox = await book.boundingBox();
  const [left, right] = [await shown().nth(0).boundingBox(), await shown().nth(1).boundingBox()];
  assert.ok(Math.abs(left.y - right.y) < 1 && Math.abs(left.width - right.width) < 1, 'strony tej samej wielkości');
  assert.ok(right.x >= left.x + left.width - 1 && left.width + right.width >= bookBox.width - 2, 'obok siebie, na całą szerokość');
  assert.ok(bookBox.width > 900, 'okno notatki jest szersze');
  await expectText(dialog.locator('[data-testid=note-page-indicator]'), `1–2 z ${total}`);
  assert.equal(await dialog.locator('[data-testid=note-spread]').getAttribute('aria-pressed'), 'true');
  for (const index of [0, 1]) assert.ok(await pageOverflow(shown().nth(index)) <= 1, `strona ${index + 1} mieści się`);

  // Przycisk: prawa strona przewraca się przez grzbiet; na jej odwrocie jest strona 3 – czytelna.
  await dialog.locator('[data-testid=note-page-next]').click();
  await page.waitForTimeout(300);
  let state = await curlState(page);
  assert.equal(state.turning, '2');
  assert.equal(state.flap.page, '3');
  assert.ok(state.flap.determinant > 0.99, 'odwrót to następna strona, nie lustro');
  await showing(3);
  assert.deepEqual(await shown().evaluateAll((elements) => elements.map((element) => element.dataset.page)), ['3', '4']);
  await expectText(dialog.locator('[data-testid=note-page-indicator]'), `3–4 z ${total}`);

  // Myszą: chwyt za prawy dolny narożnik (kursor „chwyć”) i przeciągnięcie w lewo.
  await page.mouse.move(bookBox.x + bookBox.width - 14, bookBox.y + bookBox.height - 14);
  assert.match(await book.getAttribute('class'), /note-book--grab/);
  await page.mouse.down();
  await page.mouse.move(bookBox.x + bookBox.width * 0.6, bookBox.y + bookBox.height - 80, { steps: 8 });
  state = await curlState(page);
  assert.equal(state.turning, '4');
  assert.equal(state.flap.page, '5');
  // Mocno uniesiony róg: kartka wychodzi nad strony (na tytuł lekcji), a przycina ją dopiero okno.
  await page.mouse.move(bookBox.x + bookBox.width * 0.48, bookBox.y + bookBox.height - 170, { steps: 8 });
  const above = await flapProbe(page, 'top');
  assert.ok(above.probe.y < above.book.top - 2, `płat sięga nad strony: ${JSON.stringify(above)}`);
  assert.equal(above.visible, true, 'nad stronami widać kartkę');
  assert.ok(above.probe.y > above.panel.top, 'w obrębie okna');
  assert.equal(await dialog.locator('.sheet__panel').evaluate((panel) => getComputedStyle(panel).overflow), 'hidden', 'okno przycina kartkę');
  await page.mouse.move(bookBox.x + bookBox.width * 0.2, bookBox.y + bookBox.height - 30, { steps: 8 });
  await page.mouse.up();
  await showing(5);

  // Wstecz: lewy górny narożnik w prawo – lewa strona wraca, na jej odwrocie strona 4.
  await page.mouse.move(bookBox.x + 14, bookBox.y + 14);
  await page.mouse.down();
  await page.mouse.move(bookBox.x + bookBox.width * 0.45, bookBox.y + 60, { steps: 8 });
  state = await curlState(page);
  assert.equal(state.turning, '5');
  assert.equal(state.flap.page, '4');
  await page.mouse.move(bookBox.x + bookBox.width * 0.85, bookBox.y + 30, { steps: 8 });
  await page.mouse.up();
  await showing(3);

  // Przeciąganie myszą w tekście (poza narożnikami) zaznacza tekst i nie przewraca kartki.
  const text = await shown().nth(0).locator('.note-text').first().boundingBox();
  await page.mouse.move(text.x + 40, text.y + text.height / 2);
  await page.mouse.down();
  await page.mouse.move(text.x + 300, text.y + text.height / 2 + 4, { steps: 6 });
  await page.mouse.up();
  assert.equal(await book.getAttribute('data-page'), '3');
  assert.ok((await page.evaluate(() => window.getSelection().toString())).trim().length > 0, 'tekst zaznaczony');

  // Ostatnia para stron; przy nieparzystej liczbie stron po prawej jest pusta kartka.
  await page.keyboard.press('End');
  const lastLeft = total % 2 === 0 ? total - 1 : total;
  await showing(lastLeft);
  assert.equal(await shown().nth(1).evaluate((element) => element.classList.contains('note-page--blank')), total % 2 === 1);
  assert.equal(await dialog.locator('[data-testid=note-page-next]').isDisabled(), true);
  await page.keyboard.press('Home');
  await showing(1);

  // Kółko myszy: w dół – następna para stron, w górę – poprzednia.
  await page.mouse.move(bookBox.x + bookBox.width / 2, bookBox.y + bookBox.height / 2);
  await page.mouse.wheel(0, 100);
  await showing(3);
  await page.mouse.wheel(0, -100);
  await showing(1);
  // Szybka seria drobnych ruchów (gładzik z bezwładnością) przewraca tylko jedną kartkę.
  for (let step = 0; step < 14; step += 1) await page.mouse.wheel(0, 15);
  await showing(3);
  await page.waitForTimeout(900);
  assert.equal(await book.getAttribute('data-page'), '3', 'seria ruchów to jedna kartka');
  await page.mouse.wheel(0, -100);
  await showing(1);

  // Przełącznik: jedna strona; wybór zapamiętany (ustawienia) i po ponownym otwarciu notatki.
  await dialog.locator('[data-testid=note-spread]').click();
  await waitUntil(async () => (await book.getAttribute('data-spread')) === 'false' && (await shown().count()) === 1, 'Jedna strona');
  assert.equal(await dialog.locator('[data-testid=note-spread]').getAttribute('aria-pressed'), 'false');
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().noteSpread === false), 'Wybór zapisany w ustawieniach');
  await dialog.locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  await page.click('[data-testid=lesson-note]');
  await book.waitFor();
  assert.equal(await book.getAttribute('data-spread'), 'false');
  await dialog.locator('[data-testid=note-spread]').click();
  await waitUntil(async () => (await book.getAttribute('data-spread')) === 'true' && (await shown().count()) === 2, 'Znów dwie strony');
}, { device: DESKTOP });

/** Zapisuje notatkę lekcji „Financial Statements” z obrazami (ikony aplikacji) i otwiera ją w podglądzie. */
async function openNoteWithImages(page, { html, htmlEN = '', labels = [], imagesFirst = false }) {
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate(async ([id, note]) => {
    const files = ['./icons/icon-512.png', './icons/icon-192.png'];
    const images = [];
    for (const [index, label] of note.labels.entries()) {
      const bytes = await (await fetch(files[index % files.length])).arrayBuffer();
      images.push({ bytes, type: 'image/png', width: index % 2 ? 192 : 512, height: index % 2 ? 192 : 512, label });
    }
    await window.lexicards.library.saveNote(id, { html: note.html, htmlEN: note.htmlEN, images, imagesFirst: note.imagesFirst });
  }, [ids.statements, { html, htmlEN, labels, imagesFirst }]);
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.click('[data-testid=lesson-note]');
  const book = noteDialog(page).locator('[data-testid=note-book]');
  await book.waitFor();
  await waitUntil(() => noteDialog(page).locator('.sheet__panel').evaluate((panel) => panel.getAnimations().length === 0), 'Okno notatki otwarte');
  return { ids, book };
}

test('równania w notatce: $…$ jako wzór w podglądzie, kwoty zostają tekstem, czytanie słowami; przycisk wzoru, ściągawka i wstawianie w edytorze', async ({ open, context }) => {
  await fakeSpeechForListening(context);
  const page = await open();
  const html = String.raw`<p>Pole koła: $P = \pi r^2$, obwód $2\pi r$. Kwoty $20 i $30 zostają tekstem.</p>`
    + String.raw`<p>$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$</p>`
    + String.raw`<p>Suma $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$, granica $\lim_{x \to 0} \frac{\sin x}{x} = 1$, błąd $\foo + 1$.</p>`;
  const { ids } = await openNoteWithImages(page, { html });
  const dialog = noteDialog(page);
  const text = dialog.locator('[data-testid=note-text]');
  const formulas = () => text.locator('math').evaluateAll((items) => items.map((math) => ({
    source: math.getAttribute('data-source'), display: math.getAttribute('display'), spoken: math.getAttribute('data-spoken'),
    tags: [...math.querySelectorAll('*')].map((node) => node.localName), height: math.getBoundingClientRect().height,
    error: math.querySelector('.math-error') !== null
  })));
  const shown = await formulas();
  assert.deepEqual(shown.map((formula) => formula.source), [
    String.raw`P = \pi r^2`, String.raw`2\pi r`, String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
    String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`, String.raw`\lim_{x \to 0} \frac{\sin x}{x} = 1`, String.raw`\foo + 1`
  ]);
  assert.deepEqual(shown.map((formula) => formula.display), [null, null, 'block', null, null, null], 'tylko $$…$$ w osobnym wierszu');
  assert.ok(shown[0].tags.includes('msup'), 'potęga');
  assert.ok(['mfrac', 'msqrt'].every((tag) => shown[2].tags.includes(tag)), 'ułamek i pierwiastek');
  assert.ok(shown[3].tags.includes('munderover'), 'suma z granicami');
  assert.ok(shown[2].height > 34, `wzór z ułamkiem jest wyższy od wiersza (${shown[2].height} px)`);
  assert.deepEqual(shown.map((formula) => formula.error), [false, false, false, false, false, true], 'nieznane polecenie oznaczone');
  await expectText(text, 'Kwoty $20 i $30 zostają tekstem.');
  assert.equal(shown[0].spoken, 'P równa się pi r do kwadratu');
  await page.screenshot({ path: path.join(OUTPUT, 'rownania-podglad-telefon.png') });

  // Czytanie na głos: wzory słowami.
  await dialog.locator('[data-testid=note-listen]').click();
  await waitUntil(() => page.evaluate(() => window.spokenTexts.some((item) => item.text.includes('pierwiastek z b do kwadratu'))), 'Wzór przeczytany słowami');
  const spoken = (await page.evaluate(() => window.spokenTexts.map((item) => item.text))).join(' ');
  assert.ok(spoken.includes('P równa się pi r do kwadratu'), spoken);
  assert.ok(!spoken.includes('\\'), 'bez znaków zapisu');
  await dialog.locator('[data-testid=note-listen]').click();

  // Edytor: przycisk wzoru wstawia $$ z kursorem w środku.
  await dialog.locator('[data-testid=note-right]').click();
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.waitFor();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await dialog.locator('[data-testid=note-format-equation]').click();
  await page.keyboard.type('E=mc^2');
  await waitUntil(async () => (await editor.textContent()).includes('$E=mc^2$'), 'Wzór wpisany między znaki dolara');
  // Kursor stoi przed zamykającym $ – dalszy tekst za wzorem.
  await page.keyboard.press('End');
  await page.keyboard.type(' oraz ');
  await dialog.locator('[data-testid=note-format-equation]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUTPUT, 'rownania-edytor-telefon.png') });

  // Ściągawka: pole „Wypróbuj” z podglądem, błąd zapisu, przykład wpisany dotknięciem, „Wstaw”.
  await dialog.locator('[data-testid=note-format-equationHelp]').click();
  const help = page.locator('dialog.sheet[open]', { hasText: 'Wypróbuj' });
  await help.waitFor();
  await expectText(help.locator('.sheet__title'), 'Równania');
  assert.ok(await help.locator('[data-testid=math-example]').count() >= 25, 'przykłady w ściągawce');
  assert.ok(await help.locator('[data-testid=math-example] math').count() >= 24, 'przy przykładach – gotowe wzory');
  await help.locator('[data-testid=math-try]').fill(String.raw`\frac{1}{2}`);
  assert.equal(await help.locator('[data-testid=math-preview] mfrac').count(), 1);
  await expectText(help.locator('[data-testid=math-message]'), String.raw`W notatce wpisz: $\frac{1}{2}$`);
  await help.locator('[data-testid=math-try]').fill(String.raw`\bogus`);
  await expectText(help.locator('[data-testid=math-message]'), String.raw`Nieznane polecenie: \bogus`);
  await help.getByRole('button', { name: /pierwiastek kwadratowy/ }).click();
  assert.equal(await help.locator('[data-testid=math-try]').inputValue(), String.raw`\sqrt{x}`);
  await help.locator('.sheet__body').evaluate((body) => { body.scrollTop = 0; });
  await help.evaluate((sheet) => Promise.all(sheet.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await page.screenshot({ path: path.join(OUTPUT, 'rownania-sciagawka-telefon.png') });
  await help.getByRole('button', { name: 'Wstaw' }).click();
  await help.waitFor({ state: 'detached' });
  await waitUntil(async () => (await editor.textContent()).includes(String.raw`$\sqrt{x}$`), 'Wzór ze ściągawki wstawiony');

  // Zapis: zapis zostaje tekstem w notatce, podgląd pokazuje nowe wzory.
  await dialog.locator('[data-testid=note-right]').click();
  await page.locator('.toast', { hasText: 'Zapisano notatkę.' }).waitFor();
  const note = await storedNote(page, ids.statements);
  assert.ok(note.html.includes(String.raw`$E=mc^2$ oraz $\sqrt{x}$`), note.html);
  await waitUntil(async () => (await formulas()).length === 8, 'Nowe wzory w podglądzie');
});

test('równania: długi akapit ze wzorami dzieli się na strony między wyrazami – żaden wzór nie jest rozcięty', async ({ open }) => {
  const page = await open();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const formula = String.raw`a_{i}^{2} + \frac{b}{c}`;
  const paragraph = Array.from({ length: 70 }, (_, index) => `Wyraz ${index + 1} to $${formula}$ dalej.`).join(' ');
  const { book } = await openNoteWithImages(page, { html: `<p>${paragraph}</p>` });
  const total = Number(await book.getAttribute('data-pages'));
  assert.ok(total >= 2, `kilka stron (jest ${total})`);
  const sources = [];
  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    await waitUntil(async () => Number(await book.getAttribute('data-page')) === pageNumber, `Strona ${pageNumber}`);
    sources.push(...await book.locator('.note-page:not([hidden]) math').evaluateAll((items) => items.map((math) => math.getAttribute('data-source'))));
    if (pageNumber < total) await noteDialog(page).locator('[data-testid=note-page-next]').click();
  }
  assert.equal(sources.length, 70, 'każdy wzór dokładnie raz');
  assert.ok(sources.every((source) => source === formula), 'wzory całe');
});

// ---------------------------------------------------------------- notatki 1.18

/** Notatka lekcji z `count` obrazami (kolorowe prostokąty „Obraz 1”…), treścią i podpisami (label → podpis). */
const seedNoteImages = (page, lessonID, count, { html = '<p>Tekst</p>', captions = {} } = {}) => page.evaluate(async ([id, total, text, notes]) => {
  const images = [];
  for (let index = 0; index < total; index += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `hsl(${index * 37}, 70%, 50%)`;
    ctx.fillRect(0, 0, 80, 60);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const label = `Obraz ${index + 1}`;
    images.push({ bytes: await blob.arrayBuffer(), type: 'image/png', width: 80, height: 60, label, caption: notes[label] ?? null });
  }
  await window.lexicards.library.saveNote(id, { html: text, images });
}, [lessonID, count, html, captions]);

/** Podgląd notatki lekcji (bez załączników – sekcja plików się nie pokazuje). */
async function openNotePreview(page, lessonID) {
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${lessonID}`);
  await page.click('[data-testid=lesson-note]');
  await noteDialog(page).locator('[data-testid=note-book]').waitFor();
  await waitUntil(() => noteDialog(page).locator('.sheet__panel').evaluate((panel) => panel.getAnimations().length === 0), 'Okno notatki otwarte');
}

const tileLabels = (dialog) => dialog.locator('[data-testid=note-image-label-text]').allTextContents();

test('notatka 1.18: Tab i Shift+Tab – wcięcie (także przyciskami), indeks górny i dolny (przyciski, Ctrl+, i Ctrl+.), wielkość tekstu, własny kolor (HEX, zapamiętany); zapis, podgląd, ponowna edycja', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń: Financial Statements' }).click();
  await menuItem(page, 'Dodaj notatkę');
  const dialog = noteDialog(page);
  const area = dialog.locator('[data-testid=note-editor]');
  await area.waitFor();
  const button = (command) => dialog.locator(`[data-testid=note-format-${command}]`);
  for (const command of ['superscript', 'subscript', 'size', 'outdent', 'indent']) assert.equal(await button(command).count(), 1, `przycisk ${command}`);

  // Wcięcie: Tab dwa razy, Shift+Tab raz – jeden stopień; następny akapit – Shift+Tab wraca do zera, przycisk „Zwiększ wcięcie”.
  await area.click();
  await page.keyboard.type('Akapit wcięty');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Drugi');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Trzeci');
  await button('indent').click();
  await page.keyboard.press('Enter');
  await button('outdent').click();
  // Indeksy: Ctrl+, – dolny, przycisk – górny.
  await page.keyboard.type('H');
  await page.keyboard.press('Control+,');
  await page.keyboard.type('2');
  await page.keyboard.press('Control+,');
  await page.keyboard.type('O i x');
  await button('superscript').click();
  assert.equal(await button('superscript').getAttribute('aria-pressed'), 'true');
  await page.keyboard.type('2');
  await page.keyboard.press('Control+.');
  await page.keyboard.type(' koniec');
  // Wielkość: duża, potem średnia.
  await page.keyboard.press('Enter');
  await button('size').click();
  assert.deepEqual(await dialog.locator('[data-testid=note-sizes] button').allTextContents(), ['Mała', 'Średnia', 'Duża', 'Bardzo duża']);
  await dialog.locator('[data-testid=note-size-l]').click();
  await page.keyboard.type('Duży tekst');
  await button('size').click();
  await dialog.locator('[data-testid=note-size-m]').click();
  await page.keyboard.type(' zwykły');
  // Własny kolor: „+” – okno z siatką i suwakami, kod HEX.
  await page.keyboard.press('Enter');
  await button('color').click();
  await dialog.locator('[data-testid=note-color-other]').click();
  await expectText(page.locator('dialog.sheet[open] .sheet__title').last(), 'Kolor tekstu');
  assert.equal(await page.locator('[data-testid=note-grid-color-0]').count(), 1, 'siatka kolorów');
  await page.locator('[data-testid=note-color-tab-sliders]').click();
  await page.locator('[data-testid=note-color-hex]').fill('#12AB34');
  await expectText(page.locator('[data-testid=note-color-value]'), '#12AB34');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-kolor-wlasny.png') });
  await sheetSubmit(page).click();
  await waitUntil(async () => (await page.locator('dialog.sheet').count()) === 1, 'Okno koloru zamknięte');
  await page.keyboard.type('Zielony');
  await button('color').click();
  assert.equal(await dialog.locator('[data-testid=note-color-custom-0]').getAttribute('aria-label'), 'Własny kolor #12AB34', 'zapamiętany własny kolor');
  await button('color').click();
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-formatowanie-edytor.png') });

  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const html = await page.evaluate((id) => window.lexicards.library.getNote(id).html, ids.statements);
  assert.equal(html, '<p data-indent="1">Akapit wcięty</p><p>Drugi</p><p data-indent="1">Trzeci</p>'
    + '<p>H<sub>2</sub>O i x<sup>2</sup> koniec</p><p><span data-size="l">Duży tekst</span> zwykły</p>'
    + '<p><span data-color="#12ab34" style="--note-color: #12ab34">Zielony</span></p>');
  // Podgląd: wcięcie, większy tekst, kolor.
  const look = await dialog.locator('[data-testid=note-text]').first().evaluate((text) => {
    const indented = text.querySelector('[data-indent="1"]');
    const large = text.querySelector('[data-size="l"]');
    const green = text.querySelector('[data-color="#12ab34"]');
    return {
      margin: parseFloat(getComputedStyle(indented).marginLeft),
      ratio: parseFloat(getComputedStyle(large).fontSize) / parseFloat(getComputedStyle(text).fontSize),
      color: getComputedStyle(green).color
    };
  });
  assert.ok(look.margin > 20, `wcięcie w podglądzie (${look.margin})`);
  assert.ok(Math.abs(look.ratio - 1.25) < 0.02, `duży tekst 1,25 × (${look.ratio})`);
  assert.equal(look.color, 'rgb(18, 171, 52)');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-formatowanie-podglad.png') });

  // Ponowna edycja: wcięty akapit w edytorze – Shift+Tab usuwa wcięcie.
  await dialog.locator('[data-testid=note-right]').click();
  await area.waitFor();
  await area.locator('blockquote p', { hasText: 'Akapit wcięty' }).click();
  await page.keyboard.press('Shift+Tab');
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  assert.ok((await page.evaluate((id) => window.lexicards.library.getNote(id).html, ids.statements)).startsWith('<p>Akapit wcięty</p><p>Drugi</p><p data-indent="1">Trzeci</p>'));
}, { device: DESKTOP });

test('notatka 1.18: podpisy obrazów z numeracją „Rys. N.” (podgląd, powiększenie); przeciąganie obrazów myszą i palcem; najwyżej dwa rzędy z przewijaniem w bok (iPad)', async ({ open, context }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await seedNoteImages(page, ids.statements, 12, { html: '<p>Tekst</p><p>[[Obraz 3]]</p><p>Dalej</p>', captions: { 'Obraz 3': 'Wyniki sprzedaży' } });
  await openNotePreview(page, ids.statements);
  const dialog = noteDialog(page);
  // Bez numeracji – sam podpis.
  await expectText(dialog.locator('[data-testid=note-figure-caption]').first(), 'Wyniki sprzedaży');
  assert.equal((await dialog.locator('[data-testid=note-figure-caption]').first().textContent()).trim(), 'Wyniki sprzedaży');

  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-editor]').waitFor();
  const grid = dialog.locator('[data-testid=note-images]');
  // 12 obrazów i dwa przyciski – najwyżej dwa rzędy, reszta w bok.
  const layout = await grid.evaluate((element) => ({
    scroll: element.classList.contains('note-images--scroll'),
    rows: new Set([...element.children].map((child) => Math.round(child.getBoundingClientRect().top))).size,
    wider: element.scrollWidth > element.clientWidth + 10
  }));
  assert.deepEqual(layout, { scroll: true, rows: 2, wider: true });
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-obrazy-dwa-rzedy-ipad.png') });

  // Numeracja i podpis pierwszego obrazu.
  await dialog.locator('.switch', { has: page.locator('[data-testid=note-number-figures]') }).click();
  assert.equal(await dialog.locator('[data-testid=note-number-figures]').isChecked(), true, 'numeracja włączona');
  await dialog.getByRole('button', { name: 'Obraz 1 – polecenia' }).click();
  await menuItem(page, 'Dodaj podpis');
  await page.locator('[data-testid=note-image-caption]').fill('Pierwszy');
  await saveSheet(page);

  // Myszą: „Obraz 1” na miejsce „Obraz 3” (kolumny: 1 nad 2, 3 nad 4…); bez otwierania menu.
  const tile = (label) => dialog.locator('[data-testid=note-image-tile]', { hasText: new RegExp(`^${label}$`) });
  const center = async (label) => { const box = await tile(label).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };
  const from = await center('Obraz 1');
  const to = await center('Obraz 3');
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 10 });
  await waitUntil(() => tile('Obraz 1').evaluate((element) => element.classList.contains('grid-drag--dragging')), 'Kafelek uniesiony');
  const lifted = await tile('Obraz 1').boundingBox();
  assert.ok(Math.abs(lifted.x + lifted.width / 2 - to[0]) < 4 && Math.abs(lifted.y + lifted.height / 2 - to[1]) < 4,
    `kafelek pod wskaźnikiem (${Math.round(lifted.x + lifted.width / 2)}, ${Math.round(lifted.y + lifted.height / 2)})`);
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-obrazy-przeciaganie-ipad.png') });
  await page.mouse.up();
  await waitUntil(async () => (await tileLabels(dialog)).slice(0, 4).join() === 'Obraz 2,Obraz 3,Obraz 1,Obraz 4', 'Obraz 1 na trzecim miejscu');
  assert.equal(await page.locator('dialog.menu[open]').count(), 0, 'po przeciągnięciu menu się nie otwiera');
  // Kliknięcie bez ruchu – menu jak dotąd.
  await tile('Obraz 4').locator('.note-images__open').click();
  await page.locator('dialog.menu[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog.menu[open]').waitFor({ state: 'detached' });

  // Palcem: przytrzymanie, potem ruch – „Obraz 5” na miejsce „Obraz 4”.
  const [fx, fy] = await center('Obraz 5');
  const [tx, ty] = await center('Obraz 4');
  const touch = await touchAt(context, page, fx, fy);
  await page.waitForTimeout(550);
  await touch.move(tx, ty, 10);
  await touch.end();
  await waitUntil(async () => (await tileLabels(dialog)).slice(0, 5).join() === 'Obraz 2,Obraz 3,Obraz 1,Obraz 5,Obraz 4', 'Obraz 5 przed Obraz 4');

  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-book]').waitFor();
  const note = await page.evaluate((id) => window.lexicards.library.getNote(id), ids.statements);
  assert.equal(note.numberFigures, true);
  assert.deepEqual(note.images.slice(0, 5).map((meta) => [meta.label, meta.caption ?? null]),
    [['Obraz 2', null], ['Obraz 3', 'Wyniki sprzedaży'], ['Obraz 1', 'Pierwszy'], ['Obraz 5', null], ['Obraz 4', null]]);
  // Podgląd: Obraz 3 z odwołania w tekście – „Rys. 1.”; powiększenie pokazuje podpis.
  await expectText(dialog.locator('[data-testid=note-figure-caption]').first(), 'Rys. 1. Wyniki sprzedaży');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-podpis-rys-ipad.png') });
  await dialog.locator('.note-page__figure').first().click();
  await expectText(page.locator('[data-testid=lightbox-caption]'), 'Rys. 1. Wyniki sprzedaży');
}, { device: IPAD });

test('notatka 1.18 na telefonie: pasek formatowania z nowymi przyciskami się przewija, obrazy w dwóch rzędach przewijanych w bok, nic nie wystaje', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await seedNoteImages(page, ids.statements, 8);
  await openNotePreview(page, ids.statements);
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-editor]').waitFor();
  const grid = dialog.locator('[data-testid=note-images]');
  await waitUntil(() => grid.evaluate((element) => element.classList.contains('note-images--scroll')), 'Przewijanie w bok');
  assert.equal(await grid.evaluate((element) => new Set([...element.children].map((child) => Math.round(child.getBoundingClientRect().top))).size), 2);
  assert.equal(await overflowX(page), 0, 'bez przewijania strony w bok');
  await grid.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-obrazy-telefon.png') });
  await dialog.locator('[data-testid=note-format-color]').scrollIntoViewIfNeeded();
  await dialog.locator('[data-testid=note-format-color]').click();
  const colors = await dialog.locator('[data-testid=note-colors]').boundingBox();
  assert.ok(colors.x >= 0 && colors.x + colors.width <= 390, 'kolory w szerokości ekranu');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-edytor-telefon.png') });
});

// ---------------------------------------------------------------- rysunki (1.12)

const drawingDialog = (page) => page.locator('dialog[data-testid=drawing-dialog]');

/**
 * Kreska syntetycznymi zdarzeniami wskaźnika (rysik z naciskiem albo palec): punkty
 * [x, y, nacisk], x i y – ułamki płótna edytora.
 */
async function drawStroke(page, points, { type = 'pen', id = 11, up = true, only = null } = {}) {
  await page.locator('[data-testid=drawing-canvas]').evaluate((canvas, [list, pointerType, pointerId, lift, single]) => {
    const box = canvas.getBoundingClientRect();
    const fire = (kind, [x, y, pressure]) => canvas.dispatchEvent(new window.PointerEvent(kind, {
      bubbles: true, cancelable: true, pointerId, pointerType, isPrimary: true,
      clientX: box.left + box.width * x, clientY: box.top + box.height * y,
      pressure: kind === 'pointerup' ? 0 : pressure, buttons: kind === 'pointerup' ? 0 : 1, button: kind === 'pointermove' ? -1 : 0
    }));
    // only: 'up' – samo puszczenie gestu zaczętego z up: false (zrzut ekranu w trakcie).
    if (single === 'up') {
      fire('pointerup', list.at(-1));
      return;
    }
    fire('pointerdown', list[0]);
    for (const point of list.slice(1)) fire('pointermove', point);
    if (lift) fire('pointerup', list.at(-1));
  }, [points, type, id, up, only]);
}

/** Punkty odcinka z naciskiem zależnym od położenia (0…1). */
const segment = (from, to, steps = 16, pressure = () => 0.5) => Array.from({ length: steps + 1 }, (_, index) => {
  const t = index / steps;
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, pressure(t)];
});

/** Kolor [r, g, b] warstwy zapisanych kresek w punkcie płótna (ułamki) – najciemniejszy z okolicy 5 × 5 px. */
const pixelAt = (page, x, y) => page.locator('.drawing__canvas:not(.drawing__canvas--live)').evaluate((canvas, [fx, fy]) => {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(Math.round(canvas.width * fx) - 2, Math.round(canvas.height * fy) - 2, 5, 5).data;
  let best = [255, 255, 255];
  for (let index = 0; index < data.length; index += 4) {
    const rgb = [data[index], data[index + 1], data[index + 2]];
    if (rgb[0] + rgb[1] + rgb[2] < best[0] + best[1] + best[2]) best = rgb;
  }
  return best;
}, [x, y]);
const darkAt = async (page, x, y) => Math.max(...await pixelAt(page, x, y)) < 110;
const redAt = async (page, x, y) => { const [r, g] = await pixelAt(page, x, y); return r > 150 && g < 90; };
const nextFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Obrazy notatki z biblioteki z opisem kresek rysunku (grubości punktów) i zdjęcia (liczba bajtów). */
const storedDrawings = (page, lessonID) => page.evaluate(async (id) => {
  const images = await window.lexicards.library.noteImages(id);
  return images.map((image) => ({
    id: image.id, label: image.label, type: image.type, width: image.width, height: image.height,
    drawing: image.drawing ? {
      paper: image.drawing.paper, width: image.drawing.width, height: image.drawing.height,
      strokes: image.drawing.strokes.map((stroke) => ({
        tool: stroke.tool, color: stroke.color, widths: stroke.points.filter((_, index) => index % 3 === 2)
      })),
      photo: image.drawing.photo ? { type: image.drawing.photo.type, size: image.drawing.photo.bytes.byteLength } : null
    } : null
  }));
}, lessonID);

async function openDrawingEditorFromNote(page, lessonID, html) {
  await page.evaluate(([id, text]) => window.lexicards.library.saveNote(id, { html: text }), [lessonID, html]);
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${lessonID}`);
  await page.click('[data-testid=lesson-note]');
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-editor]').waitFor();
  await dialog.locator('[data-testid=note-image-draw]').click();
  const editor = drawingDialog(page);
  await editor.waitFor();
  await waitUntil(() => editor.locator('[data-testid=drawing-canvas]').evaluate((canvas) => canvas.width > 0), 'Płótno gotowe');
  await nextFrames(page);
  return { dialog, editor };
}

test('rysunek: „Narysuj” – pióro z naciskiem rysika, mysz, palec przesuwa, zakreślacz, kolory, gumka, cofnij i ponów, tło, ustawienia pióra; zapis i „Edytuj rysunek” (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Bilans</p>');
  await expectText(editor.locator('.sheet__title'), 'Rysunek 1');
  assert.equal(await editor.locator('[data-testid=drawing-pen-only]').isHidden(), true, 'zanim pojawi się rysik – bez pigułki');
  assert.equal(await editor.locator('[data-testid=drawing-undo]').isDisabled(), true);
  await expectText(editor.locator('[data-testid=drawing-paper]'), 'Tło: kratka');
  assert.equal(await darkAt(page, 0.4, 0.3), false, 'pusta strona');

  const canvasBox = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const at = (x, y) => [canvasBox.x + canvasBox.width * x, canvasBox.y + canvasBox.height * y];

  // Rysik z rosnącym naciskiem: kreska od cienkiej do grubej.
  await drawStroke(page, segment([0.2, 0.3], [0.6, 0.3], 20, (t) => 0.05 + t * 0.95));
  await waitUntil(() => darkAt(page, 0.55, 0.3), 'Kreska pióra na płótnie');
  assert.equal(await editor.locator('[data-testid=drawing-pen-only]').isVisible(), true, 'po rysiku: „Rysuje tylko rysik · palec przesuwa”');
  assert.equal(await editor.locator('[data-testid=drawing-undo]').isDisabled(), false);

  // Mysz rysuje jak pióro (prawdziwe zdarzenia przeglądarki).
  await page.mouse.move(...at(0.25, 0.65));
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(...at(0.25 + step * 0.02, 0.65));
  await page.mouse.up();
  await waitUntil(() => darkAt(page, 0.35, 0.65), 'Kreska myszą');

  // Palec po użyciu rysika nie rysuje (przesuwa stronę).
  await drawStroke(page, segment([0.2, 0.55], [0.6, 0.55]), { type: 'touch', id: 12 });
  await nextFrames(page);
  assert.equal(await darkAt(page, 0.4, 0.55), false, 'palec nie rysuje, gdy jest rysik');

  // Dwa palce rozsuwane – powiększenie; pigułka „100%” wraca do całej strony.
  await page.locator('[data-testid=drawing-canvas]').evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    const fire = (kind, pointerId, x) => canvas.dispatchEvent(new window.PointerEvent(kind, {
      bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: box.left + box.width * x, clientY: box.top + box.height * 0.5,
      buttons: kind === 'pointerup' ? 0 : 1, button: kind === 'pointermove' ? -1 : 0
    }));
    fire('pointerdown', 21, 0.45);
    fire('pointerdown', 22, 0.55);
    fire('pointermove', 21, 0.4);
    fire('pointermove', 22, 0.6);
    fire('pointerup', 21, 0.4);
    fire('pointerup', 22, 0.6);
  });
  await expectText(editor.locator('[data-testid=drawing-zoom]'), '200%');

  // Dłoń oparta o ekran (i przesuwana) w trakcie pisania rysikiem nie przesuwa powiększonej strony.
  await page.locator('[data-testid=drawing-canvas]').evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    const fire = (kind, pointerId, pointerType, x, y) => canvas.dispatchEvent(new window.PointerEvent(kind, {
      bubbles: true, cancelable: true, pointerId, pointerType, pressure: kind === 'pointerup' ? 0 : 0.5,
      clientX: box.left + box.width * x, clientY: box.top + box.height * y, buttons: kind === 'pointerup' ? 0 : 1, button: kind === 'pointermove' ? -1 : 0
    }));
    fire('pointerdown', 31, 'touch', 0.85, 0.85);
    fire('pointerdown', 11, 'pen', 0.3, 0.7);
    for (let step = 1; step <= 10; step += 1) {
      fire('pointermove', 31, 'touch', 0.85 - step * 0.02, 0.85 - step * 0.02);
      fire('pointermove', 11, 'pen', 0.3 + step * 0.02, 0.7);
    }
    fire('pointerup', 11, 'pen', 0.5, 0.7);
    fire('pointerup', 31, 'touch', 0.65, 0.65);
  });
  await waitUntil(() => darkAt(page, 0.4, 0.7), 'Kreska rysikiem tam, gdzie była pisana – strona się nie przesunęła');
  await editor.locator('[data-testid=drawing-zoom]').click();
  await expectText(editor.locator('[data-testid=drawing-zoom]'), '100%');
  await waitUntil(() => darkAt(page, 0.55, 0.3), 'Cała strona z powrotem na miejscu');

  // Zakreślacz – zielony, pod nim czarny tusz zostaje ciemny.
  await editor.locator('[data-testid=drawing-tool-highlighter]').click();
  assert.equal(await editor.locator('[data-testid=drawing-tool-highlighter]').getAttribute('aria-pressed'), 'true');
  assert.equal(await editor.locator('[data-testid=drawing-color-pink]').count(), 1, 'kolory zakreślacza');
  await editor.locator('[data-testid=drawing-color-green]').click();
  await drawStroke(page, segment([0.3, 0.3], [0.5, 0.3]));
  // Pas zakreślacza 6 px pod czarną kreską – sam zielony.
  await waitUntil(async () => { const [r, g, b] = await pixelAt(page, 0.4, 0.3 + 6 / canvasBox.height); return g > r + 40 && g > b + 40; }, 'Zielony zakreślacz');
  assert.equal(await darkAt(page, 0.45, 0.3), true, 'tusz pod zakreślaczem zostaje ciemny');

  // Pióro czerwone, gruba kreska.
  await editor.locator('[data-testid=drawing-tool-pen]').click();
  await editor.locator('[data-testid=drawing-color-red]').click();
  await editor.locator('[data-testid=drawing-width-2]').click();
  await drawStroke(page, segment([0.7, 0.2], [0.7, 0.8]));
  await waitUntil(() => redAt(page, 0.7, 0.3), 'Czerwona kreska');

  // Gumka ściera całą kreskę; cofnij, ponów, Ctrl+Z.
  await editor.locator('[data-testid=drawing-tool-eraser]').click();
  assert.equal(await editor.locator('.drawing__swatches').isHidden(), true, 'gumka – bez kolorów i grubości');
  await drawStroke(page, segment([0.66, 0.5], [0.74, 0.5], 6));
  await waitUntil(async () => !(await redAt(page, 0.7, 0.3)), 'Gumka starła całą czerwoną kreskę');
  assert.equal(await darkAt(page, 0.55, 0.3), true, 'czarna kreska zostaje');
  await editor.locator('[data-testid=drawing-undo]').click();
  await waitUntil(() => redAt(page, 0.7, 0.3), 'Cofnij przywraca kreskę');
  await editor.locator('[data-testid=drawing-redo]').click();
  await waitUntil(async () => !(await redAt(page, 0.7, 0.3)), 'Ponów znowu ją ściera');
  await page.keyboard.press('Control+z');
  await waitUntil(() => redAt(page, 0.7, 0.3), 'Ctrl+Z cofa');

  // Tło strony (od 1.15 w panelu): kratka → gładkie → linie; panel zamyka ponowne dotknięcie.
  await editor.locator('[data-testid=drawing-paper]').click();
  await editor.locator('[data-testid=drawing-paper-plain]').click();
  await expectText(editor.locator('[data-testid=drawing-paper]'), 'Tło: gładkie');
  await editor.locator('[data-testid=drawing-paper-lines]').click();
  await expectText(editor.locator('[data-testid=drawing-paper]'), 'Tło: linie');
  await editor.locator('[data-testid=drawing-paper]').click();
  await waitUntil(() => editor.locator('[data-testid=drawing-paper-panel]').isHidden(), 'Panel tła zamknięty');

  // Ustawienia pióra: drugie dotknięcie pióra. Suwak zostaje ten sam w trakcie przesuwania.
  await editor.locator('[data-testid=drawing-tool-pen]').click();
  await editor.locator('[data-testid=drawing-tool-pen]').click();
  const settings = editor.locator('[data-testid=drawing-settings]');
  await settings.waitFor();
  await settings.locator('[data-testid=drawing-sensitivity-high]').click();
  assert.equal(await settings.locator('[data-testid=drawing-sensitivity-high]').getAttribute('aria-checked'), 'true');
  const slider = await settings.locator('[data-testid=drawing-width-max]').elementHandle();
  await slider.evaluate((input) => { input.value = '12'; input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await expectText(settings.locator('.drawing__settings-label').nth(1), 'od 4.5 do 12.0');
  assert.equal(await slider.evaluate((input) => input.isConnected && document.activeElement !== null), true, 'suwak nie jest budowany od nowa');
  const tools = await page.evaluate(() => JSON.parse(localStorage.getItem('lexicards-drawing-tools')));
  assert.deepEqual([tools.sensitivity, tools.penWidth, tools.penWidths[2].max, tools.penColor, tools.highlighterColor], ['high', 2, 12, 'red', 'green']);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-ustawienia-piora-ipad.png') });
  await editor.locator('[data-testid=drawing-tool-pen]').click();
  assert.equal(await settings.isHidden(), true);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-edytor-ipad.png') });

  // Gotowe: miniatura ze znaczkiem rysunku; odwołanie w tekście i zapis notatki.
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  const tile = dialog.locator('.note-images__item--drawing');
  await tile.locator('img').waitFor();
  await expectText(tile.locator('[data-testid=note-image-label-text]'), 'Rysunek 1');
  assert.equal(await tile.locator('[data-testid=note-image-drawing]').count(), 1);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-w-edytorze-notatki-ipad.png') });
  await dialog.locator('[data-testid=note-editor]').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[[Rysunek 1]]');
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();

  const meta = (await storedNote(page, ids.statements)).images;
  assert.deepEqual(meta.map((image) => [image.label, image.drawing]), [['Rysunek 1', true]]);
  const [first] = await storedDrawings(page, ids.statements);
  assert.deepEqual([first.type, first.width, first.height], ['image/png', 1600, 1100]);
  assert.equal(first.drawing.paper, 'lines');
  assert.deepEqual(first.drawing.strokes.map((stroke) => [stroke.tool, stroke.color]),
    [['pen', '#1d1d1f'], ['pen', '#1d1d1f'], ['pen', '#1d1d1f'], ['highlighter', '#5ee07a'], ['pen', '#d70015']]);
  const pressure = first.drawing.strokes[0].widths;
  assert.ok(pressure[0] < 3.2 && Math.max(...pressure) > 6, `grubość z nacisku: ${pressure[0]} → ${Math.max(...pressure)}`);
  assert.deepEqual([...new Set(first.drawing.strokes[1].widths)], [4.55], 'mysz – stała grubość (środek zakresu)');
  assert.deepEqual([...new Set(first.drawing.strokes[3].widths)], [24], 'zakreślacz – stała grubość');
  assert.deepEqual([...new Set(first.drawing.strokes[4].widths)], [7.75], 'gruba kreska, nacisk 0,5');

  // Podgląd: rysunek w miejscu odwołania.
  await waitUntil(() => dialog.locator('.note-page__figure img').evaluate((image) => image.complete && image.naturalWidth === 1600), 'Rysunek w podglądzie');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-podglad-notatki-ipad.png') });

  // „Edytuj rysunek”: kreski wracają do poprawy, „Anuluj” po zmianie pyta.
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('.note-images__item--drawing .note-images__open').click();
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-menu-ipad.png') });
  await menuItem(page, 'Edytuj rysunek');
  await editor.waitFor();
  await waitUntil(() => darkAt(page, 0.55, 0.3), 'Zapisane kreski w edytorze');
  await waitUntil(() => redAt(page, 0.7, 0.3), 'Czerwona kreska w edytorze');
  await expectText(editor.locator('[data-testid=drawing-paper]'), 'Tło: linie');
  assert.equal(await editor.locator('[data-testid=drawing-undo]').isDisabled(), true, 'nowa historia cofania');
  await drawStroke(page, segment([0.3, 0.75], [0.5, 0.75]));
  await editor.locator('[data-testid=drawing-cancel]').click();
  await expectText(page.locator('dialog.alert[open] .alert__title'), 'Odrzucić zmiany w rysunku?');
  await page.locator('dialog.alert[open]').getByRole('button', { name: 'Rysuj dalej' }).click();
  assert.equal(await editor.isVisible(), true, 'edytor zostaje otwarty');
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const [second] = await storedDrawings(page, ids.statements);
  assert.equal(second.label, 'Rysunek 1');
  assert.notEqual(second.id, first.id, 'nowy obraz rysunku');
  assert.equal(second.drawing.strokes.length, 6);
  assert.equal((await page.evaluate(() => window.lexicards.library.missingMedia())).images, 0);
  assert.match((await storedNote(page, ids.statements)).html, /\[\[Rysunek 1\]\]/);
}, { device: IPAD });

/** Dwa palce obracane wokół punktu `center` (px okna) od kąta `from` do `to` (stopnie ekranu: ujemne – w lewo). */
async function touchTurn(page, center, radius, from, to, steps = 8) {
  await page.locator('[data-testid=drawing-canvas]').evaluate((canvas, [middle, distance, start, end, count]) => {
    const fire = (kind, pointerId, degrees) => {
      const side = pointerId === 41 ? -1 : 1;
      const angle = (degrees * Math.PI) / 180;
      canvas.dispatchEvent(new window.PointerEvent(kind, {
        bubbles: true, cancelable: true, pointerId, pointerType: 'touch', isPrimary: pointerId === 41,
        clientX: middle.x + side * distance * Math.cos(angle), clientY: middle.y + side * distance * Math.sin(angle),
        buttons: kind === 'pointerup' ? 0 : 1, button: kind === 'pointermove' ? -1 : 0
      }));
    };
    fire('pointerdown', 41, start);
    fire('pointerdown', 42, start);
    for (let step = 1; step <= count; step += 1) {
      const degrees = start + ((end - start) * step) / count;
      fire('pointermove', 41, degrees);
      fire('pointermove', 42, degrees);
    }
    fire('pointerup', 41, end);
    fire('pointerup', 42, end);
  }, [center, radius, from, to, steps]);
}

test('rysunek 1.12.1: gumka fragmentów z rozmiarami, linijka (kąt dwoma palcami i myszą, przyskok do 45°, kreska wzdłuż krawędzi), zaznaczanie prostokątem – przesuń, powiel, usuń, cofnij (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Linijka</p>');
  const box = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');

  // Gumka fragmentów: tryb i cztery wielkości; dotknięcie przecina kreskę, reszta zostaje.
  await drawStroke(page, segment([0.2, 0.3], [0.8, 0.3]));
  await waitUntil(() => darkAt(page, 0.5, 0.3), 'Kreska do starcia');
  await editor.locator('[data-testid=drawing-tool-eraser]').click();
  assert.equal(await editor.locator('[data-testid=drawing-eraser-stroke]').getAttribute('aria-checked'), 'true', 'domyślnie całe kreski');
  assert.equal(await editor.locator('[data-testid=drawing-eraser-size-0]').isVisible(), false, 'wielkość tylko dla fragmentów');
  await editor.locator('[data-testid=drawing-eraser-pixel]').click();
  assert.equal(await editor.locator('[data-testid=drawing-eraser-pixel]').getAttribute('aria-checked'), 'true');
  assert.equal(await editor.locator('[data-testid^=drawing-eraser-size-]').count(), 4);
  await editor.locator('[data-testid=drawing-eraser-size-3]').click();
  assert.equal(await editor.locator('[data-testid=drawing-eraser-size-3]').getAttribute('aria-checked'), 'true');
  await page.mouse.move(center.x, box.y + box.height * 0.5);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-gumka-fragmentow-ipad.png') });
  await drawStroke(page, [[0.5, 0.3, 0.5]]);
  await waitUntil(async () => !(await darkAt(page, 0.5, 0.3)), 'Gumka starła środek kreski');
  assert.equal(await darkAt(page, 0.3, 0.3), true, 'lewa część kreski zostaje');
  assert.equal(await darkAt(page, 0.7, 0.3), true, 'prawa część kreski zostaje');
  await editor.locator('[data-testid=drawing-undo]').click();
  await waitUntil(() => darkAt(page, 0.5, 0.3), 'Cofnij przywraca całą kreskę');
  await editor.locator('[data-testid=drawing-redo]').click();
  await waitUntil(async () => !(await darkAt(page, 0.5, 0.3)), 'Ponów znowu ją przecina');
  const tools = await page.evaluate(() => JSON.parse(localStorage.getItem('lexicards-drawing-tools')));
  assert.deepEqual([tools.eraserMode, tools.eraserSize], ['pixel', 3], 'tryb i wielkość gumki zapamiętane');

  // Linijka: kąt na pigułce; dwa palce obracają (30°, potem przyskok do 45°), uchwyt myszą – 90°.
  await editor.locator('[data-testid=drawing-tool-pen]').click();
  await editor.locator('[data-testid=drawing-ruler]').click();
  assert.equal(await editor.locator('[data-testid=drawing-ruler]').getAttribute('aria-pressed'), 'true');
  await expectText(editor.locator('[data-testid=drawing-ruler-angle]'), 'Linijka 0°');
  await touchTurn(page, center, 90, 0, -30);
  await expectText(editor.locator('[data-testid=drawing-ruler-angle]'), 'Linijka 30°');
  await touchTurn(page, center, 90, -30, -44);
  await expectText(editor.locator('[data-testid=drawing-ruler-angle]'), 'Linijka 45°');
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-linijka-ipad.png') });
  const handle = (degrees) => [center.x + 170 * Math.cos((degrees * Math.PI) / 180), center.y + 170 * Math.sin((degrees * Math.PI) / 180)];
  await page.mouse.move(...handle(-45));
  await page.mouse.down();
  for (let step = 1; step <= 9; step += 1) await page.mouse.move(...handle(-45 - step * 5));
  await page.mouse.up();
  await expectText(editor.locator('[data-testid=drawing-ruler-angle]'), 'Linijka 90°');
  // Mysz przesuwa linijkę (pionową) o 60 px w prawo.
  await page.mouse.move(center.x, center.y + 60);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) await page.mouse.move(center.x + step * 10, center.y + 60);
  await page.mouse.up();
  // Kreska rysikiem przy prawej krawędzi (40–48 px od środka linijki) – prosto wzdłuż krawędzi (32 px).
  const near = Array.from({ length: 13 }, (_, index) => [
    (center.x + 60 + 40 + (index % 3) * 4 - box.x) / box.width, (center.y - 120 + index * 20 - box.y) / box.height, 0.5
  ]);
  await drawStroke(page, near);
  await waitUntil(() => darkAt(page, (center.x + 92 - box.x) / box.width, 0.5), 'Kreska wzdłuż krawędzi linijki');
  assert.equal(await darkAt(page, (center.x + 104 - box.x) / box.width, 0.5), false, 'nie tam, gdzie prowadził rysik');
  await editor.locator('[data-testid=drawing-ruler]').click();
  assert.equal(await editor.locator('[data-testid=drawing-ruler-angle]').isHidden(), true, 'linijka schowana');

  // Zaznaczanie: prostokąt zaznacza kreski w całości w środku; polecenia nad ramką.
  await drawStroke(page, segment([0.22, 0.8], [0.32, 0.8]));
  await drawStroke(page, segment([0.66, 0.85], [0.76, 0.85]));
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await drawStroke(page, segment([0.2, 0.75], [0.35, 0.88], 6));
  await expectText(selectionCount, '1 kreska');
  await drawStroke(page, segment([0.2, 0.75], [0.8, 0.9], 6));
  await expectText(selectionCount, '2 kreski');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-zaznaczenie-ipad.png') });
  // Przesunięcie w górę: kreski są w nowym miejscu.
  await drawStroke(page, segment([0.27, 0.8], [0.27, 0.7], 8));
  await waitUntil(async () => (await darkAt(page, 0.27, 0.7)) && !(await darkAt(page, 0.27, 0.8)), 'Zaznaczenie przesunięte');
  assert.equal(await darkAt(page, 0.71, 0.75), true, 'druga kreska przesunięta razem z pierwszą');
  await expectText(selectionCount, '2 kreski');
  // Powiel – kopie obok, zaznaczone; Usuń – kopie znikają.
  await editor.locator('[data-testid=drawing-selection-duplicate]').click();
  await expectText(selectionCount, '2 kreski');
  await editor.locator('[data-testid=drawing-selection-delete]').click();
  await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Po usunięciu bez zaznaczenia');
  // Cofnij: usunięcie, powielenie, przesunięcie – po kolei; ponów – przesunięcie wraca.
  await editor.locator('[data-testid=drawing-undo]').click();
  await editor.locator('[data-testid=drawing-undo]').click();
  await editor.locator('[data-testid=drawing-undo]').click();
  await waitUntil(async () => (await darkAt(page, 0.27, 0.8)) && !(await darkAt(page, 0.27, 0.7)), 'Cofnięte przesunięcie');
  await editor.locator('[data-testid=drawing-redo]').click();
  await waitUntil(() => darkAt(page, 0.27, 0.7), 'Ponowione przesunięcie');
  // Dotknięcie kreski zaznacza ją; Ctrl+A – wszystko; Esc zdejmuje zaznaczenie, edytor zostaje.
  await drawStroke(page, [[0.3, 0.3, 0.5]]);
  await expectText(selectionCount, '1 kreska');
  await page.keyboard.press('Control+a');
  await expectText(selectionCount, '5 kresek');
  await page.keyboard.press('Escape');
  await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Esc zdejmuje zaznaczenie (po Ctrl+A)');
  await editor.locator('[data-testid=drawing-select-all]').click();
  await expectText(selectionCount, '5 kresek');
  await page.keyboard.press('Escape');
  await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Esc zdejmuje zaznaczenie');
  assert.equal(await editor.isVisible(), true, 'Esc przy zaznaczeniu nie zamyka edytora');

  // Zapis: kreska przy linijce ma stałe x (pionowa), przecięta kreska to dwa kawałki.
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const strokes = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing.strokes, ids.statements);
  assert.equal(strokes.length, 5);
  const ruled = strokes[2].points.filter((_, index) => index % 3 === 0);
  assert.equal(new Set(ruled).size, 1, `kreska przy linijce – jedno x: ${[...new Set(ruled)]}`);
  const ruledY = strokes[2].points.filter((_, index) => index % 3 === 1);
  assert.ok(Math.max(...ruledY) - Math.min(...ruledY) > 300, 'i biegnie w pionie');
  assert.ok(strokes[0].points.at(-3) < strokes[1].points[0], 'dwa kawałki przeciętej kreski z przerwą między nimi');
}, { device: IPAD });

/** Granice (ułamki płótna) pikseli warstwy zapisanych kresek spełniających warunek koloru albo null. */
const colorBox = (page, kind) => page.locator('.drawing__canvas:not(.drawing__canvas--live)').evaluate((canvas, which) => {
  const test = {
    red: (r, g, b) => r > 150 && g < 90 && b < 90,
    blue: (r, g, b) => b > 150 && r < 80 && g < 130
  }[which];
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const index = (y * canvas.width + x) * 4;
      if (!test(data[index], data[index + 1], data[index + 2])) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return left === Infinity ? null : { x0: left / canvas.width, y0: top / canvas.height, x1: right / canvas.width, y1: bottom / canvas.height };
}, kind);
const sheetSubmit = (page) => page.locator('dialog.sheet[open]').last().locator('button[type=submit]');

test('rysunek 1.13: pole tekstowe i wzór – wstawienie (wielkość, kolor), jeden pod drugim, przesunięcie, poprawka dotknięciem i „Edytuj”, gumka, zapis i ponowna edycja (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Tekst i wzór</p>');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');

  // Pole tekstowe: dwa wiersze, duże, czerwone – na środku widocznej części strony, zaznaczone.
  await editor.locator('[data-testid=drawing-insert-text]').click();
  await expectText(page.locator('dialog.sheet[open] .sheet__title').last(), 'Nowe pole tekstowe');
  assert.equal(await sheetSubmit(page).isDisabled(), true, 'bez tekstu nie da się wstawić');
  await page.locator('[data-testid=drawing-text-input]').fill('Bilans: aktywa = pasywa\nKapitał własny');
  // Od 1.18 cztery wielkości (doszła „Bardzo duża”).
  assert.deepEqual(await page.locator('dialog.sheet[open]').last().locator('.segmented__input').evaluateAll((inputs) => inputs.map((input) => input.labels[0]?.textContent.trim())),
    ['Mała', 'Średnia', 'Duża', 'Bardzo duża']);
  await page.locator('dialog.sheet[open]').last().getByRole('radio', { name: 'Duża', exact: true }).check();
  await page.locator('[data-testid=drawing-element-color-red]').click();
  await sheetSubmit(page).click();
  await expectText(selectionCount, 'Pole tekstowe');
  assert.equal(await editor.locator('[data-testid=drawing-tool-select]').getAttribute('aria-pressed'), 'true', 'po wstawieniu – zaznaczanie');
  const text = await waitUntil(() => colorBox(page, 'red'), 'Czerwony tekst na płótnie');
  assert.ok(text.x0 < 0.5 && text.x1 > 0.5, 'tekst na środku strony');

  // Wzór (zapis jak w notatce), niebieski – pod polem tekstowym, nie na nim.
  await editor.locator('[data-testid=drawing-insert-math]').click();
  await expectText(page.locator('dialog.sheet[open] .sheet__title').last(), 'Nowy wzór');
  await page.locator('[data-testid=math-try]').fill('\\frac{a+b}{2} = x^2');
  await expectText(page.locator('[data-testid=math-message]'), 'Wzór jest gotowy.');
  await page.locator('[data-testid=drawing-element-color-blue]').click();
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wzor-okno-ipad.png') });
  await sheetSubmit(page).click();
  await expectText(selectionCount, 'Wzór');
  const formula = await waitUntil(() => colorBox(page, 'blue'), 'Niebieski wzór na płótnie');
  assert.ok(formula.y0 > text.y1, 'wzór pod polem tekstowym');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-tekst-i-wzor-ipad.png') });

  // Przesunięcie zaznaczonego wzoru w prawo (rysikiem, wewnątrz ramki).
  const canvasBox = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const middle = [(formula.x0 + formula.x1) / 2, (formula.y0 + formula.y1) / 2];
  const shift = 150 / canvasBox.width;
  await drawStroke(page, segment(middle, [middle[0] + shift, middle[1]], 8));
  const moved = await waitUntil(async () => { const box = await colorBox(page, 'blue'); return box && box.x0 > formula.x0 + shift * 0.8 ? box : null; }, 'Wzór przesunięty');
  // Dotknięcie zaznaczonego wzoru – poprawka zapisu.
  await drawStroke(page, [[(moved.x0 + moved.x1) / 2, (moved.y0 + moved.y1) / 2, 0.5]]);
  await expectText(page.locator('dialog.sheet[open] .sheet__title').last(), 'Wzór na rysunku');
  assert.equal(await page.locator('[data-testid=math-try]').inputValue(), '\\frac{a+b}{2} = x^2');
  await page.locator('[data-testid=math-try]').fill('\\sqrt{x} + 1');
  await sheetSubmit(page).click();
  // Poprawka trafia na płótno po zamknięciu okna – dopiero potem następne dotknięcie (zdarzenia
  // syntetyczne nie czekają na zamknięcie okna jak kliknięcie).
  await waitUntil(async () => {
    const box = await colorBox(page, 'blue');
    return box && Math.abs((box.x1 - box.x0) - (moved.x1 - moved.x0)) > 0.005;
  }, 'Poprawiony wzór na płótnie');
  await expectText(selectionCount, 'Wzór');

  // „Edytuj” pola tekstowego (zaznaczonego dotknięciem).
  await drawStroke(page, [[(text.x0 + text.x1) / 2, (text.y0 + text.y1) / 2, 0.5]]);
  await expectText(selectionCount, 'Pole tekstowe');
  await editor.locator('[data-testid=drawing-selection-edit]').click();
  assert.equal(await page.locator('[data-testid=drawing-text-input]').inputValue(), 'Bilans: aktywa = pasywa\nKapitał własny');
  await page.locator('[data-testid=drawing-text-input]').fill('Aktywa = pasywa');
  await sheetSubmit(page).click();
  await expectText(selectionCount, 'Pole tekstowe');

  // Gumka fragmentów nie przecina tekstu; gumka całych kresek usuwa wzór (cofnij – wraca).
  await editor.locator('[data-testid=drawing-tool-eraser]').click();
  await editor.locator('[data-testid=drawing-eraser-pixel]').click();
  const shortText = await waitUntil(() => colorBox(page, 'red'), 'Poprawiony tekst');
  await drawStroke(page, segment([shortText.x0, (shortText.y0 + shortText.y1) / 2], [shortText.x1, (shortText.y0 + shortText.y1) / 2], 10));
  await nextFrames(page);
  assert.deepEqual(await colorBox(page, 'red'), shortText, 'tekst bez zmian po gumce fragmentów');
  await editor.locator('[data-testid=drawing-eraser-stroke]').click();
  const blue = await colorBox(page, 'blue');
  await drawStroke(page, segment([blue.x0, (blue.y0 + blue.y1) / 2], [blue.x1, (blue.y0 + blue.y1) / 2], 10));
  await waitUntil(async () => (await colorBox(page, 'blue')) === null, 'Gumka całych kresek usunęła wzór');
  await editor.locator('[data-testid=drawing-undo]').click();
  await waitUntil(() => colorBox(page, 'blue'), 'Cofnij – wzór wraca');

  // Zapis: pole tekstowe i wzór w danych rysunku, rysunek w podglądzie notatki.
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const strokes = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing.strokes, ids.statements);
  assert.deepEqual(strokes.map((item) => [item.tool, item.color, item.size, item.text ?? item.source]),
    [['text', '#d70015', 56, 'Aktywa = pasywa'], ['math', '#0040dd', 56, '\\sqrt{x} + 1']], 'wzór – ostatnio wybrana wielkość (Duża)');
  assert.ok(strokes.every((item) => item.width > 0 && item.height > 0));
  await waitUntil(() => dialog.locator('.note-page__figure img').evaluate((image) => image.complete && image.naturalWidth === 1600), 'Rysunek w podglądzie');

  // Ponowna edycja rysunku: pole tekstowe nadal da się zaznaczyć i poprawić.
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('.note-images__item--drawing .note-images__open').click();
  await menuItem(page, 'Edytuj rysunek');
  await editor.waitFor();
  const again = await waitUntil(() => colorBox(page, 'red'), 'Tekst po ponownym otwarciu');
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await drawStroke(page, [[(again.x0 + again.x1) / 2, (again.y0 + again.y1) / 2, 0.5]]);
  await expectText(selectionCount, 'Pole tekstowe');
}, { device: IPAD });

/** Ułamki płótna dla punktu ekranu i punkt na okręgu (stopnie – zgodnie ze wskazówkami zegara na ekranie). */
const canvasPoint = (box, x, y) => [(x - box.x) / box.width, (y - box.y) / box.height];
const onCircle = (center, degrees, radius) => [center.x + radius * Math.cos((degrees * Math.PI) / 180), center.y + radius * Math.sin((degrees * Math.PI) / 180)];
/** Punkt `point` obrócony wokół `pivot` o `degrees` (na ekranie). */
const turnAround = (pivot, point, degrees) => {
  const turn = (degrees * Math.PI) / 180;
  const [vx, vy] = [point.x - pivot.x, point.y - pivot.y];
  return [pivot.x + vx * Math.cos(turn) - vy * Math.sin(turn), pivot.y + vx * Math.sin(turn) + vy * Math.cos(turn)];
};
const plainText = async (locator) => ((await locator.textContent()) ?? '').trim();

test('rysunek 1.14: linijka – zero na linii, przyskok do prostopadłej przy obrocie, ⊥, długość kreski, zero na przecięciu; skala – szacunek ekranu, 1:1, 1 kratka = 2,5 m (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Skala</p>');
  const box = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const at = (x, y) => canvasPoint(box, x, y);
  const pill = editor.locator('[data-testid=drawing-ruler-angle]');
  const lengthPill = editor.locator('[data-testid=drawing-ruler-length]');

  // Pozioma linia H (120 px nad środkiem) i pionowa V (100 px w prawo) – przecięcie P.
  await drawStroke(page, segment(at(center.x - 250, center.y - 120), at(center.x + 250, center.y - 120), 25));
  await drawStroke(page, segment(at(center.x + 100, center.y - 260), at(center.x + 100, center.y + 40), 15));
  await editor.locator('[data-testid=drawing-ruler]').click();
  await expectText(pill, 'Linijka 0°');
  assert.equal(await editor.locator('[data-testid=drawing-ruler-perpendicular]').isVisible(), true, 'przycisk ⊥ przy linijce');

  // Uchwyt myszą: 30°; zero daleko od linii – bez przyciągania.
  await page.mouse.move(...onCircle(center, 0, 170));
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) await page.mouse.move(...onCircle(center, -5 * step, 170));
  await page.mouse.up();
  await expectText(pill, 'Linijka 30°');
  assert.equal(await plainText(pill), 'Linijka 30°');

  // Linijka przeciągnięta w górę: zero przy górnej krawędzi (16 px w lewo, 28 px w górę od środka) trafia na H.
  const grab = [center.x + 52, center.y - 30];
  await page.mouse.move(...grab);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(grab[0], grab[1] - 9.2 * step);
  await page.mouse.up();
  await expectText(pill, 'Linijka 30° · na linii');
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-linijka-liczby-ipad.png') });

  // Obrót uchwytem wokół zera na linii: przy 84° linijka przyskakuje do 90° (prostopadle do H), przy 60° – już nie.
  const pivot = { x: center.x - 16, y: center.y - 120 };
  const handle = { x: center.x + 147.2, y: center.y - 177.3 };
  await page.mouse.move(...turnAround(pivot, handle, 0));
  await page.mouse.down();
  for (let step = 1; step <= 9; step += 1) await page.mouse.move(...turnAround(pivot, handle, -6 * step));
  await expectText(pill, 'Linijka 90° · prostopadle');
  for (let step = 8; step >= 5; step -= 1) await page.mouse.move(...turnAround(pivot, handle, -6 * step));
  await page.mouse.up();
  await expectText(pill, 'Linijka 60° · na linii');
  // ⊥ – prostopadle do linii pod zerem.
  await editor.locator('[data-testid=drawing-ruler-perpendicular]').click();
  await expectText(pill, 'Linijka 90° · prostopadle');

  // Kreska rysikiem wzdłuż krawędzi (od H w górę, 132 px, z drżeniem ręki) – prosto, z długością w skali.
  const along = Array.from({ length: 12 }, (_, index) => [...at(center.x - 24 + (index % 2) * 4, center.y - 120 - index * 12), 0.5]);
  await drawStroke(page, along);
  await expectText(lengthPill, 'Kreska: ');
  assert.match(await plainText(lengthPill), /^Kreska: [\d,]+ cm$/, 'domyślnie 1 kratka = 1 cm');

  // Skala: szacunek na ekranie, 1:1 (kratka jak na ekranie), potem 1 kratka = 2,5 m.
  await pill.click();
  const panel = editor.locator('[data-testid=drawing-ruler-panel]');
  await panel.waitFor();
  await expectText(panel.locator('[data-testid=drawing-scale-screen]'), 'kratka ma na tym ekranie ok.');
  assert.equal(await panel.locator('[data-testid=drawing-scale-value]').inputValue(), '1');
  assert.equal(await panel.locator('[data-testid=drawing-scale-unit]').inputValue(), 'cm');
  assert.equal(await panel.locator('[data-testid=drawing-ruler-snap]').isChecked(), true, 'przyciąganie domyślnie włączone');
  await panel.locator('[data-testid=drawing-scale-actual]').click();
  assert.equal(await panel.locator('[data-testid=drawing-scale-unit]').inputValue(), 'mm');
  await expectText(panel.locator('[data-testid=drawing-scale-screen]'), 'w skali ok. 1:1.');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-linijka-skala-ipad.png') });
  await panel.locator('[data-testid=drawing-scale-value]').fill('2,5');
  await panel.locator('[data-testid=drawing-scale-unit]').selectOption('m');
  await expectText(lengthPill, ' m');
  const length = Number((await plainText(lengthPill)).match(/([\d,]+) m$/)[1].replace(',', '.'));
  assert.equal(await panel.locator('[data-testid=drawing-scale-unit] optgroup').count(), 2, 'jednostki SI i imperialne');
  assert.equal(await panel.locator('[data-testid=drawing-scale-unit] option[value=ft]').count(), 1);
  await page.keyboard.press('Escape');
  await waitUntil(() => panel.isHidden(), 'Esc zamyka panel linijki');
  assert.equal(await editor.isVisible(), true, 'Esc przy panelu nie zamyka edytora');

  // Linijka (pionowa) przesunięta w prawo wzdłuż H: zero przyskakuje do przecięcia z V.
  const body = [center.x + 16, center.y - 60];
  await page.mouse.move(...body);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) await page.mouse.move(body[0] + (116 / 12) * step, body[1]);
  await page.mouse.up();
  await expectText(pill, 'Linijka 90° · na przecięciu');
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-linijka-przeciecie-ipad.png') });

  // Zapis: skala w danych rysunku; kreska przy linijce pionowa, od linii H, długość zgodna z pigułką.
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const saved = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing, ids.statements);
  assert.deepEqual(saved.scale, { value: 2.5, unit: 'm' });
  assert.equal(saved.strokes.length, 3);
  const ruled = saved.strokes[2].points;
  assert.equal(new Set(ruled.filter((_, index) => index % 3 === 0)).size, 1, 'kreska wzdłuż linijki prostopadłej do H – pionowa');
  const ys = ruled.filter((_, index) => index % 3 === 1);
  const units = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs((units / 44) * 2.5 - length) <= length * 0.02, `długość: ${units} jednostek = ${(units / 44) * 2.5} m, pigułka ${length} m`);
  assert.ok(Math.abs(Math.max(...ys) - saved.strokes[0].points[1]) < 1.5, 'kreska zaczyna się na H (zero linijki na linii)');
}, { device: IPAD });

test('rysunek 1.14: własne kolory – siatka, suwaki RGB i HEX, pipetka z lupą; trzy zapamiętane, także dla zakreślacza i pola tekstowego (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Kolory</p>');
  const panel = editor.locator('[data-testid=drawing-color-panel]');
  const value = panel.locator('[data-testid=drawing-color-value]');
  const customs = editor.locator('[data-testid^=drawing-color-custom-]');

  // Siatka: dotknięty kolor w podglądzie; „Użyj koloru” – kolor pióra i pierwszy własny.
  await editor.locator('[data-testid=drawing-color-custom]').click();
  await panel.waitFor();
  await expectText(panel.locator('.drawing__settings-title'), 'Kolor pióra');
  assert.equal(await panel.locator('[data-testid=drawing-color-tab-grid]').getAttribute('aria-checked'), 'true');
  assert.equal(await panel.locator('.drawing__grid-color').count(), 84, '12 odcieni × 6 jasności i szarości');
  const cell = panel.locator('[data-testid=drawing-grid-color-37]');
  const gridHex = (await cell.getAttribute('aria-label')).toLowerCase();
  await cell.click();
  await expectText(value, gridHex.toUpperCase());
  assert.equal(await cell.getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-kolor-siatka-ipad.png') });
  await panel.locator('[data-testid=drawing-color-use]').click();
  await waitUntil(() => panel.isHidden(), 'Panel zamknięty po „Użyj koloru”');
  assert.equal(await customs.count(), 1);
  assert.equal(await editor.locator('[data-testid=drawing-color-custom-0]').getAttribute('aria-pressed'), 'true', 'własny kolor wybrany');
  await drawStroke(page, segment([0.25, 0.3], [0.6, 0.3]));

  // Suwaki: kod HEX ustawia R, G, B; suwak R zmienia kod.
  await editor.locator('[data-testid=drawing-color-custom]').click();
  await panel.locator('[data-testid=drawing-color-tab-sliders]').click();
  await panel.locator('[data-testid=drawing-color-hex]').fill('#12AB34');
  assert.deepEqual(await Promise.all(['r', 'g', 'b'].map((name) => panel.locator(`[data-testid=drawing-channel-${name}]`).inputValue())), ['18', '171', '52']);
  await panel.locator('[data-testid=drawing-channel-r]').fill('200');
  await expectText(value, '#C8AB34');
  assert.equal(await panel.locator('[data-testid=drawing-color-hex]').inputValue(), '#C8AB34');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-kolor-suwaki-ipad.png') });
  await panel.locator('[data-testid=drawing-color-use]').click();
  assert.equal(await customs.count(), 2);

  // Pipetka: kolor spod rysika z grubej czerwonej kreski (lupa w trakcie); kolor z palety – bez nowego własnego.
  await editor.locator('[data-testid=drawing-color-red]').click();
  await editor.locator('[data-testid=drawing-width-2]').click();
  await drawStroke(page, segment([0.25, 0.55], [0.7, 0.55], 16, () => 1));
  await editor.locator('[data-testid=drawing-color-custom-1]').click();
  await editor.locator('[data-testid=drawing-color-custom]').click();
  await panel.locator('[data-testid=drawing-color-tab-picker]').click();
  await drawStroke(page, segment([0.4, 0.5], [0.45, 0.55], 4), { up: false });
  await expectText(value, '#D70015');
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-kolor-pipetka-ipad.png') });
  await drawStroke(page, [[0.45, 0.55, 0]], { only: 'up' });
  assert.equal(await panel.isVisible(), true, 'pipetka nie zamyka panelu');
  assert.equal(await darkAt(page, 0.43, 0.53), false, 'pipetka nie rysuje');
  await panel.locator('[data-testid=drawing-color-use]').click();
  assert.equal(await editor.locator('[data-testid=drawing-color-red]').getAttribute('aria-pressed'), 'true', 'kolor z palety – czerwony');
  assert.equal(await customs.count(), 2);

  // Dwa kolejne kody – zostają trzy ostatnie (kolor z siatki wypada).
  for (const hex of ['#112233', '#445566']) {
    await editor.locator('[data-testid=drawing-color-custom]').click();
    await panel.locator('[data-testid=drawing-color-tab-sliders]').click();
    await panel.locator('[data-testid=drawing-color-hex]').fill(hex);
    await panel.locator('[data-testid=drawing-color-use]').click();
  }
  assert.equal(await customs.count(), 3);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lexicards-drawing-tools')).customColors), ['#445566', '#112233', '#c8ab34']);
  // Esc zamyka panel koloru, edytor zostaje.
  await editor.locator('[data-testid=drawing-color-custom]').click();
  await panel.waitFor();
  await page.keyboard.press('Escape');
  await waitUntil(() => panel.isHidden(), 'Esc zamyka panel koloru');
  assert.equal(await editor.isVisible(), true);
  // Zakreślacz – te same własne kolory; pole tekstowe w pierwszym własnym kolorze.
  await editor.locator('[data-testid=drawing-tool-highlighter]').click();
  assert.equal(await customs.count(), 3, 'własne kolory przy zakreślaczu');
  await editor.locator('[data-testid=drawing-insert-text]').click();
  await page.locator('[data-testid=drawing-text-input]').fill('Kolor własny');
  await page.locator('[data-testid=drawing-element-color-custom-0]').click();
  await sheetSubmit(page).click();
  await expectText(editor.locator('[data-testid=drawing-selection-count]'), 'Pole tekstowe');

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const strokes = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing.strokes, ids.statements);
  assert.deepEqual(strokes.map((stroke) => stroke.color), [gridHex, '#d70015', '#445566']);
}, { device: IPAD });

test('rysunek 1.14: zaznaczanie fragmentów – prostokąt od prawej, lasso zgodnie ze wskazówkami (usunięcie, przesunięcie wnętrza, cofnij), lasso przeciwnie – całe kreski; kopiuj i wklej (przyciski, Ctrl+C/V/X, fragment, w innym rysunku) (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Zaznaczanie</p>');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const hint = editor.locator('[data-testid=drawing-select-hint]');
  const barHidden = () => editor.locator('.drawing__selection').isHidden();
  /** Obrys elipsy (ułamki płótna): zgodnie ze wskazówkami zegara albo przeciwnie. */
  const loop = (cx, cy, rx, ry, clockwise, steps = 28) => Array.from({ length: steps + 1 }, (_, index) => {
    const t = (clockwise ? 1 : -1) * (index / steps) * Math.PI * 2;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t), 0.5];
  });

  // Długa kreska L i krótka S nad nią.
  await drawStroke(page, segment([0.2, 0.5], [0.8, 0.5], 30));
  await drawStroke(page, segment([0.45, 0.3], [0.55, 0.3], 10));
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await expectText(hint, 'Od lewej do prawej – całe kreski, od prawej do lewej – fragmenty');
  assert.equal(await editor.locator('[data-testid=drawing-select-mode-auto]').getAttribute('aria-checked'), 'true');

  // Prostokąt od prawej do lewej – fragment L (zielony, kreskowany); kreska jeszcze w całości widoczna.
  await drawStroke(page, segment([0.6, 0.44], [0.4, 0.56], 8), { up: false });
  await expectText(hint, 'Zaznaczasz fragmenty');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-prostokat-fragmenty-ipad.png') });
  await drawStroke(page, [[0.4, 0.56, 0]], { only: 'up' });
  await expectText(selectionCount, 'Fragment');
  assert.equal(await darkAt(page, 0.5, 0.5), true);
  // Usuń – znika tylko środek; cofnij – cała kreska.
  await editor.locator('[data-testid=drawing-selection-delete]').click();
  await waitUntil(async () => !(await darkAt(page, 0.5, 0.5)), 'Środek kreski usunięty');
  assert.equal(await darkAt(page, 0.37, 0.5), true, 'lewa część zostaje');
  assert.equal(await darkAt(page, 0.63, 0.5), true, 'prawa część zostaje');
  assert.equal(await darkAt(page, 0.43, 0.5), false, 'cięcie na brzegu prostokąta');
  await editor.locator('[data-testid=drawing-undo]').click();
  await waitUntil(() => darkAt(page, 0.5, 0.5), 'Cofnij – cała kreska');
  assert.equal(await editor.locator('[data-testid=drawing-redo]').isDisabled(), false);

  // Fragment zaznaczony i zdjęty (Esc) bez zmian – bez kroku cofania („Ponów” nadal dostępne).
  await drawStroke(page, segment([0.6, 0.44], [0.4, 0.56], 8));
  await expectText(selectionCount, 'Fragment');
  await page.keyboard.press('Escape');
  await waitUntil(barHidden, 'Esc zdejmuje zaznaczenie fragmentu');
  assert.equal(await editor.locator('[data-testid=drawing-redo]').isDisabled(), false, 'zaznaczenie bez skutku nie zmienia historii');

  // Przesunięcie wnętrza: wycięty środek w dół, reszta na miejscu; cofnij – jedna kreska.
  await drawStroke(page, segment([0.6, 0.44], [0.4, 0.56], 8));
  await expectText(selectionCount, 'Fragment');
  await drawStroke(page, segment([0.5, 0.5], [0.5, 0.62], 8));
  await waitUntil(async () => (await darkAt(page, 0.5, 0.62)) && !(await darkAt(page, 0.5, 0.5)), 'Wycięty fragment przesunięty');
  assert.equal(await darkAt(page, 0.3, 0.5), true, 'reszta kreski na miejscu');
  await editor.locator('[data-testid=drawing-undo]').click();
  await waitUntil(async () => (await darkAt(page, 0.5, 0.5)) && !(await darkAt(page, 0.5, 0.62)), 'Cofnij przesunięcie fragmentu');
  // Prostokąt od lewej – tylko kreski w całości w środku (tu żadnej).
  await drawStroke(page, segment([0.4, 0.44], [0.6, 0.56], 8));
  await nextFrames(page);
  assert.equal(await barHidden(), true, 'od lewej – całe kreski: L wystaje, nic nie zaznaczone');

  // Lasso: przeciwnie do wskazówek zegara – całe kreski (S), zgodnie – wnętrze (środek L).
  await editor.locator('[data-testid=drawing-select-lasso]').click();
  assert.equal(await editor.locator('[data-testid=drawing-select-lasso]').getAttribute('aria-checked'), 'true');
  assert.equal(await editor.locator('[data-testid=drawing-tool-select]').getAttribute('aria-label'), 'Zaznaczanie – lasso');
  await expectText(hint, 'Przeciwnie do wskazówek zegara – całe kreski, zgodnie – fragmenty');
  await drawStroke(page, loop(0.5, 0.3, 0.09, 0.07, false));
  await expectText(selectionCount, '1 kreska');
  await page.keyboard.press('Escape');
  await drawStroke(page, loop(0.5, 0.5, 0.06, 0.09, true), { up: false });
  await expectText(hint, 'Zaznaczasz fragmenty');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-lasso-fragmenty-ipad.png') });
  await drawStroke(page, [loop(0.5, 0.5, 0.06, 0.09, true).at(-1)], { only: 'up' });
  await expectText(selectionCount, 'Fragment');
  await page.keyboard.press('Delete');
  await waitUntil(async () => !(await darkAt(page, 0.5, 0.5)), 'Lasso zgodnie ze wskazówkami – usunięte wnętrze');
  assert.equal(await darkAt(page, 0.3, 0.5), true);
  assert.equal(await darkAt(page, 0.5, 0.3), true, 'S poza lassem bez zmian');
  await page.keyboard.press('Control+z');
  await waitUntil(() => darkAt(page, 0.5, 0.5), 'Ctrl+Z – cała kreska');

  // Kopiuj i wklej: przyciskami (S), Ctrl+V – druga kopia, Ctrl+X – wycięta.
  await drawStroke(page, loop(0.5, 0.3, 0.09, 0.07, false));
  await expectText(selectionCount, '1 kreska');
  assert.equal(await editor.locator('[data-testid=drawing-paste]').isHidden(), true, 'schowek pusty – bez „Wklej”');
  await editor.locator('[data-testid=drawing-selection-copy]').click();
  await expectText(editor.locator('[data-testid=drawing-notice]'), 'Skopiowano');
  await editor.locator('[data-testid=drawing-paste]').click();
  await expectText(selectionCount, '1 kreska');
  await page.keyboard.press('Control+v');
  await expectText(selectionCount, '1 kreska');
  await page.keyboard.press('Control+x');
  await waitUntil(barHidden, 'Ctrl+X – wycięta kopia');
  await expectText(editor.locator('[data-testid=drawing-notice]'), 'Wycięto');
  // Fragment: Ctrl+C, Esc (L zostaje w całości), Ctrl+V – sam środek L (lasso nad wklejoną kopią S).
  await drawStroke(page, loop(0.5, 0.5, 0.06, 0.03, true));
  await expectText(selectionCount, 'Fragment');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+v');
  await expectText(selectionCount, '1 kreska');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wklejony-fragment-ipad.png') });

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  // Schowek w innym rysunku tej notatki.
  await dialog.locator('[data-testid=note-image-draw]').click();
  await editor.waitFor();
  await waitUntil(() => editor.locator('[data-testid=drawing-canvas]').evaluate((canvas) => canvas.width > 0), 'Płótno gotowe');
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await editor.locator('[data-testid=drawing-paste]').click();
  await expectText(selectionCount, '1 kreska');
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const drawings = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id)).map((image) => image.drawing.strokes), ids.statements);
  assert.equal(drawings.length, 2);
  const [first, second] = drawings;
  const extent = (stroke) => { const xs = stroke.points.filter((_, index) => index % 3 === 0); return Math.max(...xs) - Math.min(...xs); };
  assert.equal(first.length, 4, 'L, S, kopia S, wklejony fragment L');
  assert.ok(extent(first[0]) > extent(first[3]) * 4, `L w całości (${extent(first[0])}), wklejony tylko środek (${extent(first[3])})`);
  assert.ok(Math.abs(extent(first[2]) - extent(first[1])) < 1, 'kopia S tej samej długości');
  assert.equal(second.length, 1, 'wklejone w drugim rysunku');
  assert.ok(Math.abs(extent(second[0]) - extent(first[3])) < 1);
}, { device: IPAD });

/** Najciemniejsza średnia składowych (0–255) w kwadracie warstwy zapisanych kresek (środek – ułamki płótna, bok w px CSS). */
const darkest = (page, x, y, side = 24) => page.locator('.drawing__canvas:not(.drawing__canvas--live)').evaluate((canvas, [fx, fy, size]) => {
  const half = Math.round((size * (canvas.width / canvas.getBoundingClientRect().width)) / 2);
  const { data } = canvas.getContext('2d').getImageData(Math.round(canvas.width * fx) - half, Math.round(canvas.height * fy) - half, half * 2, half * 2);
  let min = 255;
  for (let index = 0; index < data.length; index += 4) min = Math.min(min, (data[index] + data[index + 1] + data[index + 2]) / 3);
  return min;
}, [x, y, side]);

test('rysunek 1.15: jasność kratki, szablon – boisko (pomniejsz, powiększ, dopasuj, przesunięcie, wyśrodkuj, jasność, skala w metrach), nieruchomy po „Gotowe”; szablon z pliku (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Boisko</p>');
  const panel = editor.locator('[data-testid=drawing-paper-panel]');

  // Jasność kratki: pięć poziomów – bardzo jasne jaśniejsze niż domyślne, bardzo ciemne ciemniejsze.
  const normal = await darkest(page, 0.3, 0.6, 60);
  await editor.locator('[data-testid=drawing-paper]').click();
  await panel.waitFor();
  assert.equal(await panel.locator('[data-testid^=drawing-paper-level-]').count(), 5);
  assert.equal(await panel.locator('[data-testid=drawing-paper-level-1]').getAttribute('aria-checked'), 'true', 'domyślnie jak do 1.14');
  await panel.locator('[data-testid=drawing-paper-level-4]').click();
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-tlo-panel-ipad.png') });
  const dark = await waitUntil(async () => { const value = await darkest(page, 0.3, 0.6, 60); return value < normal - 30 ? value : null; }, 'Kratka ciemniejsza');
  await panel.locator('[data-testid=drawing-paper-level-0]').click();
  const light = await waitUntil(async () => { const value = await darkest(page, 0.3, 0.6, 60); return value > normal ? value : null; }, 'Kratka jaśniejsza');
  assert.ok(light > normal && normal > dark, `bardzo jasne ${light} > domyślne ${normal} > bardzo ciemne ${dark}`);

  // Boisko: od razu ustawianie – 100%, skala rysunku w metrach (rysunek miał domyślną).
  const before = await darkest(page, 0.5, 0.25);
  await panel.locator('[data-testid=drawing-template-pitch]').click();
  await expectValue(panel.locator('[data-testid=drawing-template-size]'), '100');
  assert.equal(await panel.locator('[data-testid=drawing-template-scale]').isChecked(), true);
  const lineAt = async (x) => (await darkest(page, x, 0.25)) < before - 40;
  await waitUntil(() => lineAt(0.5), 'Linia środkowa boiska na środku strony');
  await panel.locator('[data-testid=drawing-template-smaller]').click();
  await expectValue(panel.locator('[data-testid=drawing-template-size]'), '90,9');
  await panel.locator('[data-testid=drawing-template-larger]').click();
  await panel.locator('[data-testid=drawing-template-larger]').click();
  await expectValue(panel.locator('[data-testid=drawing-template-size]'), '110');
  await panel.locator('[data-testid=drawing-template-fit]').click();
  await expectValue(panel.locator('[data-testid=drawing-template-size]'), '100');
  // Przeciągnięcie przesuwa szablon (nie rysuje).
  await drawStroke(page, segment([0.45, 0.6], [0.55, 0.6], 8));
  await waitUntil(async () => (await lineAt(0.6)) && !(await lineAt(0.5)), 'Szablon przesunięty w prawo (o 0,1 szerokości)');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-szablon-boisko-ustawianie-ipad.png') });
  await panel.locator('[data-testid=drawing-template-center]').click();
  await waitUntil(() => lineAt(0.5), 'Wyśrodkowany');
  await panel.locator('[data-testid=drawing-template-level-4]').click();
  await panel.locator('[data-testid=drawing-template-done]').click();
  await expectText(panel.locator('[data-testid=drawing-template-name]'), 'Boisko piłkarskie');
  await editor.locator('[data-testid=drawing-paper]').click();
  await waitUntil(() => panel.isHidden(), 'Panel tła zamknięty');
  await expectText(editor.locator('[data-testid=drawing-paper]'), 'i szablon');
  // Po „Gotowe” szablon się nie rusza – przeciągnięcie rysuje kreskę.
  await drawStroke(page, segment([0.45, 0.85], [0.55, 0.85], 8));
  await waitUntil(() => darkAt(page, 0.5, 0.85), 'Kreska pióra');
  assert.equal(await lineAt(0.5), true, 'boisko na miejscu');
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-szablon-boisko-ipad.png') });
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });

  // Szablon z pliku (obraz: krzyż na białym tle) w nowym rysunku – biel znika, linie zostają.
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 300, 200);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(300, 200);
    ctx.moveTo(300, 0);
    ctx.lineTo(0, 200);
    ctx.stroke();
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await dialog.locator('[data-testid=note-image-draw]').click();
  await editor.waitFor();
  await waitUntil(() => editor.locator('[data-testid=drawing-canvas]').evaluate((canvas) => canvas.width > 0), 'Płótno gotowe');
  await nextFrames(page);
  const plain = await darkest(page, 0.5, 0.53, 50);
  await editor.locator('[data-testid=drawing-paper]').click();
  await panel.locator('[data-testid=drawing-template-input]').setInputFiles({ name: 'kalka.png', mimeType: 'image/png', buffer: png });
  await expectValue(panel.locator('[data-testid=drawing-template-size]'), '100');
  await waitUntil(async () => (await darkest(page, 0.5, 0.53, 50)) < plain - 60, 'Krzyż szablonu na środku strony');
  await panel.locator('[data-testid=drawing-template-done]').click();
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });

  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const drawings = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id)).map((image) => ({
    paperLevel: image.drawing.paperLevel, template: { ...image.drawing.template, bytes: image.drawing.template?.bytes?.byteLength ?? null }, scale: image.drawing.scale
  })), ids.statements);
  assert.equal(drawings[0].paperLevel, 0);
  assert.deepEqual([drawings[0].template.source, drawings[0].template.level, drawings[0].template.w, drawings[0].template.bytes], ['pitch', 4, 1512, null]);
  assert.deepEqual(drawings[0].scale, { value: 3.06, unit: 'm' }, 'skala rysunku według boiska');
  assert.deepEqual([drawings[1].template.source, drawings[1].template.type, drawings[1].template.width], ['image', 'image/png', 300]);
  assert.ok(drawings[1].template.bytes > 100, 'obraz szablonu zapisany z rysunkiem');
}, { device: IPAD });

test('rysunek 1.15: liniuszek – kreska przy linii i wzdłuż niej prosto na linii, w poprzek – zwykła; linie poprzeczne, kąt 45°, przesunięcie kółkiem (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Liniuszek</p>');
  const panel = editor.locator('[data-testid=drawing-guide-panel]');
  await editor.locator('[data-testid=drawing-guide]').click();
  assert.equal(await editor.locator('[data-testid=drawing-guide]').getAttribute('aria-pressed'), 'true');
  await expectText(editor.locator('[data-testid=drawing-guide-pill]'), 'Liniuszek 0° · co 1 cm');
  // Gęste linie (co ćwierć kratki) – każda kreska zaczyna się przy którejś.
  await editor.locator('[data-testid=drawing-guide-pill]').click();
  await panel.waitFor();
  await panel.locator('[data-testid=drawing-guide-spacing]').fill('0.25');
  await expectText(editor.locator('[data-testid=drawing-guide-pill]'), 'co 0,25 cm');
  await page.keyboard.press('Escape');
  await waitUntil(() => panel.isHidden(), 'Panel liniuszka zamknięty');
  // Wzdłuż linii (z drżeniem) – na linii; ukośnie – zwykła kreska.
  const along = Array.from({ length: 13 }, (_, index) => [0.25 + index * 0.02, 0.4 + (index % 2) * 0.004, 0.5]);
  await drawStroke(page, along);
  await expectText(editor.locator('[data-testid=drawing-ruler-length]'), 'Kreska:');
  await drawStroke(page, segment([0.3, 0.55], [0.4, 0.7], 10));
  // Linie poprzeczne (prostopadle): kreska w pionie – na linii poprzecznej.
  await editor.locator('[data-testid=drawing-guide-pill]').click();
  await panel.locator('[data-testid=drawing-guide-cross]').check({ force: true });
  await panel.locator('[data-testid=drawing-guide-crossSpacing]').fill('0.25');
  await expectText(editor.locator('[data-testid=drawing-guide-pill]'), 'poprzeczne');
  await page.keyboard.press('Escape');
  const vertical = Array.from({ length: 11 }, (_, index) => [0.6 + (index % 2) * 0.003, 0.35 + index * 0.025, 0.5]);
  await drawStroke(page, vertical);
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-liniuszek-ipad.png') });
  // Kąt 45°: kreska ukośna w górę w prawo – na linii.
  await editor.locator('[data-testid=drawing-guide-pill]').click();
  await panel.locator('[data-testid=drawing-guide-cross]').uncheck({ force: true });
  await panel.locator('[data-testid=drawing-guide-angle-45]').click();
  await expectText(editor.locator('[data-testid=drawing-guide-pill]'), 'Liniuszek 45°');
  await page.keyboard.press('Escape');
  const box = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const diagonal = Array.from({ length: 11 }, (_, index) => [0.7 + (index * 12) / box.width, 0.8 - (index * 12) / box.height + (index % 2) * 0.003, 0.5]);
  await drawStroke(page, diagonal);
  // Kółko liniuszka (biały środek na warstwie bieżącej) przesunięte o 15 px w dół – linie przesunięte.
  await editor.locator('[data-testid=drawing-guide-pill]').click();
  await panel.locator('[data-testid=drawing-guide-angle-0]').click();
  await page.keyboard.press('Escape');
  const knob = await editor.locator('[data-testid=drawing-canvas]').evaluate((canvas) => {
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let [sx, sy, count] = [0, 0, 0];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (data[index + 3] > 200 && data[index] > 240 && data[index + 1] > 240 && data[index + 2] > 240) {
          sx += x;
          sy += y;
          count += 1;
        }
      }
    }
    const box = canvas.getBoundingClientRect();
    return count ? { x: box.left + (sx / count) * (box.width / width), y: box.top + (sy / count) * (box.height / height) } : null;
  });
  assert.ok(knob, 'kółko liniuszka na płótnie');
  await drawStroke(page, segment([(knob.x - box.x) / box.width, (knob.y - box.y) / box.height], [(knob.x - box.x) / box.width, (knob.y + 15 - box.y) / box.height], 6));
  await drawStroke(page, Array.from({ length: 13 }, (_, index) => [0.25 + index * 0.02, 0.2 + (index % 2) * 0.004, 0.5]));
  // Do zrzutu: linie co kratkę i poprzeczne pod kątem 75° (jak liniatura do pisma pochyłego).
  await editor.locator('[data-testid=drawing-guide-pill]').click();
  await panel.locator('[data-testid=drawing-guide-spacing]').fill('1');
  await panel.locator('[data-testid=drawing-guide-cross]').check({ force: true });
  await panel.locator('[data-testid=drawing-guide-crossSpacing]').fill('1');
  await panel.locator('[data-testid=drawing-guide-crossAngle-75]').click();
  await expectText(editor.locator('[data-testid=drawing-guide-pill]'), 'co 1 cm · poprzeczne');
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-liniuszek-panel-ipad.png') });
  await page.keyboard.press('Escape');

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const strokes = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing.strokes.map((stroke) => stroke.points), ids.statements);
  assert.equal(strokes.length, 5, 'kółko liniuszka nie rysuje');
  const xs = (points) => points.filter((_, index) => index % 3 === 0);
  const ys = (points) => points.filter((_, index) => index % 3 === 1);
  const [first, oblique, upright, slanted, shifted] = strokes;
  assert.equal(new Set(ys(first)).size, 1, 'wzdłuż linii – jedno y');
  const offset = (value) => ((value % 11) + 11) % 11;
  assert.ok(Math.min(offset(ys(first)[0]), 11 - offset(ys(first)[0])) < 0.2, `linie przez węzły kratki co 11 jednostek (y = ${ys(first)[0]})`);
  assert.ok(new Set(ys(oblique)).size > 3 && new Set(xs(oblique)).size > 3, 'ukośnie – zwykła kreska');
  assert.equal(new Set(xs(upright)).size, 1, 'w pionie – na linii poprzecznej (jedno x)');
  const sums = xs(slanted).map((x, index) => x + ys(slanted)[index]);
  assert.ok(Math.max(...sums) - Math.min(...sums) < 0.5, `kąt 45° – x + y stałe (${Math.min(...sums)}–${Math.max(...sums)})`);
  assert.equal(new Set(ys(shifted)).size, 1);
  const moved = offset(ys(shifted)[0]);
  assert.ok(moved > 0.8 && moved < 10.2, `po przesunięciu kółkiem linie w innym miejscu (y mod 11 = ${moved})`);
}, { device: IPAD });

test('rysunek 1.15: kształty – prostokąt przeciągnięciem, punkty konstrukcyjne (narożnik, pochylenie, obrót), trójkąt dotknięciem i wierzchołek, odcinek poziomo, zaznaczanie dotknięciem środka, gumka, cofnij (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Kształty</p>');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const panel = editor.locator('[data-testid=drawing-shape-panel]');
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.waitFor();
  assert.equal(await panel.locator('[data-testid^=drawing-shape-]').count(), 7);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-ksztalty-panel-ipad.png') });
  await panel.locator('[data-testid=drawing-shape-rect]').click();
  await waitUntil(() => panel.isHidden(), 'Panel kształtów zamknięty po wyborze');
  // Prostokąt z przeciągnięcia: linie na brzegu, środek pusty; zaznaczony z punktami konstrukcyjnymi.
  await drawStroke(page, segment([0.3, 0.3], [0.5, 0.5], 10));
  await expectText(selectionCount, 'Prostokąt');
  await waitUntil(() => darkAt(page, 0.3, 0.4), 'Lewy bok prostokąta');
  assert.equal(await darkAt(page, 0.4, 0.4), false, 'środek pusty');
  // Narożnik: szerokość i wysokość; pochylenie – górny bok w prawo; obrót – kółkiem nad kształtem o 90°.
  await drawStroke(page, segment([0.5, 0.5], [0.6, 0.55], 8));
  await waitUntil(async () => (await darkAt(page, 0.6, 0.42)) && !(await darkAt(page, 0.5, 0.42)), 'Prawy bok przesunięty narożnikiem');
  await drawStroke(page, segment([0.54, 0.3], [0.59, 0.3], 8));
  await waitUntil(async () => !(await darkAt(page, 0.3, 0.31)), 'Górny lewy narożnik przesunięty pochyleniem');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-ksztalt-punkty-ipad.png') });
  const box = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const rotateY = 0.425 - (0.125 * box.height + 30) / box.height;
  await drawStroke(page, segment([0.475, rotateY], [0.625, 0.425], 10));
  await nextFrames(page);
  await editor.locator('[data-testid=drawing-undo]').click();
  await editor.locator('[data-testid=drawing-redo]').click();

  // Dotknięcie obok zaznaczonego kształtu tylko je zdejmuje; następne – trójkąt domyślnej wielkości;
  // pomarańczowy punkt (wierzchołek) przeciągnięty nad lewy narożnik.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-triangle]').click();
  await drawStroke(page, [[0.8, 0.75, 0.5]]);
  await expectText(selectionCount, 'Trójkąt');
  // Skala strony na ekranie: szerokość białej strony (px) / 1600 jednostek.
  const scale = await page.locator('.drawing__canvas:not(.drawing__canvas--live)').evaluate((canvas) => {
    const row = canvas.getContext('2d').getImageData(0, Math.round(canvas.height * 0.95), canvas.width, 1).data;
    const opaque = [];
    for (let x = 0; x < canvas.width; x += 1) if (row[x * 4 + 3] === 255) opaque.push(x);
    return ((opaque.at(-1) - opaque[0] + 1) / 1600) * (canvas.getBoundingClientRect().width / canvas.width);
  });
  const apex = [0.8, 0.75 - (66 * scale) / box.height];
  await drawStroke(page, segment(apex, [0.8 - (86 * scale) / box.width, apex[1]], 8));
  await nextFrames(page);
  await drawStroke(page, [[0.92, 0.3, 0.5]]);
  await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Dotknięcie obok – tylko odznaczenie');
  // Odcinek prawie poziomy – przyciągnięty do poziomu.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-line]').click();
  await drawStroke(page, segment([0.15, 0.85], [0.35, 0.86], 10));
  await expectText(selectionCount, 'Odcinek');

  // Zaznaczanie: dotknięcie pustego środka trójkąta zaznacza go; gumka całych kresek usuwa kształt, cofnij wraca.
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await drawStroke(page, [[0.79, 0.77, 0.5]]);
  await expectText(selectionCount, 'Trójkąt');
  await editor.locator('[data-testid=drawing-tool-eraser]').click();
  await drawStroke(page, segment([0.15, 0.82], [0.35, 0.88], 10));
  await waitUntil(async () => !(await darkAt(page, 0.25, 0.85)), 'Gumka usunęła odcinek');
  await editor.locator('[data-testid=drawing-undo]').click();
  await waitUntil(() => darkAt(page, 0.25, 0.85), 'Cofnij – odcinek wraca');

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const shapes = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing.strokes, ids.statements);
  assert.deepEqual(shapes.map((shape) => shape.shape), ['rect', 'triangle', 'line']);
  const [rect, tri, line] = shapes;
  const ratio = (0.3 * box.width) / (0.25 * box.height);
  assert.ok(Math.abs(rect.w / rect.h - ratio) < 0.03, `narożnik: proporcje ${rect.w / rect.h} ≈ ${ratio}`);
  const skew = (0.05 * box.width) / (0.25 * box.height);
  assert.ok(Math.abs(rect.skew - skew) < 0.03, `pochylenie ${rect.skew} ≈ ${skew}`);
  assert.ok(Math.abs(Math.abs(rect.angle) - Math.PI / 2) < 0.01, `obrót o 90° (${rect.angle}) – po cofnij i ponów`);
  assert.deepEqual([tri.w, tri.h, tri.adjust], [176, 132, 0], 'trójkąt domyślnej wielkości, wierzchołek nad lewym narożnikiem');
  assert.deepEqual([line.h, line.angle], [0, 0], 'odcinek poziomo');
  assert.ok(shapes.every((shape) => shape.color === '#1d1d1f' && shape.size > 0), 'kolor i grubość pióra');
}, { device: IPAD });

/**
 * Obraz notatki z biblioteki (od 1.17 – osadzony fragment rysunku): typ, wymiary, krycie lewego górnego
 * rogu, piksele linii kratki w wierszu przy górnej krawędzi (10% wysokości) i ciemne piksele (kreski).
 */
const noteImageStats = (page, lessonID, label) => page.evaluate(async ([id, name]) => {
  const image = (await window.lexicards.library.noteImages(id)).find((item) => item.label === name);
  const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.type }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const row = Math.round(canvas.height * 0.1);
  let tinted = 0;
  for (let x = 0; x < canvas.width; x += 1) {
    const index = (row * canvas.width + x) * 4;
    if (data[index + 3] > 200 && data[index] > 150 && data[index] < 245) tinted += 1;
  }
  let dark = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index + 3] > 200 && data[index] < 80) dark += 1;
  return { type: image.type, drawing: Boolean(image.drawing), width: canvas.width, height: canvas.height, corner: data[3], tinted, dark };
}, [lessonID, label]);

test('rysunek 1.17: wycinek – prawym przyciskiem myszy (prostokąt) i w trybie „Wycinek” rysikiem (lasso); kopiuj – obraz w schowku; „Osadź” – wycinek z kratką i zaznaczenie bez kratki jako obrazy notatki za rysunkiem (iPad)', async ({ open, context }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Wycinek</p>');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const notice = editor.locator('[data-testid=drawing-notice]');
  const box = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const at = (x, y) => [box.x + box.width * x, box.y + box.height * y];

  await drawStroke(page, segment([0.3, 0.5], [0.7, 0.5], 20));
  await editor.locator('[data-testid=drawing-tool-select]').click();
  // Prawy przycisk myszy: prostokąt wycinka (bez menu przeglądarki), polecenia – kopiuj i osadź.
  await page.mouse.move(...at(0.4, 0.4));
  await page.mouse.down({ button: 'right' });
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(...at(0.4 + step * 0.025, 0.4 + step * 0.025));
  await page.mouse.up({ button: 'right' });
  await expectText(selectionCount, 'Wycinek');
  for (const [id, visible] of [['copy', true], ['embed', true], ['duplicate', false], ['delete', false], ['text', false], ['fill', false]]) {
    assert.equal(await editor.locator(`[data-testid=drawing-selection-${id}]`).isVisible(), visible, `wycinek: ${id}`);
  }
  assert.equal(await page.evaluate(() => window.lexicards.library.noteImages !== undefined), true);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wycinek-ipad.png') });
  // Kopiuj – obraz PNG w schowku systemu, w proporcjach obszaru.
  await editor.locator('[data-testid=drawing-selection-copy]').click();
  await expectText(notice, 'Skopiowano wycinek jako obraz');
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bitmap = await createImageBitmap(await item.getType('image/png'));
    return { types: item.types, width: bitmap.width, height: bitmap.height };
  });
  assert.ok(copied.types.includes('image/png'), `typy w schowku: ${copied.types}`);
  const ratio = box.width / box.height;
  assert.ok(Math.abs(copied.width / copied.height - ratio) < 0.05, `proporcje wycinka ${copied.width}×${copied.height} ≈ ${ratio}`);
  // Osadź – nowy obraz notatki.
  await editor.locator('[data-testid=drawing-selection-embed]').click();
  await expectText(notice, 'Osadzono w notatce jako „Obraz 1”');
  await page.keyboard.press('Escape');
  await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Esc zdejmuje wycinek');
  assert.equal(await editor.isVisible(), true, 'edytor zostaje otwarty');

  // Tryb „Wycinek” (bez prawego przycisku – iPad): lasso rysikiem.
  await editor.locator('[data-testid=drawing-select-mode-snip]').click();
  await editor.locator('[data-testid=drawing-select-lasso]').click();
  await expectText(editor.locator('[data-testid=drawing-select-hint]'), 'Wycinek');
  const loop = Array.from({ length: 29 }, (_, index) => {
    const t = (index / 28) * Math.PI * 2;
    return [0.5 + 0.08 * Math.cos(t), 0.5 + 0.1 * Math.sin(t), 0.5];
  });
  await drawStroke(page, loop);
  await expectText(selectionCount, 'Wycinek');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wycinek-lasso-ipad.png') });
  await editor.locator('[data-testid=drawing-selection-embed]').click();
  await expectText(notice, '„Obraz 2”');
  // Zaznaczenie całych kresek – „Osadź”: same kreski na białym tle, bez kratki.
  await editor.locator('[data-testid=drawing-select-mode-auto]').click();
  await editor.locator('[data-testid=drawing-select-rect]').click();
  await drawStroke(page, segment([0.25, 0.42], [0.75, 0.58], 8));
  await expectText(selectionCount, '1 kreska');
  assert.equal(await editor.locator('[data-testid=drawing-selection-embed]').isVisible(), true);
  await editor.locator('[data-testid=drawing-selection-embed]').click();
  await expectText(notice, '„Obraz 3”');
  assert.equal(await dialog.locator('[data-testid=note-image-label-text]').count(), 3, 'obrazy w notatce od razu');

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  assert.deepEqual(await dialog.locator('[data-testid=note-image-label-text]').allTextContents(), ['Rysunek 1', 'Obraz 1', 'Obraz 2', 'Obraz 3'],
    'nowy rysunek przed osadzonymi z niego obrazami');
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const rectSnip = await noteImageStats(page, ids.statements, 'Obraz 1');
  const lassoSnip = await noteImageStats(page, ids.statements, 'Obraz 2');
  const strokes = await noteImageStats(page, ids.statements, 'Obraz 3');
  assert.deepEqual([rectSnip.type, rectSnip.drawing, rectSnip.corner], ['image/png', false, 255], 'wycinek prostokątem – obraz, nie rysunek');
  assert.ok(rectSnip.tinted >= 4 && rectSnip.dark > 0, `wycinek z kratką (${rectSnip.tinted}) i kreską (${rectSnip.dark})`);
  assert.ok(Math.abs(rectSnip.width / rectSnip.height - ratio) < 0.05, 'wymiary obrazu jak obszaru');
  assert.ok(rectSnip.width >= copied.width * 0.95, 'obraz w notatce nie mniejszy niż w schowku');
  assert.equal(lassoSnip.corner, 0, 'poza lassem – przezroczyście');
  assert.ok(lassoSnip.dark > 0);
  assert.equal(strokes.corner, 255, 'zaznaczenie – białe tło');
  assert.equal(strokes.tinted, 0, 'zaznaczenie – bez kratki');
  assert.ok(strokes.dark > 0 && strokes.width > strokes.height * 4, `cała kreska (${strokes.width}×${strokes.height})`);
}, { device: IPAD });

test('rysunek 1.17: kształt – wymiary w polach przy ramce (szerokość, wysokość, kąt pochylenia; dotknięcie rombu – pole pochylenia; odcinek – długość i kąt; Esc i zero), wypełnienie (menu i panel), tekst na kształcie przesuwa się i obraca z nim; zapis (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Wymiary</p>');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const panel = editor.locator('[data-testid=drawing-shape-panel]');
  const dim = (key) => editor.locator(`[data-testid=drawing-dim-${key}]`);
  const box = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const enter = async (key, value) => {
    await dim(key).fill(value);
    await dim(key).press('Enter');
  };

  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-rect]').click();
  await drawStroke(page, segment([0.3, 0.3], [0.45, 0.5], 10));
  await expectText(selectionCount, 'Prostokąt');
  for (const [key, visible] of [['width', true], ['height', true], ['skew', true], ['length', false], ['angle', false]]) {
    assert.equal(await dim(key).isVisible(), visible, `pole ${key}`);
  }
  assert.equal(await dim('skew').inputValue(), '0');
  // Pola przy liniach ramki: szerokość pod dolną, wysokość przy prawej, kąt pochylenia przy lewej.
  const [width, height, skew] = await Promise.all(['width', 'height', 'skew'].map((key) => dim(key).boundingBox()));
  const middle = width.x + width.width / 2;
  assert.ok(Math.abs(middle - (box.x + box.width * 0.375)) < 30, 'szerokość pod środkiem dolnej linii');
  assert.ok(width.y > box.y + box.height * 0.5, 'szerokość pod kształtem');
  assert.ok(height.x > box.x + box.width * 0.45 && skew.x + skew.width < box.x + box.width * 0.3, 'wysokość z prawej, pochylenie z lewej');

  await enter('width', '5');
  await enter('height', '3');
  await enter('skew', '15');
  await waitUntil(async () => (await dim('width').inputValue()) === '5' && (await dim('skew').inputValue()) === '15', 'Szerokość 5 cm, pochylenie 15°');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wymiary-ipad.png') });
  // Esc w polu – wartość wraca, edytor otwarty; zero – komunikat i bez zmiany.
  await dim('width').fill('9');
  await dim('width').press('Escape');
  await waitUntil(async () => (await dim('width').inputValue()) === '5', 'Esc – wartość wraca');
  assert.equal(await editor.isVisible(), true, 'Esc w polu nie zamyka edytora');
  await enter('height', '0');
  await expectText(editor.locator('[data-testid=drawing-notice]'), 'Wpisz wymiar większy od zera');
  await waitUntil(async () => (await dim('height').inputValue()) === '3', 'Wysokość bez zmian');
  // Dotknięcie rombu pochylenia (bez przeciągania) – kursor w polu kąta pochylenia; 20°.
  const scale = await page.locator('.drawing__canvas:not(.drawing__canvas--live)').evaluate((canvas) => {
    const row = canvas.getContext('2d').getImageData(0, Math.round(canvas.height * 0.95), canvas.width, 1).data;
    const opaque = [];
    for (let x = 0; x < canvas.width; x += 1) if (row[x * 4 + 3] === 255) opaque.push(x);
    return ((opaque.at(-1) - opaque[0] + 1) / 1600) * (canvas.getBoundingClientRect().width / canvas.width);
  });
  const skewHandle = [0.375 + ((0.3 * 220 + 0.5 * 0.268 * 132) * scale) / box.width, 0.4 - (66 * scale) / box.height];
  await drawStroke(page, [[...skewHandle, 0.5]]);
  await waitUntil(() => page.evaluate(() => document.activeElement?.dataset.testid === 'drawing-dim-skew'), 'Kursor w polu pochylenia');
  await enter('skew', '20');
  await waitUntil(async () => (await dim('skew').inputValue()) === '20', 'Pochylenie 20°');

  // Wypełnienie z polecenia zaznaczenia: pełne, potem jasne (środek – szary, nie biały).
  const center = [0.375, 0.4];
  await editor.locator('[data-testid=drawing-selection-fill]').click();
  const menu = page.locator('dialog.menu[open]');
  assert.equal(await menu.locator('[data-testid=drawing-fill-none]').getAttribute('aria-checked'), 'true');
  await menu.locator('[data-testid=drawing-fill-solid]').click();
  await waitUntil(() => darkAt(page, ...center), 'Pełne wypełnienie');
  await editor.locator('[data-testid=drawing-selection-fill]').click();
  await page.locator('dialog.menu[open] [data-testid=drawing-fill-light]').click();
  await waitUntil(async () => { const [red] = await pixelAt(page, ...center); return red > 150 && red < 235; }, 'Jasne wypełnienie');

  // Tekst na kształcie: czerwony, na środku; przesunięcie kształtu przenosi tekst.
  await editor.locator('[data-testid=drawing-selection-text]').click();
  await expectText(page.locator('dialog.sheet[open] .sheet__title').last(), 'Tekst na kształcie');
  await page.locator('[data-testid=drawing-shape-text-input]').fill('Bramka');
  await page.locator('[data-testid=drawing-element-color-red]').click();
  await sheetSubmit(page).click();
  const text = await waitUntil(() => colorBox(page, 'red'), 'Czerwony tekst na kształcie');
  assert.ok(Math.abs((text.x0 + text.x1) / 2 - center[0]) < 0.02 && Math.abs((text.y0 + text.y1) / 2 - center[1]) < 0.03, `tekst na środku kształtu (${JSON.stringify(text)})`);
  await drawStroke(page, segment(center, [0.575, 0.6], 10));
  const moved = await waitUntil(async () => {
    const found = await colorBox(page, 'red');
    return found && Math.abs((found.x0 + found.x1) / 2 - 0.575) < 0.02 && Math.abs((found.y0 + found.y1) / 2 - 0.6) < 0.03 ? found : null;
  }, 'Tekst przesunięty razem z kształtem');
  // Dotknięcie zaznaczonego kształtu – poprawka tekstu.
  await drawStroke(page, [[0.575, 0.6, 0.5]]);
  await expectText(page.locator('dialog.sheet[open] .sheet__title').last(), 'Tekst na kształcie');
  assert.equal(await page.locator('[data-testid=drawing-shape-text-input]').inputValue(), 'Bramka');
  await page.locator('[data-testid=drawing-shape-text-input]').fill('Bramka A');
  await sheetSubmit(page).click();
  await waitUntil(async () => { const found = await colorBox(page, 'red'); return found && found.x1 - found.x0 > (moved.x1 - moved.x0) * 1.1; }, 'Dłuższy tekst');
  // Obrót o 90° kółkiem nad kształtem – tekst obraca się razem z nim (wyższy niż szerszy).
  const rotateY = 0.6 - (66 * scale + 30) / box.height;
  await drawStroke(page, segment([0.575, rotateY], [0.575 + 0.15, 0.6], 10));
  await waitUntil(async () => {
    const found = await colorBox(page, 'red');
    return found && (found.y1 - found.y0) * box.height > (found.x1 - found.x0) * box.width * 2;
  }, 'Tekst obrócony z kształtem');
  // Po obrocie pole pochylenia jest nad kształtem – polecenia zaznaczenia go nie zasłaniają.
  const bar = await editor.locator('.drawing__selection').boundingBox();
  for (const key of ['width', 'height', 'skew']) {
    const field = await editor.locator('.drawing__dim', { has: page.locator(`[data-testid=drawing-dim-${key}]`) }).boundingBox();
    const overlap = field.x < bar.x + bar.width && bar.x < field.x + field.width && field.y < bar.y + bar.height && bar.y < field.y + field.height;
    assert.equal(overlap, false, `polecenia nie zasłaniają pola ${key}`);
  }
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-ksztalt-tekst-ipad.png') });

  // Odcinek: długość i kąt.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-line]').click();
  await drawStroke(page, segment([0.12, 0.85], [0.3, 0.85], 10));
  await expectText(selectionCount, 'Odcinek');
  for (const [key, visible] of [['width', false], ['skew', false], ['length', true], ['angle', true]]) {
    assert.equal(await dim(key).isVisible(), visible, `odcinek: pole ${key}`);
  }
  assert.equal(await dim('angle').inputValue(), '0');
  await enter('angle', '30');
  await enter('length', '4');
  await waitUntil(async () => (await dim('length').inputValue()) === '4' && (await dim('angle').inputValue()) === '30', 'Odcinek 4 cm pod kątem 30°');

  // Wypełnienie nowych kształtów w panelu – pełne; dotknięcie zdejmuje zaznaczenie, następne – kształt.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-fill-default-solid]').click();
  assert.equal(await panel.locator('[data-testid=drawing-fill-default-solid]').getAttribute('aria-checked'), 'true');
  await panel.locator('[data-testid=drawing-shape-ellipse]').click();
  await drawStroke(page, [[0.85, 0.3, 0.5]]);
  await drawStroke(page, [[0.85, 0.3, 0.5]]);
  await expectText(selectionCount, 'Elipsa');
  await waitUntil(() => darkAt(page, 0.85, 0.3), 'Elipsa wypełniona');

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const shapes = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing.strokes, ids.statements);
  assert.deepEqual(shapes.map((shape) => shape.shape), ['rect', 'line', 'ellipse']);
  const [rect, line, ellipse] = shapes;
  assert.deepEqual([rect.w, rect.h, rect.skew, rect.fill, rect.label.text, rect.label.color], [220, 132, 0.364, 'light', 'Bramka A', '#d70015']);
  assert.ok(Math.abs(Math.abs(rect.angle) - Math.PI / 2) < 0.01, `obrót o 90° (${rect.angle})`);
  assert.ok(rect.label.width > 0 && rect.label.height > 0, 'tekst zmierzony');
  assert.equal(line.w, 176);
  assert.ok(Math.abs(line.angle + Math.PI / 6) < 1e-6, `kąt odcinka 30° (${line.angle})`);
  assert.equal('fill' in line, false);
  assert.equal(ellipse.fill, 'solid');
}, { device: IPAD });

test('rysunek 1.17 na telefonie: tryb „Wycinek” palcem i „Osadź”; pola wymiarów kształtu i polecenia zaznaczenia mieszczą się na ekranie', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Telefon</p>');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  await drawStroke(page, segment([0.3, 0.5], [0.7, 0.5], 12), { type: 'touch', id: 5 });
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await editor.locator('[data-testid=drawing-select-mode-snip]').click();
  // Na telefonie „Fragm.” – cztery tryby i pasek w trzech wierszach.
  await expectText(editor.locator('[data-testid=drawing-select-mode-region]'), 'Fragm.');
  const toolbar = await editor.locator('.drawing__toolbar').boundingBox();
  assert.ok(toolbar.height < 150, `pasek zaznaczania w trzech wierszach (${toolbar.height} px)`);
  await drawStroke(page, segment([0.35, 0.4], [0.65, 0.6], 8), { type: 'touch', id: 6 });
  await expectText(selectionCount, 'Wycinek');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wycinek-telefon.png') });
  await editor.locator('[data-testid=drawing-selection-embed]').click();
  await expectText(editor.locator('[data-testid=drawing-notice]'), '„Obraz 1”');

  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await editor.locator('[data-testid=drawing-shape-rect]').click();
  // Strona na telefonie zajmuje środek płótna (pod paskiem) – prostokąt na niej.
  await drawStroke(page, segment([0.3, 0.58], [0.55, 0.68], 8), { type: 'touch', id: 7 });
  await expectText(selectionCount, 'Prostokąt');
  const toolbarBottom = toolbar.y + toolbar.height;
  for (const key of ['width', 'height', 'skew']) {
    const field = await editor.locator('.drawing__dim', { has: page.locator(`[data-testid=drawing-dim-${key}]`) }).boundingBox();
    assert.ok(field.x >= 0 && field.x + field.width <= 390, `pole ${key} w szerokości ekranu (${field.x}, ${field.width})`);
    assert.ok(field.height >= 26, 'pole dość duże do dotknięcia');
  }
  const bar = await editor.locator('.drawing__selection').boundingBox();
  assert.ok(bar.x >= 0 && bar.x + bar.width <= 390, `polecenia zaznaczenia w szerokości ekranu (${bar.x}, ${bar.width})`);
  assert.ok(bar.y >= toolbarBottom, 'polecenia zaznaczenia pod paskiem narzędzi');
  assert.equal(await editor.locator('[data-testid=drawing-selection-fill]').isVisible(), true);
  assert.equal(await editor.locator('[data-testid=drawing-selection-text]').isVisible(), true);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wymiary-telefon.png') });
  assert.equal(await overflowX(page), 0, 'bez przewijania w bok');

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  assert.deepEqual(await dialog.locator('[data-testid=note-image-label-text]').allTextContents(), ['Rysunek 1', 'Obraz 1']);
});

test('rysunek 1.12.1 na telefonie (bez rysika): palec przesuwa linijkę i rysuje prosto przy jej krawędzi, zaznacza i przesuwa kreskę; pasek narzędzi mieści się', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Telefon</p>');
  const box = await editor.locator('[data-testid=drawing-canvas]').boundingBox();
  const at = (x, y) => [(x - box.x) / box.width, (y - box.y) / box.height];
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const name of ['eraser', 'select', 'shape', 'pen']) {
    await editor.locator(`[data-testid=drawing-tool-${name}]`).click();
    if (name === 'eraser') await editor.locator('[data-testid=drawing-eraser-pixel]').click();
    assert.equal(await overflowX(page), 0, `pasek narzędzi (${name}) bez przewijania w bok`);
    const toolbar = await editor.locator('.drawing__toolbar').boundingBox();
    assert.ok(toolbar.x >= 0 && toolbar.x + toolbar.width <= 390, `pasek w szerokości ekranu (${name})`);
    // Od 1.13 (pole tekstowe i wzór na pasku) – najwyżej trzy wiersze; od 1.14 także przy zaznaczaniu
    // (kształt, tryb, „Wszystko”) i przy piórze z „+” własnego koloru.
    if (name !== 'eraser') assert.ok(toolbar.height < 150, `${name}: pasek najwyżej w trzech wierszach (${toolbar.height} px)`);
    // Pasek o inną liczbę wierszy nie zmienia płótna – strona nie skacze przy zmianie narzędzia.
    assert.deepEqual(await editor.locator('[data-testid=drawing-canvas]').boundingBox(), box, `płótno bez zmian (${name})`);
  }

  // Od 1.14: panel własnego koloru w szerokości ekranu.
  await editor.locator('[data-testid=drawing-color-custom]').click();
  const colorPanel = await editor.locator('[data-testid=drawing-color-panel]').boundingBox();
  assert.ok(colorPanel.x >= 0 && colorPanel.x + colorPanel.width <= 390, `panel koloru w szerokości ekranu (${colorPanel.x}, ${colorPanel.width})`);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-kolor-telefon.png') });
  await page.keyboard.press('Escape');
  await waitUntil(() => editor.locator('[data-testid=drawing-color-panel]').isHidden(), 'Esc zamyka panel koloru');

  // Linijka: palec na linijce przesuwa ją o 60 px w górę; kreska palcem tuż pod nią – wzdłuż dolnej krawędzi.
  await editor.locator('[data-testid=drawing-ruler]').click();
  await drawStroke(page, segment(at(center.x - 60, center.y), at(center.x - 60, center.y - 60), 6), { type: 'touch', id: 5 });
  await expectText(editor.locator('[data-testid=drawing-ruler-angle]'), 'Linijka 0°');
  const wobble = Array.from({ length: 11 }, (_, index) => [...at(center.x - 100 + index * 20, center.y - 60 + 32 + 10 + (index % 2) * 6), 0.5]);
  await drawStroke(page, wobble, { type: 'touch', id: 6 });
  await waitUntil(() => darkAt(page, ...at(center.x, center.y - 28)), 'Kreska palcem wzdłuż krawędzi linijki');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-linijka-telefon.png') });
  await editor.locator('[data-testid=drawing-ruler]').click();

  // Zaznaczanie palcem: prostokąt wokół kreski, przesunięcie w dół o 40 px.
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await drawStroke(page, segment(at(center.x - 130, center.y - 50), at(center.x + 130, center.y - 10), 6), { type: 'touch', id: 7 });
  await expectText(editor.locator('[data-testid=drawing-selection-count]'), '1 kreska');
  await drawStroke(page, segment(at(center.x, center.y - 28), at(center.x, center.y + 12), 8), { type: 'touch', id: 8 });
  await waitUntil(async () => (await darkAt(page, ...at(center.x, center.y + 12))) && !(await darkAt(page, ...at(center.x, center.y - 28))), 'Kreska przesunięta palcem');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-zaznaczenie-telefon.png') });
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const [stroke] = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing.strokes, ids.statements);
  assert.equal(new Set(stroke.points.filter((_, index) => index % 3 === 1)).size, 1, 'kreska przy linijce – prosta (jedno y)');
});

// ---------------------------------------------------------------- rysunki (1.19)

/**
 * Strona rysunku na płótnie przy widoku „cała strona”: lewy górny róg i skala (px CSS na jednostkę
 * strony) – z nieprzezroczystych pikseli warstwy zapisanych kresek; at() – punkt strony jako ułamki płótna.
 */
async function pageFrame(page) {
  const frame = await page.locator('.drawing__canvas:not(.drawing__canvas--live)').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    const ratio = canvas.getBoundingClientRect().width / canvas.width;
    const span = (data, count) => {
      let [first, last] = [-1, -1];
      for (let index = 0; index < count; index += 1) {
        if (data[index * 4 + 3] !== 255) continue;
        if (first < 0) first = index;
        last = index;
      }
      return [first, last];
    };
    const [x0, x1] = span(ctx.getImageData(0, Math.round(canvas.height * 0.6), canvas.width, 1).data, canvas.width);
    const [y0] = span(ctx.getImageData(Math.round(canvas.width * 0.5), 0, 1, canvas.height).data, canvas.height);
    const box = canvas.getBoundingClientRect();
    return { left: x0 * ratio, top: y0 * ratio, scale: ((x1 - x0 + 1) / 1600) * ratio, width: box.width, height: box.height, x: box.x, y: box.y };
  });
  return {
    ...frame,
    at: (x, y) => [(frame.left + x * frame.scale) / frame.width, (frame.top + y * frame.scale) / frame.height],
    screen: (x, y) => [frame.x + frame.left + x * frame.scale, frame.y + frame.top + y * frame.scale]
  };
}

/** Okno albo menu bez animacji otwierania (zrzut ekranu). */
const settled = (locator) => waitUntil(() => locator.evaluate((element) => element.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running')), 'Okno otwarte');

/** Kreski, kształty i szyki pierwszego (albo `index`) rysunku notatki – z bazy. */
const savedStrokes = (page, lessonID, index = 0) => page.evaluate(async ([id, at]) => (await window.lexicards.library.noteImages(id))[at].drawing.strokes, [lessonID, index]);

test('rysunek 1.19: Shift – kwadrat i odcinek co 15°; przytrzymany Ctrl – chwilowo zaznaczanie (Auto), puszczony – pióro; Ctrl+Z bez zmiany narzędzia; Ctrl + kółko powiększa, środkowy przycisk przesuwa stronę (komputer)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Mysz</p>');
  const frame = await pageFrame(page);
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const panel = editor.locator('[data-testid=drawing-shape-panel]');
  const dim = (key) => editor.locator(`[data-testid=drawing-dim-${key}]`);
  const pressed = (name) => editor.locator(`[data-testid=drawing-tool-${name}]`).getAttribute('aria-pressed');
  const drag = async (from, to, options = {}) => {
    await page.mouse.move(...frame.screen(...from));
    await page.mouse.down(options);
    await page.mouse.move(...frame.screen(...to), { steps: 6 });
    await page.mouse.up(options);
  };

  // Shift: prostokąt 200 × 80 przeciągnięciem – z Shift kwadrat (szerokość = wysokość).
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-rect]').click();
  await page.keyboard.down('Shift');
  await drag([200, 200], [400, 280]);
  await page.keyboard.up('Shift');
  await expectText(selectionCount, 'Prostokąt');
  // Ok. 200 jednostek (4,5 cm; mysz – całe piksele), wysokość taka sama – kwadrat.
  const side = await dim('width').inputValue();
  assert.ok(side.startsWith('4,5'), `szerokość ok. 4,5 cm (${side})`);
  assert.equal(await dim('height').inputValue(), side, 'wysokość = szerokość');
  // Odcinek pod kątem ok. 20° – z Shift 15°.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-line]').click();
  await page.keyboard.down('Shift');
  await drag([200, 600], [388, 532]);
  await page.keyboard.up('Shift');
  await expectText(selectionCount, 'Odcinek');
  assert.equal(await dim('angle').inputValue(), '15');

  // Ctrl: przytrzymany przy piórze – zaznaczanie w trybie Auto; prostokąt od lewej – cała kreska.
  await editor.locator('[data-testid=drawing-tool-pen]').click();
  await drag([700, 300], [800, 300]);
  await page.keyboard.down('Control');
  await waitUntil(async () => (await pressed('select')) === 'true', 'Ctrl – zaznaczanie');
  await expectText(editor.locator('[data-testid=drawing-select-hint]'), 'puść Ctrl');
  assert.equal(await editor.locator('[data-testid=drawing-select-mode-auto]').getAttribute('aria-checked'), 'true');
  await drag([680, 270], [830, 330]);
  await expectText(selectionCount, '1 kreska');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-ctrl-zaznaczanie.png') });
  await page.keyboard.up('Control');
  await waitUntil(async () => (await pressed('pen')) === 'true', 'Po puszczeniu Ctrl – pióro');
  await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Zaznaczenie zdjęte');
  // Ctrl+Z – cofnięcie kreski, narzędzie bez zmiany.
  await page.keyboard.press('Control+z');
  await waitUntil(async () => (await darkest(page, ...frame.at(750, 300), 10)) > 150, 'Kreska cofnięta');
  await page.waitForTimeout(350);
  assert.equal(await pressed('pen'), 'true', 'Ctrl+Z nie zmienia narzędzia');

  // Ctrl + kółko powiększa wokół kursora; środkowy przycisk przesuwa stronę (bez kreski).
  await drag([650, 700], [850, 700]);
  const [sx, sy] = frame.screen(750, 700);
  await page.mouse.move(sx, sy);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -400);
  await page.keyboard.up('Control');
  await waitUntil(async () => (await editor.locator('[data-testid=drawing-zoom]').textContent()) !== '100%', 'Powiększenie');
  await nextFrames(page);
  assert.equal(await pressed('pen'), 'true', 'Ctrl + kółko nie zmienia narzędzia');
  const fraction = (x, y) => [(x - frame.x) / frame.width, (y - frame.y) / frame.height];
  await waitUntil(async () => (await darkest(page, ...fraction(sx, sy), 6)) < 110, 'Kreska pod kursorem po powiększeniu');
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(sx, sy + 120, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await waitUntil(async () => (await darkest(page, ...fraction(sx, sy + 120), 6)) < 110, 'Strona przesunięta w dół');
  assert.ok((await darkest(page, ...fraction(sx, sy), 6)) > 150, 'w starym miejscu kreski już nie ma (i nic się nie narysowało)');
  assert.equal(await pressed('pen'), 'true');
}, { device: DESKTOP });

test('rysunek 1.19: zakończenia odcinka (panel i „Końce”), wymiar widoczny na stałe (oko), szyk liniowy (przesunięcie całości, parametry) i kołowy (środek, „Rozdziel”); zapis (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Szyk</p>');
  const frame = await pageFrame(page);
  const { at } = frame;
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const panel = editor.locator('[data-testid=drawing-shape-panel]');
  const sheet = page.locator('dialog.sheet[open]').last();
  const dark = async (x, y, side = 8) => (await darkest(page, ...at(x, y), side)) < 110;

  // Odcinek: w panelu (zostaje otwarty po wyborze odcinka) – koło na początku, trójkąt na końcu.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-line]').click();
  await panel.locator('[data-testid=drawing-caps-default-start-circle]').click();
  await panel.locator('[data-testid=drawing-caps-default-end-triangle]').click();
  assert.equal(await panel.locator('[data-testid=drawing-caps-default-end-triangle]').getAttribute('aria-checked'), 'true');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-konce-panel-ipad.png') });
  await drawStroke(page, segment(at(200, 900), at(600, 900), 10));
  await expectText(selectionCount, 'Odcinek');
  // „Końce” zaznaczonego odcinka: koniec – romb.
  await editor.locator('[data-testid=drawing-selection-caps]').click();
  await expectText(sheet.locator('.sheet__title'), 'Zakończenia odcinka');
  assert.equal(await sheet.locator('[data-testid=drawing-caps-start-circle]').getAttribute('aria-checked'), 'true');
  await sheet.locator('[data-testid=drawing-caps-end-diamond]').click();
  await sheetSubmit(page).click();
  await waitUntil(async () => (await page.locator('dialog.sheet').count()) === 1, 'Okno zakończeń zamknięte');

  // Prostokąt 5 × 3 cm; oko przy szerokości – po odznaczeniu napis „5 cm” pod dolną linią.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-rect]').click();
  await drawStroke(page, segment(at(300, 200), at(520, 332), 10));
  await expectText(selectionCount, 'Prostokąt');
  const eye = editor.locator('[data-testid=drawing-dim-eye-width]');
  assert.equal(await eye.getAttribute('aria-pressed'), 'false');
  // Napis wymiaru: ok. 22 jednostki pod dolną linią (332) – pole 16 px nie sięga linii.
  assert.ok(!(await dark(410, 353, 16)), 'bez oka – pod prostokątem nic');
  await eye.click();
  await waitUntil(async () => (await eye.getAttribute('aria-pressed')) === 'true', 'Oko włączone');
  assert.ok(!(await dark(410, 353, 16)), 'zaznaczony – zamiast napisu pole wymiaru');
  await drawStroke(page, [[...at(1000, 1000), 0.5]]);
  await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Odznaczony');
  await waitUntil(() => dark(410, 353, 16), 'Napis „5 cm” pod prostokątem');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-konce-wymiar-ipad.png') });

  // Szyk liniowy z prostokąta: 3 w rzędzie co 6 cm, 2 rzędy co 4 cm.
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await drawStroke(page, [[...at(300, 266), 0.5]]);
  await expectText(selectionCount, 'Prostokąt');
  await editor.locator('[data-testid=drawing-selection-array]').click();
  await expectText(sheet.locator('.sheet__title'), 'Powiel w szyku');
  for (const [name, value] of [['columns', '3'], ['dx', '6'], ['rows', '2'], ['dy', '4']]) await sheet.locator(`[data-testid=drawing-array-${name}]`).fill(value);
  await settled(sheet);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-szyk-okno-ipad.png') });
  await sheetSubmit(page).click();
  await expectText(selectionCount, 'Szyk liniowy · 6');
  await waitUntil(() => dark(828, 266), 'Trzecia kopia w rzędzie');
  assert.ok(await dark(564, 442), 'drugi rząd');
  // Przesunięcie całego szyku o kratkę w prawo.
  await drawStroke(page, segment(at(500, 266), at(544, 266), 6));
  await waitUntil(() => dark(872, 266), 'Szyk przesunięty');
  assert.ok(!(await dark(300, 266)), 'w starym miejscu lewej krawędzi pierwszej kopii pusto');
  // Dotknięcie szyku – parametry: 2 w rzędzie.
  await drawStroke(page, [[...at(344, 266), 0.5]]);
  await expectText(sheet.locator('.sheet__title'), 'Szyk liniowy');
  assert.equal(await sheet.locator('[data-testid=drawing-array-columns]').inputValue(), '3');
  await sheet.locator('[data-testid=drawing-array-columns]').fill('2');
  await sheetSubmit(page).click();
  await expectText(selectionCount, 'Szyk liniowy · 4');
  await waitUntil(async () => !(await dark(872, 266)), 'Trzecia kopia znikła');

  // Szyk kołowy z koła: 6 wokół środka pod nim; przeciągnięcie środka, „Rozdziel”.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-ellipse]').click();
  await drawStroke(page, segment(at(1070, 220), at(1130, 280), 8));
  await expectText(selectionCount, 'Elipsa');
  // Zaznaczanie – koło zostaje zaznaczone.
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await expectText(selectionCount, 'Elipsa');
  await editor.locator('[data-testid=drawing-selection-array]').click();
  await sheet.getByRole('radio', { name: 'Kołowy', exact: true }).check();
  await sheet.locator('[data-testid=drawing-array-count]').fill('6');
  await sheetSubmit(page).click();
  await expectText(selectionCount, 'Szyk kołowy · 6');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-szyk-ipad.png') });
  // Środek domyślnie pod kołem: promień 1,2 × 64 + 44 ≈ 121 jednostek.
  const centerY = 250 + Math.round(64.6 * 1.2 + 44);
  await waitUntil(() => dark(1100, centerY * 2 - 250, 30), 'Kopia pod środkiem (naprzeciw źródła)');
  await drawStroke(page, segment(at(1100, centerY), at(1144, centerY), 6));
  // Kopia naprzeciw źródła (1100, 250) względem środka (1144, centerY).
  await waitUntil(() => dark(1188, centerY * 2 - 250, 30), 'Środek przesunięty – kopie wokół niego');
  await editor.locator('[data-testid=drawing-selection-explode]').click();
  await expectText(selectionCount, '6 elementów');

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-book]').waitFor();
  const strokes = await savedStrokes(page, ids.statements);
  assert.deepEqual(strokes.map((stroke) => stroke.tool === 'array' ? `array:${stroke.kind}` : stroke.shape),
    ['line', 'array:linear', 'ellipse', 'ellipse', 'ellipse', 'ellipse', 'ellipse', 'ellipse']);
  const [line, linear, ...ellipses] = strokes;
  assert.deepEqual([line.startCap, line.endCap], ['circle', 'diamond']);
  assert.deepEqual([linear.columns, linear.rows, Math.round(linear.dx), Math.round(linear.dy)], [2, 2, 264, 176]);
  assert.deepEqual(linear.items.map((item) => [item.shape, item.dims]), [['rect', ['width']]]);
  assert.ok(Math.abs(linear.items[0].x - 454) < 1, `szyk przesunięty o kratkę (${linear.items[0].x})`);
  // Koło ok. 60 × 60 (pozycje na płótnie – całe piksele); wszystkie kopie takie same.
  assert.ok(ellipses.every((ellipse) => Math.abs(ellipse.w - 60) < 3 && ellipse.w === ellipse.h && ellipse.w === ellipses[0].w),
    `rozdzielone kopie koła (${ellipses.map((ellipse) => `${ellipse.w}×${ellipse.h}`)})`);
  const xs = ellipses.map((ellipse) => Math.round(ellipse.x));
  assert.ok(Math.min(...xs) < 1100 && Math.max(...xs) > 1144, `kopie wokół przesuniętego środka (${xs})`);
}, { device: IPAD });

test('rysunek 1.19: kilka kartek – nowa kartka, PageUp i PageDown, usunięcie pustej; po „Gotowe” każda kartka to osobny rysunek; szablon – wielkość wpisana w procentach i narożnikiem (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Kartki</p>');
  const frame = await pageFrame(page);
  const { at } = frame;
  const pages = editor.locator('[data-testid=drawing-pages]');
  const paperPanel = editor.locator('[data-testid=drawing-paper-panel]');
  await expectText(pages, 'Kartka 1 z 1');
  await drawStroke(page, segment(at(300, 400), at(600, 400), 10));
  await pages.click();
  await page.locator('[data-testid=drawing-page-new]').click();
  await expectText(pages, 'Kartka 2 z 2');
  await expectText(editor.locator('[data-testid=drawing-title]'), 'Rysunek 1 · kartka 2');
  await waitUntil(async () => (await darkest(page, ...at(450, 400), 12)) > 150, 'Nowa kartka pusta');
  await drawStroke(page, segment(at(900, 700), at(1300, 700), 10));

  // Szablon na kartce 2: 80% wpisane, potem narożnik do środka – 70%.
  await editor.locator('[data-testid=drawing-paper]').click();
  await paperPanel.locator('[data-testid=drawing-template-pitch]').click();
  const size = paperPanel.locator('[data-testid=drawing-template-size]');
  await expectValue(size, '100');
  await size.fill('80');
  await size.press('Enter');
  await expectValue(size, '80');
  // Boisko 80%: 1209,6 × 783,36 na środku; prawy dolny narożnik (1404,8; 941,68) – do 87,5% przekątnej.
  await drawStroke(page, segment(at(1404.8, 941.68), at(1253.6, 843.76), 8));
  await expectValue(size, '70');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-szablon-naroznik-ipad.png') });
  await paperPanel.locator('[data-testid=drawing-template-done]').click();
  // Esc zamyka panel tła; PageUp – kartka 1 z kreską; PageDown – z powrotem.
  await page.keyboard.press('Escape');
  await paperPanel.waitFor({ state: 'hidden' });
  // Od 1.21 (pasek szerszy o tabelę i karteczkę) przycisk tła na iPadzie ma krótki napis – pasek w jednym wierszu także z szablonem.
  assert.ok((await editor.locator('.drawing__toolbar').boundingBox()).height < 70, 'pasek w jednym wierszu');
  await page.keyboard.press('PageUp');
  await expectText(pages, 'Kartka 1 z 2');
  await waitUntil(async () => (await darkest(page, ...at(450, 400), 12)) < 110, 'Kreska kartki 1');
  const back = await pageFrame(page);
  assert.ok(Math.abs(back.top - frame.top) < 2 && Math.abs(back.scale - frame.scale) < 0.005, `kartka 1 w tym samym miejscu (${back.top} / ${frame.top})`);
  await page.keyboard.press('PageDown');
  await expectText(pages, 'Kartka 2 z 2');
  // Trzecia, pusta kartka – usunięta bez pytania.
  await pages.click();
  await page.locator('[data-testid=drawing-page-new]').click();
  await expectText(pages, 'Kartka 3 z 3');
  await pages.click();
  assert.equal(await page.locator('[data-testid=drawing-page-3]').getAttribute('aria-checked'), 'true');
  await settled(page.locator('dialog.menu[open]'));
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-kartki-menu-ipad.png') });
  await page.locator('[data-testid=drawing-page-delete]').click();
  await expectText(pages, 'Kartka 2 z 2');

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await waitUntil(async () => (await tileLabels(dialog)).join() === 'Rysunek 1,Rysunek 2', 'Dwie kartki – dwa rysunki');
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-book]').waitFor();
  const drawings = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id)).map((image) => ({
    label: image.label, strokes: image.drawing.strokes.length, template: image.drawing.template ? Math.round(image.drawing.template.w) : null
  })), ids.statements);
  assert.deepEqual(drawings, [{ label: 'Rysunek 1', strokes: 1, template: null }, { label: 'Rysunek 2', strokes: 1, template: 1058 }]);
}, { device: IPAD });

test('rysunek 1.19 na telefonie: polecenia zaznaczonego odcinka (Końce, Szyk) i kartki mieszczą się na ekranie; okno szyku bez przewijania w bok', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Telefon</p>');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await editor.locator('[data-testid=drawing-shape-line]').click();
  await drawStroke(page, segment([0.25, 0.55], [0.75, 0.55], 10), { type: 'touch', id: 7 });
  await expectText(selectionCount, 'Odcinek');
  const bar = await editor.locator('.drawing__selection').boundingBox();
  assert.ok(bar.x >= 0 && bar.x + bar.width <= 390, `polecenia w szerokości ekranu (${Math.round(bar.x)}–${Math.round(bar.x + bar.width)})`);
  for (const name of ['caps', 'array', 'embed']) assert.equal(await editor.locator(`[data-testid=drawing-selection-${name}]`).isVisible(), true, name);
  const pill = await editor.locator('[data-testid=drawing-pages]').boundingBox();
  assert.ok(pill.x >= 0 && pill.x + pill.width <= 390, 'kartki w szerokości ekranu');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-odcinek-telefon.png') });
  await editor.locator('[data-testid=drawing-selection-array]').click();
  await expectText(page.locator('dialog.sheet[open] .sheet__title').last(), 'Powiel w szyku');
  assert.equal(await overflowX(page), 0, 'okno szyku bez przewijania w bok');
  await settled(page.locator('dialog.sheet[open]').last());
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-szyk-telefon.png') });
}, { device: PHONE });

// ---------------------------------------------------------------- notatki 1.20

/** Treść pola edytora bez wartowników podmiany treści (js/ui/note-editing.js). */
const editorHtml = (editor) => editor.evaluate((area) => area.innerHTML.replace(/<p data-s="">(?:<br>)?<\/p>/g, ''));

/** Zaznacza w polu edytora pierwsze wystąpienie tekstu; caret 'start' / 'end' – sam kursor przed nim / za nim. */
async function selectInEditor(editor, text, { caret = null } = {}) {
  await editor.evaluate((area, [needle, where]) => {
    const walker = document.createTreeWalker(area, window.NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const index = walker.currentNode.data.indexOf(needle);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(walker.currentNode, where === 'end' ? index + needle.length : index);
      range.setEnd(walker.currentNode, where === 'start' ? index : index + needle.length);
      area.focus();
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      return;
    }
    throw new Error(`Brak tekstu „${needle}” w edytorze`);
  }, [text, caret]);
  await editor.page().waitForTimeout(60);
}

test('notatka 1.20: „Usuń formatowanie” – wszystko oprócz linków (zaznaczenie, akapit z kursorem), Ctrl+Z i ponowienie; Ctrl+Z po „Wstaw do tekstu” i „Nowa strona” – kursor wraca na miejsce', async ({ open }) => {
  const page = await open();
  const { ids } = await openNoteWithImages(page, {
    html: '<h3>Nagłówek</h3><p><strong>Gruby</strong> <span data-size="l">duży</span> <span data-color="red">czerwony</span> <a href="https://example.com">link</a> x<sup>2</sup></p>'
      + '<ul><li>Punkt <em>jeden</em></li><li>Punkt dwa</li></ul><p data-indent="2" data-align="center" data-line="2">Wcięty</p><p>Ostatni akapit</p>',
    labels: ['Schemat']
  });
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-right]').click();
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.waitFor();
  const button = (command) => dialog.locator(`[data-testid=note-format-${command}]`);
  const original = await editorHtml(editor);
  assert.ok(original.includes('<blockquote><blockquote><p data-align="center" data-line="2">Wcięty</p></blockquote></blockquote>'), original);

  // Zaznaczenie od „Gruby” do „jeden”: tekst bez wyróżnień, wielkości i koloru – link zostaje; punkt listy staje się akapitem.
  await editor.evaluate((area) => {
    const range = document.createRange();
    range.setStart(area.querySelector('strong').firstChild, 0);
    range.setEnd(area.querySelector('em').firstChild, 5);
    area.focus();
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await page.waitForTimeout(60);
  await button('removeFormat').click();
  const link = '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>';
  assert.equal(await editorHtml(editor), `<h3>Nagłówek</h3><p>Gruby duży czerwony ${link} x2</p><p>Punkt jeden</p><ul><li>Punkt dwa</li></ul>`
    + '<blockquote><blockquote><p data-align="center" data-line="2">Wcięty</p></blockquote></blockquote><p>Ostatni akapit</p>');
  const selected = await page.evaluate(() => window.getSelection().toString());
  assert.ok(selected.startsWith('Gruby') && selected.endsWith('Punkt jeden'), `zaznaczenie zostaje: „${selected}”`);

  // Ctrl+Z – formatowanie wraca jednym krokiem, zaznaczenie jak przed zmianą; ponowienie – znowu bez formatowania.
  await page.keyboard.press('Control+z');
  await waitUntil(async () => (await editorHtml(editor)) === original, 'Ctrl+Z przywraca formatowanie');
  assert.ok((await page.evaluate(() => window.getSelection().toString())).startsWith('Gruby'), 'zaznaczenie po cofnięciu');
  await page.keyboard.press('Control+Shift+z');
  await waitUntil(async () => (await editorHtml(editor)).startsWith('<h3>Nagłówek</h3><p>Gruby duży czerwony'), 'ponowienie');
  await page.keyboard.press('Control+z');
  await waitUntil(async () => (await editorHtml(editor)) === original, 'znowu cofnięte');

  // Sam kursor: cały akapit – bez wcięcia, wyrównania i interlinii; reszta notatki bez zmian, kursor na miejscu.
  await selectInEditor(editor, 'Wcięty', { caret: 'end' });
  await button('removeFormat').click();
  assert.equal(await editorHtml(editor), original.replace('<blockquote><blockquote><p data-align="center" data-line="2">Wcięty</p></blockquote></blockquote>', '<p>Wcięty</p>'));
  await page.keyboard.type('!');
  assert.ok((await editorHtml(editor)).includes('<p>Wcięty!</p>'), 'kursor na końcu akapitu');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await waitUntil(async () => (await editorHtml(editor)) === original, 'cofnięte pisanie i usunięcie formatowania');

  // „Wstaw do tekstu”: odwołanie w osobnej linijce, pisanie pod nim; Ctrl+Z – odwołanie znika, kursor na końcu akapitu.
  await selectInEditor(editor, 'Ostatni akapit', { caret: 'end' });
  await dialog.locator('.note-images__open').first().click();
  await menuItem(page, 'Wstaw do tekstu');
  assert.ok((await editorHtml(editor)).endsWith('<p>Ostatni akapit</p><p>[[Schemat]]</p><p><br></p>'), await editorHtml(editor));
  await page.keyboard.type('Dalej');
  assert.ok((await editorHtml(editor)).endsWith('<p>[[Schemat]]</p><p>Dalej</p>'), 'pisanie pod odwołaniem');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await waitUntil(async () => (await editorHtml(editor)) === original, 'Ctrl+Z usuwa odwołanie (wcześniej cofał inną zmianę)');
  await page.keyboard.type('.');
  assert.ok((await editorHtml(editor)).endsWith('<p>Ostatni akapit.</p>'), 'kursor wrócił na koniec akapitu');

  // „Nowa strona” w środku akapitu: akapit dzieli się, kursor na początku drugiej części; Ctrl+Z – akapit znowu cały.
  await selectInEditor(editor, 'akapit.', { caret: 'start' });
  await button('pageBreak').click();
  assert.match(await editorHtml(editor), /<p>Ostatni(?: |&nbsp;)<\/p><hr data-page=""><p>akapit\.<\/p>$/);
  await page.keyboard.type('X');
  assert.ok((await editorHtml(editor)).endsWith('<hr data-page=""><p>Xakapit.</p>'), 'kursor na początku nowej strony');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await waitUntil(async () => (await editorHtml(editor)).endsWith('<p>Ostatni akapit.</p>') && !(await editorHtml(editor)).includes('<hr'), 'Ctrl+Z usuwa nową stronę');

  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').first().waitFor();
  assert.equal((await storedNote(page, ids.statements)).html,
    '<h3>Nagłówek</h3><p><strong>Gruby</strong> <span data-size="l">duży</span> <span data-color="red">czerwony</span> '
    + '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a> x<sup>2</sup></p><ul><li>Punkt <em>jeden</em></li><li>Punkt dwa</li></ul>'
    + '<p data-indent="2" data-align="center" data-line="2">Wcięty</p><p>Ostatni akapit.</p>');
}, { device: DESKTOP });

test('notatka 1.20: wyrównanie i interlinia (zaznaczone akapity, bez zaznaczenia – cały tekst), link (Ctrl+K: wstawienie, zmiana, usunięcie), symbole z ostatnio użytymi, data i godzina; zapis i podgląd', async ({ open }) => {
  const page = await open();
  await page.clock.setFixedTime(new Date('2026-10-20T14:35:00'));
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń: Financial Statements' }).click();
  await menuItem(page, 'Dodaj notatkę');
  const dialog = noteDialog(page);
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.waitFor();
  const button = (command) => dialog.locator(`[data-testid=note-format-${command}]`);
  assert.deepEqual(await dialog.locator('.note-toolbar__group').evaluateAll((groups) => groups.map((group) => group.getAttribute('aria-label'))), ['Tekst', 'Akapit', 'Wstaw']);
  await editor.click();
  await page.keyboard.type('Pierwszy akapit');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Drugi akapit');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Trzeci akapit');
  // Bez ukrytego wartownika podmiany treści (zostaje po cofnięciu).
  const blocks = () => editor.locator('p:not([data-s])').evaluateAll((items) => items.map((item) => `${item.dataset.align ?? ''}/${item.dataset.line ?? ''}`));

  // Bez zaznaczenia – cały tekst do środka.
  await button('paragraph').click();
  const panel = dialog.locator('[data-testid=note-paragraph]');
  await panel.waitFor();
  assert.equal(await panel.locator('[data-testid=note-align-left]').getAttribute('aria-pressed'), 'true');
  assert.equal(await panel.locator('[data-testid="note-line-1.15"]').getAttribute('aria-pressed'), 'true');
  await panel.locator('[data-testid=note-align-center]').click();
  assert.deepEqual(await blocks(), ['center/', 'center/', 'center/']);
  assert.equal(await panel.locator('[data-testid=note-align-center]').getAttribute('aria-pressed'), 'true');

  // Zaznaczony drugi akapit: do prawej, interlinia 2,0 – Ctrl+Z cofa samą interlinię; potem 1,5.
  await selectInEditor(editor, 'Drugi akapit');
  await panel.locator('[data-testid=note-align-right]').click();
  await panel.locator('[data-testid=note-line-2]').click();
  assert.deepEqual(await blocks(), ['center/', 'right/2', 'center/']);
  await page.keyboard.press('Control+z');
  await waitUntil(async () => JSON.stringify(await blocks()) === JSON.stringify(['center/', 'right/', 'center/']), 'Ctrl+Z cofa interlinię');
  await panel.locator('[data-testid="note-line-1.5"]').click();
  assert.deepEqual(await blocks(), ['center/', 'right/1.5', 'center/']);
  assert.equal(await panel.locator('[data-testid="note-line-1.5"]').getAttribute('aria-pressed'), 'true');
  // Enter na końcu – nowy akapit ma to samo wyrównanie i interlinię.
  await selectInEditor(editor, 'Drugi akapit', { caret: 'end' });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Nowy');
  assert.deepEqual(await blocks(), ['center/', 'right/1.5', 'right/1.5', 'center/']);
  const ratio = await editor.locator('p', { hasText: 'Nowy' }).evaluate((item) => parseFloat(getComputedStyle(item).lineHeight) / parseFloat(getComputedStyle(item).fontSize));
  assert.ok(Math.abs(ratio - 2) < 0.05, `interlinia 1,5 w edytorze (${ratio})`);
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-120-wyrownanie.png') });
  await button('paragraph').click();
  assert.equal(await panel.isHidden(), true);

  // Link na zaznaczonym tekście (Ctrl+K): niepoprawny adres – komunikat; „www.” dostaje https://.
  await selectInEditor(editor, 'Pierwszy');
  await page.keyboard.press('Control+k');
  await expectText(sheet(page).locator('.sheet__title'), 'Wstaw link');
  assert.equal(await sheet(page).locator('[data-testid=note-link-text]').count(), 0, 'zaznaczony tekst – bez pola tekstu linku');
  await sheet(page).locator('[data-testid=note-link-url]').fill('javascript:alert(1)');
  await sheetSubmit(page).click();
  await expectText(sheet(page).locator('.form-message--error'), 'Wpisz adres strony');
  await sheet(page).locator('[data-testid=note-link-url]').fill('www.przyklad.pl');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-120-link.png') });
  await sheetSubmit(page).click();
  await waitUntil(async () => (await page.locator('dialog.sheet[open]').count()) === 1, 'okno linku zamknięte');
  assert.equal(await editor.locator('a').getAttribute('href'), 'https://www.przyklad.pl');
  assert.equal(await editor.locator('a').textContent(), 'Pierwszy');
  // Kursor w linku: „Edytuj link” z adresem; e-mail dostaje mailto:.
  await selectInEditor(editor, 'Pierw', { caret: 'end' });
  await button('link').click();
  await expectText(sheet(page).locator('.sheet__title'), 'Edytuj link');
  assert.equal(await sheet(page).locator('[data-testid=note-link-url]').inputValue(), 'https://www.przyklad.pl');
  await sheet(page).locator('[data-testid=note-link-url]').fill('jan@example.com');
  await sheetSubmit(page).click();
  await waitUntil(async () => (await editor.locator('a').getAttribute('href')) === 'mailto:jan@example.com', 'zmieniony adres');
  assert.equal(await editor.locator('a').textContent(), 'Pierwszy');
  // Usunięcie linku – tekst zostaje.
  await selectInEditor(editor, 'Pierw', { caret: 'end' });
  await page.keyboard.press('Control+k');
  await sheet(page).locator('[data-testid=note-link-remove]').click();
  await waitUntil(async () => (await editor.locator('a').count()) === 0, 'link usunięty');
  await expectText(editor.locator('p').first(), 'Pierwszy akapit');
  // Bez zaznaczenia: adres i tekst linku; pisanie dalej jest już poza linkiem.
  await selectInEditor(editor, 'Trzeci akapit', { caret: 'end' });
  await page.keyboard.type(' ');
  await button('link').click();
  // Okno ustawia kursor w polu adresu w następnej klatce – dopiero potem wpisywanie (inaczej pod
  // obciążeniem tekst linku trafia do adresu).
  await waitUntil(() => page.evaluate(() => document.activeElement?.dataset.testid === 'note-link-url'), 'kursor w polu adresu');
  await sheet(page).locator('[data-testid=note-link-url]').fill('example.com/strona');
  await sheet(page).locator('[data-testid=note-link-text]').fill('Przykład');
  await sheetSubmit(page).click();
  await waitUntil(async () => (await editor.locator('a').count()) === 1, 'wstawiony link');
  await page.keyboard.type(' koniec');
  assert.equal(await editor.locator('a').textContent(), 'Przykład');
  assert.equal(await editor.locator('a').getAttribute('href'), 'https://example.com/strona');

  // Symbole: średnica i stopień w miejscu kursora; ostatnio użyte – najnowszy pierwszy.
  await button('symbol').click();
  const symbols = dialog.locator('[data-testid=note-symbols]');
  await symbols.waitFor();
  assert.equal(await symbols.locator('[data-testid=note-symbols-recent]').count(), 0);
  await symbols.getByRole('button', { name: 'średnica' }).click();
  await symbols.getByRole('button', { name: 'stopień', exact: true }).click();
  assert.deepEqual(await symbols.locator('[data-testid=note-symbols-recent] button').allTextContents(), ['°', '⌀']);
  await expectText(editor, 'koniec⌀°');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-120-symbole.png') });
  await button('symbol').click();
  await page.keyboard.type(' ');

  // Data i godzina: dzisiaj, teraz, sama godzina, wpisana ręcznie (sama data).
  for (const [item, typed] of [['today', ' '], ['now', ' '], ['time', ' ']]) {
    await button('date').click();
    await page.locator(`[data-testid=note-date-${item}]`).click();
    await page.keyboard.type(typed);
  }
  await button('date').click();
  await expectText(page.locator('[data-testid=note-date-today]'), 'Dzisiaj – 20.10.2026');
  await expectText(page.locator('[data-testid=note-date-now]'), 'Teraz – 20.10.2026, 14:35');
  await page.locator('[data-testid=note-date-other]').click();
  await expectText(sheet(page).locator('.sheet__title'), 'Data i godzina');
  // Od 1.21.1 kalendarz zamiast pola daty: „Data” (bez godziny), następny miesiąc, 5 listopada.
  await sheet(page).locator('.segmented__option', { hasText: /^Data$/ }).click();
  await sheet(page).locator('[data-testid=date-calendar-next]').click();
  await sheet(page).locator('[data-testid="date-calendar-day-2026-11-05"]').click();
  await sheetSubmit(page).click();
  await expectText(editor, 'koniec⌀° 20.10.2026 20.10.2026, 14:35 14:35 05.11.2026');

  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').first().waitFor();
  assert.equal((await storedNote(page, ids.statements)).html, '<p data-align="center">Pierwszy akapit</p><p data-align="right" data-line="1.5">Drugi akapit</p>'
    + '<p data-align="right" data-line="1.5">Nowy</p><p data-align="center">Trzeci akapit <a href="https://example.com/strona" target="_blank" rel="noopener noreferrer">Przykład</a>'
    + ' koniec⌀° 20.10.2026 20.10.2026, 14:35 14:35 05.11.2026</p>');
  const look = await dialog.locator('[data-testid=note-text]').first().evaluate((text) => [...text.querySelectorAll('p')].map((item) => ({
    align: getComputedStyle(item).textAlign,
    line: Math.round((parseFloat(getComputedStyle(item).lineHeight) / parseFloat(getComputedStyle(item).fontSize)) * 100) / 100
  })));
  assert.deepEqual(look.map((item) => item.align), ['center', 'right', 'right', 'center']);
  assert.deepEqual(look.map((item) => item.line), [1.55, 2, 2, 1.55]);
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-120-podglad.png') });
}, { device: DESKTOP });

test('notatka 1.20: PDF – okno drukowania z całą notatką na stronach A4 (ścieżka, obraz z podpisem, nowa strona, wzór, wyjustowanie); Kopiuj – obraz zmniejszony do szerokości strony A4', async ({ open, context }) => {
  const page = await open();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate(async (id) => {
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2f8f6f';
    ctx.fillRect(0, 0, 2000, 1000);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 220px sans-serif';
    ctx.fillText('Schemat', 520, 580);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    await window.lexicards.library.saveNote(id, {
      html: '<h3>Bilans</h3><p data-align="justify">Bilans pokazuje majątek firmy i źródła jego finansowania na określony dzień. Aktywa to zasoby, '
        + 'którymi firma dysponuje, a pasywa – źródła, z których te zasoby sfinansowano. Obie strony bilansu są zawsze równe.</p>'
        + '<p>[[Schemat]]</p><hr data-page=""><p data-line="1.5">Druga strona: $a^2 + b^2 = c^2$, <span data-color="red">czerwony</span> tekst.</p>',
      images: [{ bytes: await blob.arrayBuffer(), type: 'image/png', width: 2000, height: 1000, label: 'Schemat', caption: 'Bilans w skrócie' }],
      numberFigures: true
    });
  }, ids.statements);
  await openNotePreview(page, ids.statements);
  const dialog = noteDialog(page);
  const [lessonPath] = await page.evaluate((id) => [window.lexicards.library.lessonPath(id)], ids.statements);
  const parts = lessonPath.split(' › ');
  const appTitle = await page.title();

  // Zamiast okna drukowania – zapis tego, co jest gotowe do druku.
  await page.evaluate(() => {
    window.printed = [];
    window.print = () => window.printed.push({ title: document.title, images: [...document.querySelectorAll('.note-print img')].map((image) => image.complete && image.naturalWidth) });
  });
  await dialog.locator('[data-testid=note-pdf]').click();
  await waitUntil(() => page.evaluate(() => window.printed.length === 1), 'okno drukowania');
  assert.deepEqual(await page.evaluate(() => window.printed[0]), { title: parts[parts.length - 1], images: [2000] }, 'nazwa pliku PDF – nazwa lekcji; obraz wczytany');
  const printed = page.locator('[data-testid=note-print]');
  assert.equal(await printed.evaluate((element) => getComputedStyle(element).display), 'none', 'na ekranie wydruku nie widać');
  await expectText(printed.locator('.note-print__path'), parts.slice(0, -1).join(' › '));
  await expectText(printed.locator('.note-print__title'), parts[parts.length - 1]);
  await expectText(printed.locator('figcaption'), 'Rys. 1. Bilans w skrócie');
  assert.equal(await printed.locator('.note-flow__break').count(), 1);
  assert.equal(await printed.locator('math').count(), 1, 'wzór');
  assert.equal(await printed.locator('p[data-align=justify]').count(), 1);

  // Wydruk: tylko notatka (bez aplikacji i okna), jasne kolory; PDF z Chromium – dwie strony A4.
  await page.emulateMedia({ media: 'print' });
  assert.equal(await printed.evaluate((element) => getComputedStyle(element).display), 'block');
  assert.equal(await page.locator('#app').evaluate((element) => getComputedStyle(element).display), 'none');
  assert.equal(await dialog.evaluate((element) => getComputedStyle(element).display), 'none');
  assert.equal(await printed.locator('[data-color=red]').evaluate((element) => getComputedStyle(element).color), 'rgb(215, 0, 21)');
  const figure = await printed.locator('.note-flow__figure img').evaluate((image) => ({ width: image.getBoundingClientRect().width, page: image.closest('.note-print').getBoundingClientRect().width }));
  assert.ok(Math.abs(figure.width - figure.page) < 2, `obraz na szerokość strony (${figure.width} z ${figure.page})`);
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true });
  await writeFile(path.join(OUTPUT, 'notatka-120.pdf'), pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  assert.equal(pages, 2, 'dwie strony A4 (nowa strona w notatce)');
  await page.emulateMedia({ media: 'screen' });
  // Po zamknięciu okna drukowania – wydruk znika, tytuł strony wraca.
  await page.evaluate(() => window.dispatchEvent(new window.Event('afterprint')));
  assert.equal(await printed.count(), 0);
  assert.equal(await page.title(), appTitle);

  // Kopiuj: obraz 2000×1000 – w schowku 605×303 (szerokość tekstu strony A4), wyjustowanie i interlinia w stylu.
  await dialog.locator('[data-testid=note-copy]').click();
  await page.locator('.toast', { hasText: 'Skopiowano notatkę' }).waitFor();
  const copied = await page.evaluate(async () => (await (await (await navigator.clipboard.read())[0].getType('text/html')).text()));
  assert.match(copied, /<img [^>]*width="605" height="303" style="width:605px;height:auto;max-width:100%"/);
  assert.ok(copied.includes('style="text-align:justify"'), 'wyjustowanie w schowku');
  assert.ok(copied.includes('style="line-height:150%"'), 'interlinia w schowku');
}, { device: DESKTOP });

test('notatka 1.20 na telefonie: pasek w grupach przewijany w bok, panele wyrównania i symboli mieszczą się; w podglądzie Kopiuj, PDF i strony w jednym wierszu; symbole w polu tekstowym rysunku', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate((id) => window.lexicards.library.saveNote(id, { html: `<p>${'Bilans pokazuje majątek firmy. '.repeat(120)}</p>` }), ids.statements);
  await openNotePreview(page, ids.statements);
  const dialog = noteDialog(page);
  // Stopka: trzy elementy obok siebie, w oknie.
  const footer = await dialog.locator('.note-sheet__footer').evaluate((element) => {
    const panel = element.closest('.sheet__panel').getBoundingClientRect();
    return [...element.children].filter((child) => !child.hidden).map((child) => {
      const box = child.getBoundingClientRect();
      return { middle: Math.round(box.top + box.height / 2), left: box.left - panel.left, right: panel.right - box.right, text: child.innerText.trim() };
    });
  });
  assert.equal(footer.length, 3, JSON.stringify(footer));
  assert.equal(new Set(footer.map((item) => item.middle)).size, 1, `jeden wiersz: ${JSON.stringify(footer)}`);
  assert.ok(footer.every((item) => item.left >= 0 && item.right >= 0), `w oknie: ${JSON.stringify(footer)}`);
  assert.deepEqual(footer.slice(0, 2).map((item) => item.text), ['Kopiuj', 'PDF']);
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-120-telefon-podglad.png') });

  await dialog.locator('[data-testid=note-right]').click();
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.waitFor();
  const toolbar = dialog.locator('.note-toolbar');
  const scroll = await toolbar.evaluate((element) => ({ scroll: element.scrollWidth, width: element.clientWidth, wraps: getComputedStyle(element).flexWrap }));
  assert.equal(scroll.wraps, 'nowrap');
  assert.ok(scroll.scroll > scroll.width, 'pasek przewija się w bok');
  await selectInEditor(editor, 'Bilans', { caret: 'end' });
  await dialog.locator('[data-testid=note-format-paragraph]').click();
  const paragraph = dialog.locator('[data-testid=note-paragraph]');
  await paragraph.waitFor();
  const fits = (locator) => locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth + 1 && box.right <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth;
  });
  assert.equal(await fits(paragraph), true, 'panel wyrównania mieści się');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-120-telefon-akapit.png') });
  await dialog.locator('[data-testid=note-format-symbol]').evaluate((element) => element.scrollIntoView({ inline: 'center' }));
  await dialog.locator('[data-testid=note-format-symbol]').click();
  const symbols = dialog.locator('[data-testid=note-symbols]');
  await symbols.waitFor();
  assert.equal(await paragraph.isHidden(), true, 'jeden panel naraz');
  assert.equal(await fits(symbols), true, 'panel symboli mieści się');
  await symbols.getByRole('button', { name: 'promil' }).click();
  await expectText(editor, 'Bilans‰');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-120-telefon-symbole.png') });

  // Rysunek: symbole pod polem tekstowym – znak w miejscu kursora.
  await dialog.locator('[data-testid=note-image-draw]').click();
  const drawing = drawingDialog(page);
  await drawing.waitFor();
  await waitUntil(() => drawing.locator('[data-testid=drawing-canvas]').evaluate((canvas) => canvas.width > 0), 'Płótno gotowe');
  await drawing.locator('[data-testid=drawing-insert-text]').click();
  const input = page.locator('[data-testid=drawing-text-input]');
  await input.fill('Kąt 30 i 45');
  await input.evaluate((element) => element.setSelectionRange(6, 6));
  await page.locator('[data-testid=drawing-symbols-toggle]').click();
  await expectText(page.locator('[data-testid=drawing-symbols-recent]'), '‰');
  await page.locator('[data-testid=drawing-symbols]').getByRole('button', { name: 'stopień', exact: true }).click();
  assert.equal(await input.inputValue(), 'Kąt 30° i 45');
  assert.equal(await fits(page.locator('[data-testid=drawing-symbols]')), true, 'symbole w oknie pola tekstowego mieszczą się');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-120-telefon-symbole.png') });
}, { device: PHONE });

test('Nauka 1.20: nad fiszką cała ścieżka Dziedzina › Moduł › Lekcja; w Ustawieniach można ukryć „Powtórka na dziś” i „Ostatnia sesja” (na Starcie zostają)', async ({ open, context }) => {
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);
  const lesson = page.locator('[data-testid=study-lesson]');
  await expectText(lesson, 'Biznes › Finanse › Podstawy');
  assert.equal(await lesson.getAttribute('title'), 'Biznes › Finanse › Podstawy');
  await expectText(lesson.locator('.study__lesson-name'), 'Podstawy');
  // Długa ścieżka na telefonie: skraca się dziedzina i moduł, nazwa lekcji zostaje cała.
  await page.evaluate(async ([domainID, moduleID]) => {
    await window.lexicards.library.updateDomain(domainID, { name: 'Rachunkowość zarządcza i finansowa' });
    await window.lexicards.library.updateModule(moduleID, { name: 'Sprawozdania finansowe – bilans' });
  }, [ids.domainID, ids.financeID]);
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(lesson, 'Rachunkowość zarządcza i finansowa › Sprawozdania finansowe – bilans › Podstawy');
  const fit = await lesson.evaluate((element) => {
    const name = element.querySelector('.study__lesson-name');
    const trail = element.querySelector('.study__path');
    return { name: name.scrollWidth <= name.clientWidth, trail: trail.scrollWidth > trail.clientWidth, inside: element.getBoundingClientRect().right <= window.innerWidth };
  });
  assert.deepEqual(fit, { name: true, trail: true, inside: true });
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  await page.screenshot({ path: path.join(OUTPUT, 'nauka-120-sciezka.png') });
  for (let index = 0; index < 3; index += 1) await assess(page, 'all', 'know');
  await page.click('[data-testid=summary-done]');
  await page.waitForFunction(() => location.hash === '#/start');
  await page.clock.fastForward('11:00');
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await tab(page, 'Nauka');
  await page.locator('[data-testid=study-review]').waitFor();
  await page.locator('[data-testid=study-repeat-last]').waitFor();

  // Ustawienia: obie grupy wyłączone – na ekranie Nauka ich nie ma, na Starcie zostają.
  await page.evaluate(() => { location.hash = '#/settings'; });
  await expectText(page.locator('.group__title', { hasText: 'Ekran Nauka' }), 'Ekran Nauka');
  assert.equal(await page.locator('[data-testid=study-show-review]').isChecked(), true);
  await page.locator('[data-testid=study-show-review]').click();
  await page.locator('[data-testid=study-show-last]').click();
  await waitUntil(() => page.evaluate(() => {
    const settings = window.lexicards.library.getSettings();
    return settings.studyShowReview === false && settings.studyShowLast === false;
  }), 'zapisane ustawienia');
  await page.evaluate(() => document.querySelector('[data-testid=study-show-review]').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(OUTPUT, 'ustawienia-120-nauka.png') });
  await tab(page, 'Nauka');
  await page.locator('[data-testid=study-start]').waitFor();
  assert.equal(await page.locator('[data-testid=study-review]').count(), 0);
  assert.equal(await page.locator('[data-testid=study-repeat-last]').count(), 0);
  await tab(page, 'Start');
  await page.locator('[data-testid=start-review]').waitFor();
  await page.locator('[data-testid=start-repeat-last]').waitFor();
  // Ponowne włączenie – grupy wracają.
  await page.evaluate(() => window.lexicards.library.updateSettings({ studyShowReview: true, studyShowLast: true }));
  await tab(page, 'Nauka');
  await page.locator('[data-testid=study-review]').waitFor();
  await page.locator('[data-testid=study-repeat-last]').waitFor();
});

// ---------------------------------------------------------------- 1.21: tabele, karteczki, zakreślacz

/** Okno tabeli i wklejenie fragmentu arkusza (tekst z tabulatorami) do komórki. */
const tableEditor = (page) => page.locator('dialog[data-testid=table-editor]');
async function pasteIntoCell(page, cell, text) {
  await tableEditor(page).locator(`[data-testid=table-cell-${cell}]`).focus();
  await page.evaluate((value) => {
    const data = new window.DataTransfer();
    data.setData('text/plain', value);
    document.activeElement.dispatchEvent(new window.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}
const COSTS_TSV = 'Pozycja\tKwota\tUwagi\nCzynsz\t1 200 zł\tdo 10.\nMedia\t300 zł\tprąd i gaz\nInternet\t60 zł\t';

test('notatka 1.21: tabela – okno tabeli (wklejenie z Excela, wiersz i kolumna przy kursorze, wyrównanie), sygnatura i [[Tabela 1]], podpis „Tab. 1.” nad tabelą; podgląd, Kopiuj, PDF, poprawka', async ({ open, context }) => {
  const page = await open();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń: Financial Statements' }).click();
  await menuItem(page, 'Dodaj notatkę');
  const dialog = noteDialog(page);
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.waitFor();
  await editor.click();
  await page.keyboard.type('Koszty miesięczne:');

  // Nowa tabela: pusta – komunikat; wklejony fragment arkusza wypełnia komórki od kursora, tabela rośnie.
  await dialog.locator('[data-testid=note-table-add]').click();
  await tableEditor(page).waitFor();
  await expectText(tableEditor(page).locator('.sheet__title'), 'Nowa tabela');
  await sheetSubmit(page).click();
  await expectText(tableEditor(page).locator('.form-message--error'), 'Tabela jest pusta');
  await pasteIntoCell(page, '0-0', COSTS_TSV);
  await expectText(tableEditor(page).locator('.table-editor__status'), 'Wklejono 4 × 3');
  // Wiersz pod „Media”, kolumna za „Kwota”, potem jej usunięcie; druga kolumna do prawej.
  await tableEditor(page).locator('[data-testid=table-cell-2-0]').focus();
  await tableEditor(page).locator('[data-testid=table-add-row]').click();
  await tableEditor(page).locator('[data-testid=table-cell-3-0]').fill('Telefon');
  await tableEditor(page).locator('[data-testid=table-cell-3-1]').fill('45 zł');
  await tableEditor(page).locator('[data-testid=table-add-column]').click();
  assert.equal(await tableEditor(page).locator('[data-testid=table-cell-0-3]').count(), 1, 'czwarta kolumna');
  await tableEditor(page).locator('[data-testid=table-remove-column]').click();
  assert.equal(await tableEditor(page).locator('[data-testid=table-cell-0-3]').count(), 0);
  await tableEditor(page).locator('[data-testid=table-align-1]').click();
  await tableEditor(page).locator('[data-testid=table-align-1]').click();
  assert.equal(await tableEditor(page).locator('[data-testid=table-cell-1-1]').evaluate((cell) => getComputedStyle(cell).textAlign), 'right');
  await settled(tableEditor(page));
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-121-okno-tabeli.png') });
  await sheetSubmit(page).click();
  await tableEditor(page).waitFor({ state: 'detached' });
  assert.deepEqual(await dialog.locator('[data-testid=note-table-label-text]').allTextContents(), ['Tabela 1']);
  await expectText(dialog.locator('[data-testid=note-table-tile]'), '5 × 3');

  // Odwołanie w miejscu kursora, podpis, numeracja.
  await editor.click();
  await page.keyboard.press('Control+End');
  await dialog.locator('[data-testid=note-table-tile] .note-images__open').click();
  await menuItem(page, 'Wstaw do tekstu');
  await page.keyboard.type('Razem około 1 600 zł.');
  await dialog.locator('[data-testid=note-table-tile] .note-images__open').click();
  await menuItem(page, 'Dodaj podpis');
  await expectText(sheet(page).locator('.sheet__title'), 'Podpis tabeli');
  await sheet(page).locator('[data-testid=note-image-caption]').fill('Koszty stałe');
  await saveSheet(page);
  await dialog.locator('.switch', { has: page.locator('[data-testid=note-number-figures]') }).click();
  await dialog.locator('[data-testid=note-tables]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-121-tabele-edytor.png') });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-table]').waitFor();
  const saved = await storedNote(page, ids.statements);
  assert.equal(saved.html, '<p>Koszty miesięczne:</p><p>[[Tabela 1]]</p><p>Razem około 1 600 zł.</p>');
  assert.deepEqual(saved.tables, [{
    label: 'Tabela 1', caption: 'Koszty stałe', header: true, headerColumn: false, align: ['left', 'right', 'left'],
    rows: [['Pozycja', 'Kwota', 'Uwagi'], ['Czynsz', '1 200 zł', 'do 10.'], ['Media', '300 zł', 'prąd i gaz'], ['Telefon', '45 zł', ''], ['Internet', '60 zł', '']]
  }]);

  // Podgląd: tabela w miejscu odwołania, podpis nad nią, nagłówek, wyrównanie.
  const table = dialog.locator('[data-testid=note-table]');
  await expectText(table.locator('[data-testid=note-table-caption]'), 'Tab. 1. Koszty stałe');
  const order = await dialog.locator('[data-testid=note-text]').first().evaluate((text) => [...text.children].map((child) => (child.matches('[data-testid=note-table]') ? 'tabela' : child.textContent)));
  assert.deepEqual(order, ['Koszty miesięczne:', 'tabela', 'Razem około 1 600 zł.']);
  assert.deepEqual(await table.locator('thead th').allTextContents(), ['Pozycja', 'Kwota', 'Uwagi']);
  assert.equal(await table.locator('tbody tr').count(), 4);
  assert.equal(await table.locator('tbody tr').first().locator('td').nth(1).evaluate((cell) => getComputedStyle(cell).textAlign), 'right');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-121-tabela-podglad.png') });

  // Kopiuj: tabela ze stylami i podpisem w miejscu odwołania; zwykły tekst – komórki po tabulatorze.
  await dialog.locator('[data-testid=note-copy]').click();
  await page.locator('.toast', { hasText: 'Skopiowano notatkę' }).waitFor();
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { html: await (await item.getType('text/html')).text(), text: await (await item.getType('text/plain')).text() };
  });
  assert.ok(copied.html.indexOf('<strong>Tab. 1. Koszty stałe</strong>') < copied.html.indexOf('<table style="border-collapse:collapse;width:100%">'));
  assert.ok(copied.html.indexOf('<table') > copied.html.indexOf('Koszty miesięczne') && copied.html.indexOf('<table') < copied.html.indexOf('Razem'));
  assert.ok(copied.text.includes('Pozycja\tKwota\tUwagi\nCzynsz\t1 200 zł\tdo 10.'), copied.text);
  assert.ok(!copied.text.includes('[[Tabela 1]]'));

  // PDF: tabela z nagłówkiem (powtarzanym na stronach wydruku) i podpisem.
  await page.evaluate(() => { window.print = () => { window.printedTables = document.querySelectorAll('.note-print [data-testid=note-table] thead').length; }; });
  await dialog.locator('[data-testid=note-pdf]').click();
  await waitUntil(() => page.evaluate(() => window.printedTables === 1), 'tabela w wydruku');
  await expectText(page.locator('.note-print [data-testid=note-table-caption]'), 'Tab. 1. Koszty stałe');
  await page.evaluate(() => window.dispatchEvent(new window.Event('afterprint')));

  // Poprawka tabeli i zmiana sygnatury – odwołanie zmienia się samo.
  await dialog.locator('[data-testid=note-right]').click();
  await editor.waitFor();
  await dialog.locator('[data-testid=note-table-tile] .note-images__open').click();
  await menuItem(page, 'Edytuj tabelę');
  await tableEditor(page).locator('[data-testid=table-cell-4-1]').fill('70 zł');
  await sheetSubmit(page).click();
  await tableEditor(page).waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-table-tile] .note-images__open').click();
  await menuItem(page, 'Zmień sygnaturę');
  await expectText(sheet(page).locator('.sheet__title'), 'Sygnatura tabeli');
  await sheet(page).locator('[data-testid=note-image-label]').fill('Koszty');
  await saveSheet(page);
  await expectText(editor, '[[Koszty]]');
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-table]').waitFor();
  const again = await storedNote(page, ids.statements);
  assert.equal(again.tables[0].label, 'Koszty');
  assert.equal(again.tables[0].rows[4][1], '70 zł');
  assert.equal(again.html, '<p>Koszty miesięczne:</p><p>[[Koszty]]</p><p>Razem około 1 600 zł.</p>');
}, { device: DESKTOP });

test('notatka 1.21 na telefonie: długa tabela dzieli się między strony po wierszach – nagłówek na każdej stronie, podpis tylko na pierwszej; okno tabeli przewija się w bok', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate((id) => window.lexicards.library.saveNote(id, {
    html: '<p>Wstęp do zestawienia.</p><p>[[Tabela 1]]</p><p>Koniec.</p>',
    numberFigures: true,
    tables: [{ label: 'Tabela 1', caption: 'Pozycje', rows: [['Nr', 'Nazwa', 'Opis'], ...Array.from({ length: 30 }, (_, index) => [String(index + 1), `Pozycja ${index + 1}`, 'Opis pozycji, który zawija się w komórce na telefonie.'])] }]
  }), ids.statements);
  await openNotePreview(page, ids.statements);
  const dialog = noteDialog(page);
  const book = dialog.locator('[data-testid=note-book]');
  const pages = Number(await book.getAttribute('data-pages'));
  assert.ok(pages >= 3, `kilka stron (${pages})`);
  const seen = [];
  for (let number = 1; number <= pages; number += 1) {
    if (number > 1) {
      await dialog.locator('[data-testid=note-page-next]').click();
      await waitUntil(async () => (await book.getAttribute('data-page')) === String(number), `strona ${number}`);
    }
    const info = await dialog.locator('[data-testid=note-page]').last().evaluate((element) => ({
      rows: [...element.querySelectorAll('tbody tr')].map((row) => row.cells[0].textContent),
      heads: element.querySelectorAll('thead').length,
      captions: element.querySelectorAll('[data-testid=note-table-caption]').length
    }));
    seen.push(info);
    if (number === 2) await page.screenshot({ path: path.join(OUTPUT, 'notatka-121-tabela-strona-2-telefon.png') });
  }
  const tablePages = seen.filter((info) => info.rows.length > 0);
  assert.ok(tablePages.length >= 2, 'tabela na kilku stronach');
  assert.ok(tablePages.every((info) => info.heads === 1), 'nagłówek na każdej stronie z tabelą');
  assert.deepEqual(tablePages.map((info) => info.captions), [1, ...tablePages.slice(1).map(() => 0)], 'podpis tylko nad pierwszą częścią');
  assert.deepEqual(tablePages.flatMap((info) => info.rows), Array.from({ length: 30 }, (_, index) => String(index + 1)), 'każdy wiersz raz, po kolei');

  // Okno tabeli na telefonie: siatka przewija się w bok, strona – nie.
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-table-tile] .note-images__open').click();
  await menuItem(page, 'Edytuj tabelę');
  await tableEditor(page).waitFor();
  await settled(tableEditor(page));
  const scroll = await tableEditor(page).locator('.table-editor__scroll').evaluate((element) => ({ scroll: element.scrollWidth, width: element.clientWidth }));
  assert.ok(scroll.scroll > scroll.width, 'siatka szersza niż ekran – przewijana');
  assert.equal(await overflowX(page), 0, 'okno bez przewijania strony w bok');
  await page.screenshot({ path: path.join(OUTPUT, 'notatka-121-okno-tabeli-telefon.png') });
});

test('rysunek 1.21: okno grubości zakreślacza; tabela (okno tabeli, wielkość tekstu, szerokość narożnikiem); karteczki – kolor, strzałka (koniec przeciągnięty), zwinięta z numerem, ukryta na obrazie; zapis (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Tabela i karteczki</p>');
  const frame = await pageFrame(page);
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');

  // Zakreślacz: drugie dotknięcie – okno jak pióra; gruba kropka – 52.
  await editor.locator('[data-testid=drawing-tool-highlighter]').click();
  await editor.locator('[data-testid=drawing-tool-highlighter]').click();
  const settings = editor.locator('[data-testid=drawing-settings]');
  await expectText(settings, 'Zakreślacz');
  await settings.locator('[data-testid=drawing-highlighter-level-2]').click();
  await settings.locator('[data-testid=drawing-highlighter-width]').fill('52');
  assert.equal(await editor.locator('[data-testid=drawing-width-2]').getAttribute('aria-pressed'), 'true', 'kropka na pasku');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-121-zakreslacz.png') });
  await page.mouse.move(...frame.screen(200, 1000));
  await page.mouse.down();
  await page.mouse.move(...frame.screen(700, 1000), { steps: 8 });
  await page.mouse.up();

  // Tabela: okno tabeli jak w notatce, wielkość „Duża”.
  await editor.locator('[data-testid=drawing-insert-table]').click();
  await expectText(tableEditor(page).locator('.sheet__title'), 'Nowa tabela');
  await pasteIntoCell(page, '0-0', 'Wymiar\tWartość\nA\t50 mm\nB\t⌀12 H7');
  await tableEditor(page).getByRole('radio', { name: 'Duża', exact: true }).check();
  await sheetSubmit(page).click();
  await tableEditor(page).waitFor({ state: 'detached' });
  await expectText(selectionCount, 'Tabela');

  // Karteczka 1: różowa, ze strzałką; karteczka 2: zielona, zwinięta, bez obrazu w notatce.
  await editor.locator('[data-testid=drawing-insert-sticky]').click();
  await expectText(sheet(page).locator('.sheet__title'), 'Nowa karteczka');
  await sheet(page).locator('[data-testid=drawing-sticky-input]').fill('Sprawdzić wymiar B');
  await sheet(page).locator('[data-testid=drawing-sticky-color-pink]').click();
  await sheet(page).locator('.switch', { has: page.locator('[data-testid=drawing-sticky-leader]') }).click();
  await settled(sheet(page));
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-121-okno-karteczki.png') });
  await sheetSubmit(page).click();
  await expectText(selectionCount, 'Karteczka 1');
  await editor.locator('[data-testid=drawing-insert-sticky]').click();
  await sheet(page).locator('[data-testid=drawing-sticky-input]').fill('Tylko dla mnie');
  await sheet(page).locator('[data-testid=drawing-sticky-color-green]').click();
  await sheet(page).locator('.switch', { has: page.locator('[data-testid=drawing-sticky-collapsed]') }).click();
  await sheet(page).locator('.switch', { has: page.locator('[data-testid=drawing-sticky-visible]') }).click();
  await sheetSubmit(page).click();
  await expectText(selectionCount, 'Karteczka 2');
  await expectText(editor.locator('[data-testid=drawing-selection-collapse]'), 'Rozwiń');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-121-karteczki.png') });

  // Zapis: grubość zakreślacza, tabela, karteczki.
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-book]').waitFor();
  let strokes = await savedStrokes(page, ids.statements);
  assert.equal(strokes.find((stroke) => stroke.tool === 'highlighter').points[2], 52);
  const table = strokes.find((stroke) => stroke.tool === 'table');
  assert.deepEqual([table.rows, table.size, table.header], [[['Wymiar', 'Wartość'], ['A', '50 mm'], ['B', '⌀12 H7']], 34, true]);
  // Szerokość nowej tabeli – słowa nagłówka w jednym wierszu (bez łamania w środku słowa).
  const boxes = (code) => page.evaluate(async ([source, element]) => {
    const module = await import(new URL('js/ui/drawing-boxes.js', location.href).href);
    return source === 'layout' ? module.tableLayout(element).lines[0] : module.stickyPopoverBox(element);
  }, code);
  assert.deepEqual(await boxes(['layout', table]), [['Wymiar'], ['Wartość']]);
  const [first, second] = strokes.filter((stroke) => stroke.tool === 'sticky');
  assert.deepEqual([first.text, first.color, Boolean(first.leader), first.collapsed, first.hidden], ['Sprawdzić wymiar B', 'pink', true, undefined, undefined]);
  assert.deepEqual([second.text, second.color, second.collapsed, second.hidden], ['Tylko dla mnie', 'green', true, true]);
  assert.match(first.created, /^\d{4}-\d{2}-\d{2}$/);

  // Obraz rysunku w notatce: karteczka 1 jest, ukrytej karteczki 2 nie ma.
  const pixels = await page.evaluate(async ([id, points]) => {
    const [image] = await window.lexicards.library.noteImages(id);
    const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.type }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]);
  }, [ids.statements, [[first.x + first.width * 0.5, first.y + first.height - 30], [second.x + 30, second.y + 30]]]);
  assert.deepEqual(pixels[0], [255, 194, 212], 'karteczka 1 na obrazie (różowa)');
  assert.notDeepEqual(pixels[1], [196, 240, 176], 'karteczki 2 nie ma na obrazie');

  // Poprawka: szerokość tabeli narożnikiem (+200), koniec strzałki w nowe miejsce.
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('.note-images__open').first().click();
  await menuItem(page, 'Edytuj rysunek');
  const again = drawingDialog(page);
  await again.waitFor();
  await waitUntil(() => again.locator('[data-testid=drawing-canvas]').evaluate((canvas) => canvas.width > 0), 'Płótno gotowe');
  await nextFrames(page);
  const frame2 = await pageFrame(page);
  await again.locator('[data-testid=drawing-tool-select]').click();
  await page.mouse.click(...frame2.screen(table.x + 20, table.y + 20));
  await expectText(again.locator('[data-testid=drawing-selection-count]'), 'Tabela');
  await page.mouse.move(...frame2.screen(table.x + table.width, table.y + table.height));
  await page.mouse.down();
  await page.mouse.move(...frame2.screen(table.x + table.width + 200, table.y + table.height), { steps: 8 });
  await page.mouse.up();
  await page.mouse.click(...frame2.screen(first.x + 20, first.y + 20));
  await expectText(again.locator('[data-testid=drawing-selection-count]'), 'Karteczka 1');
  await page.mouse.move(...frame2.screen(first.leader.x, first.leader.y));
  await page.mouse.down();
  await page.mouse.move(...frame2.screen(first.leader.x - 100, first.leader.y + 50), { steps: 8 });
  await page.mouse.up();
  // Sama karteczka przesunięta – koniec strzałki zostaje.
  await page.mouse.move(...frame2.screen(first.x + 30, first.y + 30));
  await page.mouse.down();
  await page.mouse.move(...frame2.screen(first.x + 30, first.y - 70), { steps: 8 });
  await page.mouse.up();
  // Zwinięta karteczka: obok ikony jej treść – polecenia zaznaczenia jej nie zasłaniają.
  await page.keyboard.press('Escape');
  await again.locator('.drawing__selection').waitFor({ state: 'hidden' });
  await page.mouse.click(...frame2.screen(second.x + 20, second.y + 20));
  await expectText(again.locator('[data-testid=drawing-selection-count]'), 'Karteczka 2');
  const popover = await boxes(['popover', second]);
  const [popLeft, popTop] = frame2.screen(popover.x, popover.y);
  const [popRight, popBottom] = frame2.screen(popover.x + popover.width, popover.y + popover.height);
  const bar = await again.locator('.drawing__selection').boundingBox();
  assert.ok(bar.y + bar.height <= popTop || bar.y >= popBottom || bar.x + bar.width <= popLeft || bar.x >= popRight,
    `polecenia obok treści karteczki (${JSON.stringify(bar)}, ${popTop}–${popBottom})`);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-121-zwinieta-karteczka.png') });
  await again.locator('[data-testid=drawing-done]').click();
  await again.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-book]').waitFor();
  strokes = await savedStrokes(page, ids.statements);
  const wider = strokes.find((stroke) => stroke.tool === 'table');
  assert.ok(Math.abs(wider.width - table.width - 200) < 4, `tabela szersza o 200 (${table.width} → ${wider.width})`);
  const moved = strokes.find((stroke) => stroke.tool === 'sticky' && stroke.text === 'Sprawdzić wymiar B');
  assert.ok(Math.abs(moved.leader.x - (first.leader.x - 100)) < 3 && Math.abs(moved.leader.y - (first.leader.y + 50)) < 3, `koniec strzałki ${JSON.stringify(moved.leader)}`);
  assert.ok(Math.abs(moved.y - (first.y - 100)) < 3, `karteczka wyżej (${first.y} → ${moved.y})`);
}, { device: IPAD });

// ---------------------------------------------------------------- 1.21.1: wybór daty i godziny

const dateSheet = (page) => page.locator('dialog[data-testid=date-sheet]');
/** Bęben zatrzymany na wartości (po płynnym obrocie). */
async function expectDrum(page, which, value) {
  const drum = dateSheet(page).locator(`[data-testid=date-time-${which}]`);
  await waitUntil(async () => (await drum.getAttribute('aria-valuenow')) === String(value), `bęben ${which}: ${value}`);
}
/** Edytor notatki lekcji „Financial Statements” z tekstem; „Data i godzina → Inna data lub godzina…”. */
async function openDateSheet(page) {
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate((id) => window.lexicards.library.saveNote(id, { html: '<p>Spotkanie</p>' }), ids.statements);
  await openNotePreview(page, ids.statements);
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-right]').click();
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.waitFor();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' ');
  await dialog.locator('[data-testid=note-format-date]').click();
  await page.locator('[data-testid=note-date-other]').click();
  await dateSheet(page).waitFor();
  await settled(dateSheet(page));
  return { dialog, editor, ids };
}

test('data i godzina 1.21.1: kalendarz i bębny – kółko myszy, przeciągnięcie, kliknięcie liczby, cyfry („0745”), strzałki, Enter wstawia; dni klawiaturą, wybór miesiąca i roku, skróty, tryby „Data” i „Godzina” (komputer)', async ({ open }) => {
  const page = await open();
  await page.clock.setFixedTime(new Date('2026-10-20T14:35:00'));
  const { editor } = await openDateSheet(page);
  const picker = dateSheet(page);
  const summary = picker.locator('[data-testid=date-summary]');
  const preview = picker.locator('[data-testid=date-preview]');
  await expectText(summary, 'wtorek, 20 października 2026, 14:35');
  await expectText(preview, 'Wstawi się: „20.10.2026, 14:35”');
  assert.equal(await picker.locator('input[type=date], input[type=time]').count(), 0, 'bez pól daty i godziny przeglądarki');
  assert.equal(await picker.locator('[data-testid="date-calendar-day-2026-10-20"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await picker.locator('[data-testid="date-calendar-day-2026-10-20"]').getAttribute('aria-current'), 'date');
  await page.screenshot({ path: path.join(OUTPUT, 'data-1211-okno-komputer.png') });

  // Kółko myszy: dwa ząbki w dół nad godzinami – 16, ząbek w górę nad minutami – 34.
  const hour = picker.locator('[data-testid=date-time-hour]');
  const minute = picker.locator('[data-testid=date-time-minute]');
  const middle = async (locator) => {
    const box = await locator.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, item: box.height / 5 };
  };
  const atHour = await middle(hour);
  await page.mouse.move(atHour.x, atHour.y);
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await expectDrum(page, 'hour', 16);
  const atMinute = await middle(minute);
  await page.mouse.move(atMinute.x, atMinute.y);
  await page.mouse.wheel(0, -100);
  await expectDrum(page, 'minute', 34);
  await expectText(preview, '„20.10.2026, 16:34”');
  // Przeciągnięcie minut myszą o dwie liczby w górę – 36; kliknięcie liczby pod środkiem – 37.
  await page.mouse.down();
  await page.mouse.move(atMinute.x, atMinute.y - atMinute.item * 2, { steps: 8 });
  await page.mouse.up();
  await expectDrum(page, 'minute', 36);
  await page.mouse.click(atMinute.x, atMinute.y + atMinute.item);
  await expectDrum(page, 'minute', 37);

  // Klawiatura: „00” – północ (fokus przechodzi do minut), strzałka w górę na godzinach – 23 (bęben się zapętla);
  // „0745” – 07:45; strzałka w dół i PageUp na minutach; strzałka w lewo – z powrotem do godzin.
  await hour.focus();
  await page.keyboard.type('00');
  await expectDrum(page, 'hour', 0);
  assert.equal(await minute.evaluate((drum) => drum === document.activeElement), true, 'po dwóch cyfrach – minuty');
  await hour.focus();
  await page.keyboard.press('ArrowUp');
  await expectDrum(page, 'hour', 23);
  await page.keyboard.type('0745');
  await expectDrum(page, 'hour', 7);
  await expectDrum(page, 'minute', 45);
  await page.keyboard.press('ArrowDown');
  await expectDrum(page, 'minute', 46);
  await page.keyboard.press('PageUp');
  await expectDrum(page, 'minute', 36);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await expectDrum(page, 'hour', 8);
  await expectText(preview, '„20.10.2026, 08:36”');

  // Kalendarz: kliknięcie dnia, potem strzałki i PageDown przenoszą fokus, Enter wybiera.
  await picker.locator('[data-testid="date-calendar-day-2026-10-22"]').click();
  await expectText(summary, 'czwartek, 22 października 2026, 08:36');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('PageDown');
  await page.keyboard.press('Enter');
  await expectText(summary, 'poniedziałek, 30 listopada 2026, 08:36');
  await expectText(picker.locator('[data-testid=date-calendar-title]'), 'Listopad 2026');
  // Nazwa miesiąca – wybór miesiąca i roku: marzec 2027, 15.
  await picker.locator('[data-testid=date-calendar-title]').click();
  await expectText(picker.locator('[data-testid=date-calendar-title]'), '2026');
  await picker.locator('[data-testid=date-calendar-next]').click();
  await picker.locator('[data-testid=date-calendar-month-3]').click();
  await picker.locator('[data-testid="date-calendar-day-2027-03-15"]').click();
  await expectText(summary, 'poniedziałek, 15 marca 2027, 08:36');

  // Skróty: Jutro, +15 min, Pełna godzina, Teraz.
  await picker.locator('[data-testid=date-tomorrow]').click();
  await expectText(summary, 'środa, 21 października 2026, 08:36');
  await picker.locator('[data-testid=date-plus-15]').click();
  await expectDrum(page, 'minute', 51);
  await picker.locator('[data-testid=date-full-hour]').click();
  await expectDrum(page, 'minute', 0);
  await expectText(preview, '„21.10.2026, 08:00”');
  await picker.locator('[data-testid=date-now]').click();
  await expectDrum(page, 'hour', 14);
  await expectDrum(page, 'minute', 35);
  await expectText(summary, 'wtorek, 20 października 2026, 14:35');

  // Tryby: sama godzina (bez kalendarza), sama data (bez bębnów), znowu oba.
  await picker.locator('.segmented__option', { hasText: /^Godzina$/ }).click();
  assert.equal(await picker.locator('[data-testid=date-calendar]').isVisible(), false);
  await expectText(preview, 'Wstawi się: „14:35”');
  await picker.locator('.segmented__option', { hasText: /^Data$/ }).click();
  assert.equal(await picker.locator('[data-testid=date-time]').isVisible(), false);
  await expectText(preview, 'Wstawi się: „20.10.2026”');
  await picker.locator('.segmented__option', { hasText: /^Data i godzina$/ }).click();
  await page.screenshot({ path: path.join(OUTPUT, 'data-1211-okno-komputer-2.png') });

  // Wpisane 9:30 i Enter na bębnie – wstawione w miejscu kursora.
  await hour.focus();
  await page.keyboard.type('0930');
  await expectDrum(page, 'minute', 30);
  await page.keyboard.press('Enter');
  await picker.waitFor({ state: 'detached' });
  await expectText(editor, 'Spotkanie 20.10.2026, 09:30');
}, { device: DESKTOP });

test('data i godzina 1.21.1 na telefonie: okno bez przewijania w bok, bęben przewinięty palcem staje na liczbie, dotknięcie liczby; okres filtra „Utworzone” – dwa dotknięcia, gotowe okresy, dni po dziś niedostępne', async ({ open }) => {
  const page = await open();
  await page.clock.setFixedTime(new Date('2026-10-20T14:35:00'));
  const { editor, ids } = await openDateSheet(page);
  const picker = dateSheet(page);
  assert.equal(await overflowX(page), 0, 'okno mieści się na ekranie');
  await page.screenshot({ path: path.join(OUTPUT, 'data-1211-okno-telefon.png') });
  // Przewinięcie palcem (przewijanie bębna) o ok. 3,4 liczby – zatrzymuje się na 38.
  const minute = picker.locator('[data-testid=date-time-minute]');
  await minute.scrollIntoViewIfNeeded();
  await minute.evaluate((drum) => { drum.scrollTop += drum.querySelector('.drum__item').offsetHeight * 3.4; });
  await expectDrum(page, 'minute', 38);
  // Dotknięcie liczby pod środkiem – 39.
  const box = await minute.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 + box.height / 5);
  await expectDrum(page, 'minute', 39);
  await page.screenshot({ path: path.join(OUTPUT, 'data-1211-bebny-telefon.png') });
  await sheetSubmit(page).click();
  await picker.waitFor({ state: 'detached' });
  await expectText(editor, 'Spotkanie 20.10.2026, 14:39');

  // Zapis notatki i zamknięcie okna.
  await noteDialog(page).locator('[data-testid=note-right]').click();
  await noteDialog(page).locator('[data-testid=note-book]').waitFor();
  await noteDialog(page).locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  assert.equal((await storedNote(page, ids.statements)).html, '<p>Spotkanie 20.10.2026, 14:39</p>');

  // Okres w filtrze lekcji modułu: „Wybrany okres…” od razu otwiera kalendarz okresu (ostatni tydzień).
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  await page.selectOption('[data-testid=lessons-created-preset]', 'range');
  const rangeSheet = page.locator('dialog[data-testid=range-sheet]');
  await rangeSheet.waitFor();
  await settled(rangeSheet);
  const rangeSummary = rangeSheet.locator('[data-testid=range-summary]');
  await expectText(rangeSummary, '14 – 20 października 2026');
  assert.equal(await rangeSheet.locator('[data-testid="range-calendar-day-2026-10-21"]').isDisabled(), true, 'jutro – niedostępne');
  await rangeSheet.locator('[data-testid="range-calendar-day-2026-10-16"]').click();
  await expectText(rangeSheet, 'Teraz dotknij ostatniego dnia');
  await rangeSheet.locator('[data-testid="range-calendar-day-2026-10-05"]').click();
  await expectText(rangeSummary, '5 – 16 października 2026');
  await expectText(rangeSheet, '12 dni');
  assert.deepEqual(await rangeSheet.locator('.calendar__day--between').evaluateAll((days) => days.map((day) => day.textContent)),
    ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15'], 'pasmo między początkiem a końcem');
  await page.screenshot({ path: path.join(OUTPUT, 'data-1211-okres-telefon.png') });
  await rangeSheet.locator('[data-testid=range-previousMonth]').click();
  await expectText(rangeSummary, '1 – 30 września 2026');
  await expectText(rangeSheet.locator('[data-testid=range-calendar-title]'), 'Wrzesień 2026');
  await sheetSubmit(page).click();
  await rangeSheet.waitFor({ state: 'detached' });
  const rangeButton = page.locator('[data-testid=lessons-created-range]');
  await expectText(rangeButton, '1 – 30 września 2026');
  await expectText(page.locator('.group__title', { hasText: 'Lekcje' }), 'Lekcje – 0 z 3');
  // Ponowne otwarcie pokazuje wybrany okres; Anuluj nic nie zmienia.
  await rangeButton.click();
  await rangeSheet.waitFor();
  await expectText(rangeSummary, '1 – 30 września 2026');
  await rangeSheet.locator('.sheet__header .button--plain').click();
  await rangeSheet.waitFor({ state: 'detached' });
  await expectText(rangeButton, '1 – 30 września 2026');
});

test('rysunek na zdjęciu: „Rysuj na zdjęciu” – zdjęcie pod kreskami, sygnatura i miejsce bez zmian; bez rysika rysuje palec; nowy pusty rysunek nie trafia do notatki; kopia zapasowa przenosi kreski', async ({ open, browser, track }) => {
  const page = await open();
  const { ids } = await openNoteWithImages(page, { html: '<p>Schemat:</p><p>[[Schemat]]</p>', labels: ['Schemat'] });
  const dialog = noteDialog(page);
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-editor]').waitFor();

  // „Narysuj” i „Gotowe” bez kreski – nic nie dochodzi.
  await dialog.locator('[data-testid=note-image-draw]').click();
  const editor = drawingDialog(page);
  await editor.waitFor();
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  assert.equal(await dialog.locator('.note-images__item').count(), 1, 'pusty rysunek nie trafia do notatki');

  await dialog.locator('.note-images__open').first().click();
  assert.equal(await page.locator('dialog.menu[open]').getByRole('menuitem', { name: 'Edytuj rysunek' }).count(), 0, 'zwykły obraz – bez „Edytuj rysunek”');
  await menuItem(page, 'Rysuj na zdjęciu');
  await editor.waitFor();
  await waitUntil(() => editor.locator('[data-testid=drawing-canvas]').evaluate((canvas) => canvas.width > 0), 'Płótno gotowe');
  await expectText(editor.locator('.sheet__title'), 'Schemat');
  assert.equal(await editor.locator('[data-testid=drawing-paper]').isHidden(), true, 'na zdjęciu bez wyboru tła');
  await waitUntil(async () => { const [r, , b] = await pixelAt(page, 0.15, 0.4); return b > 150 && r < 120; }, 'Zdjęcie pod kreskami');

  // Bez rysika (telefon) rysuje palec.
  await drawStroke(page, segment([0.1, 0.42], [0.9, 0.42]), { type: 'touch', id: 3 });
  await waitUntil(() => darkAt(page, 0.15, 0.42), 'Kreska palcem na zdjęciu');
  assert.equal(await editor.locator('[data-testid=drawing-pen-only]').isHidden(), true, 'bez rysika – bez pigułki');
  assert.equal(await overflowX(page), 0, 'edytor mieści się na telefonie');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-na-zdjeciu-telefon.png') });
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  const tile = dialog.locator('.note-images__item').first();
  await expectText(tile.locator('[data-testid=note-image-label-text]'), 'Schemat');
  assert.equal(await tile.locator('[data-testid=note-image-drawing]').count(), 1, 'zdjęcie stało się rysunkiem w tym samym miejscu');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-w-edytorze-notatki-telefon.png') });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();

  const photoSize = await page.evaluate(async () => (await (await fetch('./icons/icon-512.png')).arrayBuffer()).byteLength);
  const stored = await storedDrawings(page, ids.statements);
  assert.equal(stored.length, 1);
  assert.deepEqual([stored[0].label, stored[0].type, stored[0].width, stored[0].height], ['Schemat', 'image/jpeg', 512, 512]);
  assert.deepEqual(stored[0].drawing.photo, { type: 'image/png', size: photoSize }, 'zdjęcie zostaje pod kreskami bez zmian');
  assert.deepEqual(stored[0].drawing.strokes.map((stroke) => stroke.tool), ['pen']);
  await waitUntil(() => dialog.locator('.note-page__figure img').evaluate((image) => image.complete && image.naturalWidth === 512), 'Rysunek na zdjęciu w podglądzie');

  // Kopia zapasowa: kreski i zdjęcie w pliku obrazów i załączników, przywrócenie na drugim urządzeniu.
  await dialog.locator('[data-testid=note-left]').click();
  await dialog.waitFor({ state: 'detached' });
  await page.goto(`${page.url().split('#')[0]}#/settings`);
  const data = await download(page, () => page.click('[data-testid=backup-export]'));
  const media = await download(page, () => page.click('[data-testid=backup-media-export]'));
  const backup = JSON.parse(new TextDecoder().decode(data.bytes));
  const note = backup.data.notes.find((item) => item.lessonID === ids.statements);
  assert.equal(note.images[0].drawing, true, 'plik danych: znacznik rysunku');
  const names = [...readZipDirectory(media.bytes).keys()];
  assert.ok(names.includes(`rysunki/${stored[0].id}.json`), 'kreski w pliku obrazów');
  assert.ok(names.includes(`rysunki/${stored[0].id}-zdjecie.png`), 'zdjęcie pod kreskami w pliku obrazów');
  const context = await browser.newContext({ ...PHONE, locale: 'pl-PL' });
  try {
    const other = await context.newPage();
    track(other);
    await other.goto(page.url().split('#')[0]);
    await other.waitForSelector('#app[data-ready="true"]');
    await restoreFiles(other, [path.join(OUTPUT, media.name), path.join(OUTPUT, data.name)]);
    await confirm(other);
    await expectText(other.locator('.alert__message'), 'Dodano 1 obraz');
    assert.deepEqual(await storedDrawings(other, ids.statements), stored, 'rysunek z kreskami i zdjęciem na drugim urządzeniu');
  } finally {
    await context.close();
  }
});

test('notatka: sygnatury obrazów – obraz w miejscu odwołania, brak obrazu na czerwono, wstawienie i zmiana sygnatury w edytorze, kopiowanie', async ({ open, context }) => {
  const page = await open();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  const { ids, book } = await openNoteWithImages(page, {
    html: '<p>Bilans pokazuje majątek.</p><p>[[ schemat ]]</p><ul><li>Aktywa = Pasywa</li></ul><p>[[Brak]]</p>',
    htmlEN: '<p>A balance sheet.</p><p>[[Schemat]]</p>',
    labels: ['Schemat', null]
  });
  const dialog = noteDialog(page);
  assert.deepEqual((await storedNote(page, ids.statements)).images.map((image) => image.label), ['Schemat', 'Obraz 1'], 'brakująca sygnatura – „Obraz N”');

  // Obraz z odwołaniem stoi między akapitem a listą (wielkość liter i odstępy bez znaczenia);
  // odwołanie bez obrazu zostaje tekstem na czerwono; obraz bez odwołania – na końcu.
  const order = await book.evaluate((element) => {
    const page = element.querySelector('[data-testid=note-page]');
    return [...page.querySelectorAll('.note-page__text > *, .note-page__figure')].map((item) => (item.matches('.note-page__figure')
      ? `obraz ${item.dataset.index}` : item.textContent.trim()));
  });
  assert.deepEqual(order.slice(0, 4), ['Bilans pokazuje majątek.', 'obraz 0', 'Aktywa = Pasywa', '[[Brak]]']);
  const missing = dialog.locator('.note-ref--missing');
  assert.equal(await missing.evaluate((element) => getComputedStyle(element).color), 'rgb(201, 0, 15)');
  await page.keyboard.press('End');
  await waitUntil(async () => (await dialog.locator('[data-testid=note-page] .note-page__figure').last().getAttribute('data-index')) === '1',
    'Obraz bez odwołania na końcu notatki');

  // Kopiowanie: obraz w miejscu odwołania, nie na końcu.
  await dialog.locator('[data-testid=note-copy]').click();
  await page.locator('.toast', { hasText: 'Skopiowano notatkę' }).waitFor();
  const copied = await page.evaluate(async () => (await (await (await navigator.clipboard.read())[0].getType('text/html')).text()));
  assert.ok(copied.indexOf('<img') > copied.indexOf('majątek') && copied.indexOf('<img') < copied.indexOf('Aktywa'), 'obraz po pierwszym akapicie');
  assert.equal(copied.match(/<img/g).length, 2);
  assert.ok(!copied.includes('[[ schemat ]]'));

  // Edytor: sygnatury pod miniaturami, wstawienie odwołania w miejscu kursora.
  await dialog.locator('[data-testid=note-right]').click();
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.waitFor();
  assert.deepEqual(await dialog.locator('[data-testid=note-image-label-text]').allTextContents(), ['Schemat', 'Obraz 1']);
  await editor.evaluate((area) => {
    const text = area.querySelector('p').firstChild;
    const range = document.createRange();
    range.setStart(text, text.length);
    range.collapse(true);
    area.focus();
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await page.waitForTimeout(50);
  await dialog.locator('.note-images__open').nth(1).click();
  await menuItem(page, 'Wstaw do tekstu');
  assert.deepEqual(await editor.locator(':scope > *').evaluateAll((items) => items.slice(0, 3).map((item) => item.textContent)),
    ['Bilans pokazuje majątek.', '[[Obraz 1]]', ''], 'odwołanie w osobnej linijce za akapitem z kursorem');

  // Zmiana sygnatury: odwołania w obu wersjach językowych zmieniają się same; sygnatura musi być jedyna.
  await dialog.locator('.note-images__open').first().click();
  await menuItem(page, 'Zmień sygnaturę');
  await sheet(page).locator('[data-testid=note-image-label]').fill('obraz 1');
  await sheet(page).locator('.sheet__submit').click();
  await expectText(sheet(page).locator('.form-message--error'), 'Inny obraz tej notatki ma już tę sygnaturę.');
  await sheet(page).locator('[data-testid=note-image-label]').fill('Wykres [główny]');
  await saveSheet(page);
  assert.deepEqual(await dialog.locator('[data-testid=note-image-label-text]').allTextContents(), ['Wykres główny', 'Obraz 1']);
  assert.equal(await editor.locator('p', { hasText: '[[Wykres główny]]' }).count(), 1);
  await dialog.getByRole('radiogroup', { name: 'Język treści' }).locator('.segmented__option', { hasText: 'Angielski' }).click();
  await expectText(editor, '[[Wykres główny]]');
  await dialog.locator('[data-testid=note-right]').click();
  await book.waitFor();
  const saved = await storedNote(page, ids.statements);
  assert.deepEqual(saved.images.map((image) => image.label), ['Wykres główny', 'Obraz 1']);
  assert.equal(saved.html, '<p>Bilans pokazuje majątek.</p><p>[[Obraz 1]]</p><p>[[Wykres główny]]</p><ul><li>Aktywa = Pasywa</li></ul><p>[[Brak]]</p>');
  assert.equal(saved.htmlEN, '<p>A balance sheet.</p><p>[[Wykres główny]]</p>');
  // Oba obrazy mają teraz miejsce w tekście – nic nie zostaje na końcu.
  assert.equal(await dialog.locator('[data-testid=note-language] .segmented__input:checked').getAttribute('value'), 'en', 'po zapisie – wersja edytowana');
});

test('notatka po angielsku: przełącznik PL / EN w podglądzie i w edytorze, wybór zapamiętany, notatka tylko po polsku bez przełącznika', async ({ open }) => {
  const page = await open();
  const { ids, book } = await openNoteWithImages(page, {
    html: '<h3>Bilans</h3><p>Pokazuje majątek firmy.</p>',
    htmlEN: '<h3>Balance sheet</h3><p>Shows what a company owns.</p>'
  });
  const dialog = noteDialog(page);
  const language = dialog.getByRole('radiogroup', { name: 'Język notatki' });
  assert.equal(await language.getByRole('radio', { name: 'PL' }).isChecked(), true, 'domyślnie po polsku');
  await expectText(dialog.locator('[data-testid=note-text]'), 'Pokazuje majątek firmy.');
  assert.equal(await dialog.locator('[data-testid=note-text]').getAttribute('lang'), 'pl');

  await language.locator('.segmented__option', { hasText: 'EN' }).click();
  await expectText(dialog.locator('[data-testid=note-text]'), 'Shows what a company owns.');
  assert.equal(await dialog.locator('[data-testid=note-text]').getAttribute('lang'), 'en');
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().noteLanguage === 'en'), 'Wybór języka zapisany');

  // Po ponownym otwarciu – ta sama wersja; edytor otwiera się w niej.
  await dialog.locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  await page.click('[data-testid=lesson-note]');
  await book.waitFor();
  await expectText(dialog.locator('[data-testid=note-text]'), 'Shows what a company owns.');
  await dialog.locator('[data-testid=note-right]').click();
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.waitFor();
  const editLanguage = dialog.getByRole('radiogroup', { name: 'Język treści' });
  assert.equal(await editLanguage.getByRole('radio', { name: 'Angielski' }).isChecked(), true);
  await expectText(editor, 'Shows what a company owns.');
  assert.equal(await editor.getAttribute('lang'), 'en');

  // Przełączenie na polski i dopisanie zdania – wersja angielska zostaje bez zmian.
  await editLanguage.locator('.segmented__option', { hasText: 'Polski' }).click();
  await expectText(editor, 'Pokazuje majątek firmy.');
  assert.equal(await editor.getAttribute('lang'), 'pl');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Dopisane zdanie.');
  await dialog.locator('[data-testid=note-right]').click();
  await book.waitFor();
  const saved = await storedNote(page, ids.statements);
  assert.equal(saved.html, '<h3>Bilans</h3><p>Pokazuje majątek firmy.</p><p>Dopisane zdanie.</p>');
  assert.equal(saved.htmlEN, '<h3>Balance sheet</h3><p>Shows what a company owns.</p>');
  await expectText(dialog.locator('[data-testid=note-text]'), 'Dopisane zdanie.', 'po zapisie podgląd w edytowanej wersji');

  // Notatka bez wersji angielskiej: bez przełącznika, po polsku mimo wyboru „EN”.
  await page.evaluate((id) => window.lexicards.library.saveNote(id, { html: '<p>Tylko polski</p>', htmlEN: '', images: [] }), ids.statements);
  await dialog.locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  await page.click('[data-testid=lesson-note]');
  await book.waitFor();
  await expectText(dialog.locator('[data-testid=note-text]'), 'Tylko polski');
  assert.equal(await dialog.locator('[data-testid=note-language]').count(), 0);
});

test('notatka: czytanie na głos – od widocznej strony, wyróżniony akapit, strony przewracają się same, pauza i wznowienie', async ({ open, context }) => {
  await fakeSpeechForListening(context);
  const page = await open();
  const paragraphs = Array.from({ length: 12 }, (_, index) => `<p>Akapit numer ${index + 1}. ${LONG_SENTENCE}</p>`).join('');
  const { book } = await openNoteWithImages(page, {
    html: `<h3>Bilans</h3>${paragraphs}`,
    htmlEN: '<p>English version.</p>'
  });
  const dialog = noteDialog(page);
  const total = Number(await book.getAttribute('data-pages'));
  assert.ok(total >= 3, `kilka stron (jest ${total})`);
  const listen = dialog.locator('[data-testid=note-listen]');
  assert.equal(await listen.getAttribute('aria-pressed'), 'false');
  await listen.click();
  assert.equal(await listen.getAttribute('aria-pressed'), 'true');
  await waitUntil(() => page.evaluate(() => window.spokenTexts.length > 0), 'Czytanie się zaczęło');
  const first = await page.evaluate(() => window.spokenTexts[0]);
  assert.equal(first.text, 'Bilans');
  assert.match(first.lang, /^pl/);
  await expectText(dialog.locator('.note-reading'), 'Bilans');

  // Czytanie przechodzi na kolejne strony samo (zdanie po zdaniu).
  await waitUntil(async () => Number(await book.getAttribute('data-page')) >= 2, 'Strony przewracają się w trakcie czytania', 30000);
  const reading = await dialog.locator('.note-reading').textContent();
  assert.ok(await dialog.locator('[data-testid=note-page]').last().locator('.note-reading').count() === 1, 'wyróżniony akapit na widocznej stronie');

  // Pauza: czytanie stoi; wznowienie – od tego samego zdania.
  await listen.click();
  assert.equal(await listen.getAttribute('aria-pressed'), 'false');
  const paused = await page.evaluate(() => window.spokenTexts.length);
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.spokenTexts.length), paused, 'w pauzie nic nie jest czytane');
  const last = await page.evaluate(() => window.spokenTexts[window.spokenTexts.length - 1].text);
  await listen.click();
  await waitUntil(() => page.evaluate((count) => window.spokenTexts.length > count, paused), 'Czytanie wznowione');
  assert.equal(await page.evaluate((count) => window.spokenTexts[count].text, paused), last, 'wznowienie od przerwanego zdania');
  assert.ok(reading.length > 0);

  // Przełączenie na wersję angielską zatrzymuje czytanie; czyta po angielsku od początku.
  await dialog.getByRole('radiogroup', { name: 'Język notatki' }).locator('.segmented__option', { hasText: 'EN' }).click();
  await expectText(dialog.locator('[data-testid=note-text]'), 'English version.');
  assert.equal(await dialog.locator('.note-reading').count(), 0);
  const before = await page.evaluate(() => window.spokenTexts.length);
  await dialog.locator('[data-testid=note-listen]').click();
  await waitUntil(() => page.evaluate((count) => window.spokenTexts.length > count, before), 'Czytanie po angielsku');
  const english = await page.evaluate((count) => window.spokenTexts[count], before);
  assert.equal(english.text, 'English version.');
  assert.match(english.lang, /^en/);
  // Po przeczytaniu całości przycisk wraca do stanu początkowego.
  await waitUntil(async () => (await dialog.locator('[data-testid=note-listen]').getAttribute('aria-pressed')) === 'false', 'Koniec czytania');
  assert.equal(await dialog.locator('.note-reading').count(), 0);
});

test('notatka: „Nowa strona” w edytorze; podgląd na liście bez znacznika; ograniczony ruch – strony bez animacji', async ({ open }) => {
  const page = await open();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.click('[data-testid=lesson-note-add]');
  const dialog = noteDialog(page);
  const editor = dialog.locator('[data-testid=note-editor]');
  await editor.click();
  await page.keyboard.type('Pierwsza strona');
  await dialog.locator('[data-testid=note-format-pageBreak]').click();
  await page.keyboard.type('Druga strona');
  assert.equal(await editor.locator('hr').count(), 1, 'w edytorze widać linię nowej strony');
  assert.match(await editor.locator('hr').evaluate((element) => getComputedStyle(element, '::after').content), /Nowa strona/);
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-book]').waitFor();
  assert.equal((await storedNote(page, ids.statements)).html, '<p>Pierwsza strona</p><hr data-page=""><p>Druga strona</p>');

  const book = dialog.locator('[data-testid=note-book]');
  assert.equal(await book.getAttribute('data-pages'), '2');
  await expectText(dialog.locator('[data-testid=note-page]'), 'Pierwsza strona');
  await dialog.locator('[data-testid=note-page-next]').click();
  // Ograniczony ruch: strona zmienia się od razu, bez obrotu.
  assert.equal(await book.getAttribute('data-page'), '2');
  await expectText(dialog.locator('[data-testid=note-page]'), 'Druga strona');

  // Ponowna edycja: linia jest na miejscu, a zamknięcie bez zmian niczego nie pyta.
  await dialog.locator('[data-testid=note-right]').click();
  assert.equal(await editor.locator('hr').count(), 1);
  await dialog.locator('[data-testid=note-left]').click();
  await book.waitFor();
  assert.equal(await page.locator('dialog.alert[open]').count(), 0);

  /** Kursor w tekście pola edycji: w węźle tekstowym zawierającym `text`, za `offset` znakami. */
  const placeCaret = async (text, offset) => {
    await editor.evaluate((area, [needle, at]) => {
      const walker = document.createTreeWalker(area, window.NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.data.includes(needle)) continue;
        const range = document.createRange();
        range.setStart(walker.currentNode, at);
        range.collapse(true);
        area.focus();
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        return;
      }
    }, [text, offset]);
    await page.waitForTimeout(50);
  };

  // W środku akapitu: akapit dzieli się na dwie strony.
  await dialog.locator('[data-testid=note-right]').click();
  await placeCaret('Pierwsza strona', 'Pierwsza'.length);
  await dialog.locator('[data-testid=note-format-pageBreak]').click();
  await dialog.locator('[data-testid=note-right]').click();
  await book.waitFor();
  assert.equal((await storedNote(page, ids.statements)).html,
    '<p>Pierwsza</p><hr data-page=""><p>strona</p><hr data-page=""><p>Druga strona</p>');
  assert.equal(await book.getAttribute('data-pages'), '3');

  // W liście: lista dzieli się po punkcie z kursorem, a nowa strona zaczyna się od zwykłego akapitu.
  await page.evaluate((id) => window.lexicards.library.saveNote(id, { html: '<ul><li>alfa</li><li>beta</li><li>gamma</li></ul>', images: [] }), ids.statements);
  await dialog.locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  await page.click('[data-testid=lesson-note]');
  await dialog.locator('[data-testid=note-right]').click();
  await placeCaret('beta', 4);
  await dialog.locator('[data-testid=note-format-pageBreak]').click();
  await page.keyboard.type('nowa');
  await dialog.locator('[data-testid=note-right]').click();
  await book.waitFor();
  assert.equal((await storedNote(page, ids.statements)).html,
    '<ul><li>alfa</li><li>beta</li></ul><hr data-page=""><p>nowa</p><ul><li>gamma</li></ul>');
  await dialog.locator('[data-testid=note-left]').click();
  await noteDialog(page).waitFor({ state: 'detached' });
  const preview = (await page.locator('[data-testid=lesson-note] .note-row__preview').textContent()).trim();
  assert.equal(preview.includes('---'), false, `podgląd bez znacznika strony: ${preview}`);
  assert.ok(preview.includes('nowa'));
});

// ---------------------------------------------------------------- 1.22: liniuszek promieniowy, przyciąganie końców, przewracanie kartek

/** Środek kółka liniuszka (biały środek na warstwie bieżącej) w jednostkach strony. */
async function guideKnob(page, frame) {
  const knob = await page.locator('[data-testid=drawing-canvas]').evaluate((canvas) => {
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let [sx, sy, count] = [0, 0, 0];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (data[index + 3] > 200 && data[index] > 240 && data[index + 1] > 240 && data[index + 2] > 240) {
          sx += x;
          sy += y;
          count += 1;
        }
      }
    }
    const box = canvas.getBoundingClientRect();
    return count ? { x: box.left + (sx / count) * (box.width / width), y: box.top + (sy / count) * (box.height / height) } : null;
  });
  assert.ok(knob, 'kółko liniuszka na płótnie');
  // Kółko stoi w węźle kratki (co 44 jednostki).
  const unit = (value, origin) => Math.round((value - origin) / frame.scale / 44) * 44;
  return { x: unit(knob.x, frame.x + frame.left), y: unit(knob.y, frame.y + frame.top) };
}

test('rysunek 1.22: liniuszek promieniowy – okręgi co 2 kratki, kreska wzdłuż okręgu po łuku, wzdłuż promienia (co 45°, obrót 15°) prosto, w innym kierunku zwykła; bez promieni; ustawienia zapamiętane (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Promieniowy</p>');
  const frame = await pageFrame(page);
  const panel = editor.locator('[data-testid=drawing-guide-panel]');
  const pill = editor.locator('[data-testid=drawing-guide-pill]');
  await editor.locator('[data-testid=drawing-guide]').click();
  await expectText(pill, 'Liniuszek 0°');
  await pill.click();
  await panel.waitFor();
  await panel.locator('[data-testid=drawing-guide-kind] .segmented__option', { hasText: 'Promieniowy' }).click();
  await expectText(pill, 'Promieniowy · okręgi co 1 cm · promienie co 30°');
  assert.equal(await panel.locator('[data-testid=drawing-guide-spacing]').isVisible(), false, 'bez odstępu linii równoległych');
  await panel.locator('[data-testid=drawing-guide-ringSpacing]').fill('2');
  await panel.locator('[data-testid=drawing-guide-rayStep-45]').click();
  await panel.locator('[data-testid=drawing-guide-rayAngle-15]').click();
  await expectText(pill, 'Promieniowy · okręgi co 2 cm · promienie co 45°');
  await expectText(panel, '45° · 8 promieni');
  await settled(panel);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-liniuszek-promieniowy-ipad.png') });
  await page.keyboard.press('Escape');
  await waitUntil(() => panel.isHidden(), 'Panel liniuszka zamknięty');
  const center = await guideKnob(page, frame);
  const polar = (radius, degrees) => frame.at(center.x + radius * Math.cos((degrees * Math.PI) / 180), center.y + radius * Math.sin((degrees * Math.PI) / 180));

  // Wzdłuż okręgu o promieniu 176 (2 × 2 kratki) z drżeniem – łuk dokładnie na okręgu.
  const arc = Array.from({ length: 15 }, (_, index) => [...polar(176 + (index % 2 ? 3 : -2), 10 + index * 3), 0.5]);
  await drawStroke(page, arc);
  // Wzdłuż promienia pod kątem 30° na ekranie (−15° + 45°) – prosto po promieniu.
  const ray = Array.from({ length: 13 }, (_, index) => {
    const radius = 60 + index * 15;
    const [x, y] = polar(radius, 30);
    return [x + ((index % 2 ? 2 : -2) * frame.scale) / frame.width, y, 0.5];
  });
  await drawStroke(page, ray);
  // Od okręgu 264 ukośnie (45° do okręgu, daleko od promieni) – zwykła kreska.
  const start = { x: center.x + 264 * Math.cos((100 * Math.PI) / 180), y: center.y + 264 * Math.sin((100 * Math.PI) / 180) };
  const tangent = ((100 + 90 + 45) * Math.PI) / 180;
  await drawStroke(page, Array.from({ length: 11 }, (_, index) => [...frame.at(start.x + Math.cos(tangent) * index * 9, start.y + Math.sin(tangent) * index * 9), 0.5]));
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-liniuszek-promieniowy-kreski-ipad.png') });

  // Bez promieni – w pigułce tylko okręgi; po wyłączeniu i włączeniu liniuszka ustawienia zostają.
  await pill.click();
  await panel.locator('[data-testid=drawing-guide-rays]').uncheck({ force: true });
  await expectText(pill, 'Promieniowy · okręgi co 2 cm');
  assert.equal((await pill.textContent()).includes('promienie'), false);
  await panel.locator('[data-testid=drawing-guide-rays]').check({ force: true });
  await page.keyboard.press('Escape');
  await editor.locator('[data-testid=drawing-guide]').click();
  await waitUntil(() => pill.isHidden(), 'Liniuszek wyłączony');
  await editor.locator('[data-testid=drawing-guide]').click();
  await expectText(pill, 'Promieniowy · okręgi co 2 cm · promienie co 45°');
  await editor.locator('[data-testid=drawing-guide]').click();

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const strokes = (await savedStrokes(page, ids.statements)).map((stroke) => stroke.points);
  assert.equal(strokes.length, 3);
  const pairs = (points) => points.filter((_, index) => index % 3 === 0).map((x, index) => [x, points[index * 3 + 1]]);
  const radii = (points) => pairs(points).map(([x, y]) => Math.hypot(x - center.x, y - center.y));
  const [onRing, onRay, free] = strokes;
  for (const radius of radii(onRing)) assert.ok(Math.abs(radius - 176) < 0.6, `łuk na okręgu 176 (${radius.toFixed(2)})`);
  assert.ok(pairs(onRing).length >= 10, 'łuk z wielu punktów');
  for (const [x, y] of pairs(onRay)) {
    const angle = (Math.atan2(y - center.y, x - center.x) * 180) / Math.PI;
    assert.ok(Math.abs(angle - 30) < 0.3, `na promieniu 30° (${angle.toFixed(2)}°)`);
  }
  const spread = radii(free);
  assert.ok(Math.max(...spread) - Math.min(...spread) > 30, 'zwykła kreska – oddala się od środka');
}, { device: IPAD });

test('rysunek 1.22: koniec strzałki i odcinka przyciągany do narożnika i krawędzi (znacznik), z Alt – swobodnie; przyklejony koniec idzie za przesuniętym prostokątem, przesunięta sama strzałka – odklejona; magnes wył. i wł.; zapis (komputer)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Przyciąganie</p>');
  const frame = await pageFrame(page);
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const panel = editor.locator('[data-testid=drawing-shape-panel]');
  const magnet = editor.locator('[data-testid=drawing-selection-magnet]');
  const drag = async (from, to, { hold = null } = {}) => {
    await page.mouse.move(...frame.screen(...from));
    await page.mouse.down();
    await page.mouse.move(...frame.screen(...to), { steps: 8 });
    if (hold) await hold();
    await page.mouse.up();
  };
  const shape = async (name) => {
    await editor.locator('[data-testid=drawing-tool-shape]').click();
    await panel.locator(`[data-testid=drawing-shape-${name}]`).click();
  };
  // Najpierw puste miejsce – dotknięcie już zaznaczonego kształtu otwiera „Tekst na kształcie”.
  const select = async (point) => {
    await editor.locator('[data-testid=drawing-tool-select]').click();
    await page.mouse.click(...frame.screen(80, 1060));
    await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Bez zaznaczenia');
    await page.mouse.click(...frame.screen(...point));
  };

  // Prostokąt 600–900 × 400–600.
  await shape('rect');
  await drag([600, 400], [900, 600]);
  await expectText(selectionCount, 'Prostokąt');
  // Strzałka do narożnika (koniec 6 i 5 jednostek obok) – znacznik w trakcie, koniec w narożniku.
  await shape('arrow');
  assert.equal(await panel.locator('[data-testid=drawing-edge-snap]').isChecked(), true, 'przyciąganie domyślnie włączone');
  await page.keyboard.press('Escape');
  await drag([300, 200], [606, 405], {
    hold: async () => {
      await nextFrames(page);
      await page.screenshot({ path: path.join(OUTPUT, 'rysunek-przyciaganie-naroznik.png') });
    }
  });
  await expectText(selectionCount, 'Strzałka');
  // Z Alt – koniec tam, gdzie kursor (obok lewego dolnego narożnika).
  await page.keyboard.down('Alt');
  await drag([300, 700], [606, 594]);
  await page.keyboard.up('Alt');
  // Odcinek do prawej krawędzi (daleko od narożników) – koniec na krawędzi.
  await shape('line');
  await page.keyboard.press('Escape');
  await drag([1200, 500], [906, 502]);
  await expectText(selectionCount, 'Odcinek');
  assert.equal(await magnet.isVisible(), true, 'magnes przy zaznaczonym odcinku');
  assert.equal(await magnet.getAttribute('aria-pressed'), 'true');

  // Przesunięcie prostokąta o (100, 60): przyklejone końce idą za nim.
  await select([750, 500]);
  await expectText(selectionCount, 'Prostokąt');
  await drag([750, 500], [850, 560]);
  await waitUntil(async () => (await darkest(page, ...frame.at(1003, 562), 8)) < 110, 'Koniec odcinka przy przesuniętej krawędzi');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-przyciaganie-przesuniety.png') });
  // Cofnij – prostokąt i przyklejone końce razem wracają (jeden krok); ponów – znów za prostokątem.
  await editor.locator('[data-testid=drawing-undo]').click();
  await waitUntil(async () => (await darkest(page, ...frame.at(903, 502), 8)) < 110, 'Koniec odcinka z powrotem przy krawędzi');
  assert.ok((await darkest(page, ...frame.at(1003, 562), 8)) > 150, 'po cofnięciu – nie w nowym miejscu');
  await editor.locator('[data-testid=drawing-redo]').click();
  await waitUntil(async () => (await darkest(page, ...frame.at(1003, 562), 8)) < 110, 'Po ponowieniu – znów za prostokątem');

  // Magnes wyłączony (pasek zaznaczenia) – strzałka obok narożnika zostaje obok; włączony z panelu kształtów.
  await select([1100, 531]);
  await expectText(selectionCount, 'Odcinek');
  await magnet.click();
  await expectText(magnet, 'Przyciąganie wył.');
  assert.equal(await magnet.getAttribute('aria-pressed'), 'false');
  await shape('arrow');
  assert.equal(await panel.locator('[data-testid=drawing-edge-snap]').isChecked(), false, 'magnes i panel – to samo ustawienie');
  await page.keyboard.press('Escape');
  await drag([300, 1000], [706, 664]);
  await shape('arrow');
  await panel.locator('[data-testid=drawing-edge-snap]').check({ force: true });
  assert.equal(await panel.locator('[data-testid=drawing-edge-snap]').isChecked(), true);
  await page.keyboard.press('Escape');
  // Strzałka do prawego dolnego narożnika, potem przesunięta sama – odklejona.
  await drag([1300, 900], [1004, 664]);
  await select([1152, 782]);
  await expectText(selectionCount, 'Strzałka');
  await drag([1152, 782], [1112, 782]);
  // Drugie przesunięcie prostokąta (w dół o 100): strzałka do narożnika i odcinek – za nim, odklejona – nie.
  await select([850, 560]);
  await expectText(selectionCount, 'Prostokąt');
  await drag([850, 560], [850, 660]);
  await nextFrames(page);

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const strokes = await savedStrokes(page, ids.statements);
  assert.deepEqual(strokes.map((stroke) => stroke.shape), ['rect', 'arrow', 'arrow', 'line', 'arrow', 'arrow']);
  const [rect, toCorner, free, toEdge, snapOff, detached] = strokes;
  const end = (stroke, side) => ({ x: stroke.x + (side * stroke.w * Math.cos(stroke.angle)) / 2, y: stroke.y + (side * stroke.w * Math.sin(stroke.angle)) / 2 });
  const near = (point, x, y, tolerance, message) => assert.ok(Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance, `${message}: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}) zamiast (${x.toFixed(2)}, ${y.toFixed(2)})`);
  const [left, top, right, bottom] = [rect.x - rect.w / 2, rect.y - rect.h / 2, rect.x + rect.w / 2, rect.y + rect.h / 2];
  near({ x: left, y: top }, 700, 560, 2, 'prostokąt przesunięty dwa razy');
  assert.match(rect.id, /^[a-z0-9]{6,16}$/, 'prostokąt z identyfikatorem');
  near(end(toCorner, 1), left, top, 0.05, 'strzałka w lewym górnym narożniku (za prostokątem)');
  assert.deepEqual(toCorner.attach, { end: { id: rect.id, kind: 'corner', index: 0 } });
  near(end(toCorner, -1), 300, 200, 2, 'początek strzałki bez zmian');
  near(end(free, 1), 606, 594, 2, 'z Alt – koniec przy kursorze');
  assert.equal(free.attach, undefined);
  assert.ok(Math.abs(end(toEdge, 1).x - right) < 0.05, `odcinek na prawej krawędzi (${end(toEdge, 1).x} / ${right})`);
  near(end(toEdge, 1), right, 662, 2.5, 'odcinek – to samo miejsce krawędzi');
  assert.equal(toEdge.attach.end.id, rect.id);
  assert.equal(toEdge.attach.end.kind, 'edge');
  near(end(snapOff, 1), 706, 664, 2, 'magnes wyłączony – koniec przy kursorze');
  assert.equal(snapOff.attach, undefined);
  near(end(detached, 1), 960, 660, 2, 'odklejona strzałka zostaje');
  assert.equal(detached.attach, undefined, 'przesunięta sama – bez przyklejenia');
  assert.ok(bottom > 700, 'prostokąt niżej niż odklejona strzałka');
}, { device: DESKTOP });

test('rysunek 1.22: kółko myszy przewraca kartki z animacją – jeden gest to jedna kartka, małe przesunięcie nic; przyciski ‹ ›, nieczynne na końcach; przy powiększeniu kółko przewija; ograniczony ruch – bez animacji (komputer)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Kartki</p>');
  const frame = await pageFrame(page);
  const { at } = frame;
  const pages = editor.locator('[data-testid=drawing-pages]');
  const prev = editor.locator('[data-testid=drawing-page-prev]');
  const next = editor.locator('[data-testid=drawing-page-next]');
  assert.equal(await prev.isHidden(), true, 'jedna kartka – bez strzałek');
  await drawStroke(page, segment(at(300, 300), at(600, 300), 10));
  for (const y of [500, 800]) {
    await pages.click();
    await page.locator('[data-testid=drawing-page-new]').click();
    await waitUntil(async () => (await darkest(page, ...at(450, 300), 12)) > 150, 'Nowa kartka pusta');
    await drawStroke(page, segment(at(300, y), at(600, y), 10));
  }
  await expectText(pages, 'Kartka 3 z 3');
  assert.equal(await prev.isVisible(), true);
  assert.equal(await next.isDisabled(), true, 'ostatnia kartka – „dalej” nieczynne');
  // Płótno animacji: licznik pokazań.
  await page.evaluate(() => {
    window.__flips = 0;
    const flip = document.querySelector('.drawing__flip');
    new MutationObserver(() => { if (!flip.hidden) window.__flips += 1; }).observe(flip, { attributes: true, attributeFilter: ['hidden'] });
  });
  const flips = () => page.evaluate(() => window.__flips);
  const flipHidden = () => page.locator('.drawing__flip').evaluate((element) => element.hidden);
  await page.mouse.move(...frame.screen(800, 550));
  await page.mouse.wheel(0, -100);
  await expectText(pages, 'Kartka 2 z 3');
  await waitUntil(flipHidden, 'Animacja skończona');
  assert.equal(await flips(), 1, 'kartka przewrócona z animacją');
  await waitUntil(async () => (await darkest(page, ...at(450, 500), 12)) < 110, 'Kreska kartki 2');
  // Jeden gest (6 ruchów kółka co 40 ms) – tylko jedna kartka.
  await page.waitForTimeout(300);
  for (let index = 0; index < 6; index += 1) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(40);
  }
  await expectText(pages, 'Kartka 3 z 3');
  await page.waitForTimeout(400);
  await expectText(pages, 'Kartka 3 z 3');
  // Małe przesunięcie (gładzik) – bez zmiany.
  await page.mouse.wheel(0, -20);
  await page.waitForTimeout(300);
  await expectText(pages, 'Kartka 3 z 3');
  // Przyciski: wstecz dwa razy – pierwsza kartka, „wstecz” nieczynne; dalej – druga.
  await prev.click();
  await expectText(pages, 'Kartka 2 z 3');
  await waitUntil(flipHidden, 'Animacja skończona');
  await prev.click();
  await expectText(pages, 'Kartka 1 z 3');
  assert.equal(await prev.isDisabled(), true, 'pierwsza kartka – „wstecz” nieczynne');
  await waitUntil(flipHidden, 'Animacja skończona');
  await waitUntil(async () => (await darkest(page, ...at(450, 300), 12)) < 110, 'Kreska kartki 1');
  await next.click();
  await expectText(pages, 'Kartka 2 z 3');
  await waitUntil(flipHidden, 'Animacja skończona');
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-kartki-strzalki.png') });
  // Powiększenie (Ctrl + kółko): kółko przewija stronę, kartka ta sama.
  await page.mouse.move(...frame.screen(800, 550));
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -400);
  await page.keyboard.up('Control');
  await waitUntil(async () => (await editor.locator('[data-testid=drawing-zoom]').textContent()) !== '100%', 'Powiększenie');
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(300);
  await expectText(pages, 'Kartka 2 z 3');
  // Ograniczenie ruchu w systemie – kartka zmienia się bez animacji.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const before = await flips();
  await page.keyboard.press('PageUp');
  await expectText(pages, 'Kartka 1 z 3');
  await nextFrames(page);
  assert.equal(await flips(), before, 'bez animacji');
  assert.equal(await flipHidden(), true);
}, { device: DESKTOP });

test('rysunek 1.22 na telefonie: ‹ Kartka 2 z 2 › mieści się w pasku, przyciski przewracają kartki', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Telefon</p>');
  const pages = editor.locator('[data-testid=drawing-pages]');
  await pages.click();
  await page.locator('[data-testid=drawing-page-new]').click();
  await expectText(pages, 'Kartka 2 z 2');
  for (const name of ['drawing-page-prev', 'drawing-pages', 'drawing-page-next']) {
    const box = await editor.locator(`[data-testid=${name}]`).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `${name} w szerokości ekranu`);
  }
  const tops = await Promise.all(['drawing-page-prev', 'drawing-pages', 'drawing-page-next'].map(async (name) => Math.round((await editor.locator(`[data-testid=${name}]`).boundingBox()).y)));
  assert.equal(new Set(tops).size, 1, `w jednym wierszu (${tops})`);
  assert.equal(await overflowX(page), 0);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-kartki-telefon.png') });
  await editor.locator('[data-testid=drawing-page-prev]').tap();
  await expectText(pages, 'Kartka 1 z 2');
  await editor.locator('[data-testid=drawing-page-next]').tap();
  await expectText(pages, 'Kartka 2 z 2');
}, { device: PHONE });

// ---------------------------------------------------------------- 1.22.1: wymiary techniczne i symbole metrologiczne

test('rysunek 1.22.1: wymiar jak w rysunku technicznym – linia wymiarowa pod kształtem, uchwyt odsuwa ją (wzór dla następnych), piętro przy sąsiednim wymiarze; znak ⌀ i pasowanie, odchyłki; styl „50” (mm); zapis (iPad)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Wymiary</p>');
  const frame = await pageFrame(page);
  const { at } = frame;
  const dark = async (x, y, side = 8) => (await darkest(page, ...at(x, y), side)) < 110;
  const panel = editor.locator('[data-testid=drawing-shape-panel]');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const sheet = page.locator('dialog.sheet[open]').last();
  const deselect = async () => {
    await drawStroke(page, [[...at(1500, 1050), 0.5]]);
    await waitUntil(() => editor.locator('.drawing__selection').isHidden(), 'Odznaczony');
  };

  // Prostokąt 5 × 2 cm (220 × 88) od (300, 300); oko przy szerokości – linia wymiarowa 40 pod dolną krawędzią (388).
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-rect]').click();
  await drawStroke(page, segment(at(300, 300), at(520, 388), 10));
  await expectText(selectionCount, 'Prostokąt');
  await editor.locator('[data-testid=drawing-dim-width]').fill('5');
  await editor.locator('[data-testid=drawing-dim-width]').press('Enter');
  await editor.locator('[data-testid=drawing-dim-height]').fill('2');
  await editor.locator('[data-testid=drawing-dim-height]').press('Enter');
  await editor.locator('[data-testid=drawing-dim-eye-width]').click();
  await waitUntil(() => editor.locator('[data-testid=drawing-dim-grip-width]').isVisible(), 'Uchwyt przy widocznym wymiarze');
  await deselect();
  // Linia wymiarowa (y ≈ 428), linie pomocnicze przy końcach, groty – na rysunku po odznaczeniu.
  await waitUntil(() => dark(410, 428, 6), 'Linia wymiarowa 40 pod kształtem');
  assert.ok(await dark(301, 420, 6), 'linia pomocnicza przy lewym końcu');
  assert.ok(!(await dark(410, 470, 10)), 'pod linią wymiarową pusto');

  // Zaznaczony: uchwyt pola szerokości przeciągnięty o ok. 60 jednostek w dół – podgląd przerywany, po puszczeniu nowe odsunięcie.
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await drawStroke(page, [[...at(410, 340), 0.5]]);
  await expectText(selectionCount, 'Prostokąt');
  await waitUntil(() => editor.locator('[data-testid=drawing-dim-grip-width]').isVisible(), 'Uchwyt widoczny');
  const grip = await editor.locator('[data-testid=drawing-dim-grip-width]').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 60 * frame.scale, { steps: 6 });
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wymiar-przeciaganie-ipad.png') });
  await page.mouse.up();
  // Wysokość po włączeniu oka – to samo odsunięcie (wzór).
  await editor.locator('[data-testid=drawing-dim-eye-height]').click();
  await deselect();
  await waitUntil(() => dark(410, 488, 6), 'Linia wymiarowa odsunięta (ok. 100)');
  assert.ok(!(await dark(410, 428, 4)), 'w starym miejscu linii pusto');

  // Drugi prostokąt tuż obok (ta sama dolna krawędź) – jego szerokość na kolejnym piętrze.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-rect]').click();
  await drawStroke(page, segment(at(530, 330), at(640, 388), 10));
  await expectText(selectionCount, 'Prostokąt');
  await editor.locator('[data-testid=drawing-dim-eye-width]').click();

  // Styl „50”: pola w milimetrach.
  await deselect();
  await editor.locator('[data-testid=drawing-ruler]').click();
  await editor.locator('[data-testid=drawing-ruler-angle]').click();
  const rulerPanel = editor.locator('[data-testid=drawing-ruler-panel]');
  await rulerPanel.waitFor();
  await rulerPanel.locator('[data-testid=drawing-dim-style] .segmented__option', { hasText: '„50”' }).click();
  await page.keyboard.press('Escape');
  await waitUntil(() => rulerPanel.isHidden(), 'Panel linijki zamknięty');
  await editor.locator('[data-testid=drawing-ruler]').click();
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await drawStroke(page, [[...at(410, 340), 0.5]]);
  await expectText(selectionCount, 'Prostokąt');
  await expectValue(editor.locator('[data-testid=drawing-dim-width]'), '50');
  await expectText(editor.locator('.drawing__dim:not([hidden]) .drawing__dim-unit').first(), 'mm');

  // Znak i tolerancja: szerokość ⌀50 H7, wysokość 20 +0,1/−0,05.
  await editor.locator('[data-testid=drawing-dim-marks-width]').click();
  await expectText(sheet.locator('.sheet__title'), 'Szerokość – znak i tolerancja');
  await sheet.locator('.segmented__option', { hasText: '⌀' }).click();
  await sheet.locator('.segmented__option', { hasText: 'Pasowanie' }).click();
  await sheet.locator('[data-testid=drawing-dim-fit-H7]').click();
  await expectText(sheet.locator('[data-testid=drawing-dim-tol-preview]'), 'Na rysunku: ⌀50 H7');
  await sheetSubmit(page).click();
  await waitUntil(async () => (await page.locator('dialog.sheet[open]').count()) === 1, 'Okno zamknięte');
  await editor.locator('[data-testid=drawing-dim-marks-height]').click();
  await sheet.locator('.segmented__option', { hasText: 'Odchyłki' }).click();
  await sheet.locator('[data-testid=drawing-dim-tol-upper]').fill('-0,1');
  await sheet.locator('[data-testid=drawing-dim-tol-lower]').fill('0,05');
  await sheetSubmit(page).click();
  await expectText(sheet.locator('.form-message--error'), 'Odchyłka górna nie może być mniejsza od dolnej.');
  await sheet.locator('[data-testid=drawing-dim-tol-upper]').fill('+0,1');
  await sheet.locator('[data-testid=drawing-dim-tol-lower]').fill('-0,05');
  await expectText(sheet.locator('[data-testid=drawing-dim-tol-preview]'), 'Na rysunku: 20 +0,1 / −0,05');
  await sheetSubmit(page).click();
  await waitUntil(async () => (await page.locator('dialog.sheet[open]').count()) === 1, 'Okno zamknięte');
  await waitUntil(async () => (await editor.locator('[data-testid=drawing-dim-marks-height]').getAttribute('aria-pressed')) === 'true', 'Oznaczenie przy wysokości');
  await deselect();
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-wymiary-techniczne-ipad.png') });

  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  const [image] = await page.evaluate(async (id) => (await window.lexicards.library.noteImages(id)).map((item) => item.drawing), ids.statements);
  assert.equal(image.dimStyle, 'technical');
  const [first, second] = image.strokes;
  assert.deepEqual(first.dims, ['width', 'height']);
  assert.ok(first.dimOffsets.width >= 90 && first.dimOffsets.width <= 110, `odsunięcie po przeciągnięciu ok. 100 (${first.dimOffsets.width})`);
  assert.equal(first.dimOffsets.height, first.dimOffsets.width, 'wysokość – ten sam wzór');
  assert.equal(second.dimOffsets.width, first.dimOffsets.width + 36, 'sąsiedni wymiar – piętro dalej');
  assert.deepEqual(first.dimTols, { width: { prefix: '⌀', kind: 'fit', fit: 'H7' }, height: { kind: 'dev', upper: 0.1, lower: -0.05 } });
}, { device: IPAD });

test('rysunek 1.22.1: ramka tolerancji (pozycja, ⌀, Ⓜ, bazy A i B; płaskość – bez baz), znak bazy, chropowatość – wstawione dotknięciem krawędzi, przyklejone i za przesuniętym prostokątem; Esc – bez wstawiania; poprawka ramki; zapis (komputer)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { dialog, editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Symbole</p>');
  const frame = await pageFrame(page);
  const panel = editor.locator('[data-testid=drawing-shape-panel]');
  const selectionCount = editor.locator('[data-testid=drawing-selection-count]');
  const notice = editor.locator('[data-testid=drawing-notice]');
  const sheet = page.locator('dialog.sheet[open]').last();
  const drag = async (from, to) => {
    await page.mouse.move(...frame.screen(...from));
    await page.mouse.down();
    await page.mouse.move(...frame.screen(...to), { steps: 8 });
    await page.mouse.up();
  };
  const symbol = async (kind) => {
    await editor.locator('[data-testid=drawing-tool-shape]').click();
    await panel.locator(`[data-testid=drawing-symbol-${kind}]`).click();
    await sheet.waitFor();
  };
  const closed = () => waitUntil(async () => (await page.locator('dialog.sheet[open]').count()) === 1, 'Okno zamknięte');

  // Prostokąt 600–900 × 400–600.
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-rect]').click();
  await drag([600, 400], [900, 600]);
  await expectText(selectionCount, 'Prostokąt');

  // Ramka: płaskość – pola baz wyłączone; pozycja z ⌀, 0,05, Ⓜ, bazy a i B (wielkie litery).
  await symbol('gdt');
  await expectText(sheet.locator('.sheet__title'), 'Nowa ramka tolerancji');
  assert.equal(await sheet.locator('.drawing__gdt-symbol').count(), 14, '14 symboli ISO 1101');
  await sheet.locator('[data-testid=drawing-gdt-symbol-flatness]').click();
  await expectText(sheet.locator('[data-testid=drawing-gdt-name]'), 'Płaskość');
  assert.equal(await sheet.locator('[data-testid=drawing-gdt-datum-1]').isDisabled(), true, 'tolerancja kształtu – bez baz');
  await sheet.locator('[data-testid=drawing-gdt-symbol-position]').click();
  await expectText(sheet.locator('[data-testid=drawing-gdt-name]'), 'Pozycja');
  await sheetSubmit(page).click();
  await expectText(sheet.locator('.form-message--error'), 'Wpisz tolerancję');
  await sheet.locator('[data-testid=drawing-gdt-diameter]').click();
  await sheet.locator('[data-testid=drawing-gdt-value]').fill('0.05');
  await sheet.locator('[data-testid=drawing-gdt-modifier-M]').click();
  await sheet.locator('[data-testid=drawing-gdt-datum-1]').fill('a');
  await sheet.locator('[data-testid=drawing-gdt-datum-2]').fill('B');
  assert.equal(await sheet.locator('[data-testid=drawing-gdt-modifier-M]').getAttribute('aria-pressed'), 'true');
  assert.equal(await sheet.locator('[data-testid=drawing-gdt-datum-1]').inputValue(), 'A');
  await settled(sheet);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-ramka-tolerancji-okno.png') });
  await sheetSubmit(page).click();
  await closed();
  await expectText(notice, 'Dotknij krawędzi albo narożnika');
  // Najechanie myszą – znacznik; kliknięcie 4 jednostki obok prawej krawędzi – strzałka na krawędzi.
  await page.mouse.move(...frame.screen(904, 520));
  await page.mouse.click(...frame.screen(904, 520));
  await expectText(selectionCount, 'Pozycja');
  assert.equal(await editor.locator('[data-testid=drawing-selection-magnet]').isVisible(), true, 'magnes przy ramce');

  // Znak bazy: litera A (pierwsza wolna) – dotknięcie dolnej krawędzi.
  await symbol('datum');
  await expectValue(sheet.locator('[data-testid=drawing-datum-letter]'), 'A');
  await sheetSubmit(page).click();
  await closed();
  await expectText(notice, 'tam stanie trójkąt bazy');
  await page.mouse.click(...frame.screen(700, 603));
  await expectText(selectionCount, 'Baza A');
  // Następna baza – B; Anuluj – nic.
  await symbol('datum');
  await expectValue(sheet.locator('[data-testid=drawing-datum-letter]'), 'B');
  await sheet.locator('.sheet__header .button--plain').click();
  await closed();

  // Chropowatość: z usunięciem materiału, Ra 3,2 – na górnej krawędzi.
  await symbol('roughness');
  await sheet.locator('[data-testid=drawing-roughness-Ra32]').click();
  await expectValue(sheet.locator('[data-testid=drawing-roughness-text]'), 'Ra 3,2');
  await sheetSubmit(page).click();
  await closed();
  await expectText(notice, 'tam stanie wierzchołek');
  await page.mouse.click(...frame.screen(650, 398));
  await expectText(selectionCount, 'Chropowatość');

  // Esc w trakcie wskazywania – bez wstawiania.
  await symbol('gdt');
  await sheet.locator('[data-testid=drawing-gdt-value]').fill('0,2');
  await sheetSubmit(page).click();
  await closed();
  await expectText(notice, 'tam będzie strzałka ramki');
  await page.keyboard.press('Escape');
  await expectText(notice, 'Bez wstawiania symbolu');

  // Prostokąt przesunięty o (−100, +50): strzałka, trójkąt i wierzchołek idą za nim.
  await editor.locator('[data-testid=drawing-tool-select]').click();
  await page.mouse.click(...frame.screen(80, 1060));
  await page.mouse.click(...frame.screen(750, 500));
  await expectText(selectionCount, 'Prostokąt');
  await drag([750, 500], [650, 550]);
  await page.mouse.click(...frame.screen(80, 1060));
  await nextFrames(page);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-symbole-metrologiczne.png') });

  // Poprawka ramki: dotknięcie zaznaczonej – okno z wartościami, tolerancja 0,1; strzałka zostaje przyklejona.
  const saved = () => page.evaluate(async (id) => (await window.lexicards.library.noteImages(id))[0].drawing.strokes, ids.statements);
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  let strokes = await saved();
  assert.deepEqual(strokes.map((stroke) => stroke.tool), ['shape', 'gdt', 'datum', 'roughness']);
  const [rect, gdt, datum, rough] = strokes;
  const right = rect.x + rect.w / 2;
  const bottom = rect.y + rect.h / 2;
  const top = rect.y - rect.h / 2;
  assert.deepEqual([gdt.symbol, gdt.value, gdt.diameter, gdt.modifier, gdt.datums], ['position', '0,05', true, 'M', ['A', 'B']]);
  assert.ok(Math.abs(gdt.leader.x - right) < 0.05 && Math.abs(gdt.leader.y - (520 + 50)) < 3, `strzałka ramki na przesuniętej prawej krawędzi (${JSON.stringify(gdt.leader)})`);
  assert.equal(gdt.attach.leader.id, rect.id);
  assert.ok(gdt.x > right, 'ramka na prawo od prostokąta (prostopadle do krawędzi)');
  assert.ok(Math.abs(datum.leader.y - bottom) < 0.05 && datum.y > bottom, 'trójkąt bazy na dolnej krawędzi, kwadrat pod nią');
  assert.equal(datum.letter, 'A');
  assert.ok(Math.abs(rough.y - top) < 0.05 && Math.abs(rough.x - 550) < 3, `wierzchołek chropowatości na górnej krawędzi (${rough.x}, ${rough.y})`);
  assert.deepEqual([rough.text, rough.kind, rough.attach.tip.id], ['Ra 3,2', 'removal', rect.id]);

  // Edycja: ponownie edytor rysunku, dotknięcie ramki dwa razy – okno, nowa wartość.
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('.note-images__open').first().click();
  await menuItem(page, 'Edytuj rysunek');
  await editor.waitFor();
  await waitUntil(() => editor.locator('[data-testid=drawing-canvas]').evaluate((canvas) => canvas.width > 0), 'Płótno gotowe');
  await nextFrames(page);
  await editor.locator('[data-testid=drawing-tool-select]').click();
  const inFrame = [gdt.x + gdt.cells[0] + gdt.cells[1] / 2, gdt.y + gdt.height / 2];
  await page.mouse.click(...frame.screen(...inFrame));
  await expectText(selectionCount, 'Pozycja');
  await page.mouse.click(...frame.screen(...inFrame));
  await expectText(sheet.locator('.sheet__title'), 'Ramka tolerancji');
  await expectValue(sheet.locator('[data-testid=drawing-gdt-value]'), '0,05');
  await sheet.locator('[data-testid=drawing-gdt-value]').fill('0,1');
  await sheetSubmit(page).click();
  await closed();
  await editor.locator('[data-testid=drawing-done]').click();
  await editor.waitFor({ state: 'detached' });
  await dialog.locator('[data-testid=note-right]').click();
  await dialog.locator('[data-testid=note-text]').waitFor();
  strokes = await saved();
  assert.equal(strokes[1].value, '0,1');
  assert.deepEqual(strokes[1].attach, gdt.attach, 'po poprawce – nadal przyklejona');
}, { device: DESKTOP });

test('rysunek 1.22.1 na telefonie: okno ramki tolerancji i okno tolerancji wymiaru mieszczą się bez przewijania w bok', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const { editor } = await openDrawingEditorFromNote(page, ids.statements, '<p>Telefon</p>');
  const panel = editor.locator('[data-testid=drawing-shape-panel]');
  const sheet = page.locator('dialog.sheet[open]').last();
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-symbol-gdt]').click();
  await sheet.waitFor();
  const grid = await sheet.locator('.drawing__gdt-symbols').boundingBox();
  assert.ok(grid.x >= 0 && grid.x + grid.width <= 390, 'symbole w szerokości ekranu');
  assert.equal(await overflowX(page), 0, 'okno ramki bez przewijania w bok');
  await settled(sheet);
  await page.screenshot({ path: path.join(OUTPUT, 'rysunek-ramka-tolerancji-telefon.png') });
  await sheet.locator('.sheet__header .button--plain').click();
  await waitUntil(async () => (await page.locator('dialog.sheet[open]').count()) === 1, 'Okno zamknięte');
  await editor.locator('[data-testid=drawing-tool-shape]').click();
  await panel.locator('[data-testid=drawing-shape-rect]').click();
  await drawStroke(page, segment([0.3, 0.45], [0.7, 0.6], 10), { type: 'touch', id: 7 });
  await editor.locator('[data-testid=drawing-dim-marks-width]').click();
  await sheet.locator('.segmented__option', { hasText: 'Odchyłki' }).click();
  assert.equal(await overflowX(page), 0, 'okno tolerancji bez przewijania w bok');
}, { device: PHONE });

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
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const frontBox = await flashcard(page).boundingBox();

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
  // Fiszka po obrocie ma tę samą wielkość i położenie co przed obrotem.
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const backBox = await flashcard(page).boundingBox();
  assert.ok(Math.abs(backBox.height - frontBox.height) < 1 && Math.abs(backBox.y - frontBox.y) < 1,
    `ta sama wielkość fiszki: ${frontBox.height} → ${backBox.height}`);

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
  // liabilities: „Powtórz” bez kafelków przy pojęciu i definicji (brak przykładu) – nie zna pojęcia i definicji.
  assert.deepEqual(await scopes(), [
    'Wszystkie (6)', 'Nowe (3)', 'Do powtórki (1)', 'Częściowo zapamiętane (0)', 'Trudne (1)',
    'Nie znam pojęcia (1)', 'Nie znam definicji (1)', 'Nie znam przykładu (0)', 'Błędy z quizów (0)', 'Ulubione (1)', 'Losowe (6)'
  ]);
  await page.selectOption('[data-testid=study-scope]', 'unknownDescription');
  await expectText(page.locator('.field__hint').filter({ hasText: 'definicją' }), 'Pojęcia z definicją, której nie znałeś przy ostatniej ocenie w tym kierunku.');
  await page.selectOption('[data-testid=study-scope]', 'all');
  await choose(page, 'Kierunek nauki', 'PL → EN');
  assert.deepEqual(await scopes(), [
    'Wszystkie (6)', 'Nowe (6)', 'Do powtórki (0)', 'Częściowo zapamiętane (0)', 'Trudne (0)',
    'Nie znam pojęcia (0)', 'Nie znam definicji (0)', 'Nie znam przykładu (0)', 'Błędy z quizów (0)', 'Ulubione (1)', 'Losowe (6)'
  ]);
  await choose(page, 'Kierunek nauki', 'Mieszany');
  assert.deepEqual(await scopes(), [
    'Wszystkie (6)', 'Nowe (6)', 'Do powtórki (1)', 'Częściowo zapamiętane (0)', 'Trudne (1)',
    'Nie znam pojęcia (1)', 'Nie znam definicji (1)', 'Nie znam przykładu (0)', 'Błędy z quizów (0)', 'Ulubione (1)', 'Losowe (6)'
  ]);

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

test('status nauki: liczby na Starcie, jeden status przy pojęciu w glosariuszu i lekcji, filtr statusu i kierunku', async ({ open, context }) => {
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  // PL → EN: aktywa – „Umiem”, pasywa – „Powtórz” z pojęciem, zysk – „Powtórz” bez kafelków; reszta nowa.
  await openStudySetup(page);
  await startStudy(page);
  await assess(page, 'all', 'know');
  await assess(page, ['term'], 'repeat');
  await assess(page, [], 'repeat');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=study-start]').waitFor();

  await page.evaluate(() => { location.hash = '#/start'; });
  const count = (id) => page.locator(`[data-testid=start-count-${id}]`).textContent();
  await expectText(page.locator('[data-testid=start-count-new]'), '3');
  assert.deepEqual([await count('learning'), await count('due'), await count('mastered')], ['2', '0', '1']);
  await expectText(page.locator('.status-strip__cell--mastered'), '17%');
  await expectText(page.locator('[data-testid=start-direction]'), 'Kierunek: PL → EN – zmienisz go w Statystykach.');
  assert.match(await page.locator('.status-strip').getAttribute('aria-label'), /Nowe 3, W trakcie nauki 2, Do powtórki 0, Opanowane 1/);

  // Glosariusz: status przy każdym pojęciu w kierunku ze Statystyk.
  await page.evaluate(() => { location.hash = '#/library/glossary'; });
  const statusOf = (name) => termRows(page).filter({ hasText: name }).first().locator('[data-testid=term-status]');
  await expectText(statusOf('aktywa'), 'Opanowane');
  await expectText(statusOf('zysk'), 'Do nauki');
  await expectText(statusOf('umowa'), 'Nowe');
  await expectText(page.locator('[data-testid=glossary-status-note]'), 'Status w kierunku PL → EN.');

  // Filtr: „Do nauki” w PL → EN – tylko zysk.
  await page.getByRole('button', { name: 'Filtry i sortowanie' }).click();
  await page.selectOption('[data-testid=filter-status]', 'toLearn');
  await page.getByRole('button', { name: 'Zastosuj' }).click();
  await expectText(page.locator('[data-testid=glossary-count]'), '1 pojęcie');
  await expectText(page.locator('[data-testid=filter-summary]'), 'status „Do nauki”');
  // Ten sam status w EN → PL: nic; „Nowe” w EN → PL – wszystkie.
  await page.getByRole('button', { name: 'Filtry i sortowanie (aktywne)' }).click();
  await choose(page, 'Kierunek statusu', 'EN → PL');
  await page.getByRole('button', { name: 'Zastosuj' }).click();
  await expectText(page.locator('.empty__title'), 'Nic nie znaleziono');
  await page.getByRole('button', { name: 'Filtry i sortowanie (aktywne)' }).click();
  await page.selectOption('[data-testid=filter-status]', 'new');
  await page.getByRole('button', { name: 'Zastosuj' }).click();
  await expectText(page.locator('[data-testid=glossary-count]'), '6 pojęć');
  await expectText(page.locator('[data-testid=filter-summary]'), 'status w kierunku EN → PL');
  await expectText(page.locator('[data-testid=glossary-status-note]'), 'Status w kierunku EN → PL.');

  // Po dwóch minutach „zysk” (Again – wraca po minucie) czeka na powtórkę: znajdzie go filtr,
  // a przy pojęciu nadal widać tylko wynik ostatniej oceny.
  await page.clock.fastForward('02:00');
  await page.locator('[data-testid=filter-summary] button').click();
  await page.getByRole('button', { name: 'Filtry i sortowanie' }).click();
  await page.selectOption('[data-testid=filter-status]', 'due');
  await page.getByRole('button', { name: 'Zastosuj' }).click();
  await expectText(page.locator('[data-testid=glossary-count]'), '1 pojęcie');
  assert.equal((await statusOf('zysk').textContent()).trim(), 'Do nauki');
  assert.equal(await statusOf('zysk').locator('.status-chip').count(), 1, 'jeden status przy pojęciu');

  // Lekcja: te same oznaczenia.
  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.basicsID);
  await expectText(statusOf('aktywa'), 'Opanowane');
  assert.equal((await statusOf('zysk').textContent()).trim(), 'Do nauki');
}, { device: PHONE });

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

test('fiszki: stos – pod spodem następna fiszka; widać ją przy obrocie i wyrzuceniu; ostatnia bez stosu', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);
  const stack = page.locator('[data-testid=card-stack]');
  const first = stack.locator('.card-stack__layer--1');
  assert.equal(await stack.getAttribute('data-depth'), '2');
  await expectText(first.locator('.flashcard__text'), 'pasywa');
  assert.equal((await stack.locator('.card-stack__layer--2').textContent()).trim(), '', 'głębsza fiszka jest pusta');
  assert.equal(await stack.locator('.card-stack__layer button, .card-stack__layer [data-testid]').count(), 0, 'pod spodem nic nie da się nacisnąć');
  assert.equal(await first.getAttribute('aria-hidden'), 'true');
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const height = (await flashcard(page).boundingBox()).height;
  const top = await flashcard(page).boundingBox();
  const under = await first.boundingBox();
  assert.ok(under.y + under.height > top.y + top.height + 3, 'następna fiszka wystaje spod dolnej krawędzi');
  assert.ok(under.y + under.height <= top.y + top.height + 5, 'fiszki leżą blisko siebie (najwyżej 5 px)');
  assert.ok(under.width < top.width - 8, 'i jest nieco węższa');

  /** Co jest w punkcie fiszki (x – ułamek szerokości) w trakcie animacji zatrzymanej w podanej chwili. */
  const pointAt = (time, fraction) => page.evaluate(([moment, x]) => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = moment;
    }
    const box = document.querySelector('[data-testid=card-stack]').getBoundingClientRect();
    // Fiszki pod spodem są nieaktywne (inert, bez dotknięć); na czas sprawdzenia „widać” je dla elementFromPoint.
    const layers = [...document.querySelectorAll('.card-stack__layer')];
    for (const layer of layers) {
      layer.inert = false;
      layer.style.pointerEvents = 'auto';
    }
    const element = document.elementFromPoint(box.left + box.width * x, box.top + box.height * 0.45);
    for (const layer of layers) {
      layer.inert = true;
      layer.style.pointerEvents = '';
    }
    return element?.closest('.card-stack__layer') ? 'stack' : (element?.closest('[data-testid=flashcard]') ? 'card' : 'other');
  }, [time, fraction]);
  const resume = () => page.evaluate(() => { for (const animation of document.getAnimations()) animation.play(); });

  // Obrót (wokół pionowej osi fiszki): krawędzią do patrzącego – obok osi widać następną fiszkę.
  await page.click('[data-testid=card-flip]');
  assert.equal(await pointAt(168, 0.25), 'stack');
  await resume();
  await waitUntil(async () => (await side(page)) === 'back', 'Fiszka powinna się odwrócić');
  // Wyrzucenie: w połowie lotu w środku jest już następna fiszka, podniesiona na wierzch.
  await page.click('[data-testid=know-all]');
  await page.click('[data-testid=decide-know]');
  assert.equal(await pointAt(150, 0.8), 'stack', 'fiszka odlatuje w lewo – po prawej widać następną');
  await resume();
  await expectText(counter(page), '2 z 3');
  await expectText(page.locator('[data-testid=card-front] .flashcard__text'), 'pasywa');
  assert.equal(await flashcard(page).getAttribute('data-enter'), 'stack', 'następna fiszka jest już na miejscu – bez animacji wejścia');
  assert.equal(await stack.getAttribute('data-depth'), '1');
  await expectText(first.locator('.flashcard__text'), 'zysk');

  await assess(page, [], 'repeat');
  await expectText(counter(page), '3 z 3');
  await page.waitForFunction(() => document.getAnimations().length === 0);
  assert.equal(await stack.getAttribute('data-depth'), '0', 'ostatnia fiszka bez fiszek pod spodem');
  assert.equal(await stack.locator('.card-stack__layer').count(), 0);
  assert.ok(Math.abs((await flashcard(page).boundingBox()).height - height) < 1, 'fiszka ma tę samą wysokość przez całą sesję');

  // Cofnięcie: poprzednia fiszka wraca, a stos znów ma jedną fiszkę pod spodem.
  await page.click('[data-testid=study-undo]');
  await expectText(counter(page), '2 z 3');
  assert.equal(await stack.getAttribute('data-depth'), '1');
});

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

// ---------------------------------------------------------------- postęp i utrwalenie (1.2)

/** Wiersz listy lekcji albo modułów o podanej nazwie. */
const listRow = (page, name) => page.locator('.group .row').filter({ has: page.locator('.row__title', { hasText: new RegExp(`^${name}$`) }) });

/** Status „Opanowane” dla pierwszych `count` pojęć lekcji (kierunek PL → EN), zapisany jak po fiszkach. */
function masterTerms(page, lessonName, count) {
  return page.evaluate(async ([name, limit]) => {
    const { library } = window.lexicards;
    const lesson = [...library.maps.lessons.values()].find((item) => item.name === name);
    const now = Date.now();
    const records = library.listTerms(lesson.id).slice(0, limit).map((term) => ({
      id: crypto.randomUUID(), termID: term.id, lessonID: term.lessonID, moduleID: term.moduleID, domainID: term.domainID,
      direction: 'pl_en', reviewCount: 1, lastStatus: 'mastered', lastReviewedAt: new Date(now).toISOString(),
      schedule: { state: 'review', step: null, stability: 3, difficulty: 5, due: new Date(now + 2 * 864e5).toISOString(), lastReview: new Date(now).toISOString(), reps: 1, lapses: 0 }
    }));
    await library.adapter.commit({ puts: { progress: records }, deletes: {}, purgeTermIDs: [], clear: [] });
    await library.load();
  }, [lessonName, count]);
}

test('postęp na listach: pasek i „opanowane N%”, oznaczenie lekcji i modułu jako utrwalonych, poświata, moduł z lekcji', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await masterTerms(page, 'Financial Statements', 3);
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  await expectText(title(page), 'Finance');

  const statements = listRow(page, 'Financial Statements');
  await expectText(statements.locator('.row__subtitle'), '4 pojęcia, opanowane 75%');
  assert.equal(await statements.locator('[data-testid=mastery]').getAttribute('data-percent'), '75');
  assert.equal(await statements.locator('[data-testid=mastery]').getAttribute('aria-label'), 'opanowane 75%');
  const fillHeight = await statements.locator('.mastery-bar__fill').evaluate((fill) => fill.getBoundingClientRect().height / fill.parentElement.getBoundingClientRect().height);
  assert.ok(Math.abs(fillHeight - 0.75) < 0.05, `pasek wypełniony w 75% (jest ${fillHeight})`);
  await expectText(listRow(page, 'Investments').locator('.row__subtitle'), '2 pojęcia, opanowane 0%');

  // Lekcja oznaczona ręcznie: pełny pasek, „utrwalona”, zielona poświata.
  const investments = listRow(page, 'Investments');
  await page.getByRole('button', { name: 'Więcej poleceń: Investments' }).click();
  await menuItem(page, 'Oznacz jako utrwaloną');
  await expectText(page.locator('.toast').last(), 'Lekcja „Investments” jest utrwalona. Fiszki wrócą najwcześniej po miesiącu.');
  await expectText(investments.locator('.row__subtitle'), '2 pojęcia, utrwalona');
  assert.equal(await investments.locator('[data-testid=mastery]').getAttribute('data-consolidated'), 'true');
  assert.match(await investments.evaluate((row) => getComputedStyle(row).backgroundImage), /gradient/);
  assert.equal(await investments.evaluate((row) => row.classList.contains('row--consolidated')), true);
  assert.equal(await statements.evaluate((row) => row.classList.contains('row--consolidated')), false);

  // Moduł: utrwalony dopiero, gdy wszystkie lekcje są utrwalone.
  await page.goto(`${page.url().split('#')[0]}#/library/domain/${await page.evaluate((id) => window.lexicards.library.getModule(id).domainID, ids.module)}`);
  const finance = listRow(page, 'Finance');
  await expectText(finance.locator('.row__subtitle'), '3 lekcje, 8 pojęć, opanowane 63%');
  await page.getByRole('button', { name: 'Więcej poleceń: Finance' }).click();
  await menuItem(page, 'Oznacz jako utrwalony');
  await expectText(page.locator('.toast').last(), 'Moduł „Finance” jest utrwalony.');
  await expectText(finance.locator('.row__subtitle'), '3 lekcje, 8 pojęć, utrwalony');
  assert.equal(await finance.evaluate((row) => row.classList.contains('row--consolidated')), true);
  assert.equal(await page.evaluate((id) => window.lexicards.library.listLessons(id).every((lesson) => lesson.consolidatedAt), ids.module), true);

  // Cofnięcie jednej lekcji: moduł przestaje być utrwalony, lekcje utrwalone liczą się jako opanowane.
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń: Financial Ratios' }).click();
  await menuItem(page, 'Cofnij utrwalenie');
  await expectText(page.locator('.toast').last(), 'Cofnięto utrwalenie: Financial Ratios.');
  await expectText(listRow(page, 'Financial Ratios').locator('.row__subtitle'), '2 pojęcia, opanowane 0%');
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  assert.equal(await page.locator('dialog.menu[open]').getByRole('menuitem', { name: 'Oznacz jako utrwalony', exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  await page.goBack();
  await expectText(listRow(page, 'Finance').locator('.row__subtitle'), '3 lekcje, 8 pojęć, opanowane 75%');

  // Lekcja bez pojęć: nie ma czego utrwalić.
  await page.evaluate((id) => window.lexicards.library.createLesson({ name: 'Pusta' }, { existing: id }), ids.module);
  await page.goForward();
  await expectText(listRow(page, 'Pusta').locator('.row__subtitle'), '0 pojęć');
  await page.getByRole('button', { name: 'Więcej poleceń: Pusta' }).click();
  assert.equal(await page.locator('dialog.menu[open]').getByRole('menuitem', { name: 'Oznacz jako utrwaloną', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.ok((await overflowX(page)) <= 0);
});

test('utrwalenie znika samo: nowe pojęcie w lekcji i nowa lekcja w module; ekran lekcji – wiersz „Lekcja utrwalona” i „Cofnij”', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const base = page.url().split('#')[0];
  await page.goto(`${base}#/library/lesson/${ids.investments}`);
  await expectText(title(page), 'Investments');
  assert.equal(await page.locator('[data-testid=lesson-consolidated]').count(), 0);

  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Oznacz jako utrwaloną');
  const consolidatedRow = page.locator('[data-testid=lesson-consolidated]');
  await expectText(consolidatedRow, 'Lekcja utrwalona');
  await expectText(consolidatedRow, 'Fiszki wracają najwcześniej po miesiącu od ostatniej powtórki.');
  await page.click('[data-testid=lesson-unconsolidate]');
  await consolidatedRow.waitFor({ state: 'detached' });
  await expectText(page.locator('.toast').last(), 'Cofnięto utrwalenie: Investments.');
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Oznacz jako utrwaloną');
  await consolidatedRow.waitFor();

  // Nowe pojęcie: status znika z komunikatem, pojęcie jest nowe (bez postępów).
  await page.getByRole('button', { name: 'Dodaj pojęcie', exact: true }).click();
  await page.fill('[data-testid=term-pl]', 'obligacja');
  await page.fill('[data-testid=term-en]', 'bond');
  await saveSheet(page);
  await expectText(page.locator('.toast').filter({ hasText: 'nie jest' }), 'Lekcja „Investments” nie jest już utrwalona – doszło nowe pojęcie.');
  await consolidatedRow.waitFor({ state: 'detached' });
  const state = await page.evaluate((id) => {
    const { library } = window.lexicards;
    const term = library.listTerms(id).find((item) => item.termPL === 'obligacja');
    return { consolidated: library.isLessonConsolidated(id), progress: library.getProgress(term.id, 'pl_en') };
  }, ids.investments);
  assert.deepEqual(state, { consolidated: false, progress: null });

  // Edycja pojęcia nie zdejmuje statusu.
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Oznacz jako utrwaloną');
  await consolidatedRow.waitFor();
  await page.getByRole('button', { name: 'Więcej poleceń: obligacja' }).click();
  await menuItem(page, 'Edytuj');
  await page.fill('[data-testid=term-en]', 'bond (debt security)');
  await saveSheet(page);
  await expectText(termRows(page).filter({ hasText: 'obligacja' }), 'bond (debt security)');
  assert.equal(await consolidatedRow.count(), 1);

  // Nowa lekcja w module utrwalonym: moduł traci status, lekcje zostają utrwalone.
  await page.goto(`${base}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Oznacz jako utrwalony');
  await expectText(page.locator('.toast').last(), 'Moduł „Finance” jest utrwalony.');
  await page.getByRole('button', { name: 'Dodaj lekcję', exact: true }).click();
  await sheet(page).locator('[data-testid=lesson-name]').fill('Bonds');
  await saveSheet(page);
  await expectText(page.locator('.toast').filter({ hasText: 'nie jest' }), 'Moduł „Finance” nie jest już utrwalony – doszła nowa lekcja.');
  await expectText(listRow(page, 'Bonds').locator('.row__subtitle'), '0 pojęć');
  await expectText(listRow(page, 'Investments').locator('.row__subtitle'), 'utrwalona');
  assert.equal(await page.evaluate((id) => window.lexicards.library.isModuleConsolidated(id), ids.module), false);

  // Po ponownym otwarciu strony stan jest ten sam (IndexedDB).
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await expectText(listRow(page, 'Investments').locator('.row__subtitle'), '3 pojęcia, utrwalona');
});

test('lekcja utrwalona w nauce: fiszki wracają najwcześniej po okresie z Ustawień, nie są „Nowe”, termin w szczegółach', async ({ open, context }) => {
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await openStudySetup(page, `#/study/lesson/${ids.basicsID}`);
  await startStudy(page);
  for (let index = 0; index < 3; index += 1) await assess(page, 'all', 'know');
  await page.click('[data-testid=summary-done]');
  await page.waitForFunction(() => location.hash === '#/start');

  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.basicsID);
  await expectText(title(page), 'Podstawy');
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Oznacz jako utrwaloną');
  await expectText(page.locator('[data-testid=lesson-consolidated]'), 'Od 12 paź 2026');

  // Po 11 minutach zwykły FSRS dawałby powtórkę; lekcja utrwalona czeka miesiąc.
  await page.clock.fastForward('11:00');
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  const row = termRows(page).filter({ hasText: 'aktywa' });
  await row.locator('.term__toggle').click();
  await expectText(row.locator('.term__details'), '11 lis 2026 (za 30 dni) – lekcja utrwalona');
  await tab(page, 'Start');
  assert.equal(await page.locator('[data-testid=start-review]').count(), 0);

  // Zakresy nauki w module: pojęcia lekcji utrwalonej nie są „Nowe”, druga lekcja bez zmian.
  await openStudySetup(page, `#/study/module/${ids.financeID}`);
  const scopes = async () => (await page.locator('[data-testid=study-scope] option').allTextContents()).map((text) => text.trim());
  await waitUntil(async () => (await scopes()).includes('Wszystkie (5)'), 'Materiał: moduł Finanse');
  assert.ok((await scopes()).includes('Nowe (2)'), `zakresy: ${await scopes()}`);
  assert.ok((await scopes()).includes('Do powtórki (0)'));

  // Ustawienie okresu: „co 2 miesiące” – po 31 dniach jeszcze nic, po zmianie na miesiąc – powtórka.
  await page.evaluate(() => { location.hash = '#/settings'; });
  const select = page.locator('[data-testid=consolidated-review]');
  assert.equal(await select.inputValue(), '30');
  assert.deepEqual((await select.locator('option').allTextContents()).map((text) => text.trim()),
    ['co miesiąc', 'co 2 miesiące', 'co 3 miesiące', 'co pół roku', 'raz w roku']);
  await page.selectOption('[data-testid=consolidated-review]', '60');
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().consolidatedReviewDays === 60), 'Okres powinien się zapisać');
  await page.clock.setSystemTime(new Date('2026-11-13T10:00:00'));
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  assert.equal(await page.locator('[data-testid=consolidated-review]').inputValue(), '60');
  await tab(page, 'Start');
  assert.equal(await page.locator('[data-testid=start-review]').count(), 0);
  await page.evaluate(() => window.lexicards.library.updateSettings({ consolidatedReviewDays: 30 }));
  await expectText(page.locator('[data-testid=start-review]'), 'Powtórka na dziś (3 fiszki)');
  await page.click('[data-testid=start-review]');
  await expectText(counter(page), '1 z 3');
});

test('wersja 1.2: dziedziny sprzed aktualizacji dostają szare tło ikon jeden raz, wybrany potem kolor zostaje', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  // Stan jak po wersji 1.1: kolorowe dziedziny, ustawienia bez znacznika.
  await page.evaluate(async () => {
    const { library } = window.lexicards;
    const colors = ['blue', 'green'];
    const domains = library.listDomains().map((domain, index) => ({ ...domain, color: colors[index] }));
    const settings = { ...library.getSettings(), id: 'app' };
    delete settings.domainColorsGray;
    await library.adapter.commit({ puts: { domains, settings: [settings] }, deletes: {}, purgeTermIDs: [], clear: [] });
  });
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await tab(page, 'Biblioteka');
  const badges = () => page.locator('.badge').evaluateAll((items) => items.map((item) => [...item.classList].find((name) => name.startsWith('badge--') && name !== 'badge--large')));
  await waitUntil(async () => (await badges()).length > 0 && (await badges()).every((name) => name === 'badge--gray'), 'Ikony dziedzin powinny mieć szare tło');

  // Kolor wybrany w edycji dziedziny zostaje po ponownym otwarciu.
  await page.getByRole('button', { name: 'Więcej poleceń: Metrology' }).click();
  await menuItem(page, 'Edytuj');
  await sheet(page).locator('label.choice--color.badge--orange').click();
  await saveSheet(page);
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  const colors = await page.evaluate(() => Object.fromEntries(window.lexicards.library.listDomains().map((domain) => [domain.name, domain.color])));
  assert.deepEqual(colors, { 'Business English': 'gray', Metrology: 'orange' });
  await page.locator('.badge--orange').first().waitFor();
});

test('import: krok „Zatwierdź import” uprzedza o lekcjach, które przestaną być utrwalone; wynik o tym mówi', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.evaluate((id) => window.lexicards.library.setLessonConsolidated(id, true), ids.investments);
  const original = await readFile(path.join(ROOT, 'docs/samples/lexicards_sample.csv'), 'utf8');
  const file = path.join(OUTPUT, 'utrwalona.csv');
  await writeFile(file, `${original}Business English;Finance;Investments;obligacja;bond;;;;;\r\n`);

  await tab(page, 'Biblioteka');
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await menuItem(page, 'Import z pliku');
  await chooseImportFile(page, file);
  await expectText(stepTitle(page), 'Sprawdź odczyt pliku');
  await nextStep(page, 'Przypisz kolumny');
  await nextStep(page, 'Wybierz miejsce');
  await nextStep(page, 'Sprawdź dane');
  await nextStep(page, 'Przejrzyj pojęcia');
  await nextStep(page, 'Zatwierdź import');
  const warning = page.locator('[data-testid=import-unconsolidated]');
  await expectText(warning, 'Przestaną być utrwalone');
  await expectText(warning, 'Business English › Finance › Investments');
  assert.equal(await page.evaluate((id) => window.lexicards.library.isLessonConsolidated(id), ids.investments), true, 'przed importem bez zmian');
  await finishImport(page, 'Importuj 1 pojęcie');
  await expectText(page.locator('[data-testid=import-done]'), 'Zdjęto utrwalenie z 1 lekcji.');
  assert.equal(await page.evaluate((id) => window.lexicards.library.isLessonConsolidated(id), ids.investments), false);
});

test('utrwalone na końcu list lekcji i modułów; zmiana kolejności tylko w obrębie grup', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const base = page.url().split('#')[0];
  const titles = () => page.locator('.group .row .row__title').allTextContents().then((items) => items.map((item) => item.trim()));
  await page.goto(`${base}#/library/module/${ids.module}`);
  assert.deepEqual(await titles(), ['Financial Statements', 'Investments', 'Financial Ratios']);
  await page.getByRole('button', { name: 'Więcej poleceń: Investments' }).click();
  await menuItem(page, 'Oznacz jako utrwaloną');
  await waitUntil(async () => (await titles()).join() === 'Financial Statements,Financial Ratios,Investments', 'Utrwalona lekcja na końcu listy');
  await page.getByRole('button', { name: 'Więcej poleceń: Financial Statements' }).click();
  await menuItem(page, 'Oznacz jako utrwaloną');
  await waitUntil(async () => (await titles()).join() === 'Financial Ratios,Financial Statements,Investments', 'Utrwalone w swojej kolejności');

  // Zmiana kolejności: przesuwanie tylko wśród utrwalonych albo wśród pozostałych.
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Zmień kolejność lekcji');
  const up = (name) => page.getByRole('button', { name: `Przesuń wyżej: ${name}` });
  const down = (name) => page.getByRole('button', { name: `Przesuń niżej: ${name}` });
  assert.equal(await up('Financial Ratios').isDisabled(), true);
  assert.equal(await down('Financial Ratios').isDisabled(), true, 'nieutrwalona nie przejdzie między utrwalone');
  assert.equal(await up('Financial Statements').isDisabled(), true, 'utrwalona nie przejdzie nad nieutrwalone');
  await down('Financial Statements').click();
  await waitUntil(async () => (await up('Investments').isDisabled()), 'Investments na początku utrwalonych');
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await waitUntil(async () => (await titles()).join() === 'Financial Ratios,Investments,Financial Statements', 'Nowa kolejność utrwalonych');

  // Cofnięcie utrwalenia: lekcja wraca między nieutrwalone (według zapisanej kolejności).
  await page.getByRole('button', { name: 'Więcej poleceń: Financial Statements' }).click();
  await menuItem(page, 'Cofnij utrwalenie');
  await waitUntil(async () => (await titles()).join() === 'Financial Ratios,Financial Statements,Investments', 'Lekcja wraca wyżej');

  // Moduły w dziedzinie.
  const domainID = await page.evaluate((id) => window.lexicards.library.getModule(id).domainID, ids.module);
  await page.goto(`${base}#/library/domain/${domainID}`);
  assert.deepEqual(await titles(), ['Management', 'Finance', 'Negotiations']);
  await page.getByRole('button', { name: 'Więcej poleceń: Management' }).click();
  await menuItem(page, 'Oznacz jako utrwalony');
  await waitUntil(async () => (await titles()).join() === 'Finance,Negotiations,Management', 'Utrwalony moduł na końcu');
});

/** Przesuwa wiersz listy palcem w poziomie (dx) – zdarzenia dotyku przeglądarki. */
async function swipeRowBy(context, page, row, dx, { release = true, dy = 0 } = {}) {
  // Lista mogła się właśnie odświeżyć (np. po usunięciu) – położenie wiersza po ustaniu zmian.
  await page.waitForTimeout(350);
  const box = await waitUntil(() => row.boundingBox(), 'Wiersz na liście');
  const touch = await touchAt(context, page, box.x + box.width / 2, box.y + box.height / 2);
  await touch.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, 10);
  if (release) await touch.end();
  return touch;
}

test('lekcje i moduły: przesunięcie w prawo utrwala, w lewo usuwa; lekkie pyta, zdecydowane od razu (telefon)', async ({ open, context }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const base = page.url().split('#')[0];
  await page.goto(`${base}#/library/module/${ids.module}`);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((toast) => toast.remove()));
  const row = (name) => page.locator('.group .row', { has: page.locator('.row__title', { hasText: name }) });
  const lessonID = (name) => page.evaluate((lessonName) => [...window.lexicards.library.maps.lessons.values()].find((item) => item.name === lessonName)?.id ?? null, name);
  const consolidated = async (name) => page.evaluate((id) => window.lexicards.library.isLessonConsolidated(id), await lessonID(name));

  // Lekkie przesunięcie w lewo: pytanie o usunięcie; „Anuluj” – lekcja zostaje, wiersz wraca.
  await swipeRowBy(context, page, row('Investments'), -110);
  await expectText(page.locator('.alert__title'), 'Usunąć lekcję „Investments”?');
  await page.locator('dialog.alert[open]').getByRole('button', { name: 'Anuluj' }).click();
  await waitUntil(async () => (await row('Investments').getAttribute('class')).includes('row--swiping') === false, 'Wiersz wraca na miejsce');
  assert.ok(await lessonID('Investments'));

  // Zdecydowane przesunięcie w lewo (ponad pół wiersza): napis „Puść – usuń”, po puszczeniu – usunięta bez pytania.
  const holding = await swipeRowBy(context, page, row('Investments'), -260, { release: false });
  assert.equal(await row('Investments').getAttribute('data-swipe'), 'strong');
  const layer = page.locator('.swipe__layer--left.swipe__layer--shown');
  assert.equal(await layer.locator('.swipe__label--strong').isVisible(), true);
  await expectText(layer.locator('.swipe__label--strong'), 'Puść – usuń');
  // Warstwa w miejscu wiersza, ikona i napis widoczne obok prawej krawędzi (wiersz odsunięty w lewo).
  const [rowBox, layerBox, labelBox] = [await row('Investments').boundingBox(), await layer.boundingBox(), await layer.locator('.swipe__label--strong').boundingBox()];
  assert.ok(Math.abs(layerBox.y - (rowBox.y)) < 1 && Math.abs(layerBox.height - rowBox.height) < 1, 'warstwa pod wierszem');
  assert.ok(labelBox.x > rowBox.x + rowBox.width, 'napis po odsłoniętej stronie');
  await page.screenshot({ path: path.join(OUTPUT, 'przesuniecie-usun-telefon.png') });
  await holding.end();
  await page.locator('.toast', { hasText: 'Usunięto lekcję „Investments”.' }).waitFor();
  assert.equal(await page.locator('dialog.alert[open]').count(), 0, 'bez pytania');
  assert.equal(await lessonID('Investments'), null);
  // „Cofnij” w komunikacie: lekcja wraca na swoje miejsce; potem usuwamy ją jeszcze raz.
  const undo = page.locator('[data-testid=undo-toast]', { hasText: 'Investments' });
  assert.equal(await undo.locator('.toast__timer').count(), 1, 'pasek czasu do cofnięcia');
  await page.screenshot({ path: path.join(OUTPUT, 'cofnij-usuniecie-telefon.png') });
  await undo.getByRole('button', { name: 'Cofnij' }).click();
  await page.locator('.toast', { hasText: 'Przywrócono lekcję „Investments”.' }).waitFor();
  await waitUntil(async () => (await page.locator('.group .row .row__title').allTextContents()).map((item) => item.trim()).join()
    === 'Financial Statements,Investments,Financial Ratios', 'Lekcja wraca na swoje miejsce');
  await swipeRowBy(context, page, row('Investments'), -260);
  await waitUntil(async () => (await lessonID('Investments')) === null, 'Usunięta ponownie');

  // Lekkie przesunięcie w prawo: pytanie o utrwalenie, „Utrwal” – lekcja utrwalona.
  const light = await swipeRowBy(context, page, row('Financial Ratios'), 150, { release: false });
  assert.equal(await row('Financial Ratios').getAttribute('data-swipe'), 'light');
  const rightLayer = page.locator('.swipe__layer--right.swipe__layer--shown');
  await expectText(rightLayer.locator('.swipe__label--light'), 'Utrwal…');
  // Napis mieści się w odsłoniętej części wiersza (nie jest ucięty pod nim).
  const [labelRight, rowLeft] = [await rightLayer.locator('.swipe__label--light').boundingBox(), await row('Financial Ratios').boundingBox()];
  assert.equal(await rightLayer.evaluate((layer) => layer.classList.contains('swipe__layer--narrow')), false);
  assert.ok(labelRight.x + labelRight.width <= rowLeft.x, 'napis przed krawędzią wiersza');
  await page.screenshot({ path: path.join(OUTPUT, 'przesuniecie-utrwal-telefon.png') });
  await light.end();
  await expectText(page.locator('.alert__title'), 'Oznaczyć lekcję „Financial Ratios” jako utrwaloną?');
  await confirm(page);
  await waitUntil(() => consolidated('Financial Ratios'), 'Lekcja utrwalona po potwierdzeniu');

  // Zdecydowane w prawo na utrwalonej – cofnięcie od razu.
  await swipeRowBy(context, page, row('Financial Ratios'), 270);
  await waitUntil(async () => !(await consolidated('Financial Ratios')), 'Utrwalenie cofnięte bez pytania');
  assert.equal(await page.locator('dialog.alert[open]').count(), 0);

  // Za krótki ruch i ruch w pionie niczego nie robią; zwykłe dotknięcie otwiera lekcję.
  await swipeRowBy(context, page, row('Financial Statements'), 30);
  await swipeRowBy(context, page, row('Financial Statements'), 40, { dy: 120 });
  assert.equal(await page.locator('dialog.alert[open]').count(), 0);
  assert.equal(await consolidated('Financial Statements'), false);
  await row('Financial Statements').locator('.row__main').click();
  await page.locator('[data-testid=lesson-note-add], [data-testid=lesson-note]').first().waitFor();

  // Moduł w dziedzinie: zdecydowane w prawo – utrwalony od razu.
  const domainID = await page.evaluate((id) => window.lexicards.library.getModule(id).domainID, ids.module);
  await page.goto(`${base}#/library/domain/${domainID}`);
  await swipeRowBy(context, page, row('Management'), 270);
  await waitUntil(() => page.evaluate(() => {
    const { library } = window.lexicards;
    const module = [...library.maps.modules.values()].find((item) => item.name === 'Management');
    return library.isModuleConsolidated(module.id);
  }), 'Moduł utrwalony');
  // Pusty moduł nie ma czego utrwalić – komunikat zamiast działania.
  await page.evaluate((id) => window.lexicards.library.createModule({ name: 'Pusty moduł' }, { existing: id }), domainID);
  await swipeRowBy(context, page, row('Pusty moduł'), 270);
  await page.locator('.toast', { hasText: 'Moduł nie ma pojęć – nie ma czego utrwalić.' }).waitFor();
});

test('pojęcia w lekcji: przesunięcie w prawo – do ulubionych i z powrotem, w lewo – usuń (pytanie albo od razu, z „Cofnij”)', async ({ open, context }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/lesson/${ids.statements}`);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((toast) => toast.remove()));
  const row = (name) => page.locator('.terms > .term', { has: page.locator('.term__pl', { hasText: name }) });
  const term = (name) => page.evaluate((termPL) => [...window.lexicards.library.maps.terms.values()].find((item) => item.termPL === termPL) ?? null, name);
  const first = (await page.locator('.terms > .term .term__pl').first().textContent()).trim();

  // W prawo – od razu do ulubionych (bez pytania), drugi raz – z ulubionych.
  const holding = await swipeRowBy(context, page, row(first), 120, { release: false });
  const favoriteLayer = page.locator('.swipe__layer--right.swipe__layer--shown');
  await expectText(favoriteLayer.locator('.swipe__label--light'), 'Do ulubionych');
  // Złoto gwiazdki (--star) z ciemną ikoną.
  const colors = await favoriteLayer.evaluate((layer) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--star)';
    document.body.append(probe);
    const star = getComputedStyle(probe).color;
    probe.remove();
    return { background: getComputedStyle(layer).backgroundColor, star, text: getComputedStyle(layer).color };
  });
  assert.equal(colors.background, colors.star, 'kolor gwiazdki');
  assert.equal(colors.text, 'rgb(29, 29, 31)');
  await page.screenshot({ path: path.join(OUTPUT, 'przesuniecie-pojecie-ulubione-telefon.png') });
  await holding.end();
  await waitUntil(async () => (await term(first)).isFavorite === true, 'Pojęcie w ulubionych');
  assert.equal(await page.locator('dialog.alert[open]').count(), 0, 'bez pytania');
  assert.equal(await row(first).locator('.term__details').isVisible(), false, 'przesunięcie nie rozwija pojęcia');
  await swipeRowBy(context, page, row(first), 260);
  await waitUntil(async () => (await term(first)).isFavorite === false, 'Pojęcie z powrotem poza ulubionymi');

  // W lewo lekko – pytanie; „Anuluj” – zostaje. Zdecydowanie – od razu, „Cofnij” przywraca.
  await swipeRowBy(context, page, row(first), -110);
  await expectText(page.locator('.alert__title'), `Usunąć pojęcie „${first}”?`);
  await page.locator('dialog.alert[open]').getByRole('button', { name: 'Anuluj' }).click();
  assert.ok(await term(first));
  await swipeRowBy(context, page, row(first), -270);
  await waitUntil(async () => (await term(first)) === null, 'Pojęcie usunięte bez pytania');
  const undo = page.locator('[data-testid=undo-toast]', { hasText: `Usunięto pojęcie „${first}”.` });
  await undo.getByRole('button', { name: 'Cofnij' }).click();
  await waitUntil(async () => (await term(first)) !== null, 'Pojęcie przywrócone');
  await waitUntil(async () => (await row(first).count()) === 1, 'Pojęcie znowu na liście');

  // Ruch zaczęty na gwiazdce nie przesuwa wiersza; zwykłe dotknięcie rozwija pojęcie.
  await page.waitForTimeout(350);
  const star = await row(first).locator('.term__star').boundingBox();
  const touch = await touchAt(context, page, star.x + star.width / 2, star.y + star.height / 2);
  await touch.move(star.x + star.width / 2 - 200, star.y + star.height / 2, 10);
  await touch.end();
  assert.ok(await term(first), 'po ruchu od gwiazdki pojęcie zostaje');
  assert.equal(await page.locator('dialog.alert[open]').count(), 0);
  await row(first).locator('.term__toggle').click();
  await waitUntil(() => row(first).locator('.term__details').isVisible(), 'Pojęcie rozwinięte');
});

test('lista wyboru na komputerze (Chrome, Edge): rozwijana lista w stylu aplikacji, wybór kliknięciem', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  const select = page.locator('[data-testid=lessons-created-preset]');
  assert.equal(await select.evaluate((element) => getComputedStyle(element).appearance), 'base-select');
  await select.click();
  await waitUntil(() => select.evaluate((element) => element.matches(':open')), 'Lista rozwinięta');
  const picker = await select.evaluate((element) => {
    const style = getComputedStyle(element, '::picker(select)');
    return { radius: style.borderRadius, padding: style.paddingTop };
  });
  assert.deepEqual(picker, { radius: '14px', padding: '6px' });
  await page.getByRole('option', { name: 'Ostatnie 7 dni' }).click();
  await waitUntil(async () => (await select.inputValue()) === '7d', 'Wybrano „Ostatnie 7 dni”');
  await waitUntil(() => page.evaluate(() => !document.querySelector('[data-testid=lessons-created-preset]').matches(':open')), 'Lista zwinięta');
  await expectText(page.locator('.created-filter'), 'Ostatnie 7 dni');
}, { device: DESKTOP });

test('„Cofnij” po usunięciu wisi około minuty i znika sam; usunięcie z menu też można cofnąć', async ({ open, context }) => {
  await context.clock.install();
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  await page.goto(`${page.url().split('#')[0]}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń: Investments' }).click();
  await menuItem(page, 'Usuń');
  await confirm(page);
  const undo = page.locator('[data-testid=undo-toast]');
  await expectText(undo, 'Usunięto lekcję „Investments”.');
  await page.clock.fastForward('00:58');
  assert.equal(await undo.isVisible(), true, 'po 58 s nadal można cofnąć');
  await page.clock.fastForward('00:03');
  await waitUntil(async () => (await undo.count()) === 0, 'Po minucie komunikat znika');
  assert.equal(await page.evaluate((id) => window.lexicards.library.getLesson(id), ids.investments), null, 'lekcja zostaje usunięta');
});

test('ustawienie „Utrwalone na końcu listy”: wyłączone – utrwalone zostają na miejscu i przesuwają się z innymi', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const base = page.url().split('#')[0];
  const titles = () => page.locator('.group .row .row__title').allTextContents().then((items) => items.map((item) => item.trim()));
  await page.goto(`${base}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń: Financial Statements' }).click();
  await menuItem(page, 'Oznacz jako utrwaloną');
  await waitUntil(async () => (await titles()).join() === 'Investments,Financial Ratios,Financial Statements', 'Domyślnie utrwalona na końcu');

  await page.goto(`${base}#/settings`);
  const toggle = page.locator('[data-testid=consolidated-last]');
  assert.equal(await toggle.isChecked(), true);
  await toggle.uncheck();
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().consolidatedLast === false), 'Ustawienie zapisane');
  await page.goto(`${base}#/library/module/${ids.module}`);
  await waitUntil(async () => (await titles()).join() === 'Financial Statements,Investments,Financial Ratios', 'Utrwalona na swoim miejscu');

  // Zmiana kolejności obejmuje też utrwaloną.
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Zmień kolejność lekcji');
  assert.equal(await page.getByRole('button', { name: 'Przesuń niżej: Financial Statements' }).isDisabled(), false);
  await page.getByRole('button', { name: 'Przesuń niżej: Financial Statements' }).click();
  await waitUntil(async () => (await page.getByRole('button', { name: 'Przesuń niżej: Investments' }).isDisabled()) === false
    && (await page.getByRole('button', { name: 'Przesuń wyżej: Investments' }).isDisabled()), 'Investments na początku');
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await waitUntil(async () => (await titles()).join() === 'Investments,Financial Statements,Financial Ratios', 'Utrwalona przesunięta między nieutrwalone');

  // Ustawienie wraca z kopią zapasową (jest w ustawieniach).
  assert.equal((await page.evaluate(() => window.lexicards.library.exportAll({ media: false }))).settings[0].consolidatedLast, false);
});

test('„Zmień kolejność”: przełącznik „Utrwalone na końcu listy” nad listą – wyłączony pozwala przesuwać utrwalone między innymi', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const base = page.url().split('#')[0];
  const titles = () => page.locator('.group .row .row__title').allTextContents().then((items) => items.map((item) => item.trim()));
  const domainID = await page.evaluate(async (moduleID) => {
    const { library } = window.lexicards;
    await library.setModuleConsolidated(moduleID, true);
    return library.getModule(moduleID).domainID;
  }, ids.module);

  // Dziedzina: utrwalony moduł „Finance” na końcu; w trybie zmiany kolejności – przełącznik włączony.
  await page.goto(`${base}#/library/domain/${domainID}`);
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  // Od 1.10.7 ustawienia nie ma w menu „…” (tylko tutaj i w Ustawieniach).
  assert.ok(!(await page.locator('dialog.menu[open] [role=menuitem]').allTextContents()).some((item) => item.includes('Utrwalone na końcu listy')));
  await menuItem(page, 'Zmień kolejność modułów');
  const toggle = page.locator('[data-testid=reorder-consolidated-last]');
  assert.equal(await toggle.isChecked(), true);
  await expectText(page.locator('.group__footer').first(), 'Utrwalone moduły są pod pozostałymi i przesuwasz je tylko między sobą.');
  const before = await titles();
  assert.equal(before.at(-1), 'Finance', 'utrwalony na końcu');
  assert.equal(await page.getByRole('button', { name: 'Przesuń wyżej: Finance' }).isDisabled(), true, 'nie mija nieutrwalonych');
  await page.screenshot({ path: path.join(OUTPUT, 'zmiana-kolejnosci-przelacznik-wlaczony.png') });

  // Wyłączenie: to samo ustawienie co w Ustawieniach; utrwalony przesuwa się razem z innymi.
  await toggle.uncheck();
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().consolidatedLast === false), 'Ustawienie zapisane');
  await expectText(page.locator('.group__footer').first(), 'Utrwalone moduły przesuwasz razem z innymi.');
  assert.equal(await toggle.isChecked(), false);
  assert.ok(await page.getByRole('button', { name: 'Gotowe' }).isVisible(), 'tryb zmiany kolejności trwa');
  const order = await titles();
  const index = order.indexOf('Finance');
  const moveFinance = index > 0 ? 'Przesuń wyżej: Finance' : 'Przesuń niżej: Finance';
  assert.equal(await page.getByRole('button', { name: moveFinance }).isDisabled(), false);
  await page.getByRole('button', { name: moveFinance }).click();
  await waitUntil(async () => (await titles()).indexOf('Finance') === index + (index > 0 ? -1 : 1), 'Finance przesunięty między nieutrwalone');
  await page.screenshot({ path: path.join(OUTPUT, 'zmiana-kolejnosci-przelacznik-wylaczony.png') });
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await page.goto(`${base}#/settings`);
  assert.equal(await page.locator('[data-testid=consolidated-last]').isChecked(), false, 'Ustawienia pokazują ten sam stan');

  // Lista lekcji: przełącznik tylko wtedy, gdy są utrwalone lekcje.
  const plainModule = await page.evaluate((id) => {
    const { library } = window.lexicards;
    return [...library.maps.modules.values()].find((module) => module.id !== id && library.listLessons(module.id).length > 1).id;
  }, ids.module);
  await page.goto(`${base}#/library/module/${plainModule}`);
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Zmień kolejność lekcji');
  assert.equal(await toggle.count(), 0, 'bez utrwalonych – bez przełącznika');
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await page.goto(`${base}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Zmień kolejność lekcji');
  assert.equal(await toggle.isChecked(), false);
  await toggle.check();
  await waitUntil(() => page.evaluate(() => window.lexicards.library.getSettings().consolidatedLast === true), 'Włączone z listy lekcji');
});

/** Tytuły w grupie listy o danym tytule (np. „Dziedziny”, „Lekcje”). */
const listTitles = (page, heading) => page.locator('.group', { has: page.locator('.group__title', { hasText: heading }) })
  .locator('.row__title').allTextContents().then((items) => items.map((item) => item.trim()));

/** Środek uchwytu ≡ wiersza w trybie zmiany kolejności. */
async function gripCenter(page, name) {
  const box = await page.locator('.row--reorder', { hasText: name }).locator('.row__grip').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const rowBox = (page, name) => page.locator('.row--reorder', { hasText: name }).boundingBox();

test('biblioteka 1.16: kolejność dziedzin A–Z i Z–A (po polsku), zapamiętana i w kopii; „Ustaw ręcznie” – przeciąganie palcem za uchwyt (telefon)', async ({ open, context }) => {
  const page = await open();
  await loadSamples(page);
  await page.evaluate(async () => {
    const { library } = window.lexicards;
    for (const name of ['Ćwiczenia', 'Analiza', 'Zoologia', 'Ekonomia 10', 'Ekonomia 2']) await library.createDomain({ name });
  });
  await tab(page, 'Biblioteka');
  const names = () => listTitles(page, 'Dziedziny');
  const manual = ['Business English', 'Metrology', 'Ćwiczenia', 'Analiza', 'Zoologia', 'Ekonomia 10', 'Ekonomia 2'];
  const sortButton = page.locator('[data-testid=sort-domain]');
  await waitUntil(async () => (await names()).join() === manual.join(), 'Domyślnie kolejność ręczna');
  await expectText(sortButton, 'Ręcznie');

  // Menu: ręcznie (zaznaczone), A–Z, Z–A – bez daty (dziedziny jej nie pokazują) – i „Ustaw ręcznie”.
  await sortButton.click();
  const menu = page.locator('dialog.menu[open]');
  await expectText(menu.locator('.menu__title'), 'Kolejność dziedzin');
  assert.deepEqual(await menu.locator('[role=menuitemradio]').allTextContents(), ['Ręcznie', 'Nazwa A–Z', 'Nazwa Z–A']);
  assert.equal(await menu.locator('[data-testid=sort-domain-manual]').getAttribute('aria-checked'), 'true');
  assert.equal(await menu.locator('[data-testid=sort-domain-name]').getAttribute('aria-checked'), 'false');
  assert.equal(await menu.locator('[data-testid=sort-domain-arrange]').count(), 1);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((toast) => toast.remove()));
  await menu.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await page.screenshot({ path: path.join(OUTPUT, 'kolejnosc-menu-telefon.png') });
  await menu.locator('[data-testid=sort-domain-name]').click();
  const alphabetical = ['Analiza', 'Business English', 'Ćwiczenia', 'Ekonomia 2', 'Ekonomia 10', 'Metrology', 'Zoologia'];
  await waitUntil(async () => (await names()).join() === alphabetical.join(), 'A–Z: Ć po C, „Ekonomia 2” przed „Ekonomia 10”');
  await expectText(sortButton, 'A–Z');
  assert.equal(await sortButton.getAttribute('aria-label'), 'Kolejność dziedzin: nazwa a–z');
  await page.screenshot({ path: path.join(OUTPUT, 'kolejnosc-dziedziny-a-z-telefon.png') });

  // Zapamiętana po ponownym otwarciu; ręczna kolejność bez zmian.
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await waitUntil(async () => (await names()).join() === alphabetical.join(), 'A–Z po ponownym otwarciu');
  await sortButton.click();
  await page.locator('dialog.menu[open] [data-testid=sort-domain-name-desc]').click();
  await waitUntil(async () => (await names()).join() === [...alphabetical].reverse().join(), 'Z–A');
  await expectText(sortButton, 'Z–A');
  const stored = await page.evaluate(() => {
    const { library } = window.lexicards;
    return { order: library.listDomains().map((domain) => domain.name), sort: library.getSettings().listSort };
  });
  assert.deepEqual(stored.order, manual, 'kolejność ręczna zostaje zapisana');
  assert.deepEqual(stored.sort, { domain: 'name-desc', module: 'manual', lesson: 'manual' });
  // Wybór wraca z kopią zapasową (jest w ustawieniach).
  assert.deepEqual((await page.evaluate(() => window.lexicards.library.exportAll({ media: false }))).settings[0].listSort.domain, 'name-desc');

  // „Ustaw ręcznie – przeciągnij…”: kolejność ręczna i tryb zmiany kolejności z uchwytami.
  await sortButton.click();
  await page.locator('dialog.menu[open] [data-testid=sort-domain-arrange]').click();
  await page.getByRole('button', { name: 'Gotowe' }).waitFor();
  await waitUntil(async () => (await names()).join() === manual.join(), 'Tryb zmiany kolejności – kolejność ręczna');
  assert.equal(await page.evaluate(() => window.lexicards.library.getSettings().listSort.domain), 'manual');
  assert.equal(await page.locator('.row--reorder .row__grip').count(), manual.length, 'uchwyt w każdym wierszu');
  assert.equal(await page.getByRole('button', { name: 'Przesuń wyżej: Analiza' }).isVisible(), true, 'strzałki zostają');

  // Palcem za uchwyt: „Analiza” z czwartego miejsca na pierwsze; w trakcie – uniesiona, inne robią miejsce.
  const grip = await gripCenter(page, 'Analiza');
  const first = await rowBox(page, 'Business English');
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const touch = await touchAt(context, page, grip.x, grip.y);
  await touch.move(grip.x, first.y + 6, 10);
  await waitUntil(() => page.locator('.row--dragging', { hasText: 'Analiza' }).count(), 'Wiersz uniesiony');
  const lifted = await rowBox(page, 'Analiza');
  assert.ok(Math.abs(lifted.y - first.y) < 2, `wiersz idzie za palcem (góra ${lifted.y} ≈ ${first.y})`);
  await page.waitForTimeout(250);
  const shifted = await rowBox(page, 'Business English');
  assert.ok(Math.abs(shifted.y - (first.y + lifted.height)) < 2, 'pierwszy wiersz zrobił miejsce');
  assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, 'strona się nie przewinęła');
  await page.screenshot({ path: path.join(OUTPUT, 'kolejnosc-przeciaganie-telefon.png') });
  await touch.end();
  const dragged = ['Analiza', 'Business English', 'Metrology', 'Ćwiczenia', 'Zoologia', 'Ekonomia 10', 'Ekonomia 2'];
  await waitUntil(async () => (await names()).join() === dragged.join(), 'Analiza na pierwszym miejscu');
  assert.equal(await page.locator('.row--dragging').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.lexicards.library.listDomains().map((domain) => domain.name)), dragged, 'zapisane od razu');

  // Krótko w dół: „Business English” mija tylko „Metrology”.
  const second = await gripCenter(page, 'Business English');
  const height = (await rowBox(page, 'Business English')).height;
  const short = await touchAt(context, page, second.x, second.y);
  await short.move(second.x, second.y + height * 0.7, 6);
  await short.end();
  await waitUntil(async () => (await names()).slice(0, 3).join() === 'Analiza,Metrology,Business English', 'Przesunięcie o jedno miejsce');
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expectText(sortButton, 'Ręcznie');
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await waitUntil(async () => (await names()).slice(0, 3).join() === 'Analiza,Metrology,Business English', 'Po ponownym otwarciu');
});

test('biblioteka 1.16: lekcje i moduły według daty i nazwy (osobno dla poziomów), utrwalone na końcu; przeciąganie myszą tylko w obrębie grupy (komputer)', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const base = page.url().split('#')[0];
  // Daty utworzenia lekcji modułu „Finance” (w pamięci – jak w teście filtra daty).
  await page.evaluate((moduleID) => {
    const { library } = window.lexicards;
    const dates = { 'Financial Statements': [2026, 2, 1], Investments: [2026, 0, 15], 'Financial Ratios': [2026, 4, 10] };
    for (const lesson of library.listLessons(moduleID)) lesson.createdAt = new Date(...dates[lesson.name], 10).toISOString();
  }, ids.module);
  const lessons = () => listTitles(page, 'Lekcje');
  await page.goto(`${base}#/library/module/${ids.module}`);
  await waitUntil(async () => (await lessons()).join() === 'Financial Statements,Investments,Financial Ratios', 'Kolejność ręczna');

  const sortButton = page.locator('[data-testid=sort-lesson]');
  const choose = async (sort) => {
    await sortButton.click();
    await page.locator(`dialog.menu[open] [data-testid=sort-lesson-${sort}]`).click();
  };
  await sortButton.click();
  await expectText(page.locator('dialog.menu[open] .menu__title'), 'Kolejność lekcji');
  assert.deepEqual(await page.locator('dialog.menu[open] [role=menuitemradio]').allTextContents(),
    ['Ręcznie', 'Nazwa A–Z', 'Nazwa Z–A', 'Od najnowszych', 'Od najstarszych']);
  await page.locator('dialog.menu[open]').evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  await page.screenshot({ path: path.join(OUTPUT, 'kolejnosc-menu-lekcje-komputer.png') });
  await page.locator('dialog.menu[open] [data-testid=sort-lesson-newest]').click();
  await waitUntil(async () => (await lessons()).join() === 'Financial Ratios,Financial Statements,Investments', 'Od najnowszych');
  await expectText(sortButton, 'Najnowsze');
  await choose('oldest');
  await waitUntil(async () => (await lessons()).join() === 'Investments,Financial Statements,Financial Ratios', 'Od najstarszych');
  await expectText(sortButton, 'Najstarsze');
  await choose('name');
  await waitUntil(async () => (await lessons()).join() === 'Financial Ratios,Financial Statements,Investments', 'A–Z');

  // Utrwalone nadal na końcu – po posortowaniu reszty.
  await page.evaluate(async (moduleID) => {
    const { library } = window.lexicards;
    await library.setLessonConsolidated(library.listLessons(moduleID).find((lesson) => lesson.name === 'Financial Ratios').id, true);
  }, ids.module);
  await waitUntil(async () => (await lessons()).join() === 'Financial Statements,Investments,Financial Ratios', 'A–Z, utrwalona na końcu');
  await page.screenshot({ path: path.join(OUTPUT, 'kolejnosc-lekcje-a-z-komputer.png') });

  // Moduły mają własny wybór: dalej ręcznie; Z–A tylko dla modułów.
  const domainID = await page.evaluate((id) => window.lexicards.library.getModule(id).domainID, ids.module);
  await page.goto(`${base}#/library/domain/${domainID}`);
  const modules = () => listTitles(page, 'Moduły');
  await waitUntil(async () => (await modules()).join() === 'Management,Finance,Negotiations', 'Moduły – ręcznie');
  await expectText(page.locator('[data-testid=sort-module]'), 'Ręcznie');
  await page.locator('[data-testid=sort-module]').click();
  await page.locator('dialog.menu[open] [data-testid=sort-module-name-desc]').click();
  await waitUntil(async () => (await modules()).join() === 'Negotiations,Management,Finance', 'Moduły Z–A');
  assert.deepEqual(await page.evaluate(() => window.lexicards.library.getSettings().listSort), { domain: 'manual', module: 'name-desc', lesson: 'name' });

  // „Zmień kolejność lekcji” z menu „…” przełącza na ręczną.
  await page.goto(`${base}#/library/module/${ids.module}`);
  await page.getByRole('button', { name: 'Więcej poleceń', exact: true }).click();
  await menuItem(page, 'Zmień kolejność lekcji');
  await page.getByRole('button', { name: 'Gotowe' }).waitFor();
  assert.equal(await page.evaluate(() => window.lexicards.library.getSettings().listSort.lesson), 'manual');
  await waitUntil(async () => (await lessons()).join() === 'Financial Statements,Investments,Financial Ratios', 'Ręczna, utrwalona na końcu');

  // Myszą za uchwyt: „Investments” na górę.
  const grip = await gripCenter(page, 'Investments');
  const first = await rowBox(page, 'Financial Statements');
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x, first.y + 4, { steps: 8 });
  await waitUntil(() => page.locator('.row--dragging', { hasText: 'Investments' }).count(), 'Wiersz uniesiony');
  await page.screenshot({ path: path.join(OUTPUT, 'kolejnosc-przeciaganie-komputer.png') });
  await page.mouse.up();
  await waitUntil(async () => (await lessons()).join() === 'Investments,Financial Statements,Financial Ratios', 'Investments na górze');

  // Myszą za wiersz (bez uchwytu), daleko w dół: zatrzymuje się nad utrwaloną.
  let box = await rowBox(page, 'Investments');
  await page.mouse.move(box.x + 60, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height * 4, { steps: 10 });
  const clamped = await rowBox(page, 'Investments');
  const consolidated = await rowBox(page, 'Financial Ratios');
  assert.ok(clamped.y + clamped.height <= consolidated.y + 1, 'nie wchodzi na utrwaloną');
  await page.mouse.up();
  await waitUntil(async () => (await lessons()).join() === 'Financial Statements,Investments,Financial Ratios', 'Koniec swojej grupy');

  // Utrwalona sama w grupie – przeciągnięcie w górę nic nie zmienia; kliknięcie wiersza bez ruchu też nie.
  const lone = await gripCenter(page, 'Financial Ratios');
  await page.mouse.move(lone.x, lone.y);
  await page.mouse.down();
  await page.mouse.move(lone.x, lone.y - 200, { steps: 8 });
  await page.mouse.up();
  box = await rowBox(page, 'Financial Statements');
  await page.mouse.click(box.x + 60, box.y + box.height / 2);
  await page.waitForTimeout(300);
  assert.deepEqual(await lessons(), ['Financial Statements', 'Investments', 'Financial Ratios']);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.row--reorder[style*="translate"]').length), 0, 'wiersze na miejscach');

  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expectText(sortButton, 'Ręcznie');
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await waitUntil(async () => (await lessons()).join() === 'Financial Statements,Investments,Financial Ratios', 'Po ponownym otwarciu');
}, { device: DESKTOP });

/** Okres w oknie „Wybrany okres” (od 1.21.1): miesiąc z wyboru miesięcy i roku, dwa dni, „Pokaż”. */
async function pickRange(page, from, to) {
  const rangeSheet = page.locator('dialog[data-testid=range-sheet]');
  await rangeSheet.waitFor();
  const title = rangeSheet.locator('[data-testid=range-calendar-title]');
  for (const day of [from, to]) {
    const cell = rangeSheet.locator(`[data-testid="range-calendar-day-${day}"]`);
    if ((await cell.count()) === 0) {
      await title.click();
      const year = Number(day.slice(0, 4));
      for (let guard = 0; guard < 30; guard += 1) {
        const shown = Number((await title.textContent()).trim());
        if (shown === year) break;
        await rangeSheet.locator(`[data-testid=range-calendar-${shown > year ? 'prev' : 'next'}]`).click();
      }
      await rangeSheet.locator(`[data-testid=range-calendar-month-${Number(day.slice(5, 7))}]`).click();
    }
    await cell.click();
  }
  await rangeSheet.locator('button[type=submit]').click();
  await rangeSheet.waitFor({ state: 'detached' });
}

test('data utworzenia przy modułach i lekcjach; filtr daty w module, w lekcji i w glosariuszu', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  const ids = await sampleLessons(page);
  const base = page.url().split('#')[0];
  // Lekcja „Investments” i jej pojęcie „dywidenda” – sprzed miesięcy.
  const oldDay = await page.evaluate((moduleID) => {
    const { library } = window.lexicards;
    const old = new Date(2026, 0, 15, 10).toISOString();
    const lesson = library.listLessons(moduleID).find((item) => item.name === 'Investments');
    lesson.createdAt = old;
    for (const term of library.listTerms(lesson.id)) term.createdAt = old;
    const statements = library.listLessons(moduleID).find((item) => item.name === 'Financial Statements');
    library.listTerms(statements.id)[0].createdAt = old;
    return old;
  }, ids.module);
  const titles = () => page.locator('.group .row .row__title').allTextContents().then((items) => items.map((item) => item.trim()));

  await page.goto(`${base}#/library/module/${ids.module}`);
  await expectText(page.locator('.row', { hasText: 'Investments' }).locator('[data-testid=row-created]'), 'Utworzono 15 sty 2026');
  assert.equal(await page.locator('[data-testid=row-created]').count(), 3);
  await page.selectOption('[data-testid=lessons-created-preset]', '30d');
  await waitUntil(async () => (await titles()).join() === 'Financial Statements,Financial Ratios', 'Bez starej lekcji');
  await expectText(page.locator('.group__title', { hasText: 'Lekcje' }), 'Lekcje – 2 z 3');
  // Własny okres: tylko styczeń.
  await page.selectOption('[data-testid=lessons-created-preset]', 'range');
  await pickRange(page, '2026-01-01', '2026-01-31');
  await waitUntil(async () => (await titles()).join() === 'Investments', 'Tylko lekcja ze stycznia');
  // Filtr zostaje po powrocie z lekcji.
  await page.locator('.row', { hasText: 'Investments' }).locator('.row__main').click();
  await page.locator('[data-testid=search]').waitFor();
  await page.goBack();
  await waitUntil(async () => (await titles()).join() === 'Investments', 'Filtr pamiętany dla modułu');
  await page.selectOption('[data-testid=lessons-created-preset]', '');
  await waitUntil(async () => (await titles()).length === 3, 'Wszystkie lekcje');

  // Moduły w dziedzinie mają datę i filtr.
  const domainID = await page.evaluate((id) => window.lexicards.library.getModule(id).domainID, ids.module);
  await page.goto(`${base}#/library/domain/${domainID}`);
  assert.equal(await page.locator('[data-testid=row-created]').count(), 3);
  await page.selectOption('[data-testid=modules-created-preset]', 'today');
  await waitUntil(async () => (await titles()).length === 3, 'Moduły utworzone dziś');

  // Pojęcia lekcji: filtr daty obok wyszukiwania, data w szczegółach pojęcia.
  await page.goto(`${base}#/library/lesson/${ids.statements}`);
  const termCount = () => page.locator('.terms > .term').count();
  const all = await termCount();
  await page.selectOption('[data-testid=terms-created-preset]', '7d');
  await waitUntil(async () => (await termCount()) === all - 1, 'Bez starego pojęcia');
  await expectText(page.locator('.results .group__title'), `${all - 1} z ${all} pojęć`);
  await page.selectOption('[data-testid=terms-created-preset]', '');
  await page.locator('.term__toggle').first().click();
  await expectText(page.locator('.term__details-list').first(), 'Utworzono');

  // Glosariusz: okres w filtrach, opis filtra.
  await page.goto(`${base}#/library/glossary`);
  const total = await page.evaluate(() => window.lexicards.library.summary().terms);
  await page.getByRole('button', { name: 'Filtry i sortowanie' }).click();
  await page.selectOption('[data-testid=filter-created-preset]', 'range');
  await pickRange(page, '2026-01-01', '2026-01-31');
  await saveSheet(page);
  await expectText(page.locator('[data-testid=filter-summary]'), 'utworzone od 1 sty 2026 do 31 sty 2026');
  const expected = await page.evaluate((day) => [...window.lexicards.library.maps.terms.values()].filter((term) => term.createdAt === day).length, oldDay);
  assert.ok(expected >= 2 && expected < total);
  await waitUntil(async () => (await page.locator('.terms > .term').count()) === expected, `W glosariuszu ${expected} pojęć ze stycznia`);
  await page.screenshot({ path: path.join(OUTPUT, 'glosariusz-filtr-daty-telefon.png') });
});

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

test('słuchanie: „Słuchaj lekcji” z ekranu lekcji otwiera słuchanie z materiałem tej lekcji', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.basicsID);
  await page.locator('[data-testid=lesson-listen]').waitFor();
  // Na telefonie: nauka na całą szerokość, pod nią quiz i słuchanie obok siebie.
  const [study, quiz, listen] = await Promise.all(['lesson-study', 'lesson-quiz', 'lesson-listen']
    .map((id) => page.locator(`[data-testid=${id}]`).boundingBox()));
  assert.ok(quiz.y > study.y + study.height - 1 && Math.abs(quiz.y - listen.y) < 1 && listen.x > quiz.x, 'układ przycisków lekcji');
  await expectText(page.locator('[data-testid=lesson-listen]'), 'Słuchaj lekcji');
  await page.click('[data-testid=lesson-listen]');
  await page.locator('[data-testid=listen-start]').waitFor();
  assert.match(page.url(), /#\/study\/listen\/lesson\//);
  assert.equal(await page.locator('[data-testid=listen-domain]').inputValue(), ids.domainID);
  assert.equal(await page.locator('[data-testid=listen-module]').inputValue(), ids.financeID);
  assert.equal(await page.locator('.group--compact .row', { hasText: 'Podstawy' }).locator('input').isChecked(), true);
  await expectText(page.locator('[data-testid=listen-planned]'), '3 pojęcia');
});

test('nawigacja: wstecz i dalej jak w przeglądarce – z lekcji do słuchania i z powrotem, statystyki, po przeładowaniu', async ({ open }) => {
  const page = await open();
  const ids = await seedStudy(page);
  const back = page.locator('[data-testid=history-back]');
  const forward = page.locator('[data-testid=history-forward]');
  assert.equal(await back.isVisible(), false, 'na pierwszym ekranie nie ma dokąd wrócić');

  await page.evaluate((id) => { location.hash = `#/library/lesson/${id}`; }, ids.basicsID);
  await page.locator('[data-testid=lesson-listen]').waitFor();
  assert.equal(await back.isEnabled(), true);
  assert.equal(await forward.isDisabled(), true);

  // Lekcja → słuchanie → wstecz: z powrotem na lekcji (a nie na ekranie Nauka, jak strzałka „poziom wyżej”).
  await page.click('[data-testid=lesson-listen]');
  await page.locator('[data-testid=listen-start]').waitFor();
  await expectText(page.locator('.navbar__backlink'), 'Nauka');
  await back.click();
  await page.locator('[data-testid=lesson-listen]').waitFor();
  assert.match(page.url(), /#\/library\/lesson\//);
  assert.equal(await forward.isEnabled(), true);
  await forward.click();
  await page.locator('[data-testid=listen-start]').waitFor();
  assert.match(page.url(), /#\/study\/listen\/lesson\//);
  assert.equal(await forward.isDisabled(), true);

  // Statystyki: wstecz wraca do słuchania; nowy ekran po cofnięciu kasuje „dalej”.
  await page.evaluate((id) => { location.hash = `#/stats/lesson/${id}`; }, ids.basicsID);
  await waitUntil(() => page.url().includes('#/stats/lesson/'), 'Statystyki lekcji');
  await back.click();
  await page.locator('[data-testid=listen-start]').waitFor();
  assert.equal(await forward.isEnabled(), true);
  await page.evaluate(() => { location.hash = '#/quiz'; });
  await waitUntil(async () => page.url().endsWith('#/quiz') && await forward.isDisabled(), 'Po nowym ekranie „dalej” jest nieaktywne');

  // Po przeładowaniu strony historia ekranów działa dalej.
  await back.click();
  await page.locator('[data-testid=listen-start]').waitFor();
  await page.reload();
  await page.waitForSelector('#app[data-ready="true"]');
  await page.locator('[data-testid=listen-start]').waitFor();
  assert.equal(await back.isEnabled(), true);
  assert.equal(await forward.isEnabled(), true);
  await back.click();
  await page.locator('[data-testid=lesson-listen]').waitFor();
  await back.click();
  await waitUntil(async () => page.url().includes('#/start') || page.url().endsWith('/'), 'Pierwszy ekran');
  assert.equal(await back.isDisabled(), true, 'z pierwszego ekranu aplikacji nie wychodzi się wstecz');
});

test('menu poleceń: „Anuluj” po najechaniu i przy naciśnięciu jest nieprzezroczysty i czytelny', async ({ open }) => {
  const page = await open();
  await loadSamples(page);
  await page.goto(`${page.url().split('#')[0]}#/library`);
  await page.getByRole('button', { name: /Więcej poleceń/ }).first().click();
  const cancel = page.locator('dialog.menu[open] .menu__cancel');
  await cancel.waitFor();
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await cancel.hover();
  const hovered = await cancel.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert.doesNotMatch(hovered, /rgba|\/ 0?\.\d|\/ 0\b/, `tło „Anuluj” po najechaniu nieprzezroczyste: ${hovered}`);
  await page.mouse.down();
  const pressed = await cancel.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.mouse.up();
  assert.doesNotMatch(pressed, /rgba|\/ 0?\.\d|\/ 0\b/, `tło „Anuluj” przy naciśnięciu nieprzezroczyste: ${pressed}`);
  await page.locator('dialog.menu[open]').waitFor({ state: 'detached' });
}, { device: DESKTOP });

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

test('słuchanie: notatka lekcji przed pojęciami – po polsku, po angielsku albo obie wersje; „Dalej” przechodzi do pojęć', async ({ open, context }) => {
  await fakeSpeechForListening(context);
  await context.clock.install({ time: new Date('2026-10-12T10:00:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await page.evaluate((id) => window.lexicards.library.saveNote(id, {
    html: '<h3>Bilans</h3><p>Aktywa równają się pasywom. To ważne!</p><p>[[Obraz 1]]</p><hr data-page=""><ul><li>Kapitał własny</li></ul>',
    htmlEN: '<p>Assets equal liabilities.</p>',
    images: []
  }), ids.basicsID);
  await page.evaluate(() => window.lexicards.library.updateSettings({ listenDirection: 'pl_en', listenCount: 0, listenPause: 3 }));
  await openListening(page, ids);

  // Domyślnie bez notatki; opis mówi, że materiał ma notatkę.
  const notes = page.getByRole('radiogroup', { name: 'Notatka lekcji przed pojęciami' });
  assert.equal(await notes.getByRole('radio', { name: 'Nie' }).isChecked(), true);
  await expectText(page.locator('[data-testid=listen-note-info]'), 'Lekcja tego materiału ma notatkę');
  await expectText(page.locator('[data-testid=listen-planned]'), '3 pojęcia, ok. 1 min');
  await choose(page, 'Notatka lekcji przed pojęciami', 'PL + EN');
  await expectText(page.locator('[data-testid=listen-planned]'), '1 notatka i 3 pojęcia');

  await page.click('[data-testid=listen-start]');
  await page.locator('[data-testid=listen-player]').waitFor();
  await waitUntil(async () => {
    await page.clock.runFor(300);
    return (await page.locator('[data-testid=listen-player]').getAttribute('data-step')) === 'note';
  }, 'Czytanie notatki');
  await expectText(page.locator('[data-testid=listen-item]'), 'Notatka – Podstawy');
  await waitUntil(async () => {
    await page.clock.runFor(500);
    return page.locator('[data-testid=listen-done]').count();
  }, 'Słuchanie powinno dojść do końca', 30000);
  await expectText(page.locator('[data-testid=listen-summary]'), 'Odsłuchane pojęcia: 3 z 3.');
  const spoken = (await spokenTexts(page)).map(({ text, lang }) => `${lang} ${text}`);
  assert.deepEqual(spoken.slice(0, 8), [
    'pl-PL Zaczynamy. Notatka lekcji i 3 pojęcia.',
    'pl-PL Notatka do lekcji Podstawy.',
    'pl-PL Bilans',
    'pl-PL Aktywa równają się pasywom.',
    'pl-PL To ważne!',
    'pl-PL Kapitał własny',
    'en-US English version.',
    'en-US Assets equal liabilities.'
  ], 'notatka bez odwołań do obrazów i podziałów stron, potem wersja angielska');
  assert.ok(spoken[8].startsWith('pl-PL '), 'potem pierwsze pojęcie');
  assert.equal((await page.evaluate(() => window.lexicards.library.getSettings())).listenNote, 'both');

  // Tylko po angielsku; „Dalej” w trakcie notatki przechodzi od razu do pojęć.
  await page.click('[data-testid=listen-settings]');
  await notes.locator('.segmented__option', { hasText: /^EN$/ }).click();
  assert.equal(await notes.getByRole('radio', { name: 'EN', exact: true }).isChecked(), true);
  const before = (await spokenTexts(page)).length;
  await page.click('[data-testid=listen-start]');
  await waitUntil(async () => {
    await page.clock.runFor(100);
    return (await spokenTexts(page)).slice(before).some((item) => item.text === 'Assets equal liabilities.');
  }, 'Czytanie notatki po angielsku');
  await page.click('[data-testid=listen-next]');
  await waitUntil(async () => {
    await page.clock.runFor(300);
    return (await page.locator('[data-testid=listen-item]').textContent()).startsWith('Pojęcie 1 z 3');
  }, '„Dalej” przechodzi do pierwszego pojęcia');
  const second = (await spokenTexts(page)).slice(before).map(({ text, lang }) => `${lang} ${text}`);
  assert.deepEqual(second.slice(0, 3), ['pl-PL Zaczynamy. Notatka lekcji i 3 pojęcia.', 'pl-PL Notatka do lekcji Podstawy.', 'en-US Assets equal liabilities.']);
  assert.ok(!second.some((text) => text.includes('Aktywa równają')), 'bez wersji polskiej');
  await page.getByRole('button', { name: 'Zakończ', exact: true }).first().click();
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

test('słuchanie: dźwięk w tle podtrzymuje połączenie, przyciski systemu sterują, dziennik dźwięku', async ({ open, context }) => {
  await fakeSpeechForListening(context);
  // Atrapy: Media Session (przyciski na kierownicy, ekran blokady) i odtwarzanie elementu audio.
  await context.addInitScript(() => {
    window.mediaHandlers = {};
    window.audioEvents = [];
    window.MediaMetadata = class { constructor(init) { Object.assign(this, init); } };
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: {
        metadata: null,
        playbackState: 'none',
        setActionHandler(action, handler) {
          if (handler) window.mediaHandlers[action] = handler;
          else delete window.mediaHandlers[action];
        }
      }
    });
    window.HTMLMediaElement.prototype.play = function play() {
      window.audioEvents.push(`play loop=${this.loop}`);
      window.lastAudio = this;
      return Promise.resolve();
    };
    window.HTMLMediaElement.prototype.pause = function pause() { window.audioEvents.push('pause'); };
  });
  await context.clock.install({ time: new Date('2026-10-16T07:30:00') });
  const page = await open();
  const ids = await seedStudy(page);
  await page.evaluate(() => window.lexicards.library.updateSettings({ listenDirection: 'pl_en', listenCount: 0, listenPause: 8 }));
  await openListening(page, ids);
  assert.equal(await page.locator('[data-testid=listen-keep-audio]').isChecked(), true, 'domyślnie włączone');

  await page.click('[data-testid=listen-start]');
  const player = page.locator('[data-testid=listen-player]');
  await player.waitFor();
  // Cichy dźwięk w pętli rusza razem z czytaniem (w tym samym dotknięciu).
  assert.equal(await page.evaluate(() => window.audioEvents[0]), 'play loop=true');
  assert.match(await page.evaluate(() => window.lastAudio.src), /^blob:/);
  const session = () => page.evaluate(() => ({
    title: navigator.mediaSession.metadata?.title ?? null,
    artist: navigator.mediaSession.metadata?.artist ?? null,
    state: navigator.mediaSession.playbackState,
    actions: Object.keys(window.mediaHandlers).sort()
  }));
  // Kolejność pojęć jest losowa – opis porównujemy z pojęciem na ekranie.
  // Przyciski systemu: pauza, następne pojęcie, wznowienie (w trakcie zastanawiania się nad pierwszym).
  await waitUntil(async () => {
    await page.clock.runFor(100);
    return (await player.getAttribute('data-step')) === 'think';
  }, 'Po pojęciu – czas na zastanowienie');
  const first = (await page.locator('[data-testid=listen-text]').textContent()).trim();
  assert.deepEqual(await session(), { title: first, artist: 'Pojęcie 1 z 3', state: 'playing', actions: ['nexttrack', 'pause', 'play', 'previoustrack'] });
  await page.evaluate(() => window.mediaHandlers.pause());
  assert.equal(await player.getAttribute('data-phase'), 'paused');
  assert.equal(await page.evaluate(() => window.audioEvents.at(-1)), 'pause');
  assert.equal((await session()).state, 'paused');
  await page.evaluate(() => window.mediaHandlers.nexttrack());
  await expectText(page.locator('[data-testid=listen-player] .study__lesson'), 'Pojęcie 2 z 3');
  const second = (await page.locator('[data-testid=listen-text]').textContent()).trim();
  assert.notEqual(second, first);
  assert.deepEqual([(await session()).title, (await session()).artist], [second, 'Pojęcie 2 z 3']);
  await page.evaluate(() => window.mediaHandlers.play());
  assert.equal(await player.getAttribute('data-phase'), 'playing');
  assert.equal(await page.evaluate(() => window.audioEvents.at(-1)), 'play loop=true');
  await page.clock.runFor(1000);

  // Dziennik dźwięku: start słuchania, wypowiedzi z językiem i głosem, przyciski.
  await page.locator('[data-testid=listen-log] summary').click();
  const log = await page.locator('[data-testid=listen-log-text]').textContent();
  assert.match(log, /słuchanie {2}3 pojęcia, dźwięk w tle: tak/);
  assert.match(log, /mów {2}pl domyślny głos systemu „Zaczynamy\. 3 pojęcia\.”/);
  assert.ok(log.includes(`mów  pl domyślny głos systemu „${first}”`), log);
  assert.ok(log.includes(`mów  pl domyślny głos systemu „${second}”`), log);
  assert.match(log, /start\n|start$/m);
  assert.match(log, /przycisk {2}pause/);
  assert.match(log, /przycisk {2}nexttrack/);
  assert.equal(await page.locator('[data-testid=listen-log]').evaluate((element) => element.open), true, 'zostaje rozwinięty po kolejnym kroku');

  // Zakończenie: dźwięk w tle i przyciski systemu wyłączone.
  await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await page.locator('[data-testid=listen-start]').waitFor();
  assert.deepEqual((await session()).actions, []);
  assert.equal(await page.evaluate(() => window.audioEvents.at(-1)), 'pause');

  // Opcja wyłączona: bez dźwięku w tle.
  const before = await page.evaluate(() => window.audioEvents.length);
  await page.locator('[data-testid=listen-keep-audio]').uncheck();
  await page.click('[data-testid=listen-start]');
  await player.waitFor();
  assert.equal(await page.evaluate(() => window.audioEvents.length), before);
  assert.equal(await page.evaluate(() => window.lexicards.library.getSettings().listenKeepAudio), false);
});

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
  // Udawany mikrofon (sygnał testowy) do nagrywania notatek głosowych.
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
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
