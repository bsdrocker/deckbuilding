import { getCardById, getCardByName, searchCards } from '@deck/services';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export async function registerCardRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/cards',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['cards'],
        summary: 'Search cards with a Scryfall-subset query (c:, id:, t:, o:, cmc, f:, name).',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          q: z.string().default(''),
          limit: z.coerce.number().int().min(1).max(175).default(25),
          offset: z.coerce.number().int().min(0).default(0),
          orderBy: z.enum(['name', 'cmc', 'edhrec']).default('name'),
        }),
      },
    },
    async (req) => {
      const { q, limit, offset, orderBy } = req.query;
      return searchCards(app.prisma, q, { limit, offset, orderBy });
    },
  );

  r.get(
    '/cards/named',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['cards'],
        summary: 'Look up a single card by name (exact, then fuzzy).',
        security: [{ bearerAuth: [] }],
        querystring: z.object({ name: z.string().min(1) }),
      },
    },
    async (req) => getCardByName(app.prisma, req.query.name),
  );

  r.get(
    '/cards/:oracleId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['cards'],
        summary: 'Get a card (with recent printings) by oracle id.',
        security: [{ bearerAuth: [] }],
        params: z.object({ oracleId: z.string() }),
      },
    },
    async (req) => getCardById(app.prisma, req.params.oracleId),
  );
}
