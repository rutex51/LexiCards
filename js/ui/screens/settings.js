// Ustawienia: wygląd, kopia zapasowa, przechowywanie danych, instalacja, dane przykładowe; od 1.45.2 zajęte miejsce
// i (tymczasowo) historia zmian w pigułce.

import {
  backupFileName, createBackup, createMediaArchive, isZipFile, mediaFileName, parseBackupText, restoreMedia, validateBackup
} from '../../core/backup.js';
import { CHANGELOG, CHANGELOG_SHOWN } from '../../core/changelog.js';
import {
  ACCENT_COLORS, CONSOLIDATED_REVIEW_OPTIONS, MAGIC_COLORS, MAGIC_FOLDER_COLORS, accentColor, consolidatedReviewDays, defaultMagicFolderColor, magicColor,
  magicFolderColor, nowISO
} from '../../core/model.js';
import {
  formatSize, joinList, plural, pluralAttachments, pluralDomains, pluralFiles, pluralForm, pluralImages, pluralLessons, pluralModules,
  pluralNotes, pluralTerms
} from '../../core/text.js';
import { loadSampleData, openExportSheet } from '../actions.js';
import { actionRow, checkRow, field, formGroup, group, segmented, selectInput, valueRow } from '../components.js';
import { alertDialog, confirmDialog, showError, toast } from '../dialogs.js';
import { h, onTap } from '../dom.js';
import { deliverFile, pickFiles } from '../files.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';
import {
  SPEECH_RATES, checkSpeech, describeCheck, forgetSilentVoices, listVoices, onVoicesChanged, silentVoice, speak, speechAvailable
} from '../speech.js';
import { measureUsage } from '../../core/usage.js';

const APPEARANCE_OPTIONS = [
  { value: 'system', label: 'Automatyczny' },
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' }
];

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function contentList(counts) {
  return joinList([
    pluralDomains(counts.domains),
    pluralModules(counts.modules),
    pluralLessons(counts.lessons),
    pluralTerms(counts.terms),
    counts.notes > 0 ? `${pluralNotes(counts.notes)} do lekcji` : null
  ].filter(Boolean));
}

/** „2 obrazy i 1 załącznik” (bez zer); przy braku obu – „bez obrazów i załączników”. */
function mediaList({ images, files }) {
  const parts = [images > 0 ? pluralImages(images) : null, files > 0 ? pluralAttachments(files) : null].filter(Boolean);
  return parts.length > 0 ? joinList(parts) : 'bez obrazów i załączników';
}

/** Komunikat o postępie długiej operacji (u dołu ekranu) – do aktualizacji i zamknięcia. */
function progressToast(text) {
  const element = toast(text, { duration: 24 * 60 * 60 * 1000 });
  return {
    update: (next) => { element.firstChild.textContent = next; },
    done: () => element.remove()
  };
}

/** Podsumowanie sprawdzenia wymowy: co zrobić dalej. */
function checkSummary(results) {
  if (results.every((result) => result.started && !result.replaced)) {
    return 'Oba głosy działają, także po zmianie języka. Jeśli mimo to nic nie słychać, sprawdź głośność multimediów i to, '
      + 'czy dźwięk nie trafia do słuchawek albo samochodu.';
  }
  if (results.some((result) => !result.started)) {
    return 'Syntezator nie odezwał się. Zamknij kartę LexiCards, otwórz ją ponownie i sprawdź jeszcze raz; '
      + 'pomaga też ustawienie „Domyślny głos systemu”.';
  }
  return 'Aplikacja sama przełącza się na głos zastępczy, ale lepiej wybrać inny głos w polu powyżej.';
}

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function isAppleMobile() {
  const agent = navigator.userAgent;
  // iPad w trybie „witryny na komputer” przedstawia się jako Mac z ekranem dotykowym.
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

export class SettingsScreen {
  constructor(ctx) {
    this.ctx = ctx;
    /** null – jeszcze nie sprawdzono, true/false – stan ochrony danych przed usunięciem. */
    this.persisted = null;
    this.disposed = false;
    /** Obrazy i załączniki opisane w notatkach, których plików nie ma na urządzeniu: { images, files, size } albo null. */
    this.missing = null;
    /** Trwa zapis albo przywracanie pliku – kolejne polecenie czeka. */
    this.busy = false;
    this.#checkMissing();
    /** Sprawdzenie wymowy: { results, finished, stop } albo null. */
    this.check = null;
    this.#checkPersistence();
    /** Zajęte miejsce (od 1.45.2): null – liczenie, { … } – wynik measureUsage, { error } – nie udało się. */
    this.usage = null;
    this.#measureUsage();
    /** Historia zmian – wszystkie wersje (true) albo tylko najnowsze. */
    this.allChanges = false;
    // Lista głosów systemu bywa dostępna dopiero po chwili.
    this.stopWatchingVoices = onVoicesChanged(() => { if (!this.disposed) this.ctx.refresh(); });
  }

  dispose() {
    this.disposed = true;
    this.stopWatchingVoices();
    this.#stopCheck();
  }

  /** Wygląd: motyw (automatyczny, jasny, ciemny) i kolor aplikacji – niezależnie od siebie. */
  #appearanceGroup() {
    const { ctx } = this;
    const { library } = ctx;
    const settings = library.getSettings();
    const accent = accentColor(settings);
    const magic = magicColor(settings);
    const folder = magicFolderColor(settings);
    const folderDefault = !MAGIC_FOLDER_COLORS.some((item) => item.id === settings.magicFolderColor);
    const save = async (patch) => {
      try {
        await library.updateSettings(patch);
        ctx.applyAppearance();
      } catch (error) {
        await showError(error);
      }
    };
    return h('section', { class: 'group settings-appearance' },
      h('h2', { class: 'group__title' }, 'Wygląd'),
      segmented({
        name: 'appearance',
        label: 'Wygląd',
        value: settings.appearance,
        options: APPEARANCE_OPTIONS,
        onChange: (value) => save({ appearance: value })
      }),
      h('div', { class: 'accent-picker' },
        h('span', { class: 'accent-picker__label', id: 'accent-label' }, 'Kolor'),
        h('div', { class: 'accent-picker__options', role: 'radiogroup', 'aria-labelledby': 'accent-label' },
          ACCENT_COLORS.map((item) => h('label', {
            class: 'choice choice--color accent-picker__option',
            style: { '--badge': `var(--tone-${item.id}-fill)` },
            title: item.label
          },
          h('input', {
            type: 'radio', name: 'accent-color', value: item.id, checked: item.id === accent,
            dataset: { testid: `accent-${item.id}` },
            onChange: () => save({ accentColor: item.id })
          }),
          h('span', { class: 'choice__check', 'aria-hidden': 'true' }, icon('check', { size: 18 })),
          h('span', { class: 'visually-hidden' }, item.label))))),
      h('p', { class: 'group__footer', dataset: { testid: 'accent-name' } },
        `${ACCENT_COLORS.find((item) => item.id === accent).label}. Kolor przycisków, zaznaczeń i linków `
        + 'w jasnym i ciemnym motywie; wykresy w Statystykach zostają w swoich kolorach.'),
      // Od 1.62: kolor szybkiej fiszki – fiolet, złoto albo turkus.
      h('div', { class: 'accent-picker' },
        h('span', { class: 'accent-picker__label', id: 'magic-color-label' }, 'Szybka fiszka'),
        h('div', { class: 'accent-picker__options', role: 'radiogroup', 'aria-labelledby': 'magic-color-label' },
          MAGIC_COLORS.map((item) => h('label', {
            class: 'choice choice--color accent-picker__option',
            style: { '--badge': `var(--magic-swatch-${item.id})` },
            title: item.label
          },
          h('input', {
            type: 'radio', name: 'magic-color', value: item.id, checked: item.id === magic,
            dataset: { testid: `magic-color-${item.id}` },
            onChange: () => save({ magicColor: item.id })
          }),
          h('span', { class: 'choice__check', 'aria-hidden': 'true' }, icon('check', { size: 18 })),
          h('span', { class: 'visually-hidden' }, item.label))))),
      h('p', { class: 'group__footer', dataset: { testid: 'magic-color-name' } },
        `${MAGIC_COLORS.find((item) => item.id === magic).label}. Kolor fragmentów notatki wysłanych na szybką fiszkę, `
        + 'samej fiszki i iskier.'),
      // Od 1.62.1: kolor teczki – bez własnego wyboru zależny od koloru fiszki (przy złocie szara).
      h('div', { class: 'accent-picker' },
        h('span', { class: 'accent-picker__label', id: 'magic-folder-label' }, 'Teczka'),
        h('div', { class: 'accent-picker__options', role: 'radiogroup', 'aria-labelledby': 'magic-folder-label' },
          MAGIC_FOLDER_COLORS.map((item) => h('label', {
            class: `choice choice--color accent-picker__option accent-picker__option--${item.id}`,
            style: { '--badge': `var(--magic-folder-swatch-${item.id})` },
            title: item.label
          },
          h('input', {
            type: 'radio', name: 'magic-folder-color', value: item.id, checked: item.id === folder,
            dataset: { testid: `magic-folder-color-${item.id}` },
            // Wybór równy domyślnemu – bez zapisu koloru (teczka dalej dopasowuje się do koloru fiszki).
            onChange: () => save({ magicFolderColor: item.id === defaultMagicFolderColor(settings) ? null : item.id })
          }),
          h('span', { class: 'choice__check', 'aria-hidden': 'true' }, icon('check', { size: 18 })),
          h('span', { class: 'visually-hidden' }, item.label))))),
      h('p', { class: 'group__footer', dataset: { testid: 'magic-folder-color-name' } },
        `${MAGIC_FOLDER_COLORS.find((item) => item.id === folder).label}`
        + `${folderDefault ? (magic === 'gold' ? ' (domyślna przy złotej fiszce)' : ' (domyślna)') : ''}. `
        + 'Teczka szybkich fiszek w oknie notatki i na ekranach Biblioteki.')
    );
  }

  /** Biblioteka: kolejność utrwalonych lekcji i modułów na listach (od 1.9). */
  #libraryGroup() {
    const { library } = this.ctx;
    return group({
      title: 'Listy lekcji i modułów',
      footer: 'Włączone: utrwalone lekcje i moduły są pod pozostałymi, a kolejność zmieniasz osobno w obu częściach listy. '
        + 'Wyłączone: zostają tam, gdzie je ustawisz, i przesuwasz je razem z innymi.'
    },
      checkRow({
        checked: library.getSettings().consolidatedLast !== false,
        title: 'Utrwalone na końcu listy',
        testID: 'consolidated-last',
        onChange: async (value) => {
          try {
            await library.updateSettings({ consolidatedLast: value });
          } catch (error) {
            await showError(error);
          }
        }
      })
    );
  }

  /** Ekran Nauka (od 1.20): grupy „Powtórka na dziś” i „Ostatnia sesja” można ukryć – są też na Starcie. */
  #studyGroup() {
    const { library } = this.ctx;
    const settings = library.getSettings();
    const save = async (patch) => {
      try {
        await library.updateSettings(patch);
      } catch (error) {
        await showError(error);
      }
    };
    return group({
      title: 'Ekran Nauka',
      footer: 'Powtórkę na dziś i ostatnią sesję znajdziesz też na ekranie Start – tam zostają zawsze.'
    },
      checkRow({
        checked: settings.studyShowReview !== false,
        title: 'Pokazuj „Powtórka na dziś”',
        testID: 'study-show-review',
        onChange: (value) => save({ studyShowReview: value })
      }),
      checkRow({
        checked: settings.studyShowLast !== false,
        title: 'Pokazuj „Ostatnia sesja”',
        testID: 'study-show-last',
        onChange: (value) => save({ studyShowLast: value })
      })
    );
  }

  /** Dźwięki (od 1.31): fiszka odlatująca po decyzji i przewracana kartka notatki i rysunku. */
  #soundGroup() {
    const { library } = this.ctx;
    return group({
      title: 'Dźwięki',
      footer: 'Szum odlatującej fiszki i szelest przewracanej kartki (notatka, rysunek) – trwa tyle, co przewracanie. '
        + 'Dźwięki są w aplikacji – działają bez internetu; grają z głośnością multimediów.'
    },
      checkRow({
        checked: library.getSettings().sounds !== false,
        title: 'Dźwięki fiszek i kartek',
        testID: 'sounds',
        onChange: async (value) => {
          try {
            await library.updateSettings({ sounds: value });
          } catch (error) {
            await showError(error);
          }
        }
      })
    );
  }

  /** Powtórki FSRS: docelowa skuteczność, czyli jak często fiszki wracają. */
  #reviewGroup() {
    const { library } = this.ctx;
    const current = Number(library.getSettings().desiredRetention) || 0.9;
    const options = [
      { value: '0.8', label: '80% – rzadsze powtórki' },
      { value: '0.85', label: '85%' },
      { value: '0.9', label: '90% – zalecane' },
      { value: '0.95', label: '95% – częstsze powtórki' }
    ];
    return h('div', { class: 'settings-review' },
      formGroup('Powtórki',
        field('Lekcje utrwalone', selectInput({
          value: String(consolidatedReviewDays(library.getSettings())),
          testID: 'consolidated-review',
          options: CONSOLIDATED_REVIEW_OPTIONS.map((option) => ({ value: String(option.days), label: option.label })),
          onChange: async (value) => {
            try {
              await library.updateSettings({ consolidatedReviewDays: Number(value) });
            } catch (error) {
              await showError(error);
            }
          }
        })),
        field('Docelowa skuteczność', selectInput({
          value: options.some((option) => Number(option.value) === current) ? String(current) : '0.9',
          testID: 'desired-retention',
          options,
          onChange: async (value) => {
            try {
              await library.updateSettings({ desiredRetention: Number(value) });
            } catch (error) {
              await showError(error);
            }
          }
        }))
      ),
      h('p', { class: 'form-note' },
        'Lekcje utrwalone to te, które oznaczysz ręcznie (menu „…” lekcji albo modułu): ich fiszki wracają najwcześniej '
        + 'po tym czasie od ostatniej powtórki albo od oznaczenia. Fiszka, której nie pamiętasz, wraca jak zwykle, '
        + 'a nowe pojęcie w lekcji zdejmuje oznaczenie. '
        + 'Docelowa skuteczność to szansa, że w dniu powtórki będziesz pamiętać fiszkę – wyższa oznacza częstsze powtórki. '
        + 'Terminy wyznacza algorytm FSRS-6, osobno dla PL → EN i EN → PL.')
    );
  }

  #speechGroup() {
    const { ctx } = this;
    const { library } = ctx;
    if (!speechAvailable()) {
      return group({ title: 'Wymowa', footer: 'Ta przeglądarka nie udostępnia syntezatora mowy, więc przyciski wymowy są ukryte.' });
    }
    const settings = library.getSettings();
    const save = async (patch) => {
      try {
        await library.updateSettings(patch);
      } catch (error) {
        await showError(error);
      }
    };
    const voiceField = (label, language, key, sample) => {
      const voices = listVoices(language);
      const current = voices.some((voice) => voice.voiceURI === settings[key]) ? settings[key] : '';
      const silent = silentVoice(language, settings);
      return [
        field(label, selectInput({
          value: current,
          testID: `voice-${language}`,
          options: [
            { value: '', label: voices.length > 0 ? 'Domyślny głos systemu' : 'Domyślny (brak listy głosów)' },
            ...voices.map((voice) => ({ value: voice.voiceURI, label: `${voice.name} (${voice.lang})` }))
          ],
          onChange: async (value) => {
            this.#stopCheck();
            // Ponownie wybrany głos dostaje nową szansę.
            if (value) forgetSilentVoices(value);
            await save({ [key]: value || null });
            speak(sample, language, library.getSettings());
          }
        })),
        silent ? h('p', { class: 'form-message form-message--warning', role: 'status', dataset: { testid: `voice-${language}-silent` } },
          icon('warning', { size: 18 }),
          h('span', null, `Głos „${silent}” nie odzywa się w tej przeglądarce – zamiast niego czyta głos zastępczy. Wybierz inny głos.`)) : null
      ];
    };

    return h('div', { class: 'settings-speech' },
      formGroup('Wymowa',
        field('Szybkość czytania', selectInput({
          value: String(SPEECH_RATES.some((rate) => rate.value === settings.speechRate) ? settings.speechRate : 1),
          testID: 'speech-rate',
          options: SPEECH_RATES.map((rate) => ({ value: String(rate.value), label: rate.label })),
          onChange: (value) => save({ speechRate: Number(value) })
        })),
        voiceField('Głos polski', 'pl', 'preferredVoicePL', 'Dzień dobry, to jest próbka głosu.'),
        voiceField('Głos angielski', 'en', 'preferredVoiceEN', 'Hello, this is a voice sample.')
      ),
      h('p', { class: 'form-note' }, 'Głosy pochodzą z systemu urządzenia; nic nie jest wysyłane do internetu. Po wybraniu głosu usłyszysz próbkę.'),
      this.#checkView()
    );
  }

  /** „Sprawdź wymowę”: polski, angielski i znowu polski – jak w słuchaniu, z wynikiem każdego kroku. */
  #checkView() {
    const check = this.check;
    const running = Boolean(check && !check.finished);
    const results = check?.results ?? [];
    return h('div', { class: 'speech-check' },
      onTap(h('button', {
        type: 'button', class: 'button button--secondary', disabled: running, dataset: { testid: 'speech-check' }
      }, icon('speaker', { size: 18 }), h('span', null, running ? 'Sprawdzam…' : 'Sprawdź wymowę')), () => this.#startCheck()),
      results.length > 0 ? h('ul', { class: 'speech-check__results', role: 'list', 'aria-live': 'polite' },
        results.map((result) => h('li', {
          class: `speech-check__result${result.started && !result.replaced ? '' : ' speech-check__result--problem'}`,
          dataset: { testid: 'speech-check-result', ok: String(result.started && !result.replaced) }
        }, icon(result.started && !result.replaced ? 'check' : 'warning', { size: 16 }), h('span', null, describeCheck(result))))) : null,
      check?.finished ? h('p', { class: 'form-note', dataset: { testid: 'speech-check-summary' } }, checkSummary(results)) : null
    );
  }

  #startCheck() {
    this.#stopCheck();
    const check = { results: [], finished: false, stop: null };
    this.check = check;
    // Pierwsza wypowiedź pada od razu, w obsłudze dotknięcia (wymóg Safari).
    check.stop = checkSpeech(() => this.ctx.library.getSettings(), (results, finished) => {
      if (this.check !== check) return;
      check.results = [...results];
      check.finished = finished;
      if (!this.disposed) this.ctx.refresh();
    });
    this.ctx.refresh();
  }

  #stopCheck() {
    if (this.check && !this.check.finished) {
      this.check.stop?.();
      this.check = null;
    }
  }

  async #checkPersistence() {
    if (!navigator.storage?.persisted) return;
    try {
      this.persisted = await navigator.storage.persisted();
    } catch {
      this.persisted = null;
    }
    if (!this.disposed) this.ctx.refresh();
  }

  /** Zajęte miejsce: pliki aplikacji, dane, obrazy i załączniki, szacunek przeglądarki (od 1.45.2). */
  async #measureUsage() {
    this.usage = null;
    try {
      this.usage = await measureUsage({ library: this.ctx.library });
    } catch (error) {
      this.usage = { error };
    }
    if (!this.disposed) this.ctx.refresh();
  }

  #usageGroup() {
    const usage = this.usage;
    const value = (bytes) => (usage === null ? 'Liczenie…' : bytes === null ? '–' : formatSize(bytes));
    if (usage?.error) {
      return group({ title: 'Zajęte miejsce', footer: 'Nie udało się policzyć zajętego miejsca w tej przeglądarce.' },
        actionRow({ label: 'Policz ponownie', iconName: 'refresh', onClick: () => this.#measureUsage(), testID: 'usage-refresh' }));
    }
    const media = usage?.media;
    const mediaText = media && media.images + media.files > 0 ? `${formatSize(media.size)} (${mediaList(media)})` : usage ? 'Brak' : 'Liczenie…';
    const footer = [
      'Aplikacja – pliki zapisane do pracy bez internetu (przy aktualizacji przez chwilę stare i nowe razem). Dane – materiały, '
        + 'notatki, postępy i ustawienia, w przybliżeniu jak plik danych kopii zapasowej.',
      usage?.browser !== null && usage?.browser !== undefined
        ? `Przeglądarka liczy po swojemu (z zapasem i plikami roboczymi): zajęte ok. ${formatSize(usage.browser)}${usage.quota ? `, limit dla aplikacji ok. ${formatSize(usage.quota)}` : ''}.`
        : null
    ].filter(Boolean).join(' ');
    return group({ title: 'Zajęte miejsce', footer, className: 'settings-usage' },
      valueRow('Aplikacja', usage?.app === null ? 'Nie zapisana do pracy offline' : value(usage?.app ?? null)),
      valueRow('Materiały, notatki i postępy', value(usage?.data ?? null)),
      valueRow('Obrazy i załączniki', mediaText),
      valueRow('Razem', value(usage?.total ?? null)),
      usage ? actionRow({ label: 'Policz ponownie', iconName: 'refresh', onClick: () => this.#measureUsage(), testID: 'usage-refresh' }) : null);
  }

  /** Historia zmian w pigułce (od 1.45.2, tymczasowo): najnowsze wersje, reszta po „Pokaż wszystkie”. */
  #changesGroup() {
    const shown = this.allChanges ? CHANGELOG : CHANGELOG.slice(0, CHANGELOG_SHOWN);
    return group({ title: 'Historia zmian', footer: 'Sekcja tymczasowa – nowości każdej wersji w jednym zdaniu, od najnowszej.', className: 'settings-changes' },
      shown.map((entry) => h('li', { class: 'row row--static changelog__item', dataset: { testid: 'changelog-item' } },
        h('span', { class: 'row__main changelog__main' },
          h('span', { class: 'changelog__version' }, entry.version),
          h('span', { class: 'changelog__text' }, entry.summary)))),
      actionRow({
        label: this.allChanges ? 'Pokaż tylko najnowsze' : `Pokaż wszystkie (od wersji 1.0, ${CHANGELOG.length})`,
        iconName: this.allChanges ? 'chevronUp' : 'chevronDown',
        onClick: () => {
          this.allChanges = !this.allChanges;
          this.ctx.refresh();
        },
        testID: 'changelog-toggle'
      }));
  }

  async #requestPersistence() {
    try {
      this.persisted = await navigator.storage.persist();
    } catch {
      this.persisted = false;
    }
    toast(this.persisted
      ? 'Ochrona danych jest włączona.'
      : 'Przeglądarka nie włączyła ochrony. Regularnie zapisuj kopię zapasową.');
    if (!this.disposed) this.ctx.refresh();
  }

  async #checkMissing() {
    try {
      const missing = await this.ctx.library.missingMedia();
      this.missing = missing.images + missing.files > 0 ? missing : null;
    } catch (error) {
      console.error(error);
      this.missing = null;
    }
    if (!this.disposed) this.ctx.refresh();
  }

  /** Wykonuje polecenie kopii, o ile nie trwa inne (zapis dużego pliku może chwilę potrwać). */
  async #exclusive(work) {
    if (this.busy) {
      toast('Poczekaj, aż skończy się poprzednia operacja.');
      return;
    }
    this.busy = true;
    try {
      await work();
    } catch (error) {
      await showError(error);
    } finally {
      this.busy = false;
    }
  }

  /** Pierwszy krok przeniesienia: plik danych (bez obrazów i załączników). */
  #exportBackup() {
    const { ctx } = this;
    return this.#exclusive(async () => {
      const backup = await createBackup(ctx.library, ctx.env.appVersion);
      const file = new File([JSON.stringify(backup)], backupFileName(), { type: 'application/json' });
      const media = backup.media.images + backup.media.files > 0
        ? ` Obrazy i załączniki notatek (${mediaList(backup.media)}) zapisz osobno – poleceniem „Zapisz obrazy i załączniki”.`
        : '';
      const outcome = await deliverFile(file, {
        title: 'Plik danych jest gotowy',
        message: `Zawartość: ${contentList(backup.counts)}.${media} W następnym kroku wybierz „Zachowaj w Plikach”.`
      });
      if (outcome === 'cancelled') return;
      await ctx.library.updateSettings({ lastBackupAt: nowISO() });
      toast(outcome === 'downloaded' ? `Zapisano plik ${file.name}.` : 'Zapisano plik danych.');
    });
  }

  /** Drugi krok przeniesienia: jeden plik ze wszystkimi obrazami i załącznikami notatek. */
  #exportMedia() {
    const { ctx } = this;
    return this.#exclusive(async () => {
      const progress = progressToast('Przygotowanie pliku obrazów i załączników…');
      let archive;
      try {
        archive = await createMediaArchive(ctx.library, ctx.env.appVersion, {
          onProgress: (done, total) => progress.update(`Przygotowanie pliku obrazów i załączników… ${done} z ${total}`)
        });
      } finally {
        progress.done();
      }
      if (archive.images + archive.files === 0) {
        toast('Na tym urządzeniu nie ma plików obrazów ani załączników do zapisania.');
        return;
      }
      const file = new File([archive.blob], mediaFileName(), { type: 'application/zip' });
      const missing = archive.missing > 0
        ? ` ${pluralForm(archive.missing, 'Brakuje 1 pliku opisanego w notatce – nie ma go na tym urządzeniu.',
          `Brakuje ${archive.missing} plików opisanych w notatkach – nie ma ich na tym urządzeniu.`,
          `Brakuje ${archive.missing} plików opisanych w notatkach – nie ma ich na tym urządzeniu.`)}`
        : '';
      const outcome = await deliverFile(file, {
        title: 'Plik obrazów i załączników jest gotowy',
        message: `Zawartość: ${mediaList(archive)}, razem ${formatSize(archive.size)}.${missing} W następnym kroku wybierz „Zachowaj w Plikach”.`
      });
      if (outcome === 'cancelled') return;
      await ctx.library.updateSettings({ lastMediaBackupAt: nowISO() });
      toast(outcome === 'downloaded' ? `Zapisano plik ${file.name}.` : 'Zapisano plik obrazów i załączników.');
    });
  }

  /**
   * Przywracanie: plik danych, plik obrazów i załączników albo oba naraz (najpierw dane).
   * Rodzaj pliku rozpoznaje zawartość, nie nazwa.
   */
  async #restoreBackup() {
    if (this.busy) {
      toast('Poczekaj, aż skończy się poprzednia operacja.');
      return;
    }
    // Na telefonie nie zawężamy typu pliku: system potrafi wyszarzyć kopię zapisaną przez inną aplikację.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const files = await pickFiles(coarse ? '' : '.json,application/json,.zip,application/zip', { multiple: true });
    if (files.length === 0) return;
    await this.#exclusive(async () => {
      const zips = await Promise.all(files.map((file) => isZipFile(file)));
      const dataFiles = files.filter((_, index) => !zips[index]);
      const mediaFiles = files.filter((_, index) => zips[index]);
      if (dataFiles.length > 1 || mediaFiles.length > 1) {
        throw new Error('Wybierz jeden plik danych, jeden plik obrazów i załączników albo oba – po jednym z każdego rodzaju.');
      }
      if (dataFiles[0] && !(await this.#restoreData(dataFiles[0], { withMedia: Boolean(mediaFiles[0]) }))) return;
      if (mediaFiles[0]) await this.#restoreMediaFile(mediaFiles[0]);
    });
    await this.#checkMissing();
  }

  /** Przywraca plik danych (po potwierdzeniu). Zwraca true, gdy dane zostały zastąpione. */
  async #restoreData(file, { withMedia }) {
    const { ctx } = this;
    const result = validateBackup(parseBackupText(await file.text()));
    const current = { ...ctx.library.summary(), notes: ctx.library.noteCount() };
    const exported = result.exportedAt ? formatDate(result.exportedAt) : null;
    const parts = [`${exported ? `Kopia z dnia ${exported}. ` : ''}Zawartość: ${contentList(result.counts)}.`];
    const separate = result.media.images + result.media.files - result.media.included;
    if (separate > 0) {
      parts.push(withMedia
        ? `Potem zostaną dodane obrazy i załączniki notatek z drugiego pliku (${mediaList(result.media)}).`
        : `Obrazy i załączniki notatek (${mediaList(result.media)}) są w osobnym pliku – przywróć go potem. Te, które już są na tym urządzeniu, zostaną.`);
    }
    parts.push(ctx.library.isEmpty()
      ? 'Dane zostaną wczytane do pustej biblioteki.'
      : `Obecne dane (${contentList(current)}) zostaną zastąpione. Tej operacji nie można cofnąć.`);
    const confirmed = await confirmDialog({
      title: 'Przywrócić dane z kopii?',
      message: parts.join(' '),
      confirmLabel: 'Przywróć',
      destructive: !ctx.library.isEmpty()
    });
    if (!confirmed) return false;
    await ctx.library.replaceAll(result.data);
    ctx.applyAppearance();
    toast(`Przywrócono: ${contentList(result.counts)}.`);
    return true;
  }

  /** Dodaje obrazy i załączniki z pliku do notatek, które ich nie mają. Niczego nie usuwa. */
  async #restoreMediaFile(file) {
    const { ctx } = this;
    const progress = progressToast('Wczytywanie obrazów i załączników…');
    let report;
    try {
      report = await restoreMedia(ctx.library, file, {
        onProgress: (done, total) => progress.update(`Wczytywanie obrazów i załączników… ${done} z ${total}`)
      });
    } finally {
      progress.done();
    }
    const added = report.images + report.files;
    const lines = [added > 0 ? `Dodano ${mediaList(report)}.` : 'Nie dodano żadnego pliku.'];
    if (report.present > 0) {
      lines.push(`${pluralFiles(report.present)} ${pluralForm(report.present, 'był', 'były', 'było')} już na tym urządzeniu.`);
    }
    if (report.unmatched > 0) {
      lines.push(`${pluralFiles(report.unmatched)} nie ${pluralForm(report.unmatched, 'pasuje', 'pasują', 'pasuje')} do notatek `
        + 'w bibliotece – najpierw przywróć plik danych zapisany razem z tym plikiem.');
    }
    if (report.damaged > 0) {
      lines.push(`${pluralFiles(report.damaged)} ${pluralForm(report.damaged, 'jest uszkodzony albo nie zgadza się',
        'są uszkodzone albo nie zgadzają się', 'jest uszkodzonych albo nie zgadza się')} z opisem w notatce.`);
    }
    if (report.missing > 0) lines.push(`Wciąż brakuje ${plural(report.missing, 'pliku', 'plików', 'plików')} opisanych w notatkach.`);
    await alertDialog({ title: 'Obrazy i załączniki', message: lines.join(' ') });
  }

  async #deleteEverything() {
    const { ctx } = this;
    const summary = { ...ctx.library.summary(), notes: ctx.library.noteCount() };
    const confirmed = await confirmDialog({
      title: 'Usunąć wszystkie dane?',
      message: `Usunięte zostaną: ${contentList(summary)}, a także postępy i historia nauki. Tej operacji nie można cofnąć. Jeśli chcesz zachować dane, najpierw zapisz kopię zapasową.`,
      confirmLabel: 'Usuń wszystko',
      destructive: true
    });
    if (!confirmed) return;
    try {
      await ctx.library.deleteAllContent();
      toast('Usunięto wszystkie dane.');
    } catch (error) {
      await showError(error);
    }
  }

  #storageGroup() {
    const { ctx } = this;
    const { storage } = ctx.env;
    const inMemory = !storage.persistent;
    const rows = [valueRow('Miejsce zapisu', storage.label)];
    if (storage.requestPersistence && this.persisted !== null) {
      rows.push(valueRow('Ochrona przed usunięciem', this.persisted ? 'Włączona' : 'Wyłączona'));
    }
    if (storage.requestPersistence && this.persisted === false) {
      rows.push(actionRow({ label: 'Włącz ochronę danych', iconName: 'check', onClick: () => this.#requestPersistence(), testID: 'request-persistence' }));
    }
    const footer = inMemory
      ? 'Przeglądarka nie udostępnia bazy danych (np. w trybie prywatnym), więc dane znikną po zamknięciu karty.'
      : 'Dane nie są wysyłane do internetu. Telefon i komputer mają osobne biblioteki – przenosisz je kopią zapasową. Bez ochrony przeglądarka może usunąć dane, gdy długo nie otwierasz aplikacji albo zabraknie miejsca.';
    return group({ title: 'Przechowywanie danych', footer }, rows);
  }

  #installGroup() {
    if (isStandalone()) {
      return group({ title: 'Aplikacja', footer: 'Aplikacja jest uruchomiona z ekranu początkowego i działa także bez internetu.' });
    }
    const footer = isAppleMobile()
      ? 'W Safari dotknij przycisku Udostępnij, a potem „Do ekranu początkowego”. Zrób to przed dodaniem danych: aplikacja z ekranu początkowego ma osobną pamięć niż karta Safari. Dane wprowadzone wcześniej przeniesiesz kopią zapasową.'
      : 'W Chrome lub Edge wybierz ikonę instalacji w pasku adresu, aby otwierać LexiCards w osobnym oknie. Po pierwszym otwarciu aplikacja działa także bez internetu.';
    return group({ title: 'Instalacja', footer });
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const settings = library.getSettings();
    const summary = library.summary();
    const lastBackup = settings.lastBackupAt ? formatDate(settings.lastBackupAt) : null;
    const lastMedia = settings.lastMediaBackupAt ? formatDate(settings.lastMediaBackupAt) : null;
    const media = library.mediaSummary();
    const hasMedia = media.images + media.files > 0;

    const backupFooter = [
      lastBackup ? `Ostatni zapis danych: ${lastBackup}.` : 'Nie zapisano jeszcze danych do pliku.',
      hasMedia ? (lastMedia ? `Ostatni zapis obrazów i załączników: ${lastMedia}.` : 'Nie zapisano jeszcze obrazów i załączników.') : null,
      'Przeniesienie to dwa pliki: dane (materiały, notatki, postępy i ustawienia) oraz jeden plik ze wszystkimi obrazami '
        + 'i załącznikami notatek. Na drugim urządzeniu przywróć najpierw dane, potem obrazy i załączniki – możesz też wybrać '
        + 'oba pliki naraz. Przywrócenie danych zastępuje obecne dane; obrazy i załączniki, które już są na urządzeniu, zostają.'
    ].filter(Boolean).join(' ');

    return {
      title: 'Ustawienia',
      back: { href: routes.start(), label: 'Start' },
      body: [
        this.#appearanceGroup(),
        group({ title: 'Kopia zapasowa i przeniesienie', footer: backupFooter, className: 'settings-backup' },
          actionRow({
            label: 'Zapisz dane do pliku', subtitle: 'Bez obrazów i załączników – mały plik', iconName: 'download',
            onClick: () => this.#exportBackup(), testID: 'backup-export'
          }),
          hasMedia
            ? actionRow({
                label: 'Zapisz obrazy i załączniki', subtitle: `Jeden plik: ${mediaList(media)}, ${formatSize(media.size)}`,
                iconName: 'download', onClick: () => this.#exportMedia(), testID: 'backup-media-export'
              })
            : null,
          this.missing
            ? valueRow('Brak na tym urządzeniu', mediaList(this.missing))
            : null,
          actionRow({
            label: 'Przywróć z pliku', subtitle: 'Dane, obrazy i załączniki albo oba pliki naraz', iconName: 'upload',
            onClick: () => this.#restoreBackup(), testID: 'backup-restore'
          })
        ),
        group({
          title: 'Import i eksport',
          footer: 'Eksport zapisuje same materiały w arkuszu, który można edytować. Kopia zapasowa obejmuje także postępy i ustawienia.'
        },
          actionRow({ label: 'Importuj pojęcia z pliku XLSX lub CSV', iconName: 'upload', onClick: () => ctx.navigate(routes.importFile()), testID: 'settings-import' }),
          library.isEmpty() ? null : actionRow({ label: 'Eksportuj bibliotekę do pliku', iconName: 'download', onClick: () => openExportSheet(ctx, { kind: 'all' }), testID: 'settings-export' })
        ),
        this.#reviewGroup(),
        this.#studyGroup(),
        this.#soundGroup(),
        this.#libraryGroup(),
        this.#speechGroup(),
        this.#storageGroup(),
        this.#usageGroup(),
        this.#installGroup(),
        group({ title: 'Dane' },
          actionRow({ label: 'Wczytaj przykładowe dane', iconName: 'sparkles', onClick: () => loadSampleData(ctx), testID: 'load-samples' }),
          library.isEmpty() ? null : actionRow({ label: 'Usuń wszystkie dane', iconName: 'trash', destructive: true, onClick: () => this.#deleteEverything(), testID: 'delete-all' })
        ),
        group({ title: 'O aplikacji' },
          valueRow('Wersja', ctx.env.buildID ? `${ctx.env.appVersion} (${ctx.env.buildID})` : ctx.env.appVersion),
          valueRow('Pojęcia w bibliotece', String(summary.terms))
        ),
        this.#changesGroup()
      ]
    };
  }
}
