import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type {
  AllocationSummary,
  InventoryListResponse,
  InventorySummary,
  InventoryValueBreakdown,
} from '@/lib/types';
import { Pagination } from '@/components/Pagination';
import { AddInventoryForm } from './AddInventoryForm';
import { ImportInventoryForm } from './ImportInventoryForm';
import { InventoryRow } from './InventoryRow';

const PAGE_SIZE = 50;
type Sort = 'name' | 'set' | 'value' | 'recent';
type Dir = 'asc' | 'desc';
type Filter = 'all' | 'used' | 'unused' | 'conflict';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'used', label: 'Used' },
  { value: 'unused', label: 'Unused' },
  { value: 'conflict', label: 'Conflicts' },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; dir?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const sort = (['name', 'set', 'value', 'recent'].includes(sp.sort ?? '') ? sp.sort : 'name') as Sort;
  const dir: Dir = sp.dir === 'desc' ? 'desc' : 'asc';
  const filter = (['all', 'used', 'unused', 'conflict'].includes(sp.filter ?? '') ? sp.filter : 'all') as Filter;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [listRes, summaryRes, valueRes, allocRes] = await Promise.all([
    apiFetch(`/v1/inventory?limit=${PAGE_SIZE}&offset=${offset}&sort=${sort}&dir=${dir}&filter=${filter}`),
    apiFetch('/v1/inventory/summary'),
    apiFetch('/v1/inventory/value'),
    apiFetch('/v1/inventory/allocation'),
  ]);
  if (listRes.status === 401) redirect('/login');

  const { items, total } = (await listRes.json()) as InventoryListResponse;
  const summary = (await summaryRes.json()) as InventorySummary;
  const value = (await valueRes.json()) as InventoryValueBreakdown;
  const alloc = (await allocRes.json()) as AllocationSummary;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  // Build a header link that toggles direction when already sorting by that column.
  const sortHref = (col: Sort) => {
    const nextDir: Dir = sort === col ? (dir === 'asc' ? 'desc' : 'asc') : col === 'value' ? 'desc' : 'asc';
    return `/inventory?sort=${col}&dir=${nextDir}&filter=${filter}&page=1`;
  };
  const arrow = (col: Sort) => (sort === col ? (dir === 'asc' ? ' ▲' : ' ▼') : '');
  const pageHref = (p: number) => `/inventory?sort=${sort}&dir=${dir}&filter=${filter}&page=${p}`;
  const filterHref = (f: Filter) => `/inventory?sort=${sort}&dir=${dir}&filter=${f}&page=1`;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div>
        <h1>Inventory</h1>
        <p className="muted">Your collection. Decks are matched against this to compute what you still need.</p>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h2>Summary</h2>
          <div className="stat">
            <span className="muted">Distinct cards</span>
            <b>{summary.distinctCards}</b>
          </div>
          <div className="stat">
            <span className="muted">Total copies</span>
            <b>{summary.totalCopies}</b>
          </div>
          <div className="stat">
            <span className="muted">Estimated value</span>
            <b>${summary.estimatedValueUsd.toFixed(2)}</b>
          </div>
        </div>
        <div className="panel">
          <h2>Add a card</h2>
          <AddInventoryForm />
        </div>
      </div>

      <div className="panel">
        <h2>Bulk import (CSV)</h2>
        <ImportInventoryForm />
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Collection value</h2>
            <Link href="/inventory/export" prefetch={false} className="btn secondary">
              ⬇ Export CSV
            </Link>
          </div>
          <div className="stat" style={{ marginTop: 10 }}>
            <span className="muted">Total value</span>
            <b>${value.totalValueUsd.toFixed(2)}</b>
          </div>
        </div>

        <div className="panel">
          <h2>Allocation (built decks)</h2>
          <div className="stat">
            <span className="muted">Copies used by built decks</span>
            <b>{alloc.totals.usedCopies}</b>
          </div>
          <div className="stat">
            <span className="muted">Free copies</span>
            <b>{alloc.totals.freeCopies}</b>
          </div>
          <div className="stat">
            <span className="muted">Conflicts</span>
            <b className={alloc.totals.conflictCards > 0 ? 'text-danger' : ''}>{alloc.totals.conflictCards}</b>
          </div>
        </div>
      </div>

      {alloc.conflicts.length > 0 && (
        <div className="panel">
          <h2>⚠ Collection conflicts</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Your built decks collectively need more copies than you own. Mark a deck brewing or acquire more.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Owned</th>
                <th>Used</th>
                <th>Short</th>
                <th>Built decks</th>
              </tr>
            </thead>
            <tbody>
              {alloc.conflicts.map((c) => (
                <tr key={c.oracleId}>
                  <td>{c.name}</td>
                  <td>{c.owned}</td>
                  <td>{c.used}</td>
                  <td>
                    <span className="pill bad">−{c.deficit}</span>
                  </td>
                  <td className="muted">
                    {c.decks.map((d) => `${d.name} (${d.quantity})`).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <h2 style={{ margin: 0 }}>Items</h2>
            <span className="seg">
              {FILTERS.map((f) => (
                <Link key={f.value} href={filterHref(f.value)} className={`seg-opt ${filter === f.value ? 'active' : ''}`}>
                  {f.label}
                </Link>
              ))}
            </span>
          </div>
          <span className="muted">
            {from}–{to} of {total}
          </span>
        </div>
        {total === 0 ? (
          <p className="muted" style={{ marginTop: 10 }}>
            {filter === 'all' ? 'Nothing yet. Add cards above.' : `No ${filter} cards.`}
          </p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Qty</th>
                  <th>
                    <Link href={sortHref('name')}>Name{arrow('name')}</Link>
                  </th>
                  <th>
                    <Link href={sortHref('set')}>Printing{arrow('set')}</Link>
                  </th>
                  <th>Finish</th>
                  <th>Cond.</th>
                  <th>
                    <Link href={sortHref('value')}>Value{arrow('value')}</Link>
                  </th>
                  <th>Used</th>
                  <th>Free</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <InventoryRow key={it.id} item={it} />
                ))}
              </tbody>
            </table>

            <div className="row between wrap" style={{ marginTop: 12, gap: 10 }}>
              <span className="muted">
                Page {page} of {totalPages}
              </span>
              <Pagination page={page} totalPages={totalPages} hrefFor={pageHref} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
