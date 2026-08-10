import type { PrismaClient } from '@deck/db';

export function parseUsd(prices: unknown): number | null {
  const p = (prices ?? null) as Record<string, string | null> | null;
  if (!p) return null;
  const raw = p.usd ?? p.usd_foil ?? p.usd_etched ?? null;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface CheapestPrinting {
  printingId: string;
  priceUsd: number;
}

/**
 * Build a map of oracleId -> cheapest known USD printing (id + price) by
 * scanning printings. Used for deck pricing and default-printing selection.
 */
export async function cheapestPrintings(
  prisma: PrismaClient,
  oracleIds: string[],
): Promise<Map<string, CheapestPrinting>> {
  const out = new Map<string, CheapestPrinting>();
  if (oracleIds.length === 0) return out;

  const printings = await prisma.cardPrinting.findMany({
    where: { oracleId: { in: oracleIds } },
    select: { scryfallId: true, oracleId: true, prices: true },
  });

  for (const pr of printings) {
    const usd = parseUsd(pr.prices);
    if (usd == null) continue;
    const cur = out.get(pr.oracleId);
    if (cur === undefined || usd < cur.priceUsd) {
      out.set(pr.oracleId, { printingId: pr.scryfallId, priceUsd: usd });
    }
  }
  return out;
}

/**
 * Build a map of oracleId -> cheapest known USD price by scanning printings.
 * Used for deck pricing and inventory-completion cost estimates.
 */
export async function representativePrices(
  prisma: PrismaClient,
  oracleIds: string[],
): Promise<Map<string, number>> {
  const cheapest = await cheapestPrintings(prisma, oracleIds);
  return new Map([...cheapest].map(([oracleId, c]) => [oracleId, c.priceUsd]));
}
