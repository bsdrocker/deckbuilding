# @deck/mcp — Deckbuilding MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
the deck-building platform to Claude (Desktop, Code, or any MCP client), so an AI
can search cards, read your decks, read your **inventory**, and build decks that
favor cards you **already own**.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_cards` | Search the card DB with Scryfall-subset syntax (`c:`, `id:`, `t:`, `o:`, `cmc`, `f:`). |
| `get_card` | Look up a card by name (exact then fuzzy) with recent printings. |
| `list_decks` / `get_deck` | List/read your decks. |
| `create_deck` / `update_deck` / `import_deck` | Create, update metadata (status/primer/…), or import a deck. |
| `add_cards_to_deck` | Add cards (increments existing counts). |
| `set_card_quantity` / `remove_card_from_deck` | Edit a deck in place — set exact quantity (upserts; 0 removes) or remove, by name/oracleId. |
| `analyze_deck` | Mana curve, color pips, type split, price, and format legality. |
| `get_inventory` / `add_inventory` | Read (with used/free allocation) or add to your collection. |
| `import_inventory_csv` | Bulk-import a ManaBox/Moxfield/Deckbox collection CSV. |
| **`deck_inventory_diff`** | Owned vs. missing copies for a deck, plus cost to complete. |
| **`find_owned_options`** | Cards you already own that match a query — bias deckbuilding toward your collection (`onlyFree` excludes cards committed to built decks). |

## Backends: local database vs. deployed API

The server can reach the platform two ways, selected by environment:

- **database** (default) — in-process against a local Postgres. Set
  `DATABASE_URL`. Best for local dev / Cowork on the same machine as the DB.
- **http** — talk to a deployed instance's REST API over HTTPS with your key as a
  bearer token. Set **`DECK_API_URL`** (e.g. `https://mtg.example.com`) and leave
  `DATABASE_URL` unset. No database access required — ideal for using a remote QA
  or production instance.

> The http backend needs the platform's `/v1` API reachable at `DECK_API_URL`.
> If your reverse proxy only exposes the web app, add a proxy host (or path) for
> the API before using http mode.

## Authentication

The server authenticates as a single user via an API key in `DECKBUILDER_API_KEY`
(a Bearer token in http mode, resolved against the DB in database mode). Create
one through the API:

```bash
# Register (returns an apiKey) — or use POST /v1/keys if you already have one.
curl -sX POST http://localhost:3001/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","handle":"you","password":"password123"}'
```

## Configure in Claude Desktop

Add to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "deckbuilding": {
      "command": "node",
      "args": ["/absolute/path/to/deckbuilding/apps/mcp/dist/server.js"],
      "env": {
        "DATABASE_URL": "postgresql://deck:deck@localhost:5432/deckbuilding?schema=public",
        "DECKBUILDER_API_KEY": "deck_live_..."
      }
    }
  }
}
```

For **http mode** (a deployed instance), swap the `env` block:

```json
"env": {
  "DECK_API_URL": "https://mtg.example.com",
  "DECKBUILDER_API_KEY": "deck_live_..."
}
```

Build first with `pnpm --filter @deck/mcp build`. Then restart Claude Desktop.

## Configure in Claude Code

```bash
claude mcp add deckbuilding \
  --env DATABASE_URL="postgresql://deck:deck@localhost:5432/deckbuilding?schema=public" \
  --env DECKBUILDER_API_KEY="deck_live_..." \
  -- node /absolute/path/to/deckbuilding/apps/mcp/dist/server.js
```

For a deployed instance (http mode), use `DECK_API_URL` instead of `DATABASE_URL`:

```bash
claude mcp add deckbuilding \
  --env DECK_API_URL="https://mtg.example.com" \
  --env DECKBUILDER_API_KEY="deck_live_..." \
  -- node /absolute/path/to/deckbuilding/apps/mcp/dist/server.js
```

## Example prompts

- "Search for red removal spells legal in Commander that cost 2 or less."
- "Create a Krenko goblins Commander deck, and only add cards I already own — use `find_owned_options` and `deck_inventory_diff` to keep the buy list small."
- "Analyze my 'Krenko' deck and tell me what it needs to be format-legal."
