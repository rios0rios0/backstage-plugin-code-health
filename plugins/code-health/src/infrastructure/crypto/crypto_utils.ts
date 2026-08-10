const ENCRYPTED_PREFIX = "enc:";
const IV_LENGTH = 12;

const toBase64 = (buffer: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

const fromBase64 = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

export const encrypt = async (key: CryptoKey, plaintext: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return `${ENCRYPTED_PREFIX}${toBase64(combined.buffer as ArrayBuffer)}`;
};

export const decrypt = async (key: CryptoKey, value: string): Promise<string | null> => {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;

  try {
    const data = fromBase64(value.slice(ENCRYPTED_PREFIX.length));
    const iv = data.slice(0, IV_LENGTH);
    const ciphertext = data.slice(IV_LENGTH);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
};
