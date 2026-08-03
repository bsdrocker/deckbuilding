import { describe, expect, it } from 'vitest';
import { mapCard } from './mapper.js';
import type { ScryfallCard } from './types.js';

const solRing: ScryfallCard = {
  object: 'card',
  id: 'print-sol-ring-c21',
  oracle_id: 'oracle-sol-ring',
  name: 'Sol Ring',
  lang: 'en',
  released_at: '2021-04-23',
  layout: 'normal',
  mana_cost: '{1}',
  cmc: 1,
  type_line: 'Artifact',
  oracle_text: '{T}: Add {C}{C}.',
  colors: [],
  color_identity: [],
  keywords: [],
  produced_mana: ['C'],
  legalities: { commander: 'legal', modern: 'not_legal' },
  reserved: false,
  edhrec_rank: 1,
  set: 'c21',
  set_name: 'Commander 2021',
  collector_number: '263',
  rarity: 'uncommon',
  finishes: ['nonfoil'],
  image_uris: { normal: 'https://img/sol-ring.jpg' },
  prices: { usd: '1.50', usd_foil: null, eur: '1.20' },
};

const questingBeast: ScryfallCard = {
  object: 'card',
  id: 'print-fireslinger-split',
  oracle_id: 'oracle-fire-ice',
  name: 'Fire // Ice',
  lang: 'en',
  layout: 'split',
  color_identity: ['R', 'U'],
  legalities: { modern: 'legal' },
  set: 'apc',
  set_name: 'Apocalypse',
  collector_number: '128',
  rarity: 'uncommon',
  card_faces: [
    { name: 'Fire', mana_cost: '{1}{R}', type_line: 'Instant', oracle_text: 'Fire deals 2 damage.' },
    { name: 'Ice', mana_cost: '{1}{U}', type_line: 'Instant', oracle_text: 'Tap target permanent.' },
  ],
};

describe('mapCard', () => {
  it('maps a simple card into oracle + printing', () => {
    const m = mapCard(solRing);
    expect(m).not.toBeNull();
    expect(m!.oracle.oracleId).toBe('oracle-sol-ring');
    expect(m!.oracle.cmc).toBe(1);
    expect(m!.oracle.producedMana).toEqual(['C']);
    expect(m!.printing.scryfallId).toBe('print-sol-ring-c21');
    expect(m!.printing.setCode).toBe('c21');
    expect(m!.printing.releasedAt).toBeInstanceOf(Date);
  });

  it('joins multi-face fields for split cards', () => {
    const m = mapCard(questingBeast);
    expect(m).not.toBeNull();
    expect(m!.oracle.manaCost).toBe('{1}{R} // {1}{U}');
    expect(m!.oracle.typeLine).toBe('Instant // Instant');
    expect(m!.oracle.colorIdentity).toEqual(['R', 'U']);
  });

  it('returns null for objects without an oracle id', () => {
    const artSeries = { ...solRing, oracle_id: undefined } as ScryfallCard;
    expect(mapCard(artSeries)).toBeNull();
  });
});
