import { describe, expect, it } from 'vitest';
import { validateDeck } from './formats.js';
import { CARDS, deckCard, makeCard } from './fixtures.js';
import type { DeckData } from './types.js';

describe('validateDeck — commander', () => {
  it('flags off-color-identity cards', () => {
    const deck: DeckData = {
      format: 'commander',
      cards: [
        deckCard(CARDS.krenko, 1, 'command'), // R commander
        deckCard(CARDS.counterspell, 1, 'mainboard'), // U — off identity
      ],
    };
    const res = validateDeck(deck);
    const ci = res.issues.find((i) => i.code === 'color_identity');
    expect(ci).toBeDefined();
    expect(ci!.cardName).toBe('Counterspell');
  });

  it('allows on-identity cards and unlimited basics', () => {
    const deck: DeckData = {
      format: 'commander',
      cards: [
        deckCard(CARDS.krenko, 1, 'command'),
        deckCard(CARDS.lightningBolt, 1, 'mainboard'),
        deckCard(makeCard({ oracleId: 'mountain', name: 'Mountain', typeLine: 'Basic Land — Mountain', colorIdentity: ['R'] }), 30, 'mainboard'),
      ],
    };
    const res = validateDeck(deck);
    expect(res.issues.some((i) => i.code === 'color_identity')).toBe(false);
    expect(res.issues.some((i) => i.code === 'copies')).toBe(false); // basics unlimited
  });

  it('enforces singleton (max 1 non-basic)', () => {
    const deck: DeckData = {
      format: 'commander',
      cards: [
        deckCard(CARDS.krenko, 1, 'command'),
        deckCard(CARDS.lightningBolt, 2, 'mainboard'),
      ],
    };
    const res = validateDeck(deck);
    expect(res.issues.some((i) => i.code === 'copies')).toBe(true);
  });

  it('flags banned cards by format legality', () => {
    // Sol Ring is banned in modern per fixture legalities.
    const deck: DeckData = { format: 'modern', cards: [deckCard(CARDS.solRing, 1)] };
    const res = validateDeck(deck);
    expect(res.issues.some((i) => i.code === 'banned')).toBe(true);
  });

  it('requires a commander', () => {
    const deck: DeckData = { format: 'commander', cards: [deckCard(CARDS.lightningBolt, 1)] };
    const res = validateDeck(deck);
    expect(res.issues.some((i) => i.code === 'missing_commander')).toBe(true);
  });
});

describe('validateDeck — constructed', () => {
  it('allows up to 4 copies and flags a 5th', () => {
    const four: DeckData = { format: 'modern', cards: [deckCard(CARDS.lightningBolt, 4)] };
    expect(validateDeck(four).issues.some((i) => i.code === 'copies')).toBe(false);

    const five: DeckData = { format: 'modern', cards: [deckCard(CARDS.lightningBolt, 5)] };
    expect(validateDeck(five).issues.some((i) => i.code === 'copies')).toBe(true);
  });

  it('flags decks below the minimum size', () => {
    const deck: DeckData = { format: 'modern', cards: [deckCard(CARDS.lightningBolt, 4)] };
    expect(validateDeck(deck).issues.some((i) => i.code === 'deck_size')).toBe(true);
  });
});
