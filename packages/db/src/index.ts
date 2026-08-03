import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/**
 * Singleton PrismaClient. Reused across the API, MCP server, and web app so we
 * don't exhaust the connection pool during dev hot-reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
