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
  for (const hash of ['#/start', '#/library', '#/library/glossary', `#/library/lesson/${lessonID}`, '#/settings', '#/study']) {
    await page.goto(base + hash);
    await page.waitForFunction((expected) => location.hash === expected, hash);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
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
