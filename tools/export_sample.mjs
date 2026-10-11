// Zapisuje eksport danych przykładowych (XLSX i CSV) do podanego katalogu.
// Używane przez tools/check_export.py do sprawdzenia plików w niezależnych programach.
//
//   node tools/export_sample.mjs <katalog>

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildExportFile } from '../js/core/exporter.js';
import { Library } from '../js/core/library.js';
import { installSampleData } from '../js/core/samples.js';
import { MemoryAdapter } from '../js/core/storage.js';

const target = process.argv[2];
if (!target) {
  console.error('Podaj katalog docelowy.');
  process.exit(1);
}
await mkdir(target, { recursive: true });

const adapter = new MemoryAdapter();
await adapter.open();
const library = new Library(adapter);
await library.load();
await installSampleData(library);

// Pojęcie ze znakami, które łatwo zepsuć przy zapisie.
const lesson = [...library.maps.lessons.values()][0];
await library.createTerm({
  termPL: 'test „znaków” <&>',
  termEN: 'special "characters" test; with separator',
  descriptionPL: 'Pierwszy wiersz.\nDrugi wiersz.',
  notes: '  spacje  ',
  tags: ['a', 'b'],
  difficulty: 5
}, lesson.id);

for (const format of ['xlsx', 'csv']) {
  const file = await buildExportFile(library, { kind: 'all' }, format, new Date(2026, 9, 11));
  await writeFile(path.join(target, `export.${format}`), file.bytes);
  console.log(`${file.name}: ${file.count} pojęć, ${file.bytes.length} bajtów`);
}
