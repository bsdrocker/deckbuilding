/**
 * Two ways the MCP server can reach the platform:
 *
 *  - **database** (default): in-process via @deck/services against a local
 *    Postgres. Auth resolves DECKBUILDER_API_KEY to a user directly.
 *  - **http**: talk to the deployed REST API over HTTPS with the key as a bearer
 *    token (set DECK_API_URL). No DB access needed — ideal for remote/QA use.
 *
 * Both expose the same `Backend` interface so the tool handlers don't care which
 * is active. @deck/db is imported lazily so http mode never opens a DB client.
 */
import {
  addCardsToDeck,
  addInventory,
  analyzeDeck,
  authenticateApiKey,
  cloneDeck,
  createDeck,
  deckInventoryDiff,
  findOwnedOptions,
  getCardByName,
  getDeck,
  importDeck,
  importInventoryCsv,
  inventoryAllocation,
  inventorySummary,
  listDecks,
  listInventory,
  listPublicDecks,
  parseDecklist,
  removeDeckCardBySelector,
  searchCards,
  setDeckCardQuantity,
  updateDeck,
  type CardEntryInput,
  type CreateDeckInput,
  type DeckCardSelector,
} from '@deck/services';

export interface InventoryAddInput {
  printingId: string;
  quantity?: number;
  finish?: string;
  condition?: string;
  language?: string;
}
export interface GetInventoryOpts {
  limit?: number;
  offset?: number;
  sort?: 'name' | 'set' | 'value' | 'recent';
  dir?: 'asc' | 'desc';
  filter?: 'all' | 'used' | 'unused' | 'conflict';
}
export interface OwnedOptionsOpts {
  limit?: number;
  onlyFree?: boolean;
}
export interface PublicDecksOpts {
  q?: string;
  format?: string;
  colors?: string[];
  sort?: 'recent' | 'name';
  limit?: number;
  offset?: number;
}

export interface Backend {
  readonly mode: 'database' | 'http';
  /** Throws if the configured credentials/endpoint aren't usable. */
  verify(): Promise<void>;
  searchCards(query: string, limit?: number): Promise<{ total: number; cards: unknown[] }>;
  getCard(name: string): Promise<unknown>;
  listDecks(): Promise<unknown>;
  getDeck(deckId: string): Promise<unknown>;
  createDeck(input: CreateDeckInput): Promise<unknown>;
  updateDeck(deckId: string, patch: Partial<CreateDeckInput>): Promise<unknown>;
  addCardsToDeck(deckId: string, cards: CardEntryInput[]): Promise<unknown>;
  setCardQuantity(deckId: string, selector: DeckCardSelector, quantity: number): Promise<unknown>;
  removeCard(deckId: string, selector: DeckCardSelector): Promise<unknown>;
  importDeck(name: string, format: string | undefined, list: string): Promise<unknown>;
  analyzeDeck(deckId: string): Promise<unknown>;
  getInventory(opts: GetInventoryOpts): Promise<unknown>;
  addInventory(items: InventoryAddInput[]): Promise<unknown>;
  importInventoryCsv(csv: string): Promise<unknown>;
  deckInventoryDiff(deckId: string, includeSideboard?: boolean): Promise<unknown>;
  findOwnedOptions(query: string, opts: OwnedOptionsOpts): Promise<unknown[]>;
  listPublicDecks(opts: PublicDecksOpts): Promise<unknown>;
  cloneDeck(shareId: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Database backend (in-process; lazy-loads the Prisma client)
// ---------------------------------------------------------------------------
async function createDbBackend(apiKey: string | undefined): Promise<Backend> {
  const { prisma } = await import('@deck/db');
  let userId: string | null = null;
  const uid = async (): Promise<string> => {
    if (userId) return userId;
    const user = await authenticateApiKey(prisma, apiKey);
    if (!user) {
      throw new Error('Not authenticated. Set DECKBUILDER_API_KEY to a valid API key.');
    }
    userId = user.id;
    return userId;
  };

  return {
    mode: 'database',
    async verify() {
      await uid();
    },
    async searchCards(query, limit) {
      return searchCards(prisma, query, { limit });
    },
    async getCard(name) {
      return getCardByName(prisma, name);
    },
    async listDecks() {
      return listDecks(prisma, await uid());
    },
    async getDeck(deckId) {
      return getDeck(prisma, deckId, await uid());
    },
    async createDeck(input) {
      return createDeck(prisma, await uid(), input);
    },
    async updateDeck(deckId, patch) {
      return updateDeck(prisma, deckId, await uid(), patch);
    },
    async addCardsToDeck(deckId, cards) {
      return addCardsToDeck(prisma, deckId, await uid(), cards);
    },
    async setCardQuantity(deckId, selector, quantity) {
      const r = await setDeckCardQuantity(prisma, deckId, await uid(), selector, quantity);
      return r ?? { removed: true };
    },
    async removeCard(deckId, selector) {
      await removeDeckCardBySelector(prisma, deckId, await uid(), selector);
      return { removed: true };
    },
    async importDeck(name, format, list) {
      const entries = parseDecklist(list);
      return importDeck(prisma, await uid(), { name, format: format as CreateDeckInput['format'], entries });
    },
    async analyzeDeck(deckId) {
      return analyzeDeck(prisma, deckId, await uid());
    },
    async getInventory(opts) {
      const id = await uid();
      const [list, summary, alloc] = await Promise.all([
        listInventory(prisma, id, opts),
        inventorySummary(prisma, id),
        inventoryAllocation(prisma, id),
      ]);
      return { summary, allocation: alloc.totals, conflicts: alloc.conflicts.slice(0, 20), total: list.total, items: list.items };
    },
    async addInventory(items) {
      const id = await uid();
      const results = [];
      for (const item of items) results.push(await addInventory(prisma, id, item));
      return { added: results.length, items: results };
    },
    async importInventoryCsv(csv) {
      return importInventoryCsv(prisma, await uid(), csv);
    },
    async deckInventoryDiff(deckId, includeSideboard) {
      return deckInventoryDiff(prisma, deckId, await uid(), { includeSideboard });
    },
    async findOwnedOptions(query, opts) {
      return findOwnedOptions(prisma, await uid(), query, opts);
    },
    async listPublicDecks(opts) {
      return listPublicDecks(prisma, opts as Parameters<typeof listPublicDecks>[1]);
    },
    async cloneDeck(shareId) {
      return cloneDeck(prisma, await uid(), shareId);
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP backend (talks to the deployed REST API with a bearer token)
// ---------------------------------------------------------------------------
function createHttpBackend(baseUrl: string, apiKey: string | undefined): Backend {
  const base = baseUrl.replace(/\/+$/, '');

  const api = async (method: string, path: string, body?: unknown): Promise<any> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      throw new Error(`Unauthorized — DECKBUILDER_API_KEY is not valid for ${base}.`);
    }
    if (res.status === 204) return undefined;
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new Error((data && data.message) || `API ${method} ${path} failed (${res.status}).`);
    return data;
  };

  const qs = (params: Record<string, unknown>): string => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
      else sp.append(k, String(v));
    }
    const s = sp.toString();
    return s ? `?${s}` : '';
  };

  return {
    mode: 'http',
    async verify() {
      await api('GET', '/v1/decks'); // authenticated + reachability check
    },
    async searchCards(query, limit) {
      return api('GET', `/v1/cards${qs({ q: query, limit })}`);
    },
    async getCard(name) {
      return api('GET', `/v1/cards/named${qs({ name })}`);
    },
    async listDecks() {
      // Unwrap { decks } so both backends return the same array shape.
      return (await api('GET', '/v1/decks')).decks;
    },
    async getDeck(deckId) {
      return api('GET', `/v1/decks/${deckId}`);
    },
    async createDeck(input) {
      return api('POST', '/v1/decks', input);
    },
    async updateDeck(deckId, patch) {
      return api('PATCH', `/v1/decks/${deckId}`, patch);
    },
    async addCardsToDeck(deckId, cards) {
      return api('POST', `/v1/decks/${deckId}/cards`, { cards });
    },
    async setCardQuantity(deckId, selector, quantity) {
      return api('POST', `/v1/decks/${deckId}/cards/set`, { ...selector, quantity });
    },
    async removeCard(deckId, selector) {
      return api('POST', `/v1/decks/${deckId}/cards/remove`, selector);
    },
    async importDeck(name, format, list) {
      return api('POST', '/v1/decks/import', { name, format, list });
    },
    async analyzeDeck(deckId) {
      return api('GET', `/v1/decks/${deckId}/analysis`);
    },
    async getInventory(opts) {
      const [list, summary, alloc] = await Promise.all([
        api('GET', `/v1/inventory${qs(opts as Record<string, unknown>)}`),
        api('GET', '/v1/inventory/summary'),
        api('GET', '/v1/inventory/allocation'),
      ]);
      return {
        summary,
        allocation: alloc.totals,
        conflicts: (alloc.conflicts ?? []).slice(0, 20),
        total: list.total,
        items: list.items,
      };
    },
    async addInventory(items) {
      const results = [];
      for (const item of items) results.push(await api('POST', '/v1/inventory', item));
      return { added: results.length, items: results };
    },
    async importInventoryCsv(csv) {
      return api('POST', '/v1/inventory/import', { csv });
    },
    async deckInventoryDiff(deckId, includeSideboard) {
      return api('GET', `/v1/decks/${deckId}/inventory-diff${qs({ includeSideboard })}`);
    },
    async findOwnedOptions(query, opts) {
      const r = await api('GET', `/v1/inventory/owned-options${qs({ q: query, ...opts })}`);
      return r.options ?? [];
    },
    async listPublicDecks(opts) {
      return api('GET', `/v1/public/decks${qs(opts as Record<string, unknown>)}`);
    },
    async cloneDeck(shareId) {
      return api('POST', '/v1/decks/clone', { shareId });
    },
  };
}

/** Pick the backend from env: DECK_API_URL → http, otherwise database. */
export async function createBackend(): Promise<Backend> {
  const url = process.env.DECK_API_URL?.trim();
  const key = process.env.DECKBUILDER_API_KEY;
  return url ? createHttpBackend(url, key) : createDbBackend(key);
}
