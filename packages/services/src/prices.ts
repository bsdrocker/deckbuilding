import type { PrismaClient } from '@deck/db';

function parseUsd(prices: unknown): number | null {
  const p = (prices ?? null) as Record<string, string | null> | null;
  if (!p) return null;
  const raw = p.usd ?? p.usd_foil ?? p.usd_etched ?? null;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a map of oracleId -> cheapest known USD price by scanning printings.
 * Used for deck pricing and inventory-completion cost estimates.
 */
export async function representativePrices(
  prisma: PrismaClient,
  oracleIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (oracleIds.length === 0) return out;

  const printings = await prisma.cardPrinting.findMany({
    where: { oracleId: { in: oracleIds } },
    select: { oracleId: true, prices: true },
  });

  for (const pr of printings) {
    const usd = parseUsd(pr.prices);
    if (usd == null) continue;
    const cur = out.get(pr.oracleId);
    if (cur === undefined || usd < cur) out.set(pr.oracleId, usd);
  }
  return out;
}
