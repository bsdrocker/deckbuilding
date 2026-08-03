/**
 * CLI: download a Scryfall bulk file and import it into the database.
 *
 *   pnpm --filter @deck/scryfall import [--type default_cards] [--limit N]
 *
 * Types: oracle_cards | default_cards (default) | all_cards | unique_artwork
 * `--limit` imports only the first N cards (useful for a quick smoke test).
 */
import { resolve } from 'node:path';
import { prisma } from '@deck/db';
import { downloadBulk, getBulkEntry, streamCardsFromFile, type BulkType } from './download.js';
import { importCards } from './importer.js';
import type { ScryfallCard } from './types.js';

function parseArgs(argv: string[]): { type: BulkType; limit?: number } {
  let type: BulkType = 'default_cards';
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--type') type = argv[++i] as BulkType;
    else if (a === '--limit') limit = Number(argv[++i]);
  }
  return { type, limit };
}

async function* limited<T>(src: AsyncIterable<T>, n?: number): AsyncGenerator<T> {
  if (n === undefined) {
    yield* src;
    return;
  }
  let count = 0;
  for await (const item of src) {
    if (count >= n) return;
    count += 1;
    yield item;
  }
}

async function main() {
  const { type, limit } = parseArgs(process.argv.slice(2));
  const cacheDir = resolve(process.cwd(), 'data/scryfall');
  const dest = resolve(cacheDir, `${type}.jsonl.gz`);

  console.log(`[scryfall] fetching bulk manifest for "${type}"...`);
  const entry = await getBulkEntry(type);
  const sizeMb = (entry.compressed_size ?? entry.size ?? 0) / 1e6;
  console.log(`[scryfall] ${type}: ${sizeMb.toFixed(1)} MB compressed, updated ${entry.updated_at}`);

  console.log(`[scryfall] downloading to ${dest} (cached if fresh)...`);
  await downloadBulk(entry, dest);

  console.log(`[scryfall] importing${limit ? ` (limit ${limit})` : ''}...`);
  const start = Date.now();
  const cards = limited<ScryfallCard>(streamCardsFromFile(dest), limit);
  const stats = await importCards(prisma, cards, {
    onProgress: (s) => {
      if (s.processed % 5000 === 0) {
        process.stdout.write(`\r[scryfall] processed ${s.processed}...`);
      }
    },
  });

  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\n[scryfall] done in ${secs}s — processed=${stats.processed} oracle=${stats.oracleUpserts} printings=${stats.printingUpserts} skipped=${stats.skipped}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[scryfall] import failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
