import type { PrismaClient, Prisma } from '@deck/db';
import { mapCard, type MappedOracle, type MappedPrinting } from './mapper.js';
import type { ScryfallCard } from './types.js';

export interface ImportOptions {
  batchSize?: number;
  onProgress?: (stats: ImportStats) => void;
}

export interface ImportStats {
  processed: number;
  oracleUpserts: number;
  printingUpserts: number;
  skipped: number;
}

function oracleWriteData(o: MappedOracle) {
  return {
    name: o.name,
    manaCost: o.manaCost,
    cmc: o.cmc,
    typeLine: o.typeLine,
    oracleText: o.oracleText,
    colors: o.colors,
    colorIdentity: o.colorIdentity,
    keywords: o.keywords,
    producedMana: o.producedMana,
    legalities: o.legalities as Prisma.InputJsonValue,
    layout: o.layout,
    reservedList: o.reservedList,
    edhrecRank: o.edhrecRank,
    cardFaces: (o.cardFaces ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

function printingWriteData(p: MappedPrinting) {
  return {
    oracleId: p.oracleId,
    name: p.name,
    setCode: p.setCode,
    setName: p.setName,
    collectorNumber: p.collectorNumber,
    rarity: p.rarity,
    finishes: p.finishes,
    imageUris: (p.imageUris ?? undefined) as Prisma.InputJsonValue | undefined,
    prices: (p.prices ?? undefined) as Prisma.InputJsonValue | undefined,
    lang: p.lang,
    releasedAt: p.releasedAt,
  };
}

/**
 * Idempotently import Scryfall cards into oracle_cards + card_printings.
 * Safe to re-run for refreshes (upsert semantics). Oracle rows are deduped
 * within a run so we don't re-write shared identities for every printing.
 */
export async function importCards(
  prisma: PrismaClient,
  cards: AsyncIterable<ScryfallCard> | Iterable<ScryfallCard>,
  opts: ImportOptions = {},
): Promise<ImportStats> {
  const batchSize = opts.batchSize ?? 500;
  const stats: ImportStats = { processed: 0, oracleUpserts: 0, printingUpserts: 0, skipped: 0 };
  const seenOracle = new Set<string>();

  let oracleBatch: MappedOracle[] = [];
  let printingBatch: MappedPrinting[] = [];

  const flush = async () => {
    if (oracleBatch.length) {
      // Oracle first (printings FK to it). Sequential within a transaction.
      await prisma.$transaction(
        oracleBatch.map((o) =>
          prisma.oracleCard.upsert({
            where: { oracleId: o.oracleId },
            create: { oracleId: o.oracleId, ...oracleWriteData(o) },
            update: oracleWriteData(o),
          }),
        ),
      );
      stats.oracleUpserts += oracleBatch.length;
      oracleBatch = [];
    }
    if (printingBatch.length) {
      await prisma.$transaction(
        printingBatch.map((p) =>
          prisma.cardPrinting.upsert({
            where: { scryfallId: p.scryfallId },
            create: { scryfallId: p.scryfallId, ...printingWriteData(p) },
            update: printingWriteData(p),
          }),
        ),
      );
      stats.printingUpserts += printingBatch.length;
      printingBatch = [];
    }
    opts.onProgress?.(stats);
  };

  for await (const card of cards as AsyncIterable<ScryfallCard>) {
    const mapped = mapCard(card);
    stats.processed += 1;
    if (!mapped) {
      stats.skipped += 1;
      continue;
    }
    if (!seenOracle.has(mapped.oracle.oracleId)) {
      seenOracle.add(mapped.oracle.oracleId);
      oracleBatch.push(mapped.oracle);
    }
    printingBatch.push(mapped.printing);

    // Flush oracle first when either batch fills, so FK targets exist.
    if (oracleBatch.length >= batchSize || printingBatch.length >= batchSize) {
      await flush();
    }
  }
  await flush();
  return stats;
}
