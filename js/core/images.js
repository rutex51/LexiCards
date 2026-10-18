// Rozpoznawanie obrazów po zawartości: format i wymiary z nagłówka pliku.
// Bez zależności od przeglądarki – używane przy imporcie z arkusza i w testach.

/** Formaty, które każda przeglądarka wyświetla bez przeróbki. */
export const WEB_IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Rozszerzenie pliku dla typu obrazu (eksport do arkusza). */
export const IMAGE_EXTENSIONS = Object.freeze({
  'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
  'image/tiff': 'tiff', 'image/heic': 'heic', 'image/avif': 'avif', 'image/emf': 'emf', 'image/wmf': 'wmf',
  'image/svg+xml': 'svg'
});

/** Czytelna nazwa formatu do komunikatów. */
export const IMAGE_FORMAT_NAMES = Object.freeze({
  'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF', 'image/webp': 'WebP', 'image/bmp': 'BMP',
  'image/tiff': 'TIFF', 'image/heic': 'HEIC', 'image/avif': 'AVIF', 'image/emf': 'EMF', 'image/wmf': 'WMF',
  'image/svg+xml': 'SVG'
});

const TYPE_BY_EXTENSION = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', dib: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heic',
  avif: 'image/avif', emf: 'image/emf', wmf: 'image/wmf', svg: 'image/svg+xml'
});

/** Typ obrazu po rozszerzeniu nazwy pliku (np. „image1.png”) albo null. */
export function imageTypeFromName(name) {
  const extension = /\.([a-z0-9]+)$/i.exec(String(name ?? ''))?.[1]?.toLowerCase();
  return extension ? TYPE_BY_EXTENSION[extension] ?? null : null;
}

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

function jpegSize(bytes, view) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes, view) {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = view.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

/**
 * Format i wymiary obrazu: { type, width, height } – typ MIME albo null, gdy to nie jest
 * znany obraz; wymiary null, gdy nie da się ich odczytać z nagłówka.
 */
export function imageInfo(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input ?? new ArrayBuffer(0));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = (type, size = null) => ({ type, width: size?.width ?? null, height: size?.height ?? null });
  if (bytes.length < 12) return result(null);

  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes.length >= 24) {
    return result('image/png', { width: view.getUint32(16), height: view.getUint32(20) });
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return result('image/jpeg', jpegSize(bytes, view));
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    return result('image/gif', { width: view.getUint16(6, true), height: view.getUint16(8, true) });
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return result('image/webp', webpSize(bytes, view));
  if (bytes[0] === 0x42 && bytes[1] === 0x4d && bytes.length >= 26) {
    return result('image/bmp', { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) });
  }
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 0x2a)) {
    return result('image/tiff');
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') return result('image/avif');
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return result('image/heic');
  }
  if (bytes[0] === 0xd7 && bytes[1] === 0xcd && bytes[2] === 0xc6 && bytes[3] === 0x9a) return result('image/wmf');
  if (bytes.length >= 44 && view.getUint32(0, true) === 1 && ascii(bytes, 40, 4) === ' EMF') return result('image/emf');
  const start = ascii(bytes, 0, Math.min(bytes.length, 256)).trimStart().toLowerCase();
  if (start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))) return result('image/svg+xml');
  return result(null);
}
