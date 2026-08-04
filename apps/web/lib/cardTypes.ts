/**
 * Card type categorization for grouping the deck view. Mirrors the logic in
 * @deck/core (the web app talks to the API over HTTP and keeps no workspace TS
 * dependency, so this small pure helper is intentionally duplicated).
 */

// Precedence for bucketing a multi-type card: Land wins (so a creature-land is
// grouped with lands), otherwise the first matching type.
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

/** Display order for the type sections within a board. */
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

export function cardTypeCategory(typeLine: string): string {
  for (const t of PRIMARY_TYPES) {
    if (new RegExp(`\\b${t}\\b`).test(typeLine)) return t;
  }
  return 'Other';
}
