import { parse } from 'csv-parse/sync';
import type { PrismaClient } from '@deck/db';
import { parseDecklist } from './decklist.js';

/**
 * Bulk-import a collection CSV into inventory. Optimized for ManaBox exports
 * (which include a `Scryfall ID` column → exact resolution) with graceful
 * fallbacks for Moxfield/Deckbox-style headers.
 */

type Canonical =
  | 'quantity'
  | 'scryfallId'
  | 'setCode'
  | 'collectorNumber'
  | 'name'
  | 'foil'
  | 'condition'
  | 'language';

const HEADER_ALIASES: Record<string, Canonical> = {
  quantity: 'quantity',
  count: 'quantity',
  qty: 'quantity',
  'scryfall id': 'scryfallId',
  scryfall_id: 'scryfallId',
  scryfallid: 'scryfallId',
  'set code': 'setCode',
  set_code: 'setCode',
  set: 'setCode',
  edition: 'setCode',
  'collector number': 'collectorNumber',
  collector_number: 'collectorNumber',
  'card number': 'collectorNumber',
  card_number: 'collectorNumber',
  number: 'collectorNumber',
  name: 'name',
  'card name': 'name',
  foil: 'foil',
  finish: 'foil',
  printing: 'foil',
  condition: 'condition',
  language: 'language',
  lang: 'language',
};

export function buildHeaderMap(headers: string[]): Partial<Record<Canonical, string>> {
  const map: Partial<Record<Canonical, string>> = {};
  for (const h of headers) {
    const canonical = HEADER_ALIASES[h.trim().toLowerCase()];
    if (canonical && !map[canonical]) map[canonical] = h;
  }
  return map;
}

/** Normalize a foil/finish value to our finish enum. */
export function normalizeFinish(raw: string | undefined): string {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'etched') return 'etched';
  if (v === 'foil' || v === 'yes' || v === 'true') return 'foil';
  return 'nonfoil';
}

/** Normalize a variety of condition spellings to NM/LP/MP/HP/DMG. */
export function normalizeCondition(raw: string | undefined): string {
  const v = (raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (['mint', 'near mint', 'nm', 'm'].includes(v)) return 'NM';
  if (['excellent', 'good', 'lightly played', 'light played', 'lp'].includes(v)) return 'LP';
  if (['moderately played', 'played', 'mp'].includes(v)) return 'MP';
  if (['heavily played', 'hp'].includes(v)) return 'HP';
  if (['poor', 'damaged', 'dmg', 'd'].includes(v)) return 'DMG';
  return 'NM';
}

export interface InventoryImportResult {
  rows: number;
  imported: number; // distinct (printing,finish,condition,language) upserts
  matchedCopies: number;
  unresolved: { row: number; reason: string; name?: string }[];
}

interface ParsedRow {
  index: number; // 1-based data row
  quantity: number;
  scryfallId?: string;
  setCode?: string;
  collectorNumber?: string;
  name?: string;
  finish: string;
  condition: string;
  language: string;
}

export async function importInventoryCsv(
  prisma: PrismaClient,
  userId: string,
  csvText: string,
): Promise<InventoryImportResult> {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];

  if (records.length === 0) return { rows: 0, imported: 0, matchedCopies: 0, unresolved: [] };

  const headerMap = buildHeaderMap(Object.keys(records[0]!));
  const get = (rec: Record<string, string>, key: Canonical) =>
    headerMap[key] ? rec[headerMap[key]!] : undefined;

  const rows: ParsedRow[] = records.map((rec, i) => {
    const qtyRaw = get(rec, 'quantity');
    const quantity = Math.max(1, Math.floor(Number(qtyRaw ?? 1)) || 1);
    return {
      index: i + 1,
      quantity,
      scryfallId: get(rec, 'scryfallId')?.trim() || undefined,
      setCode: get(rec, 'setCode')?.trim().toLowerCase() || undefined,
      collectorNumber: get(rec, 'collectorNumber')?.trim() || undefined,
      name: get(rec, 'name')?.trim() || undefined,
      finish: normalizeFinish(get(rec, 'foil')),
      condition: normalizeCondition(get(rec, 'condition')),
      language: (get(rec, 'language')?.trim().toLowerCase() || 'en').slice(0, 10),
    };
  });

  return resolveAndUpsertRows(prisma, userId, rows);
}

/**
 * Resolve parsed rows to printings (Scryfall id → set+collector → name), then
 * aggregate by inventory key and upsert. Shared by the CSV and list importers.
 */
async function resolveAndUpsertRows(
  prisma: PrismaClient,
  userId: string,
  rows: ParsedRow[],
): Promise<InventoryImportResult> {
  // --- Resolve each row to a printing id, in priority order ---
  const resolved = new Map<number, string>(); // row index -> printingId

  // 1. Scryfall id (exact).
  const ids = [...new Set(rows.map((r) => r.scryfallId).filter((v): v is string => Boolean(v)))];
  if (ids.length) {
    const found = await prisma.cardPrinting.findMany({
      where: { scryfallId: { in: ids } },
      select: { scryfallId: true },
    });
    const idSet = new Set(found.map((p) => p.scryfallId));
    for (const r of rows) if (r.scryfallId && idSet.has(r.scryfallId)) resolved.set(r.index, r.scryfallId);
  }

  // 2. (set code, collector number).
  const bySetCn = rows.filter((r) => !resolved.has(r.index) && r.setCode && r.collectorNumber);
  if (bySetCn.length) {
    const pairs = [...new Set(bySetCn.map((r) => `${r.setCode}|${r.collectorNumber}`))];
    const found = await prisma.cardPrinting.findMany({
      where: {
        OR: pairs.map((p) => {
          const [setCode, collectorNumber] = p.split('|');
          return { setCode, collectorNumber };
        }),
      },
      select: { scryfallId: true, setCode: true, collectorNumber: true },
    });
    const key = (s: string, c: string) => `${s}|${c}`;
    const map = new Map(found.map((p) => [key(p.setCode, p.collectorNumber), p.scryfallId]));
    for (const r of bySetCn) {
      const hit = map.get(key(r.setCode!, r.collectorNumber!));
      if (hit) resolved.set(r.index, hit);
    }
  }

  // 3. Name fallback -> that oracle's first printing.
  const byName = rows.filter((r) => !resolved.has(r.index) && r.name);
  if (byName.length) {
    const names = [...new Set(byName.map((r) => r.name!))];
    const oracles = await prisma.oracleCard.findMany({
      where: { OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) },
      select: { name: true, printings: { select: { scryfallId: true }, take: 1 } },
    });
    const map = new Map(
      oracles
        .filter((o) => o.printings[0])
        .map((o) => [o.name.toLowerCase(), o.printings[0]!.scryfallId]),
    );
    for (const r of byName) {
      const hit = map.get(r.name!.toLowerCase());
      if (hit) resolved.set(r.index, hit);
    }
  }

  // --- Aggregate resolved rows by unique inventory key, summing quantities ---
  const agg = new Map<string, { printingId: string; finish: string; condition: string; language: string; quantity: number }>();
  let matchedCopies = 0;
  const unresolved: InventoryImportResult['unresolved'] = [];

  for (const r of rows) {
    const printingId = resolved.get(r.index);
    if (!printingId) {
      unresolved.push({
        row: r.index,
        name: r.name,
        reason: r.scryfallId || r.setCode ? 'no matching printing in database' : 'no id/set/name to match on',
      });
      continue;
    }
    matchedCopies += r.quantity;
    const k = `${printingId}|${r.finish}|${r.condition}|${r.language}`;
    const cur = agg.get(k);
    if (cur) cur.quantity += r.quantity;
    else agg.set(k, { printingId, finish: r.finish, condition: r.condition, language: r.language, quantity: r.quantity });
  }

  // --- Upsert in batches ---
  const entries = [...agg.values()];
  const CHUNK = 100;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((e) =>
        prisma.inventoryItem.upsert({
          where: {
            userId_printingId_finish_condition_language: {
              userId,
              printingId: e.printingId,
              finish: e.finish,
              condition: e.condition,
              language: e.language,
            },
          },
          create: {
            userId,
            printingId: e.printingId,
            finish: e.finish,
            condition: e.condition,
            language: e.language,
            quantity: e.quantity,
          },
          update: { quantity: { increment: e.quantity } },
        }),
      ),
    );
  }

  return { rows: rows.length, imported: entries.length, matchedCopies, unresolved };
}

/**
 * Bulk-import inventory from a plain-text decklist-style list (one card per line,
 * e.g. "1 Sol Ring (C21) 263 *F*"). Resolves by set+collector, then name, and
 * captures `*F*`/`*E*` finish markers. Condition/language default to NM/en.
 */
export async function importInventoryList(
  prisma: PrismaClient,
  userId: string,
  text: string,
): Promise<InventoryImportResult> {
  const parsed = parseDecklist(text);
  if (parsed.length === 0) return { rows: 0, imported: 0, matchedCopies: 0, unresolved: [] };

  const rows: ParsedRow[] = parsed.map((p, i) => ({
    index: i + 1,
    quantity: p.quantity,
    setCode: p.setCode?.toLowerCase() || undefined,
    collectorNumber: p.collectorNumber || undefined,
    name: p.name,
    finish: p.finish ?? 'nonfoil',
    condition: 'NM',
    language: 'en',
  }));

  return resolveAndUpsertRows(prisma, userId, rows);
}
