import { computeDeckStats, validateDeck, type DeckStats, type ValidationResult } from '@deck/core';
import type { PrismaClient } from '@deck/db';
import { loadDeck, toDeckData } from './deckData.js';
import { ServiceError } from './errors.js';

export interface DeckAnalysis {
  stats: DeckStats;
  validation: ValidationResult;
}

/** Compute deck statistics and format-legality validation together. */
export async function analyzeDeck(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
): Promise<DeckAnalysis> {
  const deck = await loadDeck(prisma, deckId);
  if (!deck) throw new ServiceError('not_found', `No deck with id ${deckId}`);
  if (deck.userId !== userId && deck.visibility === 'private') {
    throw new ServiceError('forbidden', 'This deck is private.');
  }
  const deckData = await toDeckData(prisma, deck);
  return { stats: computeDeckStats(deckData), validation: validateDeck(deckData) };
}
