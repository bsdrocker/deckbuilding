import type { CardData, DeckCardData } from './types.js';

/** Test/helper card factory with sensible defaults. */
export function makeCard(partial: Partial<CardData> & { name: string; oracleId: string }): CardData {
  return {
    manaCost: null,
    cmc: 0,
    typeLine: 'Artifact',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    keywords: [],
    legalities: { commander: 'legal', modern: 'legal', standard: 'legal' },
    power: null,
    toughness: null,
    priceUsd: 0,
    ...partial,
  };
}

export function deckCard(
  card: CardData,
  quantity: number,
  board: DeckCardData['board'] = 'mainboard',
): DeckCardData {
  return { oracleId: card.oracleId, quantity, board, card };
}

export const CARDS = {
  solRing: makeCard({
    oracleId: 'sol-ring',
    name: 'Sol Ring',
    manaCost: '{1}',
    cmc: 1,
    typeLine: 'Artifact',
    colorIdentity: [],
    legalities: { commander: 'legal', modern: 'banned' },
    priceUsd: 1.5,
  }),
  lightningBolt: makeCard({
    oracleId: 'lightning-bolt',
    name: 'Lightning Bolt',
    manaCost: '{R}',
    cmc: 1,
    typeLine: 'Instant',
    colors: ['R'],
    colorIdentity: ['R'],
    legalities: { commander: 'legal', modern: 'legal' },
    priceUsd: 2.0,
  }),
  counterspell: makeCard({
    oracleId: 'counterspell',
    name: 'Counterspell',
    manaCost: '{U}{U}',
    cmc: 2,
    typeLine: 'Instant',
    colors: ['U'],
    colorIdentity: ['U'],
    legalities: { commander: 'legal', modern: 'legal' },
    priceUsd: 1.0,
  }),
  island: makeCard({
    oracleId: 'island',
    name: 'Island',
    typeLine: 'Basic Land — Island',
    colorIdentity: ['U'],
    legalities: { commander: 'legal', modern: 'legal' },
    priceUsd: 0.1,
  }),
  krenko: makeCard({
    oracleId: 'krenko',
    name: 'Krenko, Mob Boss',
    manaCost: '{2}{R}{R}',
    cmc: 4,
    typeLine: 'Legendary Creature — Goblin Warrior',
    colors: ['R'],
    colorIdentity: ['R'],
    keywords: [],
    power: '3',
    toughness: '3',
    legalities: { commander: 'legal', modern: 'legal' },
    priceUsd: 3.0,
  }),
  serraAngel: makeCard({
    oracleId: 'serra-angel',
    name: 'Serra Angel',
    manaCost: '{3}{W}{W}',
    cmc: 5,
    typeLine: 'Creature — Angel',
    colors: ['W'],
    colorIdentity: ['W'],
    keywords: ['Flying', 'Vigilance'],
    power: '4',
    toughness: '4',
    legalities: { commander: 'legal', modern: 'legal' },
    priceUsd: 0.5,
  }),
  jaceBeleren: makeCard({
    oracleId: 'jace-beleren',
    name: 'Jace Beleren',
    manaCost: '{1}{U}{U}',
    cmc: 3,
    typeLine: 'Legendary Planeswalker — Jace',
    colors: ['U'],
    colorIdentity: ['U'],
    loyalty: '3',
    legalities: { commander: 'legal', modern: 'legal' },
    priceUsd: 4.0,
  }),
};
