import { describe, expect, it } from 'vitest';
import { copyLimitOverride, validateDeck } from './formats.js';
import { CARDS, deckCard, makeCard } from './fixtures.js';
import type { DeckData } from './types.js';

const nazgul = makeCard({
  oracleId: 'nazgul',
  name: 'Nazgûl',
  typeLine: 'Creature — Wraith Knight',
  colorIdentity: ['B'],
  oracleText: 'A deck can have up to nine cards named Nazgûl.',
});
const sevenDwarves = makeCard({
  oracleId: 'seven-dwarves',
  name: 'Seven Dwarves',
  typeLine: 'Creature — Dwarf',
  colorIdentity: ['R'],
  oracleText: 'A deck can have up to seven cards named Seven Dwarves.',
});
const shadowbornApostle = makeCard({
  oracleId: 'shadowborn-apostle',
  name: 'Shadowborn Apostle',
  typeLine: 'Creature — Human Cleric',
  colorIdentity: ['B'],
  oracleText: 'A deck can have any number of cards named Shadowborn Apostle.',
});

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

describe('copy-limit overrides', () => {
  const copies = (deck: DeckData) => validateDeck(deck).issues.filter((i) => i.code === 'copies');

  it('allows up to nine Nazgûl in commander and flags a tenth', () => {
    const nine: DeckData = { format: 'commander', cards: [deckCard(nazgul, 9)] };
    expect(copies(nine)).toHaveLength(0);

    const ten: DeckData = { format: 'commander', cards: [deckCard(nazgul, 10)] };
    const issue = copies(ten);
    expect(issue).toHaveLength(1);
    expect(issue[0]!.message).toContain('limit of 9');
  });

  it('caps "up to seven" above the constructed 4-of but below 8', () => {
    const seven: DeckData = { format: 'standard', cards: [deckCard(sevenDwarves, 7)] };
    expect(copies(seven)).toHaveLength(0);

    const eight: DeckData = { format: 'standard', cards: [deckCard(sevenDwarves, 8)] };
    expect(copies(eight)).toHaveLength(1);
  });

  it('still allows any number for "any number of cards named" text', () => {
    const deck: DeckData = { format: 'commander', cards: [deckCard(shadowbornApostle, 25)] };
    expect(copies(deck)).toHaveLength(0);
  });

  it('copyLimitOverride parses digits, words, basics, and fails safe', () => {
    expect(copyLimitOverride(makeCard({ oracleId: 'x', name: 'X', oracleText: 'A deck can have up to 9 cards named X.' }))).toBe(9);
    expect(copyLimitOverride(nazgul)).toBe(9);
    expect(copyLimitOverride(sevenDwarves)).toBe(7);
    expect(copyLimitOverride(shadowbornApostle)).toBe(Infinity);
    expect(copyLimitOverride(makeCard({ oracleId: 'mtn', name: 'Mountain', typeLine: 'Basic Land — Mountain' }))).toBe(Infinity);
    expect(copyLimitOverride(CARDS.lightningBolt)).toBeNull();
    expect(copyLimitOverride(makeCard({ oracleId: 'y', name: 'Y', oracleText: 'A deck can have up to umpteen cards named Y.' }))).toBeNull();
  });
});
