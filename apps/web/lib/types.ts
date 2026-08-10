/** Response shapes mirrored from the REST API (kept minimal for the UI). */

export type DeckStatus = 'brewing' | 'built';

export interface DeckListItem {
  id: string;
  name: string;
  format: string;
  shareId: string;
  visibility: string;
  status: DeckStatus;
  colorIdentity: string[];
  updatedAt: string;
  cardCount: number;
  distinctCount: number;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
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
  finish: string | null;
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
  shareId: string;
  visibility: string;
  status: DeckStatus;
  primer: string;
  colorIdentity: string[];
  cards: DeckCard[];
}

/** A shared deck as returned by the public endpoints (no owner/inventory data). */
export interface PublicDeck {
  shareId: string;
  name: string;
  format: string;
  visibility: string;
  status: DeckStatus;
  primer: string;
  colorIdentity: string[];
  authorHandle: string;
  cards: DeckCard[];
}

export interface PublicDeckSummary {
  shareId: string;
  name: string;
  format: string;
  colorIdentity: string[];
  status: DeckStatus;
  cardCount: number;
  updatedAt: string;
  authorHandle: string;
}

export interface DeckCardAvailability {
  deckCardId: string;
  oracleId: string;
  needed: number;
  ownedOracle: number;
  missing: number;
  pinnedPrintingId: string | null;
  finish: string | null;
  printingStatus: 'owned' | 'not_owned' | null;
  ownedPrintingQty: number;
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
  bracket: {
    suggested: number;
    gameChangers: string[];
    massLandDenial: string[];
    extraTurns: string[];
    caveats: string[];
  } | null;
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

export interface AllocationSummary {
  totals: { ownedCopies: number; usedCopies: number; freeCopies: number; conflictCards: number };
  conflicts: {
    oracleId: string;
    name: string;
    owned: number;
    used: number;
    deficit: number;
    decks: { id: string; name: string; quantity: number }[];
  }[];
}

export interface InventoryItem {
  id: string;
  quantity: number;
  finish: string;
  condition: string;
  language: string;
  unitUsd: number;
  totalUsd: number;
  used: number;
  free: number;
  printing: {
    scryfallId: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    oracleId: string;
    imageUris: CardImageUris | null;
    oracle: { name: string; typeLine: string };
  };
}

export interface InventoryListResponse {
  total: number;
  items: InventoryItem[];
}
