import type { Board } from '@deck/core';

export interface ParsedDeckLine {
  quantity: number;
  name: string;
  board: Board;
  /** Set code from a "(SET) 123" annotation, if present (upper-cased). */
  setCode?: string;
  /** Collector number from a "(SET) 123" annotation, if present. */
  collectorNumber?: string;
}

/**
 * Parse a plain-text decklist (Moxfield / Archidekt / MTGO style). Supports:
 *   "4 Lightning Bolt", "4x Lightning Bolt", "1 Sol Ring (C21) 263"
 * Section headers switch boards: lines like "Sideboard", "Commander", "Maybeboard",
 * or "Deck"/"Mainboard". Blank lines and comments (# / //) are ignored.
 *
 * A trailing "(SET) 123" / "[SET] 123" annotation is captured (setCode +
 * collectorNumber) so resolution can go through the exact printing — this is how
 * flavor-named reprints (e.g. Secret Lair "Adamantium Bonding Tank" = The Ozolith)
 * get matched, since their name alone isn't in the oracle table. Foil/etched
 * markers like "*F*" are stripped. Double-faced names written with a single slash
 * ("Miles Morales / Ultimate Spider-Man") are normalized to the "//" the oracle
 * table stores.
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
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    let rest = m[2]!.trim();

    // Strip trailing finish markers ("*F*", "*E*", "*etched*", possibly repeated).
    rest = rest.replace(/(?:\s*\*[^*]*\*)+\s*$/, '').trim();

    // Capture a trailing "(SET) collector" / "[SET] collector" annotation.
    // Collector numbers can carry letters/dashes (e.g. "OTC-303", "180a").
    let setCode: string | undefined;
    let collectorNumber: string | undefined;
    const ann = rest.match(/^(.*?)\s*[([]([A-Za-z0-9]{2,6})[)\]](?:\s+([A-Za-z0-9][A-Za-z0-9-]*))?\s*$/);
    if (ann && ann[1]!.trim()) {
      rest = ann[1]!.trim();
      setCode = ann[2]!.toUpperCase();
      collectorNumber = ann[3];
    }

    // Normalize double-faced names to the "//" separator the oracle table uses.
    let name = rest.replace(/\s*\/\/?\s*/g, ' // ').trim();
    if (!name) continue;

    out.push({ quantity, name, board, setCode, collectorNumber });
  }

  return out;
}
