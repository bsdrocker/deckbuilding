import { describe, expect, it } from 'vitest';
import { cardMatchesQuery, parseQuery } from './query.js';
import { CARDS, makeCard } from './fixtures.js';

const m = (q: string) => (card: Parameters<typeof cardMatchesQuery>[0]) =>
  cardMatchesQuery(card, parseQuery(q));

describe('parseQuery structure', () => {
  it('builds an AND of terms for a plain query', () => {
    const { root } = parseQuery('c:r t:instant');
    expect(root.op).toBe('and');
  });
  it('an empty query matches everything', () => {
    expect(cardMatchesQuery(CARDS.krenko, parseQuery(''))).toBe(true);
  });
});

describe('cardMatchesQuery — atoms', () => {
  it('matches color + type + cmc', () => {
    const q = m('c:r t:instant cmc<=1');
    expect(q(CARDS.lightningBolt)).toBe(true);
    expect(q(CARDS.counterspell)).toBe(false);
    expect(q(CARDS.krenko)).toBe(false);
  });

  it('honors negation (attached and standalone)', () => {
    expect(m('-t:creature')(CARDS.lightningBolt)).toBe(true);
    expect(m('-t:creature')(CARDS.krenko)).toBe(false);
    expect(m('not t:creature')(CARDS.krenko)).toBe(false);
  });

  it('matches keywords and power/toughness', () => {
    expect(m('kw:flying')(CARDS.serraAngel)).toBe(true);
    expect(m('kw:flying')(CARDS.krenko)).toBe(false);
    expect(m('pow>=4 tou>=4')(CARDS.serraAngel)).toBe(true);
    expect(m('pow>=4')(CARDS.krenko)).toBe(false);
  });

  it('keeps quoted phrases attached to operators', () => {
    const goblins = makeCard({
      oracleId: 'x', name: 'Krenko, Mob Boss', typeLine: 'Legendary Creature — Goblin',
      oracleText: 'Tap: Create X 1/1 red Goblin creature tokens.', colors: ['R'], colorIdentity: ['R'],
    });
    expect(m('o:"goblin creature tokens"')(goblins)).toBe(true);
    expect(m('o:"destroy all"')(goblins)).toBe(false);
  });
});

describe('cardMatchesQuery — color/identity operators', () => {
  it('subset / superset', () => {
    expect(m('id<=wb')(CARDS.serraAngel)).toBe(true); // [W]
    expect(m('id<=wb')(CARDS.lightningBolt)).toBe(false); // [R]
    expect(m('id>=r')(CARDS.krenko)).toBe(true);
    expect(m('c<=wu')(CARDS.counterspell)).toBe(true); // [U]
    expect(m('c<=wu')(CARDS.lightningBolt)).toBe(false);
  });
});

describe('cardMatchesQuery — boolean grammar', () => {
  it('or combines clauses', () => {
    const q = m('t:goblin or kw:flying');
    expect(q(CARDS.krenko)).toBe(true); // goblin
    expect(q(CARDS.serraAngel)).toBe(true); // flying
    expect(q(CARDS.counterspell)).toBe(false);
  });

  it('respects parenthesised grouping and precedence', () => {
    // (goblin or angel) AND red  → Krenko yes, Serra Angel (white) no
    const q = m('(t:goblin or t:angel) c:r');
    expect(q(CARDS.krenko)).toBe(true);
    expect(q(CARDS.serraAngel)).toBe(false);
    // Without grouping, AND binds tighter: t:goblin OR (t:angel AND c:r)
    const q2 = m('t:goblin or t:angel c:r');
    expect(q2(CARDS.krenko)).toBe(true); // goblin
    expect(q2(CARDS.serraAngel)).toBe(false); // angel but not red
  });

  it('negates a whole group', () => {
    const q = m('c:r -(t:creature)');
    expect(q(CARDS.lightningBolt)).toBe(true); // red, not a creature
    expect(q(CARDS.krenko)).toBe(false); // red creature
  });
});

describe('cardMatchesQuery — is: and legality', () => {
  it('is:commander matches legendary creatures', () => {
    expect(m('is:commander')(CARDS.krenko)).toBe(true); // Legendary Creature
    expect(m('is:commander')(CARDS.lightningBolt)).toBe(false);
  });
  it('is:permanent excludes instants/sorceries', () => {
    expect(m('is:permanent')(CARDS.krenko)).toBe(true);
    expect(m('is:permanent')(CARDS.lightningBolt)).toBe(false); // instant
  });
  it('respects format legality', () => {
    expect(m('f:modern')(CARDS.lightningBolt)).toBe(true);
    expect(m('f:modern')(CARDS.solRing)).toBe(false); // banned
  });
});
