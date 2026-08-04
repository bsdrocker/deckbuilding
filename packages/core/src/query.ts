import type { CardData, Color } from './types.js';

export type NumericOp = '=' | '>' | '<' | '>=' | '<=';

export interface NumericConstraint {
  op: NumericOp;
  value: number;
}

/**
 * A color / color-identity comparison (Scryfall style). `op` compares the card's
 * color set S against the query set Q:
 *   '<=' S ⊆ Q · '>=' S ⊇ Q · '=' S = Q · '<' proper subset · '>' proper superset
 */
export interface ColorConstraint {
  op: NumericOp;
  values: Color[];
}

/** An atomic search condition (a leaf of the boolean expression tree). */
export type Term =
  | { kind: 'name'; value: string }
  | { kind: 'type'; value: string }
  | { kind: 'oracle'; value: string }
  | { kind: 'keyword'; value: string }
  | { kind: 'cmc'; c: NumericConstraint }
  | { kind: 'power'; c: NumericConstraint }
  | { kind: 'toughness'; c: NumericConstraint }
  | { kind: 'colors'; c: ColorConstraint }
  | { kind: 'identity'; c: ColorConstraint }
  | { kind: 'rarity'; value: string }
  | { kind: 'legal'; value: string }
  | { kind: 'is'; value: string };

/** Boolean expression over terms: `space` = AND, `or` = OR, `-`/`not` = NOT, `()` groups. */
export type Expr =
  | { op: 'and'; nodes: Expr[] }
  | { op: 'or'; nodes: Expr[] }
  | { op: 'not'; node: Expr }
  | { op: 'term'; term: Term }
  | { op: 'true' }; // empty query matches everything

export interface CardQuery {
  root: Expr;
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
  if (COLOR_WORDS[lower]) return [COLOR_WORDS[lower]!];
  const out: Color[] = [];
  for (const ch of lower) {
    const c = COLOR_WORDS[ch];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function unquote(s: string): string {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

function splitOp(rest: string): { op: NumericOp; value: string } | null {
  const m = rest.match(/^(>=|<=|=|>|<|:)(.+)$/);
  if (!m) return null;
  return { op: m[1] === ':' ? '=' : (m[1] as NumericOp), value: m[2]! };
}

const NUMERIC_KEYS = /^(cmc|mv|pow|power|tou|toughness)(>=|<=|=|>|<|:)/i;
const COLOR_KEYS = /^(identity|colors?|ci|id|c)(<=|>=|=|<|>|:|!)/i;

function colorOp(raw: string, isIdentity: boolean): NumericOp {
  if (raw === ':') return isIdentity ? '<=' : '>='; // id: subset, c: contains
  if (raw === '!') return '=';
  return raw as NumericOp;
}

// ---------------------------------------------------------------------------
// Tokenizer: parens are their own tokens; quoted phrases stay attached to a term.
// ---------------------------------------------------------------------------
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const re = /[()]|[^\s()"]*"[^"]*"|[^\s()]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) if (m[0]) tokens.push(m[0]);
  return tokens;
}

/** Build a single Term from a token string (no leading `-`). Null if unusable. */
function parseTermString(token: string): Term | null {
  const numMatch = token.match(NUMERIC_KEYS);
  if (numMatch) {
    const key = numMatch[1]!.toLowerCase();
    const parsed = splitOp(token.slice(numMatch[1]!.length));
    const num = parsed ? Number(parsed.value) : NaN;
    if (!parsed || Number.isNaN(num)) return null;
    const c = { op: parsed.op, value: num };
    if (key === 'cmc' || key === 'mv') return { kind: 'cmc', c };
    if (key === 'pow' || key === 'power') return { kind: 'power', c };
    return { kind: 'toughness', c };
  }

  const colorMatch = token.match(COLOR_KEYS);
  if (colorMatch) {
    const key = colorMatch[1]!.toLowerCase();
    const rawOp = colorMatch[2]!;
    const values = parseColors(unquote(token.slice(colorMatch[1]!.length + rawOp.length)));
    const isIdentity = key === 'id' || key === 'identity' || key === 'ci';
    const c: ColorConstraint = { op: colorOp(rawOp, isIdentity), values };
    return isIdentity ? { kind: 'identity', c } : { kind: 'colors', c };
  }

  const colon = token.indexOf(':');
  if (colon > 0) {
    const key = token.slice(0, colon).toLowerCase();
    const value = unquote(token.slice(colon + 1)).toLowerCase();
    switch (key) {
      case 't': case 'type': return { kind: 'type', value };
      case 'o': case 'oracle': return { kind: 'oracle', value };
      case 'kw': case 'keyword': return { kind: 'keyword', value };
      case 'f': case 'format': case 'legal': return { kind: 'legal', value };
      case 'r': case 'rarity': return { kind: 'rarity', value };
      case 'is': return { kind: 'is', value };
      default: return { kind: 'name', value: unquote(token).toLowerCase() };
    }
  }

  return { kind: 'name', value: unquote(token).toLowerCase() };
}

// ---------------------------------------------------------------------------
// Recursive-descent parser: OR > AND > NOT > atom. Space = implicit AND.
// ---------------------------------------------------------------------------
class Parser {
  private i = 0;
  constructor(private readonly toks: string[]) {}
  private peek(): string | undefined {
    return this.toks[this.i];
  }
  private next(): string | undefined {
    return this.toks[this.i++];
  }

  parse(): Expr {
    if (this.toks.length === 0) return { op: 'true' };
    const e = this.parseOr();
    return e;
  }

  private parseOr(): Expr {
    const nodes = [this.parseAnd()];
    while (this.peek()?.toLowerCase() === 'or') {
      this.next();
      nodes.push(this.parseAnd());
    }
    return nodes.length === 1 ? nodes[0]! : { op: 'or', nodes };
  }

  private parseAnd(): Expr {
    const nodes: Expr[] = [];
    for (;;) {
      const t = this.peek();
      if (t === undefined || t === ')' || t.toLowerCase() === 'or') break;
      if (t.toLowerCase() === 'and') {
        this.next();
        continue;
      }
      nodes.push(this.parseNot());
    }
    if (nodes.length === 0) return { op: 'true' };
    return nodes.length === 1 ? nodes[0]! : { op: 'and', nodes };
  }

  private parseNot(): Expr {
    const t = this.peek();
    if (t === '-' || t?.toLowerCase() === 'not') {
      this.next();
      return { op: 'not', node: this.parseNot() };
    }
    return this.parseAtom();
  }

  private parseAtom(): Expr {
    const t = this.next();
    if (t === undefined) return { op: 'true' };
    if (t === '(') {
      const inner = this.parseOr();
      if (this.peek() === ')') this.next();
      return inner;
    }
    // A term token may carry an attached leading `-` (negates just this term).
    let str = t;
    let negate = false;
    if (str.startsWith('-') && str.length > 1) {
      negate = true;
      str = str.slice(1);
    }
    const term = parseTermString(str);
    if (!term) return { op: 'true' };
    const node: Expr = { op: 'term', term };
    return negate ? { op: 'not', node } : node;
  }
}

/**
 * Parse a Scryfall-style query into a boolean expression tree. Supports:
 *   c:/id: (+ comparison ops), t:, o:, kw:, r:, f:, is:, cmc/pow/tou (with ops),
 *   quoted phrases, `-`/`not` negation, `or`/`and`, and parenthesised grouping.
 */
export function parseQuery(query: string): CardQuery {
  return { root: new Parser(tokenize(query)).parse() };
}

// ---------------------------------------------------------------------------
// Evaluation (in-memory)
// ---------------------------------------------------------------------------
function numMatches(value: number, c: NumericConstraint): boolean {
  switch (c.op) {
    case '=': return value === c.value;
    case '>': return value > c.value;
    case '<': return value < c.value;
    case '>=': return value >= c.value;
    case '<=': return value <= c.value;
  }
}

function parseStat(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function colorConstraintMatches(cardColors: string[], c: ColorConstraint): boolean {
  const S = new Set(cardColors);
  const Q = new Set<string>(c.values);
  const subset = [...S].every((x) => Q.has(x));
  const superset = [...Q].every((x) => S.has(x));
  switch (c.op) {
    case '<=': return subset;
    case '>=': return superset;
    case '=': return subset && superset;
    case '<': return subset && !superset;
    case '>': return superset && !subset;
  }
}

function isMatches(card: CardData, value: string): boolean {
  const type = card.typeLine.toLowerCase();
  const oracle = (card.oracleText ?? '').toLowerCase();
  switch (value) {
    case 'commander':
      return (
        (type.includes('legendary') && type.includes('creature')) ||
        oracle.includes('can be your commander')
      );
    case 'permanent':
      return !type.includes('instant') && !type.includes('sorcery');
    case 'spell':
      return !type.includes('land');
    case 'vanilla':
      return type.includes('creature') && oracle.trim() === '';
    default:
      return false; // unknown is: filter matches nothing (never silently "all")
  }
}

function termMatches(card: CardData, term: Term): boolean {
  switch (term.kind) {
    case 'name': return card.name.toLowerCase().includes(term.value);
    case 'type': return card.typeLine.toLowerCase().includes(term.value);
    case 'oracle': return (card.oracleText ?? '').toLowerCase().includes(term.value);
    case 'keyword': return (card.keywords ?? []).map((k) => k.toLowerCase()).includes(term.value);
    case 'cmc': return numMatches(card.cmc, term.c);
    case 'power': {
      const p = parseStat(card.power);
      return p !== null && numMatches(p, term.c);
    }
    case 'toughness': {
      const t = parseStat(card.toughness);
      return t !== null && numMatches(t, term.c);
    }
    case 'colors': return colorConstraintMatches(card.colors, term.c);
    case 'identity': return colorConstraintMatches(card.colorIdentity, term.c);
    case 'rarity': return false; // rarity is printing-level; not available in-memory
    case 'legal': {
      const l = card.legalities[term.value];
      return l === 'legal' || l === 'restricted';
    }
    case 'is': return isMatches(card, term.value);
  }
}

function evalExpr(card: CardData, e: Expr): boolean {
  switch (e.op) {
    case 'true': return true;
    case 'term': return termMatches(card, e.term);
    case 'not': return !evalExpr(card, e.node);
    case 'and': return e.nodes.every((n) => evalExpr(card, n));
    case 'or': return e.nodes.some((n) => evalExpr(card, n));
  }
}

/** Evaluate a parsed query against a card in memory. */
export function cardMatchesQuery(card: CardData, query: CardQuery): boolean {
  return evalExpr(card, query.root);
}
