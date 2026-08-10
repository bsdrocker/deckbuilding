import { describe, expect, it } from 'vitest';
import { computeBracket } from './brackets.js';
import { CARDS, deckCard, makeCard } from './fixtures.js';
import type { DeckData } from './types.js';

const gc = (name: string, oracleId: string) =>
  makeCard({ oracleId, name, typeLine: 'Artifact' });

const commanderDeck = (cards: DeckData['cards']): DeckData => ({
  format: 'commander',
  cards: [deckCard(CARDS.krenko, 1, 'command'), ...cards],
});

describe('computeBracket', () => {
  it('returns null for non-commander formats', () => {
    const deck: DeckData = { format: 'modern', cards: [deckCard(gc('Demonic Tutor', 'dt'), 1)] };
    expect(computeBracket(deck)).toBeNull();
  });

  it('suggests Bracket 2 when nothing is flagged', () => {
    const res = computeBracket(commanderDeck([deckCard(CARDS.lightningBolt, 1)]))!;
    expect(res.suggested).toBe(2);
    expect(res.gameChangers).toEqual([]);
    expect(res.massLandDenial).toEqual([]);
    expect(res.extraTurns).toEqual([]);
    expect(res.caveats.length).toBeGreaterThan(0);
  });

  it('suggests Bracket 3 for one to three Game Changers', () => {
    const res = computeBracket(commanderDeck([
      deckCard(gc('Demonic Tutor', 'dt'), 1),
      deckCard(gc('Rhystic Study', 'rs'), 1),
      deckCard(gc('The One Ring', 'or'), 1),
    ]))!;
    expect(res.suggested).toBe(3);
    expect(res.gameChangers).toHaveLength(3);
  });

  it('suggests Bracket 4 for four or more Game Changers', () => {
    const res = computeBracket(commanderDeck([
      deckCard(gc('Demonic Tutor', 'dt'), 1),
      deckCard(gc('Rhystic Study', 'rs'), 1),
      deckCard(gc('The One Ring', 'or'), 1),
      deckCard(gc('Mana Vault', 'mv'), 1),
    ]))!;
    expect(res.suggested).toBe(4);
  });

  it('suggests Bracket 4 for any mass land denial', () => {
    const res = computeBracket(commanderDeck([deckCard(gc('Armageddon', 'geddon'), 1)]))!;
    expect(res.suggested).toBe(4);
    expect(res.massLandDenial).toEqual(['Armageddon']);
  });

  it('treats three extra-turn cards as chaining (Bracket 4), two as fine', () => {
    const two = computeBracket(commanderDeck([
      deckCard(gc('Time Warp', 'tw'), 1),
      deckCard(gc('Temporal Manipulation', 'tm'), 1),
    ]))!;
    expect(two.suggested).toBe(2);
    expect(two.extraTurns).toHaveLength(2);

    const three = computeBracket(commanderDeck([
      deckCard(gc('Time Warp', 'tw'), 1),
      deckCard(gc('Temporal Manipulation', 'tm'), 1),
      deckCard(gc('Nexus of Fate', 'nf'), 1),
    ]))!;
    expect(three.suggested).toBe(4);
  });

  it('matches case-insensitively and by MDFC front face', () => {
    const res = computeBracket(commanderDeck([
      deckCard(gc('tergrid, god of fright', 'tergrid'), 1),
    ]))!;
    expect(res.gameChangers).toEqual(['tergrid, god of fright']);
    expect(res.suggested).toBe(3);
  });

  it('counts the command zone but ignores side/maybe boards', () => {
    const inCommand: DeckData = {
      format: 'commander',
      cards: [deckCard(gc('Tergrid, God of Fright // Tergrid\'s Lantern', 'tergrid'), 1, 'command')],
    };
    expect(computeBracket(inCommand)!.suggested).toBe(3);

    const parked: DeckData = {
      format: 'commander',
      cards: [
        deckCard(CARDS.krenko, 1, 'command'),
        deckCard(gc('Demonic Tutor', 'dt'), 1, 'maybeboard'),
        deckCard(gc('Armageddon', 'geddon'), 1, 'sideboard'),
      ],
    };
    expect(computeBracket(parked)!.suggested).toBe(2);
  });
});
