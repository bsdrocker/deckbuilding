import { randomUUID } from 'node:crypto';
import { prisma } from '@deck/db';
import { parseDecklist, removeDeckCardBySelector, setDeckCardQuantity } from '@deck/services';
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

  describe('inventory-aware deck view', () => {
    it('flags a missing card and clears it after adding to inventory', async () => {
      // The deck has Sol Ring; we own 1 Sol Ring (added earlier). Mountain x30 is
      // not owned → should be missing.
      const before = (await app.inject({ method: 'GET', url: `/v1/decks/${deckId}/availability`, headers: authed() })).json();
      const mountain = before.cards.find((c: { oracleId: string; missing: number; needed: number }) => c.needed === 30);
      expect(mountain).toBeDefined();
      expect(mountain.missing).toBeGreaterThan(0);

      const solRingAvail = before.cards.find(
        (c: { ownedOracle: number }) => c.ownedOracle >= 1,
      );
      expect(solRingAvail).toBeDefined();
      expect(solRingAvail.missing).toBe(0);
    });

    it('reports pinned-printing status (wrong printing not owned)', async () => {
      // Pin Sol Ring to a printing we don't own, with a finish.
      const deck = (await app.inject({ method: 'GET', url: `/v1/decks/${deckId}`, headers: authed() })).json();
      const solRow = deck.cards.find((c: { oracle: { name: string } }) => c.oracle.name === 'Sol Ring');
      expect(solRow).toBeDefined();
      // Find a Sol Ring printing that is NOT the one we own in inventory.
      const oracle = await prisma.oracleCard.findFirst({
        where: { name: { equals: 'Sol Ring', mode: 'insensitive' } },
        include: { printings: { take: 5 } },
      });
      const ownedItem = await prisma.inventoryItem.findFirst({
        where: { userId, printing: { oracleId: oracle!.oracleId } },
      });
      const otherPrinting = oracle!.printings.find((p) => p.scryfallId !== ownedItem?.printingId);
      expect(otherPrinting).toBeDefined();

      await app.inject({
        method: 'PATCH',
        url: `/v1/decks/${deckId}/cards/${solRow.id}`,
        headers: authed(),
        payload: { printingId: otherPrinting!.scryfallId, finish: 'foil' },
      });

      const avail = (await app.inject({ method: 'GET', url: `/v1/decks/${deckId}/availability`, headers: authed() })).json();
      const sol = avail.cards.find((c: { deckCardId: string }) => c.deckCardId === solRow.id);
      expect(sol.pinnedPrintingId).toBe(otherPrinting!.scryfallId);
      expect(sol.finish).toBe('foil');
      expect(sol.printingStatus).toBe('not_owned'); // own a different printing/finish
    });

    it('reports per-printing ownership for the printing picker', async () => {
      const oracle = await prisma.oracleCard.findFirst({
        where: { name: { equals: 'Sol Ring', mode: 'insensitive' } },
      });
      const res = await app.inject({
        method: 'GET',
        url: `/v1/inventory/owned-printings/${oracle!.oracleId}`,
        headers: authed(),
      });
      expect(res.statusCode).toBe(200);
      const { owned } = res.json() as { owned: { printingId: string; total: number; byFinish: Record<string, number> }[] };
      expect(owned.length).toBeGreaterThanOrEqual(1);
      expect(owned[0]!.total).toBeGreaterThanOrEqual(1);
      expect(owned[0]!.byFinish).toBeDefined();
    });
  });

  describe('inventory list import', () => {
    it('imports a plain-text list with set/collector and finish markers', async () => {
      const oracle = await prisma.oracleCard.findFirst({
        where: { name: { equals: 'Llanowar Elves', mode: 'insensitive' } },
        include: { printings: { take: 1 } },
      });
      const printing = oracle?.printings[0];
      expect(printing).toBeDefined();
      const list = `2 Llanowar Elves (${printing!.setCode}) ${printing!.collectorNumber} *F*\n1 ThisCardDoesNotExist_zzz`;

      const res = await app.inject({ method: 'POST', url: '/v1/inventory/import-list', headers: authed(), payload: { list } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.matchedCopies).toBeGreaterThanOrEqual(2);
      expect(body.unresolved.length).toBeGreaterThanOrEqual(1);

      // The imported copies should be foil (from the *F* marker).
      const foil = await prisma.inventoryItem.findFirst({
        where: { userId, printingId: printing!.scryfallId, finish: 'foil' },
      });
      expect(foil?.quantity).toBeGreaterThanOrEqual(2);
    });
  });

  describe('public sharing', () => {
    let shareId: string;
    const setVisibility = (v: string) =>
      app.inject({ method: 'PATCH', url: `/v1/decks/${deckId}`, headers: authed(), payload: { visibility: v } });
    const browseNames = async () =>
      (await app.inject({ method: 'GET', url: '/v1/public/decks?q=Test%20Krenko' })).json() as {
        decks: { shareId: string }[];
      };

    it('exposes a shareId; a private deck 404s on the public endpoint', async () => {
      const deck = (await app.inject({ method: 'GET', url: `/v1/decks/${deckId}`, headers: authed() })).json();
      expect(deck.shareId).toBeTruthy();
      shareId = deck.shareId;
      const res = await app.inject({ method: 'GET', url: `/v1/public/decks/${shareId}` });
      expect(res.statusCode).toBe(404); // private by default
    });

    it('a public deck is readable without auth, hides ownerId, and appears in browse', async () => {
      await setVisibility('public');
      const res = await app.inject({ method: 'GET', url: `/v1/public/decks/${shareId}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Test Krenko');
      expect(body.authorHandle).toBeTruthy();
      expect(body.userId).toBeUndefined();
      expect(body.cards.length).toBeGreaterThan(0);
      const browse = await browseNames();
      expect(browse.decks.some((d) => d.shareId === shareId)).toBe(true);
    });

    it('an unlisted deck is readable by link but excluded from browse', async () => {
      await setVisibility('unlisted');
      const read = await app.inject({ method: 'GET', url: `/v1/public/decks/${shareId}` });
      expect(read.statusCode).toBe(200);
      const browse = await browseNames();
      expect(browse.decks.some((d) => d.shareId === shareId)).toBe(false);
    });

    it('clones a shared deck into a private copy (auth required)', async () => {
      await setVisibility('public');
      const noAuth = await app.inject({ method: 'POST', url: '/v1/decks/clone', payload: { shareId } });
      expect(noAuth.statusCode).toBe(401);

      const res = await app.inject({ method: 'POST', url: '/v1/decks/clone', headers: authed(), payload: { shareId } });
      expect(res.statusCode).toBe(201);
      const cloneId = res.json().id;
      const clone = (await app.inject({ method: 'GET', url: `/v1/decks/${cloneId}`, headers: authed() })).json();
      expect(clone.visibility).toBe('private');
      expect(clone.name).toContain('(copy)');
      const original = (await app.inject({ method: 'GET', url: `/v1/decks/${deckId}`, headers: authed() })).json();
      expect(clone.cards.length).toBe(original.cards.length);
    });
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

  it('sets and removes deck cards by name (MCP swap workflow)', async () => {
    const deckCards = () =>
      app.inject({ method: 'GET', url: `/v1/decks/${deckId}`, headers: authed() }).then((r) => r.json().cards);
    const findShock = (cards: { oracle: { name: string }; quantity: number }[]) =>
      cards.find((c) => c.oracle.name === 'Shock');

    await app.inject({
      method: 'POST',
      url: `/v1/decks/${deckId}/cards`,
      headers: authed(),
      payload: { cards: [{ name: 'Shock', quantity: 1 }] },
    });

    // set exact quantity by name
    await setDeckCardQuantity(prisma, deckId, userId, { name: 'Shock' }, 3);
    expect(findShock(await deckCards())?.quantity).toBe(3);

    // remove by name
    await removeDeckCardBySelector(prisma, deckId, userId, { name: 'Shock' });
    expect(findShock(await deckCards())).toBeUndefined();

    // setting quantity 0 also removes
    await app.inject({
      method: 'POST',
      url: `/v1/decks/${deckId}/cards`,
      headers: authed(),
      payload: { cards: [{ name: 'Shock', quantity: 2 }] },
    });
    await setDeckCardQuantity(prisma, deckId, userId, { name: 'Shock' }, 0);
    expect(findShock(await deckCards())).toBeUndefined();

    // upsert: setting a quantity on a card not in the deck adds it
    await setDeckCardQuantity(prisma, deckId, userId, { name: 'Goblin Guide', board: 'mainboard' }, 2);
    expect((await deckCards()).find((c) => c.oracle.name === 'Goblin Guide')?.quantity).toBe(2);
    await removeDeckCardBySelector(prisma, deckId, userId, { name: 'Goblin Guide' });

    // unknown card is a clear error
    await expect(setDeckCardQuantity(prisma, deckId, userId, { name: 'NotARealCard_zzz' }, 2)).rejects.toThrow();
  });

  it('supports color-identity comparison operators (id<=)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/cards?q=' + encodeURIComponent('id<=wb t:creature') + '&limit=10',
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThan(0);
    // every result's identity must be within {W,B}
    expect(
      body.cards.every((c: { colorIdentity: string[] }) =>
        c.colorIdentity.every((x) => x === 'W' || x === 'B'),
      ),
    ).toBe(true);
  });

  it('round-trips a deck primer and status', async () => {
    const md = '# Plan\n\n- Ramp into **Krenko**\n- Go wide, then Impact Tremors';
    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/decks/${deckId}`,
      headers: authed(),
      payload: { primer: md, status: 'brewing' },
    });
    expect(patch.statusCode).toBe(200);
    const deck = (await app.inject({ method: 'GET', url: `/v1/decks/${deckId}`, headers: authed() })).json();
    expect(deck.primer).toBe(md);
    expect(deck.status).toBe('brewing');
  });

  it('marks a deck built and reflects inventory allocation', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/decks/${deckId}`,
      headers: authed(),
      payload: { status: 'built' },
    });
    expect(patch.json().status).toBe('built');

    const alloc = (await app.inject({ method: 'GET', url: '/v1/inventory/allocation', headers: authed() })).json();
    expect(alloc.totals.usedCopies).toBeGreaterThan(0);

    const used = (await app.inject({ method: 'GET', url: '/v1/inventory?filter=used&limit=200', headers: authed() })).json();
    expect(used.items.length).toBeGreaterThan(0);
    expect(used.items.every((i: { used: number }) => i.used > 0)).toBe(true);
    expect(used.items.some((i: { printing: { oracle: { name: string } } }) => i.printing.oracle.name === 'Sol Ring')).toBe(true);

    const unused = (await app.inject({ method: 'GET', url: '/v1/inventory?filter=unused&limit=200', headers: authed() })).json();
    expect(unused.items.every((i: { used: number }) => i.used === 0)).toBe(true);
  });

  it('detects an over-allocation conflict across built decks', async () => {
    const d2 = (await app.inject({
      method: 'POST',
      url: '/v1/decks',
      headers: authed(),
      payload: { name: 'Conflict deck', format: 'commander' },
    })).json();
    await app.inject({
      method: 'POST',
      url: `/v1/decks/${d2.id}/cards`,
      headers: authed(),
      payload: { cards: [{ name: 'Sol Ring', quantity: 1 }] },
    });
    await app.inject({ method: 'PATCH', url: `/v1/decks/${d2.id}`, headers: authed(), payload: { status: 'built' } });

    const alloc = (await app.inject({ method: 'GET', url: '/v1/inventory/allocation', headers: authed() })).json();
    const sol = alloc.conflicts.find((c: { name: string }) => c.name === 'Sol Ring');
    expect(sol).toBeDefined();
    expect(sol.deficit).toBeGreaterThanOrEqual(1);
    expect(sol.decks.length).toBeGreaterThanOrEqual(2);

    await app.inject({ method: 'DELETE', url: `/v1/decks/${d2.id}`, headers: authed() });
  });

  it('supports is: and parenthesised grammar in search', async () => {
    const cmd = (await app.inject({
      method: 'GET',
      url: '/v1/cards?q=' + encodeURIComponent('is:commander id:r') + '&limit=5',
      headers: authed(),
    })).json();
    expect(cmd.total).toBeGreaterThan(0);
    expect(
      cmd.cards.every(
        (c: { typeLine: string; oracleText: string | null }) =>
          /legendary/i.test(c.typeLine) || /can be your commander/i.test(c.oracleText ?? ''),
      ),
    ).toBe(true);

    const grouped = (await app.inject({
      method: 'GET',
      url: '/v1/cards?q=' + encodeURIComponent('(t:goblin or t:elf) c:r') + '&limit=5',
      headers: authed(),
    })).json();
    expect(grouped.total).toBeGreaterThan(0);
  });

  it('lists inventory with a total, pagination, and value sort', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/inventory?sort=value&dir=desc&limit=1&offset=0',
      headers: authed(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.items.length).toBe(1); // paged
    expect(body.items[0]).toHaveProperty('totalUsd');
  });

  it('changes an inventory item printing (and validates it)', async () => {
    const list = (await app.inject({ method: 'GET', url: '/v1/inventory?limit=200', headers: authed() })).json();
    const sol = list.items.find((i: { printing: { oracle: { name: string } } }) => i.printing.oracle.name === 'Sol Ring');
    expect(sol).toBeDefined();

    // Only meaningful when the DB has multiple printings per card (default_cards).
    const other = await prisma.cardPrinting.findFirst({
      where: { oracleId: sol.printing.oracleId, NOT: { scryfallId: sol.printing.scryfallId } },
    });
    if (other) {
      const ok = await app.inject({
        method: 'PATCH',
        url: `/v1/inventory/${sol.id}`,
        headers: authed(),
        payload: { printingId: other.scryfallId },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().printingId).toBe(other.scryfallId);
    }

    const bad = await app.inject({
      method: 'PATCH',
      url: `/v1/inventory/${sol.id}`,
      headers: authed(),
      payload: { printingId: 'does-not-exist' },
    });
    expect(bad.statusCode).toBe(404);
  });
});

describe('parseDecklist', () => {
  it('parses quantities, boards, and set annotations', () => {
    const lines = parseDecklist(`Commander\n1 Krenko, Mob Boss (C21) 263\n\nDeck\n4x Lightning Bolt\n30 Mountain\n# a comment\nSideboard\n2 Pyroblast`);
    expect(lines).toEqual([
      { quantity: 1, name: 'Krenko, Mob Boss', board: 'command', setCode: 'C21', collectorNumber: '263' },
      { quantity: 4, name: 'Lightning Bolt', board: 'mainboard', setCode: undefined, collectorNumber: undefined },
      { quantity: 30, name: 'Mountain', board: 'mainboard', setCode: undefined, collectorNumber: undefined },
      { quantity: 2, name: 'Pyroblast', board: 'sideboard', setCode: undefined, collectorNumber: undefined },
    ]);
  });
});
