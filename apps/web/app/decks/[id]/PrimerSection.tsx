'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { updateDeckAction } from '../../actions';

export function PrimerSection({ deckId, primer }: { deckId: string; primer: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(primer);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateDeckAction(deckId, { primer: draft });
      if (res.error) setError(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="panel">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Primer</h2>
        {!editing && (
          <button type="button" className="secondary" onClick={() => { setDraft(primer); setEditing(true); }}>
            {primer.trim() ? 'Edit' : 'Add primer'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="form-col" style={{ maxWidth: '100%', marginTop: 10 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'# Strategy\n\nMarkdown supported — headings, **bold**, lists, [links](https://scryfall.com), tables…'}
            style={{ minHeight: 220 }}
          />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="secondary" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      ) : primer.trim() ? (
        <div className="markdown" style={{ marginTop: 10 }}>
          <Markdown remarkPlugins={[remarkGfm]}>{primer}</Markdown>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 10 }}>
          No primer yet. Document the deck&apos;s strategy, lines, and swaps in Markdown.
        </p>
      )}
    </div>
  );
}
