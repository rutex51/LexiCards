// Symbole do wstawiania w tekście notatki i w polach tekstowych rysunku (od 1.20): najczęściej
// używane znaki, których nie ma na klawiaturze, w grupach, oraz kilka ostatnio wybranych.
//
// Moduł nie zależy od przeglądarki.

/** Grupy symboli; pierwszy symbol z „⌀” to średnica (znak U+2300, nie litera „ø”). */
export const SYMBOL_GROUPS = Object.freeze([
  { id: 'common', label: 'Często używane', symbols: ['%', '‰', '°', '§', '⌀', '±', '×', '÷', '≈', '≠', '≤', '≥', '∞', '√', '…', '–', '—', '•', '„', '”', '©'] },
  { id: 'math', label: 'Matematyka', symbols: ['∑', '∫', '∂', '∆', '∇', '∠', '⊥', '∥', '≡', '∝', '∈', '∉', '∩', '∪', '⊂', '∀', '∃', '⇒', '⇔', '′', '″', '½', '¼', '¾', '²', '³'] },
  { id: 'greek', label: 'Litery greckie', symbols: ['α', 'β', 'γ', 'δ', 'ε', 'η', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Δ', 'Σ', 'Φ', 'Ω'] },
  { id: 'arrows', label: 'Strzałki', symbols: ['→', '←', '↑', '↓', '↔', '↕', '⇐', '↗', '↘'] },
  { id: 'signs', label: 'Jednostki i znaki', symbols: ['µ', '℃', '€', '£', '$', '™', '®', '¶', '†', '№', '✓', '✗', '★'] }
]);

/** Nazwy symboli (podpowiedź i czytnik ekranu); bez nazwy – sam znak. */
export const SYMBOL_NAMES = Object.freeze({
  '%': 'procent', '‰': 'promil', '°': 'stopień', '§': 'paragraf', '⌀': 'średnica', '±': 'plus minus', '×': 'razy',
  '÷': 'dzielenie', '≈': 'w przybliżeniu', '≠': 'różne', '≤': 'mniejsze lub równe', '≥': 'większe lub równe',
  '∞': 'nieskończoność', '√': 'pierwiastek', '…': 'wielokropek', '–': 'półpauza', '—': 'pauza', '•': 'punktor',
  '„': 'cudzysłów otwierający', '”': 'cudzysłów zamykający', '©': 'prawa autorskie', '∑': 'suma', '∫': 'całka',
  '∂': 'pochodna cząstkowa', '∆': 'przyrost (delta)', '∇': 'nabla', '∠': 'kąt', '⊥': 'prostopadłość', '∥': 'równoległość',
  '≡': 'tożsamość', '∝': 'proporcjonalne', '∈': 'należy do', '∉': 'nie należy do', '∩': 'część wspólna', '∪': 'suma zbiorów',
  '⊂': 'zawiera się w', '∀': 'dla każdego', '∃': 'istnieje', '⇒': 'wynika', '⇔': 'równoważne', '′': 'minuta kątowa (prim)',
  '″': 'sekunda kątowa (bis)', '½': 'jedna druga', '¼': 'jedna czwarta', '¾': 'trzy czwarte', '²': 'do kwadratu',
  '³': 'do sześcianu', 'µ': 'mikro', '℃': 'stopień Celsjusza', '€': 'euro', '£': 'funt', '$': 'dolar',
  '™': 'znak towarowy', '®': 'zastrzeżony znak towarowy', '¶': 'akapit', '†': 'krzyżyk', '№': 'numer', '✓': 'tak (ptaszek)',
  '✗': 'nie (krzyżyk)', '★': 'gwiazdka', '→': 'strzałka w prawo', '←': 'strzałka w lewo', '↑': 'strzałka w górę',
  '↓': 'strzałka w dół', '↔': 'strzałka w obie strony', '↕': 'strzałka w górę i w dół', '⇐': 'wynika z lewej',
  '↗': 'strzałka w prawo w górę', '↘': 'strzałka w prawo w dół'
});

/** Ile ostatnio wybranych symboli pamiętamy (wspólne dla notatek i rysunku). */
export const RECENT_SYMBOLS_MAX = 8;

/** Lista ostatnich symboli po wybraniu `symbol`: najnowszy pierwszy, bez powtórzeń. */
export function rememberSymbol(list, symbol) {
  return [symbol, ...cleanRecentSymbols(list).filter((item) => item !== symbol)].slice(0, RECENT_SYMBOLS_MAX);
}

/** Ostatnie symbole odczytane z pamięci urządzenia: krótkie teksty, bez powtórzeń. */
export function cleanRecentSymbols(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const item of raw) {
    if (typeof item !== 'string' || item === '' || [...item].length > 2 || result.includes(item)) continue;
    result.push(item);
    if (result.length === RECENT_SYMBOLS_MAX) break;
  }
  return result;
}
