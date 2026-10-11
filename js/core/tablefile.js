// Jedno wejście dla plików z danymi tabelarycznymi: rozpoznaje format po zawartości
// (nie po rozszerzeniu) i udostępnia tabelę w tej samej postaci dla XLSX i CSV.

import { decodeText, detectDelimiter, detectEncoding, parseCsv } from './csv.js';
import { SpreadsheetError, openWorkbook } from './xlsx.js';
import { ZipError, readZipDirectory } from './zip.js';

export { SpreadsheetError };

/** Większe pliki odrzucamy od razu – przeglądarka w telefonie mogłaby się na nich zawiesić. */
export const MAX_FILE_SIZE = 60 * 1024 * 1024;

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes, signature) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function describeForeignArchive(bytes) {
  let names;
  try {
    names = [...readZipDirectory(bytes).keys()];
  } catch (error) {
    if (error instanceof ZipError) return 'Plik jest uszkodzony albo nie jest skoroszytem XLSX.';
    throw error;
  }
  if (names.includes('content.xml') && names.includes('mimetype')) {
    return 'To arkusz w formacie ODS. Zapisz go jako XLSX albo CSV i spróbuj ponownie.';
  }
  if (names.some((name) => name.startsWith('Index/') || name === 'Index.zip')) {
    return 'To plik aplikacji Numbers. W Numbers wybierz Plik → Eksportuj do → Excel albo CSV.';
  }
  if (names.some((name) => name.startsWith('word/'))) return 'To dokument Word, a nie arkusz. Wybierz plik XLSX albo CSV.';
  if (names.some((name) => name.startsWith('ppt/'))) return 'To prezentacja, a nie arkusz. Wybierz plik XLSX albo CSV.';
  return 'To archiwum ZIP, a nie arkusz. Wybierz plik XLSX albo CSV.';
}

/** Tekst nie zawiera bajtów sterujących; ich obecność oznacza plik binarny (PDF, obraz…). */
function looksBinary(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8000));
  let control = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const byte = sample[index];
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return control > sample.length * 0.02;
}

/**
 * Otwiera plik z tabelą. Zwraca jeden z opisów:
 *   { kind: 'xlsx', sheets: [{ name, hidden }], readSheet(index) → tabela }
 *   { kind: 'csv', encoding, delimiter, read({ encoding, delimiter }) → tabela }
 * Tabela: { rows: [{ number, cells }], columnCount }.
 * Zgłasza SpreadsheetError z komunikatem dla użytkownika, gdy pliku nie da się odczytać.
 */
export async function openTableFile(bytes) {
  if (bytes.byteLength === 0) throw new SpreadsheetError('Plik jest pusty.');
  if (bytes.byteLength > MAX_FILE_SIZE) throw new SpreadsheetError('Plik jest za duży (limit to 60 MB).');

  if (startsWith(bytes, OLE_SIGNATURE)) {
    throw new SpreadsheetError(
      'To stary format Excela (.xls) albo plik zabezpieczony hasłem. Otwórz go w Excelu, zapisz jako „Skoroszyt programu Excel (.xlsx)” lub CSV i spróbuj ponownie.'
    );
  }

  if (startsWith(bytes, [0x50, 0x4b])) {
    let workbook;
    try {
      workbook = await openWorkbook(bytes);
    } catch (error) {
      if (!(error instanceof SpreadsheetError)) throw error;
      // Archiwum bez skoroszytu: podpowiadamy, czym ten plik jest.
      let hasWorkbook = false;
      try {
        hasWorkbook = readZipDirectory(bytes).has('xl/workbook.xml');
      } catch {
        hasWorkbook = false;
      }
      throw hasWorkbook ? error : new SpreadsheetError(describeForeignArchive(bytes));
    }
    return { kind: 'xlsx', sheets: workbook.sheets, readSheet: (index) => workbook.readSheet(index) };
  }

  const encoding = detectEncoding(bytes);
  if (!encoding.startsWith('utf-16') && looksBinary(bytes)) {
    throw new SpreadsheetError('Nie rozpoznano formatu pliku. Obsługiwane są pliki XLSX i CSV.');
  }
  const delimiter = detectDelimiter(decodeText(bytes, encoding));
  return {
    kind: 'csv',
    encoding,
    delimiter,
    read(options = {}) {
      const text = decodeText(bytes, options.encoding ?? encoding);
      return parseCsv(text, options.delimiter ?? delimiter);
    }
  };
}
