#!/usr/bin/env node
/**
 * MCP server exposing the deck-building platform to Claude and other MCP clients.
 * Authenticates as a single user via the DECKBUILDER_API_KEY env var.
 *
 * The standout tools are `deck_inventory_diff` and `find_owned_options`, which
 * let AI deckbuilding bias toward cards the user already owns.
 */
import { prisma } from '@deck/db';
import {
  addCardsToDeck,
  addInventory,
  analyzeDeck,
  authenticateApiKey,
  createDeck,
  deckInventoryDiff,
  findOwnedOptions,
  getCardByName,
  getDeck,
  importDeck,
  inventorySummary,
  listDecks,
  listInventory,
  parseDecklist,
  searchCards,
  type AuthUser,
} from '@deck/services';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const FORMATS = [
  'commander', 'standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'brawl',
  'historic', 'explorer', 'oathbreaker', 'premodern', 'penny', 'duel', 'oldschool', 'limited', 'casual',
] as const;
const BOARDS = ['mainboard', 'sideboard', 'maybeboard', 'command'] as const;

let cachedUser: AuthUser | null = null;

/** Resolve the configured API key to a user, or throw a helpful error. */
async function requireUser(): Promise<AuthUser> {
  if (cachedUser) return cachedUser;
  const user = await authenticateApiKey(prisma, process.env.DECKBUILDER_API_KEY);
  if (!user) {
    throw new Error(
      'Not authenticated. Set DECKBUILDER_API_KEY to a valid API key (create one via the API: POST /v1/auth/register or /v1/keys).',
    );
  }
  cachedUser = user;
  return user;
}

/** Wrap a tool handler so its result is returned as pretty JSON text. */
function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

async function main() {
  const server = new McpServer({ name: 'deckbuilding', version: '0.1.0' });

  server.registerTool(
    'search_cards',
    {
      title: 'Search cards',
      description:
        'Search the card database using Scryfall-subset syntax (c:, id:, t:, o:, cmc/mv with >,<,>=,<=, f:, and bare words for names).',
      inputSchema: {
        query: z.string().describe('Scryfall-subset query, e.g. "t:creature c:r cmc<=3 f:commander".'),
        limit: z.number().int().min(1).max(175).optional(),
      },
    },
    async ({ query, limit }) => {
      try {
        const res = await searchCards(prisma, query, { limit });
        return json({
          total: res.total,
          cards: res.cards.map((c) => ({
            oracleId: c.oracleId,
            name: c.name,
            manaCost: c.manaCost,
            cmc: c.cmc,
            typeLine: c.typeLine,
            colorIdentity: c.colorIdentity,
            oracleText: c.oracleText,
          })),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_card',
    {
      title: 'Get a card by name',
      description: 'Look up a single card by name (exact, then fuzzy), with recent printings.',
      inputSchema: { name: z.string() },
    },
    async ({ name }) => {
      try {
        return json(await getCardByName(prisma, name));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'list_decks',
    { title: 'List your decks', description: 'List all decks owned by the authenticated user.', inputSchema: {} },
    async () => {
      try {
        const user = await requireUser();
        return json(await listDecks(prisma, user.id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_deck',
    { title: 'Get a deck', description: 'Get a deck with its cards.', inputSchema: { deckId: z.string() } },
    async ({ deckId }) => {
      try {
        const user = await requireUser();
        return json(await getDeck(prisma, deckId, user.id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'create_deck',
    {
      title: 'Create a deck',
      description: 'Create a new deck.',
      inputSchema: {
        name: z.string(),
        format: z.enum(FORMATS).optional(),
        description: z.string().optional(),
      },
    },
    async ({ name, format, description }) => {
      try {
        const user = await requireUser();
        return json(await createDeck(prisma, user.id, { name, format, description }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'add_cards_to_deck',
    {
      title: 'Add cards to a deck',
      description: 'Add one or more cards to a deck by name or oracleId. Quantities on existing rows are incremented.',
      inputSchema: {
        deckId: z.string(),
        cards: z
          .array(
            z.object({
              name: z.string().optional(),
              oracleId: z.string().optional(),
              quantity: z.number().int().min(1).optional(),
              board: z.enum(BOARDS).optional(),
              categories: z.array(z.string()).optional(),
            }),
          )
          .min(1),
      },
    },
    async ({ deckId, cards }) => {
      try {
        const user = await requireUser();
        return json(await addCardsToDeck(prisma, deckId, user.id, cards));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'import_deck',
    {
      title: 'Import a decklist',
      description: 'Create a deck from a pasted decklist (Moxfield/Archidekt/MTGO text).',
      inputSchema: {
        name: z.string(),
        format: z.enum(FORMATS).optional(),
        list: z.string().describe('Plain-text decklist. Section headers (Commander/Sideboard/etc.) switch boards.'),
      },
    },
    async ({ name, format, list }) => {
      try {
        const user = await requireUser();
        const entries = parseDecklist(list);
        return json(await importDeck(prisma, user.id, { name, format, entries }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'analyze_deck',
    {
      title: 'Analyze a deck',
      description: 'Compute deck statistics (mana curve, color pips, types, price) and format legality.',
      inputSchema: { deckId: z.string() },
    },
    async ({ deckId }) => {
      try {
        const user = await requireUser();
        return json(await analyzeDeck(prisma, deckId, user.id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_inventory',
    {
      title: 'Get inventory',
      description: 'List the authenticated user\'s card inventory and a summary (distinct cards, copies, value).',
      inputSchema: { limit: z.number().int().min(1).max(500).optional() },
    },
    async ({ limit }) => {
      try {
        const user = await requireUser();
        const [items, summary] = await Promise.all([
          listInventory(prisma, user.id, { limit }),
          inventorySummary(prisma, user.id),
        ]);
        return json({ summary, items });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'add_inventory',
    {
      title: 'Add to inventory',
      description: 'Add owned card printings to inventory (by Scryfall printing id).',
      inputSchema: {
        items: z
          .array(
            z.object({
              printingId: z.string(),
              quantity: z.number().int().min(1).optional(),
              finish: z.string().optional(),
              condition: z.string().optional(),
              language: z.string().optional(),
            }),
          )
          .min(1),
      },
    },
    async ({ items }) => {
      try {
        const user = await requireUser();
        const results = [];
        for (const item of items) results.push(await addInventory(prisma, user.id, item));
        return json({ added: results.length, items: results });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'deck_inventory_diff',
    {
      title: 'Deck vs. inventory diff',
      description:
        'Compare a deck against your inventory: which cards (and how many copies) you already own vs. must acquire, plus the cost to complete. Use this to optimize deckbuilding toward cards already owned.',
      inputSchema: { deckId: z.string(), includeSideboard: z.boolean().optional() },
    },
    async ({ deckId, includeSideboard }) => {
      try {
        const user = await requireUser();
        return json(await deckInventoryDiff(prisma, deckId, user.id, { includeSideboard }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'find_owned_options',
    {
      title: 'Find owned cards matching a query',
      description:
        'Surface cards you ALREADY OWN that match a Scryfall-subset query (e.g. "t:instant o:destroy id:r"). Use this while building a deck to prefer cards from the existing collection over buying new ones.',
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(200).optional() },
    },
    async ({ query, limit }) => {
      try {
        const user = await requireUser();
        const options = await findOwnedOptions(prisma, user.id, query, { limit });
        return json({
          count: options.length,
          options: options.map((o) => ({
            oracleId: o.oracleId,
            name: o.name,
            manaCost: o.manaCost,
            cmc: o.cmc,
            typeLine: o.typeLine,
            colorIdentity: o.colorIdentity,
            ownedQuantity: o.ownedQuantity,
          })),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logging on a stdio MCP server (stdout is the protocol channel).
  console.error('[deck-mcp] ready (stdio). Auth via DECKBUILDER_API_KEY.');
}

main().catch((err) => {
  console.error('[deck-mcp] fatal:', err);
  process.exit(1);
});
