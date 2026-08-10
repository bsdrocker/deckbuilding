import type { Board, CardData, Color, DeckData } from './types.js';

export interface FormatRule {
  /** Scryfall legalities key; undefined = don't enforce per-card legality. */
  legalityKey?: string;
  /** Minimum cards in the "counted" zone (mainboard + command). */
  minDeckSize: number;
  /** Exact deck size required (e.g. Commander = 100); overrides min when set. */
  exactDeckSize?: number;
  /** Max copies of a non-basic, non-unlimited card. */
  maxCopies: number;
  /** Whether the format enforces commander color identity. */
  enforcesColorIdentity: boolean;
  /** Requires exactly one card in the command zone. */
  requiresCommander: boolean;
  /** Maximum sideboard size (constructed). */
  maxSideboard?: number;
}

/** Rules per format. A pragmatic subset — expand toward full parity later. */
export const FORMAT_RULES: Record<string, FormatRule> = {
  commander: {
    legalityKey: 'commander',
    minDeckSize: 100,
    exactDeckSize: 100,
    maxCopies: 1,
    enforcesColorIdentity: true,
    requiresCommander: true,
  },
  oathbreaker: {
    legalityKey: 'oathbreaker',
    minDeckSize: 60,
    exactDeckSize: 60,
    maxCopies: 1,
    enforcesColorIdentity: true,
    requiresCommander: true,
  },
  brawl: {
    legalityKey: 'brawl',
    minDeckSize: 60,
    exactDeckSize: 60,
    maxCopies: 1,
    enforcesColorIdentity: true,
    requiresCommander: true,
  },
  standard: { legalityKey: 'standard', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  pioneer: { legalityKey: 'pioneer', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  modern: { legalityKey: 'modern', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  pauper: { legalityKey: 'pauper', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  legacy: { legalityKey: 'legacy', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  vintage: { legalityKey: 'vintage', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  historic: { legalityKey: 'historic', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  explorer: { legalityKey: 'explorer', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  premodern: { legalityKey: 'premodern', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  penny: { legalityKey: 'penny', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  duel: { legalityKey: 'duel', minDeckSize: 100, exactDeckSize: 100, maxCopies: 1, enforcesColorIdentity: true, requiresCommander: true },
  oldschool: { legalityKey: 'oldschool', minDeckSize: 60, maxCopies: 4, enforcesColorIdentity: false, requiresCommander: false, maxSideboard: 15 },
  limited: { minDeckSize: 40, maxCopies: 99, enforcesColorIdentity: false, requiresCommander: false },
  casual: { minDeckSize: 0, maxCopies: 99, enforcesColorIdentity: false, requiresCommander: false },
};

export function getFormatRule(format: string): FormatRule {
  return FORMAT_RULES[format] ?? FORMAT_RULES.casual!;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

const UNLIMITED_RE = /a deck can have any number of cards named/i;
const UP_TO_RE = /a deck can have up to (\d+|[a-z]+) cards? named/i;

/**
 * Copy-limit override granted by the card itself: Infinity for basic lands and
 * "any number of cards named" cards, the stated N for "up to N cards named"
 * cards (Nazgûl, Seven Dwarves), or null when the format's normal limit applies.
 */
export function copyLimitOverride(card: CardData): number | null {
  if (/\bBasic\b/.test(card.typeLine) && /\bLand\b/.test(card.typeLine)) return Infinity;
  const text = card.oracleText ?? '';
  if (UNLIMITED_RE.test(text)) return Infinity;
  const m = UP_TO_RE.exec(text);
  if (m) {
    const raw = m[1]!.toLowerCase();
    return /^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw] ?? null;
  }
  return null;
}

export interface ValidationIssue {
  code:
    | 'deck_size'
    | 'copies'
    | 'color_identity'
    | 'not_legal'
    | 'banned'
    | 'missing_commander'
    | 'sideboard_size';
  message: string;
  oracleId?: string;
  cardName?: string;
}

export interface ValidationResult {
  format: string;
  legal: boolean;
  issues: ValidationIssue[];
  counted: number; // cards in mainboard + command
  commanderColorIdentity: Color[] | null;
}

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

function countByBoard(deck: DeckData): Record<Board, number> {
  const totals: Record<Board, number> = { mainboard: 0, sideboard: 0, maybeboard: 0, command: 0 };
  for (const dc of deck.cards) totals[dc.board] += dc.quantity;
  return totals;
}

/** Union of color identities of the command-zone cards. */
export function commanderColorIdentity(deck: DeckData): Color[] | null {
  const commanders = deck.cards.filter((c) => c.board === 'command');
  if (commanders.length === 0) return null;
  const set = new Set<Color>();
  for (const c of commanders) for (const ci of c.card.colorIdentity) {
    if ((COLORS as string[]).includes(ci)) set.add(ci as Color);
  }
  return COLORS.filter((c) => set.has(c));
}

/**
 * Validate a deck against its format's rules: per-card legality, copy limits,
 * deck size, commander presence, and color-identity confinement.
 */
export function validateDeck(deck: DeckData): ValidationResult {
  const rule = getFormatRule(deck.format);
  const issues: ValidationIssue[] = [];
  const totals = countByBoard(deck);
  const counted = totals.mainboard + totals.command;

  // Per-card legality + copy limits (maybeboard is ignored — it's a scratchpad).
  for (const dc of deck.cards) {
    if (dc.board === 'maybeboard') continue;
    const legality = rule.legalityKey ? dc.card.legalities[rule.legalityKey] : 'legal';
    if (rule.legalityKey) {
      if (legality === 'banned') {
        issues.push({ code: 'banned', message: `${dc.card.name} is banned in ${deck.format}.`, oracleId: dc.oracleId, cardName: dc.card.name });
      } else if (legality === 'not_legal' || legality === undefined) {
        issues.push({ code: 'not_legal', message: `${dc.card.name} is not legal in ${deck.format}.`, oracleId: dc.oracleId, cardName: dc.card.name });
      }
    }
    const maxCopies = copyLimitOverride(dc.card) ?? (legality === 'restricted' ? 1 : rule.maxCopies);
    if (dc.quantity > maxCopies) {
      issues.push({
        code: 'copies',
        message: `${dc.card.name}: ${dc.quantity} copies exceeds limit of ${maxCopies} in ${deck.format}.`,
        oracleId: dc.oracleId,
        cardName: dc.card.name,
      });
    }
  }

  // Commander presence.
  if (rule.requiresCommander && totals.command === 0) {
    issues.push({ code: 'missing_commander', message: `${deck.format} requires a commander in the command zone.` });
  }

  // Color identity confinement.
  const ci = commanderColorIdentity(deck);
  if (rule.enforcesColorIdentity && ci) {
    const allowed = new Set(ci);
    for (const dc of deck.cards) {
      if (dc.board === 'maybeboard' || dc.board === 'command') continue;
      const offending = dc.card.colorIdentity.filter((c) => !allowed.has(c as Color));
      if (offending.length > 0) {
        issues.push({
          code: 'color_identity',
          message: `${dc.card.name} has colors outside the commander's identity (${offending.join('')}).`,
          oracleId: dc.oracleId,
          cardName: dc.card.name,
        });
      }
    }
  }

  // Deck size.
  if (rule.exactDeckSize !== undefined) {
    if (counted !== rule.exactDeckSize) {
      issues.push({ code: 'deck_size', message: `${deck.format} decks must have exactly ${rule.exactDeckSize} cards (have ${counted}).` });
    }
  } else if (counted < rule.minDeckSize) {
    issues.push({ code: 'deck_size', message: `${deck.format} decks need at least ${rule.minDeckSize} cards (have ${counted}).` });
  }

  // Sideboard size.
  if (rule.maxSideboard !== undefined && totals.sideboard > rule.maxSideboard) {
    issues.push({ code: 'sideboard_size', message: `Sideboard exceeds ${rule.maxSideboard} cards (have ${totals.sideboard}).` });
  }

  return {
    format: deck.format,
    legal: issues.length === 0,
    issues,
    counted,
    commanderColorIdentity: ci,
  };
}
