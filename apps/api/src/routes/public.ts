import {
  analyzePublicDeck,
  getPublicDeck,
  listPublicDecks,
  listUserPublicDecks,
} from '@deck/services';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const FORMATS = [
  'commander', 'standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'brawl',
  'historic', 'explorer', 'oathbreaker', 'premodern', 'penny', 'duel', 'oldschool', 'limited', 'casual',
] as const;
const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;

/**
 * Public, unauthenticated read access to shared decks. Only public/unlisted
 * decks are reachable here; private decks 404. No inventory data is ever
 * returned. Browse (`GET /public/decks`) lists public decks only — unlisted
 * decks stay reachable by their share link alone.
 */
export async function registerPublicRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/public/decks',
    {
      schema: {
        tags: ['public'],
        summary: 'Browse public decks.',
        querystring: z.object({
          format: z.enum(FORMATS).optional(),
          colors: z
            .union([z.enum(COLORS), z.array(z.enum(COLORS))])
            .optional()
            .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
          q: z.string().optional(),
          sort: z.enum(['recent', 'name']).default('recent'),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (req) => listPublicDecks(app.prisma, req.query),
  );

  r.get(
    '/public/users/:handle/decks',
    {
      schema: {
        tags: ['public'],
        summary: "A user's public decks.",
        params: z.object({ handle: z.string().min(1) }),
      },
    },
    async (req) => listUserPublicDecks(app.prisma, req.params.handle),
  );

  r.get(
    '/public/decks/:shareId',
    {
      schema: {
        tags: ['public'],
        summary: 'Read a shared deck (public or unlisted) by its share id.',
        params: z.object({ shareId: z.string().min(1) }),
      },
    },
    async (req) => getPublicDeck(app.prisma, req.params.shareId),
  );

  r.get(
    '/public/decks/:shareId/analysis',
    {
      schema: {
        tags: ['public'],
        summary: 'Stats + legality for a shared deck.',
        params: z.object({ shareId: z.string().min(1) }),
      },
    },
    async (req) => analyzePublicDeck(app.prisma, req.params.shareId),
  );
}
