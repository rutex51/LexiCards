// Równania w notatkach (od 1.11): zapis tekstem w stylu LaTeX między znakami dolara – $x^2$ w tekście,
// $$…$$ jako osobny wiersz – zamieniany w podglądzie na wzór (MathML, który przeglądarka składa sama).
// Tu: wyszukiwanie wzorów w tekście, odczyt zapisu do drzewa i jego słowny odpowiednik (czytanie na
// głos, słuchanie). Bez zależności od przeglądarki.
//
// Węzły drzewa: { t: 'row', c } | { t: 'i', v, upright?, bold?, fn? } (zmienna, nazwa funkcji) | { t: 'n', v }
// (liczba) | { t: 'o', v, limits?, large? } (znak działania) | { t: 'text', v } | { t: 'frac', a, b, line? }
// | { t: 'sqrt', a, index? } | { t: 'scripts', base, sub?, sup? } | { t: 'accent', base, v, under? }
// | { t: 'fence', open, close, body } | { t: 'space', w } | { t: 'error', v } (nieznane polecenie).

/** Najdłuższy wzór i najgłębsze zagnieżdżenie nawiasów – dłuższe zostają tekstem. */
const MAX_SOURCE = 2000;
const MAX_DEPTH = 40;

// ---------------------------------------------------------------- wzory w tekście

/**
 * Pierwszy `$` zamykający wzór w tekście od `from` (zasady jak w Pandoc): tuż po otwierającym `$`
 * nie ma odstępu, tuż przed zamykającym – też nie, a zaraz po zamykającym nie stoi cyfra. Dzięki
 * temu kwoty („$20 i $30”, „$5/$10”) zostają tekstem. -1 – brak wzoru.
 */
function closingDollar(text, from) {
  const first = text[from];
  if (first === undefined || /\s|\$/.test(first)) return -1;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '\n') return -1;
    if (char !== '$') continue;
    if (/\s/.test(text[index - 1]) || /\d/.test(text[index + 1] ?? '')) return -1;
    return index;
  }
  return -1;
}

/**
 * Dzieli tekst na zwykły tekst i wzory: [{ type: 'text', text } | { type: 'math', source, display }].
 * `$…$` – wzór w wierszu, `$$…$$` – wzór wyświetlany osobno; `\$` – zwykły znak dolara.
 */
export function mathSegments(text) {
  const parts = [];
  let plain = '';
  const flush = () => {
    if (plain) parts.push({ type: 'text', text: plain });
    plain = '';
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\' && text[index + 1] === '$') {
      plain += '$';
      index += 2;
      continue;
    }
    if (char === '$' && text[index + 1] === '$') {
      const end = text.indexOf('$$', index + 2);
      const inner = end === -1 ? '' : text.slice(index + 2, end).trim();
      if (inner !== '' && inner.length <= MAX_SOURCE) {
        flush();
        parts.push({ type: 'math', source: inner, display: true });
        index = end + 2;
        continue;
      }
      plain += '$$';
      index += 2;
      continue;
    }
    if (char === '$') {
      const end = closingDollar(text, index + 1);
      if (end !== -1 && end - index - 1 <= MAX_SOURCE) {
        flush();
        parts.push({ type: 'math', source: text.slice(index + 1, end), display: false });
        index = end + 1;
        continue;
      }
    }
    plain += char;
    index += 1;
  }
  flush();
  return parts;
}

/** Czy w tekście jest choć jeden wzór. */
export function hasMath(text) {
  return String(text ?? '').includes('$') && mathSegments(String(text)).some((part) => part.type === 'math');
}

// ---------------------------------------------------------------- polecenia

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
};

/** Znaki działań, relacje, strzałki i symbole (zapisywane jako znak działania). */
const OPERATORS = {
  cdot: '⋅', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '•',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', sim: '∼', simeq: '≃', cong: '≅',
  equiv: '≡', propto: '∝', ll: '≪', gg: '≫',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩',
  setminus: '∖', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', wedge: '∧', vee: '∨',
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
  Leftrightarrow: '⇔', implies: '⇒', iff: '⇔', mapsto: '↦', uparrow: '↑', downarrow: '↓',
  perp: '⊥', parallel: '∥', mid: '∣', angle: '∠', ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', vert: '|', Vert: '‖',
  colon: ':', prime: '′'
};

/** Symbole zapisywane jak zmienne (nie znaki działań). */
const SYMBOLS = {
  infty: '∞', partial: '∂', nabla: '∇', emptyset: '∅', varnothing: '∅', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ',
  aleph: 'ℵ', triangle: '△', degree: '°'
};

/** Duże operatory z granicami nad i pod (w wierszu – obok). */
const BIG_OPERATORS = { sum: '∑', prod: '∏', coprod: '∐', bigcup: '⋃', bigcap: '⋂' };
/** Całki – granice zawsze obok. */
const INTEGRALS = { int: '∫', iint: '∬', iiint: '∭', oint: '∮' };
/** Nazwy funkcji pisane prosto; te z `limits` mają granice pod spodem (lim, max…). */
const FUNCTIONS = [
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'tg', 'ctg', 'arcsin', 'arccos', 'arctan', 'arctg', 'arcctg',
  'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'det', 'dim', 'ker', 'deg', 'gcd', 'arg', 'mod'
];
const LIMIT_FUNCTIONS = ['lim', 'max', 'min', 'sup', 'inf'];

/** Odstępy (em). */
const SPACES = { ',': 0.1667, ':': 0.2222, '>': 0.2222, ';': 0.2778, '!': -0.1667, ' ': 0.3333, quad: 1, qquad: 2 };

/** Akcenty nad i pod znakiem. */
const ACCENTS = {
  vec: '→', overrightarrow: '→', bar: '¯', overline: '‾', hat: '^', widehat: '^', tilde: '~', widetilde: '~',
  dot: '˙', ddot: '¨', underline: '‾'
};

/** Litery zbiorów liczbowych: \mathbb{R} → ℝ (inne litery – zwykłe, pogrubione). */
const DOUBLE_STRUCK = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ' };

/** Znaki pisane wprost, które są znakami działań (minus – prawdziwy minus, gwiazdka – kropka mnożenia). */
const CHAR_OPERATORS = { '-': '−', '*': '⋅', "'": '′' };

// ---------------------------------------------------------------- odczyt zapisu

/** Odczytuje zapis wzoru. Zwraca { tree, errors } – errors: nieznane polecenia i niedomknięte nawiasy. */
export function parseMath(source) {
  const text = String(source ?? '').slice(0, MAX_SOURCE);
  const errors = [];
  let index = 0;
  let depth = 0;

  const skipSpaces = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  };
  const peek = () => {
    skipSpaces();
    return text[index];
  };
  /** Nazwa polecenia po „\”: litery albo jeden znak. */
  const commandName = () => {
    index += 1;
    const letters = /^[A-Za-z]+/.exec(text.slice(index));
    if (letters) {
      index += letters[0].length;
      return letters[0];
    }
    const char = text[index] ?? '';
    index += 1;
    return char;
  };
  /** Surowy tekst w nawiasach klamrowych (np. \text{…}). */
  const rawGroup = () => {
    if (peek() !== '{') return '';
    index += 1;
    let level = 1;
    let value = '';
    while (index < text.length) {
      const char = text[index];
      if (char === '\\' && index + 1 < text.length) {
        value += text[index + 1];
        index += 2;
        continue;
      }
      index += 1;
      if (char === '{') level += 1;
      if (char === '}') {
        level -= 1;
        if (level === 0) return value;
      }
      value += char;
    }
    errors.push('Brakuje nawiasu „}”.');
    return value;
  };
  const row = (children) => (children.length === 1 ? children[0] : { t: 'row', c: children });

  /** Ciąg elementów do `}` (gdy `inGroup`), `\right` albo końca. */
  const parseRow = (inGroup) => {
    const children = [];
    for (;;) {
      const char = peek();
      if (char === undefined) {
        if (inGroup) errors.push('Brakuje nawiasu „}”.');
        break;
      }
      if (char === '}') {
        if (inGroup) {
          index += 1;
          break;
        }
        index += 1;
        errors.push('Nadmiarowy nawias „}”.');
        continue;
      }
      if (char === '\\' && /^\\right(?![A-Za-z])/.test(text.slice(index))) break;
      const item = parseItem();
      if (item) children.push(item);
    }
    return row(children);
  };

  /** Argument polecenia albo potęgi/indeksu: {…} albo jeden element. */
  const parseArgument = () => {
    const char = peek();
    if (char === undefined) {
      errors.push('Brakuje argumentu.');
      return { t: 'row', c: [] };
    }
    if (char === '{') {
      index += 1;
      if (depth >= MAX_DEPTH) {
        errors.push('Za dużo zagnieżdżonych nawiasów.');
        rawGroup();
        return { t: 'row', c: [] };
      }
      depth += 1;
      const value = parseRow(true);
      depth -= 1;
      return value;
    }
    return parseAtom() ?? { t: 'row', c: [] };
  };

  /** Element z potęgą i indeksem: x^2, a_{ij}, \sum_{i=1}^{n}. */
  const parseItem = () => {
    const base = parseAtom();
    if (!base) return null;
    let sub = null;
    let sup = null;
    for (;;) {
      const char = peek();
      if (char === '^' && !sup) {
        index += 1;
        sup = parseArgument();
      } else if (char === '_' && !sub) {
        index += 1;
        sub = parseArgument();
      } else if (char === "'" && !sup) {
        // x' – prim jako potęga.
        index += 1;
        sup = { t: 'o', v: '′' };
      } else break;
    }
    return sub || sup ? { t: 'scripts', base, ...(sub ? { sub } : {}), ...(sup ? { sup } : {}) } : base;
  };

  const delimiter = () => {
    const char = peek();
    if (char === undefined) return '';
    if (char === '\\') {
      const name = commandName();
      if (name === '{' || name === '}' || name === '|') return name === '|' ? '‖' : name;
      return OPERATORS[name] ?? '';
    }
    index += 1;
    return char === '.' ? '' : char;
  };

  /** Pojedynczy element bez potęg i indeksów. */
  const parseAtom = () => {
    const char = peek();
    if (char === undefined) return null;
    if (char === '{') return parseArgument();
    if (char === '^' || char === '_') {
      // Potęga bez podstawy (np. ^2 na początku) – na pustej podstawie.
      return { t: 'row', c: [] };
    }
    if (char === '\\') return parseCommand();
    if (/\d/.test(char)) {
      const number = /^\d+(?:[.,]\d+)?/.exec(text.slice(index))[0];
      index += number.length;
      return { t: 'n', v: number };
    }
    index += 1;
    if (/\p{L}/u.test(char)) return { t: 'i', v: char };
    return { t: 'o', v: CHAR_OPERATORS[char] ?? char };
  };

  const parseCommand = () => {
    const start = index;
    const name = commandName();
    if (name === '') return null;
    if (name in GREEK) return { t: 'i', v: GREEK[name], ...(/^[A-Z]/.test(name) ? { upright: true } : {}) };
    if (name in SYMBOLS) return { t: 'i', v: SYMBOLS[name], upright: true };
    if (name in OPERATORS) return { t: 'o', v: OPERATORS[name] };
    if (name in BIG_OPERATORS) return { t: 'o', v: BIG_OPERATORS[name], large: true, limits: true };
    if (name in INTEGRALS) return { t: 'o', v: INTEGRALS[name], large: true };
    if (FUNCTIONS.includes(name)) return { t: 'i', v: name, upright: true, fn: true };
    if (LIMIT_FUNCTIONS.includes(name)) return { t: 'i', v: name, upright: true, limits: true, fn: true };
    if (name in SPACES) return { t: 'space', w: SPACES[name] };
    if (name in ACCENTS) {
      return { t: 'accent', base: parseArgument(), v: ACCENTS[name], ...(name === 'underline' ? { under: true } : {}) };
    }
    switch (name) {
      case '{': case '}': case '%': case '#': case '&': case '_': case '$': case '|':
        return { t: 'o', v: name === '|' ? '‖' : name };
      case '\\':
        return { t: 'space', w: 1 };
      case 'frac': case 'dfrac': case 'tfrac':
        return { t: 'frac', a: parseArgument(), b: parseArgument() };
      case 'binom': {
        const a = parseArgument();
        const b = parseArgument();
        return { t: 'fence', open: '(', close: ')', body: { t: 'frac', a, b, line: false } };
      }
      case 'sqrt': {
        let indexNode = null;
        if (peek() === '[') {
          index += 1;
          const children = [];
          while (peek() !== undefined && peek() !== ']') {
            const item = parseItem();
            if (item) children.push(item);
          }
          if (peek() === ']') index += 1;
          else errors.push('Brakuje nawiasu „]”.');
          indexNode = row(children);
        }
        return { t: 'sqrt', a: parseArgument(), ...(indexNode ? { index: indexNode } : {}) };
      }
      case 'text': case 'textrm': case 'mbox':
        return { t: 'text', v: rawGroup() };
      case 'mathrm': case 'operatorname': case 'textup':
        return { t: 'i', v: rawGroup(), upright: true };
      case 'mathbf': case 'textbf': case 'boldsymbol':
        return markBold(parseArgument());
      case 'mathit': case 'textit':
        return parseArgument();
      case 'mathbb': {
        const letters = rawGroup();
        return { t: 'i', v: [...letters].map((letter) => DOUBLE_STRUCK[letter] ?? letter).join(''), upright: true };
      }
      case 'left': {
        const open = delimiter();
        const body = parseRow(false);
        let close = '';
        if (/^\\right(?![A-Za-z])/.test(text.slice(index))) {
          index += '\\right'.length;
          close = delimiter();
        } else errors.push('Brakuje „\\right”.');
        return { t: 'fence', open, close, body };
      }
      case 'right':
        errors.push('„\\right” bez „\\left”.');
        delimiter();
        return null;
      case 'limits': case 'nolimits': case 'displaystyle': case 'textstyle':
        return null;
      default:
        errors.push(`Nieznane polecenie: ${text.slice(start, index)}`);
        return { t: 'error', v: text.slice(start, index) };
    }
  };

  const parts = [parseRow(false)];
  // Ciąg zatrzymuje się na „\right” – bez pasującego „\left” to błąd, a reszta zapisu idzie dalej.
  while (peek() !== undefined) {
    index += '\\right'.length;
    errors.push('„\\right” bez „\\left”.');
    delimiter();
    parts.push(parseRow(false));
  }
  const tree = parts.length === 1 ? parts[0] : row(parts.flatMap((part) => (part.t === 'row' ? part.c : [part])));
  return { tree, errors };
}

function markBold(node) {
  if (node.t === 'i' || node.t === 'n') return { ...node, bold: true };
  if (node.t === 'row') return { ...node, c: node.c.map(markBold) };
  return node;
}

// ---------------------------------------------------------------- odczyt na głos

const SPOKEN_OPERATORS = {
  pl: {
    '+': 'plus', '−': 'minus', '=': 'równa się', '⋅': 'razy', '×': 'razy', '÷': 'podzielić przez', '/': 'przez',
    '±': 'plus minus', '∓': 'minus plus', '<': 'mniejsze od', '>': 'większe od', '≤': 'mniejsze lub równe',
    '≥': 'większe lub równe', '≠': 'różne od', '≈': 'w przybliżeniu', '≡': 'tożsamościowo równe', '∝': 'proporcjonalne do',
    '→': 'dąży do', '⇒': 'wynika', '⇔': 'wtedy i tylko wtedy', '∈': 'należy do', '∉': 'nie należy do',
    '⊂': 'zawiera się w', '⊆': 'zawiera się w', '∪': 'suma', '∩': 'iloczyn', '∀': 'dla każdego', '∃': 'istnieje',
    '%': 'procent', '!': 'silnia', '…': 'i tak dalej', '⋯': 'i tak dalej', '∑': 'suma', '∏': 'iloczyn', '∫': 'całka',
    '∬': 'całka podwójna', '∮': 'całka okrężna', '⊥': 'prostopadłe do', '∥': 'równoległe do', '∠': 'kąt', '′': 'prim'
  },
  en: {
    '+': 'plus', '−': 'minus', '=': 'equals', '⋅': 'times', '×': 'times', '÷': 'divided by', '/': 'over',
    '±': 'plus or minus', '∓': 'minus or plus', '<': 'is less than', '>': 'is greater than', '≤': 'is less than or equal to',
    '≥': 'is greater than or equal to', '≠': 'is not equal to', '≈': 'is approximately', '≡': 'is identical to',
    '∝': 'is proportional to', '→': 'tends to', '⇒': 'implies', '⇔': 'if and only if', '∈': 'in', '∉': 'not in',
    '⊂': 'is a subset of', '⊆': 'is a subset of', '∪': 'union', '∩': 'intersection', '∀': 'for all', '∃': 'there exists',
    '%': 'percent', '!': 'factorial', '…': 'and so on', '⋯': 'and so on', '∑': 'the sum', '∏': 'the product',
    '∫': 'the integral', '∬': 'the double integral', '∮': 'the contour integral', '⊥': 'is perpendicular to',
    '∥': 'is parallel to', '∠': 'angle', '′': 'prime'
  }
};

const SPOKEN_SYMBOLS = {
  pl: {
    α: 'alfa', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'dzeta', η: 'eta', θ: 'theta', ϑ: 'theta', ι: 'jota',
    κ: 'kappa', λ: 'lambda', μ: 'mi', ν: 'ni', ξ: 'ksi', π: 'pi', ρ: 'ro', σ: 'sigma', τ: 'tau', υ: 'ypsilon', φ: 'fi',
    χ: 'chi', ψ: 'psi', ω: 'omega', Γ: 'gamma', Δ: 'delta', Θ: 'theta', Λ: 'lambda', Ξ: 'ksi', Π: 'pi', Σ: 'sigma',
    Υ: 'ypsilon', Φ: 'fi', Ψ: 'psi', Ω: 'omega', '∞': 'nieskończoność', '∂': 'd', '∇': 'nabla', '∅': 'zbiór pusty',
    '°': 'stopni', ℝ: 'R', ℕ: 'N', ℤ: 'Z', ℚ: 'Q', ℂ: 'C', lim: 'granica', log: 'logarytm', ln: 'logarytm naturalny',
    sin: 'sinus', cos: 'cosinus', tan: 'tangens', tg: 'tangens', cot: 'cotangens', ctg: 'cotangens', max: 'maksimum',
    min: 'minimum', exp: 'e do potęgi'
  },
  en: {
    α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ϑ: 'theta', ι: 'iota',
    κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi',
    χ: 'chi', ψ: 'psi', ω: 'omega', Γ: 'gamma', Δ: 'delta', Θ: 'theta', Λ: 'lambda', Ξ: 'xi', Π: 'pi', Σ: 'sigma',
    Υ: 'upsilon', Φ: 'phi', Ψ: 'psi', Ω: 'omega', '∞': 'infinity', '∂': 'partial', '∇': 'nabla', '∅': 'the empty set',
    '°': 'degrees', ℝ: 'R', ℕ: 'N', ℤ: 'Z', ℚ: 'Q', ℂ: 'C', lim: 'the limit', log: 'log', ln: 'natural log',
    sin: 'sine', cos: 'cosine', tan: 'tangent', tg: 'tangent', cot: 'cotangent', ctg: 'cotangent', max: 'the maximum',
    min: 'the minimum', exp: 'e to the power of'
  }
};

const SPOKEN_WORDS = {
  pl: {
    squared: 'do kwadratu', cubed: 'do sześcianu', power: 'do potęgi', sub: 'indeks', over: 'przez', root: 'pierwiastek z',
    nthRoot: (n) => (n === '3' ? 'pierwiastek sześcienny z' : `pierwiastek stopnia ${n} z`), from: 'od', to: 'do', under: 'przy',
    choose: 'po'
  },
  en: {
    squared: 'squared', cubed: 'cubed', power: 'to the power of', sub: 'sub', over: 'over', root: 'the square root of',
    nthRoot: (n) => (n === '3' ? 'the cube root of' : `the root of order ${n} of`), from: 'from', to: 'to', under: 'as',
    choose: 'choose'
  }
};

function speakNode(node, lang) {
  const words = SPOKEN_WORDS[lang];
  const say = (child) => speakNode(child, lang);
  switch (node?.t) {
    case 'row': return node.c.map(say).filter(Boolean).join(' ');
    case 'i': return SPOKEN_SYMBOLS[lang][node.v] ?? node.v;
    case 'n': return node.v;
    case 'o': return SPOKEN_OPERATORS[lang][node.v] ?? '';
    case 'text': return node.v;
    case 'frac': return node.line === false
      ? `${say(node.a)} ${words.choose} ${say(node.b)}`
      : `${say(node.a)} ${words.over} ${say(node.b)}`;
    case 'sqrt': return node.index ? `${words.nthRoot(say(node.index))} ${say(node.a)}` : `${words.root} ${say(node.a)}`;
    case 'scripts': {
      const base = say(node.base);
      if (node.base.large || node.base.limits) {
        // Suma, całka, granica: „suma od i = 1 do n”, „granica przy x dąży do 0”.
        const parts = [base];
        if (node.sub) parts.push(node.base.v === 'lim' ? `${words.under} ${say(node.sub)}` : `${words.from} ${say(node.sub)}`);
        if (node.sup) parts.push(`${words.to} ${say(node.sup)}`);
        return parts.join(' ');
      }
      const parts = [base];
      if (node.sub) parts.push(`${words.sub} ${say(node.sub)}`);
      if (node.sup) {
        const value = say(node.sup);
        if (node.sup.t === 'o' && node.sup.v === '∘') parts.push(SPOKEN_SYMBOLS[lang]['°']);
        else if (value === '2') parts.push(words.squared);
        else if (value === '3') parts.push(words.cubed);
        else if (node.sup.t === 'o') parts.push(value);
        else parts.push(`${words.power} ${value}`);
      }
      return parts.join(' ');
    }
    case 'accent': return say(node.base);
    case 'fence': return say(node.body);
    case 'error': return node.v.replace(/^\\/, '');
    default: return '';
  }
}

/** Słowny odpowiednik wzoru do czytania na głos: „x do kwadratu plus y do kwadratu”. */
export function spokenMath(source, lang = 'pl') {
  return speakNode(parseMath(source).tree, lang === 'en' ? 'en' : 'pl').replace(/\s+/g, ' ').trim();
}

/** Tekst ze wzorami zamienionymi na słowa (czytanie notatki, słuchanie). Bez wzorów – bez zmian. */
export function spokenText(text, lang = 'pl') {
  const value = String(text ?? '');
  if (!value.includes('$')) return value;
  return mathSegments(value).map((part) => (part.type === 'math' ? ` ${spokenMath(part.source, lang)} ` : part.text))
    .join('').replace(/[ \t]+/g, ' ').replace(/ ([,.;:!?])/g, '$1').trim();
}

// ---------------------------------------------------------------- ściągawka

/**
 * Ściągawka zapisu (okno pod ikoną info w edytorze notatki): grupy z przykładami; każdy przykład –
 * zapis do wpisania i opis. Wzór obok pokazuje przeglądarka.
 */
export const MATH_CHEATSHEET = Object.freeze([
  {
    title: 'Jak wpisać wzór',
    items: [
      { source: 'x^2 + y^2 = r^2', note: '$…$ – wzór w tekście, np. $x^2 + y^2 = r^2$' },
      { source: '\\frac{a}{b}', note: '$$…$$ – wzór w osobnym wierszu, na środku', display: true },
      { source: '\\$100', note: '\\$ – zwykły znak dolara (np. kwota)', plain: '$100' }
    ]
  },
  {
    title: 'Potęgi i indeksy',
    items: [
      { source: 'x^2', note: 'potęga' },
      { source: 'x^{10}', note: 'potęga dłuższa niż jeden znak – w nawiasach { }' },
      { source: 'a_1', note: 'indeks dolny' },
      { source: 'a_{ij}^2', note: 'indeks i potęga razem' },
      { source: "f'(x)", note: 'pochodna (prim)' }
    ]
  },
  {
    title: 'Ułamki i pierwiastki',
    items: [
      { source: '\\frac{a+b}{2}', note: 'ułamek: \\frac{licznik}{mianownik}' },
      { source: '\\sqrt{x}', note: 'pierwiastek kwadratowy' },
      { source: '\\sqrt[3]{x}', note: 'pierwiastek stopnia 3' },
      { source: '\\binom{n}{k}', note: 'symbol Newtona' }
    ]
  },
  {
    title: 'Znaki działań i relacje',
    items: [
      { source: 'a \\cdot b', note: 'mnożenie (kropka); a * b też daje kropkę' },
      { source: 'a \\times b', note: 'mnożenie (krzyżyk)' },
      { source: 'a \\div b', note: 'dzielenie' },
      { source: '\\pm', note: 'plus minus' },
      { source: 'a \\le b \\ge c', note: 'mniejsze lub równe, większe lub równe' },
      { source: 'a \\ne b \\approx c', note: 'różne, w przybliżeniu' },
      { source: 'x \\to \\infty', note: 'dąży do nieskończoności' },
      { source: 'A \\Rightarrow B \\Leftrightarrow C', note: 'wynika, wtedy i tylko wtedy' },
      { source: 'x \\in \\mathbb{R}', note: 'należy do zbioru liczb rzeczywistych (\\mathbb{N}, \\mathbb{Z}, \\mathbb{Q})' }
    ]
  },
  {
    title: 'Sumy, całki, granice',
    items: [
      { source: '\\sum_{i=1}^{n} x_i', note: 'suma' },
      { source: '\\prod_{i=1}^{n} a_i', note: 'iloczyn' },
      { source: '\\int_a^b f(x)\\,dx', note: 'całka (\\, – mały odstęp)' },
      { source: '\\lim_{x \\to 0} \\frac{\\sin x}{x}', note: 'granica; funkcje: \\sin \\cos \\tg \\log \\ln' }
    ]
  },
  {
    title: 'Litery greckie',
    items: [
      { source: '\\alpha \\beta \\gamma \\delta \\varepsilon', note: '\\alpha \\beta \\gamma \\delta \\varepsilon' },
      { source: '\\lambda \\mu \\pi \\sigma \\varphi \\omega', note: '\\lambda \\mu \\pi \\sigma \\varphi \\omega' },
      { source: '\\Delta \\Sigma \\Omega', note: 'wielkie: \\Delta \\Sigma \\Omega' }
    ]
  },
  {
    title: 'Nawiasy, tekst, akcenty',
    items: [
      { source: '\\left( \\frac{a}{b} \\right)^2', note: 'nawiasy dopasowane do wysokości: \\left( … \\right)' },
      { source: '\\{ 1, 2, 3 \\}', note: 'nawiasy klamrowe' },
      { source: 'v = \\frac{s}{t} \\text{ [m/s]}', note: '\\text{…} – zwykły tekst we wzorze' },
      { source: '\\vec{F} \\quad \\bar{x}', note: 'wektor, średnia; \\quad – duży odstęp' },
      { source: '90^\\circ', note: 'stopnie' }
    ]
  }
]);
