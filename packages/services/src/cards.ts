import { parseQuery, type CardFilter } from '@deck/core';
import type { OracleCard, Prisma, PrismaClient } from '@deck/db';
import { ServiceError } from './errors.js';

const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'] as const;

/** Translate a parsed CardFilter into a Prisma where over OracleCard. */
export function filterToOracleWhere(filter: CardFilter): Prisma.OracleCardWhereInput {
  const and: Prisma.OracleCardWhereInput[] = [];

  for (const n of filter.nameIncludes) and.push({ name: { contains: n, mode: 'insensitive' } });
  for (const t of filter.typeIncludes) and.push({ typeLine: { contains: t, mode: 'insensitive' } });
  for (const o of filter.oracleIncludes) and.push({ oracleText: { contains: o, mode: 'insensitive' } });

  for (const c of filter.cmc) {
    if (c.op === '=') and.push({ cmc: { equals: c.value } });
    else if (c.op === '>') and.push({ cmc: { gt: c.value } });
    else if (c.op === '<') and.push({ cmc: { lt: c.value } });
    else if (c.op === '>=') and.push({ cmc: { gte: c.value } });
    else if (c.op === '<=') and.push({ cmc: { lte: c.value } });
  }

  if (filter.colors) {
    if (filter.colors.mode === 'contains') {
      and.push({ colors: { hasEvery: filter.colors.values } });
    } else {
      const complement = ALL_COLORS.filter((c) => !filter.colors!.values.includes(c));
      and.push({ colors: { hasEvery: filter.colors.values } });
      if (complement.length) and.push({ NOT: { colors: { hasSome: complement } } });
    }
  }

  if (filter.colorIdentityWithin) {
    const complement = ALL_COLORS.filter((c) => !filter.colorIdentityWithin!.includes(c));
    if (complement.length) and.push({ NOT: { colorIdentity: { hasSome: complement } } });
  }

  if (filter.legalIn) {
    and.push({
      OR: [
        { legalities: { path: [filter.legalIn], equals: 'legal' } },
        { legalities: { path: [filter.legalIn], equals: 'restricted' } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'cmc' | 'edhrec';
}

export interface CardSearchResult {
  total: number;
  cards: OracleCard[];
}

/** Search oracle cards using a Scryfall-subset query string. */
export async function searchCards(
  prisma: PrismaClient,
  query: string,
  opts: SearchOptions = {},
): Promise<CardSearchResult> {
  const where = filterToOracleWhere(parseQuery(query));
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 175);
  const orderBy: Prisma.OracleCardOrderByWithRelationInput =
    opts.orderBy === 'cmc'
      ? { cmc: 'asc' }
      : opts.orderBy === 'edhrec'
        ? { edhrecRank: 'asc' }
        : { name: 'asc' };

  const [total, cards] = await Promise.all([
    prisma.oracleCard.count({ where }),
    prisma.oracleCard.findMany({ where, orderBy, take: limit, skip: opts.offset ?? 0 }),
  ]);
  return { total, cards };
}

export async function getCardById(prisma: PrismaClient, oracleId: string) {
  const card = await prisma.oracleCard.findUnique({
    where: { oracleId },
    include: { printings: { orderBy: { releasedAt: 'desc' }, take: 25 } },
  });
  if (!card) throw new ServiceError('not_found', `No card with oracle id ${oracleId}`);
  return card;
}

/** Case-insensitive exact-name lookup, falling back to a "contains" match. */
export async function getCardByName(prisma: PrismaClient, name: string) {
  const exact = await prisma.oracleCard.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    include: { printings: { orderBy: { releasedAt: 'desc' }, take: 25 } },
  });
  if (exact) return exact;

  const fuzzy = await prisma.oracleCard.findFirst({
    where: { name: { contains: name, mode: 'insensitive' } },
    orderBy: { edhrecRank: 'asc' },
    include: { printings: { orderBy: { releasedAt: 'desc' }, take: 25 } },
  });
  if (!fuzzy) throw new ServiceError('not_found', `No card matching name "${name}"`);
  return fuzzy;
}

/**
 * Resolve a list of card names to oracle ids (case-insensitive exact match).
 * Returns both the matches and the names that could not be resolved.
 */
export async function resolveNames(
  prisma: PrismaClient,
  names: string[],
): Promise<{ resolved: Map<string, OracleCard>; unresolved: string[] }> {
  const resolved = new Map<string, OracleCard>();
  const unresolved: string[] = [];
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

  // Batched case-insensitive lookups.
  const found = await prisma.oracleCard.findMany({
    where: { OR: unique.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) },
  });
  const byLower = new Map(found.map((c) => [c.name.toLowerCase(), c]));

  for (const n of unique) {
    const hit = byLower.get(n.toLowerCase());
    if (hit) resolved.set(n, hit);
    else unresolved.push(n);
  }
  return { resolved, unresolved };
}
