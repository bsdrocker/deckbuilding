#!/usr/bin/env node
/**
 * MCP server exposing the deck-building platform to Claude and other MCP clients.
 * Authenticates as a single user via the DECKBUILDER_API_KEY env var.
 *
 * Two backends (see backend.ts): in-process against a local database (default),
 * or the deployed REST API over HTTPS when DECK_API_URL is set. The standout
 * tools are `deck_inventory_diff` and `find_owned_options`, which let AI
 * deckbuilding bias toward cards the user already owns.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createBackend, type Backend } from './backend.js';

const FORMATS = [
  'commander', 'standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'brawl',
  'historic', 'explorer', 'oathbreaker', 'premodern', 'penny', 'duel', 'oldschool', 'limited', 'casual',
] as const;
const BOARDS = ['mainboard', 'sideboard', 'maybeboard', 'command'] as const;

/** Wrap a tool handler so its result is returned as pretty JSON text. */
function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

async function main() {
  const backend: Backend = await createBackend();
  const server = new McpServer({ name: 'deckbuilding', version: '0.1.0' });

  server.registerTool(
    'search_cards',
    {
      title: 'Search cards',
      description:
        'Search the card database using Scryfall-subset syntax (c:, id:, t:, o:, kw:, r:, m: mana cost, s:/set:, cmc/mv/pow/tou/loy/year with >,<,>=,<=, f:, is:, and bare words for names).',
      inputSchema: {
        query: z.string().describe('Scryfall-subset query, e.g. "t:creature c:r cmc<=3 f:commander".'),
        limit: z.number().int().min(1).max(175).optional(),
      },
    },
    async ({ query, limit }) => {
      try {
        const res = await backend.searchCards(query, limit);
        return json({
          total: res.total,
          cards: res.cards.map((c: any) => ({
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
        return json(await backend.getCard(name));
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
        return json(await backend.listDecks());
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
        return json(await backend.getDeck(deckId));
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
        return json(await backend.createDeck({ name, format, description }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'update_deck',
    {
      title: 'Update deck metadata',
      description:
        "Update a deck's metadata: name, format, description, visibility, status (brewing/built), and primer (Markdown writeup). Marking a deck 'built' makes its cards count as 'used' from your inventory.",
      inputSchema: {
        deckId: z.string(),
        name: z.string().optional(),
        format: z.enum(FORMATS).optional(),
        description: z.string().optional(),
        visibility: z.enum(['private', 'unlisted', 'public']).optional(),
        status: z.enum(['brewing', 'built']).optional(),
        primer: z.string().optional().describe('Long-form Markdown primer for the deck.'),
      },
    },
    async ({ deckId, name, format, description, visibility, status, primer }) => {
      try {
        return json(await backend.updateDeck(deckId, { name, format, description, visibility, status, primer }));
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
        return json(await backend.addCardsToDeck(deckId, cards));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'set_card_quantity',
    {
      title: 'Set a deck card quantity',
      description:
        'Set the exact quantity of a card in a deck. Upserts: adds the card if it is not already in the deck (quantity >= 1), and 0 removes it. Identify the card by name, oracleId, or cardId; pass board when the card exists on more than one board. Use this for swaps and trimming — add_cards_to_deck only increments existing counts.',
      inputSchema: {
        deckId: z.string(),
        quantity: z.number().int().min(0),
        name: z.string().optional(),
        oracleId: z.string().optional(),
        cardId: z.string().optional(),
        board: z.enum(BOARDS).optional(),
      },
    },
    async ({ deckId, quantity, name, oracleId, cardId, board }) => {
      try {
        return json(await backend.setCardQuantity(deckId, { name, oracleId, cardId, board }, quantity));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'remove_card_from_deck',
    {
      title: 'Remove a card from a deck',
      description:
        'Remove a card from a deck entirely. Identify it by name, oracleId, or cardId; pass board when it exists on more than one board.',
      inputSchema: {
        deckId: z.string(),
        name: z.string().optional(),
        oracleId: z.string().optional(),
        cardId: z.string().optional(),
        board: z.enum(BOARDS).optional(),
      },
    },
    async ({ deckId, name, oracleId, cardId, board }) => {
      try {
        return json(await backend.removeCard(deckId, { name, oracleId, cardId, board }));
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
        return json(await backend.importDeck(name, format, list));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'analyze_deck',
    {
      title: 'Analyze a deck',
      description: 'Compute deck statistics (mana curve, color pips, types, price) and format legality. For Commander decks, also includes a suggested bracket (2-4) with the Game Changer, mass-land-denial, and extra-turn cards found in the deck.',
      inputSchema: { deckId: z.string() },
    },
    async ({ deckId }) => {
      try {
        return json(await backend.analyzeDeck(deckId));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_inventory',
    {
      title: 'Get inventory',
      description:
        "List the user's card inventory with a summary (distinct cards, copies, value) and allocation (how many copies are used by built decks vs. free). Filter by used/unused/conflict.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
        sort: z.enum(['name', 'set', 'value', 'recent']).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        filter: z.enum(['all', 'used', 'unused', 'conflict']).optional(),
      },
    },
    async ({ limit, offset, sort, dir, filter }) => {
      try {
        return json(await backend.getInventory({ limit, offset, sort, dir, filter }));
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
        return json(await backend.addInventory(items));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'import_inventory_csv',
    {
      title: 'Import a collection CSV',
      description:
        'Bulk-import a collection CSV (ManaBox/Moxfield/Deckbox export) into inventory. Returns matched vs. unresolved counts.',
      inputSchema: { csv: z.string().describe('Raw CSV text with a header row.') },
    },
    async ({ csv }) => {
      try {
        return json(await backend.importInventoryCsv(csv));
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
        return json(await backend.deckInventoryDiff(deckId, includeSideboard));
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
        'Surface cards you ALREADY OWN that match a Scryfall query (e.g. "t:instant o:destroy id:r"). Use this while building a deck to prefer cards from the existing collection. Set onlyFree to exclude cards already committed to BUILT decks — ideal for brewing a new deck without stealing from assembled ones.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
        onlyFree: z.boolean().optional().describe('Only cards with copies not used by built decks.'),
      },
    },
    async ({ query, limit, onlyFree }) => {
      try {
        const options = await backend.findOwnedOptions(query, { limit, onlyFree });
        return json({
          count: options.length,
          options: options.map((o: any) => ({
            oracleId: o.oracleId,
            name: o.name,
            manaCost: o.manaCost,
            cmc: o.cmc,
            typeLine: o.typeLine,
            colorIdentity: o.colorIdentity,
            ownedQuantity: o.ownedQuantity,
            freeQuantity: o.freeQuantity,
          })),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'list_public_decks',
    {
      title: 'Browse public decks',
      description:
        'Browse decks shared publicly by any user (not just yours). Filter by format, color identity, and name. Useful for finding inspiration or a deck to copy with clone_deck.',
      inputSchema: {
        q: z.string().optional(),
        format: z.enum(FORMATS).optional(),
        colors: z.array(z.enum(['W', 'U', 'B', 'R', 'G'])).optional(),
        sort: z.enum(['recent', 'name']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ q, format, colors, sort, limit, offset }) => {
      try {
        return json(await backend.listPublicDecks({ q, format, colors, sort, limit, offset }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'clone_deck',
    {
      title: 'Copy a shared deck',
      description:
        "Copy a shared deck (by its share id, e.g. from list_public_decks) into the current user's account as a new private deck. Returns the new deck id.",
      inputSchema: { shareId: z.string().describe('The share id of a public/unlisted deck.') },
    },
    async ({ shareId }) => {
      try {
        return json(await backend.cloneDeck(shareId));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // Fail-soft credential check so testers get an immediate, clear message.
  try {
    await backend.verify();
  } catch (err) {
    console.error(`[deck-mcp] warning: ${err instanceof Error ? err.message : String(err)}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  const where = backend.mode === 'http' ? `http → ${process.env.DECK_API_URL}` : 'database (in-process)';
  console.error(`[deck-mcp] ready (stdio). Backend: ${where}. Auth via DECKBUILDER_API_KEY.`);
}

main().catch((err) => {
  console.error('[deck-mcp] fatal:', err);
  process.exit(1);
});
