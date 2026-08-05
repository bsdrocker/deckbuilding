'use client';

import { useState, useTransition } from 'react';
import { cloneDeckAction } from '../../actions';

/**
 * Copies the shared deck into the viewer's account (server action redirects to
 * the new deck, or to /login if they're not signed in).
 */
export function CloneDeckButton({ shareId }: { shareId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const clone = () => {
    setError(null);
    startTransition(async () => {
      const res = await cloneDeckAction(shareId);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <span className="row" style={{ gap: 8 }}>
      <button type="button" onClick={clone} disabled={pending} title="Copy this deck into your account">
        {pending ? 'Copying…' : '📋 Copy to my decks'}
      </button>
      {error && <span className="error">{error}</span>}
    </span>
  );
}
