// Wspólne przepływy wywoływane z wielu ekranów: formularze, wybór celu przeniesienia,
// usuwanie z potwierdzeniem, dane przykładowe.

import { deletionMessage, deletionTitle, importSummary } from '../core/messages.js';
import {
  DEFAULT_DOMAIN_COLOR, DEFAULT_DOMAIN_ICON, DIFFICULTY_MAX, DIFFICULTY_MIN, DOMAIN_COLORS,
  DOMAIN_COLOR_NAMES, DOMAIN_ICONS, emptyTermDraft, termToDraft
} from '../core/model.js';
import { EXPORT_FORMATS, buildExportFile, collectExportNotes, collectExportRows } from '../core/exporter.js';
import { ASSESSMENT_STATUS_NAMES } from '../core/model.js';
import { RATING_NAMES } from '../core/fsrs.js';
import {
  DECISION_NAMES, DIRECTION_NAMES, RATING_LABELS, STUDY_FRONTS, buildQueue, formatInterval, reviewConfig
} from '../core/study.js';
import {
  CARD_MEDIA_LIMIT, FACE_PART_IDS, FACE_PART_LABELS, FLIP_COUNTS, MEDIA_PART, emptyCardFaces, faceKind,
  faceParts, flipFaces, hasMediaPart
} from '../core/card-faces.js';
import { findImageByLabel, withImageLabels } from '../core/note-refs.js';
import { tableHtml, withTableLabels } from '../core/tables.js';
import { installSampleData } from '../core/samples.js';
import { formatTags, isBlank, parseTags, pluralNotes, pluralTerms } from '../core/text.js';
import { checkSegmented, field, formGroup, message, segmented, selectInput, textArea, textInput, toggle } from './components.js';
import { confirmDialog, openFormSheet, showError, toast, undoToast } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { deliverFile } from './files.js';
import { icon } from './icons.js';
import { urlPool } from './images.js';
import { routes } from './router.js';

const NEW = '__new__';
const NONE = '';

// ---------------------------------------------------------------- dziedzina

export function openDomainForm(ctx, domainID = null) {
  const { library } = ctx;
  const existing = domainID ? library.getDomain(domainID) : null;
  if (domainID && !existing) return showError(new Error('Dziedzina nie istnieje. Mogła zostać usunięta.'));

  const draft = {
    name: existing?.name ?? '',
    details: existing?.details ?? '',
    icon: existing?.icon ?? DEFAULT_DOMAIN_ICON,
    color: existing?.color ?? DEFAULT_DOMAIN_COLOR
  };

  return openFormSheet({
    title: existing ? 'Edytuj dziedzinę' : 'Nowa dziedzina',
    build(api) {
      const sync = () => api.setCanSubmit(!isBlank(draft.name));
      const nameInput = textInput({
        value: draft.name, placeholder: 'np. Business English', required: true, testID: 'domain-name',
        onInput: (value) => { draft.name = value; sync(); }
      });
      const iconGrid = h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': 'Ikona' },
        DOMAIN_ICONS.map((symbol) => h('label', { class: 'choice choice--icon' },
          h('input', { type: 'radio', name: 'domain-icon', value: symbol, checked: symbol === draft.icon, onChange: () => { draft.icon = symbol; } }),
          h('span', { 'aria-hidden': 'true' }, symbol),
          h('span', { class: 'visually-hidden' }, `Ikona ${symbol}`)
        ))
      );
      const colorGrid = h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': 'Kolor' },
        DOMAIN_COLORS.map((color) => h('label', { class: `choice choice--color badge--${color}` },
          h('input', { type: 'radio', name: 'domain-color', value: color, checked: color === draft.color, onChange: () => { draft.color = color; } }),
          h('span', { class: 'choice__check', 'aria-hidden': 'true' }, icon('check', { size: 18 })),
          h('span', { class: 'visually-hidden' }, DOMAIN_COLOR_NAMES[color])
        ))
      );
      sync();
      queueMicrotask(() => { if (!existing) nameInput.focus(); });
      return [
        formGroup(null,
          field('Nazwa', nameInput),
          field('Opis (opcjonalnie)', textArea({ value: draft.details, onInput: (value) => { draft.details = value; } }))
        ),
        formGroup('Ikona', iconGrid),
        formGroup('Kolor', colorGrid)
      ];
    },
    async onSubmit() {
      if (existing) await library.updateDomain(existing.id, draft);
      else await library.createDomain(draft);
    }
  });
}

// ---------------------------------------------------------------- wybór elementu nadrzędnego w formularzu

/** Lista wyboru dziedziny z opcją „Nowa dziedzina…” i polem nazwy nowej dziedziny. */
function domainChooser(ctx, state, onChange) {
  const { library } = ctx;
  const domains = library.listDomains();
  if (state.domainChoice === NONE && domains.length === 0) state.domainChoice = NEW;

  const newName = textInput({
    value: state.newDomainName, placeholder: 'Nazwa nowej dziedziny', testID: 'new-domain-name',
    onInput: (value) => { state.newDomainName = value; onChange(false); }
  });
  const newField = field('Nazwa nowej dziedziny', newName);
  const select = selectInput({
    value: state.domainChoice,
    testID: 'domain-select',
    options: [
      { value: NONE, label: 'Wybierz…' },
      ...domains.map((domain) => ({ value: domain.id, label: domain.name })),
      { value: NEW, label: 'Nowa dziedzina…' }
    ],
    onChange: (value) => {
      state.domainChoice = value;
      newField.hidden = value !== NEW;
      onChange(true);
    }
  });
  newField.hidden = state.domainChoice !== NEW;
  return [field('Dziedzina', select), newField];
}

function domainPlacement(state) {
  if (state.domainChoice === NEW) {
    return { create: { name: state.newDomainName, icon: DEFAULT_DOMAIN_ICON, color: DEFAULT_DOMAIN_COLOR } };
  }
  return state.domainChoice === NONE ? null : { existing: state.domainChoice };
}

function domainChoiceValid(state) {
  if (state.domainChoice === NEW) return !isBlank(state.newDomainName);
  return state.domainChoice !== NONE;
}

// ---------------------------------------------------------------- moduł

export function openModuleForm(ctx, { moduleID = null, domainID = null } = {}) {
  const { library } = ctx;
  const existing = moduleID ? library.getModule(moduleID) : null;
  if (moduleID && !existing) return showError(new Error('Moduł nie istnieje. Mógł zostać usunięty.'));

  const state = {
    name: existing?.name ?? '',
    details: existing?.details ?? '',
    domainChoice: domainID && library.getDomain(domainID) ? domainID : NONE,
    newDomainName: ''
  };

  return openFormSheet({
    title: existing ? 'Edytuj moduł' : 'Nowy moduł',
    build(api) {
      const sync = () => api.setCanSubmit(!isBlank(state.name) && (existing || domainChoiceValid(state)));
      const nameInput = textInput({
        value: state.name, placeholder: 'np. Finance', required: true, testID: 'module-name',
        onInput: (value) => { state.name = value; sync(); }
      });
      const groups = [
        formGroup(null,
          field('Nazwa', nameInput),
          field('Opis (opcjonalnie)', textArea({ value: state.details, onInput: (value) => { state.details = value; } }))
        )
      ];
      if (existing) {
        groups.push(message('Aby zmienić dziedzinę, użyj polecenia „Przenieś” na liście modułów.', 'info'));
      } else {
        groups.push(formGroup('Położenie', domainChooser(ctx, state, sync)));
      }
      sync();
      queueMicrotask(() => { if (!existing) nameInput.focus(); });
      return groups;
    },
    async onSubmit() {
      const draft = { name: state.name, details: state.details };
      if (existing) await library.updateModule(existing.id, draft);
      else await library.createModule(draft, domainPlacement(state));
    }
  });
}

// ---------------------------------------------------------------- lekcja

export function openLessonForm(ctx, { lessonID = null, domainID = null, moduleID = null } = {}) {
  const { library } = ctx;
  const existing = lessonID ? library.getLesson(lessonID) : null;
  if (lessonID && !existing) return showError(new Error('Lekcja nie istnieje. Mogła zostać usunięta.'));

  const presetModule = moduleID ? library.getModule(moduleID) : null;
  const state = {
    name: existing?.name ?? '',
    details: existing?.details ?? '',
    domainChoice: presetModule?.domainID ?? (domainID && library.getDomain(domainID) ? domainID : NONE),
    newDomainName: '',
    moduleChoice: presetModule?.id ?? NONE,
    newModuleName: ''
  };

  return openFormSheet({
    title: existing ? 'Edytuj lekcję' : 'Nowa lekcja',
    build(api) {
      const moduleSlot = h('div', { class: 'form-group__slot' });

      const moduleValid = () => {
        if (state.moduleChoice === NEW) return !isBlank(state.newModuleName) && domainChoiceValid(state);
        return state.moduleChoice !== NONE;
      };
      const sync = () => api.setCanSubmit(!isBlank(state.name) && (existing || moduleValid()));

      /** Lista modułów zależy od wybranej dziedziny – budowana po każdej jej zmianie. */
      const renderModuleChooser = () => {
        const modules = state.domainChoice !== NEW && state.domainChoice !== NONE ? library.listModules(state.domainChoice) : [];
        if (state.domainChoice === NEW) state.moduleChoice = NEW;
        else if (state.moduleChoice !== NEW && !modules.some((module) => module.id === state.moduleChoice)) {
          state.moduleChoice = state.domainChoice !== NONE && modules.length === 0 ? NEW : NONE;
        }
        const newName = textInput({
          value: state.newModuleName, placeholder: 'Nazwa nowego modułu', testID: 'new-module-name',
          onInput: (value) => { state.newModuleName = value; sync(); }
        });
        const newField = field('Nazwa nowego modułu', newName);
        newField.hidden = state.moduleChoice !== NEW;
        const select = selectInput({
          value: state.moduleChoice,
          testID: 'module-select',
          options: [
            { value: NONE, label: 'Wybierz…' },
            ...modules.map((module) => ({ value: module.id, label: module.name })),
            { value: NEW, label: 'Nowy moduł…' }
          ],
          onChange: (value) => {
            state.moduleChoice = value;
            newField.hidden = value !== NEW;
            sync();
          }
        });
        select.disabled = state.domainChoice === NONE;
        replaceChildren(moduleSlot, field('Moduł', select), newField);
      };

      const nameInput = textInput({
        value: state.name, placeholder: 'np. Financial Ratios', required: true, testID: 'lesson-name',
        onInput: (value) => { state.name = value; sync(); }
      });
      const groups = [
        formGroup(null,
          field('Nazwa', nameInput),
          field('Opis (opcjonalnie)', textArea({ value: state.details, onInput: (value) => { state.details = value; } }))
        )
      ];
      if (existing) {
        groups.push(message('Aby zmienić moduł, użyj polecenia „Przenieś” na liście lekcji.', 'info'));
      } else {
        const domainFields = domainChooser(ctx, state, (domainChanged) => {
          if (domainChanged) renderModuleChooser();
          sync();
        });
        renderModuleChooser();
        groups.push(
          formGroup('Położenie', domainFields, moduleSlot),
          h('p', { class: 'form-note' }, 'Brakujący moduł lub dziedzina zostaną utworzone razem z lekcją.')
        );
      }
      sync();
      queueMicrotask(() => { if (!existing) nameInput.focus(); });
      return groups;
    },
    async onSubmit() {
      const draft = { name: state.name, details: state.details };
      if (existing) {
        await library.updateLesson(existing.id, draft);
        return;
      }
      const placement = state.moduleChoice === NEW
        ? { create: { name: state.newModuleName }, domain: domainPlacement(state) }
        : (state.moduleChoice === NONE ? null : { existing: state.moduleChoice });
      await library.createLesson(draft, placement);
    }
  });
}

// ---------------------------------------------------------------- pojęcie

/**
 * Miniatury obrazów notatek (od 1.56.1, okno pojęcia): adres obrazu po sygnaturze, wczytany raz na lekcję; release()
 * zwalnia adresy po zamknięciu okna.
 */
function noteThumbs(library) {
  const urls = urlPool();
  const lessons = new Map();
  return {
    async url(lessonID, label) {
      if (!lessons.has(lessonID)) lessons.set(lessonID, library.noteImages(lessonID).then(withImageLabels).catch(() => []));
      const images = await lessons.get(lessonID);
      const image = images[findImageByLabel(images, label)];
      if (!image?.bytes) return null;
      image.url ??= urls.add(image);
      return image.url;
    },
    release() {
      urls.release();
      lessons.clear();
    }
  };
}

/** Miniatura tabeli: pierwsze wiersze i kolumny (komórki jako tekst – tableHtml). */
function tableThumb(table) {
  const box = h('span', { class: 'media-tile__table', 'aria-hidden': 'true' });
  box.innerHTML = tableHtml({ ...table, colWidths: null, rows: table.rows.slice(0, 4).map((row) => row.slice(0, 3)) });
  return box;
}

/**
 * Od 1.56: sekcje „Strony fiszki” i „Obrazy z notatki lekcji” okna pojęcia – własne strony fiszki (zamiast ustawień
 * nauki) i rysunki, zdjęcia albo tabele z notatki lekcji przypięte do pojęcia (po sygnaturze). Od 1.56.1 obrazy wybiera
 * się dotknięciem kafelka z miniaturą, a stronę z obrazami – częścią „Obraz” w wierszu strony. Zmienia
 * state.draft.cardFaces i state.draft.cardMedia; odświeża tylko siebie, więc reszta okna i jego przewinięcie zostają.
 */
function termCardGroups(library, state, thumbs) {
  const slot = h('div', { class: 'form-stack term-card', dataset: { testid: 'term-card' } });
  const settings = library.getSettings();
  const mediaKey = (item) => `${item.kind}:${item.label.toLocaleLowerCase('pl')}`;
  let render = () => {};

  const facesGroup = () => {
    const own = state.draft.cardFaces;
    const hasMedia = state.draft.cardMedia.length > 0;
    const setFaces = (faces) => {
      state.draft.cardFaces = { ...own, faces };
      render();
    };
    // „Obraz” – gdy pojęcie ma przypięty obraz (albo strona już go pokazuje, żeby dało się go odznaczyć).
    const parts = FACE_PART_IDS.filter((part) => part !== MEDIA_PART || hasMedia || own?.faces.some(hasMediaPart));
    const empty = emptyCardFaces(own, state.draft.cardMedia);
    return formGroup('Strony fiszki',
      toggle({
        checked: Boolean(own), label: 'Własne strony tej fiszki', testID: 'term-own-faces',
        onChange: (value) => {
          // Na start – to, co w ustawieniach nauki.
          const front = STUDY_FRONTS.some((item) => item.id === settings.preferredFlashcardFront) ? settings.preferredFlashcardFront : 'term';
          state.draft.cardFaces = value ? { front, faces: [...flipFaces(settings.flashcardFlips, settings.flashcardFaces)] } : null;
          render();
        }
      }),
      own ? [
        field('Pierwsza strona (pytanie)', segmented({
          name: 'term-front', label: 'Pierwsza strona fiszki', value: own.front,
          options: STUDY_FRONTS.map((item) => ({ value: item.id, label: item.label })),
          onChange: (value) => { state.draft.cardFaces = { ...own, front: value }; render(); }
        })),
        field('Obroty', segmented({
          name: 'term-flips', label: 'Obroty fiszki', value: String(own.faces.length),
          options: FLIP_COUNTS.map((count) => ({ value: String(count), label: count === 1 ? '1 obrót' : `${count} obroty` })),
          // Inna liczba obrotów – strony jak w Nauce przy tej liczbie (potem do zmiany).
          onChange: (value) => setFaces([...flipFaces(Number(value), settings.flashcardFaces)])
        })),
        own.faces.map((kind, index) => field(`Po ${index + 1}. obrocie`, checkSegmented({
          name: `term-face-${index + 1}`, label: `Treść strony po ${index + 1}. obrocie`, testID: `term-face-${index + 1}`,
          values: faceParts(kind), options: parts.map((part) => ({ value: part, label: FACE_PART_LABELS[part] })),
          onChange: (part, checked) => {
            const next = faceParts(kind).filter((item) => item !== part).concat(checked ? [part] : []);
            // Strona musi coś pokazywać – ostatniej zaznaczonej części nie da się odznaczyć.
            if (next.length === 0) return false;
            setFaces(own.faces.map((item, at) => (at === index ? faceKind(next) : item)));
            return true;
          }
        }))),
        empty.length > 0 ? message(`Strona po ${empty[0]}. obrocie pokazuje tylko obraz, a fiszka nie ma przypiętego obrazu – zaznacz inną część albo przypnij obraz.`, 'warning') : null
      ] : null,
      h('p', { class: 'field__hint' }, own
        ? `Zaznacz, co pokazuje każda strona.${parts.includes(MEDIA_PART) ? ' „Obraz” – wszystkie przypięte obrazy i tabele (bez zaznaczenia – na ostatniej stronie).' : ''}`
        : 'Bez własnych stron fiszka wygląda jak w ustawieniach nauki (Pierwsza strona fiszki, Obroty fiszki).')
    );
  };

  const mediaGroup = () => {
    const title = 'Obrazy z notatki lekcji';
    if (!state.lessonID) return formGroup(title, message('Najpierw wybierz lekcję – rysunki, zdjęcia i tabele pochodzą z jej notatki.'));
    const lessonID = state.lessonID;
    const list = state.draft.cardMedia;
    const note = library.getNote(lessonID);
    const images = withImageLabels(note?.images ?? []);
    const tables = withTableLabels(note?.tables ?? [], images.map((image) => image.label));
    const available = [
      ...images.map((image) => ({ kind: 'image', label: image.label, name: image.drawing ? 'rysunek' : 'zdjęcie' })),
      ...tables.map((table) => ({ kind: 'table', label: table.label, name: 'tabela', table }))
    ];
    const found = new Set(available.map(mediaKey));
    // Przypięte, których nie ma już w notatce – też na liście (do odpięcia).
    const missing = list.filter((item) => !found.has(mediaKey(item))).map((item) => ({ ...item, name: 'nie ma w notatce lekcji', missing: true }));
    const tiles = [...available, ...missing].map((item, index) => {
      const pinned = list.some((other) => mediaKey(other) === mediaKey(item));
      const thumb = h('span', { class: 'media-tile__thumb' });
      if (item.table) thumb.append(tableThumb(item.table));
      else if (item.kind === 'table' || item.missing) thumb.append(icon(item.kind === 'table' ? 'table' : 'image', { size: 22 }));
      else {
        const image = h('img', { alt: '', draggable: 'false' });
        thumb.append(image);
        thumbs.url(lessonID, item.label).then((url) => {
          if (url) image.src = url;
        });
      }
      return h('button', {
        type: 'button', class: `media-tile${pinned ? ' media-tile--on' : ''}${item.missing ? ' media-tile--missing' : ''}`,
        'aria-pressed': String(pinned), disabled: !pinned && list.length >= CARD_MEDIA_LIMIT,
        title: pinned ? `Odepnij: ${item.label}` : `Przypnij: ${item.label}`,
        dataset: { testid: `term-media-tile-${index}`, kind: item.kind, label: item.label },
        onClick: () => {
          state.draft.cardMedia = pinned ? list.filter((other) => mediaKey(other) !== mediaKey(item)) : [...list, { kind: item.kind, label: item.label }];
          render();
        }
      },
        thumb,
        h('span', { class: 'media-tile__label' }, item.label),
        h('small', { class: 'media-tile__kind' }, item.name),
        pinned ? h('span', { class: 'media-tile__check', 'aria-hidden': 'true' }, icon('check', { size: 14 })) : null
      );
    });
    const hint = available.length === 0
      ? 'Notatka tej lekcji nie ma rysunków, zdjęć ani tabel. Dodaj je w notatce – fiszka pokaże je po sygnaturze.'
      : `Dotknij, aby przypiąć albo odpiąć (najwyżej ${CARD_MEDIA_LIMIT}). Przypięte są na stronach z częścią „Obraz”, a bez niej – na ostatniej stronie fiszki.`;
    return formGroup(title,
      tiles.length > 0 ? h('div', { class: 'media-tiles', dataset: { testid: 'term-media' } }, tiles) : null,
      h('p', { class: 'field__hint' }, list.length > 0 ? `Przypięte: ${list.length}. ${hint}` : hint));
  };

  render = () => replaceChildren(slot, facesGroup(), mediaGroup());
  render();
  return slot;
}

/**
 * Formularz pojęcia: termID – edycja, bez – nowe pojęcie (lessonID – lekcja). Od 1.62 (szybkie fiszki): preset –
 * pola nowego pojęcia wypełnione z góry, title – tytuł okna, create(draft, lessonID) – własny zapis nowego pojęcia
 * (bez „Zapisz i dodaj kolejne”).
 */
export function openTermForm(ctx, { termID = null, lessonID = null, preset = null, title = null, create = null } = {}) {
  const { library } = ctx;
  const existing = termID ? library.getTerm(termID) : null;
  if (termID && !existing) return showError(new Error('Pojęcie nie istnieje. Mogło zostać usunięte.'));

  const state = {
    draft: existing ? termToDraft(existing) : { ...emptyTermDraft(), ...(preset ?? {}) },
    tagsText: existing ? formatTags(existing.tags) : '',
    lessonID: existing?.lessonID ?? (lessonID && library.getLesson(lessonID) ? lessonID : null),
    duplicateAcknowledged: false,
    savedCount: 0
  };

  let sheet;
  let rebuild = () => {};
  let showDuplicateWarning = () => {};
  const thumbs = noteThumbs(library);

  const save = async (api, { addAnother }) => {
    const draft = { ...state.draft, tags: parseTags(state.tagsText) };
    const empty = emptyCardFaces(draft.cardFaces, draft.cardMedia);
    if (empty.length > 0) throw new Error(`Strona po ${empty[0]}. obrocie nic nie pokazuje – zaznacz na niej treść albo przypnij obraz z notatki.`);
    // Duplikat w lekcji nie blokuje zapisu, ale wymaga świadomego potwierdzenia.
    if (state.lessonID && !state.duplicateAcknowledged) {
      const duplicate = library.findTerm(draft.termPL, draft.termEN, state.lessonID);
      if (duplicate && duplicate.id !== existing?.id) {
        state.duplicateAcknowledged = true;
        showDuplicateWarning();
        return false;
      }
    }
    if (existing) await library.updateTerm(existing.id, draft);
    else if (create) await create(draft, state.lessonID);
    else await library.createTerm(draft, state.lessonID);

    if (addAnother) {
      state.savedCount += 1;
      state.draft = emptyTermDraft();
      state.tagsText = '';
      state.duplicateAcknowledged = false;
      api.setCancelLabel('Gotowe');
      rebuild();
      return false;
    }
    return true;
  };

  sheet = openFormSheet({
    title: title ?? (existing ? 'Edytuj pojęcie' : 'Nowe pojęcie'),
    build(api) {
      const container = h('div', { class: 'form-stack' });
      const canSave = () => !isBlank(state.draft.termPL) && !isBlank(state.draft.termEN) && Boolean(state.lessonID);

      rebuild = () => {
        const sync = () => {
          api.setCanSubmit(canSave());
          addAnotherButton.disabled = !canSave();
        };
        const resetDuplicate = () => {
          if (state.duplicateAcknowledged) {
            state.duplicateAcknowledged = false;
            duplicateSlot.hidden = true;
          }
        };
        const bind = (key) => (value) => { state.draft[key] = value; };

        const termPL = textInput({
          value: state.draft.termPL, placeholder: 'np. bilans', required: true, lang: 'pl', autocapitalize: 'none', testID: 'term-pl',
          onInput: (value) => { state.draft.termPL = value; resetDuplicate(); sync(); }
        });
        const termEN = textInput({
          value: state.draft.termEN, placeholder: 'np. balance sheet', required: true, lang: 'en', autocapitalize: 'none', testID: 'term-en',
          onInput: (value) => { state.draft.termEN = value; resetDuplicate(); sync(); }
        });

        const lessonButton = h('button', {
          type: 'button', class: 'input input--button', dataset: { testid: 'term-lesson' },
          onClick: async () => {
            const picked = await pickDestination(ctx, { title: 'Wybierz lekcję', level: 'lesson', currentID: state.lessonID });
            if (picked) {
              state.lessonID = picked;
              state.duplicateAcknowledged = false;
              rebuild();
            }
          }
        }, h('span', null, state.lessonID ? library.lessonPath(state.lessonID) : 'Wybierz lekcję…'), icon('chevronRight', { size: 18 }));

        const difficulty = selectInput({
          value: state.draft.difficulty === null ? NONE : String(state.draft.difficulty),
          options: [
            { value: NONE, label: 'Nie określono' },
            ...Array.from({ length: DIFFICULTY_MAX - DIFFICULTY_MIN + 1 }, (_, index) => {
              const level = DIFFICULTY_MIN + index;
              return { value: String(level), label: String(level) };
            })
          ],
          onChange: (value) => { state.draft.difficulty = value === NONE ? null : Number(value); }
        });

        const duplicateSlot = h('div', { hidden: !state.duplicateAcknowledged },
          message('Takie pojęcie już istnieje w tej lekcji. Wybierz „Zapisz” ponownie, aby mimo to je dodać.', 'warning')
        );

        showDuplicateWarning = () => {
          duplicateSlot.hidden = false;
          duplicateSlot.scrollIntoView({ block: 'center' });
        };

        const addAnotherButton = h('button', {
          type: 'button', class: 'button button--secondary button--block', dataset: { testid: 'term-save-another' },
          onClick: async () => {
            api.setError(null);
            try {
              await save(api, { addAnother: true });
            } catch (error) {
              api.setError(error.message);
            }
          }
        }, 'Zapisz i dodaj kolejne');

        replaceChildren(container,
          existing ? null : formGroup(null, field('Lekcja', lessonButton)),
          formGroup('Pojęcie',
            field('Po polsku', termPL),
            field('Po angielsku', termEN)
          ),
          formGroup('Opis',
            field('Opis po polsku', textArea({ value: state.draft.descriptionPL, lang: 'pl', onInput: bind('descriptionPL') })),
            field('Opis po angielsku', textArea({ value: state.draft.descriptionEN, lang: 'en', onInput: bind('descriptionEN') }))
          ),
          formGroup('Przykład użycia',
            field('Przykład po polsku', textArea({ value: state.draft.examplePL, lang: 'pl', onInput: bind('examplePL') })),
            field('Przykład po angielsku', textArea({ value: state.draft.exampleEN, lang: 'en', onInput: bind('exampleEN') }))
          ),
          termCardGroups(library, state, thumbs),
          formGroup('Dodatkowe',
            field('Tagi', textInput({ value: state.tagsText, placeholder: 'np. finanse, raporty', autocapitalize: 'none', onInput: (value) => { state.tagsText = value; } }), { hint: 'Rozdzielaj przecinkami.' }),
            field('Trudność', difficulty),
            toggle({ checked: state.draft.isFavorite, label: 'Ulubione', onChange: (value) => { state.draft.isFavorite = value; } }),
            field('Notatki', textArea({ value: state.draft.notes, onInput: bind('notes') }))
          ),
          duplicateSlot,
          existing || create ? null : h('div', { class: 'form-footer' },
            addAnotherButton,
            state.savedCount > 0 ? h('p', { class: 'form-note', role: 'status' }, `Dodano w tej sesji: ${pluralTerms(state.savedCount)}.`) : null
          )
        );
        sync();
        if (!existing) queueMicrotask(() => termPL.focus());
      };

      rebuild();
      return container;
    },
    onSubmit: (api) => save(api, { addAnother: false }),
    onClose: () => thumbs.release()
  });
  return sheet;
}

// ---------------------------------------------------------------- wybór celu (przenieś / kopiuj)

/**
 * Wybór dziedziny, modułu lub lekcji przez zagłębianie się w hierarchię.
 * Zwraca obietnicę z identyfikatorem wybranego elementu albo null po anulowaniu.
 */
export function pickDestination(ctx, { title, level, currentID = null }) {
  const { library } = ctx;
  return new Promise((resolve) => {
    let picked = null;
    /** Ścieżka zagłębienia: [] → dziedziny, [dziedzina] → moduły, [dziedzina, moduł] → lekcje. */
    const path = [];
    const listSlot = h('div', { class: 'picker' });
    let sheet;

    const choose = (id) => {
      picked = id;
      sheet.close();
    };

    const choiceRow = (label, id, leading = null) => h('li', { class: 'row' },
      h('button', { type: 'button', class: 'row__main row__button', onClick: () => choose(id) },
        leading ? h('span', { class: 'row__leading' }, leading) : null,
        h('span', { class: 'row__text' },
          h('span', { class: 'row__title' }, label),
          id === currentID ? h('span', { class: 'row__subtitle' }, 'Bieżące położenie') : null
        ),
        id === currentID ? h('span', { class: 'row__check' }, icon('check', { size: 18 })) : null
      )
    );

    const drillRow = (label, node, leading = null) => h('li', { class: 'row' },
      h('button', { type: 'button', class: 'row__main row__button', onClick: () => { path.push(node); render(); } },
        leading ? h('span', { class: 'row__leading' }, leading) : null,
        h('span', { class: 'row__text' }, h('span', { class: 'row__title' }, label)),
        h('span', { class: 'row__chevron' }, icon('chevronRight', { size: 18 }))
      )
    );

    const emptyNote = (text) => h('p', { class: 'picker__empty' }, text);

    function render() {
      const depth = path.length;
      const header = depth > 0
        ? h('button', { type: 'button', class: 'picker__back', onClick: () => { path.pop(); render(); } },
            icon('chevronLeft', { size: 18 }), h('span', null, depth === 1 ? 'Dziedziny' : path[0].name))
        : null;
      const heading = depth > 0 ? h('h3', { class: 'picker__heading' }, path[depth - 1].name) : null;

      let rows;
      let empty = null;
      if (depth === 0) {
        const domains = library.listDomains();
        rows = domains.map((domain) => {
          const badge = h('span', { class: `badge badge--${domain.color}`, 'aria-hidden': 'true' }, domain.icon);
          return level === 'domain' ? choiceRow(domain.name, domain.id, badge) : drillRow(domain.name, domain, badge);
        });
        if (domains.length === 0) empty = emptyNote('Brak dziedzin. Najpierw utwórz dziedzinę w Bibliotece.');
      } else if (depth === 1) {
        const modules = library.listModules(path[0].id);
        rows = modules.map((module) => (level === 'module' ? choiceRow(module.name, module.id) : drillRow(module.name, module)));
        if (modules.length === 0) empty = emptyNote('Ta dziedzina nie ma jeszcze modułów.');
      } else {
        const lessons = library.listLessons(path[1].id);
        rows = lessons.map((lesson) => choiceRow(lesson.name, lesson.id));
        if (lessons.length === 0) empty = emptyNote('Ten moduł nie ma jeszcze lekcji.');
      }
      replaceChildren(listSlot, header, heading, empty ?? h('ul', { class: 'group__list', role: 'list' }, rows));
    }

    sheet = openFormSheet({
      title,
      submitLabel: '',
      build(api) {
        api.setCanSubmit(false);
        render();
        return listSlot;
      },
      onSubmit: () => false,
      onClose: () => resolve(picked)
    });
    sheet.dialog.classList.add('sheet--picker');
  });
}

async function runAction(work, successMessage = null) {
  try {
    const result = await work();
    if (successMessage) toast(typeof successMessage === 'function' ? successMessage(result) : successMessage);
    return true;
  } catch (error) {
    await showError(error);
    return false;
  }
}

export async function moveModule(ctx, moduleID) {
  const module = ctx.library.getModule(moduleID);
  if (!module) return;
  const target = await pickDestination(ctx, { title: 'Przenieś moduł do…', level: 'domain', currentID: module.domainID });
  if (target && target !== module.domainID) {
    await runAction(() => ctx.library.moveModule(moduleID, target), 'Przeniesiono moduł.');
  }
}

export async function moveLesson(ctx, lessonID) {
  const lesson = ctx.library.getLesson(lessonID);
  if (!lesson) return;
  const target = await pickDestination(ctx, { title: 'Przenieś lekcję do…', level: 'module', currentID: lesson.moduleID });
  if (target && target !== lesson.moduleID) {
    await runAction(() => ctx.library.moveLesson(lessonID, target), 'Przeniesiono lekcję.');
  }
}

export async function copyLesson(ctx, lessonID) {
  const target = await pickDestination(ctx, { title: 'Kopiuj lekcję do…', level: 'module' });
  if (target) {
    await runAction(() => ctx.library.copyLesson(lessonID, target), (copy) => `Utworzono kopię: ${copy.name}.`);
  }
}

export async function moveTerms(ctx, termIDs) {
  const single = termIDs.length === 1 ? ctx.library.getTerm(termIDs[0]) : null;
  const target = await pickDestination(ctx, { title: 'Przenieś do lekcji…', level: 'lesson', currentID: single?.lessonID ?? null });
  if (!target) return false;
  return runAction(() => ctx.library.moveTerms(termIDs, target), `Przeniesiono: ${pluralTerms(termIDs.length)}.`);
}

export async function copyTerms(ctx, termIDs) {
  const target = await pickDestination(ctx, { title: 'Kopiuj do lekcji…', level: 'lesson' });
  if (!target) return false;
  return runAction(() => ctx.library.copyTerms(termIDs, target), `Skopiowano: ${pluralTerms(termIDs.length)}.`);
}

export function setFavorite(ctx, isFavorite, termIDs) {
  return runAction(() => ctx.library.setFavorite(isFavorite, termIDs));
}

export function reorder(ctx, level, orderedIDs) {
  return runAction(() => ctx.library.reorder(level, orderedIDs));
}

const DELETED = { domain: 'dziedzinę', module: 'moduł', lesson: 'lekcję' };

/** „lekcję „Ratios””, „pojęcie „bilans””, „3 pojęcia” – do komunikatu po usunięciu. */
function deletedName(target, impact) {
  if (target.kind === 'terms') return impact.terms === 1 ? `pojęcie „${impact.name}”` : pluralTerms(impact.terms);
  return `${DELETED[target.kind] ?? 'element'} „${impact.name}”`;
}

/**
 * Usuwa i przez minutę pozwala to cofnąć przyciskiem „Cofnij” w komunikacie (od 1.9) – wraca
 * wszystko: elementy, pojęcia, postępy, historia nauki, notatki z obrazami i załącznikami.
 */
async function deleteUndoable(ctx, target, impact) {
  let copy;
  try {
    copy = await ctx.library.deleteWithUndo(target);
  } catch (error) {
    await showError(error);
    return false;
  }
  const name = deletedName(target, impact);
  undoToast(`Usunięto ${name}.`, async () => {
    try {
      await ctx.library.restoreDeleted(copy);
      toast(`Przywrócono ${name}.`);
    } catch (error) {
      await showError(error);
    }
  });
  return true;
}

/** Usuwa od razu, bez pytania (zdecydowane przesunięcie wiersza, od 1.9). Zwraca true po usunięciu. */
export async function deleteNow(ctx, target) {
  let impact;
  try {
    impact = ctx.library.deletionImpact(target);
  } catch (error) {
    await showError(error);
    return false;
  }
  return deleteUndoable(ctx, target, impact);
}

/** Liczy skutki usunięcia, prosi o potwierdzenie i usuwa. Zwraca true po usunięciu. */
export async function requestDeletion(ctx, target) {
  let impact;
  try {
    impact = ctx.library.deletionImpact(target);
  } catch (error) {
    await showError(error);
    return false;
  }
  const confirmed = await confirmDialog({
    title: deletionTitle(target, impact),
    message: deletionMessage(target, impact),
    confirmLabel: 'Usuń',
    destructive: true
  });
  if (!confirmed) return false;
  return deleteUndoable(ctx, target, impact);
}

// ---------------------------------------------------------------- historia ocen

/** Kolejka „Powtórki na dziś”: zaległe fiszki z całej biblioteki (jedno pojęcie raz). */
export function todaysReviewQueue(library, now = Date.now()) {
  return buildQueue(library, reviewConfig(library.getSettings()), Math.random, now);
}

/** Rozpoczyna powtórkę zaległych fiszek i przechodzi do sesji. */
export async function startTodaysReview(ctx) {
  const { library } = ctx;
  try {
    const queue = todaysReviewQueue(library);
    await library.startStudy(reviewConfig(library.getSettings()), queue);
    ctx.navigate(routes.studySession());
  } catch (error) {
    await showError(error);
  }
}

/** Arkusz z historią ocen pojęcia (od najnowszej). Wpisy są tylko do odczytu. */
export function openAssessmentHistory(ctx, term) {
  const list = h('div', { class: 'history', dataset: { testid: 'history' } }, h('p', { class: 'picker__empty' }, 'Wczytywanie…'));
  const sheet = openFormSheet({
    title: 'Historia ocen',
    submitLabel: '',
    cancelLabel: 'Zamknij',
    build(api) {
      api.setCanSubmit(false);
      return [h('p', { class: 'form-note history__term' }, `${term.termPL} – ${term.termEN}`), list];
    },
    onSubmit: () => false
  });
  sheet.dialog.classList.add('sheet--picker');

  ctx.library.termAssessments(term.id).then((entries) => {
    if (entries.length === 0) {
      replaceChildren(list, h('p', { class: 'picker__empty' }, 'To pojęcie nie było jeszcze oceniane.'));
      return;
    }
    replaceChildren(list, h('ul', { class: 'group__list', role: 'list' },
      entries.map((entry) => h('li', { class: 'history__entry' },
        h('span', { class: 'history__score' }, `${entry.totalScore}/${entry.availableElementCount}`),
        h('span', { class: 'row__text' },
          h('span', { class: 'row__title' }, ASSESSMENT_STATUS_NAMES[entry.assessmentStatus] ?? ''),
          h('span', { class: 'row__subtitle' },
            `${DIRECTION_NAMES[entry.direction] ?? ''}, decyzja: ${DECISION_NAMES[entry.swipeDecision] ?? ''}`),
          entry.review ? h('span', { class: 'row__subtitle', dataset: { testid: 'history-fsrs' } },
            `FSRS: ${RATING_LABELS[entry.review.rating]} (${RATING_NAMES[entry.review.rating]}), następna powtórka za ${formatInterval(entry.review.interval)}`) : null,
          h('span', { class: 'row__subtitle' }, new Date(entry.assessedAt).toLocaleString('pl-PL', {
            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
          }))
        )
      ))
    ));
  }).catch((error) => {
    replaceChildren(list, message(error?.message ?? String(error), 'error'));
  });
  return sheet;
}

// ---------------------------------------------------------------- eksport

const EXPORT_SCOPE_LABELS = {
  all: () => 'Cała biblioteka',
  domain: (name) => `Dziedzina „${name}”`,
  module: (name) => `Moduł „${name}”`,
  lesson: (name) => `Lekcja „${name}”`,
  terms: () => 'Zaznaczone pojęcia'
};

/**
 * Arkusz eksportu do pliku XLSX albo CSV.
 * scope: { kind: 'all' } | { kind: 'domain' | 'module' | 'lesson', id } | { kind: 'terms', ids }.
 */
export function openExportSheet(ctx, scope) {
  const { library } = ctx;
  const { name, rows } = collectExportRows(library, scope);
  const count = rows.length;
  const notes = collectExportNotes(library, scope);
  const state = { format: 'xlsx', notes: true };

  return openFormSheet({
    title: 'Eksport do pliku',
    submitLabel: 'Eksportuj',
    build(api) {
      const withNotes = () => state.format === 'xlsx' && state.notes && notes.length > 0;
      const empty = message(notes.length > 0 ? 'W tym zakresie nie ma pojęć – plik CSV byłby pusty. Wybierz Excel, żeby wyeksportować notatki.' : 'W tym zakresie nie ma pojęć do eksportu.', 'warning');
      const notesOptions = notes.length > 0
        ? h('div', { class: 'form-stack', dataset: { testid: 'export-notes' } },
            formGroup(null, toggle({ checked: state.notes, label: `Dołącz notatki do lekcji (${notes.length})`, onChange: (value) => { state.notes = value; sync(); } })),
            h('p', { class: 'form-note' }, 'Arkusz „Notatki” z tekstem z formatowaniem i obrazami – w tym samym układzie, który przyjmuje import.'))
        : null;
      const sync = () => {
        api.setCanSubmit(count > 0 || withNotes());
        empty.hidden = count > 0 || withNotes();
        if (notesOptions) notesOptions.hidden = state.format !== 'xlsx';
      };
      const view = [
        formGroup('Zakres',
          h('div', { class: 'field', dataset: { testid: 'export-scope' } },
            h('span', { class: 'field__label' }, EXPORT_SCOPE_LABELS[scope.kind](name)),
            h('span', null, pluralTerms(count)),
            notes.length > 0 ? h('span', { class: 'field__hint field__hint--live' }, `Notatki do lekcji: ${notes.length}`) : null
          )
        ),
        h('section', { class: 'group' },
          h('h3', { class: 'form-group__title' }, 'Format'),
          segmented({
            name: 'export-format',
            label: 'Format pliku',
            value: state.format,
            options: EXPORT_FORMATS.map((format) => ({ value: format.id, label: format.label })),
            onChange: (value) => { state.format = value; sync(); }
          })
        ),
        notesOptions,
        empty,
        h('p', { class: 'form-note' },
          'Plik ma te same kolumny, których oczekuje import, więc możesz go poprawić w arkuszu i wczytać z powrotem. Postępy nauki zapisuje kopia zapasowa w Ustawieniach, nie eksport.')
      ];
      sync();
      return view;
    },
    async onSubmit() {
      const exported = await buildExportFile(library, scope, state.format, new Date(), { notes: state.notes });
      const file = new File([exported.bytes], exported.name, { type: exported.type });
      const contents = exported.notes > 0 ? `${pluralTerms(exported.count)} i ${pluralNotes(exported.notes)}` : pluralTerms(exported.count);
      const outcome = await deliverFile(file, {
        title: 'Plik jest gotowy',
        message: `Zawiera: ${contents}. W następnym kroku wybierz „Zachowaj w Plikach”.`
      });
      if (outcome === 'cancelled') return false;
      toast(outcome === 'downloaded' ? `Zapisano plik ${file.name}.` : `Wyeksportowano: ${contents}.`);
      return true;
    }
  });
}

export async function loadSampleData(ctx) {
  return runAction(() => installSampleData(ctx.library), (report) => importSummary(report));
}
