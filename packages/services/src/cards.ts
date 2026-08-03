import { parseQuery, type CardClause, type CardQuery, type NumericConstraint } from '@deck/core';
import type { OracleCard, Prisma, PrismaClient } from '@deck/db';
import { ServiceError } from './errors.js';

const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'] as const;

function numericWhere(constraints: NumericConstraint[], field: 'cmc' | 'powerNum' | 'toughnessNum'): Prisma.OracleCardWhereInput[] {
  return constraints.map((c) => {
    const op = c.op === '=' ? 'equals' : c.op === '>' ? 'gt' : c.op === '<' ? 'lt' : c.op === '>=' ? 'gte' : 'lte';
    return { [field]: { [op]: c.value } } as Prisma.OracleCardWhereInput;
  });
}

/** Translate a single AND-clause into a Prisma where over OracleCard. */
function clauseToWhere(clause: CardClause): Prisma.OracleCardWhereInput {
  const and: Prisma.OracleCardWhereInput[] = [];

  for (const n of clause.nameIncludes) and.push({ name: { contains: n, mode: 'insensitive' } });
  for (const n of clause.nameExcludes) and.push({ NOT: { name: { contains: n, mode: 'insensitive' } } });
  for (const t of clause.typeIncludes) and.push({ typeLine: { contains: t, mode: 'insensitive' } });
  for (const t of clause.typeExcludes) and.push({ NOT: { typeLine: { contains: t, mode: 'insensitive' } } });
  for (const o of clause.oracleIncludes) and.push({ oracleText: { contains: o, mode: 'insensitive' } });
  for (const o of clause.oracleExcludes) and.push({ NOT: { oracleText: { contains: o, mode: 'insensitive' } } });

  // Keywords match case-insensitively (Scryfall stores capitalized keywords).
  for (const k of clause.keywords) {
    and.push({ keywords: { hasSome: [k, k[0]!.toUpperCase() + k.slice(1)] } });
  }
  for (const k of clause.keywordsExcluded) {
    and.push({ NOT: { keywords: { hasSome: [k, k[0]!.toUpperCase() + k.slice(1)] } } });
  }

  and.push(...numericWhere(clause.cmc, 'cmc'));
  and.push(...numericWhere(clause.power, 'powerNum'));
  and.push(...numericWhere(clause.toughness, 'toughnessNum'));

  if (clause.colors) {
    if (clause.colors.mode === 'contains') {
      and.push({ colors: { hasEvery: clause.colors.values } });
    } else {
      const complement = ALL_COLORS.filter((c) => !clause.colors!.values.includes(c));
      and.push({ colors: { hasEvery: clause.colors.values } });
      if (complement.length) and.push({ NOT: { colors: { hasSome: complement } } });
    }
  }
  if (clause.colorsExcluded.length) {
    and.push({ NOT: { colors: { hasSome: clause.colorsExcluded } } });
  }
  if (clause.colorIdentityWithin) {
    const complement = ALL_COLORS.filter((c) => !clause.colorIdentityWithin!.includes(c));
    if (complement.length) and.push({ NOT: { colorIdentity: { hasSome: complement } } });
  }
  if (clause.legalIn) {
    and.push({
      OR: [
        { legalities: { path: [clause.legalIn], equals: 'legal' } },
        { legalities: { path: [clause.legalIn], equals: 'restricted' } },
      ],
    });
  }
  if (clause.rarity.length) {
    and.push({ printings: { some: { rarity: { in: clause.rarity } } } });
  }

  return and.length ? { AND: and } : {};
}

/** Translate a parsed CardQuery (OR of clauses) into a Prisma where. */
export function filterToOracleWhere(query: CardQuery): Prisma.OracleCardWhereInput {
  const clauses = query.or.map(clauseToWhere).filter((w) => Object.keys(w).length > 0);
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0]!;
  return { OR: clauses };
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
