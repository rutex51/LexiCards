// Układ wzoru do narysowania na płótnie (od 1.13 – wzory na rysunku). Wzór w notatce składa
// przeglądarka (MathML), ale obrazu MathML nie da się przenieść na płótno (Safari blokuje zapis
// płótna z taką grafiką), więc rysunek składa wzór sam: z drzewa parseMath() powstają pudełka
// { w, a, d, draw } – szerokość, wysokość nad i pod linią bazową oraz rysowanie na płótnie
// (fillText, linie kresek ułamka, znak pierwiastka, nawiasy dopasowane do wysokości).
//
// Uproszczony układ jak w TeX: style wyświetlany, tekstowy, indeksu i indeksu indeksu (rozmiary
// 1, 1, 0,7, 0,5), odstępy wokół znaków działań i relacji, granice sumy nad i pod znakiem.
// Szerokość tekstu mierzy przekazana funkcja `measure(text, font)` → szerokość – w przeglądarce
// measureText płótna, w testach – przybliżenie.

import { parseMath } from './math.js';

export const MATH_FONT = '"STIX Two Math", "Cambria Math", "Latin Modern Math", STIXGeneral, "Times New Roman", serif';
const ERROR_COLOR = '#d70015';

/** Style: 0 – wyświetlany, 1 – tekstowy, 2 – indeks, 3 – indeks indeksu. */
const STYLE_SCALE = [1, 1, 0.7, 0.5];
const fracStyle = (style) => Math.min(3, style + 1);
const scriptStyle = (style) => (style <= 1 ? 2 : 3);

const RELATIONS = new Set(['=', '<', '>', '≤', '≥', '≠', '≈', '∼', '≃', '≅', '≡', '∝', '≪', '≫', '∈', '∉', '∋', '⊂', '⊆',
  '⊃', '⊇', '→', '←', '↔', '⇒', '⇐', '⇔', '↦', '↑', '↓', '⊥', '∥', '∣', ':']);
const BINARY = new Set(['+', '−', '±', '∓', '×', '÷', '⋅', '∗', '⋆', '∘', '•', '∪', '∩', '∖', '∧', '∨', '/']);
const PUNCTUATION = new Set([',', ';']);
const OPENING = new Set(['(', '[', '{', '⟨', '⌊', '⌈']);
const CLOSING = new Set([')', ']', '}', '⟩', '⌋', '⌉']);

/** Pudełko bez treści (np. pusta podstawa potęgi). */
const empty = () => ({ w: 0, a: 0, d: 0, draw() {} });

/** Znak albo napis jedną czcionką; wysokość z proporcji kroju (stała – wiersze równej wysokości). */
function glyph(text, font, size, measure, color = null) {
  const w = measure(text, font);
  return {
    w, a: size * 0.72, d: size * 0.24,
    draw(ctx, x, y) {
      ctx.font = font;
      if (color) {
        const previous = ctx.fillStyle;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.fillStyle = previous;
      } else {
        ctx.fillText(text, x, y);
      }
    }
  };
}

const fontOf = (size, { italic = false, bold = false } = {}) => `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${MATH_FONT}`;

/** Rodzaj elementu do odstępów: zwykły, duży operator / funkcja, działanie, relacja, nawiasy, przecinek. */
function kindOf(node) {
  if (node.t === 'o') {
    if (node.large) return 'op';
    if (RELATIONS.has(node.v)) return 'rel';
    if (BINARY.has(node.v)) return 'bin';
    if (PUNCTUATION.has(node.v)) return 'punct';
    if (OPENING.has(node.v)) return 'open';
    if (CLOSING.has(node.v)) return 'close';
    return 'ord';
  }
  if (node.t === 'i' && node.fn) return 'op';
  if (node.t === 'scripts') return kindOf(node.base) === 'op' ? 'op' : 'ord';
  if (node.t === 'space') return 'space';
  return 'ord';
}

/** Wiersz: elementy obok siebie z odstępami (w indeksach bez odstępów wokół działań i relacji). */
function layoutRow(children, ctx) {
  const size = ctx.base * STYLE_SCALE[ctx.style];
  const tight = ctx.style >= 2;
  const items = [];
  let previous = null;
  for (const child of children) {
    let kind = kindOf(child);
    // Działanie na początku albo po innym działaniu, relacji, nawiasie – znak liczby (−5), bez odstępów.
    if (kind === 'bin' && (previous === null || ['bin', 'rel', 'open', 'punct', 'op'].includes(previous))) kind = 'ord';
    let space = 0;
    if (!tight && previous !== null) {
      if (kind === 'rel' || previous === 'rel') space = size * 0.28;
      else if (kind === 'bin' || previous === 'bin') space = size * 0.22;
      else if (previous === 'punct') space = size * 0.17;
      else if (previous === 'op' && (kind === 'ord' || kind === 'op')) space = size * 0.17;
    }
    items.push({ box: layout(child, ctx), space });
    if (kind !== 'space') previous = kind;
  }
  let w = 0;
  let a = 0;
  let d = 0;
  for (const item of items) {
    w += item.space;
    item.x = w;
    w += item.box.w;
    a = Math.max(a, item.box.a);
    d = Math.max(d, item.box.d);
  }
  if (items.length === 0) return { w: 0, a: size * 0.72, d: size * 0.24, draw() {} };
  return {
    w, a, d,
    draw(context, x, y) {
      for (const item of items) item.box.draw(context, x + item.x, y);
    }
  };
}

/** Kreska (ułamek, pierwiastek, akcent) od (x0, y0) do (x1, y1). */
function line(context, x0, y0, x1, y1, width) {
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x0, y0);
  context.lineTo(x1, y1);
  context.stroke();
}

function layoutFrac(node, ctx) {
  const size = ctx.base * STYLE_SCALE[ctx.style];
  const inner = { ...ctx, style: fracStyle(ctx.style) };
  const top = layout(node.a, inner);
  const bottom = layout(node.b, inner);
  const rule = Math.max(size * 0.055, 1);
  const axis = size * 0.25;
  const gap = ctx.style === 0 ? size * 0.16 : size * 0.1;
  const pad = size * 0.12;
  const w = Math.max(top.w, bottom.w) + pad * 2;
  const topShift = axis + rule / 2 + gap + top.d;
  const bottomShift = rule / 2 + gap + bottom.a - axis;
  return {
    w, a: topShift + top.a, d: bottomShift + bottom.d,
    draw(context, x, y) {
      top.draw(context, x + (w - top.w) / 2, y - topShift);
      bottom.draw(context, x + (w - bottom.w) / 2, y + bottomShift);
      if (node.line !== false) line(context, x + pad / 2, y - axis, x + w - pad / 2, y - axis, rule);
    }
  };
}

function layoutSqrt(node, ctx) {
  const size = ctx.base * STYLE_SCALE[ctx.style];
  const body = layout(node.a, ctx);
  const index = node.index ? layout(node.index, { ...ctx, style: 3 }) : null;
  const rule = Math.max(size * 0.055, 1);
  const gap = size * 0.12;
  const sign = size * 0.55;
  const a = body.a + gap + rule;
  const d = body.d + size * 0.06;
  const offset = index ? Math.max(0, index.w - sign * 0.45) : 0;
  const w = offset + sign + body.w + size * 0.12;
  const height = a + d;
  return {
    w, a: index ? Math.max(a, height * 0.55 + index.a + index.d) : a, d,
    draw(context, x, y) {
      const left = x + offset;
      const top = y - a + rule / 2;
      const bottom = y + d;
      context.lineWidth = rule;
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(left, bottom - height * 0.42);
      context.lineTo(left + sign * 0.2, bottom - height * 0.5);
      context.lineTo(left + sign * 0.5, bottom);
      context.lineTo(left + sign, top);
      context.lineTo(left + sign + body.w + size * 0.1, top);
      context.stroke();
      body.draw(context, left + sign + size * 0.04, y);
      if (index) index.draw(context, x + Math.max(0, sign * 0.45 - index.w) / 2, bottom - height * 0.55 - index.d);
    }
  };
}

/** Granice nad i pod (suma, lim w stylu wyświetlanym) albo potęga i indeks obok. */
function layoutScripts(node, ctx) {
  const size = ctx.base * STYLE_SCALE[ctx.style];
  const base = layout(node.base, ctx);
  const inner = { ...ctx, style: scriptStyle(ctx.style) };
  const sup = node.sup ? layout(node.sup, inner) : null;
  const sub = node.sub ? layout(node.sub, inner) : null;
  const stacked = ctx.style === 0 && node.base.limits;
  if (stacked) {
    const gap = size * 0.12;
    const w = Math.max(base.w, sup?.w ?? 0, sub?.w ?? 0);
    const supShift = sup ? base.a + gap + sup.d : 0;
    const subShift = sub ? base.d + gap + sub.a : 0;
    return {
      w, a: sup ? supShift + sup.a : base.a, d: sub ? subShift + sub.d : base.d,
      draw(context, x, y) {
        base.draw(context, x + (w - base.w) / 2, y);
        sup?.draw(context, x + (w - sup.w) / 2, y - supShift);
        sub?.draw(context, x + (w - sub.w) / 2, y + subShift);
      }
    };
  }
  const supShift = sup ? Math.max(base.a - size * 0.22, size * 0.4) : 0;
  let subShift = sub ? Math.max(base.d + size * 0.02, size * 0.2) : 0;
  if (sup && sub) subShift = Math.max(subShift, size * 0.3);
  const gap = size * 0.04;
  const w = base.w + gap + Math.max(sup?.w ?? 0, sub?.w ?? 0);
  return {
    w, a: Math.max(base.a, sup ? supShift + sup.a : 0), d: Math.max(base.d, sub ? subShift + sub.d : 0),
    draw(context, x, y) {
      base.draw(context, x, y);
      sup?.draw(context, x + base.w + gap, y - supShift);
      sub?.draw(context, x + base.w + gap, y + subShift);
    }
  };
}

/** Akcent nad znakiem (wektor, kreska, daszek, falka, kropki) albo kreska pod. */
function layoutAccent(node, ctx) {
  const size = ctx.base * STYLE_SCALE[ctx.style];
  const base = layout(node.base, ctx);
  const rule = Math.max(size * 0.05, 1);
  const room = size * 0.24;
  const w = Math.max(base.w, size * 0.4);
  return {
    w, a: node.under ? base.a : base.a + room, d: node.under ? base.d + room * 0.6 : base.d,
    draw(context, x, y) {
      base.draw(context, x + (w - base.w) / 2, y);
      const cx = x + w / 2;
      const top = y - base.a - room * 0.45;
      context.lineWidth = rule;
      if (node.under) {
        line(context, x, y + base.d + room * 0.3, x + w, y + base.d + room * 0.3, rule);
        return;
      }
      switch (node.v) {
        case '→': {
          line(context, x, top, x + w, top, rule);
          context.beginPath();
          context.moveTo(x + w - size * 0.12, top - size * 0.08);
          context.lineTo(x + w, top);
          context.lineTo(x + w - size * 0.12, top + size * 0.08);
          context.stroke();
          break;
        }
        case '^': {
          const half = Math.min(w, size * 0.5) / 2;
          context.beginPath();
          context.moveTo(cx - half, top + size * 0.08);
          context.lineTo(cx, top - size * 0.06);
          context.lineTo(cx + half, top + size * 0.08);
          context.stroke();
          break;
        }
        case '~': {
          const half = Math.min(w, size * 0.55) / 2;
          context.beginPath();
          context.moveTo(cx - half, top + size * 0.03);
          context.bezierCurveTo(cx - half / 2, top - size * 0.1, cx, top + size * 0.1, cx + half / 2, top - size * 0.02);
          context.quadraticCurveTo(cx + half * 0.8, top - size * 0.07, cx + half, top - size * 0.03);
          context.stroke();
          break;
        }
        case '˙':
        case '¨': {
          const dots = node.v === '˙' ? [0] : [-size * 0.09, size * 0.09];
          for (const dx of dots) {
            context.beginPath();
            context.arc(cx + dx, top, size * 0.045, 0, Math.PI * 2);
            context.fill();
          }
          break;
        }
        default:
          line(context, x, top, x + w, top, rule);
      }
    }
  };
}

/** Nawias w danym miejscu, dopasowany do wysokości treści (rysowany kreską, nie znakiem czcionki). */
function delimiter(char, height, size) {
  if (!char) return { w: 0, draw() {} };
  const rule = Math.max(size * 0.06, 1);
  const w = size * 0.3 + Math.min(height, size * 4) * 0.04;
  const mirror = CLOSING.has(char) || char === '⟩';
  return {
    w,
    draw(context, x, top, bottom) {
      context.save();
      context.lineWidth = rule;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      if (mirror) {
        context.translate(x + w, 0);
        context.scale(-1, 1);
        x = 0;
      }
      const inner = x + w * 0.8;
      const outer = x + w * 0.22;
      const middle = (top + bottom) / 2;
      context.beginPath();
      switch (mirror ? ({ ')': '(', ']': '[', '}': '{', '⟩': '⟨', '⌋': '⌊', '⌉': '⌈' })[char] : char) {
        case '(':
          context.moveTo(inner, top);
          context.quadraticCurveTo(outer - w * 0.2, middle, inner, bottom);
          break;
        case '[':
          context.moveTo(inner, top);
          context.lineTo(outer, top);
          context.lineTo(outer, bottom);
          context.lineTo(inner, bottom);
          break;
        case '⌊':
          context.moveTo(outer, top);
          context.lineTo(outer, bottom);
          context.lineTo(inner, bottom);
          break;
        case '⌈':
          context.moveTo(inner, top);
          context.lineTo(outer, top);
          context.lineTo(outer, bottom);
          break;
        case '{': {
          const mid = (inner + outer) / 2;
          context.moveTo(inner, top);
          context.quadraticCurveTo(mid, top, mid, top + (bottom - top) * 0.12);
          context.lineTo(mid, middle - (bottom - top) * 0.08);
          context.quadraticCurveTo(mid, middle, outer, middle);
          context.quadraticCurveTo(mid, middle, mid, middle + (bottom - top) * 0.08);
          context.lineTo(mid, bottom - (bottom - top) * 0.12);
          context.quadraticCurveTo(mid, bottom, inner, bottom);
          break;
        }
        case '⟨':
          context.moveTo(inner, top);
          context.lineTo(outer, middle);
          context.lineTo(inner, bottom);
          break;
        case '‖':
          context.moveTo(x + w * 0.35, top);
          context.lineTo(x + w * 0.35, bottom);
          context.moveTo(x + w * 0.65, top);
          context.lineTo(x + w * 0.65, bottom);
          break;
        default:
          // | i każdy inny znak – pionowa kreska.
          context.moveTo(x + w / 2, top);
          context.lineTo(x + w / 2, bottom);
      }
      context.stroke();
      context.restore();
    }
  };
}

function layoutFence(node, ctx) {
  const size = ctx.base * STYLE_SCALE[ctx.style];
  const body = layout(node.body, ctx);
  const axis = size * 0.25;
  // Nawiasy symetryczne względem osi wzoru, nie niższe niż wiersz tekstu.
  const half = Math.max(body.a - axis, body.d + axis, size * 0.5) + size * 0.06;
  const open = delimiter(node.open, half * 2, size);
  const close = delimiter(node.close, half * 2, size);
  const gap = size * 0.04;
  const w = open.w + gap + body.w + gap + close.w;
  return {
    w, a: axis + half, d: half - axis,
    draw(context, x, y) {
      const top = y - axis - half;
      const bottom = y - axis + half;
      open.draw(context, x, top, bottom);
      body.draw(context, x + open.w + gap, y);
      close.draw(context, x + open.w + gap + body.w + gap, top, bottom);
    }
  };
}

/** Duży operator (∑, ∏, ∫) w stylu wyświetlanym – większy, wyśrodkowany na osi wzoru. */
function layoutLarge(node, ctx) {
  const size = ctx.base * STYLE_SCALE[ctx.style];
  const scale = ctx.style === 0 ? (node.v.startsWith('∫') || '∬∭∮'.includes(node.v) ? 1.9 : 1.55) : 1.15;
  const big = size * scale;
  const box = glyph(node.v, fontOf(big), big, ctx.measure);
  const axis = size * 0.25;
  // Znak ma w kroju wysokość ok. 0,72 i głębokość 0,24 rozmiaru – środek przesunięty na oś.
  const shift = axis - (box.a - box.d) / 2;
  return {
    w: box.w + size * 0.05, a: box.a + shift, d: box.d - shift,
    draw(context, x, y) {
      box.draw(context, x, y - shift);
    }
  };
}

function layout(node, ctx) {
  const size = ctx.base * STYLE_SCALE[ctx.style];
  switch (node?.t) {
    case 'row':
      return layoutRow(node.c, ctx);
    case 'i': {
      const italic = !node.upright && !node.fn && [...node.v].length === 1;
      return glyph(node.v, fontOf(size, { italic, bold: node.bold }), size, ctx.measure);
    }
    case 'n':
      return glyph(node.v, fontOf(size, { bold: node.bold }), size, ctx.measure);
    case 'o':
      return node.large ? layoutLarge(node, ctx) : glyph(node.v, fontOf(size), size, ctx.measure);
    case 'text':
      return glyph(node.v, fontOf(size), size, ctx.measure);
    case 'space':
      return { w: node.w * size, a: 0, d: 0, draw() {} };
    case 'error':
      return glyph(node.v, fontOf(size), size, ctx.measure, ERROR_COLOR);
    case 'frac':
      return layoutFrac(node, ctx);
    case 'sqrt':
      return layoutSqrt(node, ctx);
    case 'scripts':
      return layoutScripts(node, ctx);
    case 'accent':
      return layoutAccent(node, ctx);
    case 'fence':
      return layoutFence(node, ctx);
    default:
      return empty();
  }
}

/**
 * Układ wzoru `source` (zapis jak w notatce, bez znaków dolara) w rozmiarze `size` (wysokość
 * czcionki). Zwraca { width, ascent, descent, errors, draw(ctx, x, baseline, color) } – draw rysuje
 * wzór od lewej krawędzi x, z linią bazową na wysokości baseline; błędy zapisu są czerwone.
 */
export function layoutMath(source, { size = 40, measure }) {
  const { tree, errors } = parseMath(source);
  const box = layout(tree, { base: size, style: 0, measure });
  const pad = size * 0.06;
  return {
    width: box.w + pad * 2,
    ascent: box.a + pad,
    descent: box.d + pad,
    errors,
    draw(ctx, x, baseline, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      box.draw(ctx, x + pad, baseline);
      ctx.restore();
    }
  };
}
