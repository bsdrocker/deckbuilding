# Deckbuilding

An **API-first Magic: The Gathering deck-building platform**. Its defining feature:
a documented REST API **and** an MCP server, so Claude (or any tool) can read your
decks, read your **card inventory**, and build/optimize decklists that favor cards
you **already own**. Long-term goal is feature parity with Moxfield / Archidekt;
this is **Milestone 1 — the core foundation**.

## What's here

| Package | Description |
| --- | --- |
| `packages/db` | Prisma schema + Postgres (oracle cards, printings, users, decks, inventory). |
| `packages/scryfall` | Streaming importer for Scryfall bulk data (gzipped JSONL). |
| `packages/core` | Pure domain logic: format legality, deck stats, **inventory diff**, query parser. |
| `packages/services` | Shared operations over db+core (auth, cards, decks, inventory) used by API + MCP. |
| `apps/api` | Fastify REST API with API-key auth and OpenAPI docs at `/docs`. |
| `apps/mcp` | MCP server exposing the platform to Claude — incl. `deck_inventory_diff` & `find_owned_options`. |
| `apps/web` | Minimal Next.js UI: decks, card search, inventory, deck analysis + completion bar. |

## Prerequisites

- **Node ≥ 20**, **pnpm 9** (`npm i -g pnpm@9`)
- **Docker** (for local Postgres)

## Quick start

```bash
# 1. Install
pnpm install

# 2. Start Postgres and create the schema
cp .env.example .env
docker compose up -d
pnpm --filter @deck/db exec prisma migrate deploy   # or: pnpm db:migrate (dev)
pnpm db:seed                                         # demo user + API key

# 3. Import card data from Scryfall (~38k cards, ~30s)
pnpm scryfall:import                                 # add --limit 500 for a quick subset

# 4. Run the API (http://localhost:3001, docs at /docs)
pnpm --filter @deck/api dev

# 5. Run the web app (http://localhost:3000)
pnpm --filter @deck/web dev
```

**Demo login:** `demo@deckbuilding.local` / `password`
**Demo API key:** `deck_dev_demo_0000000000000000`

## Using the API

```bash
# Register (returns an apiKey shown once)
curl -sX POST http://localhost:3001/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","handle":"you","password":"password123"}'

# Search cards (Scryfall-subset syntax)
curl -s 'http://localhost:3001/v1/cards?q=t:creature%20id:r%20cmc<=3%20f:commander&limit=5' \
  -H 'authorization: Bearer deck_dev_demo_0000000000000000'
```

Full interactive docs (OpenAPI/Swagger UI): **http://localhost:3001/docs**

## Using the MCP server (the AI part)

Build it, then point Claude at it — see [`apps/mcp/README.md`](apps/mcp/README.md).
Once connected you can ask Claude things like:

> "Create a Krenko goblins Commander deck, and prefer cards I already own —
> use `find_owned_options` and `deck_inventory_diff` to keep the buy list small."

The inventory-aware tools are the differentiator: the AI sees exactly which cards
you own and how much a deck would cost to complete, so it optimizes toward your
collection instead of an ideal-but-expensive list.

## The inventory-aware optimization loop

1. Store your collection (`/v1/inventory`, or `add_inventory` via MCP).
2. Build or import a deck.
3. `GET /v1/decks/:id/inventory-diff` (or `deck_inventory_diff`) → owned vs. missing + cost.
4. `find_owned_options` surfaces owned cards fitting a role, so swaps prefer the collection.

## Tests

```bash
pnpm test          # all workspaces (core unit tests + API integration + importer)
```

The API integration tests run against the dev Postgres, so keep the DB up and the
card data imported.

## Architecture notes

- **Cards** mirror Scryfall's split: `OracleCard` (rules identity, what decks
  reference) vs. `CardPrinting` (a physical print, what inventory references).
  Inventory-diff joins them: a deck "wants Sol Ring"; you own a specific printing.
- **Auth** is API-key based (`Authorization: Bearer <key>`); keys are stored hashed.
- The **web app** and **MCP server** both go through `@deck/services`, so business
  rules live in one place.

## Milestone 2 (done)

- **Deck card management in the UI** — quantity steppers, board moves, remove,
  and a preferred-printing (art) picker per card.
- **Bulk inventory import via CSV** — ManaBox/Moxfield/Deckbox exports; rows
  resolve by Scryfall ID → set+collector → name. Endpoint `POST /v1/inventory/import`
  and MCP tool `import_inventory_csv`.
- **Printing / finish / condition selection** — a printing-aware inventory add
  flow and inline editing of owned items.
- **Card images** — Scryfall art on hover across decks, search, and inventory.
- **Richer Scryfall search** — negation (`-`), `or`, keywords (`kw:`), rarity
  (`r:`), and power/toughness (`pow`/`tou`) in addition to `c: id: t: o: cmc f:`.
- **Collection value tracking** — finish-aware value rollups, top cards, per-deck
  owned value, and CSV export (`GET /v1/inventory/export.csv`).

## Milestone 3+ (not yet built)

Public deck browsing/social + shareable links, playtesting/sample hands, price
history over time, collaborative decks, the full Scryfall grammar (nested
parentheses, all `is:` filters), and further UI polish toward full
Moxfield/Archidekt parity.
