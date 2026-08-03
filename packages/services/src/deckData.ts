import type { DeckData } from '@deck/core';
import type { Prisma, PrismaClient } from '@deck/db';
import { representativePrices } from './prices.js';

export type DeckWithCards = Prisma.DeckGetPayload<{
  include: { cards: { include: { oracle: true } } };
}>;

/** Load a deck with its cards + oracle rows. */
export async function loadDeck(
  prisma: PrismaClient,
  deckId: string,
): Promise<DeckWithCards | null> {
  return prisma.deck.findUnique({
    where: { id: deckId },
    include: { cards: { include: { oracle: true } } },
  });
}

/** Convert a loaded deck into the core DeckData (with prices attached). */
export async function toDeckData(prisma: PrismaClient, deck: DeckWithCards): Promise<DeckData> {
  const oracleIds = deck.cards.map((c) => c.oracleId);
  const prices = await representativePrices(prisma, oracleIds);

  return {
    format: deck.format,
    cards: deck.cards.map((dc) => ({
      oracleId: dc.oracleId,
      quantity: dc.quantity,
      board: dc.board,
      card: {
        oracleId: dc.oracle.oracleId,
        name: dc.oracle.name,
        manaCost: dc.oracle.manaCost,
        cmc: dc.oracle.cmc,
        typeLine: dc.oracle.typeLine,
        oracleText: dc.oracle.oracleText,
        colors: dc.oracle.colors,
        colorIdentity: dc.oracle.colorIdentity,
        keywords: dc.oracle.keywords,
        legalities: (dc.oracle.legalities ?? {}) as Record<string, string>,
        priceUsd: prices.get(dc.oracleId) ?? null,
      },
    })),
  };
}
