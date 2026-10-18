import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is missing. Generate it with: openssl rand -base64 32');
  let key: Buffer;
  try { key = Buffer.from(raw, 'base64'); } catch { throw new Error('TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes.'); }
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes. Generate it with: openssl rand -base64 32');
  return key;
}

/** AES-256-GCM envelope: base64(iv).base64(tag).base64(ciphertext). */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
}

export function decryptToken(envelope: string): string {
  const parts = envelope.split('.');
  if (parts.length !== 3) throw new Error('Encrypted Google token has an invalid format.');
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Encrypted Google token has an invalid format.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Google token decryption failed. Check TOKEN_ENCRYPTION_KEY and stored token integrity.');
  }
}
