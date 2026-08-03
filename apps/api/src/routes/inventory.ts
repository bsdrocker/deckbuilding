import {
  addInventory,
  deleteInventoryItem,
  exportInventoryCsv,
  findOwnedOptions,
  importInventoryCsv,
  inventorySummary,
  inventoryValueBreakdown,
  listInventory,
  updateInventoryItem,
} from '@deck/services';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export async function registerInventoryRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/inventory',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['inventory'],
        summary: 'List your inventory items.',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(500).default(100),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (req) => ({ items: await listInventory(app.prisma, req.user!.id, req.query) }),
  );

  r.get(
    '/inventory/summary',
    { preHandler: app.authenticate, schema: { tags: ['inventory'], summary: 'Inventory totals and estimated value.', security: [{ bearerAuth: [] }] } },
    async (req) => inventorySummary(app.prisma, req.user!.id),
  );

  r.get(
    '/inventory/value',
    { preHandler: app.authenticate, schema: { tags: ['inventory'], summary: 'Collection value breakdown (finish-aware, top cards).', security: [{ bearerAuth: [] }] } },
    async (req) => inventoryValueBreakdown(app.prisma, req.user!.id),
  );

  r.get(
    '/inventory/export.csv',
    { preHandler: app.authenticate, schema: { tags: ['inventory'], summary: 'Export the collection as CSV.', security: [{ bearerAuth: [] }] } },
    async (req, reply) => {
      const csv = await exportInventoryCsv(app.prisma, req.user!.id);
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="collection.csv"')
        .send(csv);
    },
  );

  r.get(
    '/inventory/owned-options',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['inventory'],
        summary: 'Cards you already own that match a Scryfall-subset query (AI deckbuilding aid).',
        security: [{ bearerAuth: [] }],
        querystring: z.object({ q: z.string().default(''), limit: z.coerce.number().int().min(1).max(200).default(50) }),
      },
    },
    async (req) => ({
      options: await findOwnedOptions(app.prisma, req.user!.id, req.query.q, { limit: req.query.limit }),
    }),
  );

  r.post(
    '/inventory',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['inventory'],
        summary: 'Add a card printing to your inventory.',
        security: [{ bearerAuth: [] }],
        body: z.object({
          printingId: z.string(),
          quantity: z.number().int().min(1).default(1),
          finish: z.string().default('nonfoil'),
          condition: z.string().default('NM'),
          language: z.string().default('en'),
          tags: z.array(z.string()).optional(),
        }),
      },
    },
    async (req, reply) => {
      const item = await addInventory(app.prisma, req.user!.id, req.body);
      return reply.code(201).send(item);
    },
  );

  r.post(
    '/inventory/import',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['inventory'],
        summary: 'Bulk-import a collection CSV (ManaBox/Moxfield/Deckbox) into inventory.',
        security: [{ bearerAuth: [] }],
        body: z.object({ csv: z.string().min(1) }),
      },
    },
    async (req) => importInventoryCsv(app.prisma, req.user!.id, req.body.csv),
  );

  r.patch(
    '/inventory/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['inventory'],
        summary: 'Update an inventory item (quantity 0 removes it).',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: z.object({
          quantity: z.number().int().min(0).optional(),
          tags: z.array(z.string()).optional(),
          finish: z.string().optional(),
          condition: z.string().optional(),
          language: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const updated = await updateInventoryItem(app.prisma, req.user!.id, req.params.id, req.body);
      return updated ?? { removed: true };
    },
  );

  r.delete(
    '/inventory/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['inventory'],
        summary: 'Remove an inventory item.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
      },
    },
    async (req, reply) => {
      await deleteInventoryItem(app.prisma, req.user!.id, req.params.id);
      return reply.code(204).send();
    },
  );
}
