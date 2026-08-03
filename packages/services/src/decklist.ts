import type { Board } from '@deck/core';

export interface ParsedDeckLine {
  quantity: number;
  name: string;
  board: Board;
}

/**
 * Parse a plain-text decklist (Moxfield / Archidekt / MTGO style). Supports:
 *   "4 Lightning Bolt", "4x Lightning Bolt", "1 Sol Ring (C21) 263"
 * Section headers switch boards: lines like "Sideboard", "Commander", "Maybeboard",
 * or "Deck"/"Mainboard". Blank lines and comments (# / //) are ignored.
 * Set/collector-number annotations in parentheses/brackets are stripped — we
 * resolve by name at the oracle level.
 */
export function parseDecklist(text: string): ParsedDeckLine[] {
  const lines = text.split(/\r?\n/);
  const out: ParsedDeckLine[] = [];
  let board: Board = 'mainboard';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const header = line.toLowerCase().replace(/:$/, '');
    if (['deck', 'mainboard', 'main'].includes(header)) {
      board = 'mainboard';
      continue;
    }
    if (['sideboard', 'side'].includes(header)) {
      board = 'sideboard';
      continue;
    }
    if (['maybeboard', 'maybe', 'considering'].includes(header)) {
      board = 'maybeboard';
      continue;
    }
    if (['commander', 'command zone', 'commanders'].includes(header)) {
      board = 'command';
      continue;
    }

    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (!m) continue;
    const quantity = Number(m[1]);
    let name = m[2]!.trim();
    // Strip trailing "(SET) 123" / "[SET]" annotations.
    name = name.replace(/\s*[([][A-Za-z0-9]{2,6}[)\]].*$/, '').trim();
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;

    out.push({ quantity, name, board });
  }

  return out;
}
