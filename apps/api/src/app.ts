import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { prisma, type PrismaClient } from '@deck/db';
import { authenticateApiKey, HTTP_STATUS, ServiceError, type AuthUser } from '@deck/services';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { loadEnv } from './env.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCardRoutes } from './routes/cards.js';
import { registerDeckRoutes } from './routes/decks.js';
import { registerInventoryRoutes } from './routes/inventory.js';

// Augment Fastify with our decorators.
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export type AppFastify = FastifyInstance & { withTypeProvider: never };

export async function buildApp(opts: { prismaClient?: PrismaClient } = {}): Promise<FastifyInstance> {
  const env = loadEnv();
  const db = opts.prismaClient ?? prisma;

  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Tolerate bodyless requests that still declare `content-type: application/json`
  // (common for DELETE from fetch-based clients): treat an empty body as no body
  // instead of failing with FST_ERR_CTP_EMPTY_JSON_BODY.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = body as string;
      if (text === undefined || text === null || text.trim() === '') {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch {
        const err = new Error('Invalid JSON body') as Error & { statusCode?: number };
        err.statusCode = 400;
        done(err, undefined);
      }
    },
  );

  app.decorate('prisma', db);

  // Bearer API-key authentication used as a per-route preHandler.
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const user = await authenticateApiKey(db, token);
    if (!user) {
      await reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid API key.' });
      return;
    }
    req.user = user;
  });

  await app.register(cors, { origin: env.corsOrigins.length ? env.corsOrigins : true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Deckbuilding API',
        description:
          'API-first MTG deck-building platform: cards, decks, inventory, and inventory-aware analysis.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key as a Bearer token.' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Consistent error mapping (ServiceError -> HTTP status; zod -> 400).
  app.setErrorHandler((err: Error & { validation?: unknown; statusCode?: number }, req, reply) => {
    if (err instanceof ServiceError) {
      return reply.code(HTTP_STATUS[err.code]).send({ error: err.code, message: err.message });
    }
    if (err.validation) {
      return reply.code(400).send({ error: 'bad_request', message: err.message });
    }
    req.log.error(err);
    const status = err.statusCode ?? 500;
    return reply
      .code(status)
      .send({ error: status === 500 ? 'internal_error' : 'error', message: err.message });
  });

  app.get('/health', async () => ({ status: 'ok' }));
  // Friendly root: the API has no UI — send browsers to the interactive docs.
  app.get('/', async (_req, reply) => reply.redirect('/docs'));

  await app.register(registerAuthRoutes, { prefix: '/v1' });
  await app.register(registerCardRoutes, { prefix: '/v1' });
  await app.register(registerDeckRoutes, { prefix: '/v1' });
  await app.register(registerInventoryRoutes, { prefix: '/v1' });

  return app;
}
