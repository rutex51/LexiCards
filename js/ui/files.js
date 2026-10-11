// Zapis pliku na urządzeniu i wybór pliku z urządzenia.

import { confirmDialog } from './dialogs.js';
import { h } from './dom.js';

/** Telefon i tablet: plik oddajemy przez systemowy arkusz udostępniania („Zachowaj w Plikach”). */
export function prefersShareSheet(file) {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  if (!window.matchMedia('(pointer: coarse)').matches) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Pobiera plik przez przeglądarkę (folder Pobrane). */
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: file.name, hidden: true });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Oddaje użytkownikowi gotowy plik. Zwraca 'shared', 'downloaded' albo 'cancelled'.
 * Udostępnianie musi zacząć się w obsłudze dotknięcia, dlatego poprzedza je okno z przyciskiem.
 */
export async function deliverFile(file, { title, message }) {
  if (!prefersShareSheet(file)) {
    downloadFile(file);
    return 'downloaded';
  }
  let sharing = null;
  const confirmed = await confirmDialog({
    title,
    message,
    confirmLabel: 'Zapisz plik',
    onConfirm: () => {
      sharing = navigator.share({ files: [file], title: file.name }).then(() => null, (error) => error);
    }
  });
  if (!confirmed) return 'cancelled';
  const error = await sharing;
  if (!error) return 'shared';
  if (error.name === 'AbortError') return 'cancelled';
  // Arkusz udostępniania zawiódł – zostaje zwykłe pobranie.
  downloadFile(file);
  return 'downloaded';
}

/** Otwiera systemowy wybór pliku. Zwraca obietnicę z plikiem albo null po anulowaniu. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: accept || null, hidden: true, dataset: { testid: 'file-input' } });
    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}
