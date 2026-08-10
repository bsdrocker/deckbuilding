# M6 Handoff — Deckbuilding usability features

> [!NOTE]
> **✅ Completed in PRs #17–#20 (merged 2026-08-10).** All five M6 features
> below have shipped: copy-limit overrides, Commander brackets, inventory
> search, per-card deck prices, and owned-or-cheapest default printing. See the
> README's Milestone 6 section for what shipped. This doc is kept as a
> historical record of the plan and for the working conventions below.

Context handoff for picking up **M6** in a fresh session. Goal: five usability
features (below). Everything through M5.2 + M6 groundwork is already merged.

## Where things stand

- Repo on `main` (PRs #1–#15 merged). M1–M5.2 + M6 groundwork done.
- **Deployed to QA:** `https://mtg.bsdrocker.com` (Docker prod stack). The MCP
  runs in HTTP mode against QA (`~/Library/Application Support/Claude/claude_desktop_config.json`).
- **Run locally:** `docker compose up -d` (Postgres :5432), then
  `pnpm --filter @deck/api dev` (:3001) and `pnpm --filter @deck/web dev`
  (or `preview_start web`). Demo login `demo@deckbuilding.local` / `password`;
  demo key `deck_dev_demo_0000000000000000`.
- **Architecture:** pnpm/Turbo monorepo. `packages/core` (pure logic:
  formats/legality, stats, inventory-diff, query parser), `packages/services`
  (DB ops; take `prisma` + `userId`), `packages/scryfall` (bulk import),
  `apps/api` (Fastify REST `/v1`), `apps/mcp` (stdio server, dual backend),
  `apps/web` (Next.js). The **web app calls the API server-side**; the browser
  only talks to web.

## Working conventions (learned in prior sessions)

- **Flow per feature:** branch → `pnpm --filter <pkg> typecheck` + relevant tests
  → browser-verify with the preview tools → open PR → merge. Fold README
  milestone notes into the same PR.
- **Gotchas:**
  - `window.confirm` is suppressed in the Cowork webview → use an inline
    two-step confirm (see `apps/web/app/decks/DeleteDeckButton.tsx`).
  - Browser-automation coordinate clicks drift when viewport ≠ screenshot size →
    reset to native (`resize_window` desktop preset) or drive via `read_page`
    refs / DOM `.click()`.
  - Don't run a full `pnpm build` while the web dev server is up — it corrupts
    `.next`; use per-package `typecheck`.
  - Prices live in `card_printings.prices` JSON as **strings** (`usd`,
    `usd_foil`, `usd_etched`).
  - Concurrent sessions sometimes mutate the same local DB.

## The five M6 features

### 1. Legality: honor "any number of cards named X" cards

**Bug:** a deck with 9 Nazgûl is flagged illegal, but the card says "A deck can
have any number of cards named Nazgûl." Same for Relentless Rats, Rat Colony,
Persistent Petitioners, Seven Dwarves, Shadowborn Apostle, Dragon's Approach,
Templar Knight, etc.

- **Where:** `packages/core/src/formats.ts` → `validateDeck` (~L118), the
  `copies` check (~L138) that flags `dc.quantity > maxCopies`.
- **Fix:** skip the copy limit when the card is a basic land (may already be
  handled) **or** its oracle text matches
  `/a deck can have any number of cards named/i`. `dc.card.oracleText` is
  available (`toDeckData` maps it). Add tests in `formats.test.ts` with a
  fixture card carrying that oracle text.

### 2. Commander Bracket awareness (biggest new piece)

Flag Game Changer cards and classify a Commander deck as Bracket 3/4/5 (WotC's
2025 bracket system).

- **Net new.** Add a maintained **Game Changer list** (card names — ~40 cards;
  pull the current official list) as a constant, likely
  `packages/core/src/gameChangers.ts` or `brackets.ts`.
- **Logic:** only for `format === 'commander'`. Identify which deck cards are on
  the list; compute a suggested bracket (Bracket 2 = none; Bracket 3 = ≤3 Game
  Changers + limits on mass land denial / extra-turn chains / tutors; Bracket
  4/5 = more/unrestricted). Reference the official bracket definitions for exact
  thresholds.
- **Surface:** extend `analyzeDeck` (`packages/services/src/analysis.ts`) output +
  the deck view (list which cards are Game Changers, show the bracket). Consider
  an MCP-visible field too.

### 3. Inventory search / filter by card

- **Where:** `packages/services/src/inventory.ts` → `listInventory` (~L94). The
  `where` starts as `{ userId }`; add a `q` option →
  `printing: { oracle: { name: { contains: q, mode: 'insensitive' } } }`.
- **Wire:** add `q` to the `/v1/inventory` querystring
  (`apps/api/src/routes/inventory.ts`), the web action, and a search input on
  `apps/web/app/inventory/page.tsx` (mirror the `/browse` filter form GET
  pattern; existing sort/filter links already round-trip query params).

### 4. Per-card prices in the deck view

Show each card's price in the deck rows so the priciest cards are obvious.

- **Prices today:** `packages/services/src/prices.ts` → `representativePrices`
  returns the **cheapest** USD per oracle (across printings). `analyzeDeck`
  already sums `totalPriceUsd`.
- **Approach:** add a `priceUsd` per card to the **availability endpoint**
  (`GET /v1/decks/:id/availability`, service `deckAvailability` in
  `inventory.ts`) — the deck page already fetches it and passes it to
  `DeckCardRow`. If a printing is pinned, price *that* printing; else the
  representative/cheapest. Render in
  `apps/web/app/decks/[id]/DeckCardRow.tsx` (there's a `.mana` slot to mirror).
  Pairs naturally with #5.

### 5. Default deck art = owned-or-cheapest printing

- **Today:** `addCardsToDeck` (`packages/services/src/decks.ts`) resolves the
  oracle but sets **no `printingId`** (null). The UI/`representative` printing is
  `printings[0]` ordered by `releasedAt desc` (newest) — see `ALL_PRINTINGS` in
  `cards.ts` (~L173).
- **Change:** when a deck card has no explicit printing, the default
  displayed/priced printing should be **a printing the user owns**, else the
  **cheapest**. Options: (A) persist a chosen `printingId` at add time in
  `addCardsToDeck` (owned → else cheapest), or (B) keep `printingId` null but
  change the default-printing resolver to owned-or-cheapest. (A) keeps art +
  price consistent and is probably cleaner. Reuse `ownedPrintingsForOracle`.

## Useful existing pieces to reuse

- `ownedPrintingsForOracle` (inventory.ts) — per-printing ownership for a card (M5.2).
- `deckAvailability` / `GET /v1/decks/:id/availability` — per-card owned/missing/
  printing status (M5.1).
- `representativePrices` — cheapest USD per oracle.
- Inline-confirm + typeahead (`CardAutocomplete`) components for new UI.
- MCP dual-backend: any new API endpoint should get a matching `Backend` method
  in `apps/mcp/src/backend.ts` (both DB + HTTP impls) to expose it as a tool.
