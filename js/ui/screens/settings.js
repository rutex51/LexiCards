// Ustawienia: wygląd, kopia zapasowa, przechowywanie danych, instalacja, dane przykładowe.

import { backupFileName, createBackup, parseBackupText, validateBackup } from '../../core/backup.js';
import { nowISO } from '../../core/model.js';
import { joinList, pluralDomains, pluralLessons, pluralModules, pluralTerms } from '../../core/text.js';
import { loadSampleData, openExportSheet } from '../actions.js';
import { actionRow, group, segmented, valueRow } from '../components.js';
import { confirmDialog, showError, toast } from '../dialogs.js';
import { h } from '../dom.js';
import { deliverFile, pickFile } from '../files.js';
import { routes } from '../router.js';

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
    pluralTerms(counts.terms)
  ]);
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
    this.#checkPersistence();
  }

  dispose() {
    this.disposed = true;
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
      const current = ctx.library.summary();
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
    const summary = ctx.library.summary();
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
      'Kopia to jeden plik ze wszystkimi materiałami i postępami. Przywrócenie zastępuje obecne dane.'
    ].join(' ');

    return {
      title: 'Ustawienia',
      back: { href: routes.start(), label: 'Start' },
      body: [
        h('section', { class: 'group' },
          h('h2', { class: 'group__title' }, 'Wygląd'),
          segmented({
            name: 'appearance',
            label: 'Wygląd',
            value: settings.appearance,
            options: APPEARANCE_OPTIONS,
            onChange: async (value) => {
              try {
                await library.updateSettings({ appearance: value });
                ctx.applyAppearance();
              } catch (error) {
                await showError(error);
              }
            }
          })
        ),
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
