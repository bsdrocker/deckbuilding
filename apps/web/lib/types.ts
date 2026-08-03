/** Response shapes mirrored from the REST API (kept minimal for the UI). */

export interface DeckListItem {
  id: string;
  name: string;
  format: string;
  visibility: string;
  colorIdentity: string[];
  updatedAt: string;
  _count: { cards: number };
}

export interface CardImageUris {
  small?: string;
  normal?: string;
  large?: string;
  art_crop?: string;
}

export interface DeckCard {
  id: string;
  oracleId: string;
  printingId: string | null;
  quantity: number;
  board: 'mainboard' | 'sideboard' | 'maybeboard' | 'command';
  categories: string[];
  oracle: {
    name: string;
    manaCost: string | null;
    cmc: number;
    typeLine: string;
    colorIdentity: string[];
    imageUris: CardImageUris | null;
  };
  printing: {
    scryfallId: string;
    setName: string;
    collectorNumber: string;
    imageUris: CardImageUris | null;
  } | null;
}

export interface Deck {
  id: string;
  name: string;
  format: string;
  description: string;
  visibility: string;
  colorIdentity: string[];
  cards: DeckCard[];
}

export interface ManaCurveBucket {
  cmc: number;
  count: number;
}

export interface DeckAnalysis {
  stats: {
    totalCards: number;
    landCount: number;
    nonlandCount: number;
    averageCmc: number;
    manaCurve: ManaCurveBucket[];
    colorPips: Record<string, number>;
    colorPercentages: Record<string, number>;
    typeDistribution: Record<string, number>;
    totalPriceUsd: number;
  };
  validation: {
    legal: boolean;
    issues: { code: string; message: string; cardName?: string }[];
    counted: number;
    commanderColorIdentity: string[] | null;
  };
}

export interface InventoryDiff {
  cards: { oracleId: string; name: string; needed: number; owned: number; missing: number; missingValueUsd: number }[];
  neededCards: number;
  ownedCards: number;
  neededCopies: number;
  ownedCopies: number;
  missingCopies: number;
  completionPct: number;
  missingValueUsd: number;
  ownedValueUsd: number;
}

export interface InventoryValueBreakdown {
  totalValueUsd: number;
  totalCopies: number;
  distinctCards: number;
  topCards: {
    name: string;
    setCode: string;
    collectorNumber: string;
    finish: string;
    quantity: number;
    unitUsd: number;
    totalUsd: number;
  }[];
}

export interface CardSearchResult {
  total: number;
  cards: {
    oracleId: string;
    name: string;
    manaCost: string | null;
    cmc: number;
    typeLine: string;
    colorIdentity: string[];
    oracleText: string | null;
    power: string | null;
    toughness: string | null;
    imageUris: CardImageUris | null;
  }[];
}

export interface InventorySummary {
  distinctCards: number;
  totalCopies: number;
  estimatedValueUsd: number;
}

export interface InventoryItem {
  id: string;
  quantity: number;
  finish: string;
  condition: string;
  language: string;
  printing: {
    scryfallId: string;
    setCode: string;
    collectorNumber: string;
    imageUris: CardImageUris | null;
    oracle: { name: string; typeLine: string };
  };
}
