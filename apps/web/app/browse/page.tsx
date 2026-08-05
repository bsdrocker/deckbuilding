import { apiFetch } from '@/lib/api';
import type { PublicDeckSummary } from '@/lib/types';
import { PublicDeckGrid } from '@/components/PublicDeckGrid';

const FORMATS = ['commander', 'standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'brawl', 'casual'];
const COLORS = ['W', 'U', 'B', 'R', 'G'];

type SP = { q?: string; format?: string; sort?: string; colors?: string | string[] };

export default async function BrowsePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const colors = sp.colors ? (Array.isArray(sp.colors) ? sp.colors : [sp.colors]) : [];

  const params = new URLSearchParams();
  if (sp.q) params.set('q', sp.q);
  if (sp.format) params.set('format', sp.format);
  if (sp.sort) params.set('sort', sp.sort);
  for (const c of colors) params.append('colors', c);

  const res = await apiFetch(`/v1/public/decks?${params.toString()}`);
  const { total, decks } = (await res.json()) as { total: number; decks: PublicDeckSummary[] };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div>
        <h1>Browse decks</h1>
        <p className="muted">Public decks shared by the community.</p>
      </div>

      <form method="get" className="panel row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <label className="field-label">
          Search
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Deck name" />
        </label>
        <label className="field-label">
          Format
          <select name="format" defaultValue={sp.format ?? ''}>
            <option value="">Any</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Sort
          <select name="sort" defaultValue={sp.sort ?? 'recent'}>
            <option value="recent">Recently updated</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </label>
        <span className="field-label">
          Colors
          <span className="row" style={{ gap: 8, height: 36, alignItems: 'center' }}>
            {COLORS.map((c) => (
              <label key={c} className="row" style={{ gap: 3, alignItems: 'center' }} title={c}>
                <input type="checkbox" name="colors" value={c} defaultChecked={colors.includes(c)} style={{ width: 'auto' }} />
                <span className={`dot ${c}`} />
              </label>
            ))}
          </span>
        </span>
        <button type="submit">Filter</button>
      </form>

      <div className="panel">
        <h2>{total.toLocaleString()} deck(s)</h2>
        <PublicDeckGrid decks={decks} />
      </div>
    </div>
  );
}
