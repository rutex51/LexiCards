// PLIK GENEROWANY przez `npm run build` z tools/sw.template.js – nie edytuj go ręcznie.
// LexiCards – praca bez internetu.
//
// Przy instalacji pobiera komplet plików aplikacji do pamięci podręcznej oznaczonej wersją.
// Każda zmiana dowolnego pliku zmienia wersję, więc przeglądarka pobiera nowy komplet
// i nigdy nie miesza plików z dwóch wydań.

const VERSION = 'eabc86ff';
const CACHE = `lexicards-${VERSION}`;
const ASSETS = [
  "css/app.css",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "js/core/arrays.js",
  "js/core/attach.js",
  "js/core/backup.js",
  "js/core/base64.js",
  "js/core/calendar.js",
  "js/core/changelog.js",
  "js/core/created.js",
  "js/core/csv.js",
  "js/core/diagrams.js",
  "js/core/drawing.js",
  "js/core/dxf.js",
  "js/core/exporter.js",
  "js/core/fits.js",
  "js/core/fsrs.js",
  "js/core/gdt.js",
  "js/core/geometry-edit.js",
  "js/core/ics.js",
  "js/core/images.js",
  "js/core/importer.js",
  "js/core/layers.js",
  "js/core/library.js",
  "js/core/listen.js",
  "js/core/math-layout.js",
  "js/core/math.js",
  "js/core/messages.js",
  "js/core/model.js",
  "js/core/note-files.js",
  "js/core/note-format.js",
  "js/core/note-import.js",
  "js/core/note-refs.js",
  "js/core/page-curl.js",
  "js/core/page-layouts.js",
  "js/core/pdf-pages.js",
  "js/core/pdf.js",
  "js/core/quiz.js",
  "js/core/recognize.js",
  "js/core/sample-data.js",
  "js/core/samples.js",
  "js/core/shapes.js",
  "js/core/solids.js",
  "js/core/sorting.js",
  "js/core/sounds.js",
  "js/core/stats.js",
  "js/core/storage-idb.js",
  "js/core/storage-memory.js",
  "js/core/storage-snapshot.js",
  "js/core/storage.js",
  "js/core/study.js",
  "js/core/symbols.js",
  "js/core/tablefile.js",
  "js/core/tables.js",
  "js/core/template-image.js",
  "js/core/templates.js",
  "js/core/text.js",
  "js/core/title-block.js",
  "js/core/tool-ring.js",
  "js/core/transform.js",
  "js/core/usage.js",
  "js/core/xlsx.js",
  "js/core/zip.js",
  "js/main.js",
  "js/theme-boot.js",
  "js/ui/actions.js",
  "js/ui/attachments.js",
  "js/ui/audio-keepalive.js",
  "js/ui/canvas-text.js",
  "js/ui/charts.js",
  "js/ui/color-picker.js",
  "js/ui/components.js",
  "js/ui/date-picker.js",
  "js/ui/dialogs.js",
  "js/ui/dom.js",
  "js/ui/drawing-boxes.js",
  "js/ui/drawing-diagrams.js",
  "js/ui/drawing-gdt.js",
  "js/ui/drawing-groups.js",
  "js/ui/drawing-paint.js",
  "js/ui/drawing-ring.js",
  "js/ui/drawing-solids.js",
  "js/ui/drawing.js",
  "js/ui/files.js",
  "js/ui/fit-table.js",
  "js/ui/focus-mode.js",
  "js/ui/grid-drag.js",
  "js/ui/hints.js",
  "js/ui/icons.js",
  "js/ui/images.js",
  "js/ui/listen-player.js",
  "js/ui/mastery.js",
  "js/ui/material.js",
  "js/ui/math.js",
  "js/ui/note-book.js",
  "js/ui/note-editing.js",
  "js/ui/note-pdf.js",
  "js/ui/note-print.js",
  "js/ui/notes.js",
  "js/ui/recorder.js",
  "js/ui/reorder-drag.js",
  "js/ui/router.js",
  "js/ui/screens/glossary.js",
  "js/ui/screens/import.js",
  "js/ui/screens/library.js",
  "js/ui/screens/listen.js",
  "js/ui/screens/quiz-history.js",
  "js/ui/screens/quiz-session.js",
  "js/ui/screens/quiz-setup.js",
  "js/ui/screens/settings.js",
  "js/ui/screens/start.js",
  "js/ui/screens/stats.js",
  "js/ui/screens/study-session.js",
  "js/ui/screens/study-setup.js",
  "js/ui/screens/terms.js",
  "js/ui/shell.js",
  "js/ui/sounds.js",
  "js/ui/speech.js",
  "js/ui/study-calendar.js",
  "js/ui/swipe.js",
  "js/ui/symbols.js",
  "js/ui/table-editor.js",
  "js/version.js",
  "manifest.webmanifest",
  "sounds/kartka.wav"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `reload` omija pamięć HTTP przeglądarki – do kompletu trafiają aktualne pliki.
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('lexicards-') && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Otwarcie aplikacji (adres katalogu albo index.html) zawsze dostaje stronę główną.
  const scopePath = new URL(self.registration.scope).pathname;
  const opensApp = request.mode === 'navigate'
    && (url.pathname === scopePath || url.pathname === `${scopePath}index.html`);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = opensApp
      ? await cache.match('index.html')
      : await cache.match(request, { ignoreSearch: true });
    return cached ?? fetch(request);
  })());
});
