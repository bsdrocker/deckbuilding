import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { DeckListItem } from '@/lib/types';
import { ColorDots } from '@/components/ColorDots';
import { DeckForms } from './DeckForms';
import { DeleteDeckButton } from './DeleteDeckButton';

export default async function DecksPage() {
  const res = await apiFetch('/v1/decks');
  if (res.status === 401) redirect('/login');
  const { decks } = (await res.json()) as { decks: DeckListItem[] };

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Your decks</h1>
        <p className="muted">Build decks, then use the API/MCP to optimize them against your inventory.</p>
      </div>

      <DeckForms />

      <div className="panel">
        <h2>Decks ({decks.length})</h2>
        {decks.length === 0 ? (
          <p className="muted">No decks yet. Create one above, or import a list.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Format</th>
                <th>Colors</th>
                <th>Cards</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decks.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/decks/${d.id}`}>{d.name}</Link>
                  </td>
                  <td>
                    <span className={`pill status-${d.status}`}>
                      {d.status === 'built' ? '🔨 built' : '🧪 brewing'}
                    </span>
                  </td>
                  <td className="muted">{d.format}</td>
                  <td>
                    <ColorDots colors={d.colorIdentity} />
                  </td>
                  <td>{d.cardCount}</td>
                  <td className="muted">{new Date(d.updatedAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <DeleteDeckButton deckId={d.id} deckName={d.name} className="remove-btn" label="×" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
