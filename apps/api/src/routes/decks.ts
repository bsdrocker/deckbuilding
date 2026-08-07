import {
  addCardsToDeck,
  analyzeDeck,
  cloneDeck,
  createDeck,
  deckAvailability,
  deckInventoryDiff,
  deleteDeck,
  getDeck,
  importDeck,
  listDecks,
  parseDecklist,
  removeDeckCard,
  removeDeckCardBySelector,
  setDeckCardQuantity,
  updateDeck,
  updateDeckCard,
} from '@deck/services';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const FORMATS = [
  'commander', 'standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'brawl',
  'historic', 'explorer', 'oathbreaker', 'premodern', 'penny', 'duel', 'oldschool', 'limited', 'casual',
] as const;
const BOARDS = ['mainboard', 'sideboard', 'maybeboard', 'command'] as const;
const VISIBILITY = ['private', 'unlisted', 'public'] as const;
const STATUS = ['brewing', 'built'] as const;

const cardEntry = z.object({
  oracleId: z.string().optional(),
  name: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  board: z.enum(BOARDS).default('mainboard'),
  categories: z.array(z.string()).optional(),
});

export async function registerDeckRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/decks',
    { preHandler: app.authenticate, schema: { tags: ['decks'], summary: 'List your decks.', security: [{ bearerAuth: [] }] } },
    async (req) => ({ decks: await listDecks(app.prisma, req.user!.id) }),
  );

  r.post(
    '/decks',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Create a deck.',
        security: [{ bearerAuth: [] }],
        body: z.object({
          name: z.string().min(1),
          format: z.enum(FORMATS).default('commander'),
          description: z.string().optional(),
          visibility: z.enum(VISIBILITY).default('private'),
          status: z.enum(STATUS).optional(),
          primer: z.string().optional(),
        }),
      },
    },
    async (req, reply) => {
      const deck = await createDeck(app.prisma, req.user!.id, req.body);
      return reply.code(201).send(deck);
    },
  );

  r.post(
    '/decks/import',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Create a deck from a pasted decklist (Moxfield/Archidekt/MTGO text).',
        security: [{ bearerAuth: [] }],
        body: z.object({
          name: z.string().min(1),
          format: z.enum(FORMATS).default('commander'),
          visibility: z.enum(VISIBILITY).default('private'),
          list: z.string().min(1),
        }),
      },
    },
    async (req, reply) => {
      const entries = parseDecklist(req.body.list);
      const result = await importDeck(app.prisma, req.user!.id, {
        name: req.body.name,
        format: req.body.format,
        visibility: req.body.visibility,
        entries,
      });
      return reply.code(201).send(result);
    },
  );

  r.get(
    '/decks/:id',
    { preHandler: app.authenticate, schema: { tags: ['decks'], summary: 'Get a deck with its cards.', security: [{ bearerAuth: [] }], params: z.object({ id: z.string() }) } },
    async (req) => getDeck(app.prisma, req.params.id, req.user!.id),
  );

  r.post(
    '/decks/clone',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Copy a shared deck (by share id) into your account as a private deck.',
        security: [{ bearerAuth: [] }],
        body: z.object({ shareId: z.string().min(1) }),
      },
    },
    async (req, reply) => {
      const clone = await cloneDeck(app.prisma, req.user!.id, req.body.shareId);
      return reply.code(201).send(clone);
    },
  );

  r.patch(
    '/decks/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Update deck metadata.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().min(1).optional(),
          format: z.enum(FORMATS).optional(),
          description: z.string().optional(),
          visibility: z.enum(VISIBILITY).optional(),
          status: z.enum(STATUS).optional(),
          primer: z.string().optional(),
        }),
      },
    },
    async (req) => updateDeck(app.prisma, req.params.id, req.user!.id, req.body),
  );

  r.delete(
    '/decks/:id',
    { preHandler: app.authenticate, schema: { tags: ['decks'], summary: 'Delete a deck.', security: [{ bearerAuth: [] }], params: z.object({ id: z.string() }) } },
    async (req, reply) => {
      await deleteDeck(app.prisma, req.params.id, req.user!.id);
      return reply.code(204).send();
    },
  );

  r.post(
    '/decks/:id/cards',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Add cards to a deck (by oracleId or name).',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: z.object({ cards: z.array(cardEntry).min(1) }),
      },
    },
    async (req) => addCardsToDeck(app.prisma, req.params.id, req.user!.id, req.body.cards),
  );

  r.patch(
    '/decks/:id/cards/:cardId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Update a deck card (quantity 0 removes it).',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string(), cardId: z.string() }),
        body: z.object({
          quantity: z.number().int().min(0).optional(),
          board: z.enum(BOARDS).optional(),
          categories: z.array(z.string()).optional(),
          printingId: z.string().nullable().optional(),
          finish: z.enum(['nonfoil', 'foil', 'etched']).nullable().optional(),
        }),
      },
    },
    async (req) => {
      const updated = await updateDeckCard(app.prisma, req.params.id, req.user!.id, req.params.cardId, req.body);
      return updated ?? { removed: true };
    },
  );

  r.post(
    '/decks/:id/cards/set',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Set a card quantity by selector (name/oracleId/cardId + board). Upserts; 0 removes.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: z.object({
          quantity: z.number().int().min(0),
          name: z.string().optional(),
          oracleId: z.string().optional(),
          cardId: z.string().optional(),
          board: z.enum(BOARDS).optional(),
        }),
      },
    },
    async (req) => {
      const { quantity, ...selector } = req.body;
      const updated = await setDeckCardQuantity(app.prisma, req.params.id, req.user!.id, selector, quantity);
      return updated ?? { removed: true };
    },
  );

  r.post(
    '/decks/:id/cards/remove',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Remove a card by selector (name/oracleId/cardId + board).',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().optional(),
          oracleId: z.string().optional(),
          cardId: z.string().optional(),
          board: z.enum(BOARDS).optional(),
        }),
      },
    },
    async (req) => {
      await removeDeckCardBySelector(app.prisma, req.params.id, req.user!.id, req.body);
      return { removed: true };
    },
  );

  r.delete(
    '/decks/:id/cards/:cardId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Remove a card from a deck.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string(), cardId: z.string() }),
      },
    },
    async (req, reply) => {
      await removeDeckCard(app.prisma, req.params.id, req.user!.id, req.params.cardId);
      return reply.code(204).send();
    },
  );

  r.get(
    '/decks/:id/analysis',
    { preHandler: app.authenticate, schema: { tags: ['decks'], summary: 'Deck statistics + format legality.', security: [{ bearerAuth: [] }], params: z.object({ id: z.string() }) } },
    async (req) => analyzeDeck(app.prisma, req.params.id, req.user!.id),
  );

  r.get(
    '/decks/:id/availability',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'Per-card inventory availability (missing copies + pinned printing/finish status).',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => ({ cards: await deckAvailability(app.prisma, req.params.id, req.user!.id) }),
  );

  r.get(
    '/decks/:id/inventory-diff',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['decks'],
        summary: 'What the deck needs vs. what you own (owned/missing/cost).',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        querystring: z.object({ includeSideboard: z.coerce.boolean().default(false) }),
      },
    },
    async (req) =>
      deckInventoryDiff(app.prisma, req.params.id, req.user!.id, {
        includeSideboard: req.query.includeSideboard,
      }),
  );
}
