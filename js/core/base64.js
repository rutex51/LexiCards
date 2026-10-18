// Base64 dla bajtów (obrazy notatek w kopii zapasowej i we wzorze importu).

/** Bajty → Base64 (w kawałkach, żeby nie przekroczyć limitu argumentów funkcji). */
export function bytesToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Base64 → ArrayBuffer; null, gdy tekst nie jest poprawnym Base64. */
export function base64ToBytes(text) {
  try {
    const binary = atob(String(text ?? ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  } catch {
    return null;
  }
}
