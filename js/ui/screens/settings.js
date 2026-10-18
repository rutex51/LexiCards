// Ustawienia: wygląd, kopia zapasowa, przechowywanie danych, instalacja, dane przykładowe.

import { backupFileName, createBackup, parseBackupText, validateBackup } from '../../core/backup.js';
import { ACCENT_COLORS, accentColor, nowISO } from '../../core/model.js';
import { joinList, pluralDomains, pluralLessons, pluralModules, pluralNotes, pluralTerms } from '../../core/text.js';
import { loadSampleData, openExportSheet } from '../actions.js';
import { actionRow, field, formGroup, group, segmented, selectInput, valueRow } from '../components.js';
import { confirmDialog, showError, toast } from '../dialogs.js';
import { h, onTap } from '../dom.js';
import { deliverFile, pickFile } from '../files.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';
import {
  SPEECH_RATES, checkSpeech, describeCheck, forgetSilentVoices, listVoices, onVoicesChanged, silentVoice, speak, speechAvailable
} from '../speech.js';

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
    /** Sprawdzenie wymowy: { results, finished, stop } albo null. */
    this.check = null;
    this.#checkPersistence();
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
        + 'w jasnym i ciemnym motywie; wykresy w Statystykach zostają w swoich kolorach.')
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
        'Szansa, że w dniu powtórki będziesz pamiętać fiszkę. Wyższa wartość oznacza częstsze powtórki. '
        + 'Zmiana dotyczy kolejnych ocen. Terminy wyznacza algorytm FSRS-6, osobno dla PL → EN i EN → PL.')
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

  async #exportBackup() {
    const { ctx } = this;
    try {
      const backup = await createBackup(ctx.library, ctx.env.appVersion);
      const file = new File([JSON.stringify(backup)], backupFileName(), { type: 'application/json' });
      const outcome = await deliverFile(file, {
        title: 'Kopia zapasowa jest gotowa',
        message: `Zawartość: ${contentList(backup.counts)}. W następnym kroku wybierz „Zachowaj w Plikach”.`
      });
      if (outcome === 'cancelled') return;
      await ctx.library.updateSettings({ lastBackupAt: nowISO() });
      toast(outcome === 'downloaded' ? `Zapisano plik ${file.name}.` : 'Zapisano kopię zapasową.');
    } catch (error) {
      await showError(error);
    }
  }

  async #restoreBackup() {
    const { ctx } = this;
    // Na telefonie nie zawężamy typu pliku: system potrafi wyszarzyć kopię zapisaną przez inną aplikację.
    const file = await pickFile(window.matchMedia('(pointer: coarse)').matches ? '' : '.json,application/json');
    if (!file) return;
    try {
      const result = validateBackup(parseBackupText(await file.text()));
      const current = { ...ctx.library.summary(), notes: ctx.library.noteCount() };
      const exported = result.exportedAt ? formatDate(result.exportedAt) : null;
      const parts = [`${exported ? `Kopia z dnia ${exported}. ` : ''}Zawartość: ${contentList(result.counts)}.`];
      parts.push(ctx.library.isEmpty()
        ? 'Zostanie wczytana do pustej biblioteki.'
        : `Obecne dane (${contentList(current)}) zostaną zastąpione. Tej operacji nie można cofnąć.`);
      const confirmed = await confirmDialog({
        title: 'Przywrócić dane z kopii?',
        message: parts.join(' '),
        confirmLabel: 'Przywróć',
        destructive: !ctx.library.isEmpty()
      });
      if (!confirmed) return;
      await ctx.library.replaceAll(result.data);
      ctx.applyAppearance();
      toast(`Przywrócono: ${contentList(result.counts)}.`);
    } catch (error) {
      await showError(error);
    }
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
    const inMemory = ctx.env.storageKind !== 'indexeddb';
    const rows = [valueRow('Miejsce zapisu', inMemory ? 'Tylko pamięć (do zamknięcia karty)' : 'Ta przeglądarka')];
    if (!inMemory && this.persisted !== null) {
      rows.push(valueRow('Ochrona przed usunięciem', this.persisted ? 'Włączona' : 'Wyłączona'));
    }
    if (!inMemory && this.persisted === false) {
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

    const backupFooter = [
      lastBackup ? `Ostatnia kopia: ${lastBackup}.` : 'Nie zapisano jeszcze żadnej kopii.',
      'Kopia to jeden plik ze wszystkimi materiałami, notatkami z obrazami i postępami. Przywrócenie zastępuje obecne dane.'
    ].join(' ');

    return {
      title: 'Ustawienia',
      back: { href: routes.start(), label: 'Start' },
      body: [
        this.#appearanceGroup(),
        group({ title: 'Kopia zapasowa', footer: backupFooter },
          actionRow({ label: 'Zapisz kopię do pliku', iconName: 'download', onClick: () => this.#exportBackup(), testID: 'backup-export' }),
          actionRow({ label: 'Przywróć z pliku', iconName: 'upload', onClick: () => this.#restoreBackup(), testID: 'backup-restore' })
        ),
        group({
          title: 'Import i eksport',
          footer: 'Eksport zapisuje same materiały w arkuszu, który można edytować. Kopia zapasowa obejmuje także postępy i ustawienia.'
        },
          actionRow({ label: 'Importuj pojęcia z pliku XLSX lub CSV', iconName: 'upload', onClick: () => ctx.navigate(routes.importFile()), testID: 'settings-import' }),
          library.isEmpty() ? null : actionRow({ label: 'Eksportuj bibliotekę do pliku', iconName: 'download', onClick: () => openExportSheet(ctx, { kind: 'all' }), testID: 'settings-export' })
        ),
        this.#reviewGroup(),
        this.#speechGroup(),
        this.#storageGroup(),
        this.#installGroup(),
        group({ title: 'Dane' },
          actionRow({ label: 'Wczytaj przykładowe dane', iconName: 'sparkles', onClick: () => loadSampleData(ctx), testID: 'load-samples' }),
          library.isEmpty() ? null : actionRow({ label: 'Usuń wszystkie dane', iconName: 'trash', destructive: true, onClick: () => this.#deleteEverything(), testID: 'delete-all' })
        ),
        group({ title: 'O aplikacji' },
          valueRow('Wersja', ctx.env.buildID ? `${ctx.env.appVersion} (${ctx.env.buildID})` : ctx.env.appVersion),
          valueRow('Pojęcia w bibliotece', String(summary.terms))
        )
      ]
    };
  }
}
