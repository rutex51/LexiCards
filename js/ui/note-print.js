// Zapis notatki do PDF i druk (od 1.20): cała notatka (wersja w wybranym języku) w układzie
// strony A4 – ścieżka i nazwa lekcji, tekst z formatowaniem, wzory, obrazy z podpisami i podziały
// stron – a potem zwykłe okno drukowania przeglądarki. W nim „Zapisz jako PDF” (Chrome, Edge),
// „Microsoft Print to PDF” (Windows) albo na iPhonie i iPadzie – Udostępnij → Drukuj → zapis PDF.
//
// Treść do druku jest osobnym elementem na końcu strony; arkusz stylów (@media print) ukrywa na
// wydruku resztę aplikacji, a na ekranie – ten element.

import { h } from './dom.js';
import { noteFlow } from './note-book.js';

/**
 * Drukuje notatkę: title – nazwa lekcji (też nazwa pliku PDF), path – dziedzina i moduł,
 * pozostałe opcje – jak w noteFlow (html, images, imagesFirst, numberFigures, language).
 */
export async function printNote({ title, path = null, ...content }) {
  document.querySelector('.note-print')?.remove();
  const root = h('div', { class: 'note-print', dataset: { testid: 'note-print' } },
    path ? h('p', { class: 'note-print__path' }, path) : null,
    h('h1', { class: 'note-print__title' }, title),
    noteFlow(content));
  document.body.append(root);
  const previousTitle = document.title;
  document.title = title;
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    document.title = previousTitle;
    root.remove();
  };
  window.addEventListener('afterprint', cleanup);
  // Obrazy wczytane przed drukiem (z pamięci urządzenia – to chwila).
  await Promise.all([...root.querySelectorAll('img')].map((image) => image.decode().catch(() => {})));
  window.print();
}
