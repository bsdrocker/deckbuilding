import {
  diffDeckAgainstInventory,
  parseQuery,
  type InventoryDiff,
  type OwnedCard,
} from '@deck/core';
import type { OracleCard, Prisma, PrismaClient } from '@deck/db';
import { stringify } from 'csv-stringify/sync';
import {
  inventoryAllocation,
  oracleIdsForFilter,
  type AllocationFilter,
  type InventoryAllocation,
} from './allocation.js';
import { filterToOracleWhere } from './cards.js';
import { loadDeck, toDeckData } from './deckData.js';
import { ServiceError } from './errors.js';
import { representativePrices } from './prices.js';

/** Finish-aware USD price from a printing's price JSON. */
function finishPrice(prices: unknown, finish: string): number | null {
  const p = (prices ?? null) as Record<string, string | null> | null;
  if (!p) return null;
  const key = finish === 'foil' ? 'usd_foil' : finish === 'etched' ? 'usd_etched' : 'usd';
  const raw = p[key] ?? p.usd ?? p.usd_foil ?? null;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface AddInventoryInput {
  /** Provide a printingId (Scryfall id). */
  printingId: string;
  quantity?: number;
  finish?: string;
  condition?: string;
  language?: string;
  tags?: string[];
}

const INVENTORY_INCLUDE = {
  printing: {
    select: {
      scryfallId: true,
      setCode: true,
      setName: true,
      collectorNumber: true,
      prices: true,
      imageUris: true,
      oracleId: true,
      oracle: { select: { name: true, typeLine: true } },
    },
  },
} as const;

export type InventorySort = 'name' | 'set' | 'value' | 'recent';
export type SortDir = 'asc' | 'desc';

export interface ListInventoryOptions {
  limit?: number;
  offset?: number;
  sort?: InventorySort;
  dir?: SortDir;
  /** Restrict to cards used-by / free-of / in conflict with built decks. */
  filter?: AllocationFilter;
  /** Case-insensitive card-name substring filter. */
  q?: string;
}

type InventoryRow = Prisma.InventoryItemGetPayload<{ include: typeof INVENTORY_INCLUDE }>;
type AnnotatedItem = InventoryRow & { unitUsd: number; totalUsd: number; used: number; free: number };

export interface InventoryListResult {
  total: number;
  items: AnnotatedItem[];
}

function withValue(item: InventoryRow, alloc: InventoryAllocation): AnnotatedItem {
  const unit = finishPrice(item.printing.prices, item.finish) ?? 0;
  const a = alloc.byOracle.get(item.printing.oracleId);
  return {
    ...item,
    unitUsd: Math.round(unit * 100) / 100,
    totalUsd: Math.round(unit * item.quantity * 100) / 100,
    // used/free are ORACLE-level (shared across printings of the same card).
    used: a?.used ?? 0,
    free: a?.free ?? item.quantity,
  };
}

/**
 * Paginated, sortable, filterable inventory listing. Sorting by name/set/recency
 * is done in the database; value sorting is finish-aware (not a DB column) so it
 * loads the rows and sorts in memory. Each item is annotated with its card's
 * used/free allocation, and `filter` narrows to used/unused/conflict cards.
 */
export async function listInventory(
  prisma: PrismaClient,
  userId: string,
  opts: ListInventoryOptions = {},
): Promise<InventoryListResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const dir: SortDir = opts.dir === 'desc' ? 'desc' : 'asc';
  const sort = opts.sort ?? 'name';
  const filter = opts.filter ?? 'all';

  const alloc = await inventoryAllocation(prisma, userId);

  const q = opts.q?.trim();
  const where: Prisma.InventoryItemWhereInput = { userId };
  const printingWhere: Prisma.CardPrintingWhereInput = {};
  if (filter !== 'all') {
    const ids = oracleIdsForFilter(alloc, filter);
    if (ids.length === 0) return { total: 0, items: [] };
    printingWhere.oracleId = { in: ids };
  }
  if (q) printingWhere.oracle = { name: { contains: q, mode: 'insensitive' } };
  if (filter !== 'all' || q) where.printing = printingWhere;

  const total = await prisma.inventoryItem.count({ where });

  if (sort === 'value') {
    const all = await prisma.inventoryItem.findMany({ where, include: INVENTORY_INCLUDE });
    const valued = all.map((i) => withValue(i, alloc));
    valued.sort((a, b) => (dir === 'desc' ? b.totalUsd - a.totalUsd : a.totalUsd - b.totalUsd));
    return { total, items: valued.slice(offset, offset + limit) };
  }

  const orderBy =
    sort === 'set'
      ? [{ printing: { setCode: dir } }, { printing: { collectorNumber: dir } }]
      : sort === 'recent'
        ? [{ updatedAt: dir }]
        : [{ printing: { oracle: { name: dir } } }];

  const items = await prisma.inventoryItem.findMany({
    where,
    include: INVENTORY_INCLUDE,
    orderBy,
    take: limit,
    skip: offset,
  });
  return { total, items: items.map((i) => withValue(i, alloc)) };
}

export async function addInventory(
  prisma: PrismaClient,
  userId: string,
  input: AddInventoryInput,
) {
  const printing = await prisma.cardPrinting.findUnique({ where: { scryfallId: input.printingId } });
  if (!printing) throw new ServiceError('not_found', `No printing with id ${input.printingId}`);

  const finish = input.finish ?? 'nonfoil';
  const condition = input.condition ?? 'NM';
  const language = input.language ?? 'en';
  const quantity = input.quantity ?? 1;

  return prisma.inventoryItem.upsert({
    where: {
      userId_printingId_finish_condition_language: {
        userId,
        printingId: input.printingId,
        finish,
        condition,
        language,
      },
    },
    create: { userId, printingId: input.printingId, finish, condition, language, quantity, tags: input.tags ?? [] },
    update: { quantity: { increment: quantity }, ...(input.tags ? { tags: input.tags } : {}) },
  });
}

export async function updateInventoryItem(
  prisma: PrismaClient,
  userId: string,
  id: string,
  patch: { quantity?: number; tags?: string[]; finish?: string; condition?: string; language?: string; printingId?: string },
) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item || item.userId !== userId) throw new ServiceError('not_found', 'Inventory item not found.');
  if (patch.quantity !== undefined && patch.quantity <= 0) {
    await prisma.inventoryItem.delete({ where: { id } });
    return null;
  }

  const printingId = patch.printingId ?? item.printingId;
  const finish = patch.finish ?? item.finish;
  const condition = patch.condition ?? item.condition;
  const language = patch.language ?? item.language;
  const quantity = patch.quantity ?? item.quantity;
  const changesKey =
    printingId !== item.printingId ||
    finish !== item.finish ||
    condition !== item.condition ||
    language !== item.language;

  if (patch.printingId && patch.printingId !== item.printingId) {
    const printing = await prisma.cardPrinting.findUnique({ where: { scryfallId: patch.printingId } });
    if (!printing) throw new ServiceError('not_found', `No printing with id ${patch.printingId}`);
  }

  // If the unique key (printing/finish/condition/language) changed into a combo
  // that already exists, merge quantities into that row and delete this one.
  if (changesKey) {
    const conflict = await prisma.inventoryItem.findUnique({
      where: {
        userId_printingId_finish_condition_language: { userId, printingId, finish, condition, language },
      },
    });
    if (conflict && conflict.id !== id) {
      const [merged] = await prisma.$transaction([
        prisma.inventoryItem.update({
          where: { id: conflict.id },
          data: { quantity: { increment: quantity }, ...(patch.tags ? { tags: patch.tags } : {}) },
        }),
        prisma.inventoryItem.delete({ where: { id } }),
      ]);
      return merged;
    }
  }

  return prisma.inventoryItem.update({
    where: { id },
    data: { quantity, tags: patch.tags, finish, condition, language, printingId },
  });
}

export async function deleteInventoryItem(prisma: PrismaClient, userId: string, id: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item || item.userId !== userId) throw new ServiceError('not_found', 'Inventory item not found.');
  await prisma.inventoryItem.delete({ where: { id } });
}

/** Aggregate a user's inventory into owned copies per oracle id. */
export async function ownedByOracle(prisma: PrismaClient, userId: string): Promise<OwnedCard[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    select: { quantity: true, printing: { select: { oracleId: true } } },
  });
  const map = new Map<string, number>();
  for (const it of items) {
    const oracleId = it.printing.oracleId;
    map.set(oracleId, (map.get(oracleId) ?? 0) + it.quantity);
  }
  return [...map.entries()].map(([oracleId, quantity]) => ({ oracleId, quantity }));
}

export interface InventorySummary {
  distinctCards: number;
  totalCopies: number;
  estimatedValueUsd: number;
}

export async function inventorySummary(
  prisma: PrismaClient,
  userId: string,
): Promise<InventorySummary> {
  const owned = await ownedByOracle(prisma, userId);
  const prices = await representativePrices(
    prisma,
    owned.map((o) => o.oracleId),
  );
  let totalCopies = 0;
  let value = 0;
  for (const o of owned) {
    totalCopies += o.quantity;
    value += (prices.get(o.oracleId) ?? 0) * o.quantity;
  }
  return {
    distinctCards: owned.length,
    totalCopies,
    estimatedValueUsd: Math.round(value * 100) / 100,
  };
}

export interface InventoryValueBreakdown {
  totalValueUsd: number;
  totalCopies: number;
  distinctCards: number;
  topCards: {
    name: string;
    setCode: string;
    collectorNumber: string;
    finish: string;
    quantity: number;
    unitUsd: number;
    totalUsd: number;
  }[];
}

/** Finish-aware collection value with the highest-value cards on top. */
export async function inventoryValueBreakdown(
  prisma: PrismaClient,
  userId: string,
  topN = 15,
): Promise<InventoryValueBreakdown> {
  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    include: {
      printing: {
        select: { setCode: true, collectorNumber: true, prices: true, oracle: { select: { name: true } } },
      },
    },
  });

  let total = 0;
  let copies = 0;
  const rows = items.map((it) => {
    const unit = finishPrice(it.printing.prices, it.finish) ?? 0;
    const totalUsd = unit * it.quantity;
    total += totalUsd;
    copies += it.quantity;
    return {
      name: it.printing.oracle.name,
      setCode: it.printing.setCode.toUpperCase(),
      collectorNumber: it.printing.collectorNumber,
      finish: it.finish,
      quantity: it.quantity,
      unitUsd: Math.round(unit * 100) / 100,
      totalUsd: Math.round(totalUsd * 100) / 100,
    };
  });
  rows.sort((a, b) => b.totalUsd - a.totalUsd);

  return {
    totalValueUsd: Math.round(total * 100) / 100,
    totalCopies: copies,
    distinctCards: items.length,
    topCards: rows.slice(0, topN),
  };
}

/** Export the user's whole collection as a CSV string (ManaBox-compatible headers). */
export async function exportInventoryCsv(prisma: PrismaClient, userId: string): Promise<string> {
  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    include: {
      printing: {
        select: {
          scryfallId: true,
          setCode: true,
          setName: true,
          collectorNumber: true,
          prices: true,
          oracle: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const records = items.map((it) => ({
    Quantity: it.quantity,
    Name: it.printing.oracle.name,
    'Set code': it.printing.setCode,
    'Set name': it.printing.setName,
    'Collector number': it.printing.collectorNumber,
    Foil: it.finish,
    Condition: it.condition,
    Language: it.language,
    'Scryfall ID': it.printing.scryfallId,
    'Unit USD': finishPrice(it.printing.prices, it.finish) ?? '',
  }));

  return stringify(records, {
    header: true,
    columns: [
      'Quantity', 'Name', 'Set code', 'Set name', 'Collector number',
      'Foil', 'Condition', 'Language', 'Scryfall ID', 'Unit USD',
    ],
  });
}

/**
 * Compare a deck against the user's inventory: which cards (and how many copies)
 * are already owned vs. must be acquired, plus the cost to complete. This is the
 * primitive AI deckbuilding uses to bias toward the existing collection.
 */
export async function deckInventoryDiff(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
  opts: { includeSideboard?: boolean } = {},
): Promise<InventoryDiff> {
  const deck = await loadDeck(prisma, deckId);
  if (!deck) throw new ServiceError('not_found', `No deck with id ${deckId}`);
  if (deck.userId !== userId) throw new ServiceError('forbidden', 'You do not own this deck.');

  const deckData = await toDeckData(prisma, deck);
  const owned = await ownedByOracle(prisma, userId);
  return diffDeckAgainstInventory(deckData, owned, opts);
}

export interface DeckCardAvailability {
  deckCardId: string;
  oracleId: string;
  needed: number;
  ownedOracle: number; // total copies of this oracle in inventory (any printing/finish)
  missing: number; // max(0, needed - ownedOracle)
  pinnedPrintingId: string | null;
  finish: string | null; // preferred finish, if set
  /**
   * When a printing is pinned: whether the user owns that exact printing (in the
   * preferred finish, if one is set). null when no printing is pinned.
   */
  printingStatus: 'owned' | 'not_owned' | null;
  ownedPrintingQty: number; // copies of the pinned printing (matching finish) owned
}

/**
 * Per-deck-card inventory availability for the deck view: oracle-level "missing"
 * plus printing/finish-level status when a card pins a specific printing. Powers
 * the missing-card and wrong-printing/finish flags.
 */
export async function deckAvailability(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
): Promise<DeckCardAvailability[]> {
  const deck = await loadDeck(prisma, deckId);
  if (!deck) throw new ServiceError('not_found', `No deck with id ${deckId}`);
  if (deck.userId !== userId) throw new ServiceError('forbidden', 'You do not own this deck.');

  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    select: { printingId: true, finish: true, quantity: true, printing: { select: { oracleId: true } } },
  });

  const byOracle = new Map<string, number>();
  const byPrinting = new Map<string, number>(); // printingId -> qty (any finish)
  const byPrintingFinish = new Map<string, number>(); // `${printingId}|${finish}` -> qty
  for (const it of items) {
    byOracle.set(it.printing.oracleId, (byOracle.get(it.printing.oracleId) ?? 0) + it.quantity);
    byPrinting.set(it.printingId, (byPrinting.get(it.printingId) ?? 0) + it.quantity);
    const k = `${it.printingId}|${it.finish}`;
    byPrintingFinish.set(k, (byPrintingFinish.get(k) ?? 0) + it.quantity);
  }

  return deck.cards.map((c) => {
    const ownedOracle = byOracle.get(c.oracleId) ?? 0;
    const missing = Math.max(0, c.quantity - ownedOracle);

    let printingStatus: 'owned' | 'not_owned' | null = null;
    let ownedPrintingQty = 0;
    if (c.printingId) {
      ownedPrintingQty = c.finish
        ? byPrintingFinish.get(`${c.printingId}|${c.finish}`) ?? 0
        : byPrinting.get(c.printingId) ?? 0;
      printingStatus = ownedPrintingQty > 0 ? 'owned' : 'not_owned';
    }

    return {
      deckCardId: c.id,
      oracleId: c.oracleId,
      needed: c.quantity,
      ownedOracle,
      missing,
      pinnedPrintingId: c.printingId,
      finish: c.finish,
      printingStatus,
      ownedPrintingQty,
    };
  });
}

export interface OwnedPrinting {
  printingId: string;
  total: number;
  byFinish: Record<string, number>;
}

/** Per-printing inventory ownership for one oracle card (for the printing picker). */
export async function ownedPrintingsForOracle(
  prisma: PrismaClient,
  userId: string,
  oracleId: string,
): Promise<OwnedPrinting[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { userId, printing: { oracleId } },
    select: { printingId: true, finish: true, quantity: true },
  });
  const map = new Map<string, OwnedPrinting>();
  for (const it of items) {
    let e = map.get(it.printingId);
    if (!e) {
      e = { printingId: it.printingId, total: 0, byFinish: {} };
      map.set(it.printingId, e);
    }
    e.total += it.quantity;
    e.byFinish[it.finish] = (e.byFinish[it.finish] ?? 0) + it.quantity;
  }
  return [...map.values()];
}

export interface OwnedOption extends OracleCard {
  ownedQuantity: number;
  freeQuantity: number; // owned copies not committed to built decks
}

/**
 * Surface cards the user ALREADY OWNS that match a Scryfall query. Lets AI
 * deckbuilding answer "what removal / ramp / blue cards do I own that fit this
 * deck?" and prefer the collection over buying new cards. With `onlyFree`, it
 * excludes cards fully committed to built decks — ideal for brewing a NEW deck
 * without stealing cards from ones you've physically assembled.
 */
export async function findOwnedOptions(
  prisma: PrismaClient,
  userId: string,
  query: string,
  opts: { limit?: number; onlyFree?: boolean } = {},
): Promise<OwnedOption[]> {
  const owned = await ownedByOracle(prisma, userId);
  if (owned.length === 0) return [];
  const ownedMap = new Map(owned.map((o) => [o.oracleId, o.quantity]));

  const alloc = await inventoryAllocation(prisma, userId);
  const freeOf = (oracleId: string) => alloc.byOracle.get(oracleId)?.free ?? (ownedMap.get(oracleId) ?? 0);

  let candidateIds = [...ownedMap.keys()];
  if (opts.onlyFree) candidateIds = candidateIds.filter((id) => freeOf(id) > 0);
  if (candidateIds.length === 0) return [];

  const where = filterToOracleWhere(parseQuery(query));
  const cards = await prisma.oracleCard.findMany({
    where: { AND: [where, { oracleId: { in: candidateIds } }] },
    orderBy: { edhrecRank: 'asc' },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return cards.map((c) => ({
    ...c,
    ownedQuantity: ownedMap.get(c.oracleId) ?? 0,
    freeQuantity: Math.max(0, freeOf(c.oracleId)),
  }));
}
