import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { InventoryItem, InventorySummary } from '@/lib/types';
import { AddInventoryForm } from './AddInventoryForm';

export default async function InventoryPage() {
  const [listRes, summaryRes] = await Promise.all([
    apiFetch('/v1/inventory?limit=200'),
    apiFetch('/v1/inventory/summary'),
  ]);
  if (listRes.status === 401) redirect('/login');

  const { items } = (await listRes.json()) as { items: InventoryItem[] };
  const summary = (await summaryRes.json()) as InventorySummary;

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
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.quantity}×</td>
                  <td>{it.printing.oracle.name}</td>
                  <td className="muted">
                    {it.printing.setCode.toUpperCase()} #{it.printing.collectorNumber}
                  </td>
                  <td className="muted">{it.finish}</td>
                  <td className="muted">{it.printing.oracle.typeLine}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
