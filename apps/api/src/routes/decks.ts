import {
  addCardsToDeck,
  analyzeDeck,
  createDeck,
  deckInventoryDiff,
  deleteDeck,
  getDeck,
  importDeck,
  listDecks,
  parseDecklist,
  removeDeckCard,
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
        }),
      },
    },
    async (req) => {
      const updated = await updateDeckCard(app.prisma, req.params.id, req.user!.id, req.params.cardId, req.body);
      return updated ?? { removed: true };
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
