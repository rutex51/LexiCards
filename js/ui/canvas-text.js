// Tekst na płótnie rysunku: czcionka, wysokość wiersza, pomiar napisu i łamanie wierszy (od 1.21
// wspólne dla pól tekstowych, tekstu na kształcie, tabel i karteczek).

export const TEXT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
/** Wysokość wiersza względem wielkości czcionki. */
export const TEXT_LINE = 1.25;

let measureCanvas = null;
/** Szerokość napisu daną czcionką (płótno pomocnicze – bez rysowania). */
export function measureText(text, font) {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Czcionka napisu: wielkość w jednostkach strony, weight – np. '600' (pogrubienie). */
export const textFont = (size, weight = '') => `${weight ? `${weight} ` : ''}${size}px ${TEXT_FONT}`;

/**
 * Wiersze tekstu: Enter zaczyna nowy wiersz, długi wiersz łamie się na słowach (za długie słowo –
 * na znakach). weight – pogrubienie (od 1.21: nagłówek tabeli).
 */
export function textLines(text, size, maxWidth, weight = '') {
  const font = textFont(size, weight);
  // Pół piksela zapasu – szerokość zaokrąglona do całych pikseli nie łamie słowa, które się mieści.
  const fits = (value) => measureText(value, font) <= maxWidth + 0.5;
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (current !== '' && !fits(candidate)) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
      while (!fits(current) && [...current].length > 1) {
        let head = '';
        for (const char of current) {
          if (head !== '' && !fits(head + char)) break;
          head += char;
        }
        lines.push(head);
        current = current.slice(head.length);
      }
    }
    lines.push(current);
  }
  return lines;
}
