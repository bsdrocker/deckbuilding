import { randomUUID } from 'node:crypto';
import { prisma } from '@deck/db';
import { parseDecklist } from '@deck/services';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

/**
 * End-to-end API flow against the dev Postgres (must be migrated + card data
 * imported). Exercises: register -> keys -> deck CRUD -> analysis -> inventory
 * -> inventory-diff. Creates a unique throwaway user and cleans it up.
 */
describe('API integration', () => {
  let app: FastifyInstance;
  let apiKey: string;
  let userId: string;
  let deckId: string;
  const email = `test-${randomUUID()}@example.com`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await app.close();
  });

  const authed = () => ({ authorization: `Bearer ${apiKey}` });

  it('registers a user and returns an API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, handle: `t${randomUUID().slice(0, 8)}`, password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.apiKey).toMatch(/^deck_live_/);
    apiKey = body.apiKey;
    userId = body.user.id;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/decks' });
    expect(res.statusCode).toBe(401);
  });

  it('searches cards with a Scryfall-subset query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/cards?q=' + encodeURIComponent('t:instant c:r cmc<=1') + '&limit=5',
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.cards.length).toBeGreaterThan(0);
  });

  it('creates a commander deck and adds cards by name', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/decks',
      headers: authed(),
      payload: { name: 'Test Krenko', format: 'commander' },
    });
    expect(create.statusCode).toBe(201);
    deckId = create.json().id;

    const add = await app.inject({
      method: 'POST',
      url: `/v1/decks/${deckId}/cards`,
      headers: authed(),
      payload: {
        cards: [
          { name: 'Krenko, Mob Boss', board: 'command' },
          { name: 'Lightning Bolt', quantity: 1 },
          { name: 'Sol Ring', quantity: 1 },
          { name: 'Mountain', quantity: 30 },
          { name: 'ThisCardDoesNotExist_zzz', quantity: 1 },
        ],
      },
    });
    expect(add.statusCode).toBe(200);
    const addBody = add.json();
    expect(addBody.added).toBeGreaterThanOrEqual(4);
    expect(addBody.unresolved).toContain('ThisCardDoesNotExist_zzz');
  });

  it('returns analysis with stats and legality', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/decks/${deckId}/analysis`, headers: authed() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stats.totalCards).toBeGreaterThan(0);
    expect(body.stats.manaCurve).toBeInstanceOf(Array);
    expect(body.validation).toHaveProperty('legal');
    // Deck is under 100 cards, so commander deck_size should be flagged.
    expect(body.validation.issues.some((i: { code: string }) => i.code === 'deck_size')).toBe(true);
  });

  it('adds inventory and computes an inventory diff', async () => {
    // Find a real printing for Sol Ring to add to inventory.
    const oracle = await prisma.oracleCard.findFirst({
      where: { name: { equals: 'Sol Ring', mode: 'insensitive' } },
      include: { printings: { take: 1 } },
    });
    expect(oracle?.printings[0]).toBeDefined();
    const printingId = oracle!.printings[0]!.scryfallId;

    const addInv = await app.inject({
      method: 'POST',
      url: '/v1/inventory',
      headers: authed(),
      payload: { printingId, quantity: 1 },
    });
    expect(addInv.statusCode).toBe(201);

    const diff = await app.inject({ method: 'GET', url: `/v1/decks/${deckId}/inventory-diff`, headers: authed() });
    expect(diff.statusCode).toBe(200);
    const body = diff.json();
    // We own Sol Ring; it should show as owned in the diff.
    const solRing = body.cards.find((c: { name: string }) => c.name === 'Sol Ring');
    expect(solRing?.owned).toBeGreaterThanOrEqual(1);
    expect(solRing?.missing).toBe(0);
    expect(body.completionPct).toBeGreaterThan(0);
  });

  it('finds owned options matching a query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/inventory/owned-options?q=' + encodeURIComponent('t:artifact'),
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.options.some((o: { name: string }) => o.name === 'Sol Ring')).toBe(true);
  });

  it('manages deck cards: update quantity then remove', async () => {
    const deck = (await app.inject({ method: 'GET', url: `/v1/decks/${deckId}`, headers: authed() })).json();
    const bolt = deck.cards.find((c: { oracle: { name: string } }) => c.oracle.name === 'Lightning Bolt');
    expect(bolt).toBeDefined();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/decks/${deckId}/cards/${bolt.id}`,
      headers: authed(),
      payload: { quantity: 3 },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().quantity).toBe(3);

    // Reproduce the real web client: DELETE carrying a JSON content-type but no
    // body must not fail with FST_ERR_CTP_EMPTY_JSON_BODY.
    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/decks/${deckId}/cards/${bolt.id}`,
      headers: { ...authed(), 'content-type': 'application/json' },
    });
    expect(del.statusCode).toBe(204);

    const after = (await app.inject({ method: 'GET', url: `/v1/decks/${deckId}`, headers: authed() })).json();
    expect(after.cards.find((c: { oracle: { name: string } }) => c.oracle.name === 'Lightning Bolt')).toBeUndefined();
  });

  it('imports a ManaBox-style CSV into inventory', async () => {
    const oracle = await prisma.oracleCard.findFirst({
      where: { name: { equals: 'Counterspell', mode: 'insensitive' } },
      include: { printings: { take: 1 } },
    });
    const printingId = oracle!.printings[0]!.scryfallId;
    const csv =
      'Name,Set code,Collector number,Foil,Quantity,Scryfall ID,Condition,Language\n' +
      `Counterspell,xxx,1,normal,2,${printingId},near_mint,en\n` +
      'BogusCard,zzz,999,normal,1,,near_mint,en';

    const res = await app.inject({ method: 'POST', url: '/v1/inventory/import', headers: authed(), payload: { csv } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.matchedCopies).toBeGreaterThanOrEqual(2);
    expect(body.unresolved.length).toBeGreaterThanOrEqual(1);
  });

  it('supports richer search: negation excludes matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/cards?q=' + encodeURIComponent('t:creature -t:legendary kw:flying') + '&limit=5',
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.cards.every((c: { typeLine: string }) => !/legendary/i.test(c.typeLine))).toBe(true);
  });

  it('supports richer search: OR combines clauses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/cards?q=' + encodeURIComponent('t:goblin or t:angel') + '&limit=5',
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThan(0);
  });

  it('reports collection value and exports CSV', async () => {
    const val = await app.inject({ method: 'GET', url: '/v1/inventory/value', headers: authed() });
    expect(val.statusCode).toBe(200);
    expect(val.json()).toHaveProperty('totalValueUsd');

    const csv = await app.inject({ method: 'GET', url: '/v1/inventory/export.csv', headers: authed() });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Scryfall ID');
  });
});

describe('parseDecklist', () => {
  it('parses quantities, boards, and set annotations', () => {
    const lines = parseDecklist(`Commander\n1 Krenko, Mob Boss (C21) 263\n\nDeck\n4x Lightning Bolt\n30 Mountain\n# a comment\nSideboard\n2 Pyroblast`);
    expect(lines).toEqual([
      { quantity: 1, name: 'Krenko, Mob Boss', board: 'command' },
      { quantity: 4, name: 'Lightning Bolt', board: 'mainboard' },
      { quantity: 30, name: 'Mountain', board: 'mainboard' },
      { quantity: 2, name: 'Pyroblast', board: 'sideboard' },
    ]);
  });
});
