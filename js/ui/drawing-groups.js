// Okno „Grupy narzędzi” (od 1.33) – dobór grup na kółkach edytora rysunku (makieta: płótno „Grupy
// narzędzi”): które grupy standardowe są na prawym kółku i w jakiej kolejności (≡ – przeciągnij),
// gotowe zestawy i własne grupy lewego kółka z wybranymi narzędziami (kolejność wyboru – kolejność
// w górnym menu). Zmiany obowiązują po „Gotowe”; „Anuluj” zostawia grupy bez zmian.

import { GROUP_ICONS, GROUP_LIMITS, PRESETS, TOOL_GROUPS, cleanToolGroups, itemLabel, newGroupId } from '../core/tool-ring.js';
import { field, textInput } from './components.js';
import { openFormSheet } from './dialogs.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { enableDragReorder } from './reorder-drag.js';

const ICON_LABELS = {
  star: 'Gwiazdka', caliper: 'Suwmiarka', sketch: 'Szkic', geometry: 'Cyrkiel', notes: 'Notes', ruler: 'Linijka', tag: 'Etykieta', sparkles: 'Iskry'
};

const toolsText = (items) => items.map(itemLabel).join(' · ');
const copyGroups = (config) => ({ order: [...config.order], off: [...config.off], mine: config.mine.map((group) => ({ ...group, items: [...group.items] })) });
function moveIn(list, from, to) {
  const [entry] = list.splice(from, 1);
  list.splice(to, 0, entry);
}

/** Przebudowa części okna z zachowaniem fokusu (przycisk o tym samym data-testid). */
function keepFocus(container, rebuild) {
  const active = document.activeElement;
  const testID = active && container.contains(active) ? active.dataset.testid : null;
  rebuild();
  if (testID) container.querySelector(`[data-testid="${testID}"]`)?.focus({ preventScroll: true });
}

/**
 * config – dobór grup (cleanToolGroups); editing – id grupy lewego kółka otwartej do edycji;
 * onSave(config) – po „Gotowe”, ze sprawdzonym doborem.
 */
export function openToolGroups({ config, editing = null, onSave }) {
  const draft = copyGroups(cleanToolGroups(config));
  let current = draft.mine.some((group) => group.id === editing) ? editing : draft.mine[0]?.id ?? null;
  const editedGroup = () => draft.mine.find((group) => group.id === current) ?? null;

  /** Uchwyt ≡: przeciągnięcie (reorder-drag.js), klawiaturą – strzałki w górę i w dół. */
  const grip = (name, testID, index, count, move) => h('button', {
    type: 'button', class: 'row__grip', 'aria-label': `Przesuń: ${name} (strzałki w górę i w dół)`, title: `Przeciągnij, aby przesunąć: ${name}`,
    dataset: { testid: testID },
    onKeydown: (event) => {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if (!step || index + step < 0 || index + step >= count) return;
      event.preventDefault();
      move(index, index + step);
    }
  }, icon('grip', { size: 22 }));
  const bubble = (name) => h('span', { class: 'tool-groups__bubble', 'aria-hidden': 'true' }, icon(name, { size: 18 }));
  const rowText = (title, subtitle) => h('span', { class: 'row__text' }, h('span', { class: 'row__title' }, title), h('span', { class: 'row__subtitle' }, subtitle));

  // ---- kółko po prawej: grupy standardowe
  const standardList = h('ul', { class: 'tool-groups__list', role: 'list', dataset: { testid: 'tool-groups-standard' } });
  const moveStandard = (from, to) => {
    moveIn(draft.order, from, to);
    keepFocus(standardList, renderStandard);
  };
  function renderStandard() {
    const visible = draft.order.filter((id) => !draft.off.includes(id)).length;
    standardList.replaceChildren(...draft.order.map((id, index) => {
      const group = TOOL_GROUPS.find((entry) => entry.id === id);
      const on = !draft.off.includes(id);
      // Co najmniej jedna grupa zostaje na kółku.
      const last = on && visible === 1;
      return h('li', { class: 'row row--reorder tool-groups__row' },
        h('label', { class: 'row__main tool-groups__main', title: last ? 'Na kółku zostaje co najmniej jedna grupa' : null },
          h('input', {
            type: 'checkbox', class: 'tool-groups__check', checked: on, disabled: last, dataset: { testid: `tool-groups-on-${id}` },
            onChange: (event) => {
              draft.off = event.target.checked ? draft.off.filter((other) => other !== id) : [...draft.off, id];
              keepFocus(standardList, renderStandard);
            }
          }),
          bubble(group.icon),
          rowText(group.label, toolsText(group.items))),
        grip(group.label, `tool-groups-move-${id}`, index, draft.order.length, moveStandard));
    }));
  }
  enableDragReorder(standardList, { onMove: moveStandard });

  // ---- gotowe zestawy
  const presetChips = h('div', { class: 'tool-groups__chips', dataset: { testid: 'tool-groups-presets' } });
  function renderPresets() {
    presetChips.replaceChildren(...PRESETS.map((preset) => {
      const on = draft.mine.some((group) => group.id === preset.id);
      const full = !on && draft.mine.length >= GROUP_LIMITS.groups;
      return h('button', {
        type: 'button', class: 'tool-groups__preset', 'aria-pressed': String(on), disabled: full,
        title: full ? `Najwyżej ${GROUP_LIMITS.groups} grup na lewym kółku` : null, dataset: { testid: `tool-groups-preset-${preset.id}` },
        onClick: () => {
          if (on) {
            draft.mine = draft.mine.filter((group) => group.id !== preset.id);
            if (current === preset.id) current = draft.mine[0]?.id ?? null;
          } else {
            draft.mine.push({ id: preset.id, label: preset.label, icon: preset.icon, items: [...preset.items] });
            current = preset.id;
          }
          renderLeft();
        }
      }, h('span', { class: 'tool-groups__preset-name' }, `${on ? '✓' : '+'} ${preset.label}`),
      h('span', { class: 'tool-groups__preset-tools' }, preset.items.map(itemLabel).join(', ')));
    }));
  }

  // ---- kółko po lewej: moje grupy
  const mineList = h('ul', { class: 'tool-groups__list', role: 'list', dataset: { testid: 'tool-groups-mine' } });
  const mineEmpty = h('p', { class: 'tool-groups__empty' }, 'Brak grup – dodaj gotowy zestaw albo nową grupę.');
  const newButton = h('button', {
    type: 'button', class: 'tool-groups__new', dataset: { testid: 'tool-groups-new' },
    onClick: () => {
      const id = newGroupId(draft.mine);
      draft.mine.push({ id, label: `Moja grupa ${id.slice(4)}`, icon: 'star', items: [] });
      current = id;
      renderLeft();
      nameInput.focus();
      nameInput.select();
    }
  }, icon('plus', { size: 16 }), 'Nowa grupa');
  const moveMine = (from, to) => {
    moveIn(draft.mine, from, to);
    keepFocus(mineList, renderMine);
  };
  function renderMine() {
    mineList.replaceChildren(...draft.mine.map((group, index) => h('li', { class: 'row row--reorder tool-groups__row' },
      h('button', {
        type: 'button', class: 'row__main tool-groups__main tool-groups__edit', 'aria-pressed': String(group.id === current),
        dataset: { testid: `tool-groups-edit-${group.id}` },
        onClick: () => {
          current = group.id;
          renderMine();
          renderEditor();
        }
      }, bubble(group.icon),
      rowText(group.label.trim() || 'Moja grupa', group.items.length ? toolsText(group.items) : 'pusta – zaznacz narzędzia poniżej (pustej grupy nie ma na kółku)'),
      h('span', { class: 'tool-groups__edit-label', 'aria-hidden': 'true' }, 'Edytuj')),
      grip(group.label, `tool-groups-move-${group.id}`, index, draft.mine.length, moveMine))));
    mineList.hidden = draft.mine.length === 0;
    mineEmpty.hidden = draft.mine.length > 0;
    newButton.disabled = draft.mine.length >= GROUP_LIMITS.groups;
    newButton.title = newButton.disabled ? `Najwyżej ${GROUP_LIMITS.groups} grup na lewym kółku` : '';
  }
  enableDragReorder(mineList, { onMove: moveMine });

  // ---- edytowana grupa: nazwa, ikona, narzędzia
  const editorTitle = h('h3', { class: 'tool-groups__title' });
  const nameInput = textInput({
    testID: 'tool-groups-name',
    onInput: (value) => {
      const group = editedGroup();
      if (!group) return;
      group.label = value;
      editorTitle.textContent = `Grupa „${value.trim() || 'Moja grupa'}” – narzędzia`;
      renderMine();
    }
  });
  nameInput.maxLength = GROUP_LIMITS.label;
  const icons = h('div', { class: 'tool-groups__icons', role: 'radiogroup', 'aria-label': 'Ikona grupy' });
  const catalog = h('div', { class: 'tool-groups__catalog' });
  const deleteButton = h('button', {
    type: 'button', class: 'tool-groups__delete', dataset: { testid: 'tool-groups-delete' },
    onClick: () => {
      draft.mine = draft.mine.filter((group) => group.id !== current);
      current = draft.mine[0]?.id ?? null;
      renderLeft();
    }
  }, icon('trash', { size: 16 }), 'Usuń grupę');
  const editor = h('section', { class: 'tool-groups__section', dataset: { testid: 'tool-groups-editor' } },
    editorTitle,
    field('Nazwa', nameInput),
    h('div', { class: 'tool-groups__label' }, 'Ikona'),
    icons,
    h('p', { class: 'field__hint' }, `Zaznacz narzędzia, które mają być w tej grupie – górne menu pokaże je w tej kolejności (numer przy nazwie; najwyżej ${GROUP_LIMITS.items}).`),
    catalog,
    deleteButton);
  function renderEditor() {
    const group = editedGroup();
    editor.hidden = !group;
    if (!group) return;
    editorTitle.textContent = `Grupa „${group.label.trim() || 'Moja grupa'}” – narzędzia`;
    if (nameInput.dataset.group !== group.id) {
      nameInput.dataset.group = group.id;
      nameInput.value = group.label;
    }
    keepFocus(icons, () => icons.replaceChildren(...GROUP_ICONS.map((name) => h('button', {
      type: 'button', class: 'tool-groups__icon', role: 'radio', 'aria-checked': String(group.icon === name), 'aria-label': ICON_LABELS[name], title: ICON_LABELS[name],
      dataset: { testid: `tool-groups-icon-${name}` },
      onClick: () => {
        group.icon = name;
        renderMine();
        renderEditor();
      }
    }, icon(name, { size: 20 })))));
    const full = group.items.length >= GROUP_LIMITS.items;
    keepFocus(catalog, () => catalog.replaceChildren(...TOOL_GROUPS.map((standard) => h('div', { class: 'tool-groups__kind' },
      h('div', { class: 'tool-groups__label' }, standard.label),
      h('div', { class: 'tool-groups__chips' }, standard.items.map((item) => {
        const position = group.items.indexOf(item);
        const on = position >= 0;
        return h('button', {
          type: 'button', class: 'tool-groups__chip', 'aria-pressed': String(on), disabled: !on && full,
          'aria-label': on ? `${itemLabel(item)} – ${position + 1}. w menu` : itemLabel(item), dataset: { testid: `tool-groups-item-${item}` },
          onClick: () => {
            group.items = on ? group.items.filter((other) => other !== item) : [...group.items, item];
            renderMine();
            renderEditor();
          }
        }, on ? h('span', { class: 'tool-groups__order', 'aria-hidden': 'true' }, String(position + 1)) : null, itemLabel(item));
      }))))));
  }
  function renderLeft() {
    renderPresets();
    renderMine();
    renderEditor();
  }

  renderStandard();
  renderLeft();
  const section = (title, hint, ...content) => h('section', { class: 'tool-groups__section' },
    h('h3', { class: 'tool-groups__title' }, title), hint ? h('p', { class: 'field__hint' }, hint) : null, ...content);
  return openFormSheet({
    title: 'Grupy narzędzi',
    submitLabel: 'Gotowe',
    build: () => h('div', { class: 'tool-groups', dataset: { testid: 'tool-groups' } },
      section('Kółko po prawej – narzędzia standardowe', 'Zaznaczone grupy są na kółku, w tej kolejności (≡ – przeciągnij).', standardList),
      section('Gotowe zestawy', 'Dotknięcie dodaje zestaw jako grupę na lewym kółku – z kompletem narzędzi; ponowne dotknięcie usuwa grupę.', presetChips),
      section('Kółko po lewej – moje grupy', null, mineList, mineEmpty, newButton),
      editor),
    onSubmit: () => {
      onSave(cleanToolGroups(draft));
      return true;
    }
  });
}
