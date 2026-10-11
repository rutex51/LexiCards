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

    // Kolejne otwarcie używa już nowego wydania; dane zostają.
    await page.reload();
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
