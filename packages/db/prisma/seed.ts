/**
 * Minimal seed: a demo user with an API key so the API/MCP server can be tried
 * immediately without going through registration. Card data comes from the
 * Scryfall importer (`pnpm scryfall:import`), not from here.
 *
 * The demo API key is deterministic ONLY for local dev convenience. Never ship
 * this to a real environment.
 */
import { createHash, randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const scrypt = promisify(scryptCb);
const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@deckbuilding.local';
const DEMO_HANDLE = 'demo';
const DEMO_PASSWORD = 'password'; // local dev only
// A fixed dev key so docs/tests can reference it. Rotate in real deployments.
const DEMO_RAW_KEY = process.env.DEMO_API_KEY ?? 'deck_dev_demo_0000000000000000';

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// Mirrors the scrypt format used by @deck/services so the demo user can log in.
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: { email: DEMO_EMAIL, handle: DEMO_HANDLE, passwordHash },
  });

  const hashedKey = hashKey(DEMO_RAW_KEY);
  await prisma.apiKey.upsert({
    where: { hashedKey },
    update: {},
    create: {
      userId: user.id,
      name: 'demo-dev-key',
      hashedKey,
      prefix: DEMO_RAW_KEY.slice(0, 12),
      scopes: ['read', 'write'],
    },
  });

  console.log('Seeded demo user:', user.email, `(password: "${DEMO_PASSWORD}")`);
  console.log('Demo API key (use as Bearer token):', DEMO_RAW_KEY);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
