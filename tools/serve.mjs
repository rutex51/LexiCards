// Prosty serwer plików do uruchamiania aplikacji na własnym komputerze.
//
//   npm run serve                       – http://localhost:8080/
//   npm run serve -- --port 9000 --base /LexiCards/
//
// `--base` udaje adres z podkatalogiem, taki jak na GitHub Pages.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

/** Uruchamia serwer. Zwraca { url, close() }. */
export function startServer({ port = 8080, base = '/', root = ROOT, host = '127.0.0.1' } = {}) {
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === prefix.slice(0, -1)) {
        response.writeHead(301, { Location: prefix }).end();
        return;
      }
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nie znaleziono.');
        return;
      }
      pathname = pathname.slice(prefix.length);
      if (pathname === '' || pathname.endsWith('/')) pathname += 'index.html';

      const file = path.resolve(root, pathname);
      if (file !== root && !file.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache'
      }).end(body);
    } catch (error) {
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      response.writeHead(missing ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end(missing ? 'Nie znaleziono.' : 'Błąd serwera.');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        url: `http://localhost:${address.port}${prefix}`,
        close: () => new Promise((done) => {
          server.closeAllConnections?.();
          server.close(() => done());
        })
      });
    });
  });
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { url } = await startServer({ port: Number(option('port', 8080)), base: option('base', '/') });
  console.log(`LexiCards działa pod adresem ${url}`);
  console.log('Zatrzymanie: Ctrl+C');
}
