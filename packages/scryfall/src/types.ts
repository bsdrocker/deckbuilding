/**
 * Subset of the Scryfall card object we care about.
 * Full reference: https://scryfall.com/docs/api/cards
 */
export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: Record<string, string>;
}

export interface ScryfallCard {
  object: string; // "card"
  id: string; // Scryfall print id (unique per printing)
  oracle_id?: string; // shared across printings; absent on reversible/art cards
  name: string;
  lang: string;
  released_at?: string;
  layout: string;

  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  produced_mana?: string[];
  legalities?: Record<string, string>;
  reserved?: boolean;
  edhrec_rank?: number;
  power?: string;
  toughness?: string;
  loyalty?: string;
  card_faces?: ScryfallCardFace[];

  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  finishes?: string[];
  image_uris?: Record<string, string>;
  prices?: Record<string, string | null>;
}

export interface BulkDataEntry {
  object: string; // "bulk_data"
  id: string;
  type: string; // "oracle_cards" | "default_cards" | "all_cards" | ...
  updated_at: string;
  uri: string;
  name?: string;
  description?: string;
  // Current Scryfall format: gzipped newline-delimited JSON.
  jsonl_download_uri?: string;
  compressed_size?: number;
  // Legacy fields (kept optional for backward compatibility).
  download_uri?: string;
  size?: number;
  content_type?: string;
}

export interface BulkDataList {
  object: string; // "list"
  data: BulkDataEntry[];
}
