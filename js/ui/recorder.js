// Notatka głosowa (od 1.10): nagrywanie z mikrofonu w trakcie pisania notatki. Nagrywa
// przeglądarka (MediaRecorder): najchętniej AAC w pliku .m4a (Safari; Chrome i Edge, gdy system ma
// koder AAC), a gdy go nie ma – Opus w pliku .webm.
// Ekran nie gaśnie w trakcie nagrywania (Wake Lock), bo zgaszony ekran albo przejście do innej
// aplikacji przerywa nagrywanie na iPhonie – wtedy zostaje to, co zdążyło się nagrać.

/** Najdłuższe nagranie: 90 minut (przy 64 kb/s ok. 43 MB – poniżej limitu załącznika 50 MB). */
export const RECORDING_MAX_SECONDS = 90 * 60;
const BITRATE = 64000;
/** Co tyle ms przeglądarka oddaje kawałek nagrania (przerwane nagranie nie przepada w całości). */
const SLICE_MS = 1000;

// AAC w .m4a odtworzy każde urządzenie; Opus lepiej w .webm niż w .m4a (rzadko obsługiwane).
const TYPES = [
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', type: 'audio/mp4', extension: 'm4a' },
  { mimeType: 'audio/webm;codecs=opus', type: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/webm', type: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/mp4', type: 'audio/mp4', extension: 'm4a' }
];
const EXTENSIONS = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };

/** Czy przeglądarka potrafi nagrywać dźwięk z mikrofonu. */
export function recordingSupported() {
  return typeof window.MediaRecorder === 'function' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

function pickType() {
  const supported = (mimeType) => {
    try {
      return window.MediaRecorder.isTypeSupported(mimeType);
    } catch {
      return false;
    }
  };
  return TYPES.find((item) => supported(item.mimeType)) ?? { mimeType: '', type: 'audio/webm', extension: 'webm' };
}

/** Czytelny komunikat, gdy nie da się zacząć nagrywania. */
function startError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return new Error('Aplikacja nie ma dostępu do mikrofonu. Zezwól na mikrofon w ustawieniach przeglądarki (na iPhonie: Ustawienia → Safari → Mikrofon) i spróbuj ponownie.');
  }
  if (error?.name === 'NotFoundError') return new Error('Nie znaleziono mikrofonu.');
  return new Error('Nie udało się zacząć nagrywania. Mikrofon może być zajęty przez inną aplikację.');
}

/**
 * Zaczyna nagrywanie. onTick(sekundy) – co pół sekundy; onEnd(powód) – gdy nagrywanie skończyło
 * się samo ('limit' – osiągnięty najdłuższy czas, 'interrupted' – system przerwał mikrofon).
 * Zwraca { pause(), resume(), stop() → Promise<{ blob, type, extension, duration }>, cancel(), paused, elapsed() }.
 */
export async function startRecording({ onTick = () => {}, onEnd = () => {} } = {}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    throw startError(error);
  }
  const format = pickType();
  let recorder;
  try {
    recorder = new window.MediaRecorder(stream, { ...(format.mimeType ? { mimeType: format.mimeType } : {}), audioBitsPerSecond: BITRATE });
  } catch {
    recorder = new window.MediaRecorder(stream);
  }
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size > 0) chunks.push(event.data);
  });

  let wakeLock = null;
  const keepScreenOn = async () => {
    try {
      wakeLock = await navigator.wakeLock?.request?.('screen') ?? null;
    } catch {
      wakeLock = null;
    }
  };
  keepScreenOn();
  // Po powrocie do aplikacji blokada wygaszania jest zwalniana przez system – prosimy o nią znowu.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && control.active && !wakeLock) keepScreenOn();
  };
  document.addEventListener('visibilitychange', onVisible);

  // Czas nagrania liczony bez przerw (pauza).
  let elapsedMs = 0;
  let runningSince = Date.now();
  const elapsed = () => (elapsedMs + (runningSince === null ? 0 : Date.now() - runningSince)) / 1000;
  const ticker = window.setInterval(() => {
    const seconds = elapsed();
    onTick(seconds);
    if (seconds >= RECORDING_MAX_SECONDS) finishBy('limit');
  }, 500);

  let stopping = null;
  const release = () => {
    window.clearInterval(ticker);
    document.removeEventListener('visibilitychange', onVisible);
    for (const track of stream.getTracks()) track.stop();
    Promise.resolve(wakeLock?.release?.()).catch(() => {});
    wakeLock = null;
  };
  const stop = () => {
    if (stopping) return stopping;
    control.active = false;
    const duration = elapsed();
    runningSince = null;
    stopping = new Promise((resolve) => {
      const done = () => {
        release();
        const type = recorder.mimeType?.split(';')[0] || format.type;
        resolve({ blob: new Blob(chunks, { type }), type, extension: EXTENSIONS[type] ?? format.extension, duration });
      };
      if (recorder.state === 'inactive') done();
      else {
        recorder.addEventListener('stop', done, { once: true });
        recorder.stop();
      }
    });
    return stopping;
  };
  const finishBy = (reason) => {
    if (!control.active) return;
    stop().then(() => onEnd(reason));
  };
  // Mikrofon odebrany przez system (np. połączenie telefoniczne, zgaszony ekran).
  for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => finishBy('interrupted'));

  const control = {
    active: true,
    paused: false,
    elapsed,
    pause() {
      if (!control.active || control.paused || recorder.state !== 'recording') return;
      recorder.pause();
      elapsedMs += Date.now() - runningSince;
      runningSince = null;
      control.paused = true;
    },
    resume() {
      if (!control.active || !control.paused) return;
      recorder.resume();
      runningSince = Date.now();
      control.paused = false;
    },
    stop,
    /** Kończy bez zapisu (np. odrzucone zmiany notatki). */
    cancel() {
      control.active = false;
      chunks.length = 0;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    }
  };
  recorder.start(SLICE_MS);
  return control;
}
