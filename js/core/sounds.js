// Dźwięki (od 1.31). Fiszka – synteza w aplikacji (bez plików): szum i filtry, odtwarzane przez Web
// Audio (ui/sounds.js). Kartka (od 1.31.1) – nagranie prawdziwej kartki (sounds/kartka.wav), tu tylko
// jego opis i wyczucie czasu.
//
// - Fiszka odlatuje po decyzji: „miękki obrót” – krótki świst z pasmem w górę, trzask krawędzi
//   i stuknięcie; przechodzi w stronę, w którą leci fiszka.
// - Kartka notatki i rysunku: nagranie przycięte do samej kartki (1,14 s), bez dudnienia – filtr
//   górnoprzepustowy 170 Hz (24 dB/okt.), mono, 32 kHz, bez metadanych. Klapnięcie kartki (najgłośniejsza
//   chwila) jest po PAGE_FILE_LAND sekundach; pageTiming przesuwa nagranie tak, by wypadło z końcem animacji.

/** Nagranie kartki (adres względem strony) i chwila klapnięcia w nagraniu (s). */
export const PAGE_FILE = 'sounds/kartka.wav';
export const PAGE_FILE_LAND = 0.765;

/**
 * Kiedy grać nagranie kartki, żeby klapnięcie wypadło po `land` s od teraz: { delay, offset } w s –
 * krótsza animacja zaczyna nagranie od środka (offset), dłuższa – chwilę później (delay).
 * Wysokość dźwięku się nie zmienia.
 */
export function pageTiming(land, natural = PAGE_FILE_LAND) {
  const shift = Math.max(0, land) - natural;
  return shift >= 0 ? { delay: shift, offset: 0 } : { delay: 0, offset: Math.min(natural, -shift) };
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Filtr dwubiegunowy (RBJ), parametry w każdej próbce: 'bp' | 'hp' | 'lp'. */
function biquad(type) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, freq, q, rate) => {
    const w = (2 * Math.PI * Math.min(freq, rate * 0.45)) / rate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'bp') {
      b0 = alpha; b1 = 0; b2 = -alpha;
    } else if (type === 'hp') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    } else {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    }
    const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Mono z położeniem (−1 lewo … 1 prawo) → stereo, szczyt `peakDb`, krótkie wyciszenie na końcu. */
function stereo(mono, position, peakDb) {
  const left = new Float32Array(mono.length), right = new Float32Array(mono.length);
  let max = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const angle = ((position(i) + 1) * Math.PI) / 4;
    left[i] = mono[i] * Math.cos(angle);
    right[i] = mono[i] * Math.sin(angle);
    max = Math.max(max, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = max > 0 ? Math.pow(10, peakDb / 20) / max : 1;
  const fade = Math.max(1, Math.round(mono.length * 0.02));
  for (let i = 0; i < mono.length; i += 1) {
    const edge = Math.min(1, i / fade, (mono.length - 1 - i) / fade);
    left[i] *= gain * edge;
    right[i] *= gain * edge;
  }
  return { left, right };
}

/**
 * Fiszka odlatuje: krótki świst (pasmo w górę), trzask krawędzi na szczycie obrotu i stuknięcie.
 * direction: −1 – w lewo („Umiem”), 1 – w prawo. Zwraca { left, right, rate, duration }.
 */
export function cardSound({ rate = 44100, direction = 1, seed = 11 } = {}) {
  const duration = 0.26;
  const band = [700, 3000], q = 1.6, snap = 0.3, tap = 0.55, tapFreq = 170;
  const n = Math.round(rate * duration);
  const mono = new Float32Array(n);
  const random = rng(seed);
  const whoosh = biquad('bp'), whoosh2 = biquad('bp'), click = biquad('hp');
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const noise = random() * 2 - 1;
    const sweep = band[0] * Math.pow(band[1] / band[0], Math.min(1, t / 0.6));
    const env = t < 0.35 ? smooth(t / 0.35) : Math.pow(Math.max(0, 1 - (t - 0.35) / 0.65), 2.5);
    let value = whoosh2(whoosh(noise, sweep, q, rate), sweep, q, rate) * env * 3;
    const at = (t - 0.4) * duration;
    if (at > 0 && at < 0.004) value += click(noise, 4500, 0.7, rate) * snap * 2.5 * (1 - at / 0.004);
    const end = (t - 0.72) * duration;
    if (end > 0) value += Math.sin(2 * Math.PI * tapFreq * end) * tap * Math.exp(-end * 90) * 0.9;
    mono[i] = value;
  }
  const side = direction < 0 ? -1 : 1;
  const sound = stereo(mono, (i) => side * 0.45 * smooth(i / n / 0.8), -4);
  return { ...sound, rate, duration };
}

/** Pogłos małego pokoju: odpowiedź impulsowa – wczesne odbicia i zanikający szum. */
export function roomImpulse({ rate = 44100, seed = 101, length = 0.22 } = {}) {
  const random = rng(seed);
  const n = Math.round(rate * length);
  const ir = new Float32Array(n);
  const lp = biquad('lp');
  for (let i = 0; i < n; i += 1) {
    const s = i / rate;
    ir[i] = lp((random() * 2 - 1) * Math.exp(-s / 0.045) * smooth(s / 0.004), 3800, 0.7, rate) * 0.5;
  }
  for (const [ms, gain] of [[6.5, 0.5], [9.8, 0.36], [14.2, 0.27], [19.5, 0.2], [27, 0.14]]) {
    const at = Math.round(((ms + (random() - 0.5) * 1.5) / 1000) * rate);
    if (at < n) ir[at] += gain * (random() < 0.5 ? -1 : 1);
  }
  return ir;
}
