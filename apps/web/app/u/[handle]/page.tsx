import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { PublicDeckSummary } from '@/lib/types';
import { PublicDeckGrid } from '@/components/PublicDeckGrid';

export default async function AuthorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const res = await apiFetch(`/v1/public/users/${encodeURIComponent(handle)}/decks`);
  if (res.status === 404) notFound();
  const data = (await res.json()) as { handle: string; decks: PublicDeckSummary[] };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div>
          <h1>{data.handle}</h1>
          <p className="muted">Public decks by {data.handle}.</p>
        </div>
        <Link href="/browse" className="btn secondary">
          ← Browse decks
        </Link>
      </div>

      <div className="panel">
        <h2>{data.decks.length} deck(s)</h2>
        <PublicDeckGrid decks={data.decks} showAuthor={false} />
      </div>
    </div>
  );
}
