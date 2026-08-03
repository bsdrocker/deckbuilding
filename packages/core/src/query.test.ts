import { describe, expect, it } from 'vitest';
import { cardMatchesQuery, parseQuery } from './query.js';
import { CARDS } from './fixtures.js';

describe('parseQuery', () => {
  it('parses colors, type, cmc, format, and name into a single clause', () => {
    const q = parseQuery('c:r t:instant cmc<=1 f:modern bolt');
    expect(q.or).toHaveLength(1);
    const f = q.or[0]!;
    expect(f.colors).toEqual({ mode: 'contains', values: ['R'] });
    expect(f.typeIncludes).toEqual(['instant']);
    expect(f.cmc).toEqual([{ op: '<=', value: 1 }]);
    expect(f.legalIn).toBe('modern');
    expect(f.nameIncludes).toEqual(['bolt']);
  });

  it('parses identity and quoted phrases', () => {
    const q = parseQuery('id:wu "mob boss"');
    expect(q.or[0]!.colorIdentityWithin).toEqual(['W', 'U']);
    expect(q.or[0]!.nameIncludes).toEqual(['mob boss']);
  });

  it('supports negation, keywords, and power/toughness', () => {
    const q = parseQuery('-t:creature kw:flying pow>=3 tou<5');
    const f = q.or[0]!;
    expect(f.typeExcludes).toEqual(['creature']);
    expect(f.keywords).toEqual(['flying']);
    expect(f.power).toEqual([{ op: '>=', value: 3 }]);
    expect(f.toughness).toEqual([{ op: '<', value: 5 }]);
  });

  it('splits top-level OR into multiple clauses', () => {
    const q = parseQuery('t:goblin or kw:flying');
    expect(q.or).toHaveLength(2);
    expect(q.or[0]!.typeIncludes).toEqual(['goblin']);
    expect(q.or[1]!.keywords).toEqual(['flying']);
  });
});

describe('cardMatchesQuery', () => {
  it('matches on color + type + cmc', () => {
    const q = parseQuery('c:r t:instant cmc<=1');
    expect(cardMatchesQuery(CARDS.lightningBolt, q)).toBe(true);
    expect(cardMatchesQuery(CARDS.counterspell, q)).toBe(false);
    expect(cardMatchesQuery(CARDS.krenko, q)).toBe(false);
  });

  it('honors negation', () => {
    const q = parseQuery('-t:creature'); // exclude creatures
    expect(cardMatchesQuery(CARDS.lightningBolt, q)).toBe(true);
    expect(cardMatchesQuery(CARDS.krenko, q)).toBe(false);
  });

  it('matches keywords and power/toughness', () => {
    expect(cardMatchesQuery(CARDS.serraAngel, parseQuery('kw:flying'))).toBe(true);
    expect(cardMatchesQuery(CARDS.krenko, parseQuery('kw:flying'))).toBe(false);
    expect(cardMatchesQuery(CARDS.serraAngel, parseQuery('pow>=4 tou>=4'))).toBe(true);
    expect(cardMatchesQuery(CARDS.krenko, parseQuery('pow>=4'))).toBe(false);
  });

  it('OR matches if either clause matches', () => {
    const q = parseQuery('t:goblin or kw:flying');
    expect(cardMatchesQuery(CARDS.krenko, q)).toBe(true); // goblin
    expect(cardMatchesQuery(CARDS.serraAngel, q)).toBe(true); // flying
    expect(cardMatchesQuery(CARDS.counterspell, q)).toBe(false);
  });

  it('respects format legality and identity', () => {
    expect(cardMatchesQuery(CARDS.lightningBolt, parseQuery('f:modern'))).toBe(true);
    expect(cardMatchesQuery(CARDS.solRing, parseQuery('f:modern'))).toBe(false); // banned
    expect(cardMatchesQuery(CARDS.lightningBolt, parseQuery('id:r'))).toBe(true);
    expect(cardMatchesQuery(CARDS.counterspell, parseQuery('id:r'))).toBe(false);
  });
});
