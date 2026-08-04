import type { Board, Color } from '@deck/core';
import type { DeckBoard, DeckFormat, PrismaClient } from '@deck/db';
import { resolveNames } from './cards.js';
import { loadDeck } from './deckData.js';
import { ServiceError } from './errors.js';

export interface CreateDeckInput {
  name: string;
  format?: DeckFormat;
  description?: string;
  visibility?: 'private' | 'unlisted' | 'public';
}

export interface CardEntryInput {
  /** Provide either an oracleId or a name (name is resolved case-insensitively). */
  oracleId?: string;
  name?: string;
  quantity?: number;
  board?: Board;
  categories?: string[];
}

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

/** Ensure the deck exists and belongs to the user; throws otherwise. */
async function assertOwnedDeck(prisma: PrismaClient, deckId: string, userId: string) {
  const deck = await prisma.deck.findUnique({ where: { id: deckId } });
  if (!deck) throw new ServiceError('not_found', `No deck with id ${deckId}`);
  if (deck.userId !== userId) throw new ServiceError('forbidden', 'You do not own this deck.');
  return deck;
}

export async function listDecks(prisma: PrismaClient, userId: string) {
  const decks = await prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { cards: { select: { quantity: true, board: true } } },
  });
  return decks.map(({ cards, ...deck }) => ({
    ...deck,
    // Total cards in the counted zone (mainboard + command) — sums quantities so
    // duplicate basics count fully. distinctCount is the number of unique entries.
    cardCount: cards
      .filter((c) => c.board === 'mainboard' || c.board === 'command')
      .reduce((sum, c) => sum + c.quantity, 0),
    distinctCount: cards.length,
  }));
}

export async function getDeck(prisma: PrismaClient, deckId: string, userId: string) {
  const deck = await loadDeck(prisma, deckId);
  if (!deck) throw new ServiceError('not_found', `No deck with id ${deckId}`);
  if (deck.userId !== userId && deck.visibility === 'private') {
    throw new ServiceError('forbidden', 'This deck is private.');
  }
  return deck;
}

export async function createDeck(prisma: PrismaClient, userId: string, input: CreateDeckInput) {
  if (!input.name?.trim()) throw new ServiceError('bad_request', 'Deck name is required.');
  return prisma.deck.create({
    data: {
      userId,
      name: input.name.trim(),
      format: input.format ?? 'commander',
      description: input.description ?? '',
      visibility: input.visibility ?? 'private',
    },
  });
}

export async function updateDeck(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
  patch: Partial<CreateDeckInput>,
) {
  await assertOwnedDeck(prisma, deckId, userId);
  return prisma.deck.update({
    where: { id: deckId },
    data: {
      name: patch.name?.trim(),
      format: patch.format,
      description: patch.description,
      visibility: patch.visibility,
    },
  });
}

export async function deleteDeck(prisma: PrismaClient, deckId: string, userId: string) {
  await assertOwnedDeck(prisma, deckId, userId);
  await prisma.deck.delete({ where: { id: deckId } });
}

/** Recompute and persist a deck's derived color identity from its cards. */
async function refreshColorIdentity(prisma: PrismaClient, deckId: string) {
  const cards = await prisma.deckCard.findMany({
    where: { deckId },
    include: { oracle: { select: { colorIdentity: true } } },
  });
  const set = new Set<string>();
  for (const c of cards) for (const ci of c.oracle.colorIdentity) set.add(ci);
  const commanderOracleId = cards.find((c) => c.board === 'command')?.oracleId ?? null;
  await prisma.deck.update({
    where: { id: deckId },
    data: { colorIdentity: COLORS.filter((c) => set.has(c)), commanderOracleId },
  });
}

export interface AddCardsResult {
  added: number;
  unresolved: string[];
}

/**
 * Add cards to a deck. Each entry may specify an oracleId or a name; quantities
 * on an existing (deck, card, board) row are incremented.
 */
export async function addCardsToDeck(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
  entries: CardEntryInput[],
): Promise<AddCardsResult> {
  await assertOwnedDeck(prisma, deckId, userId);

  // Resolve any name-only entries in one batch.
  const namesToResolve = entries.filter((e) => !e.oracleId && e.name).map((e) => e.name!);
  const { resolved, unresolved } = await resolveNames(prisma, namesToResolve);

  let added = 0;
  for (const entry of entries) {
    let oracleId = entry.oracleId;
    if (!oracleId && entry.name) oracleId = resolved.get(entry.name.trim())?.oracleId;
    if (!oracleId) continue;

    const quantity = entry.quantity ?? 1;
    const board = (entry.board ?? 'mainboard') as DeckBoard;
    await prisma.deckCard.upsert({
      where: { deckId_oracleId_board: { deckId, oracleId, board } },
      create: { deckId, oracleId, board, quantity, categories: entry.categories ?? [] },
      update: {
        quantity: { increment: quantity },
        ...(entry.categories ? { categories: entry.categories } : {}),
      },
    });
    added += 1;
  }

  await refreshColorIdentity(prisma, deckId);
  return { added, unresolved };
}

export interface UpdateCardInput {
  quantity?: number;
  board?: Board;
  categories?: string[];
  /** Preferred printing (art). null clears it; must belong to the same oracle. */
  printingId?: string | null;
}

export async function updateDeckCard(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
  deckCardId: string,
  patch: UpdateCardInput,
) {
  await assertOwnedDeck(prisma, deckId, userId);
  const existing = await prisma.deckCard.findUnique({ where: { id: deckCardId } });
  if (!existing || existing.deckId !== deckId) {
    throw new ServiceError('not_found', 'Card not found in this deck.');
  }
  if (patch.quantity !== undefined && patch.quantity <= 0) {
    await prisma.deckCard.delete({ where: { id: deckCardId } });
    await refreshColorIdentity(prisma, deckId);
    return null;
  }

  // Validate a preferred printing belongs to this card's oracle before setting.
  if (patch.printingId) {
    const printing = await prisma.cardPrinting.findUnique({
      where: { scryfallId: patch.printingId },
      select: { oracleId: true },
    });
    if (!printing || printing.oracleId !== existing.oracleId) {
      throw new ServiceError('bad_request', 'That printing does not belong to this card.');
    }
  }

  const updated = await prisma.deckCard.update({
    where: { id: deckCardId },
    data: {
      quantity: patch.quantity,
      board: patch.board as DeckBoard | undefined,
      categories: patch.categories,
      // undefined = leave unchanged; null = clear the preferred printing.
      printingId: patch.printingId === undefined ? undefined : patch.printingId,
    },
  });
  await refreshColorIdentity(prisma, deckId);
  return updated;
}

export async function removeDeckCard(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
  deckCardId: string,
) {
  await assertOwnedDeck(prisma, deckId, userId);
  const existing = await prisma.deckCard.findUnique({ where: { id: deckCardId } });
  if (!existing || existing.deckId !== deckId) {
    throw new ServiceError('not_found', 'Card not found in this deck.');
  }
  await prisma.deckCard.delete({ where: { id: deckCardId } });
  await refreshColorIdentity(prisma, deckId);
}

export interface ImportDeckInput extends CreateDeckInput {
  entries: { quantity: number; name: string; board: Board }[];
}

/** Create a deck and populate it from parsed decklist entries. */
export async function importDeck(
  prisma: PrismaClient,
  userId: string,
  input: ImportDeckInput,
): Promise<{ deckId: string; added: number; unresolved: string[] }> {
  const deck = await createDeck(prisma, userId, input);
  const result = await addCardsToDeck(
    prisma,
    deck.id,
    userId,
    input.entries.map((e) => ({ name: e.name, quantity: e.quantity, board: e.board })),
  );
  return { deckId: deck.id, added: result.added, unresolved: result.unresolved };
}
