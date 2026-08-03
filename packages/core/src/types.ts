/** DB-agnostic card + deck shapes the domain logic operates on. */

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type Board = 'mainboard' | 'sideboard' | 'maybeboard' | 'command';

/** Normalized card data (a projection of OracleCard + optional price). */
export interface CardData {
  oracleId: string;
  name: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText?: string | null;
  colors: string[];
  colorIdentity: string[];
  keywords?: string[];
  legalities: Record<string, string>;
  /** Combat stats (raw strings, e.g. "*"); parsed numerically when possible. */
  power?: string | null;
  toughness?: string | null;
  /** Cheapest relevant USD price, if known. */
  priceUsd?: number | null;
}

export interface DeckCardData {
  oracleId: string;
  quantity: number;
  board: Board;
  card: CardData;
}

export interface DeckData {
  format: string;
  cards: DeckCardData[];
}
