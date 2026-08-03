import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import type { BulkDataEntry, BulkDataList, ScryfallCard } from './types.js';

const SCRYFALL_BULK_URL = 'https://api.scryfall.com/bulk-data';
const USER_AGENT = 'deckbuilding-app/0.1 (https://github.com/local/deckbuilding)';

export type BulkType = 'oracle_cards' | 'default_cards' | 'all_cards' | 'unique_artwork';

/** Fetch the Scryfall bulk-data manifest and return the entry for `type`. */
export async function getBulkEntry(type: BulkType): Promise<BulkDataEntry> {
  const res = await fetch(SCRYFALL_BULK_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Scryfall bulk-data manifest failed: ${res.status}`);
  const list = (await res.json()) as BulkDataList;
  const entry = list.data.find((e) => e.type === type);
  if (!entry) throw new Error(`No bulk-data entry of type "${type}"`);
  return entry;
}

/** URL of the gzipped JSONL download for an entry (Scryfall's current format). */
export function downloadUri(entry: BulkDataEntry): string {
  const uri = entry.jsonl_download_uri ?? entry.download_uri;
  if (!uri) throw new Error('Bulk-data entry has no download URI');
  return uri;
}

/**
 * Download the gzipped JSONL bulk file to `destPath`, reusing a cached copy when
 * it is newer than the entry's updated_at (avoids re-downloading tens of MB).
 */
export async function downloadBulk(entry: BulkDataEntry, destPath: string): Promise<string> {
  await mkdir(dirname(destPath), { recursive: true });

  const updatedAt = new Date(entry.updated_at).getTime();
  try {
    const existing = await stat(destPath);
    if (existing.mtimeMs >= updatedAt && existing.size > 0) {
      return destPath; // cache hit
    }
  } catch {
    // no cache; download below
  }

  const res = await fetch(downloadUri(entry), { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`Scryfall bulk download failed: ${res.status}`);
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destPath),
  );
  return destPath;
}

/**
 * Stream a gzipped JSONL bulk file as individual card objects, one line at a
 * time, without ever holding the whole file in memory.
 */
export async function* streamCardsFromFile(path: string): AsyncGenerator<ScryfallCard> {
  const gunzip = createReadStream(path).pipe(createGunzip());
  const rl = createInterface({ input: gunzip, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed) as ScryfallCard;
  }
}
