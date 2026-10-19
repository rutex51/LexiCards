// Notatka lekcji: okno z podglądem (tekst z formatowaniem i obrazy, po polsku i po angielsku,
// czytanie na głos, załączniki), edytor z paskiem formatowania, powiększanie obrazów oraz elementy
// pokazujące notatkę na listach.
//
// Edytor to pole contenteditable obsługiwane przez document.execCommand – jedyny sposób na
// formatowanie z cofaniem (Ctrl+Z) bez dodatkowych bibliotek. Treść przy wklejaniu i zapisie
// przechodzi przez normalizeNoteHtml(), więc w bazie zawsze jest bezpieczny, prosty HTML.

import { sentences } from '../core/listen.js';
import { NOTE_FILE_LIMIT, NOTE_FILE_MAX_BYTES, NOTE_IMAGE_LIMIT } from '../core/model.js';
import { bytesToBase64 } from '../core/base64.js';
import { NOTE_COLORS, PAGE_BREAK_LINE, isEmptyNoteHtml, noteText, normalizeNoteHtml, portableNoteHtml } from '../core/note-format.js';
import {
  IMAGE_LABEL_MAX, cleanImageLabel, findImageByLabel, labelKey, referenceLabel, referenceToken, renameReferences, withImageLabels
} from '../core/note-refs.js';
import { FILE_NAME_MAX, cleanFileName, fileExtension, fileTypeOf, renamedFile } from '../core/note-files.js';
import { joinList, pluralAttachments, pluralImages } from '../core/text.js';
import { attachmentList, fileBadge, fileDescription, openAttachment } from './attachments.js';
import { field, iconButton, segmented, textInput } from './components.js';
import { confirmDialog, mountDialog, openFormSheet, openMenu, showError, toast } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { prepareImage, urlPool } from './images.js';
import { noteBook } from './note-book.js';
import { speakThen, speechAvailable, stopSpeaking } from './speech.js';

let titleCounter = 0;

/** Kolor oznaczający „bez koloru” w edytorze – po zapisie znika (nie należy do palety). */
const NO_COLOR = '#010101';
/** Największy łączny rozmiar obrazów kopiowanych do schowka razem z tekstem. */
const CLIPBOARD_IMAGE_BYTES = 8 * 1024 * 1024;

const FORMAT_BUTTONS = [
  { command: 'bold', icon: 'bold', label: 'Pogrubienie', keys: 'Ctrl+B' },
  { command: 'italic', icon: 'italic', label: 'Kursywa', keys: 'Ctrl+I' },
  { command: 'underline', icon: 'underline', label: 'Podkreślenie', keys: 'Ctrl+U' },
  { command: 'heading', icon: 'heading', label: 'Nagłówek' },
  { command: 'insertUnorderedList', icon: 'listBullet', label: 'Lista punktowana' },
  { command: 'insertOrderedList', icon: 'listNumber', label: 'Lista numerowana' },
  { command: 'pageBreak', icon: 'pageBreak', label: 'Nowa strona' },
  { command: 'color', icon: 'textColor', label: 'Kolor tekstu' },
  { command: 'removeFormat', icon: 'clearFormat', label: 'Usuń formatowanie' }
];

// ---------------------------------------------------------------- elementy list

/** Krótki opis notatki: początek tekstu (akapity w osobnych wierszach) albo liczba obrazów. */
export function noteSummary(note) {
  const source = isEmptyNoteHtml(note.html) ? (note.htmlEN ?? '') : note.html;
  const text = noteText(source).split('\n').filter((line) => line.trim() !== PAGE_BREAK_LINE && referenceLabel(line) === null).join('\n')
    .replace(/\n\s*\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (text) return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  return joinList([
    note.images.length > 0 ? pluralImages(note.images.length) : null,
    note.files?.length > 0 ? pluralAttachments(note.files.length) : null
  ].filter(Boolean));
}

/**
 * Wiersz „Notatka” na ekranie lekcji: z podglądem treści albo zaproszeniem do dodania.
 */
export function lessonNoteRow(ctx, lesson) {
  const note = ctx.library.getNote(lesson.id);
  const open = () => openLessonNote(ctx, lesson.id);
  if (!note) {
    return h('li', { class: 'row' },
      h('button', { type: 'button', class: 'row__main row__button', onClick: open, dataset: { testid: 'lesson-note-add' } },
        h('span', { class: 'row__leading row__leading--icon' }, icon('note')),
        h('span', { class: 'row__text' },
          h('span', { class: 'row__title' }, 'Dodaj notatkę do lekcji'),
          h('span', { class: 'row__subtitle' }, 'Tekst z formatowaniem, obrazy i załączniki')
        )
      )
    );
  }
  const preview = h('span', { class: 'note-row__thumb', hidden: note.images.length === 0, 'aria-hidden': 'true' },
    note.images.length > 1 ? h('span', { class: 'note-row__count' }, String(note.images.length)) : null);
  if (note.images.length > 0) attachThumbnail(ctx, lesson.id, preview);
  return h('li', { class: 'row' },
    h('button', { type: 'button', class: 'row__main row__button note-row', onClick: open, dataset: { testid: 'lesson-note' } },
      h('span', { class: 'row__leading row__leading--icon note-row__icon' }, icon('note')),
      h('span', { class: 'row__text' },
        h('span', { class: 'row__title' }, 'Notatka'),
        h('span', { class: 'row__subtitle note-row__preview' }, noteSummary(note))
      ),
      preview,
      h('span', { class: 'row__chevron' }, icon('chevronRight', { size: 18 }))
    )
  );
}

/** Miniatura pierwszego obrazu notatki (wczytywana z bazy w tle). */
function attachThumbnail(ctx, lessonID, element) {
  ctx.library.noteImages(lessonID).then((images) => {
    if (!images[0]) return;
    const url = URL.createObjectURL(new Blob([images[0].bytes], { type: images[0].type }));
    const image = h('img', { src: url, alt: '' });
    image.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 1000), { once: true });
    element.prepend(image);
  }).catch(() => {});
}

/** Przycisk z ikoną notatki przy wierszu lekcji (tylko gdy lekcja ma notatkę). */
export function noteButton(ctx, lesson) {
  if (!ctx.library.getNote(lesson.id)) return null;
  return iconButton('note', `Notatka: ${lesson.name}`, () => openLessonNote(ctx, lesson.id), { className: 'row__note' });
}

/** Pozycja menu lekcji: „Notatka” albo „Dodaj notatkę”. */
export function noteMenuItem(ctx, lesson) {
  const exists = Boolean(ctx.library.getNote(lesson.id));
  return { label: exists ? 'Notatka' : 'Dodaj notatkę', icon: 'note', onSelect: () => openLessonNote(ctx, lesson.id, { edit: !exists }) };
}

// ---------------------------------------------------------------- schowek

/**
 * Kopiuje wersję notatki w danym języku: HTML z obrazami w tych samych miejscach co w podglądzie
 * (odwołania [[sygnatura]] zamienione na obrazy, pozostałe obrazy przed tekstem albo po nim)
 * i zwykły tekst.
 */
async function copyNote(note, images, language = 'pl') {
  const source = language === 'en' ? (note.htmlEN ?? '') : note.html;
  const text = noteText(source);
  const labeled = withImageLabels(images);
  let total = 0;
  const picture = (image) => {
    if (!image.bytes) return '';
    total += image.bytes.byteLength;
    if (total > CLIPBOARD_IMAGE_BYTES) return '';
    return `<p><img src="data:${image.type};base64,${bytesToBase64(image.bytes)}" alt="" style="max-width:100%"></p>`;
  };
  const holder = document.createElement('template');
  holder.innerHTML = portableNoteHtml(source);
  const placed = new Set();
  for (const paragraph of holder.content.querySelectorAll('p')) {
    const label = referenceLabel(paragraph.textContent);
    const index = label === null ? -1 : findImageByLabel(labeled, label);
    if (index < 0) continue;
    placed.add(index);
    const replacement = document.createElement('template');
    replacement.innerHTML = picture(labeled[index]);
    paragraph.replaceWith(replacement.content);
  }
  const rest = labeled.map((image, index) => (placed.has(index) ? '' : picture(image))).join('');
  const html = note.imagesFirst ? rest + holder.innerHTML : holder.innerHTML + rest;
  try {
    if (typeof window.ClipboardItem === 'function' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast('Skopiowano notatkę z formatowaniem – wklej ją w innej aplikacji.');
  } catch {
    // Starsze przeglądarki: kopiowanie zaznaczenia ukrytego elementu.
    const holder = h('div', { class: 'note-clipboard', 'aria-hidden': 'true' });
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const copied = document.execCommand('copy');
    selection.removeAllRanges();
    holder.remove();
    toast(copied ? 'Skopiowano notatkę.' : 'Nie udało się skopiować – zaznacz tekst i skopiuj go ręcznie.');
  }
}

// ---------------------------------------------------------------- powiększanie obrazu

/**
 * Obraz na cały ekran: powiększanie dwoma palcami, dwukrotnym dotknięciem, kółkiem z Ctrl
 * i klawiszami + / −; przesuwanie palcem; przy kilku obrazach – przewijanie w bok i strzałki.
 * images: [{ url, width, height }].
 */
export function openLightbox(images, startIndex = 0) {
  let index = startIndex;
  let zoom = 1;
  let dialog;
  const image = h('img', { class: 'lightbox__image', alt: '', draggable: 'false' });
  const stage = h('div', { class: 'lightbox__stage', dataset: { testid: 'lightbox-stage' } }, image);
  const counter = h('span', { class: 'lightbox__counter', 'aria-live': 'polite' });
  const close = h('button', { type: 'button', class: 'lightbox__button lightbox__close', 'aria-label': 'Zamknij', dataset: { testid: 'lightbox-close' }, onClick: () => dialog.close() }, icon('close'));
  const previous = h('button', { type: 'button', class: 'lightbox__button lightbox__previous', 'aria-label': 'Poprzedni obraz', onClick: () => show(index - 1) }, icon('chevronLeft'));
  const next = h('button', { type: 'button', class: 'lightbox__button lightbox__next', 'aria-label': 'Następny obraz', onClick: () => show(index + 1) }, icon('chevronRight'));
  const zoomButton = h('button', { type: 'button', class: 'lightbox__button lightbox__zoom', 'aria-label': 'Powiększ', onClick: () => setZoom(zoom > 1 ? 1 : 2.5) }, icon('zoomIn'));

  /** Szerokość obrazu dopasowanego do ekranu (zoom 1). */
  const fitWidth = () => {
    const item = images[index];
    const ratio = (item.width && item.height) ? item.width / item.height : (image.naturalWidth / (image.naturalHeight || 1)) || 1;
    const box = stage.getBoundingClientRect();
    return Math.max(1, Math.min(box.width, box.height * ratio));
  };

  /** Zmienia powiększenie tak, żeby punkt (x, y) ekranu został w miejscu. */
  const setZoom = (value, x = null, y = null) => {
    const next = Math.min(6, Math.max(1, value));
    const box = stage.getBoundingClientRect();
    const focusX = x ?? box.width / 2;
    const focusY = y ?? box.height / 2;
    const before = image.getBoundingClientRect();
    const relativeX = (stage.scrollLeft + focusX - Math.max(0, (box.width - before.width) / 2)) / before.width;
    const relativeY = (stage.scrollTop + focusY - Math.max(0, (box.height - before.height) / 2)) / before.height;
    zoom = next;
    image.style.width = `${fitWidth() * zoom}px`;
    stage.classList.toggle('lightbox__stage--zoomed', zoom > 1.01);
    const after = image.getBoundingClientRect();
    stage.scrollLeft = relativeX * after.width - focusX;
    stage.scrollTop = relativeY * after.height - focusY;
    zoomButton.setAttribute('aria-label', zoom > 1 ? 'Pomniejsz' : 'Powiększ');
  };

  const show = (target) => {
    if (target < 0 || target >= images.length) return;
    index = target;
    zoom = 1;
    image.src = images[index].url;
    image.style.width = '';
    stage.classList.remove('lightbox__stage--zoomed');
    requestAnimationFrame(() => { image.style.width = `${fitWidth()}px`; });
    counter.textContent = images.length > 1 ? `${index + 1} z ${images.length}` : '';
    previous.hidden = images.length < 2 || index === 0;
    next.hidden = images.length < 2 || index === images.length - 1;
  };

  // Gesty dotykowe: dwa palce – powiększanie; jeden palec bez powiększenia – przewijanie obrazów;
  // dwa szybkie dotknięcia – powiększenie w tym miejscu albo powrót.
  let pinch = null;
  let swipe = null;
  let lastTap = null;
  const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  stage.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      const box = stage.getBoundingClientRect();
      pinch = {
        distance: distance(event.touches),
        zoom,
        x: (event.touches[0].clientX + event.touches[1].clientX) / 2 - box.left,
        y: (event.touches[0].clientY + event.touches[1].clientY) / 2 - box.top
      };
      swipe = null;
    } else if (event.touches.length === 1) {
      const touch = event.touches[0];
      swipe = { x: touch.clientX, y: touch.clientY, time: event.timeStamp };
    }
  }, { passive: true });
  stage.addEventListener('touchmove', (event) => {
    if (pinch && event.touches.length === 2) {
      event.preventDefault();
      setZoom(pinch.zoom * (distance(event.touches) / pinch.distance), pinch.x, pinch.y);
    }
  }, { passive: false });
  stage.addEventListener('touchend', (event) => {
    if (pinch) {
      if (event.touches.length < 2) pinch = null;
      return;
    }
    const touch = event.changedTouches[0];
    if (!swipe || !touch) return;
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    const quick = event.timeStamp - swipe.time < 300;
    if (zoom <= 1.01 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      show(index + (dx < 0 ? 1 : -1));
      lastTap = null;
    } else if (quick && Math.hypot(dx, dy) < 12) {
      const box = stage.getBoundingClientRect();
      if (lastTap && event.timeStamp - lastTap.time < 320 && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 30) {
        event.preventDefault();
        setZoom(zoom > 1.01 ? 1 : 2.5, touch.clientX - box.left, touch.clientY - box.top);
        lastTap = null;
      } else {
        lastTap = { x: touch.clientX, y: touch.clientY, time: event.timeStamp };
      }
    }
    swipe = null;
  });
  stage.addEventListener('dblclick', (event) => {
    const box = stage.getBoundingClientRect();
    setZoom(zoom > 1.01 ? 1 : 2.5, event.clientX - box.left, event.clientY - box.top);
  });
  stage.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const box = stage.getBoundingClientRect();
    setZoom(zoom * Math.exp(-event.deltaY / 200), event.clientX - box.left, event.clientY - box.top);
  }, { passive: false });

  const onKey = (event) => {
    if (event.key === 'ArrowRight') show(index + 1);
    else if (event.key === 'ArrowLeft') show(index - 1);
    else if (event.key === '+' || event.key === '=') setZoom(zoom * 1.5);
    else if (event.key === '-') setZoom(zoom / 1.5);
    else return;
    event.preventDefault();
  };
  const onResize = () => { image.style.width = `${fitWidth() * zoom}px`; };

  const panel = h('div', { class: 'lightbox__panel', role: 'document' },
    h('div', { class: 'lightbox__bar' }, counter, h('span', { class: 'lightbox__spacer' }), zoomButton, close),
    stage, previous, next
  );
  dialog = mountDialog('lightbox', panel, {
    onClose: () => {
      window.removeEventListener('resize', onResize);
    }
  });
  dialog.setAttribute('aria-label', 'Podgląd obrazu');
  dialog.dataset.testid = 'lightbox';
  dialog.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  image.addEventListener('load', onResize);
  show(index);
  focusPanel(panel);
  return dialog;
}

/** Powiększenie obrazu notatki; obrazy bez pliku na urządzeniu są pomijane. */
function openImage(images, index) {
  const shown = images.filter((image) => image.url);
  const at = shown.indexOf(images[index]);
  if (at < 0) {
    toast('Pliku tego obrazu nie ma na tym urządzeniu. Przywróć plik obrazów i załączników w Ustawieniach (Kopia zapasowa).', { kind: 'error' });
    return;
  }
  openLightbox(shown, at);
}

/** Fokus na panelu okna zamiast na pierwszym przycisku (bez ramki fokusu po otwarciu). */
function focusPanel(panel) {
  panel.tabIndex = -1;
  panel.classList.add('dialog-focus');
  panel.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- czytanie na głos

/**
 * Czytanie notatki na głos (synteza mowy urządzenia, głos i tempo z Ustawień): zdanie po
 * zdaniu, od pierwszej widocznej strony. Czytany akapit jest wyróżniony, a strony przewracają
 * się same. Zwraca { playing, play(), pause(), stop() }; onChange(playing) – zmiana stanu.
 */
function noteReader(book, language, settings, onChange) {
  let parts = [];
  let position = 0;
  let version = -1;
  let cancel = null;
  let marked = null;
  const reader = { playing: false };

  const mark = (element) => {
    if (marked === element) return;
    marked?.classList.remove('note-reading');
    marked = element;
    marked?.classList.add('note-reading');
  };
  const load = () => {
    parts = book.readingParts().flatMap((part) => sentences(part.text).map((text) => ({ ...part, text })));
    version = book.version;
  };
  /** Gdy bieżący fragment nie jest na widocznej stronie – od pierwszego fragmentu tej strony. */
  const fromVisible = () => {
    const visible = book.visiblePages();
    if (parts[position] && visible.includes(parts[position].page)) return;
    const found = parts.findIndex((part) => visible.includes(part.page));
    position = found >= 0 ? found : 0;
  };
  const step = () => {
    if (!reader.playing) return;
    if (version !== book.version) {
      // Strony podzielone od nowa (np. obrót telefonu) – dalej od widocznej strony.
      load();
      fromVisible();
    }
    const part = parts[position];
    if (!part) {
      reader.stop();
      return;
    }
    mark(part.element);
    book.showPage(part.page);
    cancel = speakThen(part.text, language, settings(), () => {
      cancel = null;
      if (!reader.playing) return;
      position += 1;
      step();
    });
  };

  reader.play = () => {
    if (reader.playing) return;
    if (version !== book.version || parts.length === 0) load();
    if (position >= parts.length) position = 0;
    fromVisible();
    reader.playing = true;
    onChange(true);
    step();
  };
  reader.pause = () => {
    if (!reader.playing) return;
    reader.playing = false;
    cancel?.();
    cancel = null;
    stopSpeaking();
    onChange(false);
  };
  reader.stop = () => {
    reader.pause();
    mark(null);
    position = 0;
  };
  return reader;
}

// ---------------------------------------------------------------- okno notatki

/**
 * Otwiera notatkę lekcji. Gdy notatki nie ma (albo edit: true) – od razu w trybie edycji.
 * Zwraca obietnicę rozwiązaną po zamknięciu okna.
 */
export function openLessonNote(ctx, lessonID, { edit = false } = {}) {
  const { library } = ctx;
  const lesson = library.getLesson(lessonID);
  if (!lesson) return showError(new Error('Lekcja nie istnieje. Mogła zostać usunięta.'));

  return new Promise((resolve) => {
    const titleID = `note-title-${++titleCounter}`;
    const urls = urlPool();
    /** Obrazy notatki z bajtami: { id, stored, bytes, type, width, height, name, url } (bez pliku – url null). */
    let stored = [];
    /** Załączniki notatki: opisy bez bajtów, `missing` – pliku nie ma na urządzeniu. */
    let files = [];
    let mode = null;
    let editor = null;
    let book = null;
    let reader = null;
    /** Wersja językowa w podglądzie ('pl' | 'en'); null – ostatnio wybrana w aplikacji. */
    let language = null;
    let dialog;

    const leftButton = h('button', { type: 'button', class: 'button button--plain', dataset: { testid: 'note-left' } });
    const rightButton = h('button', { type: 'button', class: 'button button--primary sheet__submit', dataset: { testid: 'note-right' } });
    const title = h('h2', { class: 'sheet__title', id: titleID }, 'Notatka');
    const body = h('div', { class: 'sheet__body note-sheet__body' });
    const panel = h('div', { class: 'sheet__panel note-sheet', 'aria-labelledby': titleID },
      h('header', { class: 'sheet__header' }, leftButton, title, rightButton),
      body
    );

    const loadMedia = async () => {
      urls.release();
      const images = await library.noteImages(lessonID, { withMissing: true });
      stored = images.map((image) => ({ ...image, stored: true, url: image.bytes ? urls.add(image) : null }));
      files = await library.noteFileList(lessonID);
    };
    const loadFile = (meta) => library.mediaBytes('noteFiles', meta.id);

    /** Ścieżka i nazwa lekcji; tools – przełącznik języka i czytanie (w podglądzie). */
    const heading = (tools = null) => {
      const path = library.lessonPath(lessonID).split(' › ');
      const current = library.getLesson(lessonID);
      return h('div', { class: 'note-sheet__heading' },
        h('div', { class: 'note-sheet__titles' },
          path.length > 1 ? h('p', { class: 'note-sheet__path' }, path.slice(0, -1).join(' › ')) : null,
          h('h3', { class: 'note-sheet__lesson' }, current?.name ?? lesson.name)
        ),
        tools
      );
    };

    /** Wersja do pokazania: wybrana, a gdy jej nie ma w notatce – ta, która jest. */
    const pickLanguage = (note) => {
      const has = { pl: !isEmptyNoteHtml(note.html), en: !isEmptyNoteHtml(note.htmlEN ?? '') };
      const wanted = language ?? (library.getSettings().noteLanguage === 'en' ? 'en' : 'pl');
      if (has[wanted]) return wanted;
      if (has.pl) return 'pl';
      return has.en ? 'en' : 'pl';
    };

    const close = () => dialog.close('done');

    const requestClose = async () => {
      if (mode === 'edit' && editor?.dirty()) {
        const discard = await confirmDialog({
          title: 'Odrzucić zmiany?',
          message: 'Zmiany w notatce nie zostaną zapisane.',
          confirmLabel: 'Odrzuć',
          cancelLabel: 'Edytuj dalej',
          destructive: true
        });
        if (!discard) return;
      }
      if (mode === 'edit' && library.getNote(lessonID)) {
        showView();
        return;
      }
      close();
    };

    /**
     * Tryb podglądu w stronach (książka) albo zwykły układ przewijany (edycja, state null).
     * Kilka stron (i pomiar) – okno o stałej wysokości; dwie strony obok siebie – szersze okno.
     */
    const setPaged = (state) => {
      body.classList.toggle('note-sheet__body--book', state !== null);
      panel.classList.toggle('note-sheet--paged', state !== null && state !== 'single');
      dialog?.classList.toggle('note-dialog--spread', state === 'measure-spread' || state === 'spread');
    };

    function showView() {
      reader?.stop();
      reader = null;
      const note = library.getNote(lessonID);
      if (!note) {
        close();
        return;
      }
      mode = 'view';
      editor?.destroy();
      editor = null;
      book?.destroy();
      leftButton.textContent = 'Zamknij';
      rightButton.textContent = 'Edytuj';
      rightButton.disabled = false;
      language = pickLanguage(note);
      const html = language === 'en' ? (note.htmlEN ?? '') : note.html;
      const attachments = files.length > 0 ? attachmentList(files, (meta) => openAttachment(meta, () => loadFile(meta))) : null;
      if (isEmptyNoteHtml(html) && stored.length === 0) {
        // Notatka z samymi załącznikami – bez stron.
        book = null;
        setPaged(null);
        replaceChildren(body, heading(), attachments, h('p', { class: 'note-sheet__only-files' }, 'Notatka ma tylko załączniki.'));
        return;
      }
      // Treść jest normalizowana przed wstawieniem – tylko bezpieczne znaczniki notatki.
      book = noteBook({
        html,
        images: stored,
        imagesFirst: note.imagesFirst === true,
        language,
        onOpenImage: (index) => openImage(stored, index),
        onLayout: setPaged,
        spread: library.getSettings().noteSpread !== false,
        onSpreadChange: (spread) => library.updateSettings({ noteSpread: spread }).catch((error) => console.error(error))
      });
      replaceChildren(body,
        heading(viewTools(note, html)),
        attachments,
        book.element,
        h('div', { class: 'note-sheet__footer' },
          !isEmptyNoteHtml(html)
            ? h('button', {
                type: 'button', class: 'button button--secondary note-sheet__copy', dataset: { testid: 'note-copy' },
                onClick: () => copyNote(note, stored, language)
              }, icon('copy', { size: 18 }), h('span', null, 'Kopiuj notatkę'))
            : null,
          book.pager
        )
      );
      book.layout();
    }

    /** Przełącznik PL / EN (gdy notatka ma obie wersje) i czytanie na głos. */
    function viewTools(note, html) {
      const tools = [];
      if (!isEmptyNoteHtml(note.html) && !isEmptyNoteHtml(note.htmlEN ?? '')) {
        tools.push(h('div', { class: 'note-sheet__language', dataset: { testid: 'note-language' } }, segmented({
          name: `${titleID}-language`,
          label: 'Język notatki',
          value: language,
          options: [{ value: 'pl', label: 'PL' }, { value: 'en', label: 'EN' }],
          onChange: (value) => {
            language = value;
            library.updateSettings({ noteLanguage: value }).catch((error) => console.error(error));
            showView();
          }
        })));
      }
      if (speechAvailable() && !isEmptyNoteHtml(html)) {
        const button = iconButton('speaker', 'Czytaj notatkę na głos', () => (reader.playing ? reader.pause() : reader.play()),
          { className: 'note-sheet__listen', pressed: false });
        button.dataset.testid = 'note-listen';
        reader = noteReader(book, language, () => library.getSettings(), (playing) => {
          button.setAttribute('aria-pressed', String(playing));
          const label = playing ? 'Zatrzymaj czytanie' : 'Czytaj notatkę na głos';
          button.setAttribute('aria-label', label);
          button.title = label;
          replaceChildren(button, icon(playing ? 'pause' : 'speaker'));
        });
        tools.push(button);
      }
      return tools.length > 0 ? h('div', { class: 'note-sheet__tools' }, tools) : null;
    }

    function showEdit() {
      mode = 'edit';
      reader?.stop();
      reader = null;
      book?.destroy();
      book = null;
      setPaged(null);
      const note = library.getNote(lessonID);
      leftButton.textContent = 'Anuluj';
      rightButton.textContent = 'Zapisz';
      editor?.destroy();
      editor = noteEditor({
        html: note?.html ?? '',
        htmlEN: note?.htmlEN ?? '',
        language: language ?? 'pl',
        images: stored,
        imagesFirst: note?.imagesFirst === true,
        files,
        loadFile,
        urls,
        titleID
      });
      replaceChildren(body,
        heading(),
        editor.element,
        note ? h('div', { class: 'note-sheet__actions' },
          h('button', {
            type: 'button', class: 'button button--danger-plain', dataset: { testid: 'note-delete' },
            onClick: async () => {
              const confirmed = await confirmDialog({
                title: 'Usunąć notatkę?',
                message: 'Tekst, obrazy i załączniki notatki zostaną usunięte. Pojęcia lekcji zostają.',
                confirmLabel: 'Usuń',
                destructive: true
              });
              if (!confirmed) return;
              try {
                await library.deleteNote(lessonID);
                toast('Usunięto notatkę.');
                close();
              } catch (error) {
                await showError(error);
              }
            }
          }, icon('trash', { size: 18 }), h('span', null, 'Usuń notatkę'))
        ) : null
      );
      editor.focus();
    }

    const save = async () => {
      if (!editor || rightButton.disabled) return;
      if (editor.busy()) {
        toast('Poczekaj, aż obrazy i załączniki zostaną wczytane.');
        return;
      }
      rightButton.disabled = true;
      try {
        const draft = editor.draft();
        const saved = await library.saveNote(lessonID, draft);
        // Załączniki bywają duże – prosimy przeglądarkę, żeby nie usuwała danych przy braku miejsca.
        if (draft.files.some((file) => file.bytes)) navigator.storage?.persist?.().catch(() => {});
        // Po zapisie podgląd w języku, w którym była edytowana treść (jeśli ta wersja nie jest pusta).
        language = editor.language();
        await loadMedia();
        if (!saved) {
          toast('Notatka jest pusta – usunięto ją.');
          close();
          return;
        }
        toast('Zapisano notatkę.');
        showView();
      } catch (error) {
        await showError(error);
      } finally {
        rightButton.disabled = false;
      }
    };

    leftButton.addEventListener('click', () => requestClose());
    rightButton.addEventListener('click', () => {
      if (mode === 'view') showEdit();
      else save();
    });
    // Kółko myszy w podglądzie przewraca strony notatki (nasłuch nie pasywny – blokuje przewijanie).
    panel.addEventListener('wheel', (event) => {
      if (mode === 'view' && book?.handleWheel(event)) event.preventDefault();
    }, { passive: false });
    panel.addEventListener('keydown', (event) => {
      if (mode === 'edit' && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        save();
      } else if (mode === 'view' && book?.handleKey(event)) {
        event.preventDefault();
      }
    });

    dialog = mountDialog('sheet note-dialog', panel, {
      onDismiss: () => requestClose(),
      onClose: () => {
        reader?.stop();
        editor?.destroy();
        book?.destroy();
        urls.release();
        resolve();
      }
    });
    dialog.dataset.testid = 'note-dialog';
    // Przeglądarka ustawia fokus na pierwszym przycisku („Zamknij”), a Safari obrysowuje go
    // ramką. Fokus na samym oknie: bez ramki, a Tab i klawisze dalej działają w oknie.
    focusPanel(panel);
    replaceChildren(body, heading(), h('p', { class: 'picker__empty' }, 'Wczytywanie…'));
    loadMedia()
      .catch((error) => console.error(error))
      .finally(() => {
        if (!dialog.open) return;
        if (edit || !library.getNote(lessonID)) showEdit();
        else showView();
      });
  });
}

// ---------------------------------------------------------------- edytor

/**
 * Edytor notatki: obrazy, załączniki, pasek formatowania i pole tekstu.
 * files – opisy załączników notatki, loadFile(meta) → bajty zapisanego załącznika.
 * Zwraca { element, draft(), dirty(), busy(), focus(), destroy() }.
 */
function noteEditor({ html, htmlEN = '', language = 'pl', images, urls, imagesFirst = false, files = [], loadFile = null, titleID = 'note' }) {
  const initialTexts = { pl: normalizeNoteHtml(html), en: normalizeNoteHtml(htmlEN) };
  const state = {
    images: withImageLabels(images.map((image) => ({ ...image }))),
    imagesFirst,
    /** Załączniki: zapisane { id, name, type, size, stored: true } albo nowe { name, type, size, bytes }. */
    files: files.map((file) => ({ ...file, stored: true })),
    filesPending: 0,
    /** Treść obu wersji językowych; w polu jest wersja `language` (jej stan jest w polu). */
    texts: { ...initialTexts },
    language: language === 'en' ? 'en' : 'pl',
    pending: 0,
    range: null
  };
  const imagesKey = () => state.images.map((image) => `${image.id ?? image.url}:${image.label}`).join(',');
  const initialImages = imagesKey();
  let added = 0;
  const filesKey = () => state.files.map((file) => `${file.id ?? file.key}:${file.name}`).join('\n');
  const initialFiles = filesKey();

  const area = h('div', {
    class: 'note-text note-editor__area',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'Treść notatki',
    spellcheck: 'true',
    lang: state.language,
    dataset: { testid: 'note-editor' }
  });

  /** Pole pokazuje wersję w danym języku (podpowiedź, język sprawdzania pisowni, etykieta). */
  const showLanguage = (value) => {
    state.language = value;
    area.innerHTML = state.texts[value] || '<p><br></p>';
    area.lang = value;
    area.dataset.placeholder = value === 'en' ? 'Treść notatki po angielsku…' : 'Wpisz albo wklej treść notatki…';
    area.setAttribute('aria-label', value === 'en' ? 'Treść notatki po angielsku' : 'Treść notatki');
    state.range = null;
  };
  showLanguage(state.language);

  const syncEmpty = () => area.classList.toggle('note-editor__area--empty', area.textContent.trim() === '' && !area.querySelector('li'));

  // ---- pasek formatowania
  const buttons = new Map();
  const colorPanel = h('div', { class: 'note-colors', hidden: true, role: 'group', 'aria-label': 'Kolor tekstu' },
    [...NOTE_COLORS.map((color) => h('button', {
      type: 'button', class: 'note-colors__swatch', dataset: { color: color.id }, 'aria-label': color.label, title: color.label,
      onMousedown: (event) => event.preventDefault(),
      onClick: () => { run('foreColor', color.hex); colorPanel.hidden = true; }
    })), h('button', {
      type: 'button', class: 'note-colors__swatch note-colors__swatch--none', 'aria-label': 'Bez koloru', title: 'Bez koloru',
      onMousedown: (event) => event.preventDefault(),
      onClick: () => { run('foreColor', NO_COLOR); colorPanel.hidden = true; }
    }, icon('close', { size: 16 }))]
  );

  const toolbar = h('div', { class: 'note-toolbar', role: 'toolbar', 'aria-label': 'Formatowanie tekstu' },
    FORMAT_BUTTONS.map((definition) => {
      const button = h('button', {
        type: 'button',
        class: `note-toolbar__button${definition.command === 'color' ? ' note-toolbar__button--color' : ''}`,
        'aria-label': definition.label,
        title: definition.keys ? `${definition.label} (${definition.keys})` : definition.label,
        dataset: { command: definition.command, testid: `note-format-${definition.command}` },
        // Przycisk nie zabiera fokusu – zaznaczenie w tekście zostaje.
        onMousedown: (event) => event.preventDefault(),
        onClick: () => {
          if (definition.command === 'color') {
            colorPanel.hidden = !colorPanel.hidden;
            return;
          }
          if (definition.command === 'pageBreak') {
            insertBlock(h('hr', { 'data-page': '' }));
            return;
          }
          if (definition.command === 'heading') {
            const block = String(document.queryCommandValue('formatBlock') ?? '').toLowerCase();
            run('formatBlock', block === 'h3' ? '<p>' : '<h3>');
            return;
          }
          run(definition.command);
        }
      }, icon(definition.icon, { size: 20 }));
      if (!['color', 'removeFormat', 'pageBreak'].includes(definition.command)) button.setAttribute('aria-pressed', 'false');
      buttons.set(definition.command, button);
      return button;
    })
  );

  const restoreSelection = () => {
    if (document.activeElement !== area) area.focus({ preventScroll: true });
    if (state.range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(state.range);
    }
  };

  function run(command, value = null) {
    restoreSelection();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(command, false, value);
    syncEmpty();
    updateToolbar();
  }

  /**
   * „Nowa strona” i odwołanie do obrazu zawsze między blokami: na końcu bloku – wstawiony blok
   * i pusty akapit do pisania dalej; w środku akapitu – akapit dzieli się na dwa; w liście – lista
   * dzieli się po bieżącym punkcie. Bez kursora w tekście – na końcu.
   */
  function insertBlock(inserted) {
    restoreSelection();
    const selection = window.getSelection();
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    let block = range && area.contains(range.startContainer) ? range.startContainer : area.lastChild;
    if (block === area) block = area.childNodes[Math.max(0, range.startOffset - 1)] ?? area.lastChild;
    while (block && block.parentNode !== area) block = block.parentNode;
    const empty = h('p', null, h('br'));
    let after = [empty];
    let caretTarget = empty;
    if (block?.nodeType === 1 && /^(UL|OL)$/.test(block.tagName)) {
      let item = range.startContainer;
      while (item && item.parentNode !== block) item = item.parentNode;
      const items = [...block.children];
      const following = item ? items.slice(items.indexOf(item) + 1) : [];
      if (following.length > 0) {
        const rest = document.createElement(block.tagName);
        rest.append(...following);
        after = [empty, rest];
      }
    } else if (block?.nodeType === 1 && range) {
      // Tekst za kursorem przechodzi na nową stronę.
      const tail = range.cloneRange();
      tail.collapse(true);
      tail.setEnd(block, block.childNodes.length);
      const moved = tail.extractContents();
      if (moved.textContent.trim() !== '') {
        const rest = block.cloneNode(false);
        rest.append(moved);
        after = [rest];
        caretTarget = rest;
      }
      if (block.textContent === '' && !block.querySelector('br')) block.append(h('br'));
    }
    if (block) block.after(inserted, ...after);
    else area.append(inserted, ...after);
    const caret = document.createRange();
    caret.setStart(caretTarget, 0);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    state.range = caret.cloneRange();
    syncEmpty();
    updateToolbar();
  }

  function updateToolbar() {
    for (const [command, button] of buttons) {
      if (!button.hasAttribute('aria-pressed')) continue;
      let active = false;
      try {
        active = command === 'heading'
          ? String(document.queryCommandValue('formatBlock') ?? '').toLowerCase() === 'h3'
          : document.queryCommandState(command);
      } catch {
        active = false;
      }
      button.setAttribute('aria-pressed', String(Boolean(active)));
    }
  }

  const onSelectionChange = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!area.contains(range.commonAncestorContainer)) return;
    state.range = range.cloneRange();
    updateToolbar();
  };
  document.addEventListener('selectionchange', onSelectionChange);

  area.addEventListener('focus', () => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  });
  area.addEventListener('input', syncEmpty);
  area.addEventListener('keydown', (event) => {
    // Skróty jak w edytorach tekstu (przeglądarka obsługuje je i tak; tu – spójnie w każdej).
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const command = { b: 'bold', i: 'italic', u: 'underline' }[key];
    if (command) {
      event.preventDefault();
      run(command);
    }
  });

  // Wklejanie: obrazy trafiają do sekcji obrazów, tekst – z formatowaniem, ale oczyszczony.
  area.addEventListener('paste', (event) => {
    const data = event.clipboardData;
    if (!data) return;
    const files = [...(data.files ?? [])].filter((file) => file.type.startsWith('image/'));
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (files.length > 0 && !text) {
      event.preventDefault();
      addFiles(files);
      return;
    }
    event.preventDefault();
    if (files.length > 0) addFiles(files);
    if (html) {
      // Przeglądarka najpierw porządkuje HTML (np. z Worda), potem zostaje tylko to, co notatka obsługuje.
      const parsed = new window.DOMParser().parseFromString(html, 'text/html');
      const clean = normalizeNoteHtml(parsed.body.innerHTML);
      if (clean) document.execCommand('insertHTML', false, clean);
    } else if (text) {
      document.execCommand('insertText', false, text);
    }
    syncEmpty();
  });

  // ---- obrazy
  const grid = h('div', { class: 'note-images', dataset: { testid: 'note-images' } });
  const status = h('p', { class: 'note-images__status', role: 'status' });
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', multiple: true, hidden: true, dataset: { testid: 'note-image-input' },
    onChange: () => {
      addFiles([...fileInput.files]);
      fileInput.value = '';
    }
  });

  const moveImage = (index, delta) => {
    const [image] = state.images.splice(index, 1);
    state.images.splice(index + delta, 0, image);
    renderImages();
  };

  /** Odwołanie [[sygnatura]] w osobnej linijce w miejscu kursora (bez kursora – na końcu tekstu). */
  const insertReference = (image) => insertBlock(h('p', null, referenceToken(image.label)));

  /** Zmiana sygnatury obrazu; odwołania w obu wersjach treści dostają nową sygnaturę. */
  function renameImage(image) {
    let value = image.label;
    const input = textInput({ value, onInput: (text) => { value = text; }, autocapitalize: 'sentences', testID: 'note-image-label' });
    input.maxLength = IMAGE_LABEL_MAX;
    openFormSheet({
      title: 'Sygnatura obrazu',
      build: () => field('Sygnatura', input, { hint: `W tekście obraz wstawisz linijką ${referenceToken(image.label)} – po zmianie sygnatury odwołania zmienią się same.` }),
      onSubmit: () => {
        const label = cleanImageLabel(value);
        if (label === '') throw new Error('Wpisz sygnaturę obrazu.');
        if (state.images.some((other) => other !== image && labelKey(other.label) === labelKey(label))) {
          throw new Error('Inny obraz tej notatki ma już tę sygnaturę.');
        }
        const previous = image.label;
        image.label = label;
        state.texts[state.language] = areaHtml();
        for (const key of ['pl', 'en']) state.texts[key] = renameReferences(state.texts[key], previous, label);
        if (areaHtml() !== state.texts[state.language]) {
          area.innerHTML = state.texts[state.language] || '<p><br></p>';
          state.range = null;
        }
        renderImages();
      }
    });
    requestAnimationFrame(() => input.select());
  }

  function renderImages() {
    const tiles = state.images.map((image, index) => h('div', { class: 'note-images__item' },
      h('button', {
        type: 'button', class: 'note-images__open', 'aria-label': `${image.label} – polecenia`,
        onClick: () => openMenu({
          title: image.label,
          items: [
            { label: 'Wstaw do tekstu', icon: 'note', onSelect: () => insertReference(image) },
            { label: 'Zmień sygnaturę', icon: 'edit', onSelect: () => renameImage(image) },
            { label: 'Powiększ', icon: 'zoomIn', disabled: !image.url, onSelect: () => openImage(state.images, index) },
            { label: 'Przesuń wcześniej', icon: 'arrowLeft', disabled: index === 0, onSelect: () => moveImage(index, -1) },
            { label: 'Przesuń dalej', icon: 'arrowRight', disabled: index === state.images.length - 1, onSelect: () => moveImage(index, 1) },
            'separator',
            { label: 'Usuń obraz', icon: 'trash', destructive: true, onSelect: () => { state.images.splice(index, 1); renderImages(); } }
          ]
        })
      }, image.url
        ? h('img', { src: image.url, alt: '' })
        : h('span', { class: 'note-images__missing', dataset: { testid: 'note-image-missing' } }, icon('image', { size: 20 }), 'Brak pliku')),
      h('button', {
        type: 'button', class: 'note-images__remove', 'aria-label': `Usuń obraz ${image.label}`, dataset: { testid: 'note-image-remove' },
        onClick: () => { state.images.splice(index, 1); renderImages(); }
      }, icon('close', { size: 14 })),
      h('span', { class: 'note-images__label', dataset: { testid: 'note-image-label-text' } }, image.label)
    ));
    for (let index = 0; index < state.pending; index += 1) {
      tiles.push(h('div', { class: 'note-images__item note-images__item--pending', 'aria-hidden': 'true' }, h('span', { class: 'note-images__spinner' })));
    }
    const full = state.images.length + state.pending >= NOTE_IMAGE_LIMIT;
    tiles.push(h('button', {
      type: 'button', class: 'note-images__add', disabled: full, dataset: { testid: 'note-image-add' },
      onClick: () => fileInput.click()
    }, icon('plus', { size: 22 }), h('span', null, 'Dodaj obraz')));
    replaceChildren(grid, tiles);
    placement.hidden = state.images.length === 0;
    status.textContent = state.pending > 0 ? 'Przygotowanie obrazu…' : (full ? `Notatka może mieć najwyżej ${NOTE_IMAGE_LIMIT} obrazów.` : '');
  }

  async function addFiles(files) {
    const room = NOTE_IMAGE_LIMIT - state.images.length - state.pending;
    const accepted = files.slice(0, Math.max(0, room));
    if (accepted.length < files.length) toast(`Notatka może mieć najwyżej ${NOTE_IMAGE_LIMIT} obrazów.`);
    state.pending += accepted.length;
    renderImages();
    for (const file of accepted) {
      try {
        const prepared = await prepareImage(file, { name: file.name || null });
        // Nowy obraz dostaje kolejną wolną sygnaturę „Obraz N”.
        state.images = withImageLabels([...state.images, { ...prepared, stored: false, url: urls.add(prepared), label: null }]);
      } catch (error) {
        toast(error?.message ?? 'Nie udało się dodać obrazu.', { kind: 'error' });
      } finally {
        state.pending -= 1;
        renderImages();
      }
    }
  }

  // Gdzie obrazy są w podglądzie notatki: przed tekstem albo po nim (widać, gdy są obrazy).
  const placement = h('div', { class: 'note-images__placement', dataset: { testid: 'note-image-placement' } },
    h('span', { class: 'note-images__placement-label' }, 'W podglądzie'),
    segmented({
      name: 'note-image-placement',
      label: 'Obrazy w podglądzie',
      value: state.imagesFirst ? 'before' : 'after',
      options: [{ value: 'before', label: 'Przed tekstem' }, { value: 'after', label: 'Po tekście' }],
      onChange: (value) => { state.imagesFirst = value === 'before'; }
    })
  );

  const imagesSection = h('section', { class: 'note-editor__images' },
    h('h3', { class: 'form-group__title' }, 'Obrazy'),
    grid,
    status,
    placement,
    h('p', { class: 'field__hint' },
      'Dotknij obrazu, żeby wstawić go do tekstu, zmienić sygnaturę, powiększyć, przesunąć albo usunąć. Linijka ',
      h('code', null, '[[sygnatura]]'),
      ' w tekście to miejsce obrazu w notatce; obrazy bez odwołania są przed tekstem albo po nim. Obraz możesz też wkleić do tekstu – trafi tutaj.'),
    fileInput
  );

  // ---- załączniki
  const fileList = h('ul', { class: 'note-attachments', dataset: { testid: 'note-attachments' } });
  const fileStatus = h('p', { class: 'note-images__status', role: 'status' });
  const attachInput = h('input', {
    type: 'file', multiple: true, hidden: true, dataset: { testid: 'note-file-input' },
    onChange: () => {
      addAttachments([...attachInput.files]);
      attachInput.value = '';
    }
  });

  const moveFile = (index, delta) => {
    const [file] = state.files.splice(index, 1);
    state.files.splice(index + delta, 0, file);
    renderFiles();
  };
  const removeFile = (index) => {
    state.files.splice(index, 1);
    renderFiles();
  };

  function renameFile(file) {
    let value = file.name;
    const input = textInput({ value, onInput: (text) => { value = text; }, autocapitalize: 'off', testID: 'note-attachment-rename' });
    input.maxLength = FILE_NAME_MAX;
    const extension = fileExtension(file.name);
    openFormSheet({
      title: 'Nazwa załącznika',
      build: () => field('Nazwa pliku', input, { hint: extension ? `Rozszerzenie .${extension} zostaje – po nim system wie, czym otworzyć plik.` : null }),
      onSubmit: () => {
        if (value.trim() === '') throw new Error('Wpisz nazwę pliku.');
        file.name = renamedFile(file.name, value);
        renderFiles();
      }
    });
    requestAnimationFrame(() => {
      // Zaznaczona sama nazwa, bez rozszerzenia.
      const end = extension && input.value.toLowerCase().endsWith(`.${extension}`) ? input.value.length - extension.length - 1 : input.value.length;
      input.setSelectionRange(0, end);
    });
  }

  /** Otwarcie załącznika z edytora: zapisany – z bazy, dodany przed chwilą – z pamięci. */
  const openFile = (file) => openAttachment(file, async () => (file.stored ? loadFile?.(file) ?? null : file.bytes));

  function renderFiles() {
    const rows = state.files.map((file, index) => h('li', { class: 'note-attachments__item' },
      h('button', {
        type: 'button', class: 'note-attachments__open', 'aria-label': `${file.name} – polecenia`, dataset: { testid: 'note-attachment' },
        onClick: () => openMenu({
          title: file.name,
          items: [
            { label: 'Zmień nazwę', icon: 'edit', onSelect: () => renameFile(file) },
            { label: 'Otwórz', icon: 'external', disabled: Boolean(file.missing), onSelect: () => openFile(file) },
            { label: 'Przesuń wyżej', icon: 'arrowUp', disabled: index === 0, onSelect: () => moveFile(index, -1) },
            { label: 'Przesuń niżej', icon: 'arrowDown', disabled: index === state.files.length - 1, onSelect: () => moveFile(index, 1) },
            'separator',
            { label: 'Usuń załącznik', icon: 'trash', destructive: true, onSelect: () => removeFile(index) }
          ]
        })
      },
        fileBadge(file),
        h('span', { class: 'note-attachments__text' },
          h('span', { class: 'note-attachments__name', dataset: { testid: 'note-attachment-name' } }, file.name),
          h('span', { class: 'note-attachments__meta' }, fileDescription(file))
        )
      ),
      h('button', {
        type: 'button', class: 'note-attachments__remove', 'aria-label': `Usuń załącznik ${file.name}`, dataset: { testid: 'note-attachment-remove' },
        onClick: () => removeFile(index)
      }, icon('close', { size: 16 }))
    ));
    for (let index = 0; index < state.filesPending; index += 1) {
      rows.push(h('li', { class: 'note-attachments__item note-attachments__item--pending', 'aria-hidden': 'true' }, h('span', { class: 'note-images__spinner' })));
    }
    const full = state.files.length + state.filesPending >= NOTE_FILE_LIMIT;
    rows.push(h('li', null, h('button', {
      type: 'button', class: 'note-attachments__add', disabled: full, dataset: { testid: 'note-attachment-add' },
      onClick: () => attachInput.click()
    }, icon('paperclip', { size: 20 }), h('span', null, 'Dodaj załącznik'))));
    replaceChildren(fileList, rows);
    fileStatus.textContent = state.filesPending > 0 ? 'Wczytywanie pliku…' : (full ? `Notatka może mieć najwyżej ${NOTE_FILE_LIMIT} załączników.` : '');
  }

  async function addAttachments(list) {
    const room = NOTE_FILE_LIMIT - state.files.length - state.filesPending;
    const accepted = list.slice(0, Math.max(0, room));
    if (accepted.length < list.length) toast(`Notatka może mieć najwyżej ${NOTE_FILE_LIMIT} załączników.`);
    for (const file of accepted) {
      const name = cleanFileName(file.name);
      if (file.size > NOTE_FILE_MAX_BYTES) {
        toast(`Plik „${name}” jest za duży (limit to 50 MB).`, { kind: 'error' });
        continue;
      }
      if (file.size === 0) {
        toast(`Plik „${name}” jest pusty.`, { kind: 'error' });
        continue;
      }
      state.filesPending += 1;
      renderFiles();
      try {
        const bytes = await file.arrayBuffer();
        added += 1;
        state.files.push({ key: `new-${added}`, stored: false, name, type: fileTypeOf(name, file.type), size: bytes.byteLength, bytes });
      } catch {
        toast(`Nie udało się wczytać pliku „${name}”.`, { kind: 'error' });
      } finally {
        state.filesPending -= 1;
        renderFiles();
      }
    }
  }

  const filesSection = h('section', { class: 'note-editor__files' },
    h('h3', { class: 'form-group__title' }, 'Załączniki'),
    fileList,
    fileStatus,
    h('p', { class: 'field__hint' },
      'PDF, Word, Excel, PowerPoint i inne pliki do 50 MB. Dotknij pliku, żeby zmienić nazwę, otworzyć, przesunąć albo usunąć. '
      + 'Załączniki przenosi plik obrazów i załączników kopii zapasowej; eksport do arkusza ich nie obejmuje.'),
    attachInput
  );

  // Obrazy na górze, pod nimi załączniki, na końcu tekst. Upuszczenie plików na edytor
  // (komputer) dodaje obrazy albo załączniki.
  const element = h('div', { class: 'note-editor' },
    imagesSection,
    filesSection,
    h('section', { class: 'note-editor__text' },
      h('div', { class: 'note-editor__text-head' },
        h('h3', { class: 'form-group__title' }, 'Tekst'),
        h('div', { class: 'note-editor__language', dataset: { testid: 'note-edit-language' } }, segmented({
          name: `${titleID}-edit-language`,
          label: 'Język treści',
          value: state.language,
          options: [{ value: 'pl', label: 'Polski' }, { value: 'en', label: 'Angielski' }],
          onChange: (value) => {
            state.texts[state.language] = areaHtml();
            showLanguage(value);
            syncEmpty();
          }
        }))
      ),
      h('div', { class: 'note-editor__toolbar' }, toolbar, colorPanel),
      area
    )
  );
  element.addEventListener('dragover', (event) => {
    if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) {
      event.preventDefault();
      element.classList.add('note-editor--drop');
    }
  });
  element.addEventListener('dragleave', () => element.classList.remove('note-editor--drop'));
  // Upuszczone obrazy trafiają do obrazów, pozostałe pliki – do załączników.
  element.addEventListener('drop', (event) => {
    const dropped = [...(event.dataTransfer?.files ?? [])];
    element.classList.remove('note-editor--drop');
    if (dropped.length === 0) return;
    event.preventDefault();
    const pictures = dropped.filter((file) => file.type.startsWith('image/'));
    if (pictures.length > 0) addFiles(pictures);
    const others = dropped.filter((file) => !file.type.startsWith('image/'));
    if (others.length > 0) addAttachments(others);
  });

  renderImages();
  renderFiles();
  syncEmpty();

  /** Treść pola: linie poziome w edytorze pochodzą tylko z „Nowa strona”, więc to podziały stron. */
  const areaHtml = () => {
    for (const rule of area.querySelectorAll('hr:not([data-page])')) rule.setAttribute('data-page', '');
    return normalizeNoteHtml(area.innerHTML);
  };

  /** Treść obu wersji z bieżącym stanem pola. */
  const texts = () => ({ ...state.texts, [state.language]: areaHtml() });

  return {
    element,
    draft() {
      const current = texts();
      return {
        html: current.pl,
        htmlEN: current.en,
        imagesFirst: state.imagesFirst,
        images: state.images.map((image) => (image.stored
          ? { id: image.id, label: image.label }
          : { bytes: image.bytes, type: image.type, width: image.width, height: image.height, name: image.name ?? null, label: image.label })),
        files: state.files.map((file) => (file.stored
          ? { id: file.id, name: file.name }
          : { bytes: file.bytes, name: file.name, type: file.type }))
      };
    },
    dirty() {
      const current = texts();
      return current.pl !== initialTexts.pl || current.en !== initialTexts.en
        || imagesKey() !== initialImages
        || filesKey() !== initialFiles
        || state.imagesFirst !== imagesFirst
        || state.pending > 0 || state.filesPending > 0;
    },
    busy: () => state.pending > 0 || state.filesPending > 0,
    isEmpty: () => {
      const current = texts();
      return isEmptyNoteHtml(current.pl) && isEmptyNoteHtml(current.en) && state.images.length === 0 && state.files.length === 0;
    },
    /** Język treści w polu ('pl' | 'en'). */
    language: () => state.language,
    focus() {
      requestAnimationFrame(() => {
        // Na telefonie bez automatycznego fokusu – klawiatura zasłoniłaby obrazy i przyciski.
        if (window.matchMedia('(pointer: fine)').matches) area.focus({ preventScroll: true });
      });
    },
    destroy() {
      document.removeEventListener('selectionchange', onSelectionChange);
    }
  };
}
