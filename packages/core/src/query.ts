import type { CardData, Color } from './types.js';

export type NumericOp = '=' | '>' | '<' | '>=' | '<=';

export interface NumericConstraint {
  op: NumericOp;
  value: number;
}

/**
 * Structured, DB-agnostic representation of a parsed card query. The API layer
 * translates this into a Prisma `where`; tests and the MCP server can also use
 * {@link cardMatchesFilter} to evaluate it in memory.
 */
export interface CardFilter {
  nameIncludes: string[];
  typeIncludes: string[];
  oracleIncludes: string[];
  /** Card must contain these colors ('contains') or match exactly ('exact'). */
  colors?: { mode: 'contains' | 'exact'; values: Color[] };
  /** Card's color identity must be a subset of these colors (commander brewing). */
  colorIdentityWithin?: Color[];
  cmc: NumericConstraint[];
  /** Card must be legal (or restricted) in this format. */
  legalIn?: string;
  rarity: string[];
}

const COLOR_WORDS: Record<string, Color> = {
  w: 'W', white: 'W',
  u: 'U', blue: 'U',
  b: 'B', black: 'B',
  r: 'R', red: 'R',
  g: 'G', green: 'G',
};

function parseColors(raw: string): Color[] {
  const lower = raw.toLowerCase();
  // Word form (e.g. "blue") or letter cluster (e.g. "wu").
  if (COLOR_WORDS[lower]) return [COLOR_WORDS[lower]!];
  const out: Color[] = [];
  for (const ch of lower) {
    const c = COLOR_WORDS[ch];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function splitOp(rest: string): { op: NumericOp; value: string } | null {
  const m = rest.match(/^(>=|<=|=|>|<|:)(.+)$/);
  if (!m) return null;
  const op = m[1] === ':' ? '=' : (m[1] as NumericOp);
  return { op, value: m[2]! };
}

// Tokenize on whitespace but keep "quoted phrases" intact.
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2]!);
  }
  return tokens;
}

/**
 * Parse a subset of Scryfall query syntax:
 *   c:/color:  id:/identity:  t:/type:  o:/oracle:  cmc/mv (with >,<,>=,<=,=,:)
 *   f:/format:/legal:  r:/rarity:  and bare words (name contains), "quoted phrases".
 */
export function parseQuery(query: string): CardFilter {
  const filter: CardFilter = {
    nameIncludes: [],
    typeIncludes: [],
    oracleIncludes: [],
    cmc: [],
    rarity: [],
  };

  for (const token of tokenize(query)) {
    const colon = token.indexOf(':');
    const opMatch = token.match(/^(cmc|mv)(>=|<=|=|>|<|:)/i);

    if (opMatch) {
      const parsed = splitOp(token.slice(opMatch[1]!.length));
      const num = parsed ? Number(parsed.value) : NaN;
      if (parsed && !Number.isNaN(num)) filter.cmc.push({ op: parsed.op, value: num });
      continue;
    }

    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase();
      const value = token.slice(colon + 1);
      switch (key) {
        case 'c':
        case 'color':
        case 'colors':
          filter.colors = { mode: 'contains', values: parseColors(value) };
          continue;
        case 'c!':
          filter.colors = { mode: 'exact', values: parseColors(value) };
          continue;
        case 'id':
        case 'identity':
          filter.colorIdentityWithin = parseColors(value);
          continue;
        case 't':
        case 'type':
          filter.typeIncludes.push(value.toLowerCase());
          continue;
        case 'o':
        case 'oracle':
          filter.oracleIncludes.push(value.toLowerCase());
          continue;
        case 'f':
        case 'format':
        case 'legal':
          filter.legalIn = value.toLowerCase();
          continue;
        case 'r':
        case 'rarity':
          filter.rarity.push(value.toLowerCase());
          continue;
        default:
          // Unknown prefix — treat the whole token as a name fragment.
          filter.nameIncludes.push(token.toLowerCase());
          continue;
      }
    }

    filter.nameIncludes.push(token.toLowerCase());
  }

  return filter;
}

function cmcMatches(cmc: number, c: NumericConstraint): boolean {
  switch (c.op) {
    case '=':
      return cmc === c.value;
    case '>':
      return cmc > c.value;
    case '<':
      return cmc < c.value;
    case '>=':
      return cmc >= c.value;
    case '<=':
      return cmc <= c.value;
  }
}

/** Evaluate a parsed filter against a single card in memory. */
export function cardMatchesFilter(card: CardData, filter: CardFilter): boolean {
  const name = card.name.toLowerCase();
  const type = card.typeLine.toLowerCase();
  const oracle = (card.oracleText ?? '').toLowerCase();

  if (!filter.nameIncludes.every((n) => name.includes(n))) return false;
  if (!filter.typeIncludes.every((t) => type.includes(t))) return false;
  if (!filter.oracleIncludes.every((o) => oracle.includes(o))) return false;
  if (!filter.cmc.every((c) => cmcMatches(card.cmc, c))) return false;

  if (filter.colors) {
    const set = new Set(card.colors);
    if (filter.colors.mode === 'contains') {
      if (!filter.colors.values.every((c) => set.has(c))) return false;
    } else {
      if (set.size !== filter.colors.values.length || !filter.colors.values.every((c) => set.has(c)))
        return false;
    }
  }

  if (filter.colorIdentityWithin) {
    const allowed = new Set(filter.colorIdentityWithin);
    if (!card.colorIdentity.every((c) => allowed.has(c as Color))) return false;
  }

  if (filter.legalIn) {
    const l = card.legalities[filter.legalIn];
    if (l !== 'legal' && l !== 'restricted') return false;
  }

  if (filter.rarity.length > 0) {
    // Rarity lives on printings, not oracle data; in-memory eval can't check it.
    // The API applies rarity at the printing level. Here we don't reject.
  }

  return true;
}
