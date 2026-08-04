import type { DeckCard } from '@/lib/types';
import { cardTypeCategory, DECK_TYPE_ORDER } from '@/lib/cardTypes';

export const BOARD_LABELS: Record<string, string> = {
  command: 'Command Zone',
  mainboard: 'Mainboard',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard',
};
export const BOARD_ORDER = ['command', 'mainboard', 'sideboard', 'maybeboard'];

export const TYPE_LABELS: Record<string, string> = {
  Creature: 'Creatures',
  Planeswalker: 'Planeswalkers',
  Enchantment: 'Enchantments',
  Sorcery: 'Sorceries',
  Instant: 'Instants',
  Artifact: 'Artifacts',
  Battle: 'Battles',
  Land: 'Lands',
  Other: 'Other',
};

export interface TypeSection {
  type: string;
  cards: DeckCard[];
  count: number;
}

/** Group a board's cards into type sections (DECK_TYPE_ORDER), cards A-Z within each. */
export function groupByType(cards: DeckCard[]): TypeSection[] {
  const byType: Record<string, DeckCard[]> = {};
  for (const c of cards) (byType[cardTypeCategory(c.oracle.typeLine)] ??= []).push(c);
  const sections: TypeSection[] = [];
  for (const type of DECK_TYPE_ORDER) {
    const group = byType[type];
    if (!group?.length) continue;
    group.sort((a, b) => a.oracle.name.localeCompare(b.oracle.name));
    sections.push({ type, cards: group, count: group.reduce((s, c) => s + c.quantity, 0) });
  }
  return sections;
}

export function groupByBoard(cards: DeckCard[]): Record<string, DeckCard[]> {
  const groups: Record<string, DeckCard[]> = {};
  for (const c of cards) (groups[c.board] ??= []).push(c);
  return groups;
}

/** Total cards in the counted zones (mainboard + command), summing quantities. */
export function countedTotal(cards: DeckCard[]): number {
  return cards
    .filter((c) => c.board === 'mainboard' || c.board === 'command')
    .reduce((s, c) => s + c.quantity, 0);
}
