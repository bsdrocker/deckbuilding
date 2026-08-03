import { describe, expect, it } from 'vitest';
import { computeDeckStats, countPips } from './stats.js';
import { CARDS, deckCard } from './fixtures.js';
import type { DeckData } from './types.js';

describe('countPips', () => {
  it('counts colored pips including doubles', () => {
    expect(countPips('{2}{U}{U}')).toEqual({ W: 0, U: 2, B: 0, R: 0, G: 0 });
    expect(countPips('{W}{U}{B}{R}{G}')).toEqual({ W: 1, U: 1, B: 1, R: 1, G: 1 });
    expect(countPips(null)).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0 });
  });

  it('counts each color in a hybrid pip', () => {
    expect(countPips('{W/U}')).toEqual({ W: 1, U: 1, B: 0, R: 0, G: 0 });
  });
});

describe('computeDeckStats', () => {
  const deck: DeckData = {
    format: 'commander',
    cards: [
      deckCard(CARDS.krenko, 1, 'command'), // 4 cmc creature, RR
      deckCard(CARDS.lightningBolt, 1), // 1 cmc instant, R
      deckCard(CARDS.counterspell, 1), // 2 cmc instant, UU
      deckCard(CARDS.island, 10), // lands
    ],
  };
  const stats = computeDeckStats(deck);

  it('separates lands from nonlands', () => {
    expect(stats.landCount).toBe(10);
    expect(stats.nonlandCount).toBe(3);
    expect(stats.totalCards).toBe(13);
  });

  it('builds a mana curve over nonland cards', () => {
    expect(stats.manaCurve.find((b) => b.cmc === 1)?.count).toBe(1);
    expect(stats.manaCurve.find((b) => b.cmc === 2)?.count).toBe(1);
    expect(stats.manaCurve.find((b) => b.cmc === 4)?.count).toBe(1);
  });

  it('computes color pips and percentages', () => {
    // R: Krenko RR (2) + Bolt R (1) = 3 ; U: Counterspell UU = 2
    expect(stats.colorPips.R).toBe(3);
    expect(stats.colorPips.U).toBe(2);
    expect(stats.colorPercentages.R).toBe(60);
    expect(stats.colorPercentages.U).toBe(40);
  });

  it('averages cmc over nonlands and sums price', () => {
    expect(stats.averageCmc).toBeCloseTo((4 + 1 + 2) / 3, 2);
    // 3 + 2 + 1 + 10*0.1 = 7
    expect(stats.totalPriceUsd).toBeCloseTo(7, 2);
  });
});
