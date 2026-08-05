import { computeDeckStats, validateDeck } from '@deck/core';
import type { DeckFormat, Prisma, PrismaClient } from '@deck/db';
import type { DeckAnalysis } from './analysis.js';
import { loadDeckByShareId, toDeckData, type PublicDeck } from './deckData.js';
import { ServiceError } from './errors.js';

/**
 * Public-facing projection of a deck. Deliberately omits the owner's userId and
 * anything inventory-related — only the author's public handle is exposed.
 */
function toPublicView(deck: PublicDeck) {
  const { userId: _userId, user, ...rest } = deck;
  return { ...rest, authorHandle: user.handle };
}

export type PublicDeckView = ReturnType<typeof toPublicView>;

/** A deck is publicly readable when it is not private (public or unlisted). */
function assertPublic(deck: PublicDeck | null): asserts deck is PublicDeck {
  // 404 (not 403) for private/missing so we never reveal that a private deck exists.
  if (!deck || deck.visibility === 'private') {
    throw new ServiceError('not_found', 'Deck not found.');
  }
}

/** Read a shared deck by its share handle (public or unlisted only). */
export async function getPublicDeck(prisma: PrismaClient, shareId: string): Promise<PublicDeckView> {
  const deck = await loadDeckByShareId(prisma, shareId);
  assertPublic(deck);
  return toPublicView(deck);
}

/** Stats + legality for a shared deck (no inventory data). */
export async function analyzePublicDeck(prisma: PrismaClient, shareId: string): Promise<DeckAnalysis> {
  const deck = await loadDeckByShareId(prisma, shareId);
  assertPublic(deck);
  const deckData = await toDeckData(prisma, deck);
  return { stats: computeDeckStats(deckData), validation: validateDeck(deckData) };
}

export interface PublicBrowseOptions {
  format?: DeckFormat;
  colors?: string[];
  q?: string;
  sort?: 'recent' | 'name';
  limit?: number;
  offset?: number;
}

export interface PublicDeckSummary {
  shareId: string;
  name: string;
  format: DeckFormat;
  colorIdentity: string[];
  status: string;
  cardCount: number;
  updatedAt: Date;
  authorHandle: string;
}

function summarize(deck: {
  shareId: string;
  name: string;
  format: DeckFormat;
  colorIdentity: string[];
  status: string;
  updatedAt: Date;
  user: { handle: string };
  cards: { quantity: number; board: string }[];
}): PublicDeckSummary {
  return {
    shareId: deck.shareId,
    name: deck.name,
    format: deck.format,
    colorIdentity: deck.colorIdentity,
    status: deck.status,
    updatedAt: deck.updatedAt,
    authorHandle: deck.user.handle,
    cardCount: deck.cards
      .filter((c) => c.board === 'mainboard' || c.board === 'command')
      .reduce((sum, c) => sum + c.quantity, 0),
  };
}

/** Browse only *public* decks (unlisted decks stay reachable by link only). */
export async function listPublicDecks(
  prisma: PrismaClient,
  opts: PublicBrowseOptions = {},
): Promise<{ total: number; decks: PublicDeckSummary[] }> {
  const where: Prisma.DeckWhereInput = {
    visibility: 'public',
    ...(opts.format ? { format: opts.format } : {}),
    ...(opts.colors?.length ? { colorIdentity: { hasEvery: opts.colors } } : {}),
    ...(opts.q ? { name: { contains: opts.q, mode: 'insensitive' as const } } : {}),
  };
  const orderBy: Prisma.DeckOrderByWithRelationInput =
    opts.sort === 'name' ? { name: 'asc' } : { updatedAt: 'desc' };
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);

  const [total, decks] = await Promise.all([
    prisma.deck.count({ where }),
    prisma.deck.findMany({
      where,
      orderBy,
      take: limit,
      skip: opts.offset ?? 0,
      include: { user: { select: { handle: true } }, cards: { select: { quantity: true, board: true } } },
    }),
  ]);
  return { total, decks: decks.map(summarize) };
}

/**
 * Copy a shared deck (by share id) into `userId`'s account as a new private
 * deck. The source must be readable by the caller — public/unlisted, or their
 * own. The clone always starts private, so copying never re-shares by accident.
 */
export async function cloneDeck(
  prisma: PrismaClient,
  userId: string,
  shareId: string,
): Promise<{ id: string; name: string }> {
  const source = await loadDeckByShareId(prisma, shareId);
  if (!source || (source.visibility === 'private' && source.userId !== userId)) {
    throw new ServiceError('not_found', 'Deck not found.');
  }

  return prisma.$transaction(async (tx) => {
    const clone = await tx.deck.create({
      data: {
        userId,
        name: `${source.name} (copy)`,
        format: source.format,
        description: source.description,
        primer: source.primer,
        visibility: 'private',
        status: 'brewing',
        colorIdentity: source.colorIdentity,
        commanderOracleId: source.commanderOracleId,
      },
    });
    if (source.cards.length) {
      await tx.deckCard.createMany({
        data: source.cards.map((c) => ({
          deckId: clone.id,
          oracleId: c.oracleId,
          printingId: c.printingId,
          quantity: c.quantity,
          board: c.board,
          categories: c.categories,
        })),
      });
    }
    return { id: clone.id, name: clone.name };
  });
}

/** A specific user's public decks (their author page). */
export async function listUserPublicDecks(
  prisma: PrismaClient,
  handle: string,
): Promise<{ handle: string; decks: PublicDeckSummary[] }> {
  const user = await prisma.user.findUnique({ where: { handle }, select: { id: true, handle: true } });
  if (!user) throw new ServiceError('not_found', 'User not found.');
  const decks = await prisma.deck.findMany({
    where: { userId: user.id, visibility: 'public' },
    orderBy: { updatedAt: 'desc' },
    include: { user: { select: { handle: true } }, cards: { select: { quantity: true, board: true } } },
  });
  return { handle: user.handle, decks: decks.map(summarize) };
}
