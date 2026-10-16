// Podtrzymanie dźwięku w czasie słuchania.
//
// Połączenie Bluetooth (słuchawki, samochód, CarPlay) usypia w przerwach między wypowiedziami,
// a budzi się z opóźnieniem – krótkie słowo po chwili ciszy bywa ucięte w całości. Cichy dźwięk
// odtwarzany w pętli przez całe słuchanie utrzymuje połączenie. Przy okazji system traktuje
// słuchanie jak odtwarzanie dźwięku: przyciski na kierownicy, w słuchawkach i na ekranie
// blokady (Media Session) sterują odtwarzaczem, a wyświetlacz samochodu pokazuje pojęcie.

import { logSpeech } from './speech.js';

/** Plik WAV z ciszą (PCM 16 bit, mono) – generowany w pamięci, bez pobierania czegokolwiek. */
export function silentWav(seconds = 1, sampleRate = 8000) {
  const samples = Math.round(seconds * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);            // rozmiar opisu formatu
  view.setUint16(20, 1, true);             // PCM
  view.setUint16(22, 1, true);             // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bajtów na sekundę
  view.setUint16(32, 2, true);             // bajtów na próbkę
  view.setUint16(34, 16, true);            // bitów na próbkę
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  return buffer;
}

const MEDIA_ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack'];

export class AudioKeepAlive {
  /** handlers: { onPlay, onPause, onNext, onPrevious } – polecenia z kierownicy, słuchawek, ekranu blokady. */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.audio = null;
    this.url = null;
    this.active = false;
    this.logged = null;
  }

  static available() {
    return typeof window !== 'undefined' && typeof window.Audio === 'function' && typeof URL.createObjectURL === 'function';
  }

  /** Start – wywoływany w obsłudze dotknięcia (Safari wymaga gestu do pierwszego odtworzenia). */
  start() {
    if (!AudioKeepAlive.available()) return;
    if (!this.audio) {
      this.url = URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' }));
      const audio = new window.Audio();
      audio.src = this.url;
      audio.loop = true;
      audio.preload = 'auto';
      // W dzienniku tylko zmiany stanu – przeglądarka potrafi zgłaszać „playing” kilka razy.
      audio.addEventListener('playing', () => {
        if (this.logged !== 'gra') logSpeech('dźwięk w tle', 'gra');
        this.logged = 'gra';
      });
      audio.addEventListener('pause', () => {
        this.logged = 'pauza';
        if (this.active) logSpeech('dźwięk w tle', 'zatrzymany przez system');
      });
      audio.addEventListener('error', () => logSpeech('dźwięk w tle', 'błąd odtwarzania'));
      this.audio = audio;
    }
    this.#mediaSession(true);
    this.resume();
  }

  resume() {
    if (!this.audio) return;
    this.active = true;
    const playing = this.audio.play();
    if (playing && typeof playing.catch === 'function') {
      playing.catch((error) => logSpeech('dźwięk w tle', `nie ruszył: ${error?.name ?? error}`));
    }
    this.#state('playing');
  }

  pause() {
    this.active = false;
    this.audio?.pause();
    this.#state('paused');
  }

  /** Opis na ekranie blokady i wyświetlaczu samochodu. */
  describe(title, subtitle) {
    const session = navigator.mediaSession;
    if (!session || typeof window.MediaMetadata !== 'function') return;
    try {
      session.metadata = new window.MediaMetadata({ title, artist: subtitle, album: 'LexiCards – słuchanie' });
    } catch {
      // Opis jest tylko dodatkiem.
    }
  }

  stop() {
    this.active = false;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.#mediaSession(false);
  }

  #state(value) {
    try {
      if (navigator.mediaSession) navigator.mediaSession.playbackState = value;
    } catch {
      // Starsze przeglądarki nie znają stanu odtwarzania.
    }
  }

  #mediaSession(on) {
    const session = navigator.mediaSession;
    if (!session || typeof session.setActionHandler !== 'function') return;
    const handlers = {
      play: this.handlers.onPlay,
      pause: this.handlers.onPause,
      nexttrack: this.handlers.onNext,
      previoustrack: this.handlers.onPrevious
    };
    for (const action of MEDIA_ACTIONS) {
      try {
        const handler = handlers[action];
        session.setActionHandler(action, on && handler ? () => {
          logSpeech('przycisk', action);
          handler();
        } : null);
      } catch {
        // Przeglądarka nie obsługuje tego polecenia.
      }
    }
    if (!on) {
      try {
        session.metadata = null;
        session.playbackState = 'none';
      } catch {
        // Bez znaczenia przy zamykaniu.
      }
    }
  }
}
