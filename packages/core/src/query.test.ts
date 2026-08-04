import { describe, expect, it } from 'vitest';
import { cardMatchesQuery, parseQuery } from './query.js';
import { CARDS } from './fixtures.js';

describe('parseQuery', () => {
  it('parses colors, type, cmc, format, and name into a single clause', () => {
    const q = parseQuery('c:r t:instant cmc<=1 f:modern bolt');
    expect(q.or).toHaveLength(1);
    const f = q.or[0]!;
    expect(f.colors).toEqual({ op: '>=', values: ['R'] }); // c: means "contains"
    expect(f.typeIncludes).toEqual(['instant']);
    expect(f.cmc).toEqual([{ op: '<=', value: 1 }]);
    expect(f.legalIn).toBe('modern');
    expect(f.nameIncludes).toEqual(['bolt']);
  });

  it('parses identity (defaults to subset) and quoted phrases', () => {
    const q = parseQuery('id:wu "mob boss"');
    expect(q.or[0]!.colorIdentity).toEqual({ op: '<=', values: ['W', 'U'] });
    expect(q.or[0]!.nameIncludes).toEqual(['mob boss']);
  });

  it('parses color/identity comparison operators', () => {
    expect(parseQuery('id<=wb').or[0]!.colorIdentity).toEqual({ op: '<=', values: ['W', 'B'] });
    expect(parseQuery('id>=w').or[0]!.colorIdentity).toEqual({ op: '>=', values: ['W'] });
    expect(parseQuery('id=wu').or[0]!.colorIdentity).toEqual({ op: '=', values: ['W', 'U'] });
    expect(parseQuery('c<=wu').or[0]!.colors).toEqual({ op: '<=', values: ['W', 'U'] });
    expect(parseQuery('c!r').or[0]!.colors).toEqual({ op: '=', values: ['R'] });
  });

  it('supports negation, keywords, and power/toughness', () => {
    const q = parseQuery('-t:creature kw:flying pow>=3 tou<5');
    const f = q.or[0]!;
    expect(f.typeExcludes).toEqual(['creature']);
    expect(f.keywords).toEqual(['flying']);
    expect(f.power).toEqual([{ op: '>=', value: 3 }]);
    expect(f.toughness).toEqual([{ op: '<', value: 5 }]);
  });

  it('keeps a quoted phrase attached to its operator', () => {
    const q = parseQuery('o:"destroy all" t:creature');
    const f = q.or[0]!;
    expect(f.oracleIncludes).toEqual(['destroy all']);
    expect(f.typeIncludes).toEqual(['creature']);
  });

  it('supports negated quoted phrases and bare quoted names', () => {
    const q = parseQuery('-o:"draw a card" "mob boss"');
    const f = q.or[0]!;
    expect(f.oracleExcludes).toEqual(['draw a card']);
    expect(f.nameIncludes).toEqual(['mob boss']);
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

  it('evaluates identity comparison operators', () => {
    // id<=wb : identity within {W,B}
    const within = parseQuery('id<=wb');
    expect(cardMatchesQuery(CARDS.serraAngel, within)).toBe(true); // [W]
    expect(cardMatchesQuery(CARDS.solRing, within)).toBe(true); // colorless
    expect(cardMatchesQuery(CARDS.lightningBolt, within)).toBe(false); // [R]

    // id>=r : identity contains at least R
    const withR = parseQuery('id>=r');
    expect(cardMatchesQuery(CARDS.krenko, withR)).toBe(true); // [R]
    expect(cardMatchesQuery(CARDS.counterspell, withR)).toBe(false); // [U]

    // c<=wu : colors are a subset of {W,U}
    const colorsWU = parseQuery('c<=wu');
    expect(cardMatchesQuery(CARDS.counterspell, colorsWU)).toBe(true); // [U]
    expect(cardMatchesQuery(CARDS.solRing, colorsWU)).toBe(true); // colorless
    expect(cardMatchesQuery(CARDS.lightningBolt, colorsWU)).toBe(false); // [R]
  });
});
