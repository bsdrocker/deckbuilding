import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

/** Hash a password with scrypt (salt embedded). Format: scrypt$<saltHex>$<hashHex>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/** Generate a new API key. Returns the raw key (shown once) and its sha-256 hash. */
export function generateApiKey(): { raw: string; hashed: string; prefix: string } {
  const raw = `deck_live_${randomBytes(24).toString('hex')}`;
  return { raw, hashed: hashApiKey(raw), prefix: raw.slice(0, 14) };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
