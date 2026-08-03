import {
  createApiKey,
  listApiKeys,
  loginUser,
  registerUser,
  revokeApiKey,
} from '@deck/services';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export async function registerAuthRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/auth/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Register a new user and receive an initial API key.',
        body: z.object({
          email: z.string().email(),
          handle: z.string().min(2).max(40),
          password: z.string().min(8),
        }),
      },
    },
    async (req) => {
      const { user, apiKey } = await registerUser(app.prisma, req.body);
      return { user, apiKey };
    },
  );

  r.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Log in with email/password and receive a fresh API key.',
        body: z.object({ email: z.string().email(), password: z.string() }),
      },
    },
    async (req) => {
      const { user, apiKey } = await loginUser(app.prisma, req.body.email, req.body.password);
      return { user, apiKey };
    },
  );

  r.get(
    '/keys',
    { preHandler: app.authenticate, schema: { tags: ['auth'], summary: 'List your API keys.', security: [{ bearerAuth: [] }] } },
    async (req) => ({ keys: await listApiKeys(app.prisma, req.user!.id) }),
  );

  r.post(
    '/keys',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: 'Create a new API key.',
        security: [{ bearerAuth: [] }],
        body: z.object({ name: z.string().min(1).max(60) }),
      },
    },
    async (req) => createApiKey(app.prisma, req.user!.id, req.body.name),
  );

  r.delete(
    '/keys/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: 'Revoke an API key.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
      },
    },
    async (req, reply) => {
      await revokeApiKey(app.prisma, req.user!.id, req.params.id);
      return reply.code(204).send();
    },
  );
}
