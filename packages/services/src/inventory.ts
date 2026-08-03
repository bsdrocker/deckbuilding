import {
  diffDeckAgainstInventory,
  parseQuery,
  type InventoryDiff,
  type OwnedCard,
} from '@deck/core';
import type { OracleCard, PrismaClient } from '@deck/db';
import { stringify } from 'csv-stringify/sync';
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

export async function listInventory(
  prisma: PrismaClient,
  userId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  return prisma.inventoryItem.findMany({
    where: { userId },
    include: { printing: { include: { oracle: { select: { name: true, typeLine: true } } } } },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(opts.limit ?? 100, 500),
    skip: opts.offset ?? 0,
  });
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
  patch: { quantity?: number; tags?: string[]; finish?: string; condition?: string; language?: string },
) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item || item.userId !== userId) throw new ServiceError('not_found', 'Inventory item not found.');
  if (patch.quantity !== undefined && patch.quantity <= 0) {
    await prisma.inventoryItem.delete({ where: { id } });
    return null;
  }

  const finish = patch.finish ?? item.finish;
  const condition = patch.condition ?? item.condition;
  const language = patch.language ?? item.language;
  const quantity = patch.quantity ?? item.quantity;
  const changesKey = finish !== item.finish || condition !== item.condition || language !== item.language;

  // If finish/condition/language changed into a combo that already exists,
  // merge quantities into that row and delete this one (unique key would collide).
  if (changesKey) {
    const conflict = await prisma.inventoryItem.findUnique({
      where: {
        userId_printingId_finish_condition_language: {
          userId,
          printingId: item.printingId,
          finish,
          condition,
          language,
        },
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
    data: { quantity, tags: patch.tags, finish, condition, language },
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

export interface OwnedOption extends OracleCard {
  ownedQuantity: number;
}

/**
 * Surface cards the user ALREADY OWNS that match a Scryfall-subset query.
 * Lets AI deckbuilding answer "what removal / ramp / blue cards do I own that
 * fit this deck?" and prefer the collection over buying new cards.
 */
export async function findOwnedOptions(
  prisma: PrismaClient,
  userId: string,
  query: string,
  opts: { limit?: number } = {},
): Promise<OwnedOption[]> {
  const owned = await ownedByOracle(prisma, userId);
  if (owned.length === 0) return [];
  const ownedMap = new Map(owned.map((o) => [o.oracleId, o.quantity]));

  const where = filterToOracleWhere(parseQuery(query));
  const cards = await prisma.oracleCard.findMany({
    where: { AND: [where, { oracleId: { in: [...ownedMap.keys()] } }] },
    orderBy: { edhrecRank: 'asc' },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return cards.map((c) => ({ ...c, ownedQuantity: ownedMap.get(c.oracleId) ?? 0 }));
}
