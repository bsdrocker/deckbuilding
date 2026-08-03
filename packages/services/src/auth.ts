import type { PrismaClient } from '@deck/db';
import { generateApiKey, hashApiKey, hashPassword, verifyPassword } from './crypto.js';
import { ServiceError } from './errors.js';

export interface AuthUser {
  id: string;
  email: string;
  handle: string;
}

export interface RegisterInput {
  email: string;
  handle: string;
  password: string;
}

/** Register a user and return the user plus an initial raw API key (shown once). */
export async function registerUser(
  prisma: PrismaClient,
  input: RegisterInput,
): Promise<{ user: AuthUser; apiKey: string }> {
  const email = input.email.trim().toLowerCase();
  const handle = input.handle.trim();
  if (!email || !handle || !input.password) {
    throw new ServiceError('bad_request', 'email, handle, and password are required.');
  }
  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { handle }] } });
  if (existing) throw new ServiceError('conflict', 'A user with that email or handle already exists.');

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({ data: { email, handle, passwordHash } });
  const apiKey = await createApiKey(prisma, user.id, 'initial-key');
  return { user: { id: user.id, email: user.email, handle: user.handle }, apiKey: apiKey.raw };
}

/** Verify credentials and mint a fresh API key (convenient for CLI/programmatic use). */
export async function loginUser(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<{ user: AuthUser; apiKey: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ServiceError('forbidden', 'Invalid email or password.');
  }
  const apiKey = await createApiKey(prisma, user.id, `login-${new Date().toISOString().slice(0, 10)}`);
  return { user: { id: user.id, email: user.email, handle: user.handle }, apiKey: apiKey.raw };
}

export async function createApiKey(
  prisma: PrismaClient,
  userId: string,
  name: string,
): Promise<{ id: string; raw: string; prefix: string }> {
  const { raw, hashed, prefix } = generateApiKey();
  const rec = await prisma.apiKey.create({
    data: { userId, name: name.trim() || 'api-key', hashedKey: hashed, prefix, scopes: ['read', 'write'] },
  });
  return { id: rec.id, raw, prefix };
}

export async function listApiKeys(prisma: PrismaClient, userId: string) {
  return prisma.apiKey.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeApiKey(prisma: PrismaClient, userId: string, id: string) {
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== userId) throw new ServiceError('not_found', 'API key not found.');
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

/**
 * Resolve a raw bearer token to a user id. Updates lastUsedAt. Returns null when
 * the token is missing/invalid/revoked so callers can send a 401.
 */
export async function authenticateApiKey(
  prisma: PrismaClient,
  rawToken: string | undefined,
): Promise<AuthUser | null> {
  if (!rawToken) return null;
  const hashed = hashApiKey(rawToken);
  const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashed }, include: { user: true } });
  if (!key || key.revokedAt) return null;
  // Best-effort last-used stamp (don't block the request on it).
  void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { id: key.user.id, email: key.user.email, handle: key.user.handle };
}
