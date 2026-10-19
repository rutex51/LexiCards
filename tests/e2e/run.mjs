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
  assert.deepEqual(notes.rows[0].cells, ['Domain', 'Module', 'Lesson', 'Note', 'Note EN', 'Image', 'Image label']);
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

  // Sekcje edytora: obrazy, pod nimi załączniki, na końcu tekst.
  assert.deepEqual(await dialog.locator('.note-editor > section > .form-group__title, .note-editor > section > .note-editor__text-head > .form-group__title').allTextContents(),
    ['Obrazy', 'Załączniki', 'Tekst']);
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
  // Lista sięga krawędzi ekranu, a pierwsza kolumna – marginesu treści; strona się nie poszerza.
  assert.deepEqual([tiles.left, tiles.right], [0, 390]);
  assert.equal(tiles.firstLeft, 16);
  assert.ok((await overflowX(page)) <= 0, 'strona bez przewijania w bok');
  // Kolejność kolumnami: pierwsza kolumna – 1. i 2. dziedzina, następna kolumna lekko wystaje.
  const columns = await page.locator('[data-testid=start-domains] > .tile').evaluateAll((items) => items.map((tile) => {
    const box = tile.getBoundingClientRect();
    return { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right) };
  }));
  assert.equal(columns[0].left, columns[1].left);
  assert.ok(columns[1].top > columns[0].top);
  assert.ok(columns[4].left < 390 && columns[4].right > 390, 'trzecia kolumna wystaje za krawędź');
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
  await page.fill('[data-testid=lessons-created-from]', '2026-01-01');
  await page.fill('[data-testid=lessons-created-to]', '2026-01-31');
  await page.locator('[data-testid=lessons-created-to]').dispatchEvent('change');
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
  await page.fill('[data-testid=filter-created-from]', '2026-01-01');
  await page.fill('[data-testid=filter-created-to]', '2026-01-31');
  await page.locator('[data-testid=filter-created-to]').dispatchEvent('change');
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
