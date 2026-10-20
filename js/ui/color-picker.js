// Wybór własnego koloru (od 1.14 w edytorze rysunku, od 1.18 także dla tekstu notatki): siatka
// 12 odcieni w sześciu jasnościach z wierszem szarości, suwaki RGB z kodem HEX, a w notatce –
// pipetka systemu (EyeDropper, Chrome i Edge na komputerze). Trzy ostatnie własne kolory są
// wspólne dla rysunku i notatek (zapamiętane w ustawieniach narzędzi rysunku na tym urządzeniu).

import { cleanToolSettings, hexToRgb, hslToHex, isHexColor, rememberColor, rgbToHex } from '../core/drawing.js';
import { field } from './components.js';
import { openFormSheet } from './dialogs.js';
import { h, replaceChildren } from './dom.js';

/** Klucz ustawień narzędzi rysunku (tam są też własne kolory). */
export const TOOLS_KEY = 'lexicards-drawing-tools';

/** Siatka kolorów: 12 odcieni w sześciu jasnościach i wiersz szarości od bieli do czerni. */
export const COLOR_GRID = (() => {
  const hues = [0, 22, 40, 55, 85, 135, 170, 195, 215, 250, 280, 320];
  const rows = [[90, 86], [85, 72], [80, 58], [78, 46], [72, 35], [65, 24]];
  const colors = rows.flatMap(([saturation, lightness]) => hues.map((hue) => hslToHex(hue, saturation, lightness)));
  for (let step = 0; step < 12; step += 1) colors.push(hslToHex(0, 0, 100 - (step * 100) / 11));
  return colors;
})();
const CHANNEL_LABELS = ['Czerwony', 'Zielony', 'Niebieski'];

/** Kolor #rrggbb z wpisanego kodu („#12ab34”, „12AB34”, „#1a3”) albo null. */
export function parseHex(text) {
  const value = `#${text.trim().replace(/^#/, '').toLowerCase()}`;
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${[...value.slice(1)].map((digit) => digit + digit).join('')}`;
  return isHexColor(value) ? value : null;
}

/**
 * Zawartość karty wyboru koloru: 'grid' – siatka, 'sliders' – suwaki RGB i kod HEX.
 * getColor() – bieżący kolor, setColor(hex, source) – wybór (source: 'range' | 'hex' | null).
 * prefix – początek identyfikatorów do testów. Zwraca { body, sync(source) }.
 */
export function colorTabBody(tab, { prefix, getColor, setColor }) {
  if (tab === 'grid') {
    const cells = COLOR_GRID.map((hex, index) => h('button', {
      type: 'button', class: 'drawing__grid-color', style: { '--swatch': hex }, 'aria-label': hex.toUpperCase(),
      dataset: { color: hex, testid: `${prefix}-grid-color-${index}` }, onClick: () => setColor(hex)
    }));
    return {
      body: h('div', { class: 'drawing__color-grid', role: 'group', 'aria-label': 'Siatka kolorów' }, cells),
      sync: () => {
        for (const cell of cells) cell.setAttribute('aria-pressed', String(cell.dataset.color === getColor()));
      }
    };
  }
  const channels = ['r', 'g', 'b'].map((name, channel) => ({
    channel,
    output: h('span', { class: 'drawing__channel-value' }),
    range: h('input', {
      type: 'range', class: 'drawing__range drawing__channel', min: 0, max: 255, step: 1, 'aria-label': CHANNEL_LABELS[channel],
      dataset: { testid: `${prefix}-channel-${name}` },
      onInput: (event) => {
        const rgb = hexToRgb(getColor());
        rgb[channel] = Number(event.target.value);
        setColor(rgbToHex(rgb), 'range');
      }
    })
  }));
  const hexInput = h('input', {
    class: 'input drawing__hex', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 7,
    'aria-label': 'Kod koloru (HEX)', dataset: { testid: `${prefix}-color-hex` },
    onInput: (event) => {
      const hex = parseHex(event.target.value);
      event.target.setAttribute('aria-invalid', String(!hex));
      if (hex) setColor(hex, 'hex');
    }
  });
  return {
    body: h('div', { class: 'drawing__channels' },
      channels.map(({ channel, output, range }) => h('label', { class: 'drawing__channel-row' },
        h('span', { class: 'drawing__channel-name' }, 'RGB'[channel]), range, output)),
      h('label', { class: 'drawing__channel-row' }, h('span', { class: 'drawing__channel-name' }, 'HEX'), hexInput)),
    sync: (source) => {
      const rgb = hexToRgb(getColor());
      for (const { channel, output, range } of channels) {
        range.value = String(rgb[channel]);
        output.textContent = String(rgb[channel]);
        // Tor suwaka: od zera do pełnej składowej przy dwóch pozostałych bez zmian.
        const low = [...rgb];
        const high = [...rgb];
        low[channel] = 0;
        high[channel] = 255;
        range.style.setProperty('--track', `linear-gradient(to right, ${rgbToHex(low)}, ${rgbToHex(high)})`);
      }
      if (source !== 'hex') {
        hexInput.value = getColor().toUpperCase();
        hexInput.removeAttribute('aria-invalid');
      }
    }
  };
}

function readTools() {
  try {
    return cleanToolSettings(JSON.parse(localStorage.getItem(TOOLS_KEY) ?? 'null'));
  } catch {
    return cleanToolSettings(null);
  }
}

/** Trzy ostatnie własne kolory (wspólne dla rysunku i notatek). */
export const readCustomColors = () => readTools().customColors;

/** Zapamiętuje własny kolor (najnowszy pierwszy, najwyżej trzy). */
export function rememberCustomColor(hex) {
  const tools = readTools();
  tools.customColors = rememberColor(tools.customColors, hex);
  try {
    localStorage.setItem(TOOLS_KEY, JSON.stringify(tools));
  } catch {
    // Pamięć urządzenia niedostępna – kolor tylko tym razem.
  }
  return tools.customColors;
}

/**
 * Okno wyboru własnego koloru (od 1.18 – kolor tekstu notatki): karty Siatka, Suwaki i – gdy
 * przeglądarka ją ma – Pipetka (kolor z dowolnego miejsca ekranu). onPick(hex) po „Użyj koloru”.
 */
export function openColorSheet({ title = 'Inny kolor', initial = '#1d1d1f', prefix = 'note', onPick }) {
  let color = isHexColor(initial) ? initial.toLowerCase() : '#1d1d1f';
  let picked = null;
  let tab = 'grid';
  let sync = () => {};
  const tabs = [['grid', 'Siatka'], ['sliders', 'Suwaki']];
  if (typeof window.EyeDropper === 'function') tabs.push(['picker', 'Pipetka']);
  const bodyHost = h('div', { class: 'drawing__color-body' });
  const tabRow = h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Sposób wyboru koloru' });
  const preview = h('span', { class: 'drawing__color-preview', 'aria-hidden': 'true' });
  const code = h('span', { class: 'drawing__color-code', dataset: { testid: `${prefix}-color-value` } });
  const setColor = (hex, source = null) => {
    color = hex;
    preview.style.setProperty('--swatch', color);
    code.textContent = color.toUpperCase();
    sync(source);
  };
  const render = () => {
    replaceChildren(tabRow, tabs.map(([id, label]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(id === tab), dataset: { testid: `${prefix}-color-tab-${id}` },
      onClick: () => { tab = id; render(); }
    }, label)));
    if (tab === 'picker') {
      sync = () => {};
      replaceChildren(bodyHost, h('div', { class: 'color-sheet__picker' },
        h('p', { class: 'drawing__picker-hint' }, 'Pipetka pobierze kolor z dowolnego miejsca ekranu – także z obrazu albo innego okna.'),
        h('button', {
          type: 'button', class: 'drawing__chip', dataset: { testid: `${prefix}-color-eyedropper` },
          onClick: async () => {
            try {
              const result = await new window.EyeDropper().open();
              const hex = parseHex(result?.sRGBHex ?? '');
              if (hex) setColor(hex);
            } catch {
              // Anulowane (Esc) – kolor bez zmian.
            }
          }
        }, 'Pobierz kolor z ekranu')));
    } else {
      const part = colorTabBody(tab, { prefix, getColor: () => color, setColor });
      sync = part.sync;
      replaceChildren(bodyHost, part.body);
    }
    setColor(color);
  };
  render();
  openFormSheet({
    title,
    submitLabel: 'Użyj koloru',
    build: () => [
      tabRow,
      bodyHost,
      field('Wybrany kolor', h('div', { class: 'drawing__color-footer color-sheet__footer' }, preview, code))
    ],
    onSubmit: () => { picked = color; },
    // Wybór po zamknięciu okna – wtedy pole pod spodem (np. tekst notatki) znowu przyjmuje fokus.
    onClose: () => {
      if (!picked) return;
      rememberCustomColor(picked);
      onPick(picked);
    }
  });
}
