import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { InventoryItem, InventorySummary, InventoryValueBreakdown } from '@/lib/types';
import { AddInventoryForm } from './AddInventoryForm';
import { ImportInventoryForm } from './ImportInventoryForm';
import { InventoryRow } from './InventoryRow';

export default async function InventoryPage() {
  const [listRes, summaryRes, valueRes] = await Promise.all([
    apiFetch('/v1/inventory?limit=200'),
    apiFetch('/v1/inventory/summary'),
    apiFetch('/v1/inventory/value'),
  ]);
  if (listRes.status === 401) redirect('/login');

  const { items } = (await listRes.json()) as { items: InventoryItem[] };
  const summary = (await summaryRes.json()) as InventorySummary;
  const value = (await valueRes.json()) as InventoryValueBreakdown;

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
        {value.topCards.length > 0 && (
          <>
            <h3>Top cards by value</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Set</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {value.topCards.map((c, i) => (
                  <tr key={`${c.name}-${c.setCode}-${c.finish}-${i}`}>
                    <td>{c.name}</td>
                    <td className="muted">
                      {c.setCode} #{c.collectorNumber} {c.finish !== 'nonfoil' ? `(${c.finish})` : ''}
                    </td>
                    <td>{c.quantity}</td>
                    <td className="muted">${c.unitUsd.toFixed(2)}</td>
                    <td>
                      <b>${c.totalUsd.toFixed(2)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Items ({items.length})</h2>
        {items.length === 0 ? (
          <p className="muted">Nothing yet. Add cards above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Qty</th>
                <th>Name</th>
                <th>Set</th>
                <th>Finish</th>
                <th>Cond.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <InventoryRow key={it.id} item={it} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
