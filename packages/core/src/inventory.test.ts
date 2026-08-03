import { describe, expect, it } from 'vitest';
import { diffDeckAgainstInventory } from './inventory.js';
import { CARDS, deckCard } from './fixtures.js';
import type { DeckData } from './types.js';

describe('diffDeckAgainstInventory', () => {
  const deck: DeckData = {
    format: 'commander',
    cards: [
      deckCard(CARDS.krenko, 1, 'command'),
      deckCard(CARDS.lightningBolt, 1),
      deckCard(CARDS.solRing, 1),
      deckCard(CARDS.island, 5),
    ],
  };

  it('computes owned vs missing and completion', () => {
    const diff = diffDeckAgainstInventory(deck, [
      { oracleId: 'krenko', quantity: 1 },
      { oracleId: 'island', quantity: 3 }, // partial
      // missing: lightning-bolt, sol-ring, 2x island
    ]);

    expect(diff.neededCopies).toBe(8); // 1 + 1 + 1 + 5
    expect(diff.ownedCopies).toBe(4); // 1 krenko + 3 island
    expect(diff.missingCopies).toBe(4);
    expect(diff.completionPct).toBe(50);

    const bolt = diff.cards.find((c) => c.oracleId === 'lightning-bolt')!;
    expect(bolt.missing).toBe(1);
    expect(bolt.missingValueUsd).toBe(2.0);
  });

  it('caps owned at needed (extra copies do not overcount)', () => {
    const diff = diffDeckAgainstInventory(deck, [{ oracleId: 'island', quantity: 99 }]);
    const island = diff.cards.find((c) => c.oracleId === 'island')!;
    expect(island.owned).toBe(99);
    expect(island.missing).toBe(0);
    expect(diff.ownedCopies).toBe(5); // capped at the 5 needed
  });

  it('is 100% complete when everything is owned', () => {
    const diff = diffDeckAgainstInventory(deck, [
      { oracleId: 'krenko', quantity: 1 },
      { oracleId: 'lightning-bolt', quantity: 1 },
      { oracleId: 'sol-ring', quantity: 1 },
      { oracleId: 'island', quantity: 5 },
    ]);
    expect(diff.completionPct).toBe(100);
    expect(diff.missingValueUsd).toBe(0);
  });
});
