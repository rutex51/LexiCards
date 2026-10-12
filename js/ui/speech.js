// Wymowa przez syntezator mowy przeglądarki (Web Speech API). Nic nie jest wysyłane
// do zewnętrznych usług – głosy pochodzą z systemu urządzenia.

const LANGUAGE_TAGS = { pl: 'pl-PL', en: 'en-US' };

let current = null;

export const SPEECH_RATES = Object.freeze([
  { value: 0.7, label: 'Wolno' },
  { value: 0.85, label: 'Nieco wolniej' },
  { value: 1, label: 'Normalnie' },
  { value: 1.15, label: 'Szybko' }
]);

export function speechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/** Głosy systemowe dla języka 'pl' albo 'en' (lista bywa pusta, dopóki system jej nie wczyta). */
export function listVoices(language) {
  if (!speechAvailable()) return [];
  const prefix = language.toLowerCase();
  return window.speechSynthesis.getVoices()
    .filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

/** Wywołuje `listener`, gdy system udostępni listę głosów. Zwraca funkcję wyrejestrowującą. */
export function onVoicesChanged(listener) {
  if (!speechAvailable() || typeof window.speechSynthesis.addEventListener !== 'function') return () => {};
  window.speechSynthesis.addEventListener('voiceschanged', listener);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', listener);
}

/**
 * Czyta tekst w języku 'pl' albo 'en'. Kolejne wywołanie przerywa poprzednie,
 * więc ponowne dotknięcie głośnika odtwarza tekst od początku.
 * settings: { speechRate, preferredVoicePL, preferredVoiceEN } – identyfikatory głosów z listVoices().
 */
/** Wypowiedź z językiem, głosem i szybkością z ustawień. */
function makeUtterance(text, language, settings) {
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = LANGUAGE_TAGS[language] ?? language;
  const preferred = language === 'pl' ? settings.preferredVoicePL : settings.preferredVoiceEN;
  const voice = preferred ? listVoices(language).find((item) => item.voiceURI === preferred) : null;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  utterance.rate = Number(settings.speechRate) > 0 ? Number(settings.speechRate) : 1;
  return utterance;
}

export function speak(text, language, settings = {}) {
  if (!speechAvailable() || !text) return false;
  const synthesis = window.speechSynthesis;
  // Przerywamy tylko wtedy, gdy coś jest czytane: w części przeglądarek cancel() tuż przed
  // speak() potrafi zgubić nową wypowiedź.
  if (synthesis.speaking || synthesis.pending) synthesis.cancel();
  const utterance = makeUtterance(text, language, settings);
  // Odwołanie trzymane do końca czytania – bez niego przeglądarka może urwać wypowiedź w połowie.
  current = utterance;
  utterance.onend = utterance.onerror = () => { if (current === utterance) current = null; };
  synthesis.speak(utterance);
  return true;
}

/**
 * Czyta tekst i wywołuje `onDone`, gdy skończy (także po błędzie). Nie przerywa niczego –
 * kolejność wypowiedzi pilnuje wywołujący. Gdy przeglądarka nie zgłosi końca (zdarza się
 * w Safari), `onDone` wywołuje zapasowy licznik czasu dopasowany do długości tekstu.
 * Zwraca funkcję, która unieważnia oczekiwanie (np. przy pauzie).
 */
export function speakThen(text, language, settings, onDone) {
  if (!speechAvailable() || !text) {
    const timer = setTimeout(onDone, 0);
    return () => clearTimeout(timer);
  }
  let finished = false;
  const rate = Number(settings.speechRate) > 0 ? Number(settings.speechRate) : 1;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    if (current === utterance) current = null;
    onDone();
  };
  const utterance = makeUtterance(text, language, settings);
  current = utterance;
  utterance.onend = finish;
  utterance.onerror = finish;
  const fallback = setTimeout(finish, 4000 + (text.length * 160) / rate);
  window.speechSynthesis.speak(utterance);
  return () => {
    finished = true;
    clearTimeout(fallback);
  };
}

export function stopSpeaking() {
  current = null;
  if (speechAvailable()) window.speechSynthesis.cancel();
}
