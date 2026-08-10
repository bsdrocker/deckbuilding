import type { Board, Color } from '@deck/core';
import type { DeckBoard, DeckFormat, DeckStatus, PrismaClient } from '@deck/db';
import { printingRefKey, resolveNames, resolvePrintingRefs } from './cards.js';
import { loadDeck } from './deckData.js';
import { ServiceError } from './errors.js';
import { cheapestPrintings } from './prices.js';

export interface CreateDeckInput {
  name: string;
  format?: DeckFormat;
  description?: string;
  visibility?: 'private' | 'unlisted' | 'public';
  status?: DeckStatus;
  primer?: string;
}

export interface CardEntryInput {
  /** Provide either an oracleId or a name (name is resolved case-insensitively). */
  oracleId?: string;
  name?: string;
  quantity?: number;
  board?: Board;
  categories?: string[];
  /** Optional "(SET) collector#" hint; resolved to a printing before the name. */
  setCode?: string;
  collectorNumber?: string;
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
      status: input.status ?? 'brewing',
      primer: input.primer ?? '',
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
      status: patch.status,
      primer: patch.primer,
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
 * Default printing per oracle for newly added deck cards: the printing the
 * user owns the most copies of, else the cheapest known printing. Oracles with
 * neither are absent from the map (printingId stays null → newest-printing
 * display, as before).
 */
async function defaultPrintingIds(
  prisma: PrismaClient,
  userId: string,
  oracleIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (oracleIds.length === 0) return out;

  const items = await prisma.inventoryItem.findMany({
    where: { userId, printing: { oracleId: { in: oracleIds } } },
    select: { printingId: true, quantity: true, printing: { select: { oracleId: true } } },
  });
  const ownedQty = new Map<string, Map<string, number>>(); // oracleId -> printingId -> qty
  for (const it of items) {
    const per = ownedQty.get(it.printing.oracleId) ?? new Map<string, number>();
    per.set(it.printingId, (per.get(it.printingId) ?? 0) + it.quantity);
    ownedQty.set(it.printing.oracleId, per);
  }
  for (const [oracleId, per] of ownedQty) {
    // Most-owned printing; ties break on printingId so the pick is deterministic.
    const best = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
    out.set(oracleId, best[0]);
  }

  const unowned = oracleIds.filter((id) => !out.has(id));
  const cheapest = await cheapestPrintings(prisma, unowned);
  for (const [oracleId, c] of cheapest) out.set(oracleId, c.printingId);

  return out;
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

  // Resolve in two batches: exact printings (set+collector) take precedence over
  // names, so flavor-named reprints resolve even when the printed name isn't the
  // oracle name (e.g. Secret Lair "Adamantium Bonding Tank" = The Ozolith).
  const printingRefs = entries
    .filter((e) => !e.oracleId && e.setCode && e.collectorNumber)
    .map((e) => ({ setCode: e.setCode!, collectorNumber: e.collectorNumber! }));
  const byPrinting = await resolvePrintingRefs(prisma, printingRefs);

  const namesToResolve = entries.filter((e) => !e.oracleId && e.name).map((e) => e.name!);
  const { resolved } = await resolveNames(prisma, namesToResolve);

  const unresolved: string[] = [];
  const toAdd: { entry: CardEntryInput; oracleId: string; explicitPrintingId: string | null }[] = [];
  for (const entry of entries) {
    let oracleId = entry.oracleId;
    let explicitPrintingId: string | null = null;
    if (!oracleId && entry.setCode && entry.collectorNumber) {
      const hit = byPrinting.get(printingRefKey(entry.setCode, entry.collectorNumber));
      oracleId = hit?.oracle.oracleId;
      explicitPrintingId = hit?.printingId ?? null;
    }
    if (!oracleId && entry.name) oracleId = resolved.get(entry.name.trim())?.oracleId;
    if (!oracleId) {
      if (entry.name) {
        const suffix = entry.setCode ? ` (${entry.setCode}${entry.collectorNumber ? ' ' + entry.collectorNumber : ''})` : '';
        unresolved.push(`${entry.name}${suffix}`);
      }
      continue;
    }
    toAdd.push({ entry, oracleId, explicitPrintingId });
  }

  // Entries without an explicit printing get an owned-else-cheapest default,
  // so new deck cards show art (and price) the user actually has. Applied on
  // create only — re-adding a card never retargets an existing row's printing.
  const defaults = await defaultPrintingIds(
    prisma,
    userId,
    [...new Set(toAdd.filter((t) => !t.explicitPrintingId).map((t) => t.oracleId))],
  );

  let added = 0;
  for (const { entry, oracleId, explicitPrintingId } of toAdd) {
    const quantity = entry.quantity ?? 1;
    const board = (entry.board ?? 'mainboard') as DeckBoard;
    await prisma.deckCard.upsert({
      where: { deckId_oracleId_board: { deckId, oracleId, board } },
      create: {
        deckId,
        oracleId,
        board,
        quantity,
        categories: entry.categories ?? [],
        printingId: explicitPrintingId ?? defaults.get(oracleId) ?? null,
      },
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
  /** Preferred finish (nonfoil|foil|etched). null clears it. */
  finish?: string | null;
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
      // undefined = leave unchanged; null = clear the preferred printing/finish.
      printingId: patch.printingId === undefined ? undefined : patch.printingId,
      finish: patch.finish === undefined ? undefined : patch.finish,
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

export interface DeckCardSelector {
  /** Directly by deck-card id, or by oracleId / name (+ optional board). */
  cardId?: string;
  oracleId?: string;
  name?: string;
  board?: Board;
}

/**
 * Resolve a {@link DeckCardSelector} to a concrete deck-card id. When a card
 * exists on multiple boards and no board is given, prefers mainboard, then
 * command. Returns null if nothing matches.
 */
export async function resolveDeckCardId(
  prisma: PrismaClient,
  deckId: string,
  selector: DeckCardSelector,
): Promise<string | null> {
  if (selector.cardId) return selector.cardId;

  let oracleId = selector.oracleId;
  if (!oracleId && selector.name) {
    const { resolved } = await resolveNames(prisma, [selector.name]);
    oracleId = resolved.get(selector.name.trim())?.oracleId;
  }
  if (!oracleId) return null;

  const matches = await prisma.deckCard.findMany({
    where: { deckId, oracleId, ...(selector.board ? { board: selector.board as DeckBoard } : {}) },
  });
  if (matches.length === 0) return null;
  if (matches.length === 1 || selector.board) return matches[0]!.id;
  const preferred =
    matches.find((c) => c.board === 'mainboard') ?? matches.find((c) => c.board === 'command');
  return (preferred ?? matches[0]!).id;
}

/**
 * Set a deck card's exact quantity, selecting by id/oracle/name.
 * Upserts: if the card isn't in the deck yet and quantity >= 1, it is added
 * (so this tool works for swaps). Quantity 0 removes it (or is a no-op if absent).
 */
export async function setDeckCardQuantity(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
  selector: DeckCardSelector,
  quantity: number,
) {
  const cardId = await resolveDeckCardId(prisma, deckId, selector);
  if (cardId) {
    return updateDeckCard(prisma, deckId, userId, cardId, { quantity }); // 0 removes
  }

  // Not in the deck.
  await assertOwnedDeck(prisma, deckId, userId);
  if (quantity <= 0) return { action: 'noop', message: 'Card is not in the deck.' };
  if (!selector.name && !selector.oracleId) {
    throw new ServiceError('not_found', 'That card is not in this deck (provide a name or oracleId to add it).');
  }

  const board = (selector.board ?? 'mainboard') as Board;
  const result = await addCardsToDeck(prisma, deckId, userId, [
    { name: selector.name, oracleId: selector.oracleId, quantity, board },
  ]);
  if (result.added === 0) {
    throw new ServiceError('not_found', `Could not resolve a card to add for "${selector.name ?? selector.oracleId}".`);
  }
  return { action: 'added', quantity, board };
}

/** Remove a deck card, selecting by id/oracle/name. */
export async function removeDeckCardBySelector(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
  selector: DeckCardSelector,
) {
  const cardId = await resolveDeckCardId(prisma, deckId, selector);
  if (!cardId) throw new ServiceError('not_found', 'That card is not in this deck.');
  await removeDeckCard(prisma, deckId, userId, cardId);
}

export interface ImportDeckInput extends CreateDeckInput {
  entries: {
    quantity: number;
    name: string;
    board: Board;
    setCode?: string;
    collectorNumber?: string;
  }[];
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
    input.entries.map((e) => ({
      name: e.name,
      quantity: e.quantity,
      board: e.board,
      setCode: e.setCode,
      collectorNumber: e.collectorNumber,
    })),
  );
  return { deckId: deck.id, added: result.added, unresolved: result.unresolved };
}
