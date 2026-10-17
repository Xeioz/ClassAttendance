import type { Cipher, VaultKeys } from '../types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const ITERATIONS = 100_000;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKeys(pin: string, salt: string): Promise<VaultKeys> {
  if (!crypto.subtle)
    throw new Error('Encryption requires HTTPS or localhost and a supported browser.');
  if (!/^\d{6,12}$/.test(pin))
    throw new Error('Use a 6–12 digit Master PIN. A longer random PIN is safer.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  // Requested PBKDF2 settings. Split independent AES and HMAC key material; never persist keys.
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: ITERATIONS },
    material,
    512,
  );
  const [encryption, index] = await Promise.all([
    crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]),
  ]);
  return { encryption, index, salt };
}
export async function encrypt<T>(key: CryptoKey, value: T, context: string): Promise<Cipher> {
  // Fresh 96-bit nonce for every write; AAD prevents swapping ciphertext between records.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context), tagLength: 128 },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}
export async function decrypt<T>(key: CryptoKey, cipher: Cipher, context: string): Promise<T> {
  if (cipher.v !== 1) throw new Error('Unsupported encrypted record version.');
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(cipher.iv),
        additionalData: encoder.encode(context),
        tagLength: 128,
      },
      key,
      fromBase64(cipher.data),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new Error('Unable to decrypt: wrong PIN, damaged data, or invalid record context.');
  }
}
export async function privateToken(keys: VaultKeys, context: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', keys.index, encoder.encode(context));
  return toBase64(new Uint8Array(signature));
}
