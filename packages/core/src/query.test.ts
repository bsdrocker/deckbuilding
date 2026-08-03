import { describe, expect, it } from 'vitest';
import { cardMatchesFilter, parseQuery } from './query.js';
import { CARDS } from './fixtures.js';

describe('parseQuery', () => {
  it('parses colors, type, cmc, format, and name', () => {
    const f = parseQuery('c:r t:instant cmc<=1 f:modern bolt');
    expect(f.colors).toEqual({ mode: 'contains', values: ['R'] });
    expect(f.typeIncludes).toEqual(['instant']);
    expect(f.cmc).toEqual([{ op: '<=', value: 1 }]);
    expect(f.legalIn).toBe('modern');
    expect(f.nameIncludes).toEqual(['bolt']);
  });

  it('parses identity and quoted phrases', () => {
    const f = parseQuery('id:wu "mob boss"');
    expect(f.colorIdentityWithin).toEqual(['W', 'U']);
    expect(f.nameIncludes).toEqual(['mob boss']);
  });

  it('supports mv as an alias for cmc and range operators', () => {
    const f = parseQuery('mv>=3 mv<5');
    expect(f.cmc).toEqual([
      { op: '>=', value: 3 },
      { op: '<', value: 5 },
    ]);
  });
});

describe('cardMatchesFilter', () => {
  it('matches on color + type + cmc', () => {
    const f = parseQuery('c:r t:instant cmc<=1');
    expect(cardMatchesFilter(CARDS.lightningBolt, f)).toBe(true);
    expect(cardMatchesFilter(CARDS.counterspell, f)).toBe(false); // blue
    expect(cardMatchesFilter(CARDS.krenko, f)).toBe(false); // creature, cmc 4
  });

  it('respects color identity subset (id:)', () => {
    const f = parseQuery('id:r');
    expect(cardMatchesFilter(CARDS.lightningBolt, f)).toBe(true);
    expect(cardMatchesFilter(CARDS.counterspell, f)).toBe(false);
  });

  it('respects format legality', () => {
    const f = parseQuery('f:modern');
    expect(cardMatchesFilter(CARDS.lightningBolt, f)).toBe(true);
    expect(cardMatchesFilter(CARDS.solRing, f)).toBe(false); // banned in modern (fixture)
  });
});
