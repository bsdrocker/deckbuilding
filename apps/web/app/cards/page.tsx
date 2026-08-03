import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { CardSearchResult } from '@/lib/types';
import { CardHover } from '@/components/CardHover';
import { ColorDots } from '@/components/ColorDots';

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q ?? '';
  let result: CardSearchResult | null = null;

  if (query) {
    const res = await apiFetch(`/v1/cards?q=${encodeURIComponent(query)}&limit=60`);
    if (res.status === 401) redirect('/login');
    result = (await res.json()) as CardSearchResult;
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div>
        <h1>Card search</h1>
        <p className="muted">
          Scryfall-subset syntax: <code>c:</code>/<code>id:</code> colors, <code>t:</code> type,{' '}
          <code>o:</code> oracle text, <code>kw:</code> keyword, <code>r:</code> rarity,{' '}
          <code>cmc/pow/tou</code> with <code>&gt; &lt; &gt;= &lt;=</code>, <code>f:commander</code>,{' '}
          <code>-</code> to negate, and <code>or</code>. E.g.{' '}
          <code>t:creature id:r -t:legendary pow&gt;=4 or kw:flying</code>.
        </p>
      </div>

      <form method="get" className="row" style={{ gap: 8 }}>
        <input
          name="q"
          defaultValue={query}
          placeholder="e.g. t:creature id:r cmc<=3 f:commander goblin"
          style={{ flex: 1 }}
        />
        <button type="submit">Search</button>
      </form>

      {result && (
        <div className="panel">
          <h2>{result.total.toLocaleString()} results (showing {result.cards.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Cost</th>
                <th>MV</th>
                <th>Type</th>
                <th>Colors</th>
              </tr>
            </thead>
            <tbody>
              {result.cards.map((c) => (
                <tr key={c.oracleId}>
                  <td>
                    <CardHover name={c.name} imageUrl={c.imageUris?.normal} />
                  </td>
                  <td className="muted">{c.manaCost ?? ''}</td>
                  <td>{c.cmc}</td>
                  <td className="muted">{c.typeLine}</td>
                  <td>
                    <ColorDots colors={c.colorIdentity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
