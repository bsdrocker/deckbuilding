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

/**
 * One AND-clause of a card query. A {@link CardQuery} is an OR of clauses.
 * `*Excludes`/`*Excluded` fields are negations (`-t:creature`).
 */
export interface CardClause {
  nameIncludes: string[];
  nameExcludes: string[];
  typeIncludes: string[];
  typeExcludes: string[];
  oracleIncludes: string[];
  oracleExcludes: string[];
  keywords: string[];
  keywordsExcluded: string[];
  colors?: ColorConstraint;
  colorsExcluded: Color[];
  colorIdentity?: ColorConstraint;
  cmc: NumericConstraint[];
  power: NumericConstraint[];
  toughness: NumericConstraint[];
  rarity: string[];
  legalIn?: string;
}

/** A parsed query: card matches if ANY clause matches (OR). */
export interface CardQuery {
  or: CardClause[];
}

const COLOR_WORDS: Record<string, Color> = {
  w: 'W', white: 'W',
  u: 'U', blue: 'U',
  b: 'B', black: 'B',
  r: 'R', red: 'R',
  g: 'G', green: 'G',
};

function emptyClause(): CardClause {
  return {
    nameIncludes: [], nameExcludes: [],
    typeIncludes: [], typeExcludes: [],
    oracleIncludes: [], oracleExcludes: [],
    keywords: [], keywordsExcluded: [],
    colorsExcluded: [],
    cmc: [], power: [], toughness: [],
    rarity: [],
  };
}

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

function splitOp(rest: string): { op: NumericOp; value: string } | null {
  const m = rest.match(/^(>=|<=|=|>|<|:)(.+)$/);
  if (!m) return null;
  const op = m[1] === ':' ? '=' : (m[1] as NumericOp);
  return { op, value: m[2]! };
}

// Tokenize on whitespace while keeping a quoted phrase attached to its token,
// so `o:"destroy all"`, `-t:"legendary creature"`, and bare `"mob boss"` each
// stay a single token (quotes stripped later by unquote()).
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const re = /[^\s"]*"[^"]*"|[^\s"]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    if (m[0]) tokens.push(m[0]);
  }
  return tokens;
}

/** Strip a single pair of surrounding double quotes, if present. */
function unquote(s: string): string {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

const NUMERIC_KEYS = /^(cmc|mv|pow|power|tou|toughness)(>=|<=|=|>|<|:)/i;
// Color / identity keys accept comparison operators (Scryfall style): id<=wb, c>=r.
const COLOR_KEYS = /^(identity|colors?|ci|id|c)(<=|>=|=|<|>|:|!)/i;

/** Map a raw color operator to a comparison. `:` defaults differ by key. */
function colorOp(raw: string, isIdentity: boolean): NumericOp {
  if (raw === ':') return isIdentity ? '<=' : '>='; // id: is subset, c: is contains
  if (raw === '!') return '=';
  return raw as NumericOp;
}

function applyToken(clause: CardClause, rawToken: string): void {
  let token = rawToken;
  let negate = false;
  if (token.startsWith('-') && token.length > 1) {
    negate = true;
    token = token.slice(1);
  }

  const numMatch = token.match(NUMERIC_KEYS);
  if (numMatch) {
    const key = numMatch[1]!.toLowerCase();
    const parsed = splitOp(token.slice(numMatch[1]!.length));
    const num = parsed ? Number(parsed.value) : NaN;
    if (parsed && !Number.isNaN(num)) {
      const constraint = { op: parsed.op, value: num };
      if (key === 'cmc' || key === 'mv') clause.cmc.push(constraint);
      else if (key === 'pow' || key === 'power') clause.power.push(constraint);
      else clause.toughness.push(constraint);
    }
    return;
  }

  const colorMatch = token.match(COLOR_KEYS);
  if (colorMatch) {
    const key = colorMatch[1]!.toLowerCase();
    const rawOp = colorMatch[2]!;
    const values = parseColors(unquote(token.slice(colorMatch[1]!.length + rawOp.length)));
    const isIdentity = key === 'id' || key === 'identity' || key === 'ci';
    if (!isIdentity && negate) {
      clause.colorsExcluded.push(...values); // -c:r => not red
      return;
    }
    const constraint: ColorConstraint = { op: colorOp(rawOp, isIdentity), values };
    if (isIdentity) clause.colorIdentity = constraint;
    else clause.colors = constraint;
    return;
  }

  const colon = token.indexOf(':');
  if (colon > 0) {
    const key = token.slice(0, colon).toLowerCase();
    const value = unquote(token.slice(colon + 1));
    switch (key) {
      case 't':
      case 'type':
        (negate ? clause.typeExcludes : clause.typeIncludes).push(value.toLowerCase());
        return;
      case 'o':
      case 'oracle':
        (negate ? clause.oracleExcludes : clause.oracleIncludes).push(value.toLowerCase());
        return;
      case 'kw':
      case 'keyword':
        (negate ? clause.keywordsExcluded : clause.keywords).push(value.toLowerCase());
        return;
      case 'f':
      case 'format':
      case 'legal':
        clause.legalIn = value.toLowerCase();
        return;
      case 'r':
      case 'rarity':
        clause.rarity.push(value.toLowerCase());
        return;
      default:
        (negate ? clause.nameExcludes : clause.nameIncludes).push(unquote(token).toLowerCase());
        return;
    }
  }

  (negate ? clause.nameExcludes : clause.nameIncludes).push(unquote(token).toLowerCase());
}

/**
 * Parse a subset of Scryfall query syntax into an OR of AND-clauses:
 *   c:/color: id:/identity: t:/type: o:/oracle: kw:/keyword: r:/rarity:
 *   cmc/mv/pow/tou (with >,<,>=,<=,=,:), f:/format:/legal:, bare words (name),
 *   "quoted phrases", `-` negation, and top-level `or`.
 */
export function parseQuery(query: string): CardQuery {
  const tokens = tokenize(query);
  const clauses: CardClause[] = [];
  let current = emptyClause();
  let hasContent = false;

  for (const token of tokens) {
    if (token.toLowerCase() === 'or') {
      clauses.push(current);
      current = emptyClause();
      hasContent = false;
      continue;
    }
    applyToken(current, token);
    hasContent = true;
  }
  clauses.push(current);
  // Drop trailing empty clause from a dangling "or", keep at least one.
  const nonEmpty = clauses.filter((c, i) => i === 0 || !isEmptyClause(c));
  void hasContent;
  return { or: nonEmpty.length ? nonEmpty : [emptyClause()] };
}

function isEmptyClause(c: CardClause): boolean {
  return (
    c.nameIncludes.length === 0 && c.nameExcludes.length === 0 &&
    c.typeIncludes.length === 0 && c.typeExcludes.length === 0 &&
    c.oracleIncludes.length === 0 && c.oracleExcludes.length === 0 &&
    c.keywords.length === 0 && c.keywordsExcluded.length === 0 &&
    c.colorsExcluded.length === 0 && !c.colors && !c.colorIdentity &&
    c.cmc.length === 0 && c.power.length === 0 && c.toughness.length === 0 &&
    c.rarity.length === 0 && !c.legalIn
  );
}

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

/** Evaluate a color/identity comparison of the card's set against the query set. */
function colorConstraintMatches(cardColors: string[], c: ColorConstraint): boolean {
  const S = new Set(cardColors);
  const Q = new Set<string>(c.values);
  const subset = [...S].every((x) => Q.has(x)); // S ⊆ Q
  const superset = [...Q].every((x) => S.has(x)); // S ⊇ Q
  switch (c.op) {
    case '<=': return subset;
    case '>=': return superset;
    case '=': return subset && superset;
    case '<': return subset && !superset;
    case '>': return superset && !subset;
  }
}

function clauseMatches(card: CardData, clause: CardClause): boolean {
  const name = card.name.toLowerCase();
  const type = card.typeLine.toLowerCase();
  const oracle = (card.oracleText ?? '').toLowerCase();
  const keywords = (card.keywords ?? []).map((k) => k.toLowerCase());

  if (!clause.nameIncludes.every((n) => name.includes(n))) return false;
  if (clause.nameExcludes.some((n) => name.includes(n))) return false;
  if (!clause.typeIncludes.every((t) => type.includes(t))) return false;
  if (clause.typeExcludes.some((t) => type.includes(t))) return false;
  if (!clause.oracleIncludes.every((o) => oracle.includes(o))) return false;
  if (clause.oracleExcludes.some((o) => oracle.includes(o))) return false;
  if (!clause.keywords.every((k) => keywords.includes(k))) return false;
  if (clause.keywordsExcluded.some((k) => keywords.includes(k))) return false;
  if (!clause.cmc.every((c) => numMatches(card.cmc, c))) return false;

  const pow = parseStat(card.power);
  if (clause.power.length && (pow === null || !clause.power.every((c) => numMatches(pow, c)))) return false;
  const tou = parseStat(card.toughness);
  if (clause.toughness.length && (tou === null || !clause.toughness.every((c) => numMatches(tou, c)))) return false;

  if (clause.colors && !colorConstraintMatches(card.colors, clause.colors)) return false;
  if (clause.colorsExcluded.length) {
    const set = new Set(card.colors);
    if (clause.colorsExcluded.some((c) => set.has(c))) return false;
  }
  if (clause.colorIdentity && !colorConstraintMatches(card.colorIdentity, clause.colorIdentity)) {
    return false;
  }
  if (clause.legalIn) {
    const l = card.legalities[clause.legalIn];
    if (l !== 'legal' && l !== 'restricted') return false;
  }
  // Rarity is a printing-level concept; the in-memory predicate can't check it.
  return true;
}

/** Evaluate a parsed query against a card in memory (OR of clauses). */
export function cardMatchesQuery(card: CardData, query: CardQuery): boolean {
  return query.or.some((clause) => clauseMatches(card, clause));
}
