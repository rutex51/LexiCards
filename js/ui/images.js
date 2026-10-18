// Obrazy notatek w przeglądarce: odczyt, zmniejszenie zbyt dużych zdjęć, adresy do wyświetlenia.

import { WEB_IMAGE_TYPES, imageInfo } from '../core/images.js';

/** Dłuższy bok obrazu po zmniejszeniu – wystarcza do czytelnego powiększenia na telefonie. */
export const MAX_IMAGE_SIDE = 2048;
/** Obraz do tej wielkości (i w formacie dla przeglądarek) zostaje bez zmian. */
const KEEP_BYTES = 1.5 * 1024 * 1024;

export class ImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageError';
  }
}

async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      // Niektóre formaty dekoduje tylko element <img> (np. HEIC w Safari).
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new window.Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') canvas.toBlob((blob) => resolve(blob), type, quality);
    else resolve(null);
  });
}

/**
 * Przygotowuje obraz do zapisu w notatce. Zwraca { bytes: ArrayBuffer, type, width, height, name }.
 * Obraz w formacie dla przeglądarek, niewielki i nie większy niż MAX_IMAGE_SIDE zostaje bez
 * zmian; większy jest zmniejszany (PNG zostaje PNG, gdy nie wyjdzie za duży – zrzuty ekranu
 * z tekstem są w nim ostrzejsze), a inne formaty (BMP, TIFF, HEIC…) zamieniane na JPEG lub PNG.
 * Zgłasza ImageError, gdy przeglądarka nie potrafi odczytać obrazu.
 */
export async function prepareImage(input, { type = null, name = null } = {}) {
  const blob = input instanceof Blob ? input : new Blob([input], { type: type ?? '' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const detected = imageInfo(bytes).type ?? type ?? blob.type ?? null;
  if (!detected || !detected.startsWith('image/') || detected === 'image/svg+xml') {
    throw new ImageError('To nie jest obraz w obsługiwanym formacie (PNG, JPEG, GIF, WebP).');
  }
  let decoded;
  try {
    decoded = await decode(new Blob([bytes], { type: detected }));
  } catch {
    throw new ImageError('Nie udało się odczytać obrazu. Zapisz go jako PNG albo JPEG i spróbuj ponownie.');
  }
  try {
    const { width, height } = decoded;
    if (!width || !height) throw new ImageError('Obraz jest pusty albo uszkodzony.');
    const fits = Math.max(width, height) <= MAX_IMAGE_SIDE;
    if (WEB_IMAGE_TYPES.includes(detected) && fits && bytes.byteLength <= KEEP_BYTES) {
      return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), type: detected, width, height, name };
    }
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    let output = null;
    if (detected === 'image/png' || detected === 'image/gif' || detected === 'image/bmp') {
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      output = await canvasBlob(canvas, 'image/png');
      if (output && output.size > KEEP_BYTES) output = null;
    }
    if (!output) {
      // JPEG nie ma przezroczystości – przezroczyste tło staje się białe, a nie czarne.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      output = await canvasBlob(canvas, 'image/jpeg', 0.86);
    }
    if (!output) throw new ImageError('Nie udało się zapisać obrazu.');
    return { bytes: await output.arrayBuffer(), type: output.type || 'image/jpeg', width: canvas.width, height: canvas.height, name };
  } finally {
    decoded.close();
  }
}

/** Adres obrazu do wyświetlenia (trzeba go zwolnić przez URL.revokeObjectURL). */
export function imageURL(image) {
  return URL.createObjectURL(new Blob([image.bytes], { type: image.type }));
}

/** Zbiór adresów zwalnianych razem (np. przy zamknięciu okna). */
export function urlPool() {
  const urls = new Set();
  return {
    add(image) {
      const url = imageURL(image);
      urls.add(url);
      return url;
    },
    release() {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
