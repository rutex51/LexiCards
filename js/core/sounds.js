// Dźwięki (od 1.31): synteza w aplikacji – bez plików, bez pobierania, offline. Wszystko z szumu
// i filtrów, każda próbka liczona tu, a odtwarzana przez Web Audio (ui/sounds.js).
//
// - Fiszka odlatuje po decyzji: „miękki obrót” – krótki świst z pasmem w górę, trzask krawędzi
//   i stuknięcie; przechodzi w stronę, w którą leci fiszka.
// - Kartka notatki i rysunku: „album – gruby papier” – tarcie palcem, trzaski włókien, podmuch
//   z drganiem kartki, pyknięcie nad grzbietem i klapnięcie. Długość dobrana do animacji:
//   klapnięcie wypada w chwili, gdy kartka kładzie się na drugą stronę (PAGE_LAND).

/** Ułamek długości dźwięku kartki, w którym kartka klapie o drugą stronę. */
export const PAGE_LAND = 0.8;
/** Czas po klapnięciu (s): ostatnie trzaski i przesunięcie po kartce. */
const PAGE_TAIL = 0.05;
/** Część kartki, w której słychać trzaski włókien. */
const CRACKLE_SPAN = 0.66;

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
/** Garb: 0 poza [a, b], szczyt w `peak` (ułamek między a i b). */
function hump(t, a, b, peak = 0.5, power = 2) {
  if (t <= a || t >= b) return 0;
  const u = (t - a) / (b - a);
  return u < peak ? smooth(u / peak) : Math.pow(1 - (u - peak) / (1 - peak), power);
}

/** Wolna losowa fala 0–1 (interpolowana co `step` sekund). */
function slowNoise(random, step, rate) {
  const every = Math.max(1, Math.round(step * rate));
  let from = random(), to = random(), index = 0;
  return () => {
    if (index % every === 0) {
      from = to;
      to = random();
    }
    const value = from + (to - from) * smooth((index % every) / every);
    index += 1;
    return value;
  };
}

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

/**
 * Kartka – „album, gruby papier”. land – czas (s) od początku dźwięku do klapnięcia kartki, czyli
 * długość animacji przewracania; reszta faz rozciąga się razem z nim. direction: 1 – kartka idzie
 * z prawej na lewą (dalej), −1 – wraca. Zwraca { left, right, rate, duration, land }.
 */
export function pageSound({ rate = 44100, land = 0.72, direction = 1, seed = 3 } = {}) {
  const paper = [1200, 4500], crackle = 0.7, stiffness = 0.9, air = 1.25, slide = 0.06, landing = 1.2, flutter = 0.6;
  const time = Math.max(0.2, land) / PAGE_LAND;
  const n = Math.round(rate * (time + PAGE_TAIL));
  const mono = new Float32Array(n);
  const random = rng(seed);
  const lift = Math.min(0.3, slide / time + 0.06);
  const snapAt = 0.42 + (random() - 0.5) * 0.06;
  const landAt = PAGE_LAND;

  // Tarcie palcem przy rogu (i krótko przy klapnięciu): szum górnopasmowy, ziarnisty.
  {
    const hp = biquad('hp'), bp = biquad('bp');
    const grain = slowNoise(random, 0.004, rate);
    for (let i = 0; i < n; i += 1) {
      const t = i / rate / time;
      const env = hump(t, 0, lift + 0.05, 0.6, 1.5) + 0.35 * hump(t, landAt, landAt + 0.12, 0.25, 2);
      if (env === 0) {
        hp(0, 3500, 0.7, rate);
        continue;
      }
      const noise = random() * 2 - 1;
      mono[i] += bp(hp(noise, 3500, 0.7, rate), 6200, 0.6, rate) * env * (0.35 + 0.65 * Math.pow(grain(), 2)) * 0.5;
    }
  }

  // Podmuch powietrza i drganie lecącej kartki.
  {
    const lp = biquad('lp'), bp = biquad('bp');
    const wobble = slowNoise(random, 0.05, rate);
    let phase = random() * Math.PI * 2;
    for (let i = 0; i < n; i += 1) {
      const t = i / rate / time;
      const env = hump(t, lift * 0.6, landAt + 0.04, 0.55, 1.6);
      const cutoff = 300 + 1100 * hump(t, lift * 0.6, landAt + 0.04, 0.5, 1.2);
      const noise = random() * 2 - 1;
      phase += (2 * Math.PI * (12 + 13 * wobble())) / rate;
      const am = 1 - 0.45 * flutter * (0.5 + 0.5 * Math.sin(phase));
      mono[i] += (lp(noise, cutoff, 0.7, rate) * 1.2 + bp(noise, cutoff * 0.7, 1.2, rate) * 0.8) * env * am * air * 0.55;
    }
  }

  // Trzaski włókien: impulsy z rezonansem, w pierwszych dwóch trzecich kartki (zgięcie i odejście od stosu);
  // gęstość na sekundę według zgięcia – dłuższa kartka trzeszczy tak samo gęsto, tylko dłużej.
  const events = [];
  const density = (t) => crackle * CRACKLE_SPAN * (90 * hump(t, 0.02, lift + 0.2, 0.7, 1) + 420 * hump(t, lift * 0.8, snapAt + 0.08, 0.75, 1.5)
    + 140 * hump(t, snapAt, landAt, 0.15, 2) + 120 * hump(t, landAt, landAt + 0.09, 0.2, 2));
  {
    const cluster = slowNoise(random, 0.02, 1);
    const steps = Math.round(time * 1000);
    for (let k = 0; k < steps; k += 1) {
      const expected = density(k / steps) * 0.001 * (0.3 + 1.7 * Math.pow(cluster(), 2));
      let count = Math.floor(expected);
      if (random() < expected - count) count += 1;
      for (let c = 0; c < count; c += 1) {
        const amp = Math.pow(random(), 2.6) * (0.6 + stiffness * 0.8);
        const freq = paper[0] * Math.pow(paper[1] / paper[0], random()) * (1 - stiffness * 0.25);
        events.push({ at: ((k + random()) / 1000) * CRACKLE_SPAN, amp, freq, q: 2 + random() * 5, decay: 0.0004 + random() * 0.0018 });
      }
    }
    // Pyknięcie nad grzbietem: gęsta seria mocnych trzasków.
    const snapCount = Math.round(14 + 20 * stiffness);
    for (let c = 0; c < snapCount; c += 1) {
      events.push({
        at: snapAt * time + Math.pow(random(), 1.5) * 0.03,
        amp: (0.5 + random()) * (0.6 + stiffness),
        freq: paper[0] * 0.7 * Math.pow(paper[1] / (paper[0] * 0.7), random()),
        q: 1.5 + random() * 3,
        decay: 0.0006 + random() * 0.002
      });
    }
  }
  for (const event of events) {
    const filter = biquad('bp');
    const start = Math.round(event.at * rate);
    const length = Math.round((event.decay * 6 + 0.003) * rate);
    for (let j = 0; j < length && start + j < n; j += 1) {
      const excite = j < event.decay * rate * 2 ? (random() * 2 - 1) * Math.exp(-j / (event.decay * rate)) : 0;
      mono[start + j] += filter(excite, event.freq, event.q, rate) * event.amp * 2.2;
    }
  }
  {
    const hp = biquad('hp');
    const start = Math.round(snapAt * time * rate);
    for (let j = 0; j < 0.004 * rate && start + j < n; j += 1) {
      mono[start + j] += hp(random() * 2 - 1, 1500, 0.7, rate) * Math.exp(-j / (0.0012 * rate)) * (0.3 + stiffness * 0.9);
    }
  }

  // Klapnięcie: krótki szum przez dolnoprzepustowy i rezonanse stosu kartek.
  {
    const lp = biquad('lp'), r1 = biquad('bp'), r2 = biquad('bp');
    const start = Math.round(landAt * time * rate);
    const tau = 0.012 + stiffness * 0.012;
    for (let j = 0; start + j < n; j += 1) {
      const s = j / rate;
      const excite = (random() * 2 - 1) * smooth(s / 0.002) * Math.exp(-s / tau);
      const value = lp(excite, 900 + stiffness * 1800, 0.7, rate) * 0.9 + r1(excite, 150 + stiffness * 60, 2.5, rate) * 2.2
        + r2(excite, 380 + stiffness * 120, 3, rate) * 1.2;
      mono[start + j] += value * landing * (0.5 + stiffness * 0.7);
    }
  }

  // Dźwięk idzie za kartką: z prawej na lewą (wstecz – odwrotnie).
  const from = direction < 0 ? -0.55 : 0.55;
  const sound = stereo(mono, (i) => from - 2 * from * smooth((i / rate / time - 0.1) / 0.75), -3);
  return { ...sound, rate, duration: n / rate, land: landAt * time };
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
