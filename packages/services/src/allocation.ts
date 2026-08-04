import type { PrismaClient } from '@deck/db';
import { ownedByOracle } from './inventory.js';

/**
 * Physical-collection allocation. A card is "used" to the extent its counted
 * zone (mainboard + command) appears in the user's BUILT decks; free = owned −
 * used. `used > owned` is a conflict (you've committed more copies than you own).
 */
export interface OracleAllocation {
  oracleId: string;
  owned: number;
  used: number;
  free: number; // owned - used (may be negative)
  decks: { id: string; name: string; quantity: number }[];
}

export interface AllocationConflict {
  oracleId: string;
  name: string;
  owned: number;
  used: number;
  deficit: number; // used - owned (> 0)
  decks: { id: string; name: string; quantity: number }[];
}

export interface AllocationTotals {
  ownedCopies: number;
  usedCopies: number; // copies drawn from the collection (capped at owned)
  freeCopies: number; // uncommitted owned copies
  conflictCards: number;
}

export interface InventoryAllocation {
  byOracle: Map<string, OracleAllocation>;
  conflicts: AllocationConflict[];
  totals: AllocationTotals;
}

const COUNTED = ['mainboard', 'command'] as const;

export async function inventoryAllocation(
  prisma: PrismaClient,
  userId: string,
): Promise<InventoryAllocation> {
  const owned = await ownedByOracle(prisma, userId);
  const ownedMap = new Map(owned.map((o) => [o.oracleId, o.quantity]));

  const builtCards = await prisma.deckCard.findMany({
    where: { deck: { userId, status: 'built' }, board: { in: [...COUNTED] } },
    select: {
      oracleId: true,
      quantity: true,
      deck: { select: { id: true, name: true } },
      oracle: { select: { name: true } },
    },
  });

  const byOracle = new Map<string, OracleAllocation>();
  const nameByOracle = new Map<string, string>();

  // Seed every owned card (used 0 until a built deck claims it).
  for (const [oracleId, qty] of ownedMap) {
    byOracle.set(oracleId, { oracleId, owned: qty, used: 0, free: qty, decks: [] });
  }

  for (const c of builtCards) {
    nameByOracle.set(c.oracleId, c.oracle.name);
    let a = byOracle.get(c.oracleId);
    if (!a) {
      a = { oracleId: c.oracleId, owned: ownedMap.get(c.oracleId) ?? 0, used: 0, free: 0, decks: [] };
      byOracle.set(c.oracleId, a);
    }
    a.used += c.quantity;
    const existing = a.decks.find((d) => d.id === c.deck.id);
    if (existing) existing.quantity += c.quantity;
    else a.decks.push({ id: c.deck.id, name: c.deck.name, quantity: c.quantity });
  }

  let usedCopies = 0;
  let freeCopies = 0;
  let ownedCopies = 0;
  const conflicts: AllocationConflict[] = [];

  for (const a of byOracle.values()) {
    a.free = a.owned - a.used;
    ownedCopies += a.owned;
    usedCopies += Math.min(a.used, a.owned); // can't physically use more than owned
    freeCopies += Math.max(0, a.owned - a.used);
    if (a.used > a.owned) {
      conflicts.push({
        oracleId: a.oracleId,
        name: nameByOracle.get(a.oracleId) ?? a.oracleId,
        owned: a.owned,
        used: a.used,
        deficit: a.used - a.owned,
        decks: a.decks,
      });
    }
  }
  conflicts.sort((x, y) => y.deficit - x.deficit || x.name.localeCompare(y.name));

  return {
    byOracle,
    conflicts,
    totals: { ownedCopies, usedCopies, freeCopies, conflictCards: conflicts.length },
  };
}

export type AllocationFilter = 'all' | 'used' | 'unused' | 'conflict';

/** Oracle ids (owned) matching an allocation filter — used to page inventory. */
export function oracleIdsForFilter(alloc: InventoryAllocation, filter: AllocationFilter): string[] {
  const out: string[] = [];
  for (const a of alloc.byOracle.values()) {
    if (a.owned <= 0) continue; // only owned cards appear in inventory
    if (
      filter === 'all' ||
      (filter === 'used' && a.used > 0) ||
      (filter === 'unused' && a.used === 0) ||
      (filter === 'conflict' && a.used > a.owned)
    ) {
      out.push(a.oracleId);
    }
  }
  return out;
}
