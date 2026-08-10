import type { DeckData } from './types.js';

/**
 * Official WotC Game Changers list (53 cards).
 * Source: Scryfall `is:gamechanger` (mirrors the official list; last official
 * revision "Commander Brackets Beta Update – February 9, 2026",
 * https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026).
 * Retrieved 2026-08-10.
 */
export const GAME_CHANGERS: readonly string[] = [
  'Ad Nauseam',
  'Ancient Tomb',
  'Aura Shards',
  'Biorhythm',
  "Bolas's Citadel",
  'Braids, Cabal Minion',
  'Chrome Mox',
  'Coalition Victory',
  'Consecrated Sphinx',
  'Crop Rotation',
  'Cyclonic Rift',
  'Demonic Tutor',
  'Drannith Magistrate',
  'Enlightened Tutor',
  'Farewell',
  'Field of the Dead',
  'Fierce Guardianship',
  'Force of Will',
  "Gaea's Cradle",
  'Gamble',
  'Gifts Ungiven',
  'Glacial Chasm',
  'Grand Arbiter Augustin IV',
  'Grim Monolith',
  'Humility',
  'Imperial Seal',
  'Intuition',
  "Jeska's Will",
  "Lion's Eye Diamond",
  'Mana Vault',
  "Mishra's Workshop",
  'Mox Diamond',
  'Mystical Tutor',
  'Narset, Parter of Veils',
  'Natural Order',
  'Necropotence',
  'Notion Thief',
  'Opposition Agent',
  'Orcish Bowmasters',
  'Panoptic Mirror',
  'Rhystic Study',
  'Seedborn Muse',
  "Serra's Sanctum",
  'Smothering Tithe',
  'Survival of the Fittest',
  "Teferi's Protection",
  "Tergrid, God of Fright // Tergrid's Lantern",
  "Thassa's Oracle",
  'The One Ring',
  'The Tabernacle at Pendrell Vale',
  'Underworld Breach',
  'Vampiric Tutor',
  'Worldly Tutor',
];

/**
 * Maintained heuristic list: mass land denial (destroys/exiles/locks most
 * lands symmetrically). Brackets 1–3 expect none.
 */
export const MASS_LAND_DENIAL: readonly string[] = [
  'Armageddon',
  'Ravages of War',
  'Catastrophe',
  'Decree of Annihilation',
  'Devastation',
  'Epicenter',
  'Fall of the Thran',
  'Impending Disaster',
  'Jokulhaups',
  'Obliterate',
  'Cataclysm',
  'Ruination',
  'Sunder',
  'Wildfire',
  'Burning of Xinye',
  'Winter Orb',
  'Static Orb',
];

/**
 * Maintained heuristic list: extra-turn spells. Brackets 1–3 expect extra
 * turns in low quantity and never chained; three or more in one deck is
 * treated as a chaining risk.
 */
export const EXTRA_TURN_CARDS: readonly string[] = [
  "Alrund's Epiphany",
  'Beacon of Tomorrows',
  'Capture of Jingzhou',
  'Expropriate',
  "Karn's Temporal Sundering",
  'Nexus of Fate',
  'Part the Waterveil',
  'Plea for Power',
  'Savor the Moment',
  'Temporal Manipulation',
  'Temporal Mastery',
  'Temporal Trespass',
  'Time Stretch',
  'Time Warp',
  'Walk the Aeons',
  'Wanderwine Prophets',
];

export interface BracketInfo {
  /** Suggested bracket: 2, 3, or 4. (1 vs 2 and 4 vs 5 depend on intent.) */
  suggested: number;
  gameChangers: string[];
  massLandDenial: string[];
  extraTurns: string[];
  caveats: string[];
}

/** Lowercased full names plus front faces, so MDFCs match either way. */
function nameSet(names: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const n of names) {
    const lower = n.toLowerCase();
    set.add(lower);
    const face = lower.split(' // ')[0]!;
    set.add(face);
  }
  return set;
}

const GC_SET = nameSet(GAME_CHANGERS);
const MLD_SET = nameSet(MASS_LAND_DENIAL);
const TURNS_SET = nameSet(EXTRA_TURN_CARDS);

function matches(set: Set<string>, cardName: string): boolean {
  const lower = cardName.toLowerCase();
  return set.has(lower) || set.has(lower.split(' // ')[0]!);
}

const CAVEATS = [
  'Tutor density and infinite combos are not detected — treat the suggested bracket as a lower bound.',
  'Extra-turn "chaining" is approximated by counting extra-turn cards (3+ suggests Bracket 4).',
  'Brackets 1 vs 2 and 4 vs 5 depend on player intent, not deck contents.',
];

/**
 * Classify a Commander deck under the WotC bracket system (2025/2026 beta):
 * Bracket 2 = no Game Changers; Bracket 3 = up to three, no mass land denial
 * or chained extra turns; Bracket 4 = beyond those limits. Returns null for
 * non-commander formats.
 */
export function computeBracket(deck: DeckData): BracketInfo | null {
  if (deck.format !== 'commander') return null;

  const gameChangers: string[] = [];
  const massLandDenial: string[] = [];
  const extraTurns: string[] = [];
  for (const dc of deck.cards) {
    if (dc.board !== 'mainboard' && dc.board !== 'command') continue;
    if (matches(GC_SET, dc.card.name)) gameChangers.push(dc.card.name);
    if (matches(MLD_SET, dc.card.name)) massLandDenial.push(dc.card.name);
    if (matches(TURNS_SET, dc.card.name)) extraTurns.push(dc.card.name);
  }

  const suggested =
    gameChangers.length > 3 || massLandDenial.length > 0 || extraTurns.length >= 3
      ? 4
      : gameChangers.length >= 1
        ? 3
        : 2;

  return { suggested, gameChangers, massLandDenial, extraTurns, caveats: [...CAVEATS] };
}
