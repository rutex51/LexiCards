// Notatka lekcji: okno z podglądem (tekst z formatowaniem i obrazy), edytor z paskiem
// formatowania, powiększanie obrazów oraz elementy pokazujące notatkę na listach.
//
// Edytor to pole contenteditable obsługiwane przez document.execCommand – jedyny sposób na
// formatowanie z cofaniem (Ctrl+Z) bez dodatkowych bibliotek. Treść przy wklejaniu i zapisie
// przechodzi przez normalizeNoteHtml(), więc w bazie zawsze jest bezpieczny, prosty HTML.

import { NOTE_IMAGE_LIMIT } from '../core/model.js';
import { bytesToBase64 } from '../core/base64.js';
import { NOTE_COLORS, isEmptyNoteHtml, noteText, normalizeNoteHtml, portableNoteHtml } from '../core/note-format.js';
import { pluralImages } from '../core/text.js';
import { iconButton } from './components.js';
import { confirmDialog, mountDialog, openMenu, showError, toast } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { prepareImage, urlPool } from './images.js';

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
  { command: 'color', icon: 'textColor', label: 'Kolor tekstu' },
  { command: 'removeFormat', icon: 'clearFormat', label: 'Usuń formatowanie' }
];

// ---------------------------------------------------------------- elementy list

/** Krótki opis notatki: początek tekstu (akapity w osobnych wierszach) albo liczba obrazów. */
export function noteSummary(note) {
  const text = noteText(note.html).replace(/\n\s*\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (text) return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  return pluralImages(note.images.length);
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
          h('span', { class: 'row__subtitle' }, 'Tekst z formatowaniem i obrazy')
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

async function copyNote(note, images) {
  const text = noteText(note.html);
  let html = portableNoteHtml(note.html);
  let total = 0;
  for (const image of images) {
    total += image.bytes.byteLength;
    if (total > CLIPBOARD_IMAGE_BYTES) break;
    html += `<p><img src="data:${image.type};base64,${bytesToBase64(image.bytes)}" alt="" style="max-width:100%"></p>`;
  }
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
  close.focus();
  return dialog;
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
    /** Obrazy notatki z bajtami: { id, stored, bytes, type, width, height, name, url }. */
    let stored = [];
    let mode = null;
    let editor = null;
    let dialog;

    const leftButton = h('button', { type: 'button', class: 'button button--plain', dataset: { testid: 'note-left' } });
    const rightButton = h('button', { type: 'button', class: 'button button--primary sheet__submit', dataset: { testid: 'note-right' } });
    const title = h('h2', { class: 'sheet__title', id: titleID }, 'Notatka');
    const body = h('div', { class: 'sheet__body note-sheet__body' });
    const panel = h('div', { class: 'sheet__panel note-sheet', 'aria-labelledby': titleID },
      h('header', { class: 'sheet__header' }, leftButton, title, rightButton),
      body
    );

    const loadImages = async () => {
      urls.release();
      const images = await library.noteImages(lessonID);
      stored = images.map((image) => ({ ...image, stored: true, url: urls.add(image) }));
    };

    const heading = () => {
      const path = library.lessonPath(lessonID).split(' › ');
      const current = library.getLesson(lessonID);
      return h('div', { class: 'note-sheet__heading' },
        path.length > 1 ? h('p', { class: 'note-sheet__path' }, path.slice(0, -1).join(' › ')) : null,
        h('h3', { class: 'note-sheet__lesson' }, current?.name ?? lesson.name)
      );
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

    function showView() {
      const note = library.getNote(lessonID);
      if (!note) {
        close();
        return;
      }
      mode = 'view';
      editor?.destroy();
      editor = null;
      leftButton.textContent = 'Zamknij';
      rightButton.textContent = 'Edytuj';
      rightButton.disabled = false;
      const text = h('div', { class: 'note-text note-sheet__text', dataset: { testid: 'note-text' }, lang: 'pl' });
      // Treść jest normalizowana przed wstawieniem – tylko bezpieczne znaczniki notatki.
      text.innerHTML = normalizeNoteHtml(note.html);
      const gallery = stored.length > 0
        ? h('div', { class: 'note-gallery', dataset: { testid: 'note-gallery' } },
            stored.map((image, index) => h('button', {
              type: 'button',
              class: 'note-gallery__item',
              'aria-label': `Powiększ obraz ${index + 1} z ${stored.length}`,
              onClick: () => openLightbox(stored, index)
            }, h('img', {
              src: image.url, alt: '', loading: 'lazy',
              width: image.width ?? null, height: image.height ?? null
            }))))
        : null;
      replaceChildren(body,
        heading(),
        note.html ? text : null,
        gallery,
        h('div', { class: 'note-sheet__actions' },
          note.html
            ? h('button', {
                type: 'button', class: 'button button--secondary', dataset: { testid: 'note-copy' },
                onClick: () => copyNote(note, stored)
              }, icon('copy', { size: 18 }), h('span', null, 'Kopiuj notatkę'))
            : null
        )
      );
    }

    function showEdit() {
      mode = 'edit';
      const note = library.getNote(lessonID);
      leftButton.textContent = 'Anuluj';
      rightButton.textContent = 'Zapisz';
      editor?.destroy();
      editor = noteEditor({
        html: note?.html ?? '',
        images: stored,
        urls
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
                message: 'Tekst i obrazy notatki zostaną usunięte. Pojęcia lekcji zostają.',
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
        toast('Poczekaj, aż obrazy zostaną przygotowane.');
        return;
      }
      rightButton.disabled = true;
      try {
        const draft = editor.draft();
        const saved = await library.saveNote(lessonID, draft);
        await loadImages();
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
    panel.addEventListener('keydown', (event) => {
      if (mode === 'edit' && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        save();
      }
    });

    dialog = mountDialog('sheet note-dialog', panel, {
      onDismiss: () => requestClose(),
      onClose: () => {
        editor?.destroy();
        urls.release();
        resolve();
      }
    });
    dialog.dataset.testid = 'note-dialog';
    replaceChildren(body, heading(), h('p', { class: 'picker__empty' }, 'Wczytywanie…'));
    loadImages()
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
 * Edytor notatki: pasek formatowania, pole tekstu i obrazy.
 * Zwraca { element, draft(), dirty(), busy(), focus(), destroy() }.
 */
function noteEditor({ html, images, urls }) {
  const initialHtml = normalizeNoteHtml(html);
  const state = {
    images: images.map((image) => ({ ...image })),
    pending: 0,
    range: null
  };
  const initialImages = state.images.map((image) => image.id).join(',');

  const area = h('div', {
    class: 'note-text note-editor__area',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'Treść notatki',
    spellcheck: 'true',
    lang: 'pl',
    dataset: { testid: 'note-editor', placeholder: 'Wpisz albo wklej treść notatki…' }
  });
  area.innerHTML = initialHtml || '<p><br></p>';

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
          if (definition.command === 'heading') {
            const block = String(document.queryCommandValue('formatBlock') ?? '').toLowerCase();
            run('formatBlock', block === 'h3' ? '<p>' : '<h3>');
            return;
          }
          run(definition.command);
        }
      }, icon(definition.icon, { size: 20 }));
      if (!['color', 'removeFormat'].includes(definition.command)) button.setAttribute('aria-pressed', 'false');
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

  function renderImages() {
    const tiles = state.images.map((image, index) => h('div', { class: 'note-images__item' },
      h('button', {
        type: 'button', class: 'note-images__open', 'aria-label': `Obraz ${index + 1} z ${state.images.length} – polecenia`,
        onClick: () => openMenu({
          title: `Obraz ${index + 1} z ${state.images.length}`,
          items: [
            { label: 'Powiększ', icon: 'zoomIn', onSelect: () => openLightbox(state.images, index) },
            { label: 'Przesuń wcześniej', icon: 'arrowLeft', disabled: index === 0, onSelect: () => moveImage(index, -1) },
            { label: 'Przesuń dalej', icon: 'arrowRight', disabled: index === state.images.length - 1, onSelect: () => moveImage(index, 1) },
            'separator',
            { label: 'Usuń obraz', icon: 'trash', destructive: true, onSelect: () => { state.images.splice(index, 1); renderImages(); } }
          ]
        })
      }, h('img', { src: image.url, alt: '' })),
      h('button', {
        type: 'button', class: 'note-images__remove', 'aria-label': `Usuń obraz ${index + 1}`, dataset: { testid: 'note-image-remove' },
        onClick: () => { state.images.splice(index, 1); renderImages(); }
      }, icon('close', { size: 14 }))
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
        state.images.push({ ...prepared, stored: false, url: urls.add(prepared) });
      } catch (error) {
        toast(error?.message ?? 'Nie udało się dodać obrazu.', { kind: 'error' });
      } finally {
        state.pending -= 1;
        renderImages();
      }
    }
  }

  const imagesSection = h('section', { class: 'note-editor__images' },
    h('h3', { class: 'form-group__title' }, 'Obrazy'),
    grid,
    status,
    h('p', { class: 'field__hint' }, 'Dotknij obrazu, żeby go powiększyć, przesunąć albo usunąć. Obraz możesz też wkleić do tekstu – trafi tutaj.'),
    fileInput
  );

  // Upuszczenie plików na edytor (komputer).
  const element = h('div', { class: 'note-editor' },
    h('section', { class: 'note-editor__text' },
      h('h3', { class: 'form-group__title' }, 'Tekst'),
      h('div', { class: 'note-editor__toolbar' }, toolbar, colorPanel),
      area
    ),
    imagesSection
  );
  element.addEventListener('dragover', (event) => {
    if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) {
      event.preventDefault();
      element.classList.add('note-editor--drop');
    }
  });
  element.addEventListener('dragleave', () => element.classList.remove('note-editor--drop'));
  element.addEventListener('drop', (event) => {
    const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith('image/'));
    element.classList.remove('note-editor--drop');
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files);
  });

  renderImages();
  syncEmpty();

  return {
    element,
    draft() {
      return {
        html: normalizeNoteHtml(area.innerHTML),
        images: state.images.map((image) => (image.stored
          ? { id: image.id }
          : { bytes: image.bytes, type: image.type, width: image.width, height: image.height, name: image.name ?? null }))
      };
    },
    dirty() {
      return normalizeNoteHtml(area.innerHTML) !== initialHtml
        || state.images.map((image) => image.id ?? image.url).join(',') !== initialImages
        || state.pending > 0;
    },
    busy: () => state.pending > 0,
    isEmpty: () => isEmptyNoteHtml(area.innerHTML) && state.images.length === 0,
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
