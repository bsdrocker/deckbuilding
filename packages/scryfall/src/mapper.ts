import type { ScryfallCard } from './types.js';

export interface MappedOracle {
  oracleId: string;
  name: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string | null;
  colors: string[];
  colorIdentity: string[];
  keywords: string[];
  producedMana: string[];
  legalities: Record<string, string>;
  layout: string;
  reservedList: boolean;
  edhrecRank: number | null;
  cardFaces: unknown | null;
}

export interface MappedPrinting {
  scryfallId: string;
  oracleId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  finishes: string[];
  imageUris: unknown | null;
  prices: unknown | null;
  lang: string;
  releasedAt: Date | null;
}

/** Join multi-face fields (split / MDFC / transform) into a single string. */
function joinFaces(card: ScryfallCard, field: 'mana_cost' | 'type_line' | 'oracle_text'): string | null {
  const top = card[field];
  if (top && top.length > 0) return top;
  if (card.card_faces && card.card_faces.length > 0) {
    const joined = card.card_faces
      .map((f) => f[field])
      .filter((v): v is string => Boolean(v && v.length))
      .join(' // ');
    return joined.length ? joined : null;
  }
  return top ?? null;
}

/**
 * Split a raw Scryfall card into normalized oracle + printing rows.
 * Returns null when the card can't be attributed to an oracle identity
 * (e.g. reversible cards or art-series objects that lack a top-level oracle_id).
 */
export function mapCard(card: ScryfallCard): { oracle: MappedOracle; printing: MappedPrinting } | null {
  if (!card.oracle_id || card.object !== 'card') return null;

  const oracle: MappedOracle = {
    oracleId: card.oracle_id,
    name: card.name,
    manaCost: joinFaces(card, 'mana_cost'),
    cmc: typeof card.cmc === 'number' ? card.cmc : 0,
    typeLine: joinFaces(card, 'type_line') ?? '',
    oracleText: joinFaces(card, 'oracle_text'),
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    keywords: card.keywords ?? [],
    producedMana: card.produced_mana ?? [],
    legalities: card.legalities ?? {},
    layout: card.layout ?? 'normal',
    reservedList: card.reserved ?? false,
    edhrecRank: card.edhrec_rank ?? null,
    cardFaces: card.card_faces ?? null,
  };

  const printing: MappedPrinting = {
    scryfallId: card.id,
    oracleId: card.oracle_id,
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    rarity: card.rarity,
    finishes: card.finishes ?? [],
    imageUris: card.image_uris ?? (card.card_faces?.[0]?.image_uris ?? null),
    prices: card.prices ?? null,
    lang: card.lang ?? 'en',
    releasedAt: card.released_at ? new Date(card.released_at) : null,
  };

  return { oracle, printing };
}
