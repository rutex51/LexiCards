// Załączniki notatek w interfejsie (od 1.8): plakietka rodzaju pliku, lista w podglądzie notatki
// i otwieranie. Na telefonie plik trafia do systemowego arkusza udostępniania (Word, Excel,
// PowerPoint, Książki, „Zachowaj w Plikach”…); na komputerze PDF, obrazy i tekst otwierają się
// w nowej karcie przeglądarki, a pozostałe pliki są pobierane i otwierają się w swoich programach.

import { FILE_KIND_NAMES, fileExtension, fileKind, opensInBrowser } from '../core/note-files.js';
import { formatSize } from '../core/text.js';
import { confirmDialog, openMenu, showError, toast } from './dialogs.js';
import { h } from './dom.js';
import { downloadFile, prefersShareSheet } from './files.js';
import { icon } from './icons.js';

/** Jak długo działa adres pliku otwartego w nowej karcie. */
const TAB_URL_LIFETIME = 5 * 60 * 1000;

/** Plakietka z rozszerzeniem pliku w kolorze rodzaju (PDF – czerwona, Word – niebieska…). */
export function fileBadge(meta) {
  const kind = fileKind(meta.name, meta.type);
  const label = (fileExtension(meta.name) || 'plik').slice(0, 4).toUpperCase();
  return h('span', { class: `file-badge file-badge--${kind}`, 'aria-hidden': 'true' }, label);
}

/** Opis pliku: „PDF, 2,1 MB”; brakujący plik – „brak pliku na tym urządzeniu”. */
export function fileDescription(meta) {
  if (meta.missing) return 'brak pliku na tym urządzeniu';
  return `${FILE_KIND_NAMES[fileKind(meta.name, meta.type)]}, ${formatSize(meta.size)}`;
}

const missingMessage = (meta) => `Pliku „${meta.name}” nie ma na tym urządzeniu. Przywróć plik obrazów i załączników w Ustawieniach (Kopia zapasowa).`;

/** Lista załączników w podglądzie notatki; onOpen(meta) – dotknięcie pliku. */
export function attachmentList(files, onOpen) {
  return h('ul', { class: 'note-files', 'aria-label': 'Załączniki', dataset: { testid: 'note-files' } },
    h('li', { class: 'note-files__icon', 'aria-hidden': 'true' }, icon('paperclip', { size: 18 })),
    files.map((meta) => h('li', null,
      h('button', {
        type: 'button',
        class: `note-files__item${meta.missing ? ' note-files__item--missing' : ''}`,
        title: `${meta.name} – ${fileDescription(meta)}`,
        dataset: { testid: 'note-file' },
        onClick: () => onOpen(meta)
      }, fileBadge(meta), h('span', { class: 'note-files__name' }, meta.name))
    ))
  );
}

function fileOf(meta, bytes) {
  return new File([bytes], meta.name, { type: meta.type || 'application/octet-stream' });
}

/** Otwiera plik w nowej karcie (komputer); gdy przeglądarka zablokuje kartę – pobiera go. */
function openInTab(file) {
  const url = URL.createObjectURL(file);
  const opened = window.open(url, '_blank');
  if (!opened) {
    URL.revokeObjectURL(url);
    downloadFile(file);
    toast(`Przeglądarka nie otworzyła nowej karty – pobrano plik ${file.name}.`);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), TAB_URL_LIFETIME);
}

/** Arkusz udostępniania; po odmowie (np. brak zgody na udostępnianie) – zwykłe pobranie. */
function share(file) {
  navigator.share({ files: [file], title: file.name }).catch((error) => {
    if (error?.name === 'AbortError') return;
    downloadFile(file);
  });
}

/**
 * Polecenia załącznika: na telefonie „Otwórz lub zapisz…” (arkusz udostępniania), na komputerze
 * „Otwórz w nowej karcie” (PDF, obrazy, tekst) i „Pobierz”. load() → Promise<ArrayBuffer | null>
 * czyta bajty z bazy – zaczyna od razu, żeby arkusz udostępniania otworzył się jeszcze w obsłudze
 * dotknięcia (Safari wymaga tego od udostępniania).
 */
export function openAttachment(meta, load) {
  if (meta.missing) {
    toast(missingMessage(meta), { kind: 'error' });
    return null;
  }
  let file = null;
  const pending = load().then((bytes) => {
    file = bytes ? fileOf(meta, bytes) : null;
    return file;
  });
  pending.catch(() => {});
  const ready = async () => {
    try {
      const loaded = await pending;
      if (!loaded) toast(missingMessage(meta), { kind: 'error' });
      return loaded;
    } catch (error) {
      await showError(error);
      return null;
    }
  };
  const probe = new File([], meta.name, { type: meta.type || 'application/octet-stream' });
  const items = [];
  if (prefersShareSheet(probe)) {
    items.push({
      label: 'Otwórz lub zapisz…',
      icon: 'share',
      onSelect: async () => {
        if (file) {
          share(file);
          return;
        }
        // Plik jeszcze się wczytywał – udostępnianie musi zacząć się w kolejnym dotknięciu.
        const loaded = await ready();
        if (!loaded) return;
        await confirmDialog({
          title: loaded.name,
          message: 'Plik jest gotowy. W następnym kroku wybierz aplikację, w której go otworzysz, albo „Zachowaj w Plikach”.',
          confirmLabel: 'Otwórz',
          onConfirm: () => share(loaded)
        });
      }
    });
  } else {
    if (opensInBrowser(meta.name, meta.type)) {
      items.push({
        label: 'Otwórz w nowej karcie',
        icon: 'external',
        onSelect: async () => {
          const loaded = await ready();
          if (loaded) openInTab(loaded);
        }
      });
    }
    items.push({
      label: opensInBrowser(meta.name, meta.type) ? 'Pobierz' : 'Pobierz i otwórz',
      icon: 'download',
      onSelect: async () => {
        const loaded = await ready();
        if (!loaded) return;
        downloadFile(loaded);
        toast(`Pobrano plik ${loaded.name}.`);
      }
    });
  }
  return openMenu({ title: `${meta.name} (${fileDescription(meta)})`, items });
}
