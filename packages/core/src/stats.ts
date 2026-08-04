import type { Board, Color, DeckCardData, DeckData } from './types.js';

export interface ManaCurveBucket {
  cmc: number; // 0..6, with 7 meaning "7+"
  count: number;
}

export interface DeckStats {
  totalCards: number; // counted zone (mainboard + command)
  landCount: number;
  nonlandCount: number;
  averageCmc: number; // over nonland counted cards
  manaCurve: ManaCurveBucket[];
  colorPips: Record<Color, number>;
  colorPercentages: Record<Color, number>;
  typeDistribution: Record<string, number>;
  totalPriceUsd: number;
}

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

const PRIMARY_TYPES = [
  'Land',
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
] as const;

function isLand(typeLine: string): boolean {
  return /\bLand\b/.test(typeLine);
}

/**
 * First matching primary type from the type line (Land wins so it isn't
 * double-counted). Returns one of PRIMARY_TYPES or 'Other'.
 */
export function cardTypeCategory(typeLine: string): string {
  for (const t of PRIMARY_TYPES) {
    if (new RegExp(`\\b${t}\\b`).test(typeLine)) return t;
  }
  return 'Other';
}

/** Display order for grouping a deck's cards into type sections. */
export const DECK_TYPE_ORDER = [
  'Creature',
  'Planeswalker',
  'Enchantment',
  'Sorcery',
  'Instant',
  'Artifact',
  'Battle',
  'Land',
  'Other',
] as const;

/** Count colored pips in a mana cost string like "{2}{W}{W}{U}". Hybrid pips count each color. */
export function countPips(manaCost: string | null): Record<Color, number> {
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (!manaCost) return pips;
  for (const sym of manaCost.matchAll(/\{([^}]+)\}/g)) {
    const inner = sym[1]!;
    for (const c of COLORS) if (inner.includes(c)) pips[c] += 1;
  }
  return pips;
}

const COUNTED: Board[] = ['mainboard', 'command'];

/** Compute mana curve, color pips, type distribution, and price for a deck. */
export function computeDeckStats(deck: DeckData): DeckStats {
  const counted: DeckCardData[] = deck.cards.filter((c) => COUNTED.includes(c.board));

  const curve = new Map<number, number>();
  const colorPips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const typeDist: Record<string, number> = {};
  let landCount = 0;
  let nonlandCount = 0;
  let cmcSum = 0;
  let totalPrice = 0;
  let totalCards = 0;

  for (const dc of counted) {
    const q = dc.quantity;
    totalCards += q;
    totalPrice += (dc.card.priceUsd ?? 0) * q;

    const type = cardTypeCategory(dc.card.typeLine);
    typeDist[type] = (typeDist[type] ?? 0) + q;

    if (isLand(dc.card.typeLine)) {
      landCount += q;
      continue; // lands excluded from curve / average / pips
    }
    nonlandCount += q;
    cmcSum += dc.card.cmc * q;

    const bucket = Math.min(7, Math.floor(dc.card.cmc));
    curve.set(bucket, (curve.get(bucket) ?? 0) + q);

    const pips = countPips(dc.card.manaCost);
    for (const c of COLORS) colorPips[c] += pips[c] * q;
  }

  const manaCurve: ManaCurveBucket[] = [];
  for (let i = 0; i <= 7; i += 1) manaCurve.push({ cmc: i, count: curve.get(i) ?? 0 });

  const pipTotal = COLORS.reduce((s, c) => s + colorPips[c], 0);
  const colorPercentages: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of COLORS) {
    colorPercentages[c] = pipTotal === 0 ? 0 : Math.round((colorPips[c] / pipTotal) * 1000) / 10;
  }

  return {
    totalCards,
    landCount,
    nonlandCount,
    averageCmc: nonlandCount === 0 ? 0 : Math.round((cmcSum / nonlandCount) * 100) / 100,
    manaCurve,
    colorPips,
    colorPercentages,
    typeDistribution: typeDist,
    totalPriceUsd: Math.round(totalPrice * 100) / 100,
  };
}
