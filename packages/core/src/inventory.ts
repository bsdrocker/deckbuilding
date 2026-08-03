import type { Board, DeckData } from './types.js';

/** Owned quantity of a card, aggregated across printings/finishes by oracle id. */
export interface OwnedCard {
  oracleId: string;
  quantity: number;
}

export interface CardInventoryStatus {
  oracleId: string;
  name: string;
  needed: number;
  owned: number;
  missing: number;
  /** Estimated USD to acquire the missing copies (priceUsd * missing). */
  missingValueUsd: number;
}

export interface InventoryDiff {
  cards: CardInventoryStatus[];
  neededCards: number; // distinct cards required
  ownedCards: number; // distinct cards fully owned
  neededCopies: number; // total copies required
  ownedCopies: number; // total copies already owned (capped at needed)
  missingCopies: number;
  completionPct: number; // 0..100 by copies
  missingValueUsd: number;
  ownedValueUsd: number; // value of owned copies applied to the deck
}

const COUNTED: Board[] = ['mainboard', 'command'];

/**
 * Compare what a deck requires against what the user owns. This is the primitive
 * that lets AI deckbuilding bias toward cards already in the collection: it
 * surfaces exactly which cards (and how many copies) are missing, and the cost
 * to complete the deck.
 *
 * @param deck   the deck (mainboard + command are counted; sideboard optional)
 * @param owned  aggregated owned quantities by oracle id
 * @param opts.includeSideboard also require sideboard cards
 */
export function diffDeckAgainstInventory(
  deck: DeckData,
  owned: OwnedCard[],
  opts: { includeSideboard?: boolean } = {},
): InventoryDiff {
  const boards = opts.includeSideboard ? [...COUNTED, 'sideboard' as Board] : COUNTED;
  const ownedByOracle = new Map<string, number>();
  for (const o of owned) ownedByOracle.set(o.oracleId, (ownedByOracle.get(o.oracleId) ?? 0) + o.quantity);

  // Aggregate required copies per oracle id across the counted boards.
  const requiredByOracle = new Map<string, { name: string; needed: number; priceUsd: number }>();
  for (const dc of deck.cards) {
    if (!boards.includes(dc.board)) continue;
    const cur = requiredByOracle.get(dc.oracleId) ?? {
      name: dc.card.name,
      needed: 0,
      priceUsd: dc.card.priceUsd ?? 0,
    };
    cur.needed += dc.quantity;
    requiredByOracle.set(dc.oracleId, cur);
  }

  const cards: CardInventoryStatus[] = [];
  let neededCopies = 0;
  let ownedCopies = 0;
  let missingValueUsd = 0;
  let ownedValueUsd = 0;
  let ownedCards = 0;

  for (const [oracleId, req] of requiredByOracle) {
    const have = ownedByOracle.get(oracleId) ?? 0;
    const appliedOwned = Math.min(have, req.needed);
    const missing = req.needed - appliedOwned;
    const missingValue = Math.round(missing * req.priceUsd * 100) / 100;

    neededCopies += req.needed;
    ownedCopies += appliedOwned;
    missingValueUsd += missingValue;
    ownedValueUsd += appliedOwned * req.priceUsd;
    if (missing === 0) ownedCards += 1;

    cards.push({ oracleId, name: req.name, needed: req.needed, owned: have, missing, missingValueUsd: missingValue });
  }

  // Sort: missing cards first (most missing copies), then owned.
  cards.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

  const missingCopies = neededCopies - ownedCopies;
  return {
    cards,
    neededCards: requiredByOracle.size,
    ownedCards,
    neededCopies,
    ownedCopies,
    missingCopies,
    completionPct: neededCopies === 0 ? 100 : Math.round((ownedCopies / neededCopies) * 1000) / 10,
    missingValueUsd: Math.round(missingValueUsd * 100) / 100,
    ownedValueUsd: Math.round(ownedValueUsd * 100) / 100,
  };
}
