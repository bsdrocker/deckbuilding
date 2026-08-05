# Deckbuilding

An **API-first Magic: The Gathering deck-building platform**. Its defining feature:
a documented REST API **and** an MCP server, so Claude (or any tool) can read your
decks, read your **card inventory**, and build/optimize decklists that favor cards
you **already own**. Long-term goal is feature parity with Moxfield / Archidekt;
**Milestones 1–5 are complete** (see the milestone notes below).

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

# 3. Import card data from Scryfall (default_cards: ~116k printings across ~38k cards, ~70s)
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
- **The browser only talks to the web app**; the web app calls the API
  server-side. So a deployment only needs to expose the web service — the API and
  Postgres stay internal.

## Deploying (Docker)

A production/QA stack (Postgres + API + web) is defined in
`docker-compose.prod.yml`, all built from `Dockerfile`.

```bash
cp .env.prod.example .env.prod                                                    # set secrets + your public domain
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build      # build + start (runs migrations)
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm api pnpm scryfall:import   # one-time card import
```

Only the `web` service is published (to `WEB_PORT`, default 3000); point a
reverse proxy (e.g. NGINX Proxy Manager, with TLS) at it. Migrations run
automatically via a one-shot `migrate` service; the Scryfall import is a manual
one-time step. Set `NODE_ENV=production` (done in the image) so the auth cookie
is marked `secure` behind HTTPS.

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

## Milestone 3 (done) — collection-aware decks

- **Deck primers** — a Markdown writeup per deck, rendered (and editable) in the
  deck view; settable via `PATCH /v1/decks/:id` and the MCP `update_deck` tool.
- **Built / brewing status** — mark a deck physically **built** (draws its cards
  down from inventory) vs. **brewing** (just a list). Status toggle + badges.
- **Inventory used / free** — owned cards show how many copies are **used** by
  built decks vs. **free** to brew with, with a filter (used/unused/conflict) and
  a **collection-conflicts** panel when built decks over-allocate a card. New
  `GET /v1/inventory/allocation`; `find_owned_options` gains `onlyFree`.
- **Fuller Scryfall grammar** — a proper boolean parser: parenthesised grouping,
  `and`/`or`, negated groups, and `is:` filters (`is:commander`, `is:permanent`,
  `is:vanilla`) on top of the existing operators.

## Milestone 4 (done) — deck UX + fuller grammar

- **Delete decks** — from the deck list (per-row) and the deck detail header,
  with an inline confirm. Deleting a deck never touches inventory (inventory has
  no FK to a deck). Backend `DELETE /v1/decks/:id`.
- **Click a card name → printing picker** — the card name opens the printing
  (art) gallery across the deck, card search, and inventory views; the separate
  picker button is gone.
- **Card hover previews** — hovering a card name shows its image everywhere.
- **Deck view grouped by type** — cards are grouped into Creatures, Planeswalkers,
  Enchantments, Sorceries, Instants, Artifacts, Battles, Lands (with counts) and
  sorted A–Z within each section.
- **Remaining Scryfall grammar** — mana cost (`m:` contains / `m=` exact), set
  (`s:` / `e:` / `set:`), release year (`year:` with `> < >= <=`), and
  planeswalker loyalty (`loy:` / `loyalty:`). A backfilled `loyalty_num` column
  supports the numeric loyalty filters.

### Milestone 4.1 — card-name autocomplete

- The deck **Add a card** field has a debounced typeahead (name + mana cost +
  type), ordered by EDHREC rank so popular cards surface first, with keyboard and
  mouse selection. It clears and refocuses after each add for fast entry. Reuses
  the existing card search (`GET /v1/cards?orderBy=edhrec`).

## Milestone 5 (done) — sharing & public decks

- **Deck visibility + share links** — each deck has a `private` / `unlisted` /
  `public` setting and an opaque `shareId`. The deck view has a visibility
  selector and a copy-link button (`/d/<shareId>`).
- **Read-only shared view** — `/d/<shareId>` renders a deck (type-grouped list,
  mana curve, stats) for anyone, logged in or not. No inventory data is exposed.
- **Public browse & author pages** — `/browse` lists public decks with
  format/color/name filters; `/u/<handle>` shows a user's public decks.
- **Clone** — "Copy to my decks" duplicates a shared deck into your account as a
  new private deck (`POST /v1/decks/clone`).
- **Public API** (unauthenticated): `GET /v1/public/decks`,
  `GET /v1/public/decks/:shareId(/analysis)`, `GET /v1/public/users/:handle/decks`.
  Private decks 404 there; unlisted decks are reachable by share id but excluded
  from browse.
- **MCP:** `list_public_decks` and `clone_deck` for AI-driven discovery/copying.

## Milestone 6+ (not yet built)

Collaborative/multi-user decks, playtesting/sample hands, price history over
time, social features (likes/comments/follows), and further UI polish toward
full Moxfield/Archidekt parity.
