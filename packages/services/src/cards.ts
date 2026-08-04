import {
  parseQuery,
  type CardQuery,
  type ColorConstraint,
  type Expr,
  type NumericConstraint,
  type Term,
} from '@deck/core';
import type { OracleCard, Prisma, PrismaClient } from '@deck/db';
import { ServiceError } from './errors.js';

const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'] as const;

function numericWhere(
  c: NumericConstraint,
  field: 'cmc' | 'powerNum' | 'toughnessNum' | 'loyaltyNum',
): Prisma.OracleCardWhereInput {
  const op = c.op === '=' ? 'equals' : c.op === '>' ? 'gt' : c.op === '<' ? 'lt' : c.op === '>=' ? 'gte' : 'lte';
  return { [field]: { [op]: c.value } } as Prisma.OracleCardWhereInput;
}

/** Release-year constraint → a Prisma DateTime range on a printing's releasedAt. */
function yearRange(c: NumericConstraint): Prisma.DateTimeNullableFilter {
  const start = new Date(Date.UTC(c.value, 0, 1));
  const nextYear = new Date(Date.UTC(c.value + 1, 0, 1));
  switch (c.op) {
    case '=': return { gte: start, lt: nextYear };
    case '>': return { gte: nextYear };
    case '>=': return { gte: start };
    case '<': return { lt: start };
    case '<=': return { lt: nextYear };
  }
}

/**
 * Mana-cost constraint → Prisma where. 'contains' requires the cost to include
 * each symbol the requested number of times (same-color pips are contiguous in
 * the canonical cost string, so a repeated-token substring enforces the count).
 * 'exact' compares the canonical joined string, so symbols must be in printed
 * order (generic first, then WUBRG) — which is how they're written and stored.
 */
function manaWhere(term: Extract<Term, { kind: 'mana' }>): Prisma.OracleCardWhereInput {
  if (term.mode === 'exact') {
    return { manaCost: { equals: term.symbols.join(''), mode: 'insensitive' } };
  }
  const counts = new Map<string, number>();
  for (const s of term.symbols) counts.set(s, (counts.get(s) ?? 0) + 1);
  return {
    AND: [...counts].map(([sym, n]) => ({ manaCost: { contains: sym.repeat(n), mode: 'insensitive' as const } })),
  };
}

/**
 * A color/identity comparison as Prisma array predicates on `field`. Q = query
 * colors, complement = the others. subset = no colors outside Q; superset = has
 * all of Q; proper variants add a not-equal condition.
 */
function colorWhere(field: 'colors' | 'colorIdentity', c: ColorConstraint): Prisma.OracleCardWhereInput {
  const Q = c.values;
  const complement = ALL_COLORS.filter((x) => !Q.includes(x));
  const hasAll = { [field]: { hasEvery: Q } } as Prisma.OracleCardWhereInput;
  const noneOutside = complement.length
    ? [{ NOT: { [field]: { hasSome: complement } } } as Prisma.OracleCardWhereInput]
    : [];
  let parts: Prisma.OracleCardWhereInput[];
  switch (c.op) {
    case '<=': parts = noneOutside; break; // subset
    case '>=': parts = [hasAll]; break; // superset
    case '=': parts = [hasAll, ...noneOutside]; break; // exact
    case '<': parts = [...noneOutside, { NOT: hasAll }]; break; // proper subset
    case '>': parts = [hasAll, { [field]: { hasSome: complement } } as Prisma.OracleCardWhereInput]; break;
  }
  return parts.length ? { AND: parts } : {};
}

/** `is:` filters as Prisma predicates (case-insensitive type/oracle checks). */
function isWhere(value: string): Prisma.OracleCardWhereInput {
  const ci = (s: string) => ({ typeLine: { contains: s, mode: 'insensitive' as const } });
  const oracle = (s: string) => ({ oracleText: { contains: s, mode: 'insensitive' as const } });
  switch (value) {
    case 'commander':
      return { OR: [{ AND: [ci('Legendary'), ci('Creature')] }, oracle('can be your commander')] };
    case 'permanent':
      return { NOT: { OR: [ci('Instant'), ci('Sorcery')] } };
    case 'spell':
      return { NOT: ci('Land') };
    case 'vanilla':
      return { AND: [ci('Creature'), { OR: [{ oracleText: null }, { oracleText: '' }] }] };
    default:
      return { oracleId: '__no_such_is_filter__' }; // unknown is: matches nothing
  }
}

/** Translate a single atomic term into a Prisma where over OracleCard. */
function termToWhere(term: Term): Prisma.OracleCardWhereInput {
  switch (term.kind) {
    case 'name': return { name: { contains: term.value, mode: 'insensitive' } };
    case 'type': return { typeLine: { contains: term.value, mode: 'insensitive' } };
    case 'oracle': return { oracleText: { contains: term.value, mode: 'insensitive' } };
    case 'keyword':
      return { keywords: { hasSome: [term.value, term.value[0]!.toUpperCase() + term.value.slice(1)] } };
    case 'cmc': return numericWhere(term.c, 'cmc');
    case 'power': return numericWhere(term.c, 'powerNum');
    case 'toughness': return numericWhere(term.c, 'toughnessNum');
    case 'loyalty': return numericWhere(term.c, 'loyaltyNum');
    case 'colors': return colorWhere('colors', term.c);
    case 'identity': return colorWhere('colorIdentity', term.c);
    case 'mana': return manaWhere(term);
    case 'set': return { printings: { some: { setCode: { equals: term.value, mode: 'insensitive' } } } };
    case 'year': return { printings: { some: { releasedAt: yearRange(term.c) } } };
    case 'rarity': return { printings: { some: { rarity: { equals: term.value } } } };
    case 'legal':
      return {
        OR: [
          { legalities: { path: [term.value], equals: 'legal' } },
          { legalities: { path: [term.value], equals: 'restricted' } },
        ],
      };
    case 'is': return isWhere(term.value);
  }
}

function exprToWhere(e: Expr): Prisma.OracleCardWhereInput {
  switch (e.op) {
    case 'true': return {};
    case 'term': return termToWhere(e.term);
    case 'not': return { NOT: exprToWhere(e.node) };
    case 'and': return { AND: e.nodes.map(exprToWhere) };
    case 'or': return { OR: e.nodes.map(exprToWhere) };
  }
}

/** Translate a parsed CardQuery (boolean expression tree) into a Prisma where. */
export function filterToOracleWhere(query: CardQuery): Prisma.OracleCardWhereInput {
  return exprToWhere(query.root);
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

// All printings for a card, newest first — used by the printing/art pickers,
// which need every printing (some cards have 100+), not a small recent slice.
const ALL_PRINTINGS: Prisma.OracleCardInclude = {
  printings: {
    orderBy: [{ releasedAt: 'desc' }, { collectorNumber: 'asc' }],
    take: 500,
  },
};

export async function getCardById(prisma: PrismaClient, oracleId: string) {
  const card = await prisma.oracleCard.findUnique({
    where: { oracleId },
    include: ALL_PRINTINGS,
  });
  if (!card) throw new ServiceError('not_found', `No card with oracle id ${oracleId}`);
  return card;
}

/** Case-insensitive exact-name lookup, falling back to a "contains" match. */
export async function getCardByName(prisma: PrismaClient, name: string) {
  const exact = await prisma.oracleCard.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    include: ALL_PRINTINGS,
  });
  if (exact) return exact;

  const fuzzy = await prisma.oracleCard.findFirst({
    where: { name: { contains: name, mode: 'insensitive' } },
    orderBy: { edhrecRank: 'asc' },
    include: ALL_PRINTINGS,
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

/** Canonical key for a (setCode, collectorNumber) pair — case-insensitive. */
export function printingRefKey(setCode: string, collectorNumber: string): string {
  return `${setCode.toLowerCase()}|${collectorNumber.toLowerCase()}`;
}

/**
 * Resolve (setCode, collectorNumber) pairs to their oracle cards. This is how
 * flavor-named reprints and single-face lookups resolve when the printed name
 * isn't the oracle name (e.g. Secret Lair "Adamantium Bonding Tank" = The
 * Ozolith). Keys in the returned map come from {@link printingRefKey}.
 */
export async function resolvePrintingRefs(
  prisma: PrismaClient,
  refs: { setCode: string; collectorNumber: string }[],
): Promise<Map<string, OracleCard>> {
  const resolved = new Map<string, OracleCard>();
  const unique = new Map<string, { setCode: string; collectorNumber: string }>();
  for (const r of refs) {
    if (!r.setCode || !r.collectorNumber) continue;
    unique.set(printingRefKey(r.setCode, r.collectorNumber), r);
  }
  if (unique.size === 0) return resolved;

  const printings = await prisma.cardPrinting.findMany({
    where: {
      OR: [...unique.values()].map((r) => ({
        setCode: { equals: r.setCode, mode: 'insensitive' as const },
        collectorNumber: { equals: r.collectorNumber, mode: 'insensitive' as const },
      })),
    },
    include: { oracle: true },
  });
  for (const p of printings) {
    resolved.set(printingRefKey(p.setCode, p.collectorNumber), p.oracle);
  }
  return resolved;
}
